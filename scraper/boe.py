"""
Парсер Портала аукционов BOE (https://subastas.boe.es).

Только публичные страницы: список поиска и карточки аукционов.
Модуль не делает сетевых запросов сам — HTML передаётся снаружи,
поэтому его легко тестировать на сохранённых страницах.
"""
from __future__ import annotations

import re
from datetime import datetime
from html import unescape
from urllib.parse import urljoin, urlparse, parse_qs

from bs4 import BeautifulSoup

BASE = "https://subastas.boe.es/"

# Префикс идентификатора SUB-XX-AAAA-NNNN → происхождение аукциона
ORIGIN_BY_PREFIX = {
    "JA": "judicial",      # Judicial en vía de apremio
    "JV": "judicial",      # Judicial voluntaria
    "JC": "judicial",      # Concursal
    "NE": "notarial",      # Notarial (ejecución hipotecaria)
    "NV": "notarial",      # Notarial voluntaria
    "NC": "notarial",
    "RC": "notarial",      # Registradores
    "AT": "hacienda",      # Agencia Tributaria
    "AE": "hacienda",
    "SS": "seguridad_social",
    "AP": "administracion",  # Otras administraciones públicas
    "AC": "administracion",
    "AL": "administracion",
}

# Ключевые слова → категория имущества (проверяются по порядку)
CATEGORY_RULES = [
    ("garaje", r"garaje|aparcamiento|plaza de parking|plaza aparc"),
    ("trastero", r"trastero"),
    ("local", r"local comercial|\blocal\b|oficina"),
    ("nave", r"nave|industrial|almac[eé]n"),
    ("solar", r"solar|parcela|terreno urbano|suelo"),
    ("rustica", r"r[uú]stic|finca|olivar|vi[nñ]edo|cultivo|labor|monte|regad[ií]o|secano"),
    ("vivienda", r"vivienda|piso|casa|chalet|apartamento|d[uú]plex|[aá]tico|unifamiliar|adosad"),
    ("vehiculo", r"veh[ií]culo|turismo|furgoneta|cami[oó]n|motocicleta|coche|matr[ií]cula|remolque"),
    ("embarcacion", r"embarcaci[oó]n|barco|velero|yate"),
    ("joyas_arte", r"joya|oro|reloj|cuadro|obra de arte|pintura"),
    ("maquinaria", r"maquinaria|m[aá]quina|herramient|equipo|mobiliario"),
    ("derechos", r"derecho|participaci[oó]n|acciones|marca|patente|cr[eé]dito"),
]

MONEY_RE = re.compile(r"(-?\d{1,3}(?:\.\d{3})*(?:,\d+)?|-?\d+(?:,\d+)?)\s*€")
ISO_RE = re.compile(r"ISO:\s*([0-9T:\-+]+)")
DMY_RE = re.compile(r"(\d{2})[-/](\d{2})[-/](\d{4})(?:\s+(?:a las\s+)?(\d{2}):(\d{2})(?::(\d{2}))?)?")
ID_RE = re.compile(r"SUB-[A-Z]{2}-\d{4}-[0-9A-Z]+")


def clean(text: str | None) -> str:
    if not text:
        return ""
    return re.sub(r"\s+", " ", unescape(text)).strip()


def parse_money(text: str | None) -> float | None:
    if not text:
        return None
    m = MONEY_RE.search(text)
    if not m:
        return None
    raw = m.group(1).replace(".", "").replace(",", ".")
    try:
        return round(float(raw), 2)
    except ValueError:
        return None


def parse_date(text: str | None) -> str | None:
    """Возвращает ISO 8601. BOE обычно пишет '(ISO: 2025-12-01T18:00:00+01:00)'."""
    if not text:
        return None
    m = ISO_RE.search(text)
    if m:
        return m.group(1)
    m = DMY_RE.search(text)
    if m:
        d, mo, y, hh, mm, ss = m.groups()
        try:
            dt = datetime(int(y), int(mo), int(d), int(hh or 0), int(mm or 0), int(ss or 0))
            return dt.isoformat()
        except ValueError:
            return None
    return None


