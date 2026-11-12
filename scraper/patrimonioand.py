#!/usr/bin/env python3
"""
Скрапер Patrimonio de la Junta de Andalucía.

Junta de Andalucía — Consejería de Economía, Hacienda y Fondos Europeos —
Dirección General de Patrimonio — реализует недвижимость (inmuebles, solares,
naves, locales) по всей Андалусии через публичные субасты 2–3 раза в год,
пакетами по 10–30 лотов.

Почему это не в BOE:
  - Эти процедуры публикуются в BOJA (Boletín Oficial de la Junta de Andalucía),
    секция s54 (Otras disposiciones), как resoluciones convocatoria.
  - Не используют Portal de Subastas BOE (офлайн-процедура).

Стратегия (двойная):
  A) Портал Junta: скрапим страницу "subastas-abierto.html" — список всех
     открытых процедур с экспедиенте, датами и PDF BOJA.
  B) BOJA s54: сканируем последние N номеров BOJA на предмет анонсов
     "Patrimonio" + "subasta" + "enajenación" от Consejería de Economía.

ID формат: PATJUNTA-{expediente}  (например PATJUNTA-MP-26-002)
  fuente="patrimonioand", origen="administracion"

Переменные окружения:
  PATJUNTA=0        — отключить
  PATJUNTA_DELAY=2  — задержка между запросами (сек)
  PATJUNTA_DAYS=120 — сколько дней назад смотреть в BOJA
  PATJUNTA_MAX=20   — максимум новых записей за запуск

Использует тот же класс Fetcher, что и scrape.py (передаётся снаружи).
"""
from __future__ import annotations

import re
from datetime import datetime

from bs4 import BeautifulSoup

import boe  # noqa: E402 — общие утилиты

PORTAL_URL = (
    "https://juntadeandalucia.es/organismos/economiahaciendayfondoseuropeos"
    "/areas/patrimonio/subastas-concursos/paginas/subastas-abierto.html"
)
BOJA_BASE = "https://www.juntadeandalucia.es"
EBOJA_INDEX = BOJA_BASE + "/eboja/index.html"

# Regexp для отбора анонсов Patrimonio Junta в BOJA s54
_PATJUNTA_RE = re.compile(
    r"direcci[oó]n\s+general\s+de\s+patrimonio|"
    r"consejer[ií]a\s+de\s+econom[ií]a.*hacienda|"
    r"enajenaci[oó]n\s+de\s+(?:diversos\s+)?inmuebles",
    re.I,
)

# Regexp для извлечения expediente из заголовка/текста
_EXPEDIENTE_RE = re.compile(r"\b(MP|CO|AT)\s*[\-/]?\s*(\d{2})\s*[\-/]\s*(\d{3,4})\b", re.I)

FUENTE = "patrimonioand"
ORIGEN = "administracion"

MESES = {
    "enero": 1, "febrero": 2, "marzo": 3, "abril": 4,
    "mayo": 5, "junio": 6, "julio": 7, "agosto": 8,
    "septiembre": 9, "octubre": 10, "noviembre": 11, "diciembre": 12,
}


def _parse_date(text: str) -> str | None:
    """Извлекает дату формата 'DD de MES de YYYY' из текста."""
    m = re.search(
        r"(\d{1,2})\s+de\s+(enero|febrero|marzo|abril|mayo|junio|julio|agosto|"
        r"septiembre|octubre|noviembre|diciembre)\s+de\s+(\d{4})",
        text, re.I,
    )
    if not m:
        return None
    try:
        return datetime(
            int(m.group(3)), MESES[m.group(2).lower()], int(m.group(1))
        ).strftime("%Y-%m-%d")
    except ValueError:
        return None


def _expediente_to_id(exp: str) -> str:
    """Нормализует expediente в ID: 'MP 26/002' → 'PATJUNTA-MP-26-002'."""
    clean = re.sub(r"[\s/]+", "-", exp.strip().upper())
    return f"PATJUNTA-{clean}"


# ------------------------------------------------------------------ A) Портал

