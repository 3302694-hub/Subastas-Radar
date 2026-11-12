#!/usr/bin/env python3
"""
Скрапер анонсов Patrimonio del Estado из BOE, секция V-B.

Patrimonio del Estado публикует аукционы государственного имущества (квартиры,
дома, земля, herencias abintestato) в разделе «V. Anuncios — B. Otros anuncios
oficiales» от Ministerio de Hacienda. Эти анонсы НЕ имеют идентификатора SUB-
и поэтому не попадают в основной скрапер subastas.boe.es.

Стратегия:
  1. Поиск по BOE (buscar/boe.php) с фильтрами: секция=5B, дата=últimos 90 дней,
     ключевые слова в заголовке: «Patrimonio del Estado» + (subasta | enajenación).
  2. Парсинг HTML каждого анонса (txt.php?id=BOE-B-YYYY-NNNNN).
  3. Формирование записи, совместимой с форматом основной базы.

Использует тот же класс Fetcher, что и scrape.py (передаётся снаружи).
"""
from __future__ import annotations

import re
import urllib.parse
from datetime import datetime
from html import unescape

from bs4 import BeautifulSoup

import boe  # noqa: E402  — общие утилиты (parse_money, categorize и пр.)

BOE_BASE = "https://boe.es"
SEARCH_URL = BOE_BASE + "/buscar/boe.php"

# Ключевые слова заголовка для фильтрации (проверяются вместе: хотя бы одно из каждой группы)
_TITLE_MUST = [
    re.compile(r"patrimonio\s+del\s+estado", re.I),
    re.compile(r"enajenaci[oó]n|subasta", re.I),
]

# Анонсы, которые нас НЕ интересуют (завершены, отменены, только инкоасьон без даты)
_SKIP_TITLE = re.compile(
    r"incoaci[oó]n\s+del\s+procedimiento|enajenaci[oó]n\s+directa|"
    r"venta\s+de\s+inmueble\b(?!.*subasta)",
    re.I,
)

# Нас интересуют только реальные аукционы (не «enajenación directa» без конкурса)
_AUCTION_TITLE = re.compile(r"subasta|licitaci[oó]n", re.I)

ORIGEN = "patrimonio"  # новый тип происхождения


def search_params(days_back: int = 90) -> dict:
    """Параметры поиска по BOE."""
    from datetime import timedelta

    today = datetime.now()
    since = today - timedelta(days=days_back)
    return {
        "campo[0]": "TIT",
        "dato[0]": "patrimonio estado",
        "campo[1]": "DPT",
        "dato[1]": "MINISTERIO DE HACIENDA",
        "campo[2]": "SEC",
        "dato[2]": "5B",
        "fechaDesde": since.strftime("%d/%m/%Y"),
        "fechaHasta": today.strftime("%d/%m/%Y"),
        "accion": "buscar",
        "lang": "es",
        "orden": "pub",
        "page_hits": "50",
        "inicio": "1",
    }


def _next_page_url(html: str, current_url: str) -> str | None:
    """URL следующей страницы результатов поиска, если есть."""
    soup = BeautifulSoup(html, "html.parser")
    for a in soup.find_all("a", href=True):
        text = boe.clean(a.get_text(" ")).lower()
        if "siguiente" in text or "sig." in text:
            href = unescape(a["href"])
            if "buscar" in href or "inicio=" in href:
                return urllib.parse.urljoin(current_url, href)
    return None


