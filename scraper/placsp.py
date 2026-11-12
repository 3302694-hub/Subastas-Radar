#!/usr/bin/env python3
"""
Скрапер PLACSP (Plataforma de Contratación del Sector Público).

Собирает из Atom-фида PLACSP лоты типа «Patrimonial» (TypeCode=7) —
продажи государственного имущества всеми органами власти Испании:
TGSS, ADIF, SEPES, муниципалитеты, автономии и пр.

Atom-фид: https://contrataciondelsectorpublico.gob.es/sindicacion/sindicacion_643/
           licitacionesPerfilesContratanteCompleto3.atom
  - пагинация через atom:link[@rel='next']
  - каждый entry содержит CODICE XML в cac-place-ext:ContractFolderStatus

Дополнительный фид (агрегированные платформы):
  https://contrataciondelsectorpublico.gob.es/sindicacion/sindicacion_1044/
  PlataformasAgregadasSinMenores.atom

Используем тот же класс Fetcher, что и scrape.py (передаётся снаружи).
"""
from __future__ import annotations

import re
import xml.etree.ElementTree as ET
from datetime import datetime

import boe  # noqa: E402  — общие утилиты (categorize)

# ------------------------------------------------------------------ Atom-фиды
FEEDS = [
    "https://contrataciondelsectorpublico.gob.es/sindicacion/sindicacion_643/"
    "licitacionesPerfilesContratanteCompleto3.atom",
    "https://contrataciondelsectorpublico.gob.es/sindicacion/sindicacion_1044/"
    "PlataformasAgregadasSinMenores.atom",
]

# ------------------------------------------------------------------ XML пространства имён
NS = {
    "atom":          "http://www.w3.org/2005/Atom",
    "cac":           "urn:dgpe:names:draft:codice:schema:xsd:CommonAggregateComponents-2",
    "cac-place-ext": "urn:dgpe:names:draft:codice-place:schema:xsd:CommonAggregateComponents-2",
    "cbc":           "urn:dgpe:names:draft:codice:schema:xsd:CommonBasicComponents-2",
    "cbc-place-ext": "urn:dgpe:names:draft:codice-place:schema:xsd:CommonBasicComponents-2",
}

# TypeCode «Patrimonial» — enajenación de bienes inmuebles y muebles
PATRIMONIAL_CODE = "7"

# Дополнительные признаки в тексте заголовка (если TypeCode не проставлен)
_TITLE_RE = re.compile(
    r"enajenaci[oó]n|subasta\s+(?:de\s+)?inmueble|venta\s+de\s+inmueble|"
    r"subasta\s+(?:de\s+)?bien(?:es)?|patrimonio",
    re.I,
)

FUENTE = "placsp"
ORIGEN = "administracion"


def _text(el: ET.Element | None) -> str:
    if el is None:
        return ""
    return (el.text or "").strip()


def _find(root: ET.Element, path: str) -> ET.Element | None:
    """Поиск с поддержкой нескольких NS-префиксов."""
    return root.find(path, NS)


def _findall(root: ET.Element, path: str) -> list[ET.Element]:
    return root.findall(path, NS)


def _money(el: ET.Element | None) -> float | None:
    if el is None:
        return None
    try:
        return round(float((el.text or "0").replace(",", ".")), 2)
    except ValueError:
        return None


def _isodate(s: str) -> str | None:
    """Нормализует дату/дату-время к ISO-8601 date."""
    if not s:
        return None
    s = s.strip()
    for fmt in ("%Y-%m-%dT%H:%M:%S", "%Y-%m-%dT%H:%M:%SZ", "%Y-%m-%d", "%d/%m/%Y"):
        try:
            return datetime.strptime(s[:len(fmt)], fmt).date().isoformat()
        except ValueError:
            continue
    return None


# ------------------------------------------------------------------ парсинг entry

