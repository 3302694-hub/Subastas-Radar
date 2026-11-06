#!/usr/bin/env python3
"""Создаёт ДЕМО-данные (вымышленные адреса и ID «DEMO-…»), чтобы посмотреть сайт
до первого запуска сборщика. Первый реальный запуск scraper/scrape.py их заменит."""
import json
import random
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
random.seed(7)
now = datetime.now(timezone.utc)

PROVS = [("MADRID", "MADRID", "280"), ("BARCELONA", "BARCELONA", "080"), ("VALENCIA", "VALÈNCIA", "460"),
         ("MÁLAGA", "MÁLAGA", "290"), ("ALICANTE/ALACANT", "TORREVIEJA", "031"), ("SEVILLA", "SEVILLA", "410"),
         ("MURCIA", "CARTAGENA", "302"), ("ILLES BALEARS", "PALMA", "070"), ("A CORUÑA", "SANTIAGO DE COMPOSTELA", "157"),
         ("ZARAGOZA", "ZARAGOZA", "500"), ("GRANADA", "MOTRIL", "186"), ("LAS PALMAS", "TELDE", "352"),
         ("TOLEDO", "TALAVERA DE LA REINA", "456"), ("ASTURIAS", "GIJÓN", "332"), ("BIZKAIA", "BILBAO", "480"),
         ("CÁDIZ", "JEREZ DE LA FRONTERA", "114"), ("SANTA CRUZ DE TENERIFE", "LA LAGUNA", "382"), ("GIRONA", "FIGUERES", "176")]
KINDS = [
    ("vivienda", "Vivienda", "VIVIENDA EN CALLE DE EJEMPLO {n}, PLANTA {p}, {m} M2 CONSTRUIDOS", (60000, 420000)),
    ("vivienda", "Vivienda", "CASA UNIFAMILIAR ADOSADA EN URBANIZACIÓN DEMO, PARCELA {n}, {m} M2", (90000, 380000)),
    ("garaje", "Garaje", "PLAZA DE GARAJE Nº {n} EN SÓTANO -1 DEL EDIFICIO DEMO", (6000, 25000)),
    ("trastero", "Trastero", "TRASTERO Nº {n} EN PLANTA SÓTANO, {p} M2", (2000, 9000)),
    ("local", "Local comercial", "LOCAL COMERCIAL EN PLANTA BAJA, AVENIDA DEMO {n}, {m} M2", (40000, 260000)),
    ("nave", "Nave industrial", "NAVE INDUSTRIAL EN POLÍGONO DEMO, PARCELA {n}, {m} M2", (120000, 900000)),
    ("solar", "Solar", "SOLAR URBANO EN CALLE DEMO {n}, SUPERFICIE {m} M2", (30000, 300000)),
    ("rustica", "Finca rústica", "FINCA RÚSTICA DE SECANO, PARAJE DEMO, POLÍGONO {p} PARCELA {n}", (8000, 150000)),
    ("vehiculo", "Turismos", "TURISMO MARCA DEMO MODELO {n}, AÑO 201{p}", (1500, 30000)),
    ("maquinaria", "Maquinaria", "LOTE DE MAQUINARIA INDUSTRIAL Y HERRAMIENTAS ({n} ELEMENTOS)", (3000, 60000)),
]
ORIGINS = [("judicial", "JA", "JUDICIAL EN VÍA DE APREMIO", "JUZGADO DE PRIMERA INSTANCIA Nº {n} (DEMO)"),
           ("notarial", "NE", "NOTARIAL EN VENTA EXTRAJUDICIAL", "NOTARÍA DEMO"),
           ("hacienda", "AT", "AGENCIA TRIBUTARIA", "AEAT - DEPENDENCIA REGIONAL DE RECAUDACIÓN (DEMO)"),
           ("administracion", "AP", "ADMINISTRACIÓN PÚBLICA", "AYUNTAMIENTO DEMO")]

items = []
for i in range(1, 73):
    cat, kind, tpl, (lo, hi) = random.choice(KINDS)
    org, pref, tipo, auth = random.choice(ORIGINS[:2] if cat not in ("vehiculo", "maquinaria") else ORIGINS[2:])
    prov, city, cp = random.choice(PROVS)
    desc = tpl.format(n=random.randint(1, 120), p=random.randint(1, 9), m=random.randint(40, 2500))
    tas = round(random.uniform(lo, hi), -2)
    val = tas if org != "judicial" else round(tas * random.choice([1, 0.7, 0.5]), -2)
    start = now - timedelta(days=random.randint(-6, 18), hours=random.randint(0, 23))
    end = start + timedelta(days=20)
    det = now - timedelta(hours=random.choice([1, 3, 5, 9, 14, 20, 30, 50, 80, 120, 200, 300]))
    estado = "proxima" if start > now else ("finalizada" if end < now else "activa")
    sid = f"DEMO-{pref}-{i:04d}"
    items.append({
        "id": sid, "url": "https://subastas.boe.es/", "origen": org, "tipo": tipo, "categoria": cat,
        "titulo": desc, "provincia": prov, "localidad": city, "cp": cp + f"{random.randint(1, 99):02d}",
        "direccion": "CALLE DE EJEMPLO (DATOS FICTICIOS)",
        "valor_subasta": val, "tasacion": tas, "puja_minima": None if org == "judicial" else round(val * .5, -2),
        "deposito": round(val * .05, 2), "cantidad_reclamada": round(val * random.uniform(.3, 1.1), 2) if org == "judicial" else None,
        "fecha_inicio": start.isoformat(timespec="seconds"), "fecha_fin": end.isoformat(timespec="seconds"),
        "estado": estado, "autoridad": auth.format(n=random.randint(1, 12)), "anuncio_boe": "", "lotes": "Sin lotes",
        "detectada": det.isoformat(timespec="seconds"),
        "bienes": [{"titulo": f"Bien 1 - ({kind})", "tipo_bien": kind, "descripcion": desc,
                    "direccion": "CALLE DE EJEMPLO (DATOS FICTICIOS)", "cp": cp + "01", "localidad": city,
                    "provincia": prov, "ref_catastral": "", "situacion_posesoria": random.choice(["", "No consta", "Ocupado", "Libre"]),
                    "visitable": random.choice(["", "No", "Sí"]), "cargas": "", "matricula": ""}],
    })
items.sort(key=lambda s: s["detectada"], reverse=True)

data_dir = ROOT / "site" / "data"
data_dir.mkdir(parents=True, exist_ok=True)
(data_dir / "subastas.json").write_text(json.dumps({"demo": True, "generado": now.isoformat(), "subastas": items},
                                                   ensure_ascii=False, separators=(",", ":")), "utf-8")
(data_dir / "meta.json").write_text(json.dumps({"actualizado": now.isoformat(), "total": len(items), "demo": True},
                                               ensure_ascii=False, indent=2), "utf-8")
print("демо-данные:", len(items))
