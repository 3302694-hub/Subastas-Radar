"""Координаты архивных лотов по кадастровому номеру — чтобы у завершённых аукционов
тоже была панорама Street View в окне аукциона.

Пишет site/data/historico/geo.json: {"SUB-...": [lat, lon], ...}. Сайт подмешивает его к архиву
(точное место видно только в тарифе Про, как и у текущих лотов).
Запуск после history.py, с лимитом запросов к Catastro:  python tools/archive_geo.py [--max 800]
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scraper"))
from enrich import CAT_CPMRC  # noqa: E402
from scrape import Fetcher  # noqa: E402

HIST = ROOT / "site" / "data" / "historico"
GEO = HIST / "geo.json"
TRIED = ROOT / ".cache" / "archive_geo_tried.json"   # номера, по которым Catastro координат не дал
BUILDINGS = {"vivienda", "local", "nave", "garaje", "trastero", "inmueble", "solar", "rustica"}  # вся недвижимость, включая участки и землю


def load(p: Path, default):
    try:
        return json.loads(p.read_text("utf-8"))
    except (OSError, ValueError):
        return default


def ref(s: dict) -> str:
    for b in s.get("bienes") or []:
        rc = re.sub(r"[^0-9A-Za-z]", "", b.get("ref_catastral") or "").upper()
        if len(rc) >= 14:
            return rc[:14]
    return ""


def coords(fetcher: Fetcher, rc14: str) -> list[float] | None:
    try:
        j = json.loads(fetcher.get(CAT_CPMRC.format(rc=rc14)))
        c = (((j.get("Consulta_CPMRCResult") or {}).get("coordenadas") or {}).get("coord") or [])
        if c:
            g = c[0].get("geo") or {}
            lat, lon = round(float(g["ycen"]), 6), round(float(g["xcen"]), 6)
            if 27 < lat < 44.5 and -18.5 < lon < 4.6:   # Испания, включая Канары
                return [lat, lon]
    except Exception:  # noqa: BLE001 — Catastro иногда отвечает ошибкой, попробуем в другой раз
        return None
    return []


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--max", type=int, default=int(os.environ.get("ARCHIVE_GEO_MAX", "800")))
    args = ap.parse_args()
    geo, tried = load(GEO, {}), set(load(TRIED, []))
    todo = []
    for f in sorted(HIST.glob("20??-??.json"), reverse=True):    # сначала свежие месяцы
        for s in load(f, {}).get("subastas", []):
            if s.get("categoria") in BUILDINGS and s["id"] not in geo and s["id"] not in tried:
                rc = ref(s)
                if rc:
                    todo.append((s["id"], rc))
    fetcher = Fetcher(delay=float(os.environ.get("ARCHIVE_GEO_DELAY", "0.8")))
    got = miss = 0
    t0 = time.monotonic()
    for sid, rc in todo[:args.max]:
        c = coords(fetcher, rc)
        if c:
            geo[sid] = c
            got += 1
        elif c == []:          # Catastro ответил, но координат нет — больше не спрашиваем
            tried.add(sid)
            miss += 1
    GEO.write_text(json.dumps(geo, separators=(",", ":")), "utf-8")
    TRIED.parent.mkdir(exist_ok=True)
    TRIED.write_text(json.dumps(sorted(tried)), "utf-8")
    print(f"archive_geo: в очереди {len(todo)}, найдено {got}, без координат {miss}, всего с координатами {len(geo)}, {time.monotonic() - t0:.0f} с")
    return 0


if __name__ == "__main__":
    sys.exit(main())
