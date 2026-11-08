"""Аукционы недвижимости Seguridad Social (TGSS).

Их нет на портале BOE: Tesorería General de la Seguridad Social публикует их в своём каталоге
«Subastas de bienes embargados» (w6.seg-social.es). Каталог работает на сессии:
1) стартовая страница → 2) выбор типов (finca rústica 0101, finca urbana 0102) →
3) ссылка «Todo el territorio español» → 4) страницы результатов по 20 строк →
5) карточка объекта по ссылке из строки (действует только в той же сессии).

Торги у TGSS не онлайн: ставки подаются в запечатанном конверте в Dirección Provincial,
дата в карточке — день вскрытия конвертов и устных ставок.
"""
from __future__ import annotations

import hashlib
import re
import unicodedata
from urllib.parse import urljoin

from bs4 import BeautifulSoup

import boe

BASE = "https://w6.seg-social.es/subastas/SubaSeControladorInter"
STEP_TYPES = BASE + "?opcion=10&EMB_TIPOBIEN=0101&EMB_TIPOBIEN=0102&ok=Continuar"
PUBLIC_URL = BASE  # ссылки на карточки живут только в сессии — отдаём вход в каталог
DETAIL_VERSION = 2  # чтобы backfill в scrape.py не ходил за ними на BOE

PROVINCES = [
    "A CORUÑA", "ALBACETE", "ALICANTE/ALACANT", "ALMERÍA", "ARABA/ÁLAVA", "ASTURIAS", "ÁVILA", "BADAJOZ",
    "BARCELONA", "BIZKAIA", "BURGOS", "CÁCERES", "CÁDIZ", "CANTABRIA", "CASTELLÓN/CASTELLÓ", "CEUTA",
    "CIUDAD REAL", "CÓRDOBA", "CUENCA", "GIPUZKOA", "GIRONA", "GRANADA", "GUADALAJARA", "HUELVA", "HUESCA",
    "ILLES BALEARS", "JAÉN", "LA RIOJA", "LAS PALMAS", "LEÓN", "LLEIDA", "LUGO", "MADRID", "MÁLAGA", "MELILLA",
    "MURCIA", "NAVARRA", "OURENSE", "PALENCIA", "PONTEVEDRA", "SALAMANCA", "SANTA CRUZ DE TENERIFE", "SEGOVIA",
    "SEVILLA", "SORIA", "TARRAGONA", "TERUEL", "TOLEDO", "VALENCIA/VALÈNCIA", "VALLADOLID", "ZAMORA", "ZARAGOZA",
]
ALIASES = {
    "LA CORUNA": "A CORUÑA", "CORUNA": "A CORUÑA", "CORUNA, A": "A CORUÑA", "CORUNA A": "A CORUÑA",
    "ALAVA": "ARABA/ÁLAVA", "VIZCAYA": "BIZKAIA", "GUIPUZCOA": "GIPUZKOA", "GERONA": "GIRONA",
    "LERIDA": "LLEIDA", "ORENSE": "OURENSE", "BALEARES": "ILLES BALEARS", "ISLAS BALEARES": "ILLES BALEARS",
    "BALEARS": "ILLES BALEARS", "PALMAS, LAS": "LAS PALMAS", "PALMAS LAS": "LAS PALMAS", "RIOJA, LA": "LA RIOJA",
    "RIOJA": "LA RIOJA", "S.C.TENERIFE": "SANTA CRUZ DE TENERIFE", "SANTA CRUZ TENERIFE": "SANTA CRUZ DE TENERIFE",
    "TENERIFE": "SANTA CRUZ DE TENERIFE", "PRINCIPADO DE ASTURIAS": "ASTURIAS",
}


def _plain(s: str) -> str:
    s = unicodedata.normalize("NFD", s or "").encode("ascii", "ignore").decode()
    return re.sub(r"\s+", " ", s).strip().upper()


_INDEX = {}
for _p in PROVINCES:
    _INDEX[_plain(_p)] = _p
    for _part in _p.split("/"):
        _INDEX[_plain(_part)] = _p