def _extract_results(html: str) -> list[dict]:
    """Извлекает список найденных анонсов со страницы результатов поиска BOE."""
    soup = BeautifulSoup(html, "html.parser")
    results = []

    # Результаты поиска BOE обёрнуты в <article> или <li class="resultado-busqueda">
    items = (soup.select("article.resultado-busqueda") or
             soup.select("li.resultado-busqueda") or
             soup.select("div.resultado-busqueda"))

    for item in items:
        # ID документа из ссылки
        link = item.find("a", href=re.compile(r"id=BOE-B-"))
        if not link:
            # Альтернативный вариант: ссылка в заголовке
            link = item.find("a", href=re.compile(r"BOE-B-\d{4}-\d+"))
        if not link:
            continue

        href = unescape(link["href"])
        m = re.search(r"BOE-B-(\d{4})-(\d+)", href)
        if not m:
            continue

        doc_id = f"BOE-B-{m.group(1)}-{m.group(2)}"
        title = boe.clean(link.get_text(" "))
        if not title:
            # title в отдельном теге
            h = item.find(["h3", "h4", "strong"])
            title = boe.clean(h.get_text(" ")) if h else doc_id

        # Дата публикации
        date_text = ""
        for tag in item.find_all(["time", "span", "p"]):
            t = boe.clean(tag.get_text(" "))
            if re.search(r"\d{2}/\d{2}/\d{4}", t):
                date_text = t
                break

        results.append({
            "doc_id": doc_id,
            "title": title,
            "date_text": date_text,
            "url": f"{BOE_BASE}/diario_boe/txt.php?id={doc_id}",
        })

    # Запасной вариант: ищем любые ссылки с BOE-B
    if not results:
        for a in soup.find_all("a", href=re.compile(r"[?&]id=BOE-B-\d{4}-\d+")):
            href = unescape(a["href"])
            m = re.search(r"BOE-B-(\d{4})-(\d+)", href)
            if not m:
                continue
            doc_id = f"BOE-B-{m.group(1)}-{m.group(2)}"
            title = boe.clean(a.get_text(" "))
            if any(r["doc_id"] == doc_id for r in results):
                continue
            results.append({
                "doc_id": doc_id,
                "title": title,
                "date_text": "",
                "url": f"{BOE_BASE}/diario_boe/txt.php?id={doc_id}",
            })

    return results


def _is_relevant(title: str) -> bool:
    """Проверяет, что анонс относится к аукциону Patrimonio del Estado."""
    # Должен упоминать patrimonio del estado И (subasta | licitación)
    for pattern in _TITLE_MUST:
        if not pattern.search(title):
            return False
    # Только реальные аукционы, не инкоасьон/enajenación directa
    return bool(_AUCTION_TITLE.search(title))


# ---------------------------------------------------------------------- парсинг карточки

_MONEY_RE = re.compile(r"(\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{1,2})?)\s*(?:euros?|€)", re.I)
_DATE_RE = re.compile(r"d[ií]a\s+(\d{1,2})\s+de\s+(\w+)\s+de\s+(\d{4})", re.I)
_REF_CAT_RE = re.compile(r"referencia\s+catastral[:\s]+([0-9A-Z]{14,20})", re.I)
_PROV_RE = re.compile(
    r"provincia\s+de\s+([A-ZÁÉÍÓÚÜÑ][a-záéíóúüñA-ZÁÉÍÓÚÜÑ]{3,25})", re.I
)

_MONTHS = {
    "enero": 1, "febrero": 2, "marzo": 3, "abril": 4, "mayo": 5, "junio": 6,
    "julio": 7, "agosto": 8, "septiembre": 9, "octubre": 10, "noviembre": 11, "diciembre": 12,
}


def _parse_date_es(text: str) -> str | None:
    """«el día 16 de diciembre de 2026» → '2026-12-16'"""
    m = _DATE_RE.search(text)
    if not m:
        return None
    d, month_name, y = m.groups()
    mo = _MONTHS.get(month_name.lower())
    if not mo:
        return None
    try:
        return datetime(int(y), mo, int(d)).date().isoformat()
    except ValueError:
        return None


def _parse_money_es(text: str) -> float | None:
    """«149.640,48 euros» → 149640.48"""
    for m in _MONEY_RE.finditer(text):
        raw = m.group(1)
        # нормализуем: «149.640,48» или «149,640.48»
        if "," in raw and "." in raw:
            if raw.index(".") < raw.index(","):
                raw = raw.replace(".", "").replace(",", ".")
            else:
                raw = raw.replace(",", "")
        elif "," in raw:
            # может быть дробная или тысячи
            parts = raw.split(",")
            if len(parts[-1]) <= 2:
                raw = raw.replace(",", ".")
            else:
                raw = raw.replace(",", "")
        elif "." in raw:
            parts = raw.split(".")
            if len(parts[-1]) <= 2:
                pass  # уже правильный формат
            else:
                raw = raw.replace(".", "")
        try:
            return round(float(raw), 2)
        except ValueError:
            continue
    return None


