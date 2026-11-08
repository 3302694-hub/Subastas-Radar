"""Фото объекта из документов аукциона.

Берёт новые файлы из subasta_docs (PDF и картинки), вынимает из PDF встроенные изображения,
отсеивает сканы текста, печати и логотипы, сохраняет фото в публичное хранилище fotos/{id}/
и записывает их в subasta_fotos. Лучшее фото становится главным (портадой) — его видно
на плашке аукциона в списке. Администратор может скрыть фото или выбрать другое главное.
Запуск в GitHub Actions: python scraper/docs_fotos.py   (нужны pymupdf, pillow, numpy)
"""
from __future__ import annotations

import io
import json
import os
import sys
import urllib.parse
import urllib.request
from datetime import datetime, timezone

import fitz  # PyMuPDF
import numpy as np
from PIL import Image, ImageOps

URL = os.environ.get("SUPABASE_URL", "https://jkxvxdhmothlamhotecu.supabase.co").rstrip("/")
KEY = os.environ.get("SUPABASE_SERVICE_KEY", "")
H = {"apikey": KEY, "Authorization": f"Bearer {KEY}"}
LIMIT_DOCS = int(os.environ.get("FOTOS_DOCS", "30"))
MAX_PER_DOC = 12


def http(url, data=None, headers=None, method=None, timeout=120):
    req = urllib.request.Request(url, data=data, headers={**H, **(headers or {})}, method=method)
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read()


def rest(path, method="GET", body=None, prefer=None):
    h = {"Content-Type": "application/json"}
    if prefer:
        h["Prefer"] = prefer
    raw = http(f"{URL}/rest/v1/{path}", json.dumps(body).encode() if body is not None else None, h, method)
    return json.loads(raw) if raw else None