def _scrape_portal(fetcher, known: set[str], log=print) -> list[dict]:
    """Скрапит страницу открытых процедур портала Patrimonio JA."""
    try:
        html = fetcher.get(PORTAL_URL)
    except Exception as e:
        log(f"PATJUNTA portal: ошибка {e!r}")
        return []

    soup = BeautifulSoup(html, "html.parser")
    recs = []

    # Страница содержит секции по каждой процедуре.
    # Ищем expediente по pattern MP/CO/AT + год + número
    text = boe.clean(soup.get_text(" "))

    # Находим все упоминания expedientes
    for m in _EXPEDIENTE_RE.finditer(text):
        tipo, yr, num = m.group(1).upper(), m.group(2), m.group(3).zfill(3)
        exp_raw = f"{tipo} {yr}/{num}"
        rec_id = _expediente_to_id(exp_raw)

        if rec_id in known:
            continue

        # Ищем контекст вокруг этого expediente (500 символов)
        start = max(0, m.start() - 100)
        end = min(len(text), m.end() + 500)
        ctx = text[start:end]

        # Дата BOJA
        fecha_pub = _parse_date(ctx)

        # Fecha límite
        fecha_fin = None
        m_fin = re.search(
            r"(?:plazo|hasta\s+el|fecha\s+l[ií]mite)[^\d]{0,30}(\d{1,2})\s+de\s+"
            r"(enero|febrero|marzo|abril|mayo|junio|julio|agosto|"
            r"septiembre|octubre|noviembre|diciembre)\s+de\s+(\d{4})",
            ctx, re.I,
        )
        if m_fin:
            try:
                fecha_fin = datetime(
                    int(m_fin.group(3)), MESES[m_fin.group(2).lower()], int(m_fin.group(1))
                ).strftime("%Y-%m-%d")
            except ValueError:
                pass

        # PDF BOJA — ищем PDF ссылку рядом с этим expediente
        pdf_url = None
        for a in soup.find_all("a", href=re.compile(r"BOJA.*\.pdf|\.pdf.*BOJA", re.I)):
            href = a["href"]
            # Берём PDF, который содержит CVE или número BOJA
            if "BOJA" in href.upper() or exp_raw.replace("/", "-") in href:
                pdf_url = href if href.startswith("http") else BOJA_BASE + href
                break

        # Если PDF не нашли, пробуем по CVE в href
        if not pdf_url:
            for a in soup.find_all("a", href=re.compile(r"\.pdf$", re.I)):
                href = a["href"]
                link_text = boe.clean(a.get_text(" ")).lower()
                if "boja" in link_text or "convocatoria" in link_text:
                    pdf_url = href if href.startswith("http") else BOJA_BASE + href
                    break

        # Título — берём из контекста
        # Ищем фразу после expediente до конца параграфа
        titulo_m = re.search(
            r"(?:subasta|concurso)\s+p[uú]blica?\s+(?:para\s+la\s+)?enajenaci[oó]n[^.]{5,100}",
            ctx, re.I,
        )
        titulo = boe.clean(titulo_m.group(0)) if titulo_m else f"Subasta Patrimonio Junta de Andalucía {exp_raw}"

        rec = {
            "id": rec_id,
            "fuente": FUENTE,
            "origen": ORIGEN,
            "titulo": titulo,
            "descripcion": ctx[:400],
            "fecha_pub": fecha_pub or datetime.now().strftime("%Y-%m-%d"),
            "fecha_fin": fecha_fin,
            "organismo": "Junta de Andalucía - Dirección General de Patrimonio",
            "autoridad": "Consejería de Economía, Hacienda y Fondos Europeos",
            "provincia": "Andalucía",
            "tipo_bien": "inmueble",
            "categoria": "inmueble",
            "url": PORTAL_URL,
            "url_pdf": pdf_url,
            "expediente": exp_raw,
            "_text": f"{titulo} Patrimonio Junta Andalucía enajenación inmuebles",
        }

        try:
            rec["tipo_subasta"] = boe.categorize(titulo)
        except Exception:
            rec["tipo_subasta"] = "subasta"

        recs.append(rec)
        log(f"PATJUNTA portal: {rec_id} — {titulo[:60]}")

    return recs


# ------------------------------------------------------------------ B) BOJA s54

def _current_boja_num(fetcher) -> int | None:
    """Получает номер последнего опубликованного BOJA."""
    try:
        html = fetcher.get(EBOJA_INDEX)
    except Exception:
        return None
    nums = re.findall(r"/(?:e?boja)/\d{4}/(\d+)/", html)
    if not nums:
        return None
    return max(int(n) for n in nums)


def _scrape_boja_s54(fetcher, year: int, boja_num: int) -> list[dict]:
    """Парсит секцию s54 BOJA, ищет анонсы Patrimonio JA."""
    section_url = f"{BOJA_BASE}/eboja/{year}/{boja_num}/s54"
    try:
        html = fetcher.get(section_url)
    except Exception:
        return []

    if not html or len(html) < 300:
        return []

    soup = BeautifulSoup(html, "html.parser")
    results = []

    for a in soup.find_all("a", href=True):
        href = a["href"]
        m = re.search(r"/(?:e?boja)/(\d{4})/(\d+)/(\d+)$", href)
        if not m:
            continue
        art_boja = int(m.group(2))
        if art_boja != boja_num:
            continue

        # Текст ссылки + родительский элемент
        title = boe.clean(a.get_text(" "))
        parent = a.find_parent(["li", "article", "tr", "div", "p"])
        ctx = boe.clean(parent.get_text(" ")) if parent else title

        if not _PATJUNTA_RE.search(ctx) and not _PATJUNTA_RE.search(title):
            continue
        # Только субасты/enajenación
        if not re.search(r"subasta|enajenaci[oó]n", ctx, re.I):
            continue

        art_num = int(m.group(3))
        full_url = href if href.startswith("http") else BOJA_BASE + href
        results.append({
            "article": art_num,
            "title": ctx[:200],
            "url": full_url,
        })

    return results


