#!/usr/bin/env python3
"""
Скрапер AVRA (Agencia de Vivienda y Rehabilitación de Andalucía).

AVRA ежемесячно публикует в BOJA (Boletín Oficial de la Junta de Andalucía)
конвокаторию enajenación de inmuebles — продажа земельных участков под жильё
с защитой (vivienda protegida) посредством субасты и публичного конкурса.

Почему это не в BOE:
  - AVRA (ранее EPSA) — региональное агентство Андалусии.
  - Небольшие ежемесячные партии (десятки участков) публикуются только в BOJA.
  - Крупные партии (Carmona, пр.) иногда дублируются в BOE секция V-B
    и захватываются patrimonio.py, но ежемесячные — только BOJA.

Стратегия:
  1. Перебираем последние AVRA_DAYS рабочих дней (≈ номера BOJA).
     Текущий номер BOJA получаем из /eboja/index.html;
     от него идём назад на нужное количество выпусков.
  2. Для каждого номера BOJA парсим секцию s57 (Otros anuncios oficiales).
  3. Ищем анонсы AVRA по ключевым словам в заголовке.
  4. Парсим страницу анонса: заголовок, дата, PDF, дедлайн.

ID формат: AVRA-BOJA-YYYY-NNN-AA
  где NNN = номер BOJA, AA = номер анонса внутри боллетиня.

Переменные окружения:
  AVRA=0        — отключить
  AVRA_DELAY=2  — задержка между запросами (сек)
  AVRA_DAYS=90  — сколько дней назад смотреть
  AVRA_MAX=50   — максимум новых записей за запуск

Использует тот же класс Fetcher, что и scrape.py (передаётся снаружи).
"""
from __future__ import annotations

import re
from datetime import datetime, timedelta

from bs4 import BeautifulSoup

import boe  # noqa: E402 — общие утилиты

BOJA_BASE = "https://www.juntadeandalucia.es"
EBOJA_INDEX = BOJA_BASE + "/eboja/index.html"

# Ключевые слова для распознавания анонсов AVRA в секции s57
_AVRA_RE = re.compile(
    r"\bavra\b|agencia\s+de\s+vivienda|enajenaci[oó]n\s+de\s+(?:bienes\s+)?inmuebles",
    re.I,
)

FUENTE = "avra"
ORIGEN = "administracion"


# ------------------------------------------------------------------ Вспомогательные функции

def _current_boja_num(fetcher) -> int | None:
    """
    Получает номер последнего опубликованного BOJA из /eboja/index.html.
    Ищет последний явно пронумерованный боллетин.
    """
    try:
        html = fetcher.get(EBOJA_INDEX)
    except Exception:
        return None

    # Ищем ссылки вида /eboja/2026/NNN/ или /boja/2026/NNN/
    nums = re.findall(r"/(?:e?boja)/\d{4}/(\d+)/", html)
    if not nums:
        return None
    return max(int(n) for n in nums)


def _section_url(year: int, num: int) -> str:
    return f"{BOJA_BASE}/eboja/{year}/{num}/s57"


def _article_url(year: int, num: int, article: int) -> str:
    return f"{BOJA_BASE}/boja/{year}/{num}/{article}"


def _parse_section(html: str, year: int, boja_num: int) -> list[dict]:
    """
    Парсит секцию s57 BOJA. Возвращает список найденных AVRA-анонсов
    в виде: [{"article": int, "title": str, "url": str}]
    """
    soup = BeautifulSoup(html, "html.parser")
    results = []

    # Ищем строки таблицы или ссылки с заголовками анонсов
    # Страница BOJA содержит <article> или <li> с заголовком и ссылкой
    for a in soup.find_all("a", href=True):
        href = a["href"]
        # Ссылка на конкретный анонс: /boja/YYYY/NNN/NN или /eboja/YYYY/NNN/NN
        m = re.search(r"/(?:e?boja)/(\d{4})/(\d+)/(\d+)$", href)
        if not m:
            continue
        art_year, art_boja, art_num = int(m.group(1)), int(m.group(2)), int(m.group(3))
        if art_boja != boja_num:
            continue

        title = boe.clean(a.get_text(" "))
        if not title:
            # Попробуем взять текст из родительского элемента
            parent = a.find_parent(["li", "article", "tr", "div"])
            if parent:
                title = boe.clean(parent.get_text(" "))

        if not _AVRA_RE.search(title):
            continue

        full_url = href if href.startswith("http") else BOJA_BASE + href
        results.append({
            "article": art_num,
            "title": title,
            "url": full_url,
        })

    return results