def parse_entry(entry: ET.Element) -> dict | None:
    """Парсит один <entry> из Atom-фида PLACSP.

    Возвращает dict-запись или None, если это не Patrimonial-лицитация.
    """
    # ID и ссылка
    entry_id = _text(_find(entry, "atom:id"))
    link_el = _find(entry, "atom:link")
    url = link_el.get("href", "") if link_el is not None else ""

    title = _text(_find(entry, "atom:title"))
    updated = _text(_find(entry, "atom:updated"))

    # Основной блок данных — ContractFolderStatus
    cfs = _find(entry, "cac-place-ext:ContractFolderStatus")
    if cfs is None:
        return None

    # -- Тип контракта
    type_code_el = _find(cfs, "cac:ProcurementProject/cbc:TypeCode")
    type_code = _text(type_code_el)

    # -- Заголовок / объект
    obj_el = _find(cfs, "cac:ProcurementProject/cbc:Name")
    obj_text = _text(obj_el) or title

    # Фильтруем: только Patrimonial (код 7) ИЛИ ключевые слова в заголовке
    is_patrimonial = (type_code == PATRIMONIAL_CODE or
                      bool(_TITLE_RE.search(obj_text)))
    if not is_patrimonial:
        return None

    # -- Орган
    party_name_el = _find(cfs, "cac:LocatedContractingParty/cac:Party/cac:PartyName/cbc:Name")
    autoridad = _text(party_name_el)

    # -- Бюджет/стоимость
    budget_el = _find(cfs, "cac:ProcurementProject/cac:BudgetAmount/cbc:TotalAmount")
    if budget_el is None:
        budget_el = _find(cfs, "cac:ProcurementProject/cac:BudgetAmount/cbc:TaxExclusiveAmount")
    valor = _money(budget_el)

    # -- Местонахождение объекта
    loc = _find(cfs, "cac:ProcurementProject/cac:RealizedLocation")
    if loc is None:
        loc = _find(cfs, "cac:ProcurementProject/cac:RealizedLocation[1]")

    provincia = ""
    localidad = ""
    cp = ""
    direccion = ""

    if loc is not None:
        # Провинция / subentidad territorial
        subent_el = _find(loc, "cbc:CountrySubentity")
        if subent_el is not None:
            provincia = (_text(subent_el) or "").upper()

        # Nuts code как запасной — берём только 2-значный код региона
        nuts_el = _find(loc, "cbc:CountrySubentityCode")
        if nuts_el is not None and not provincia:
            nuts = _text(nuts_el)  # напр. ES300 → Madrid
            provincia = nuts  # TODO: можно добавить маппинг NUTS→nombre

        # Адрес
        addr = _find(loc, "cac:Address")
        if addr is not None:
            street_el = _find(addr, "cbc:StreetName")
            if street_el is None:
                street_el = _find(addr, "cbc:AddressLine")
            direccion = _text(street_el)

            city_el = _find(addr, "cbc:CityName")
            localidad = (_text(city_el) or "").upper()

            cp_el = _find(addr, "cbc:PostalZone")
            if cp_el is None:
                cp_el = _find(addr, "cbc:PostalCode")
            cp = _text(cp_el)

    # -- Дatas
    # Дата плановой субасты — TenderSubmissionDeadlinePeriod/EndDate
    end_date_el = _find(cfs, "cac:TenderingProcess/cac:TenderSubmissionDeadlinePeriod/cbc:EndDate")
    fecha_fin = _isodate(_text(end_date_el))

    # Дата начала (публикации)
    start_date_el = _find(cfs,
        "cac:TenderingProcess/cac:TenderSubmissionDeadlinePeriod/cbc:StartDate")
    if start_date_el is None:
        start_date_el = _find(cfs, "cac:ValidNoticeInfo/cac:AdditionalPublicationStatus/"
                                   "cac:PublicationMediaName")  # запасной вариант
    fecha_inicio = _isodate(_text(start_date_el)) or _isodate(updated)

    # -- Статус
    status_code_el = _find(cfs, "cbc-place-ext:ContractFolderStatusCode")
    status_raw = _text(status_code_el)
    # Коды PLACSP: PUB=publicada, EVA=en evaluación, ADJ=adjudicada, etc.
    today_iso = datetime.utcnow().date().isoformat()
    if status_raw in ("ADJ", "RES", "ANUL"):
        estado = "finalizada"
    elif fecha_fin and fecha_fin < today_iso:
        estado = "finalizada"
    elif fecha_fin and fecha_fin > today_iso:
        estado = "proxima"
    else:
        estado = "activa"

    # -- Категория из заголовка
    categoria = boe.categorize(obj_text)

    # -- Expediente/referencia
    expte_el = _find(cfs, "cbc:ContractFolderID")
    expte = _text(expte_el)

    # Строим уникальный ID: PLACSP-<expediente>
    # entry_id может быть URL вроде https://contrataciondelestado.es/wps/...
    # Используем expediente как ключ, с префиксом
    if expte:
        rec_id = f"PLACSP-{expte}"
    else:
        # Fallback: хэш из entry_id
        import hashlib
        rec_id = "PLACSP-" + hashlib.md5(entry_id.encode()).hexdigest()[:12]

    return {
        "id": rec_id,
        "url": url or entry_id,
        "origen": ORIGEN,
        "tipo": "Enajenación de inmueble",
        "categoria": categoria,
        "titulo": obj_text[:300],
        "provincia": provincia,
        "localidad": localidad,
        "cp": cp,
        "direccion": direccion,
        "valor_subasta": valor,
        "tasacion": valor,
        "puja_minima": None,
        "deposito": None,
        "cantidad_reclamada": None,
        "fecha_inicio": fecha_inicio,
        "fecha_fin": fecha_fin,
        "estado": estado,
        "autoridad": autoridad,
        "anuncio_boe": "",
        "lotes": "",
        "bienes": [{
            "titulo": obj_text[:200],
            "tipo_bien": categoria,
            "descripcion": obj_text,
            "direccion": direccion,
            "provincia": provincia,
            "localidad": localidad,
            "ref_catastral": "",
        }],
        "fotos": [],
        "documentos": [],
        "docs_login": False,
        "fuente": FUENTE,
        "expte_placsp": expte,
    }