def _parse_boja_article(html: str, url: str, year: int, boja_num: int, article: int) -> dict | None:
    """Парсит страницу анонса Patrimonio JA из BOJA."""
    soup = BeautifulSoup(html, "html.parser")

    h1 = soup.find("h1") or soup.find("h2")
    title = boe.clean(h1.get_text(" ")) if h1 else f"Patrimonio Junta {year}/{boja_num}"

    body_el = (soup.find("div", class_=re.compile(r"anuncio|contenido|texto", re.I))
               or soup.find("article") or soup.find("main"))
    body_text = boe.clean(body_el.get_text(" ")) if body_el else boe.clean(soup.get_text(" "))

    fecha_pub = _parse_date(body_text)
    fecha_fin = None
    m_fin = re.search(
        r"(?:plazo|hasta\s+el|fecha\s+l[ií]mite)[^\d]{0,30}(\d{1,2})\s+de\s+"
        r"(enero|febrero|marzo|abril|mayo|junio|julio|agosto|"
        r"septiembre|octubre|noviembre|diciembre)\s+de\s+(\d{4})",
        body_text, re.I,
    )
    if m_fin:
        try:
            fecha_fin = datetime(
                int(m_fin.group(3)), MESES[m_fin.group(2).lower()], int(m_fin.group(1))
            ).strftime("%Y-%m-%d")
        except ValueError:
            pass

    # Expediente
    exp_m = _EXPEDIENTE_RE.search(body_text)
    exp_raw = f"{exp_m.group(1).upper()} {exp_m.group(2)}/{exp_m.group(3).zfill(3)}" if exp_m else f"BOJA-{year}-{boja_num}-{article}"
    rec_id = _expediente_to_id(exp_raw)

    pdf_url = None
    for a in soup.find_all("a", href=re.compile(r"\.pdf", re.I)):
        href = a["href"]
        pdf_url = href if href.startswith("http") else BOJA_BASE + href
        break

    rec = {
        "id": rec_id,
        "fuente": FUENTE,
        "origen": ORIGEN,
        "titulo": title,
        "descripcion": body_text[:500],
        "fecha_pub": fecha_pub or datetime.now().strftime("%Y-%m-%d"),
        "fecha_fin": fecha_fin,
        "organismo": "Junta de Andalucía - Dirección General de Patrimonio",
        "autoridad": "Consejería de Economía, Hacienda y Fondos Europeos",
        "provincia": "Andalucía",
        "tipo_bien": "inmueble",
        "categoria": "inmueble",
        "url": url,
        "url_pdf": pdf_url,
        "expediente": exp_raw,
        "boja_num": boja_num,
        "boja_year": year,
        "_text": f"{title} Patrimonio Junta Andalucía subasta inmuebles",
    }

    try:
        rec["tipo_subasta"] = boe.categorize(title)
    except Exception:
        rec["tipo_subasta"] = "subasta"

    return rec


# ------------------------------------------------------------------ Main

def collect(
    fetcher,
    known: set[str],
    max_new: int = 20,
    log=print,
    days: int = 120,
) -> tuple[list[dict], int]:
    """
    Собирает процедуры Patrimonio Junta de Andalucía.

    Сначала пробует портал, затем сканирует BOJA s54 за последние `days` дней.
    Возвращает (список_новых_записей, кол-во_источников_проверено).
    """
    new_recs: list[dict] = []
    checked = 0

    # --- A) Портал
    portal_recs = _scrape_portal(fetcher, known, log)
    for r in portal_recs:
        if r["id"] not in known and len(new_recs) < max_new:
            new_recs.append(r)
            checked += 1

    # --- B) BOJA s54 (для обнаружения архивных и новых)
    today = datetime.now()
    year = today.year
    current_num = _current_boja_num(fetcher)
    if current_num is None:
        log("PATJUNTA: не удалось получить номер BOJA")
        return new_recs, checked

    nums_to_check = max(10, int(days * 5 / 7))

    for offset in range(nums_to_check):
        if len(new_recs) >= max_new:
            break

        num = current_num - offset
        if num < 1:
            break

        entries = _scrape_boja_s54(fetcher, year, num)
        if not entries:
            continue

        log(f"PATJUNTA BOJA: {year}/{num} s54 — найдено {len(entries)} анонсов")
        checked += 1

        for entry in entries:
            # Предварительная проверка по ID из URL статьи
            prelim_id = f"PATJUNTA-BOJA-{year}-{num:03d}-{entry['article']:02d}"
            if prelim_id in known:
                continue

            try:
                art_html = fetcher.get(entry["url"])
            except Exception as e:
                log(f"PATJUNTA: ошибка {entry['url']}: {e!r}")
                continue

            rec = _parse_boja_article(art_html, entry["url"], year, num, entry["article"])
            if rec is None:
                continue

            # Нормализованный ID из expediente — проверяем снова
            if rec["id"] in known or any(r["id"] == rec["id"] for r in new_recs):
                continue

            new_recs.append(rec)
            log(f"PATJUNTA BOJA: новый {rec['id']} — {rec['titulo'][:60]}")

            if len(new_recs) >= max_new:
                break

    log(f"PATJUNTA: проверено {checked} источников, собрано {len(new_recs)} новых записей")
    return new_recs, checked
