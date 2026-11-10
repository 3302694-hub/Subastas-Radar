"""Статистика для страницы estadisticas.html: считается на сервере из архива завершённых
аукционов (site/data/historico) и сводки по открытым (site/data/meta.json).

python tools/stats.py   →   site/data/stats.json
"""
from __future__ import annotations

import json
import statistics
import sys
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scraper"))
from alerts import norm_province  # noqa: E402  — те же ключи провинций, что на сайте

DATA = ROOT / "site" / "data"
GROUP = {"vivienda": "vivienda", "inmueble": "vivienda", "garaje": "g_garaje", "trastero": "g_garaje",
         "local": "g_local", "nave": "g_local", "solar": "g_terreno", "rustica": "g_terreno"}
MIN_N = 15  # меньше — доли и медианы слишком шумные, не показываем


def ratio(s: dict) -> float | None:
    p, v = s.get("puja_maxima"), s.get("valor_subasta")
    if p and v and v > 0:
        r = p / v
        return r if 0.01 < r < 5 else None  # отсекаем явные опечатки в данных
    return None


def summarize(items: list[dict]) -> dict:
    done = [s for s in items if s.get("estado") == "finalizada"]
    with_bid = [s for s in done if s.get("puja_maxima")]
    rs = [r for r in (ratio(s) for s in with_bid) if r is not None]
    return {
        "n": len(items), "terminadas": len(done), "canceladas": sum(1 for s in items if s.get("estado") == "cancelada"),
        "con_pujas": len(with_bid), "sin_pujas": sum(1 for s in done if s.get("sin_pujas")),
        "pct_con_pujas": round(100 * len(with_bid) / len(done), 1) if done else None,
        "mediana_puja_pct": round(100 * statistics.median(rs), 1) if len(rs) >= 5 else None,
        "mediana_valor": round(statistics.median([s["valor_subasta"] for s in done if s.get("valor_subasta")])) if done else None,
    }


def buckets(items: list[dict]) -> dict:
    out = {"lt50": 0, "50_70": 0, "70_100": 0, "gte100": 0}
    for s in items:
        r = ratio(s)
        if r is None:
            continue
        out["lt50" if r < .5 else "50_70" if r < .7 else "70_100" if r < 1 else "gte100"] += 1
    return out


def main() -> int:
    idx = json.loads((DATA / "historico" / "index.json").read_text("utf-8"))
    months = sorted(idx.get("meses", {}))[-12:]
    items = []
    by_month = {}
    for m in months:
        f = DATA / "historico" / f"{m}.json"
        if not f.exists():
            continue
        subs = json.loads(f.read_text("utf-8")).get("subastas", [])
        items += subs
        by_month[m] = summarize(subs)
    groups, provs, origins = defaultdict(list), defaultdict(list), defaultdict(list)
    for s in items:
        groups[GROUP.get(s.get("categoria"), "g_otros")].append(s)
        provs[norm_province(s.get("provincia", ""))].append(s)
        origins[s.get("origen") or "otros"].append(s)
    real_estate = [s for s in items if s.get("categoria") in GROUP]
    meta = json.loads((DATA / "meta.json").read_text("utf-8")) if (DATA / "meta.json").exists() else {}
    out = {
        "generado": datetime.now(timezone.utc).isoformat(),
        "meses": months,
        "abiertas": {"total": meta.get("actuales"), "por_categoria": meta.get("por_categoria", {})},
        "total": summarize(items),
        "inmuebles": summarize(real_estate),
        "tramos_inmuebles": buckets(real_estate),
        "por_mes": by_month,
        "por_grupo": {k: summarize(v) for k, v in groups.items()},
        "por_origen": {k: summarize(v) for k, v in origins.items() if len(v) >= MIN_N},
        "por_provincia": {k: summarize(v) for k, v in provs.items() if k and len([s for s in v if s.get("estado") == "finalizada"]) >= MIN_N},
    }
    (DATA / "stats.json").write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")), "utf-8")
    t = out["total"]
    print(f"stats: месяцев {len(months)}, аукционов {t['n']}, завершено {t['terminadas']}, со ставками {t['pct_con_pujas']} %")
    return 0


if __name__ == "__main__":
    sys.exit(main())