def parse_announcement(html: str, doc_id: str, pub_date: str | None = None) -> list[dict] | None:
    """Парсит HTML страницу анонса BOE и возвращает список лотов (записей).

    Каждый анонс может содержать несколько лотов (LOTE 1, LOTE 2…) или один объект.
    Возвращает None, если анонс не является аукционом Patrimonio del Estado.
    """
    soup = BeautifulSoup(html, "html.parser")
    text_full = boe.clean(soup.get_text(" "))

    # Проверяем, что это точно Patrimonio del Estado (не AEAT, не SS)
    if not re.search(r"patrimonio\s+del\s+estado", text_full, re.I):
        return None
    if not re.search(r"subasta\s+p[uú]blica|subasta\s+al\s+alza|subasta\s+sucesiva", text_full, re.I):
        return None

    # Заголовок документа
    h1 = soup.find(["h1", "h2", "h3"])
    doc_title = boe.clean(h1.get_text(" ")) if h1 else doc_id

    # Делегация (орган, публикующий анонс)
    autoridad = ""
    for pattern in [
        r"Delegaci[oó]n(?:\s+Especial)?\s+de\s+Econom[ií]a\s+y\s+Hacienda\s+(?:en\s+|de\s+)([A-ZÁÉÍÓÚÜÑ][A-Za-záéíóúüñÁÉÍÓÚÜÑ ]+?)(?:\.|,|\n|por)",
        r"Delegaci[oó]n\s+de\s+Econom[ií]a\s+y\s+Hacienda\s+(?:en\s+|de\s+)([A-ZÁÉÍÓÚÜÑ][A-Za-záéíóúüñÁÉÍÓÚÜÑ ]+?)(?:\.|,|\n|por)",
    ]:
        m = re.search(pattern, text_full, re.I)
        if m:
            autoridad = "Delegación de Economía y Hacienda en " + m.group(1).strip()
            break
    if not autoridad:
        autoridad = "Ministerio de Hacienda — Patrimonio del Estado"

    # Дата аукциона
    fecha_subasta = _parse_date_es(text_full)

    # Извлекаем лоты
    # Пробуем найти блоки LOTE N
    lot_blocks = re.split(r"\bLOTE\s+\d+\b", text_full, flags=re.I)
    if len(lot_blocks) > 2:
        # Есть несколько лотов
        lots_text = lot_blocks[1:]  # первый элемент — преамбула
    else:
        # Один объект
        lots_text = [text_full]

    records = []
    for lot_idx, lot_text in enumerate(lots_text, 1):
        # Тип лотирования и цена
        valor = _parse_money_es(lot_text)

        # Референция катастральная
        ref_cat = ""
        m = _REF_CAT_RE.search(lot_text)
        if m:
            ref_cat = m.group(1).strip()

        # Провинция: из «provincia de X» в тексте лота или из делегации
        provincia = ""
        m_prov = _PROV_RE.search(lot_text)
        if m_prov:
            provincia = m_prov.group(1).strip().upper()
        if not provincia and autoridad:
            # «Delegación … en Madrid» → «MADRID»
            m_aut = re.search(r"\ben\s+([A-ZÁÉÍÓÚÜÑ][A-Za-záéíóúüñÁÉÍÓÚÜÑ]+)\s*$", autoridad)
            if m_aut:
                provincia = m_aut.group(1).upper()

        # Адрес: ищем C/, Calle, Avda., etc.
        direccion = ""
        m_dir = re.search(
            r"(?:C(?:alle)?[/.]|Avda?\.?|Plaza|Paseo|Carretera|Camino)\s+[^\n,]{5,80}",
            lot_text, re.I
        )
        if m_dir:
            direccion = boe.clean(m_dir.group(0))

        # Localidad
        localidad = ""
        m_loc = re.search(r"(?:municipio\s+de|en\s+el\s+municipio\s+de|en\s+)([A-ZÁÉÍÓÚÜÑ][a-záéíóúüñA-ZÁÉÍÓÚÜÑ ]{2,30})(?:\s+\(|,|\.|$)", lot_text, re.I)
        if m_loc:
            localidad = m_loc.group(1).strip().upper()

        # Описание: первые ~300 символов лота
        desc = " ".join(lot_text.split())[:350]

        # Категория
        categoria = boe.categorize(lot_text)

        # Гарантия (депозит)
        deposito = None
        m_dep = re.search(r"(?:garant[ií]a|fianza)[:\s]+(?:\d+\s*%\s*)?([0-9.,]+)\s*(?:euros?|€)", lot_text, re.I)
        if m_dep:
            deposito = _parse_money_es(m_dep.group(0))

        # Уникальный ID: BOE-B-YYYY-NNNNN + лот
        lot_suffix = f"-L{lot_idx}" if len(lots_text) > 1 else ""
        rec_id = f"PAT-{doc_id}{lot_suffix}"

        record = {
            "id": rec_id,
            "url": f"{BOE_BASE}/diario_boe/txt.php?id={doc_id}",
            "origen": ORIGEN,
            "tipo": "Subasta Patrimonio del Estado",
            "categoria": categoria,
            "titulo": desc[:300],
            "provincia": provincia,
            "localidad": localidad,
            "cp": "",
            "direccion": direccion,
            "valor_subasta": valor,
            "tasacion": valor,
            "puja_minima": None,
            "deposito": deposito,
            "cantidad_reclamada": None,
            "fecha_inicio": pub_date,
            "fecha_fin": fecha_subasta,
            "estado": "proxima" if fecha_subasta and fecha_subasta > datetime.now().date().isoformat() else "activa",
            "autoridad": autoridad,
            "anuncio_boe": doc_id,
            "lotes": str(len(lots_text)) if len(lots_text) > 1 else "",
            "bienes": [{
                "titulo": f"Lote {lot_idx}" if len(lots_text) > 1 else "Inmueble",
                "tipo_bien": categoria,
                "descripcion": desc,
                "direccion": direccion,
                "provincia": provincia,
                "localidad": localidad,
                "ref_catastral": ref_cat,
            }],
            "fotos": [],
            "documentos": [],
            "docs_login": False,
            "fuente": "patrimonio",
        }
        records.append(record)

    return records if records else None