def photo_score(im: Image.Image, manual: bool) -> float | None:
    """Похоже ли изображение на фотографию объекта. None — нет."""
    w, h = im.size
    if w < 300 or h < 200 or w * h < 120_000 or not (0.35 < w / h < 2.8):
        return None
    a = np.asarray(im.convert("RGB").resize((96, 96)), dtype=np.float32)
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    rg, yb = r - g, 0.5 * (r + g) - b
    colorful = float(np.sqrt(rg.std() ** 2 + yb.std() ** 2) + 0.3 * np.sqrt(rg.mean() ** 2 + yb.mean() ** 2))
    white = float(((a > 225).all(axis=2)).mean())
    dark = float(((a < 25).all(axis=2)).mean())
    gray = a.mean(axis=2)
    texture = float(np.abs(np.diff(gray, axis=1)).mean())
    if manual:                       # загружено администратором вручную — верим, кроме совсем пустых
        return colorful + 10 if white < 0.9 else None
    flat = float((np.abs(np.diff(gray, axis=1)) < 2).mean())          # доля ровных участков
    colors = len({tuple(x) for x in (a // 32).astype(int).reshape(-1, 3)})  # число цветов после огрубления
    if white > 0.45 or dark > 0.6 or colorful < 14 or texture < 4 or flat > 0.45 or colors < 60:
        return None                  # скан страницы, подпись, печать, схема, логотип
    return colorful * (w * h) ** 0.25


def ahash(im: Image.Image) -> int:
    g = np.asarray(im.convert("L").resize((8, 8)), dtype=np.float32)
    bits = (g > g.mean()).flatten()
    return int("".join("1" if x else "0" for x in bits), 2)


def images_from(doc: dict, raw: bytes):
    if (doc.get("mime") or "").startswith("image/"):
        yield ImageOps.exif_transpose(Image.open(io.BytesIO(raw)))   # поворот по EXIF (фото с телефона)
        return
    pdf = fitz.open(stream=raw, filetype="pdf")
    seen = set()
    for page in pdf:
        imgs = page.get_images(full=True)
        if len(imgs) > 25:           # страница из сотен кусочков — не фото
            continue
        for info in imgs:
            xref = info[0]
            if xref in seen:
                continue
            seen.add(xref)
            try:
                pix = fitz.Pixmap(pdf, xref)
                if pix.n - pix.alpha >= 4:
                    pix = fitz.Pixmap(fitz.csRGB, pix)
                yield Image.open(io.BytesIO(pix.tobytes("png")))
            except Exception:  # noqa: BLE001
                continue


def main():
    if not KEY:
        print("фото: нет ключа Supabase, пропуск"); return 0
    docs = rest(f"subasta_docs?select=id,subasta_id,path,mime,origen,nombre&fotos_ok=is.null&order=created_at&limit={LIMIT_DOCS}") or []
    total = 0
    for d in docs:
        sid, saved = d["subasta_id"], 0
        try:
            raw = http(f"{URL}/storage/v1/object/docs/{urllib.parse.quote(d['path'])}")
            have = rest(f"subasta_fotos?select=id,portada,score&subasta_id=eq.{urllib.parse.quote(sid)}") or []
            hashes = set()
            cands = []
            for im in images_from(d, raw):
                sc = photo_score(im, (d.get("mime") or "").startswith("image/"))   # отдельная картинка — это фото лота
                if sc is None:
                    continue
                hsh = ahash(im)
                if any(bin(hsh ^ x).count("1") <= 5 for x in hashes):
                    continue
                hashes.add(hsh)
                cands.append((sc, im))
            cands.sort(key=lambda c: -c[0])
            base = d["path"].rsplit("/", 1)[-1].rsplit(".", 1)[0]
            for k, (sc, im) in enumerate(cands[:MAX_PER_DOC]):
                im = im.convert("RGB")
                im.thumbnail((1600, 1600))
                buf = io.BytesIO(); im.save(buf, "JPEG", quality=85, optimize=True)
                path = f"{sid}/{base}-{k + 1:02d}.jpg"
                http(f"{URL}/storage/v1/object/fotos/{urllib.parse.quote(path)}", buf.getvalue(),
                     {"Content-Type": "image/jpeg", "x-upsert": "true", "Cache-Control": "max-age=86400"}, "POST")
                rest("subasta_fotos?on_conflict=path", "POST",
                     {"subasta_id": sid, "path": path, "doc_path": d["path"], "w": im.width, "h": im.height, "score": round(sc, 2)},
                     prefer="resolution=merge-duplicates,return=minimal")
                saved += 1
            # главное фото: если ещё нет — лучшее по оценке
            if saved and not any(f["portada"] for f in have):
                best = rest(f"subasta_fotos?select=id&subasta_id=eq.{urllib.parse.quote(sid)}&visible=eq.true&order=score.desc&limit=1")
                if best:
                    rest(f"subasta_fotos?id=eq.{best[0]['id']}", "PATCH", {"portada": True}, prefer="return=minimal")
        except Exception as e:  # noqa: BLE001
            print(f"фото {d['path']}: ошибка {e!r}"[:300])
        rest(f"subasta_docs?id=eq.{d['id']}", "PATCH", {"fotos_ok": datetime.now(timezone.utc).isoformat()}, prefer="return=minimal")
        print(f"фото {d['path']}: найдено {saved}")
        total += saved
    print(f"фото: документов {len(docs)}, сохранено фото {total}")
    aereo_auto(int(os.environ.get("AEREO_LIMIT", "30")))
    return 0


def aereo_auto(limit: int):
    """Аэрофото для участков, домов на земле и «недвижимости без типа», у которых нет своих фото."""
    pend = rest(f"v_aereo_pendientes?select=subasta_id&order=fecha_fin.asc.nullslast&limit={limit}") or []
    ok = 0
    for p in pend:
        sid = p["subasta_id"]
        try:
            good = aereo(sid)
            nota = None if good else "нет контура или номера"
        except Exception as e:  # noqa: BLE001
            good, nota = False, repr(e)[:200]
        rest("aereo_intentos?on_conflict=subasta_id", "POST", {"subasta_id": sid, "ok": good, "nota": nota,
              "at": datetime.now(timezone.utc).isoformat()},
             prefer="resolution=merge-duplicates,return=minimal")
        ok += good
    if pend:
        print(f"аэрофото: обработано {len(pend)}, готово {ok}")


def preview(sid: str):
    """Лист-превью всех фото аукциона (для проверки отбора): site/social/src/preview/<id>.jpg"""
    from pathlib import Path
    rows = rest(f"subasta_fotos?select=path,portada,visible,score&subasta_id=eq.{urllib.parse.quote(sid)}&order=score.desc") or []
    ims = []
    for r in rows:
        im = Image.open(io.BytesIO(http(f"{URL}/storage/v1/object/public/fotos/{urllib.parse.quote(r['path'])}"))).convert("RGB")
        im.thumbnail((360, 270)); ims.append(im)
    if not ims:
        print("превью: фото нет"); return
    cols = 4; W = 370; rows_n = (len(ims) + cols - 1) // cols
    sheet = Image.new("RGB", (cols * W, rows_n * 280), "white")
    for i, im in enumerate(ims):
        sheet.paste(im, ((i % cols) * W, (i // cols) * 280))
    out = Path(__file__).resolve().parent.parent / "site" / "social" / "src" / "preview"
    out.mkdir(parents=True, exist_ok=True)
    sheet.save(out / f"{sid}.jpg", quality=80)
    print("превью:", len(ims), "фото")


def aereo(sid: str) -> bool:
    """Аэрофото участка (© IGN-PNOA, CC BY 4.0) с границей по Катастро — фото для лотов без своих фото."""
    import math
    import re
    from PIL import ImageDraw
    rows = rest(f"subastas?select=data&id=eq.{urllib.parse.quote(sid)}") or []
    bienes = ((rows[0].get("data") or {}).get("bienes") or []) if rows else []
    rc = next((re.sub(r"[^0-9A-Z]", "", str(b.get("ref_catastral") or "").upper().split(" ")[0])[:14]
               for b in bienes if len(re.sub(r"[^0-9A-Z]", "", str(b.get("ref_catastral") or "").upper().split(" ")[0])) >= 14), None)
    if not rc:
        print("аэрофото: нет кадастрового номера"); return False
    ua = {"User-Agent": "Mozilla/5.0 (Subastica; +https://subastica.es)"}
    gml = urllib.request.urlopen(urllib.request.Request(
        "https://ovc.catastro.meh.es/INSPIRE/wfsCP.aspx?service=wfs&version=2&request=getfeature"
        f"&STOREDQUERIE_ID=GetParcel&refcat={rc}&srsname=EPSG::4326", headers=ua), timeout=60).read().decode("latin-1")
    m = re.search(r"<gml:posList[^>]*>([^<]+)</gml:posList>", gml)
    if not m:
        print("аэрофото: нет контура участка"); return False
    v = [float(x) for x in m.group(1).split()]
    pts = [(v[i], v[i + 1]) for i in range(0, len(v), 2)]                 # (широта, долгота)
    lat0 = sum(p[0] for p in pts) / len(pts)
    k = 111320 * math.cos(math.radians(lat0))
    la1, la2 = min(p[0] for p in pts), max(p[0] for p in pts)
    lo1, lo2 = min(p[1] for p in pts), max(p[1] for p in pts)
    w_m, h_m = (lo2 - lo1) * k * 1.6 + 30, (la2 - la1) * 111320 * 1.6 + 30   # поля вокруг участка
    w_m, h_m = max(w_m, h_m * 4 / 3), max(h_m, w_m * 3 / 4)                  # формат 4:3
    cla, clo = (la1 + la2) / 2, (lo1 + lo2) / 2
    dla, dlo = h_m / 111320 / 2, w_m / k / 2
    W, Hh = 1200, 900
    url = ("https://www.ign.es/wms-inspire/pnoa-ma?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap&LAYERS=OI.OrthoimageCoverage&STYLES="
           f"&CRS=EPSG:4326&BBOX={cla - dla},{clo - dlo},{cla + dla},{clo + dlo}&WIDTH={W}&HEIGHT={Hh}&FORMAT=image/jpeg")
    im = Image.open(io.BytesIO(urllib.request.urlopen(urllib.request.Request(url, headers=ua), timeout=90).read())).convert("RGB")
    xy = [((lo - (clo - dlo)) / (2 * dlo) * W, ((cla + dla) - la) / (2 * dla) * Hh) for la, lo in pts]
    ImageDraw.Draw(im).line(xy + [xy[0]], fill=(255, 214, 0), width=5, joint="curve")
    buf = io.BytesIO(); im.save(buf, "JPEG", quality=86)
    path = f"{sid}/aereo-pnoa.jpg"
    http(f"{URL}/storage/v1/object/fotos/{urllib.parse.quote(path)}", buf.getvalue(),
         {"Content-Type": "image/jpeg", "x-upsert": "true", "Cache-Control": "max-age=86400"}, "POST")
    have = rest(f"subasta_fotos?select=id&subasta_id=eq.{urllib.parse.quote(sid)}&portada=eq.true") or []
    rest("subasta_fotos?on_conflict=path", "POST",
         {"subasta_id": sid, "path": path, "doc_path": None, "w": W, "h": Hh, "score": 1, "portada": not have},
         prefer="resolution=merge-duplicates,return=minimal")
    print(f"аэрофото {sid}: готово ({rc}){'' if have else ', на плашке'}")
    return True


def debug(sid: str):
    """Разбор PDF аукциона: сколько страниц и картинок (только в лог)."""
    for d in rest(f"subasta_docs?select=path,mime&subasta_id=eq.{urllib.parse.quote(sid)}&mime=eq.application/pdf") or []:
        raw = http(f"{URL}/storage/v1/object/docs/{urllib.parse.quote(d['path'])}")
        pdf = fitz.open(stream=raw, filetype="pdf")
        print(d["path"], "страниц", len(pdf))
        for pn, page in enumerate(pdf):
            imgs = page.get_images(full=True)
            print(f"  стр {pn + 1}: картинок {len(imgs)}", [(i[2], i[3]) for i in imgs[:6]])
            # страницы не сохраняем: в документах бывают персональные данные


if __name__ == "__main__":
    if len(sys.argv) > 2 and sys.argv[1] == "--aereo":
        for sid in sys.argv[2:]:
            try:
                aereo(sid)
            except Exception as e:  # noqa: BLE001
                print(f"аэрофото {sid}: ошибка {e!r}")
        sys.exit(0)
    if len(sys.argv) > 2 and sys.argv[1] == "--debug":
        debug(sys.argv[2]); sys.exit(0)
    if len(sys.argv) > 2 and sys.argv[1] == "--preview":
        preview(sys.argv[2]); sys.exit(0)
    sys.exit(main())