def origin_from_id(sub_id: str, tipo: str = "") -> str:
    m = re.match(r"SUB-([A-Z]{2})-", sub_id or "")
    if m and m.group(1) in ORIGIN_BY_PREFIX:
        return ORIGIN_BY_PREFIX[m.group(1)]
    t = (tipo or "").lower()
    if "judicial" in t:
        return "judicial"
    if "notarial" in t:
        return "notarial"
    if "tributaria" in t or "hacienda" in t:
        return "hacienda"
    if "seguridad social" in t:
        return "seguridad_social"
    return "administracion"


def categorize(*texts: str) -> str:
    blob = " ".join(t for t in texts if t).lower()
    for cat, pattern in CATEGORY_RULES:
        if re.search(pattern, blob):
            return cat
    return "otros"


def detail_url(sub_id: str, ver: int = 1, lote: str | None = None) -> str:
    url = f"{BASE}detalleSubasta.php?idSub={sub_id}&ver={ver}"
    if lote:
        url += f"&idLote={lote}"
    return url


# ---------------------------------------------------------------- список

def parse_search_page(html: str, page_url: str = BASE) -> tuple[list[dict], list[str]]:
    """Разбирает страницу результатов поиска.

    Возвращает (результаты, ссылки_на_следующие_страницы).
    Каждый результат: {id, title, authority, status_text, summary}.
    """
    soup = BeautifulSoup(html, "html.parser")
    results: dict[str, dict] = {}

    blocks = soup.select("li.resultado-busqueda") or soup.select("div.listadoResult li")
    for li in blocks:
        text = clean(li.get_text(" "))
        link = li.find("a", href=re.compile(r"detalleSubasta\.php"))
        sub_id = None
        if link:
            q = parse_qs(urlparse(unescape(link["href"])).query)
            sub_id = (q.get("idSub") or [None])[0]
        if not sub_id:
            m = ID_RE.search(text)
            sub_id = m.group(0) if m else None
        if not sub_id or sub_id in results:
            continue
        h4 = li.find("h4")
        paras = [clean(p.get_text(" ")) for p in li.find_all("p")]
        status = next((p for p in paras if p.lower().startswith("estado")), "")
        summary = next(
            (p for p in paras if not re.match(r"(?i)(estado|expediente)", p)), ""
        )
        results[sub_id] = {
            "id": sub_id,
            "authority": clean(h4.get_text(" ")) if h4 else "",
            "status_text": status,
            "summary": summary,
        }

    # Запасной вариант: если разметка поменялась, собираем все ссылки на карточки
    if not results:
        for a in soup.find_all("a", href=re.compile(r"detalleSubasta\.php")):
            q = parse_qs(urlparse(unescape(a["href"])).query)
            sid = (q.get("idSub") or [None])[0]
            if sid and sid not in results:
                results[sid] = {"id": sid, "authority": "", "status_text": "", "summary": ""}

    next_links = []
    for a in soup.find_all("a", href=True):
        href_raw = unescape(a["href"])
        label = clean(a.get_text(" ")).lower()
        cls = " ".join(a.get("class", []) + sum((c.get("class", []) for c in a.find_all(True)), []))
        if ("accion=Mas" in href_raw or "id_busqueda" in href_raw
                or "siguiente" in label or "pagSig" in cls):
            if "detalleSubasta" in href_raw:
                continue
            href = urljoin(page_url, href_raw)
            if href not in next_links:
                next_links.append(href)

    return list(results.values()), next_links


# --------------------------------------------------------------- карточка

def _table_pairs(table) -> dict[str, str]:
    data = {}
    for tr in table.find_all("tr"):
        th = tr.find("th")
        td = tr.find("td")
        if th and td:
            key = clean(th.get_text(" ")).rstrip(":")
            if key and key not in data:
                data[key] = clean(td.get_text(" "))
    return data


