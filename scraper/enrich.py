"""
Обогащение аукционов открытыми данными.

  * Катастро (OVC, открытые «datos no protegidos»): площадь, год постройки,
    назначение, точный адрес с этажом и дверью, координаты, ссылка на карту Катастро.
  * MIVAU, «Estadística de Valor Tasado de Vivienda»: средняя оценка €/м² жилья
    по городам (> 25 000 жителей) и провинциям — для ориентировочной рыночной оценки.
  * BOE, вкладка «Pujas» идущего аукциона: есть ли уже ставки (сумму BOE
    показывает только зарегистрированным участникам).

Поля делятся по тарифам (см. scrape.write_outputs / store):
  rec["catastro"]  — площадь, год, назначение          → всем с полным доступом
  rec["_inv"]      — оценка рынка, состояние ставок     → тариф Инвестор и выше
  rec["_pro"]      — координаты, точный адрес, карта    → тариф Про
"""
from __future__ import annotations

import json
import re
import time
import unicodedata
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path

import boe

CAT_DNPRC = "https://ovc.catastro.meh.es/OVCServWeb/OVCWcfCallejero/COVCCallejero.svc/json/Consulta_DNPRC?RefCat={rc}"
CAT_CPMRC = "https://ovc.catastro.meh.es/OVCServWeb/OVCWcfCallejero/COVCCoordenadas.svc/json/Consulta_CPMRC?SRS=EPSG:4326&RefCat={rc}"
MIVAU_MUN = "https://apps.fomento.gob.es/BoletinOnline2/sedal/35103500.XLS"
MIVAU_PROV = "https://apps.fomento.gob.es/BoletinOnline2/sedal/35101000.XLS"
REAL_ESTATE = {"vivienda", "garaje", "trastero", "local", "nave", "solar", "rustica", "inmueble"}
ENRICH_VERSION = 1


def norm(s: str) -> str:
    """«Alicante/Alacant» → «alicante», «Coruña (A)» → «coruna», «Palmas (Las)» → «palmas»."""
    s = unicodedata.normalize("NFD", str(s or "")).encode("ascii", "ignore").decode().lower()
    s = s.split("/")[0]
    s = re.sub(r"\(.*?\)", "", s)
    s = re.sub(r"^(l'|la |el |los |las |les |a |o )", "", s.strip())
    return re.sub(r"[^a-z]+", " ", s).strip()


# ------------------------------------------------------------- Катастро

def _num(v):
    """Число из ячейки: xlrd отдаёт float как есть; текст вида «2.824,2» — по-испански."""
    if isinstance(v, (int, float)):
        return float(v)
    s = str(v or "").strip()
    if not s:
        return None
    try:
        return float(s.replace(".", "").replace(",", ".")) if "," in s else float(s)
    except ValueError:
        return None


def catastro_lookup(fetcher, rc_raw: str) -> dict | None:
    """Данные по кадастровому номеру. 20 знаков — конкретное помещение, 14 — участок."""
    rc = re.sub(r"[^0-9A-Za-z]", "", rc_raw or "").upper()
    if len(rc) < 14:
        return None
    out: dict = {"rc": rc}
    try:
        j = json.loads(fetcher.get(CAT_DNPRC.format(rc=rc)))
        r = j.get("consulta_dnprcResult") or {}
        bi = (r.get("bico") or {}).get("bi") or {}
        if not bi and r.get("lrcdnp"):      # участок с несколькими помещениями: берём первое
            first = (r["lrcdnp"].get("rcdnp") or [{}])[0]
            bi = {"ldt": first.get("dt", {}).get("ldt") if isinstance(first.get("dt"), dict) else None,
                  "debi": first.get("debi") or {}}
        debi = bi.get("debi") or {}
        finca = (r.get("bico") or {}).get("finca") or {}
        out.update({
            "sup": _num(debi.get("sfc")),
            "anio": int(debi["ant"]) if str(debi.get("ant", "")).isdigit() else None,
            "uso": debi.get("luso") or None,
            "dir": bi.get("ldt") or finca.get("ldt") or None,
            "mapa": ((finca.get("infgraf") or {}).get("igraf")) or None,
        })
    except Exception:  # noqa: BLE001 — Катастро иногда отвечает ошибкой, это не повод падать
        pass
    try:
        j = json.loads(fetcher.get(CAT_CPMRC.format(rc=rc[:14])))
        coords = (((j.get("Consulta_CPMRCResult") or {}).get("coordenadas") or {}).get("coord") or [])
        if coords:
            g = coords[0].get("geo") or {}
            out["lat"], out["lon"] = float(g["ycen"]), float(g["xcen"])
            out.setdefault("dir", coords[0].get("ldt"))
    except Exception:  # noqa: BLE001
        pass
    if not out.get("mapa"):
        out["mapa"] = f"https://www1.sedecatastro.gob.es/Cartografia/mapa.aspx?refcat={rc[:14]}"
    out = {k: v for k, v in out.items() if v not in (None, "")}
    return out if len(out) > 2 else None


