#!/usr/bin/env python3
"""
Сборщик новых аукционов с Портала аукционов BOE.

Что делает за один запуск:
  1. Ищет аукционы в статусах «Celebrándose» и «Próxima apertura»,
     отсортированные по дате начала (сначала новые).
  2. Для каждого незнакомого ID скачивает карточку (общие данные,
     орган, имущество) и добавляет в базу site/data/subastas.json.
  3. Обновляет статусы ранее найденных аукционов (по дате окончания),
     удаляет завершённые старше KEEP_FINISHED_DAYS дней.
  4. Пишет RSS-ленту site/feed.xml и site/data/meta.json.
  5. Если заданы TELEGRAM_BOT_TOKEN и TELEGRAM_CHAT_ID — публикует новые
     аукционы в Telegram-канал.

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

ROOT = Path(__file__).resolve().parent.parent
SITE = ROOT / "site"
DATA_FILE = SITE / "data" / "subastas.json"
META_FILE = SITE / "data" / "meta.json"
FEED_FILE = SITE / "feed.xml"

SITE_URL = os.environ.get("SITE_URL", "").rstrip("/")
SITE_NAME = os.environ.get("SITE_NAME", "SubastaRadar")
USER_AGENT = os.environ.get(
    "SCRAPER_USER_AGENT",
    f"{SITE_NAME}/1.0 (agregador de subastas publicas; +{SITE_URL or 'https://github.com'})",
)
DELAY = float(os.environ.get("SCRAPER_DELAY", "1.2"))  # пауза между запросами, сек
KEEP_FINISHED_DAYS = int(os.environ.get("KEEP_FINISHED_DAYS", "30"))
STATES = os.environ.get("SCRAPER_STATES", "EJ,PU").split(",")  # EJ=celebrándose, PU=próxima apertura


def log(*a):
    print(datetime.now().strftime("%H:%M:%S"), *a, flush=True)


class Fetcher:
    def __init__(self, delay: float = DELAY):
        self.delay = delay
        self.last = 0.0
        self.opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor())
        self.count = 0

    def get(self, url: str, retries: int = 3) -> str:
        for attempt in range(retries):
            wait = self.delay - (time.time() - self.last)
            if wait > 0:
                time.sleep(wait)
            self.last = time.time()
            req = urllib.request.Request(url, headers={
                "User-Agent": USER_AGENT,
                "Accept-Language": "es-ES,es;q=0.9",
            })
            try:
                with self.opener.open(req, timeout=30) as r:
                    raw = r.read()
                    self.count += 1
                    charset = r.headers.get_content_charset() or "utf-8"
                    return raw.decode(charset, errors="replace")
            except Exception as e:  # noqa: BLE001
                log(f"  ошибка {e!r} ({attempt + 1}/{retries}) {url}")
                time.sleep(3 * (attempt + 1))
        raise RuntimeError(f"не удалось скачать {url}")


def search_url(state: str) -> str:
    params = {
        "campo[2]": "SUBASTA.ESTADO",
        "dato[2]": state,
        "sort_field[0]": "SUBASTA.FECHA_INICIO",
        "sort_order[0]": "desc",
        "page_hits": "50",
        "accion": "Buscar",
    }
    return boe.BASE + "subastas_ava.php?" + urllib.parse.urlencode(params)


def load_db() -> dict[str, dict]:
    if DATA_FILE.exists():
        payload = json.loads(DATA_FILE.read_text("utf-8"))
        items = payload.get("subastas", payload) if isinstance(payload, dict) else payload
        if isinstance(payload, dict) and payload.get("demo"):
            log("в базе демо-данные — начинаем с чистой базы")
            return {}
        return {s["id"]: s for s in items}
    return {}


def collect_listing(fetcher: Fetcher, known: set[str], max_pages: int) -> list[dict]:
    """Проходит страницы поиска. Останавливается, когда страница целиком из известных ID."""
    found: dict[str, dict] = {}
    for state in STATES:
        url = search_url(state.strip())
        seen_pages = set()
        for page in range(max_pages):
            if url in seen_pages:
                break
            seen_pages.add(url)
            html = fetcher.get(url)
            items, nexts = boe.parse_search_page(html, url)
            fresh = [i for i in items if i["id"] not in known and i["id"] not in found]
            for i in items:
                found.setdefault(i["id"], i)
            log(f"[{state}] стр.{page + 1}: {len(items)} шт., новых {len(fresh)}")
            if not items or (not fresh and page > 0):
                break
            nexts = [n for n in nexts if n not in seen_pages]
            if not nexts:
                break
            url = nexts[0] if len(nexts) == 1 else _pick_next(nexts, page)
    return list(found.values())


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
    general = boe.parse_general(fetcher.get(boe.detail_url(sid, 1)))
    try:
        authority = boe.parse_authority(fetcher.get(boe.detail_url(sid, 2)))
    except RuntimeError:
        authority = {}
    try:
        assets = boe.parse_assets(fetcher.get(boe.detail_url(sid, 3)))
    except RuntimeError:
        assets = []
    return boe.build_record(listing, general, authority, assets)


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


def write_outputs(db: dict[str, dict], new_ids: list[str], now: datetime) -> None:
    items = sorted(db.values(), key=lambda s: s.get("detectada", ""), reverse=True)
    DATA_FILE.parent.mkdir(parents=True, exist_ok=True)
    DATA_FILE.write_text(json.dumps({"generado": now.isoformat(), "subastas": items},
                                    ensure_ascii=False, separators=(",", ":")), "utf-8")
    counts: dict[str, int] = {}
    for s in items:
        counts[s["estado"]] = counts.get(s["estado"], 0) + 1
    meta = {
        "actualizado": now.isoformat(),
        "total": len(items),
        "nuevas_ultima_ejecucion": len(new_ids),
        "por_estado": counts,
        "fuente": "Agencia Estatal Boletín Oficial del Estado — https://subastas.boe.es",
    }
    META_FILE.write_text(json.dumps(meta, ensure_ascii=False, indent=2), "utf-8")
    write_feed(items[:100], now)


def fmt_eur(v):
    if v is None:
        return "—"
    return f"{v:,.0f} €".replace(",", ".")


def write_feed(items: list[dict], now: datetime) -> None:
    link = SITE_URL or "https://subastas.boe.es"
    out = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<rss version="2.0"><channel>',
        f"<title>{escape(SITE_NAME)} — nuevas subastas en España</title>",
        f"<link>{escape(link)}</link>",
        "<description>Nuevas subastas públicas publicadas en el Portal de Subastas del BOE</description>",
        "<language>es</language>",
        f"<lastBuildDate>{format_datetime(now)}</lastBuildDate>",
    ]
    for s in items:
        title = f"{s.get('localidad') or s.get('provincia') or ''} · {s['titulo'][:90]} · {fmt_eur(s.get('valor_subasta'))}"
        desc = (f"{s.get('tipo','')} | Valor: {fmt_eur(s.get('valor_subasta'))} | "
                f"Depósito: {fmt_eur(s.get('deposito'))} | Fin: {s.get('fecha_fin') or '—'} | {s['titulo']}")
        try:
            pub = format_datetime(datetime.fromisoformat(s["detectada"]))
        except (KeyError, ValueError):
            pub = format_datetime(now)
        page = f"{SITE_URL}/#/s/{s['id']}" if SITE_URL else s["url"]
        out.append(
            f"<item><title>{escape(title)}</title><link>{escape(page)}</link>"
            f"<guid isPermaLink=\"false\">{s['id']}</guid><pubDate>{pub}</pubDate>"
            f"<category>{escape(s.get('categoria',''))}</category>"
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
        page = f"{SITE_URL}/#/s/{s['id']}" if SITE_URL else s["url"]
        text = (
            f"🔨 <b>{escape(s.get('localidad') or s.get('provincia') or 'España')}</b> · {escape(s.get('categoria',''))}\n"
            f"{escape(s['titulo'][:300])}\n\n"
            f"💶 Valor subasta: <b>{fmt_eur(s.get('valor_subasta'))}</b>\n"
            f"🏷 Tasación: {fmt_eur(s.get('tasacion'))} · Depósito: {fmt_eur(s.get('deposito'))}\n"
            f"⏳ Fin: {(s.get('fecha_fin') or '—')[:16].replace('T', ' ')}\n"
            f"🆔 {s['id']}\n<a href=\"{escape(page)}\">Ver subasta</a>"
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
    ap.add_argument("--max-pages", type=int, default=int(os.environ.get("MAX_PAGES", "10")))
    ap.add_argument("--max-new", type=int, default=int(os.environ.get("MAX_NEW", "300")))
    args = ap.parse_args()

    now = datetime.now(timezone.utc)
    db = load_db()
    first_run = not db
    log(f"в базе {len(db)} аукционов")

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

    refresh_states(db, now)
    prune(db, now)
    write_outputs(db, new_ids, now)
    log(f"готово: всего {len(db)}, новых {len(new_ids)}, запросов {fetcher.count}")

    # При первом запуске не засыпаем канал сотнями сообщений
    if not first_run:
        post_telegram([db[i] for i in new_ids if i in db])
    return 0


if __name__ == "__main__":
    sys.exit(main())