def _parse_article(html: str, url: str, year: int, boja_num: int, article: int) -> dict | None:
    """
    Парсит страницу конкретного анонса AVRA. Возвращает запись субасты.
    """
    soup = BeautifulSoup(html, "html.parser")

    # Заголовок
    h1 = soup.find("h1") or soup.find("h2")
    title = boe.clean(h1.get_text(" ")) if h1 else f"AVRA BOJA {year}/{boja_num}/{article}"

    # Текст анонса
    body_el = (soup.find("div", class_=re.compile(r"anuncio|contenido|texto", re.I))
               or soup.find("article")
               or soup.find("main"))
    body_text = boe.clean(body_el.get_text(" ")) if body_el else boe.clean(soup.get_text(" "))

    # Дата публикации — из URL или из текста
    fecha_pub = None
    # Пробуем найти в тексте "publicado el DD de MES de YYYY" или похожее
    m_fecha = re.search(
        r"(\d{1,2})\s+de\s+(enero|febrero|marzo|abril|mayo|junio|julio|agosto|"
        r"septiembre|octubre|noviembre|diciembre)\s+de\s+(\d{4})",
        body_text, re.I
    )
    if m_fecha:
        meses = {
            "enero": 1, "febrero": 2, "marzo": 3, "abril": 4,
            "mayo": 5, "junio": 6, "julio": 7, "agosto": 8,
            "septiembre": 9, "octubre": 10, "noviembre": 11, "diciembre": 12,
        }
        try:
            fecha_pub = datetime(
                int(m_fecha.group(3)),
                meses[m_fecha.group(2).lower()],
                int(m_fecha.group(1)),
            ).strftime("%Y-%m-%d")
        except ValueError:
            pass

    # Дедлайн ("fecha límite", "plazo")
    fecha_fin = None
    m_fin = re.search(
        r"(?:fecha\s+l[ií]mite|plazo|hasta\s+el)\s+.*?(\d{1,2})\s+de\s+"
        r"(enero|febrero|marzo|abril|mayo|junio|julio|agosto|"
        r"septiembre|octubre|noviembre|diciembre)\s+de\s+(\d{4})",
        body_text, re.I
    )
    if m_fin:
        meses = {
            "enero": 1, "febrero": 2, "marzo": 3, "abril": 4,
            "mayo": 5, "junio": 6, "julio": 7, "agosto": 8,
            "septiembre": 9, "octubre": 10, "noviembre": 11, "diciembre": 12,
        }
        try:
            fecha_fin = datetime(
                int(m_fin.group(3)),
                meses[m_fin.group(2).lower()],
                int(m_fin.group(1)),
            ).strftime("%Y-%m-%d")
        except ValueError:
            pass

    # PDF ссылка
    pdf_url = None
    for a in soup.find_all("a", href=re.compile(r"\.pdf", re.I)):
        href = a["href"]
        pdf_url = href if href.startswith("http") else BOJA_BASE + href
        break  # берём первый PDF

    # Количество inmuebles из текста
    num_inmuebles = None
    m_num = re.search(r"(\d+)\s+(?:inmuebles?|solares?|parcelas?)", body_text, re.I)
    if m_num:
        try:
            num_inmuebles = int(m_num.group(1))
        except ValueError:
            pass

    # Провинция/локация — AVRA работает по всей Андалусии
    # Конкретные адреса только в PDF/Anexo — здесь только "Andalucía"
    provincia = "Andalucía"

    # Собираем запись
    rec_id = f"AVRA-BOJA-{year}-{boja_num:03d}-{article:02d}"

    rec = {
        "id": rec_id,
        "fuente": FUENTE,
        "origen": ORIGEN,
        "titulo": title,
        "descripcion": body_text[:500] if body_text else "",
        "fecha_pub": fecha_pub or datetime.now().strftime("%Y-%m-%d"),
        "fecha_fin": fecha_fin,
        "organismo": "AVRA - Agencia de Vivienda y Rehabilitación de Andalucía",
        "autoridad": "Junta de Andalucía - Consejería de Vivienda",
        "provincia": provincia,
        "tipo_bien": "solar",
        "categoria": "suelo",
        "url": url,
        "url_pdf": pdf_url,
        "boja_num": boja_num,
        "boja_year": year,
        "_text": f"{title} AVRA Andalucía vivienda protegida suelo residencial",
    }

    # Categorizar через boe.categorize если доступно
    try:
        rec["tipo_subasta"] = boe.categorize(title)
    except Exception:
        rec["tipo_subasta"] = "subasta"

    return rec