for _k, _v in ALIASES.items():
    _INDEX[_plain(_k)] = _v


def province(name: str) -> str:
    """Название провинции TGSS → как у BOE (чтобы фильтр по провинции не двоился)."""
    key = _plain(name)
    return _INDEX.get(key, (name or "").strip().upper())


RC_RE = re.compile(r"REFERENCIA\s+CATASTRAL[^0-9A-Z]{0,20}([0-9A-Z]{14}(?:[0-9]{4}[A-Z]{2})?)", re.I)
RC_ANY = re.compile(r"\b(?=[0-9A-Z]*\d)(?=[0-9A-Z]*[A-Z])([0-9A-Z]{14}[0-9]{4}[A-Z]{2})\b")


def ref_catastral(text: str) -> str:
    m = RC_RE.search(text or "") or RC_ANY.search((text or "").upper())
    return m.group(1).upper() if m else ""


def make_id(prov: str, razon: str, tasacion, lote: str, fecha: str | None) -> str:
    year = (fecha or "")[:4] or "0000"
    h = hashlib.sha1(f"{_plain(prov)}|{_plain(razon)}|{tasacion}|{lote}|{fecha}".encode()).hexdigest()[:10].upper()
    return f"SUB-SS-{year}-{h}"


def parse_results(html: str, page_url: str = BASE) -> tuple[list[dict], str | None, int | None]:
    """Страница результатов → строки, ссылка «Siguiente», общее число."""
    soup = BeautifulSoup(html, "html.parser")
    total = None
    tot = soup.select_one("p.totales")
    if tot:
        m = re.search(r"total de\s*(\d+)", boe.clean(tot.get_text(" ")))
        total = int(m.group(1)) if m else None
    rows = []
    for table in soup.find_all("table"):
        cap = table.find("caption")
        if not cap:
            continue
        parts = [p.strip() for p in boe.clean(cap.get_text(" ")).split(" - ")]
        tipo = parts[0] if parts else ""
        prov = parts[1] if len(parts) > 1 else ""
        pub = boe.parse_date(parts[2].strip("() ")) if len(parts) > 2 else None
        for tr in table.find_all("tr"):
            a = tr.find("a", href=True)
            tds = tr.find_all("td")
            if not a or len(tds) < 5:
                continue
            cells = [boe.clean(td.get_text(" ")) for td in tds]
            razon = boe.clean(a.get_text(" "))
            # колонки: Tipo | Tasación | Cargas | Lote | Tipo enajenación | Fecha subasta (первая — сама ссылка)
            tail = cells[-6:] if len(cells) >= 6 else cells
            tasacion = boe.parse_money(tail[-5]) if len(tail) >= 5 else None
            cargas = tail[-4] if len(tail) >= 4 else ""
            lote = re.sub(r"\D", "", tail[-3]) if len(tail) >= 3 else ""
            tipo_enaj = boe.parse_money(tail[-2])
            fecha = boe.parse_date(tail[-1])
            rows.append({
                "tipo_bien": tipo, "provincia": province(prov), "publicado": pub, "razon": razon,
                "tasacion": tasacion, "cargas": cargas, "lote": lote or "1", "valor_subasta": tipo_enaj,
                "fecha": fecha, "href": urljoin(page_url, a["href"]),
            })
    nxt = None
    for a in soup.find_all("a", href=True):
        if boe.clean(a.get_text(" ")).lower().startswith("siguiente") and "pagina" in a["href"]:
            nxt = urljoin(page_url, a["href"])
            break
    return rows, nxt, total


def parse_detail(html: str) -> dict:
    """Карточка объекта: пары «метка: значение» в dl/dt/dd (метка — в strong)."""
    soup = BeautifulSoup(html, "html.parser")
    out: dict[str, str] = {}
    title = soup.select_one("h3.datos") or soup.find("h3")
    out["_titulo"] = boe.clean(title.get_text(" ")) if title else ""
    for dd in soup.find_all("dd"):
        dt = dd.find_previous_sibling("dt")
        lab_el = dt or dd.find_previous("strong")
        label = boe.clean(lab_el.get_text(" ")).rstrip(":") if lab_el else ""
        val = boe.clean(dd.get_text(" "))
        if not label or not val:
            continue
        out[label] = (out[label] + " · " + val) if label in out else val
    return out


