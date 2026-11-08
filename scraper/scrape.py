#!/usr/bin/env python3
"""
Сборщик новых аукционов с Портала аукционов BOE.

Что делает за один запуск:
  1. Ищет аукционы в статусах «Celebrándose» и «Próxima apertura»,
     отсортированные по дате начала (сначала новые).
  2. Для каждого незнакомого ID скачивает карточку (общие данные,
     орган, имущество) и добавляет в базу: Supabase (если заданы
     SUPABASE_URL и SUPABASE_SERVICE_KEY) или файл site/data/subastas.json.
  3. Обновляет статусы ранее найденных аукционов (по дате окончания),
     удаляет завершённые старше KEEP_FINISHED_DAYS дней.
  4. Помечает 10 самых свежих текущих аукционов как бесплатные (teaser).
  5. Пишет публичные анонсы: RSS site/feed.xml, site/data/meta.json и,
     если заданы TELEGRAM_BOT_TOKEN и TELEGRAM_CHAT_ID, посты в Telegram.
     В анонсах нет адреса и ссылки на BOE — подробности на сайте после входа.

Запуск:  python scraper/scrape.py [--max-pages 10] [--max-new 300]
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import time
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone
from email.utils import format_datetime
from pathlib import Path
from xml.sax.saxutils import escape

sys.path.insert(0, str(Path(__file__).resolve().parent))
import boe  # noqa: E402
from store import SupabaseStore  # noqa: E402
import enrich as enrich_mod  # noqa: E402
import tgss  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
SITE = ROOT / "site"
DATA_FILE = SITE / "data" / "subastas.json"
META_FILE = SITE / "data" / "meta.json"
FEED_FILE = SITE / "feed.xml"

SITE_URL = os.environ.get("SITE_URL", "").rstrip("/")
SITE_NAME = os.environ.get("SITE_NAME", "Subástica")
USER_AGENT = os.environ.get(
    "SCRAPER_USER_AGENT",
    f"{SITE_NAME}/1.0 (agregador de subastas publicas; +{SITE_URL or 'https://github.com'})",
)
DELAY = float(os.environ.get("SCRAPER_DELAY", "1.2"))  # пауза между запросами, сек
KEEP_FINISHED_DAYS = int(os.environ.get("KEEP_FINISHED_DAYS", "30"))
STATES = os.environ.get("SCRAPER_STATES", "EJ,PU").split(",")  # EJ=celebrándose, PU=próxima apertura
TEASER_COUNT = int(os.environ.get("TEASER_COUNT", "10"))
STORE = (SupabaseStore(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_KEY"])
         if os.environ.get("SUPABASE_URL") and os.environ.get("SUPABASE_SERVICE_KEY") else None)

CAT_ES = {
    "vivienda": "Vivienda", "garaje": "Garaje", "trastero": "Trastero", "local": "Local",
    "nave": "Nave industrial", "solar": "Solar", "rustica": "Finca rústica", "inmueble": "Inmueble", "vehiculo": "Vehículo",
    "embarcacion": "Embarcación", "joyas_arte": "Joyas y arte", "maquinaria": "Maquinaria",
    "derechos": "Derechos", "otros": "Otros",
}


def log(*a):
    print(datetime.now().strftime("%H:%M:%S"), *a, flush=True)


class Fetcher:
    def __init__(self, delay: float = DELAY):
        self.delay = delay
        self.last = 0.0
        self.opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor())
        self.count = 0
        self.last_url = ""
        self.last_status = 0

    def get(self, url: str, retries: int = 3, data: bytes | None = None) -> str:
        for attempt in range(retries):
            wait = self.delay - (time.time() - self.last)
            if wait > 0:
                time.sleep(wait)
            self.last = time.time()
            headers = {"User-Agent": USER_AGENT, "Accept-Language": "es-ES,es;q=0.9"}
            if data is not None:
                headers["Content-Type"] = "application/x-www-form-urlencoded"
                headers["Referer"] = boe.BASE + "subastas_ava.php"
            req = urllib.request.Request(url, data=data, headers=headers)
            try:
                with self.opener.open(req, timeout=30) as r:
                    raw = r.read()
                    self.count += 1
                    self.last_url = r.geturl()
                    self.last_status = r.status
                    charset = r.headers.get_content_charset() or "utf-8"
                    return raw.decode(charset, errors="replace")
            except Exception as e:  # noqa: BLE001
                log(f"  ошибка {e!r} ({attempt + 1}/{retries}) {url}")
                time.sleep(3 * (attempt + 1))
        raise RuntimeError(f"не удалось скачать {url}")


def search_url(state: str) -> str:
    params = {
        "campo[2]": "SUBASTA.ESTADO.CODIGO",
        "dato[2]": state,
        "sort_field[0]": "SUBASTA.FECHA_FIN",
        "sort_order[0]": "desc",
        "page_hits": "50",
        "accion": "Buscar",
    }
    return boe.BASE + "subastas_ava.php?" + urllib.parse.urlencode(params)


def _load_local() -> dict[str, dict]:
    if not DATA_FILE.exists():
        return {}
    payload = json.loads(DATA_FILE.read_text("utf-8"))
    if isinstance(payload, dict) and payload.get("demo"):
        log("в локальном файле демо-данные — пропускаем")
        return {}
    items = payload.get("subastas", payload) if isinstance(payload, dict) else payload
    return {s["id"]: s for s in items}


def _migrate(db: dict[str, dict]) -> None:
    """Пересчитывает поля, логика которых менялась (категория, нулевая оценка)."""
    for s in db.values():
        if s.get("fuente") == "tgss":
            b = (s.get("bienes") or [{}])[0]
            s["categoria"] = tgss.category(b.get("tipo_bien", ""), b.get("descripcion", ""))
            real = tgss.province_from_location(b.get("ubicacion", ""))
            if real:  # провинция объекта, а не провинциального управления TGSS
                s["provincia"] = b["provincia"] = real
        else:
            s["categoria"] = boe.category_of(s.get("bienes") or [], s.get("titulo", ""))
        if not s.get("tasacion"):
            s["tasacion"] = None


def load_db() -> dict[str, dict]:
    if STORE:
        db = STORE.load_all()
        log(f"Supabase: в базе {len(db)}")
        if not db:
            db = _load_local()
            if db:
                log(f"Supabase пуст — переносим {len(db)} аукционов из site/data/subastas.json")
    else:
        db = _load_local()
    _migrate(db)
    return db


def first_search_page(fetcher: Fetcher, state: str) -> tuple[str, str]:
    """Открывает форму поиска портала и отправляет её с нужным статусом.
    Если форму разобрать не удалось — пробует прямой адрес поиска."""
    form_url = boe.BASE + "subastas_ava.php"
    form_html = fetcher.get(form_url)
    form = boe.parse_search_form(form_html, fetcher.last_url or form_url, state)
    if form:
        log(f"[{state}] форма поиска: {form['method'].upper()} {form['url']} ({len(form['fields'])} полей)")
        body = urllib.parse.urlencode(form["fields"])
        if form["method"] == "post":
            return fetcher.get(form["url"], data=body.encode()), form["url"]
        url = form["url"] + ("&" if "?" in form["url"] else "?") + body
        return fetcher.get(url), url
    log(f"[{state}] форму поиска разобрать не удалось — прямой запрос")
    dump_debug("form", form_html, fetcher)
    url = search_url(state)
    return fetcher.get(url), url


def collect_listing(fetcher: Fetcher, known: set[str], max_pages: int) -> list[dict]:
    """Проходит все страницы поиска по каждому статусу и собирает ID аукционов.
    Список дешёвый (1 запрос на 50 аукционов), карточки качаются только для новых."""
    found: dict[str, dict] = {}
    for state in (s.strip() for s in STATES if s.strip()):
        try:
            html, url = first_search_page(fetcher, state)
        except RuntimeError as e:
            log(f"[{state}] {e}")
            continue
        seen_pages = {url}
        for page in range(max_pages):
            items, nexts = boe.parse_search_page(html, url)
            fresh = [i for i in items if i["id"] not in found]
            for i in items:
                found.setdefault(i["id"], i)
            new_for_db = sum(1 for i in fresh if i["id"] not in known)
            log(f"[{state}] стр.{page + 1}: {len(items)} шт., новых {new_for_db}")
            if not items:
                if page == 0:
                    err = boe.page_error(html)
                    if err:
                        log(f"[{state}] портал ответил: {err}")
                    dump_debug(f"search_{state}", html, fetcher)
                break
            if not fresh:  # страница повторилась — дальше листать нечего
                break
            nexts = [n for n in nexts if n not in seen_pages]
            if not nexts:
                break
            url = nexts[0] if len(nexts) == 1 else _pick_next(nexts, page)
            seen_pages.add(url)
            html = fetcher.get(url)
    return list(found.values())


def dump_debug(name: str, html: str, fetcher: "Fetcher") -> None:
    """Сохраняет полученную страницу, чтобы разобраться, почему парсер ничего не нашёл."""
    import re as _re
    path = DATA_FILE.parent / f"debug_{name}.html"
    path.write_text(html, "utf-8")
    text = _re.sub(r"\s+", " ", _re.sub(r"<[^>]+>", " ", _re.sub(r"(?is)<(script|style).*?</\1>", " ", html)))
    log(f"  ОТЛАДКА: HTTP {fetcher.last_status}, {len(html)} байт, итоговый URL: {fetcher.last_url}")
    log(f"  ОТЛАДКА: страница сохранена в {path.relative_to(ROOT)}")
    log(f"  ОТЛАДКА: начало текста: {text.strip()[:600]}")


def _pick_next(links: list[str], page: int) -> str:
    # В пагинации BOE ссылки вида id_busqueda=_XXXX-<offset>-50; берём минимальный offset больше текущего
    def offset(u):
        try:
            return int(u.rsplit("-", 2)[-2])
        except (ValueError, IndexError):
            return 10**9
    cur = (page + 1) * 50
    cand = sorted((offset(u), u) for u in links)
    for off, u in cand:
        if off >= cur:
            return u
    return cand[-1][1]


def fetch_detail(fetcher: Fetcher, listing: dict) -> dict:
    sid = listing["id"]
    html1 = fetcher.get(boe.detail_url(sid, 1))
    general = boe.parse_general(html1)
    dd = boe.parse_docs(html1, boe.detail_url(sid, 1))
    try:
        authority = boe.parse_authority(fetcher.get(boe.detail_url(sid, 2)))
    except RuntimeError:
        authority = {}
    fotos, docs = [], []
    try:
        html3 = fetcher.get(boe.detail_url(sid, 3))
        assets = boe.parse_assets(html3)
        fotos, _ = boe.parse_media(html3, boe.detail_url(sid, 3))
        _sample(sid, "ver3", html3)
    except RuntimeError:
        assets = []
    rec = boe.build_record(listing, general, authority, assets)
    rec["fotos"] = fotos
    rec["documentos"], rec["docs_login"] = dd["documentos"], dd["docs_login"]
    rec["v"] = DETAIL_VERSION
    return rec


DETAIL_VERSION = 2   # 2: документы с ver=1, авто (марка/модель), «vivienda habitual»


def backfill(fetcher: Fetcher, db: dict[str, dict], limit: int, budget_s: float) -> int:
    """Дозагружает новые поля у уже собранных текущих аукционов (по limit за запуск)."""
    t0, n = time.monotonic(), 0
    todo = [s for s in db.values() if s.get("estado") in ("activa", "proxima") and s.get("v") != DETAIL_VERSION]
    for s in todo[:limit]:
        if time.monotonic() - t0 > budget_s:
            break
        sid = s["id"]
        try:
            dd = boe.parse_docs(fetcher.get(boe.detail_url(sid, 1)), boe.detail_url(sid, 1))
            s["documentos"], s["docs_login"] = dd["documentos"], dd["docs_login"]
            if s.get("categoria") in ("vehiculo", "vivienda", "embarcacion"):
                assets = boe.parse_assets(fetcher.get(boe.detail_url(sid, 3)))
                if assets:
                    s["bienes"] = assets
            s["v"] = DETAIL_VERSION
            n += 1
        except Exception as e:  # noqa: BLE001
            log(f"  дозагрузка {sid}: {e!r}")
    log(f"дозагрузка новых полей: {n} (осталось {max(0, len(todo) - n)})")
    return n


_SAMPLED = set()


def _sample(sid: str, tab: str, html: str) -> None:
    """Сохраняет одну карточку за запуск — чтобы можно было проверить разметку BOE."""
    if tab in _SAMPLED:
        return
    _SAMPLED.add(tab)
    (DATA_FILE.parent / f"debug_detail_{tab}.html").write_text(html, "utf-8")


def refresh_states(db: dict[str, dict], now: datetime) -> None:
    for s in db.values():
        if s.get("estado") in ("activa", "proxima"):
            s["estado"] = boe.status_code("", s.get("fecha_fin"), now) if s.get("fecha_fin") else s["estado"]
            if s["estado"] == "activa" and s.get("fecha_inicio"):
                try:
                    start = datetime.fromisoformat(s["fecha_inicio"])
                    if start.tzinfo is None:
                        start = start.astimezone()
                    if start > now:
                        s["estado"] = "proxima"
                except ValueError:
                    pass


def prune(db: dict[str, dict], now: datetime) -> None:
    limit = now - timedelta(days=KEEP_FINISHED_DAYS)
    for sid in list(db):
        s = db[sid]
        if s.get("estado") in ("finalizada", "cancelada", "suspendida"):
            ref = s.get("fecha_fin") or s.get("detectada")
            try:
                d = datetime.fromisoformat(ref)
                if d.tzinfo is None:
                    d = d.astimezone()
                if d < limit:
                    del db[sid]
            except (TypeError, ValueError):
                pass


def teaser_ids(items: list[dict]) -> set[str]:
    current = [s for s in items if s.get("estado") in ("activa", "proxima")]
    current.sort(key=lambda s: (s.get("detectada") or "", s.get("fecha_inicio") or ""), reverse=True)
    return {s["id"] for s in current[:TEASER_COUNT]}


def write_outputs(db: dict[str, dict], new_ids: list[str], now: datetime,
                  removed: set[str] | None = None) -> None:
    items = sorted(db.values(), key=lambda s: s.get("detectada", ""), reverse=True)
    teasers = teaser_ids(items)
    counts: dict[str, int] = {}
    cat_counts: dict[str, int] = {}
    for s in items:
        counts[s["estado"]] = counts.get(s["estado"], 0) + 1
        if s["estado"] in ("activa", "proxima"):
            cat_counts[s["categoria"]] = cat_counts.get(s["categoria"], 0) + 1
    DATA_FILE.parent.mkdir(parents=True, exist_ok=True)

    if STORE:
        STORE.upsert(items, teasers)
        if removed:
            STORE.delete(sorted(removed))
        log(f"Supabase: записано {len(items)}, удалено {len(removed or [])}")
        # полный список больше не лежит в открытом доступе
        if DATA_FILE.exists():
            DATA_FILE.unlink()
    else:
        for s in items:
            s["teaser"] = s["id"] in teasers
        DATA_FILE.write_text(json.dumps({"generado": now.isoformat(), "subastas": items},
                                        ensure_ascii=False, separators=(",", ":")), "utf-8")

    meta = {
        "actualizado": now.isoformat(),
        "total": len(items),
        "actuales": counts.get("activa", 0) + counts.get("proxima", 0),
        "nuevas_ultima_ejecucion": len(new_ids),
        "por_estado": counts,
        "por_categoria": cat_counts,
        "fuente": "Agencia Estatal Boletín Oficial del Estado — https://subastas.boe.es",
    }
    META_FILE.write_text(json.dumps(meta, ensure_ascii=False, indent=2), "utf-8")
    write_feed(items[:100], now)


def site_link(s: dict) -> str:
    return f"{SITE_URL}/#/s/{s['id']}" if SITE_URL else ""


def place(s: dict) -> str:
    def t(x):
        return (x or "").strip().title()
    loc, prov = t(s.get("localidad")), t((s.get("provincia") or "").split("/")[0])
    return ", ".join(v for i, v in enumerate([loc, prov]) if v and (i == 0 or v != loc)) or "España"


def fmt_eur(v):
    if v is None:
        return "—"
    return f"{v:,.0f} €".replace(",", ".")


def write_feed(items: list[dict], now: datetime) -> None:
    """RSS-анонсы: тип, место, цена, срок. Без адреса, описания и ссылки на BOE."""
    link = SITE_URL or "https://subastas.boe.es"
    out = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<rss version="2.0"><channel>',
        f"<title>{escape(SITE_NAME)} — nuevas subastas en España</title>",
        f"<link>{escape(link)}</link>",
        "<description>Avisos de nuevas subastas públicas. Detalles completos en la web tras iniciar sesión.</description>",
        "<language>es</language>",
        f"<lastBuildDate>{format_datetime(now)}</lastBuildDate>",
    ]
    for s in items:
        cat = CAT_ES.get(s.get("categoria"), "Subasta")
        title = f"{cat} · {place(s)} · {fmt_eur(s.get('valor_subasta'))}"
        end = (s.get("fecha_fin") or "")[:10]
        desc = (f"{cat} en {place(s)}. Valor de subasta: {fmt_eur(s.get('valor_subasta'))}. "
                f"Depósito: {fmt_eur(s.get('deposito'))}. Fin: {end or '—'}. "
                f"Detalles completos en {SITE_NAME}.")
        try:
            pub = format_datetime(datetime.fromisoformat(s["detectada"]))
        except (KeyError, ValueError):
            pub = format_datetime(now)
        out.append(
            f"<item><title>{escape(title)}</title><link>{escape(site_link(s) or link)}</link>"
            f"<guid isPermaLink=\"false\">{s['id']}</guid><pubDate>{pub}</pubDate>"
            f"<category>{escape(cat)}</category>"
            f"<description>{escape(desc)}</description></item>"
        )
    out.append("</channel></rss>")
    FEED_FILE.write_text("\n".join(out), "utf-8")


def post_telegram(items: list[dict]) -> None:
    token = os.environ.get("TELEGRAM_BOT_TOKEN")
    chat = os.environ.get("TELEGRAM_CHAT_ID")
    if not token or not chat or not items:
        return
    limit = int(os.environ.get("TELEGRAM_MAX_POSTS", "20"))
    for s in items[:limit]:
        cat = CAT_ES.get(s.get("categoria"), "Subasta")
        page = site_link(s)
        text = (
            f"🔨 <b>{escape(cat)}</b> · {escape(place(s))}\n\n"
            f"💶 Valor subasta: <b>{fmt_eur(s.get('valor_subasta'))}</b>\n"
            f"🔐 Depósito: {fmt_eur(s.get('deposito'))}\n"
            f"⏳ Fin: {(s.get('fecha_fin') or '—')[:10]}\n"
            + (f"\n<a href=\"{escape(page)}\">Ver detalles en {escape(SITE_NAME)}</a>" if page else "")
        )
        data = urllib.parse.urlencode({
            "chat_id": chat, "text": text, "parse_mode": "HTML",
            "disable_web_page_preview": "true",
        }).encode()
        try:
            urllib.request.urlopen(f"https://api.telegram.org/bot{token}/sendMessage", data, timeout=20).read()
        except Exception as e:  # noqa: BLE001
            log("Telegram:", repr(e))
        time.sleep(1.5)
    log(f"Telegram: отправлено {min(len(items), limit)}")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--max-pages", type=int, default=int(os.environ.get("MAX_PAGES", "80")))
    ap.add_argument("--max-new", type=int, default=int(os.environ.get("MAX_NEW", "300")))
    args = ap.parse_args()

    now = datetime.now(timezone.utc)
    db = load_db()
    first_run = not db
    log(f"в базе {len(db)} аукционов")

    for f in DATA_FILE.parent.glob("debug_*.html"):  # отладка прошлого запуска
        f.unlink()
    fetcher = Fetcher()
    listing = collect_listing(fetcher, set(db), args.max_pages)
    new = [l for l in listing if l["id"] not in db][: args.max_new]
    log(f"новых к загрузке: {len(new)}")

    new_ids = []
    for n, item in enumerate(new, 1):
        try:
            rec = fetch_detail(fetcher, item)
        except Exception as e:  # noqa: BLE001
            log(f"  пропуск {item['id']}: {e!r}")
            continue
        rec["detectada"] = now.isoformat()
        db[rec["id"]] = rec
        new_ids.append(rec["id"])
        if n % 20 == 0:
            log(f"  загружено {n}/{len(new)}")

    # Seguridad Social: отдельный каталог TGSS (на портале BOE этих аукционов нет)
    if os.environ.get("TGSS", "1") == "1":
        had_tgss = any(s.get("fuente") == "tgss" for s in db.values())
        try:
            recs, seen, complete = tgss.collect(Fetcher(delay=float(os.environ.get("TGSS_DELAY", "4"))), set(db), int(os.environ.get("TGSS_MAX", "400")), log)
            for r in recs:
                db[r["id"]] = r
                if had_tgss:  # первый сбор не считаем «новинками», чтобы не засыпать ленту и Telegram
                    new_ids.append(r["id"])
            if complete:  # объект пропал из каталога до даты торгов — сняли с аукциона
                for s in db.values():
                    if s.get("fuente") == "tgss" and s.get("estado") in ("activa", "proxima") and s["id"] not in seen:
                        s["estado"] = "cancelada"
        except Exception as e:  # noqa: BLE001 — TGSS не должен ломать основной сбор
            log(f"TGSS: ошибка {e!r}")

    backfill(fetcher, db, int(os.environ.get("BACKFILL", "300")), 20 * 60)
    try:
        prices = enrich_mod.load_prices(SITE / "data" / "precios_m2.json")
        enrich_mod.enrich(fetcher, db, prices, float(os.environ.get("ENRICH_MIN", "15")) * 60, log)
    except Exception as e:  # noqa: BLE001 — обогащение не должно ломать основной сбор
        log(f"обогащение: ошибка {e!r}")
    before = set(db)
    refresh_states(db, now)
    prune(db, now)
    write_outputs(db, new_ids, now, removed=before - set(db))
    log(f"готово: всего {len(db)}, новых {len(new_ids)}, запросов {fetcher.count}")

    # При первом запуске не засыпаем канал сотнями сообщений
    if not first_run:
        post_telegram([db[i] for i in new_ids if i in db])
    return 0


if __name__ == "__main__":
    sys.exit(main())
