#!/usr/bin/env python3
"""
Архив завершённых аукционов BOE.

Идёт по месяцам даты окончания — от текущего назад на HISTORY_MONTHS месяцев —
и собирает аукционы в статусах:
  PC — Concluida en Portal de Subastas (торги прошли),
  FS — Finalizada por Autoridad Gestora (закрыт, депозиты возвращены),
  CA — Cancelada.

Портал отказывает на слишком широкий запрос («resultados excesivo»),
поэтому период делится пополам, пока ответ не станет допустимым.

Для каждого нового аукциона качаются вкладки ver=1 (общие), ver=3 (имущество)
и ver=5 (итоговая ставка). Записи хранятся компактно, по месяцам:
  site/data/historico/AAAA-MM.json   — аукционы месяца
  site/data/historico/index.json     — список месяцев, счётчики, отметки «готово»

Работает с лимитом времени (--budget-min), продолжает с того же места
в следующий запуск. Текущий и прошлый месяц перепроверяются каждый раз.

Запуск:  python scraper/history.py [--months 12] [--budget-min 170]
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import time
import urllib.parse
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import boe  # noqa: E402
from scrape import Fetcher, log, SITE  # noqa: E402

HIST_DIR = SITE / "data" / "historico"
INDEX_FILE = HIST_DIR / "index.json"
STATES = {"PC": "finalizada", "FS": "finalizada", "CA": "cancelada"}
SAVE_EVERY = 50


# ------------------------------------------------------------- периоды

def month_range(ym: str) -> tuple[date, date]:
    y, m = map(int, ym.split("-"))
    start = date(y, m, 1)
    end = (date(y + (m == 12), m % 12 + 1, 1) - timedelta(days=1))
    return start, end


def months_back(today: date, n: int) -> list[str]:
    out, y, m = [], today.year, today.month
    for _ in range(n):
        out.append(f"{y:04d}-{m:02d}")
        y, m = (y - 1, 12) if m == 1 else (y, m - 1)
    return out


# ------------------------------------------------------------- поиск

class Search:
    def __init__(self, fetcher: Fetcher):
        self.f = fetcher
        self.form_html = fetcher.get(boe.BASE + "subastas_ava.php")
        self.form_url = fetcher.last_url or boe.BASE + "subastas_ava.php"

    def _submit(self, state: str, d1: date, d2: date) -> tuple[str, str]:
        form = boe.parse_search_form(self.form_html, self.form_url, state)
        if not form:
            raise RuntimeError(f"форма не принимает статус {state}")
        extra = {"dato[17][0]": d1.isoformat(), "dato[17][1]": d2.isoformat(),
                 "sort_field[0]": "SUBASTA.FECHA_FIN", "sort_order[0]": "desc"}
        fields = [(k, v) for k, v in form["fields"] if k not in extra] + list(extra.items())
        body = urllib.parse.urlencode(fields).encode()
        return self.f.get(form["url"], data=body), form["url"]

    def listing(self, state: str, d1: date, d2: date, depth: int = 0) -> list[dict]:
        """Все аукционы статуса state с датой окончания в [d1, d2]."""
        html, url = self._submit(state, d1, d2)
        err = boe.page_error(html)
        if "excesivo" in html.lower() or ("excesivo" in err.lower()):
            if d1 >= d2 or depth > 8:
                log(f"  [{state}] {d1}: слишком много даже за день — пропуск")
                return []
            mid = d1 + (d2 - d1) // 2
            return self.listing(state, d1, mid, depth + 1) + self.listing(state, mid + timedelta(days=1), d2, depth + 1)
        found: dict[str, dict] = {}
        seen = {url}
        for _ in range(40):
            items, nexts = boe.parse_search_page(html, url)
            fresh = [i for i in items if i["id"] not in found]
            for i in items:
                found.setdefault(i["id"], i)
            if not fresh:
                break
            nexts = [n for n in nexts if n not in seen]
            if not nexts:
                break
            url = nexts[0]
            seen.add(url)
            html = self.f.get(url)
        return list(found.values())


# ------------------------------------------------------------- запись

def compact(rec: dict, bids: dict, state: str, photos: list[str]) -> dict:
    """Компактная запись для архива: только то, что показывает сайт."""
    a = (rec.get("bienes") or [{}])[0]
    asset = {k: v for k, v in {
        "descripcion": (a.get("descripcion") or "")[:220],
        "direccion": a.get("direccion", ""), "cp": a.get("cp", ""),
        "localidad": a.get("localidad", ""), "provincia": a.get("provincia", ""),
        "ref_catastral": a.get("ref_catastral", ""),
        "situacion_posesoria": a.get("situacion_posesoria", ""),
        "visitable": a.get("visitable", ""), "cargas": (a.get("cargas") or "")[:160],
    }.items() if v}
    out = {
        "id": rec["id"], "url": rec["url"], "origen": rec["origen"], "categoria": rec["categoria"],
        "provincia": rec["provincia"], "localidad": rec["localidad"], "cp": rec.get("cp", ""),
        "direccion": rec.get("direccion", ""),
        "valor_subasta": rec.get("valor_subasta"), "tasacion": rec.get("tasacion"),
        "deposito": rec.get("deposito"), "puja_minima": rec.get("puja_minima"),
        "fecha_inicio": rec.get("fecha_inicio"), "fecha_fin": rec.get("fecha_fin"),
        "estado": STATES[state], "estado_boe": state,
        "puja_maxima": bids.get("puja_maxima"), "sin_pujas": bids.get("sin_pujas", False),
        "autoridad": rec.get("autoridad", ""), "lotes": rec.get("lotes", ""),
        "bienes": [asset] if asset else [],
        "historico": True,
    }
    if bids.get("pujas_lotes"):
        out["pujas_lotes"] = bids["pujas_lotes"]
    if photos:
        out["fotos"] = photos[:1]
    return {k: v for k, v in out.items() if v not in (None, "", [])} | {"sin_pujas": out["sin_pujas"]}


def fetch_one(f: Fetcher, listing: dict, state: str) -> dict:
    sid = listing["id"]
    general = boe.parse_general(f.get(boe.detail_url(sid, 1)))
    html3 = f.get(boe.detail_url(sid, 3))
    assets = boe.parse_assets(html3)
    photos, _ = boe.parse_media(html3, boe.detail_url(sid, 3))
    bids = boe.parse_bids(f.get(boe.detail_url(sid, 5)))
    rec = boe.build_record(listing, general, {}, assets)
    return compact(rec, bids, state, photos)


def load_json(p: Path, default):
    try:
        return json.loads(p.read_text("utf-8"))
    except (OSError, ValueError):
        return default


def save_month(ym: str, items: dict[str, dict]) -> None:
    HIST_DIR.mkdir(parents=True, exist_ok=True)
    rows = sorted(items.values(), key=lambda s: s.get("fecha_fin") or "", reverse=True)
    (HIST_DIR / f"{ym}.json").write_text(
        json.dumps({"mes": ym, "subastas": rows}, ensure_ascii=False, separators=(",", ":")), "utf-8")


def save_index(index: dict) -> None:
    HIST_DIR.mkdir(parents=True, exist_ok=True)
    index["actualizado"] = datetime.now(timezone.utc).isoformat()
    months = index["meses"]
    index["total"] = sum(m.get("count", 0) for m in months.values())
    INDEX_FILE.write_text(json.dumps(index, ensure_ascii=False, indent=1), "utf-8")


# ------------------------------------------------------------- запуск

def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--months", type=int, default=int(os.environ.get("HISTORY_MONTHS", "12")))
    ap.add_argument("--budget-min", type=float, default=float(os.environ.get("HISTORY_BUDGET_MIN", "170")))
    ap.add_argument("--max-new", type=int, default=100000)
    args = ap.parse_args()

    t0 = time.monotonic()
    deadline = t0 + args.budget_min * 60
    today = datetime.now(timezone.utc).date()
    index = load_json(INDEX_FILE, {"meses": {}})
    index.setdefault("meses", {})
    index["desde"] = months_back(today, args.months)[-1]
    f = Fetcher()
    search = Search(f)
    fetched = 0
    recent = set(months_back(today, 2))

    for ym in months_back(today, args.months):
        info = index["meses"].setdefault(ym, {"count": 0, "done": False})
        if info.get("done") and ym not in recent:
            continue
        if time.monotonic() > deadline or fetched >= args.max_new:
            break
        d1, d2 = month_range(ym)
        d2 = min(d2, today)
        items = {s["id"]: s for s in load_json(HIST_DIR / f"{ym}.json", {}).get("subastas", [])}
        todo = []
        for state in STATES:
            lst = search.listing(state, d1, d2)
            log(f"[{ym}] {state}: {len(lst)} в списке")
            for l in lst:
                old = items.get(l["id"])
                # перепроверяем «Concluida», если позже он стал FS/CA — карточка та же, меняем только статус
                if old:
                    if old.get("estado_boe") != state and state != "PC":
                        old["estado_boe"], old["estado"] = state, STATES[state]
                    continue
                todo.append((l, state))
        seen_ids, uniq = set(), []
        for l, st in todo:  # один аукцион может быть в двух статусах — берём последний по приоритету
            if l["id"] not in seen_ids:
                seen_ids.add(l["id"])
                uniq.append((l, st))
        log(f"[{ym}] в архиве {len(items)}, догрузить {len(uniq)}")
        complete = True
        for n, (l, st) in enumerate(uniq, 1):
            if time.monotonic() > deadline or fetched >= args.max_new:
                complete = False
                break
            try:
                items[l["id"]] = fetch_one(f, l, st)
                fetched += 1
            except Exception as e:  # noqa: BLE001
                log(f"  пропуск {l['id']}: {e!r}")
                continue
            if n % SAVE_EVERY == 0:
                save_month(ym, items)
                info["count"] = len(items)
                save_index(index)
                log(f"  [{ym}] {n}/{len(uniq)} · {(time.monotonic() - t0) / 60:.0f} мин")
        save_month(ym, items)
        info["count"] = len(items)
        info["done"] = complete
        save_index(index)
        if not complete:
            break

    save_index(index)
    left = [m for m, i in index["meses"].items() if not i.get("done")]
    log(f"готово: загружено {fetched}, в архиве {index['total']}, запросов {f.count}, "
        f"незаконченных месяцев {len(left)}, {(time.monotonic() - t0) / 60:.0f} мин")
    return 0


if __name__ == "__main__":
    sys.exit(main())