# ------------------------------------------------------------------ collect

def _parse_feed_page(xml_text: str) -> tuple[list[dict], str | None]:
    """Парсит одну страницу Atom-фида.

    Возвращает (записи, url_следующей_страницы_или_None).
    """
    try:
        root = ET.fromstring(xml_text)
    except ET.ParseError:
        return [], None

    records = []
    for entry in _findall(root, "atom:entry"):
        rec = parse_entry(entry)
        if rec:
            records.append(rec)

    # Следующая страница
    next_url = None
    for link in _findall(root, "atom:link"):
        if link.get("rel") == "next":
            next_url = link.get("href")
            break

    return records, next_url


def collect(fetcher, known: set[str], max_new: int, log=print,
            max_pages: int = 50) -> tuple[list[dict], int]:
    """Собирает новые Patrimonial-лицитации из PLACSP Atom-фидов.

    Возвращает (новые_записи, количество_страниц_обработано).
    """
    now_iso = datetime.utcnow().isoformat()
    new_records: list[dict] = []
    pages_checked = 0

    for feed_url in FEEDS:
        url: str | None = feed_url
        feed_pages = 0

        while url and feed_pages < max_pages:
            if len(new_records) >= max_new:
                break
            try:
                xml_text = fetcher.get(url)
                pages_checked += 1
                feed_pages += 1
            except Exception as e:  # noqa: BLE001
                log(f"[placsp] ошибка загрузки {url}: {e!r}")
                break

            recs, next_url = _parse_feed_page(xml_text)

            page_new = 0
            for r in recs:
                if r["id"] not in known and len(new_records) < max_new:
                    r["detectada"] = now_iso
                    r["v"] = 1
                    new_records.append(r)
                    page_new += 1

            log(f"[placsp] стр.{feed_pages} ({feed_url[-40:]}): "
                f"{len(recs)} patrimonial, {page_new} новых")

            # Если все записи на странице уже известны — прекращаем пагинацию
            if page_new == 0 and len(recs) > 0:
                break

            url = next_url

    log(f"[placsp] итого: {len(new_records)} новых записей, "
        f"{pages_checked} страниц обработано")
    return new_records, pages_checked