def parse_general(html: str) -> dict:
    """Вкладка ver=1 «Información general»."""
    soup = BeautifulSoup(html, "html.parser")
    pairs: dict[str, str] = {}
    for table in soup.find_all("table"):
        for k, v in _table_pairs(table).items():
            pairs.setdefault(k, v)

    def get(*names):
        for n in names:
            for k, v in pairs.items():
                if k.lower().startswith(n.lower()):
                    return v
        return ""

    sub_id = get("Identificador")
    m = ID_RE.search(sub_id)
    sub_id = m.group(0) if m else sub_id
    tipo = get("Tipo de subasta")

    status = ""
    for el in soup.select(".caja, .estadoSubasta, #idEstado, p, span, strong"):
        t = clean(el.get_text(" "))
        if t.lower().startswith("estado:") or t.lower().startswith("subasta "):
            if re.search(r"(?i)celebr|conclu|suspend|cancel|pr[oó]xima|finaliz", t):
                status = t
                break

    return {
        "id": sub_id,
        "tipo": tipo,
        "expediente": get("Cuenta expediente", "Expediente"),
        "anuncio_boe": get("Anuncio BOE"),
        "fecha_inicio": parse_date(get("Fecha de inicio")),
        "fecha_fin": parse_date(get("Fecha de conclusión", "Fecha de conclusion")),
        "cantidad_reclamada": parse_money(get("Cantidad reclamada")),
        "valor_subasta": parse_money(get("Valor subasta")),
        "tasacion": parse_money(get("Tasación", "Tasacion", "Valor de tasación")),
        "puja_minima": parse_money(get("Puja mínima", "Puja minima")),
        "tramos": parse_money(get("Tramos entre pujas")),
        "deposito": parse_money(get("Importe del depósito", "Importe del deposito")),
        "lotes": get("Lotes"),
        "status_text": status,
    }


def parse_authority(html: str) -> dict:
    """Вкладка ver=2 «Autoridad gestora»."""
    soup = BeautifulSoup(html, "html.parser")
    pairs: dict[str, str] = {}
    for table in soup.find_all("table"):
        pairs.update({k: v for k, v in _table_pairs(table).items() if k not in pairs})
    return {
        "nombre": pairs.get("Descripción") or pairs.get("Descripcion", ""),
        "direccion": pairs.get("Dirección") or pairs.get("Direccion", ""),
        "telefono": pairs.get("Teléfono") or pairs.get("Telefono", ""),
        "email": pairs.get("Correo electrónico") or pairs.get("Email", ""),
    }


def parse_assets(html: str) -> list[dict]:
    """Вкладка ver=3 «Bienes». Каждая таблица с описанием = один объект."""
    soup = BeautifulSoup(html, "html.parser")
    assets = []
    for table in soup.find_all("table"):
        p = _table_pairs(table)
        desc = p.get("Descripción") or p.get("Descripcion")
        if not desc:
            continue
        heading = table.find_previous(["h4", "h3"])
        heading_text = clean(heading.get_text(" ")) if heading else ""
        kind = ""
        m = re.search(r"\(([^)]+)\)", heading_text)
        if m:
            kind = m.group(1)
        assets.append({
            "titulo": heading_text,
            "tipo_bien": kind,
            "descripcion": desc,
            "direccion": p.get("Dirección") or p.get("Direccion", ""),
            "cp": p.get("Código Postal") or p.get("Codigo Postal", ""),
            "localidad": p.get("Localidad", ""),
            "provincia": p.get("Provincia", ""),
            "ref_catastral": p.get("Referencia catastral", ""),
            "situacion_posesoria": p.get("Situación posesoria") or p.get("Situacion posesoria", ""),
            "visitable": p.get("Visitable", ""),
            "cargas": p.get("Cargas", ""),
            "matricula": p.get("Matrícula") or p.get("Matricula", ""),
        })
    return assets


def status_code(text: str, fecha_fin: str | None, now: datetime | None = None) -> str:
    """Нормализует статус: proxima | activa | finalizada | suspendida | cancelada."""
    t = (text or "").lower()
    if "cancel" in t:
        return "cancelada"
    if "suspend" in t:
        return "suspendida"
    if "conclu" in t and "prevista" not in t or "finaliz" in t:
        return "finalizada"
    if "próxima" in t or "proxima" in t:
        return "proxima"
    if fecha_fin:
        now = now or datetime.now().astimezone()
        try:
            end = datetime.fromisoformat(fecha_fin)
            if end.tzinfo is None:
                end = end.astimezone()
            if end < now:
                return "finalizada"
        except ValueError:
            pass
    return "activa"