def _get(d: dict, *names: str) -> str:
    for n in names:
        for k, v in d.items():
            if _plain(k).startswith(_plain(n)):
                return v
    return ""


def category(tipo_bien: str, desc: str) -> str:
    """Категория объекта TGSS: в каталоге только недвижимость (finca urbana / rústica)."""
    text = (desc or "").lower()
    if "urbana" in (tipo_bien or "").lower():
        cat = boe.categorize(desc)
        return cat if cat in ("vivienda", "garaje", "trastero", "local", "nave", "solar") else "inmueble"
    built = re.search(boe.HOUSING, text) and re.search(boe.BUILT, text)
    return "vivienda" if built else "rustica"


def build_record(row: dict, det: dict, now_iso: str) -> dict:
    desc = _get(det, "Descripcion Detallada", "Descripcion") or row["razon"]
    loc = _get(det, "Localizacion")
    # «( VEDRA - A CORUÑA)» в заголовке карточки
    localidad = ""
    m = re.search(r"\(\s*([^()]+?)\s*-\s*([^()]+?)\s*\)\s*$", det.get("_titulo", ""))
    if m:
        localidad = m.group(1).strip().upper()
    if not localidad:
        m = re.search(r"\(([^)]+)\)\s*$", row["razon"])
        localidad = m.group(1).strip().upper() if m else ""
    prov = row["provincia"]
    sid = make_id(prov, row["razon"], row["tasacion"], row["lote"], row["fecha"])
    rc = ref_catastral(desc)
    urbana = "urbana" in row["tipo_bien"].lower()
    asset = {
        "titulo": row["razon"],
        "tipo_bien": row["tipo_bien"],
        "descripcion": desc,
        "direccion": re.sub(r"\s*\([^)]*\)\s*$", "", row["razon"]).strip(),
        "localidad": localidad,
        "provincia": prov,
        "ref_catastral": rc,
        "cargas": _get(det, "Cargas") or row["cargas"],
        "superficie": _get(det, "Superficie"),
        "ubicacion": loc,
    }
    asset = {k: v for k, v in asset.items() if v or k == "descripcion"}
    cat = category(row["tipo_bien"], desc)
    lugar = _get(det, "Lugar")
    dp = province(prov).split("/")[0].title()
    return {
        "id": sid,
        "url": PUBLIC_URL,
        "origen": "seguridad_social",
        "tipo": "Seguridad Social (TGSS) — subasta presencial",
        "categoria": cat,
        "titulo": desc[:300],
        "provincia": prov,
        "localidad": localidad,
        "cp": "",
        "direccion": asset.get("direccion", ""),
        "valor_subasta": row["valor_subasta"],
        "tasacion": row["tasacion"] or None,
        "puja_minima": None,
        "deposito": None,
        "cantidad_reclamada": None,
        "fecha_inicio": row["publicado"],
        "fecha_fin": row["fecha"],
        "estado": boe.status_code("", row["fecha"]),
        "autoridad": f"TGSS — Dirección Provincial de {dp}",
        "anuncio_boe": "",
        "lotes": row["lote"],
        "expediente": _get(det, "Expediente"),
        "lugar_subasta": lugar,
        "bienes": [asset],
        "fuente": "tgss",
        "v": DETAIL_VERSION,
    }