def collect(fetcher, known: set[str], max_new: int, log=print,
            days_back: int = 90) -> tuple[list[dict], int]:
    """Собирает новые записи Patrimonio del Estado из BOE.

    Возвращает (новые записи, количество проверенных анонсов).
    """
    params = search_params(days_back)
    url = SEARCH_URL + "?" + urllib.parse.urlencode(params)

    all_listings = []
    seen_pages = set()
    page = 0

    while url and url not in seen_pages and page < 20:
        seen_pages.add(url)
        try:
            html = fetcher.get(url)
        except Exception as e:  # noqa: BLE001
            log(f"[patrimonio] ошибка загрузки поиска: {e!r}")
            break

        listings = _extract_results(html)
        log(f"[patrimonio] стр.{page + 1}: найдено {len(listings)} анонсов")

        for item in listings:
            if item["doc_id"] not in {l["doc_id"] for l in all_listings}:
                all_listings.append(item)

        url = _next_page_url(html, url)
        page += 1

    # Фильтруем по заголовку и уже известным
    new_listings = [
        l for l in all_listings
        if _is_relevant(l["title"])
        and not any(l["doc_id"] in kid for kid in known)
    ]
    log(f"[patrimonio] подходящих для загрузки: {len(new_listings)}")

    new_records: list[dict] = []
    checked = 0

    for listing in new_listings:
        if len(new_records) >= max_new:
            break
        try:
            html = fetcher.get(listing["url"])
            checked += 1
            recs = parse_announcement(html, listing["doc_id"], pub_date=None)
            if recs:
                # Помечаем дату обнаружения
                now_iso = datetime.utcnow().isoformat()
                for r in recs:
                    r["detectada"] = now_iso
                    r["v"] = 1
                new_records.extend(recs)
                log(f"[patrimonio] {listing['doc_id']}: {len(recs)} лот(ов) — {listing['title'][:60]}")
            else:
                log(f"[patrimonio] {listing['doc_id']}: пропущен (не аукцион Patrimonio)")
        except Exception as e:  # noqa: BLE001
            log(f"[patrimonio] {listing['doc_id']}: ошибка {e!r}")

    log(f"[patrimonio] итого новых записей: {len(new_records)}, проверено анонсов: {checked}")
    return new_records, checked