def build_record(listing: dict, general: dict, authority: dict, assets: list[dict]) -> dict:
    sub_id = general.get("id") or listing["id"]
    first = assets[0] if assets else {}
    texts = [a.get("tipo_bien", "") + " " + a.get("titulo", "") + " " + a.get("descripcion", "") for a in assets]
    category = categorize(*(texts or [listing.get("summary", "")]))
    title = first.get("descripcion") or listing.get("summary") or sub_id
    status_src = general.get("status_text") or listing.get("status_text", "")
    return {
        "id": sub_id,
        "url": detail_url(sub_id),
        "origen": origin_from_id(sub_id, general.get("tipo", "")),
        "tipo": general.get("tipo", ""),
        "categoria": category,
        "titulo": title[:300],
        "provincia": (first.get("provincia") or "").upper(),
        "localidad": (first.get("localidad") or "").upper(),
        "cp": first.get("cp", ""),
        "direccion": first.get("direccion", ""),
        "valor_subasta": general.get("valor_subasta"),
        "tasacion": general.get("tasacion"),
        "puja_minima": general.get("puja_minima"),
        "deposito": general.get("deposito"),
        "cantidad_reclamada": general.get("cantidad_reclamada"),
        "fecha_inicio": general.get("fecha_inicio"),
        "fecha_fin": general.get("fecha_fin"),
        "estado": status_code(status_src, general.get("fecha_fin")),
        "autoridad": authority.get("nombre") or listing.get("authority", ""),
        "anuncio_boe": general.get("anuncio_boe", ""),
        "lotes": general.get("lotes", ""),
        "bienes": assets,
    }


# ------------------------------------------------------- форма поиска

def page_error(html: str) -> str:
    """Возвращает текст ошибки портала, если он есть на странице."""
    m = re.search(r"ERROR:[^<]{0,200}", unescape(html))
    return clean(m.group(0)) if m else ""


def parse_search_form(html: str, page_url: str, state: str) -> dict | None:
    """Находит форму поиска и заполняет её как браузер: все поля со значениями
    по умолчанию, статус = state, максимум результатов на странице.

    Возвращает {"method", "url", "fields": [(name, value), ...]} или None.
    """
    soup = BeautifulSoup(html, "html.parser")
    best = None
    for form in soup.find_all("form"):
        opts = [o.get("value") for o in form.find_all("option")]
        if state in opts:
            best = form
            break
        if best is None and "subastas_ava" in (form.get("action") or ""):
            best = form
    if best is None:
        return None

    fields: list[tuple[str, str]] = []
    state_set = False
    submit = None
    for el in best.find_all(["input", "select", "textarea"]):
        name = el.get("name")
        if not name:
            continue
        if el.name == "input":
            typ = (el.get("type") or "text").lower()
            if typ in ("submit", "button", "image"):
                if submit is None and (el.get("value") or "").lower().startswith("buscar"):
                    submit = (name, el.get("value"))
                continue
            if typ in ("checkbox", "radio") and not el.has_attr("checked"):
                continue
            fields.append((name, el.get("value", "")))
        elif el.name == "textarea":
            fields.append((name, el.get_text()))
        else:  # select
            options = el.find_all("option")
            values = [o.get("value", clean(o.get_text())) for o in options]
            if state in values:
                fields.append((name, state))
                state_set = True
                continue
            if "page_hits" in name and values:
                nums = [v for v in values if v.isdigit()]
                fields.append((name, max(nums, key=int) if nums else values[0]))
                continue
            sel = [o for o in options if o.has_attr("selected")]
            if el.has_attr("multiple"):
                for o in sel:
                    fields.append((name, o.get("value", "")))
            elif options:
                o = sel[0] if sel else options[0]
                fields.append((name, o.get("value", clean(o.get_text()))))
    # кнопка «Buscar» тоже может быть <button name=accion>
    if submit is None:
        for b in best.find_all("button"):
            if b.get("name") and "buscar" in clean(b.get_text()).lower() + (b.get("value") or "").lower():
                submit = (b["name"], b.get("value") or clean(b.get_text()))
                break
    if submit:
        fields.append(submit)
    if not state_set:
        return None
    method = (best.get("method") or "get").lower()
    action = urljoin(page_url, best.get("action") or page_url)
    return {"method": method, "url": action, "fields": fields}