# ------------------------------------------------------------------ Главная функция

def collect(
    fetcher,
    known: set[str],
    max_new: int = 50,
    log=print,
    days: int = 90,
) -> tuple[list[dict], int]:
    """
    Собирает новые анонсы AVRA из BOJA за последние `days` рабочих дней.

    Возвращает (список_новых_записей, кол-во_проверенных_боллетиней).
    """
    today = datetime.now()
    year = today.year

    # Получаем текущий номер BOJA
    current_num = _current_boja_num(fetcher)
    if current_num is None:
        log("AVRA: не удалось получить текущий номер BOJA — пробуем оценочный")
        # Оценочный: ~1 номер/рабочий день, ~252 рабочих дня/год
        # BOJA 197 = 09/10/2026, от начала года
        day_of_year = today.timetuple().tm_yday
        # Примерно 5/7 дней рабочие
        current_num = int(day_of_year * 5 / 7)

    log(f"AVRA: текущий BOJA № {current_num} ({year})")

    # Сколько номеров просмотреть: days рабочих дней ≈ days * 5/7 номеров
    nums_to_check = max(10, int(days * 5 / 7))

    new_recs: list[dict] = []
    checked = 0

    for offset in range(nums_to_check):
        if len(new_recs) >= max_new:
            break

        num = current_num - offset
        if num < 1:
            break

        section_url = _section_url(year, num)
        try:
            html = fetcher.get(section_url)
        except Exception as e:
            # Боллетин может не существовать (выходные, праздники) — пропускаем
            log(f"AVRA: BOJA {year}/{num} s57 — ошибка {e!r}")
            continue

        # Пустая страница или 404 через мягкий редирект
        if not html or len(html) < 500:
            continue

        checked += 1
        entries = _parse_section(html, year, num)

        if not entries:
            continue

        log(f"AVRA: BOJA {year}/{num} — найдено {len(entries)} анонсов AVRA")

        for entry in entries:
            rec_id = f"AVRA-BOJA-{year}-{num:03d}-{entry['article']:02d}"
            if rec_id in known:
                continue

            art_url = entry["url"]
            try:
                art_html = fetcher.get(art_url)
            except Exception as e:
                log(f"AVRA: ошибка парсинга {art_url}: {e!r}")
                continue

            rec = _parse_article(art_html, art_url, year, num, entry["article"])
            if rec is None:
                continue

            new_recs.append(rec)
            log(f"AVRA: новый анонс {rec['id']} — {rec['titulo'][:60]}")

            if len(new_recs) >= max_new:
                break

    log(f"AVRA: проверено {checked} боллетиней, собрано {len(new_recs)} новых записей")
    return new_recs, checked
