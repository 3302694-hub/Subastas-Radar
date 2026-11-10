"""Почтовые оповещения: после обновления подбирает новые аукционы под каждое активное оповещение
и передаёт их функции Supabase «alertas», которая отправляет письма (ключ Resend хранится только там).

Запуск на сервере после scrape.py:  python scraper/alerts.py   (--dry — только показать, без писем)
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
import unicodedata
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
URL = os.environ.get("SUPABASE_URL", "https://jkxvxdhmothlamhotecu.supabase.co").rstrip("/")
KEY = os.environ.get("SUPABASE_SERVICE_KEY", "")
SITE = os.environ.get("SITE_URL", "https://subastica.es").rstrip("/")
MAX_ITEMS = 8

GROUPS = {
    "vivienda": {"vivienda", "inmueble"},
    "g_garaje": {"garaje", "trastero"},
    "g_local": {"local", "nave"},
    "g_terreno": {"solar", "rustica"},
}


# ---------- провинции: те же ключи, что у сайта (site/assets/provinces.js)
def _strip(s: str) -> str:
    s = unicodedata.normalize("NFD", s or "")
    return "".join(c for c in s if unicodedata.category(c) != "Mn").upper().strip()


def _load_provinces() -> tuple[dict, dict]:
    js = (ROOT / "site" / "assets" / "provinces.js").read_text("utf-8")
    keys = re.findall(r'"([^"]+)":\s*\[', js)
    alias_block = js[js.index("const alias"):js.index("};", js.index("const alias"))]
    alias = dict(re.findall(r'"([^"]+)":\s*"([^"]+)"', alias_block))
    return {_strip(k): k for k in keys}, alias


_BY_KEY, _ALIAS = _load_provinces()


def norm_province(name: str) -> str:
    s = _strip(name)
    if not s:
        return ""
    if s in _BY_KEY:
        return _BY_KEY[s]
    if s in _ALIAS:
        return _ALIAS[s]
    parts = [p.strip() for p in s.split("/")]
    for p in parts:
        if p in _BY_KEY:
            return _BY_KEY[p]
        if p in _ALIAS:
            return _ALIAS[p]
    return (name or "").upper()


# ---------- отбор
def matches(alert: dict, s: dict) -> bool:
    if s.get("estado") not in ("activa", "proxima") or s.get("historico"):
        return False
    if (s.get("detectada") or "") <= (alert.get("last_sent") or ""):
        return False
    if alert.get("provincia") and norm_province(s.get("provincia", "")) != alert["provincia"]:
        return False
    cat = alert.get("categoria")
    if cat == "oculta" and not s.get("oculta"):
        return False
    if cat in GROUPS and not (s.get("categoria") in GROUPS[cat] or (cat == "vivienda" and s.get("oculta"))):
        return False
    mx = alert.get("max_valor")
    if mx not in (None, ""):
        v = s.get("valor_subasta")
        if v is None or float(v) > float(mx):
            return False
    return True


def site_url(alert: dict) -> str:
    q = {"fresh": "3"}
    if alert.get("provincia"):
        q["prov"] = alert["provincia"]
    if alert.get("categoria"):
        q["cat"] = alert["categoria"]
    if alert.get("max_valor"):
        q["max"] = str(int(float(alert["max_valor"])))
    return f"{SITE}/?{urllib.parse.urlencode(q)}"


def _ts(s: str) -> str:
    """Время в одном формате, чтобы строки сравнивались как даты."""
    from datetime import datetime, timezone
    try:
        return datetime.fromisoformat(s.replace("Z", "+00:00")).astimezone(timezone.utc).isoformat()
    except (ValueError, AttributeError):
        return ""


def build(alerts: list[dict], subastas: list[dict]) -> list[dict]:
    for s in subastas:
        s["detectada"] = _ts(s.get("detectada") or "")
    envios = []
    for a in alerts:
        a = dict(a, last_sent=_ts(a.get("last_sent") or ""))
        hits = sorted((s for s in subastas if matches(a, s)), key=lambda s: s["detectada"], reverse=True)
        if not hits:
            continue
        items = [{k: s.get(k) for k in ("id", "categoria", "oculta", "localidad", "provincia", "valor_subasta", "fecha_fin")}
                 for s in hits[:MAX_ITEMS]]
        envios.append({"alerta_id": a["id"], "total": len(hits), "url": site_url(a), "items": items})
    return envios


# ---------- Supabase
def _req(method: str, path: str, body=None, timeout=60):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(URL + path, data=data, method=method, headers={
        "apikey": KEY, "Authorization": f"Bearer {KEY}", "Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read() or b"null")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry", action="store_true", help="не отправлять письма, только показать")
    args = ap.parse_args()
    if not KEY:
        print("alerts: нет SUPABASE_SERVICE_KEY")
        return 0
    try:
        alerts = _req("GET", "/rest/v1/alertas?activa=eq.true&select=id,provincia,categoria,max_valor,last_sent")
    except Exception as e:  # noqa: BLE001 — таблицы ещё нет или сеть: основное обновление не ломаем
        print(f"alerts: не удалось прочитать оповещения: {e!r}")
        return 0
    if not alerts:
        print("alerts: активных оповещений нет")
        return 0
    since = min(_ts(a["last_sent"]) for a in alerts)
    q = urllib.parse.quote(since)
    subastas, off = [], 0
    while True:
        rows = _req("GET", f"/rest/v1/subastas?select=data&data->>detectada=gt.{q}&order=id&limit=1000&offset={off}")
        subastas += [r["data"] for r in rows]
        if len(rows) < 1000:
            break
        off += 1000
    envios = build(alerts, subastas)
    print(f"alerts: оповещений {len(alerts)}, новых аукционов {len(subastas)}, писем к отправке {len(envios)}")
    if not envios:
        return 0
    res = _req("POST", "/functions/v1/alertas", {"envios": envios, "dry": args.dry}, timeout=300)
    print("alerts:", json.dumps(res.get("result", res), ensure_ascii=False)[:500])
    return 0


if __name__ == "__main__":
    sys.exit(main())