# ------------------------------------------------------------- цены м²

def _download(url: str) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (Subastica; datos abiertos)"})
    with urllib.request.urlopen(req, timeout=90) as r:
        return r.read()


def load_prices(path: Path, max_age_days: int = 7) -> dict:
    """Таблица €/м² MIVAU. Обновляется раз в неделю, хранится в site/data/precios_m2.json."""
    try:
        cur = json.loads(path.read_text("utf-8"))
        age = datetime.now(timezone.utc) - datetime.fromisoformat(cur["descargado"])
        if age < timedelta(days=max_age_days):
            return cur
    except Exception:  # noqa: BLE001
        cur = None
    try:
        import xlrd  # noqa: PLC0415 — нужен только здесь
        mun_sheet = xlrd.open_workbook(file_contents=_download(MIVAU_MUN)).sheets()[-1]
        municipios, title = {}, ""
        c_prov = c_mun = c_tot = c_n = None
        prov = ""
        for r in range(mun_sheet.nrows):
            row = mun_sheet.row_values(r)
            txt = [str(c).strip() for c in row]
            if not title and any(re.search(r"trimestre de \d{4}", c, re.I) for c in txt):
                title = next(c for c in txt if re.search(r"trimestre de \d{4}", c, re.I)).replace("(*)", "").strip()
            if c_mun is None:
                if "Municipio" in txt:
                    c_prov, c_mun = txt.index("Provincia") if "Provincia" in txt else txt.index("Municipio") - 1, txt.index("Municipio")
                continue
            if c_tot is None:
                if "Total" in txt:   # первое «Total» — стоимость, второе — число оценок
                    tots = [i for i, c in enumerate(txt) if c == "Total"]
                    c_tot, c_n = tots[0], (tots[1] if len(tots) > 1 else None)
                continue
            prov = txt[c_prov] or prov
            name, total = txt[c_mun], _num(row[c_tot])
            if name and total and total > 100:
                municipios[norm(name)] = {"eur_m2": round(total, 1), "prov": norm(prov),
                                          "n": _num(row[c_n]) if c_n is not None else None}
        prov_sheet = xlrd.open_workbook(file_contents=_download(MIVAU_PROV)).sheets()[-1]
        q_cols, provincias = None, {}
        for r in range(prov_sheet.nrows):
            row = prov_sheet.row_values(r)
            txt = [str(c).strip() for c in row]
            if q_cols is None:
                if any(re.match(r"^[1-4]º", c) for c in txt):
                    q_cols = [i for i, c in enumerate(txt) if re.match(r"^[1-4]º", c)]
                continue
            label = next((c for i, c in enumerate(txt) if c and i < q_cols[0]), "")
            vals = [_num(row[i]) for i in q_cols if i < len(row)]
            last = next((v for v in reversed(vals) if v), None)
            if label and last:
                provincias[norm(label)] = round(last, 1)
        data = {"fuente": "MIVAU, Estadística de Valor Tasado de Vivienda", "periodo": title,
                "descargado": datetime.now(timezone.utc).isoformat(),
                "municipios": municipios, "provincias": provincias}
        print(f"цены MIVAU: {title or '?'} — муниципалитетов {len(municipios)}, провинций {len(provincias)}")
        if municipios or provincias:
            path.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")), "utf-8")
            return data
    except Exception as e:  # noqa: BLE001
        print(f"цены MIVAU: не удалось обновить ({e!r})")
    return cur or {"municipios": {}, "provincias": {}}


PROV_ALIAS = {"vizcaya": "bizkaia", "guipuzcoa": "gipuzkoa", "alava": "araba", "gerona": "girona", "lerida": "lleida",
              "orense": "ourense", "baleares": "balears", "islas baleares": "balears", "illes balears": "balears",
              "la coruna": "coruna", "a coruna": "coruna", "las palmas": "palmas", "la rioja": "rioja",
              "castellon": "castellon", "santa cruz de tenerife": "santa cruz de tenerife"}


