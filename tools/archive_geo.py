"""Координаты архивных лотов по кадастровому номеру — чтобы у завершённых аукционов
тоже была панорама Street View в окне аукциона.

Пишет координаты в таблицу Supabase archivo_geo (читать её может только тариф Про — как и точное
место у текущих лотов). Сайт подмешивает их к архиву.
Запуск после history.py, с лимитом запросов к Catastro:  python tools/archive_geo.py [--max 800]
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
import time
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scraper"))
from enrich import CAT_CPMRC  # noqa: E402
from scrape import Fetcher  # noqa: E402

HIST = ROOT / "site" / "data" / "historico"
URL = os.environ.get("SUPABASE_URL", "https://jkxvxdhmothlamhotecu.supabase.co").rstrip("/")
KEY = os.environ.get("SUPABASE_SERVICE_KEY", "")
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


def rest(method: str, path: str, body=None, prefer: str = ""):
    h = {"apikey": KEY, "Authorization": f"Bearer {KEY}", "Content-Type": "application/json"}
    if prefer:
        h["Prefer"] = prefer
    req = urllib.request.Request(f"{URL}/rest/v1/{path}", data=json.dumps(body).encode() if body is not None else None, method=method, headers=h)
    with urllib.request.urlopen(req, timeout=60) as r:
        raw = r.read()
    return json.loads(raw) if raw else None


def known_ids() -> set[str]:
    out, off = set(), 0
    while True:
        rows = rest("GET", f"archivo_geo?select=id&order=id&limit=1000&offset={off}") or []
        out |= {r["id"] for r in rows}
        if len(rows) < 1000:
            return out
        off += 1000


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--max", type=int, default=int(os.environ.get("ARCHIVE_GEO_MAX", "800")))
    args = ap.parse_args()
    if not KEY:
        print("archive_geo: нет SUPABASE_SERVICE_KEY")
        return 0
    geo, tried = known_ids(), set(load(TRIED, []))
    found: list[dict] = []
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
            found.append({"id": sid, "lat": c[0], "lon": c[1]})
            got += 1
        elif c == []:          # Catastro ответил, но координат нет — больше не спрашиваем
            tried.add(sid)
            miss += 1
    for i in range(0, len(found), 500):
        rest("POST", "archivo_geo?on_conflict=id", found[i:i + 500], "resolution=merge-duplicates,return=minimal")
    TRIED.parent.mkdir(exist_ok=True)
    TRIED.write_text(json.dumps(sorted(tried)), "utf-8")
    print(f"archive_geo: в очереди {len(todo)}, найдено {got}, без координат {miss}, всего с координатами {len(geo) + got}, {time.monotonic() - t0:.0f} с")
    return 0


if __name__ == "__main__":
    sys.exit(main())