def region_links(html: str) -> list[tuple[str, int, str]]:
    """Ссылки шага «Ámbito geográfico»: (название, количество, адрес) — по провинциям.
    Сообщество берём, только если у него нет отдельных провинций (Asturias, Madrid…)."""
    from urllib.parse import parse_qs, urlparse
    soup = BeautifulSoup(html, "html.parser")
    provs, comms = [], []
    for a in soup.find_all("a", href=True):
        txt = boe.clean(a.get_text(" "))
        m = re.search(r"^(.*?)\s*\((\d+)\)\s*$", txt)
        if not m or "todo el territorio" in txt.lower():
            continue
        url = urljoin(BASE, a["href"])
        q = parse_qs(urlparse(url).query)
        item = (m.group(1), int(m.group(2)), url, (q.get("autonoma") or [""])[0])
        (provs if (q.get("provincia") or [""])[0] else comms).append(item)
    covered = {p[3] for p in provs}
    out = [(n, c, u) for n, c, u, _ in provs] + [(n, c, u) for n, c, u, au in comms if not au or au not in covered]
    return out


def collect(fetcher, known: set[str], max_details: int = 400, log=print) -> tuple[list[dict], set[str], bool]:
    """Проходит каталог TGSS и возвращает записи для объектов, которых ещё нет в базе.
    Каталог отдаёт не больше 200 строк на поиск, поэтому идём по провинциям — их ссылки
    не зависят от сессии. Сайт режет частые запросы, поэтому одна сессия и пауза 4 с;
    при отказе соединения останавливаемся и сохраняем то, что успели.
    Карточку качаем только для новых строк — ID считается по строке списка."""
    from datetime import datetime, timezone
    now_iso = datetime.now(timezone.utc).isoformat()
    fetcher.get(BASE)  # открыть сессию
    step2 = fetcher.get(STEP_TYPES)
    soup = BeautifulSoup(step2, "html.parser")
    total = None
    todo = next((a for a in soup.find_all("a", href=True) if "todo el territorio" in a.get_text(" ").lower()), None)
    if todo:
        m = re.search(r"\((\d+)\)", todo.get_text(" "))
        total = int(m.group(1)) if m else None
    regions = region_links(step2)
    if not regions:
        log("TGSS: не нашли ссылки провинций — разметка изменилась?")
        return [], set(), False
    log(f"TGSS: всего объектов недвижимости {total}, регионов {len(regions)} (сумма {sum(c for _, c, _ in regions)})")
    out, seen, pages, rows_total, stopped = [], set(), 0, 0, False
    for name, cnt, link in regions:
        url, got = link, 0
        try:
            html = fetcher.get(url)
            for page in range(12):
                pages += 1
                rows, nxt, _tot = parse_results(html, url)
                if not rows and cnt and "perdido la sesi" in html.lower() or (not rows and cnt and page == 0):
                    # сайт потерял сессию (бывает после отказа соединения) — открыть заново и повторить
                    fetcher.get(BASE)
                    fetcher.get(STEP_TYPES)
                    html = fetcher.get(url)
                    rows, nxt, _tot = parse_results(html, url)
                rows_total += len(rows)
                got += len(rows)
                for r in rows:
                    sid = make_id(r["provincia"], r["razon"], r["tasacion"], r["lote"], r["fecha"])
                    if sid in seen:
                        continue
                    seen.add(sid)
                    if sid in known or len(out) >= max_details:
                        continue
                    dh = fetcher.get(r["href"])
                    if "perdido la sesi" in dh.lower():
                        seen.discard(sid)  # карточку возьмём в следующий запуск
                        continue
                    rec = build_record(r, parse_detail(dh), now_iso)
                    rec["detectada"] = now_iso
                    out.append(rec)
                if not nxt or not rows:
                    break
                url = nxt
                html = fetcher.get(url)
        except RuntimeError as e:
            log(f"TGSS: сайт перестал отвечать на регионе {name}: {e} — продолжим в следующий запуск")
            stopped = True
            break
        if got < min(cnt, 200):
            log(f"TGSS: {name}: получено {got} из {cnt}")
    complete = not stopped and bool(total) and len(seen) >= total
    log(f"TGSS: страниц {pages}, строк {rows_total}, уникальных {len(seen)}, новых {len(out)}, полный обход {complete}")
    return out, seen, complete