def valuation(rec: dict, cat: dict | None, prices: dict) -> dict | None:
    """Ориентировочная рыночная стоимость жилья: площадь Катастро × средняя оценка м² (MIVAU)."""
    if rec.get("categoria") != "vivienda" or not cat or not cat.get("sup"):
        return None
    town = norm(rec.get("localidad") or (rec.get("bienes") or [{}])[0].get("localidad"))
    prov = norm(rec.get("provincia") or "")
    prov = PROV_ALIAS.get(prov, prov)
    m = prices.get("municipios", {}).get(town)
    level, eur = ("municipio", m["eur_m2"]) if m else ("provincia", prices.get("provincias", {}).get(prov))
    if not eur:
        return None
    est = round(cat["sup"] * eur, -2)
    out = {"eur_m2": eur, "nivel": level, "sup": cat["sup"], "estimado": est, "periodo": prices.get("periodo", "")}
    if rec.get("valor_subasta"):
        out["descuento"] = round((1 - rec["valor_subasta"] / est) * 100) if est else None
    return out


# ------------------------------------------------------------- ставки идущего аукциона

def bids_state(fetcher, sid: str) -> str | None:
    """«con_pujas» / «sin_pujas» — сумму BOE показывает только зарегистрированным."""
    html = fetcher.get(boe.detail_url(sid, 5))
    t = boe.clean(re.sub(r"<[^>]+>", " ", html)).lower()
    if "no ha recibido pujas" in t:
        return "sin_pujas"
    if "ha recibido alguna puja" in t or "puja máxima actual" in t and "importe" in t:
        return "con_pujas"
    return None


# ------------------------------------------------------------- проход по базе

def enrich(fetcher, db: dict[str, dict], prices: dict, budget_s: float, log=print) -> None:
    t0 = time.monotonic()
    now = datetime.now(timezone.utc)
    current = [s for s in db.values() if s.get("estado") in ("activa", "proxima")]
    # 1) Катастро — один раз на аукцион (у кого есть кадастровый номер)
    todo = [s for s in current if s.get("categoria") in REAL_ESTATE and s.get("cat_v") != ENRICH_VERSION]
    done = 0
    for s in todo:
        if time.monotonic() - t0 > budget_s * 0.7:
            break
        rc = next((b.get("ref_catastral") for b in s.get("bienes") or [] if b.get("ref_catastral")), "")
        cat = catastro_lookup(fetcher, rc) if rc else None
        if cat:
            s["catastro"] = {k: cat[k] for k in ("sup", "anio", "uso", "rc") if k in cat}
            s["_pro"] = {k: cat[k] for k in ("lat", "lon", "dir", "mapa") if k in cat}
        s["cat_v"] = ENRICH_VERSION
        done += 1
    # 2) оценка — пересчитывается каждый раз (дёшево)
    valued = 0
    for s in current:
        v = valuation(s, s.get("catastro"), prices)
        inv = dict(s.get("_inv") or {})
        if v:
            inv["valoracion"] = v
            valued += 1
        else:
            inv.pop("valoracion", None)
        s["_inv"] = inv
    # 3) ставки: скоро закрывающиеся — каждый запуск, остальные — раз в сутки
    checked = 0
    soon = now + timedelta(days=3)

    def due(s):
        last = (s.get("_inv") or {}).get("pujas_ts")
        try:
            end = datetime.fromisoformat(s["fecha_fin"]) if s.get("fecha_fin") else None
        except ValueError:
            end = None
        if not last:
            return True
        age = now - datetime.fromisoformat(last)
        return age > timedelta(hours=2) if (end and end < soon) else age > timedelta(hours=22)

    for s in sorted((s for s in current if s.get("estado") == "activa" and s.get("fuente") != "tgss" and due(s)), key=lambda s: s.get("fecha_fin") or "9"):
        if time.monotonic() - t0 > budget_s:
            break
        try:
            st = bids_state(fetcher, s["id"])
        except Exception:  # noqa: BLE001
            continue
        if st:
            s["_inv"]["pujas"] = st
        s["_inv"]["pujas_ts"] = now.isoformat()
        checked += 1
    left = sum(1 for s in current if s.get("categoria") in REAL_ESTATE and s.get("cat_v") != ENRICH_VERSION)
    log(f"обогащение: Катастро {done} (осталось {left}), оценка {valued}, ставки {checked}, "
        f"{(time.monotonic() - t0) / 60:.1f} мин")
