"""Автоархив документов для аукционов из избранного администраторов.

Для каждого такого аукциона скачивает документы с BOE (то, что открыто без входа)
и справку Катастро в хранилище docs/{id}/ и записывает их в таблицу subasta_docs.
Повторно — за 48 часов до конца торгов (BOE иногда убирает документы после окончания).
Запуск в GitHub Actions с ключом service_role: python scraper/docs_fav.py
"""
from __future__ import annotations

import html
import json
import os
import re
import sys
import unicodedata
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone

URL = os.environ.get("SUPABASE_URL", "https://jkxvxdhmothlamhotecu.supabase.co").rstrip("/")
KEY = os.environ.get("SUPABASE_SERVICE_KEY", "")
UA = {"User-Agent": "Mozilla/5.0 (SubastaRadar; +https://subasta-radar.es)"}
EXT = {"application/pdf": "pdf", "image/jpeg": "jpg", "image/png": "png", "application/zip": "zip"}
MAX_SUBASTAS = int(os.environ.get("DOCS_FAV_MAX", "10"))


def http(url, data=None, headers=None, method=None, timeout=60):
    req = urllib.request.Request(url, data=data, headers={**UA, **(headers or {})}, method=method)
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.status, dict(r.headers), r.read()


def rest(path, method="GET", body=None, prefer=None):
    h = {"apikey": KEY, "Authorization": f"Bearer {KEY}", "Content-Type": "application/json"}
    if prefer:
        h["Prefer"] = prefer
    data = json.dumps(body).encode() if body is not None else None
    _, _, raw = http(f"{URL}/rest/v1/{path}", data, h, method)
    return json.loads(raw) if raw else None


def slug(s: str) -> str:
    s = unicodedata.normalize("NFD", s).encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9]+", "-", s).strip("-")[:50] or "documento"


def save(sid, path, content, mime, nombre, origen, src):
    http(f"{URL}/storage/v1/object/docs/{urllib.parse.quote(path)}", content,
         {"apikey": KEY, "Authorization": f"Bearer {KEY}", "Content-Type": mime, "x-upsert": "true"}, "POST")
    rest("subasta_docs?on_conflict=path", "POST",
         {"subasta_id": sid, "nombre": nombre, "path": path, "origen": origen, "mime": mime,
          "bytes": len(content), "url_origen": src, "subido_por": "автоархив (избранное)"},
         prefer="resolution=merge-duplicates,return=minimal")


def fetch_docs(sid, rcs):
    docs, saved, errors = {}, 0, []
    for ver in (1, 2, 3):
        _, _, raw = http(f"https://subastas.boe.es/detalleSubasta.php?idSub={sid}&ver={ver}")
        t = raw.decode("utf-8", "replace")
        for m in re.finditer(r'href="([^"]*verDocumento\.php[^"]*)"[^>]*>(.*?)</a>', t, re.S):
            href = urllib.parse.urljoin("https://subastas.boe.es/", html.unescape(m.group(1)))
            key = (re.search(r"idDoc=(\d+)-", href) or [None, href])[1]
            name = re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", html.unescape(m.group(2)))).strip() or f"Documento {key}"
            docs.setdefault(key, (href, name))
    for key, (href, name) in list(docs.items())[:20]:
        try:
            _, h, content = http(href, headers={"Referer": f"https://subastas.boe.es/detalleSubasta.php?idSub={sid}&ver=1"})
            mime = (h.get("Content-Type") or "").split(";")[0].strip()
            if mime not in EXT or len(content) < 200:
                errors.append(f"{name}: не файл"); continue
            save(sid, f"{sid}/boe-{key.zfill(2)}-{slug(name)}.{EXT[mime]}", content, mime, name, "boe", href); saved += 1
        except Exception as e:  # noqa: BLE001
            errors.append(f"{name}: {e!r}"[:150])
    for rc in rcs[:3]:
        src = f"https://www1.sedecatastro.gob.es/CYCBienInmueble/SECImprimirCroquisYDatos.aspx?refcat={rc}"
        try:
            _, h, content = http(src)
            if "pdf" in (h.get("Content-Type") or "") and len(content) > 1000:
                save(sid, f"{sid}/catastro-{rc}.pdf", content, "application/pdf", f"Catastro: consulta descriptiva y gráfica {rc}", "catastro", src); saved += 1
        except Exception as e:  # noqa: BLE001
            errors.append(f"Catastro {rc}: {e!r}"[:150])
    return len(docs), saved, errors


def main():
    if not KEY:
        print("автоархив: нет ключа Supabase, пропуск"); return 0
    now = datetime.now(timezone.utc)
    ids = [a for a in sys.argv[1:] if re.fullmatch(r"SUB-[A-Z]{2}-\d{4}-[0-9A-Z]+", a)]
    favs = [{"subasta_id": i, "_forzar": True} for i in ids] or rest("v_favoritos_admin?select=subasta_id")
    done = 0
    for f in favs or []:
        sid = f["subasta_id"]
        if done >= MAX_SUBASTAS:
            break
        rows = rest(f"subastas?select=data&id=eq.{urllib.parse.quote(sid)}")
        data = (rows or [{}])[0].get("data") or {}
        fin = data.get("fecha_fin")
        fin_dt = datetime.fromisoformat(fin) if fin else None
        have = rest(f"subasta_docs?select=created_at&subasta_id=eq.{urllib.parse.quote(sid)}&origen=in.(boe,catastro)&order=created_at.desc&limit=1") or []
        last = datetime.fromisoformat(have[0]["created_at"].replace("Z", "+00:00")) if have else None
        soon = fin_dt and now < fin_dt <= now + timedelta(hours=48)
        if not f.get("_forzar"):
            if last and not (soon and now - last > timedelta(hours=24)):
                continue
            if fin_dt and fin_dt < now - timedelta(days=2) and last:
                continue
        rcs = []
        for b in data.get("bienes") or []:
            rc = re.sub(r"[^0-9A-Z]", "", str(b.get("ref_catastral") or "").upper().split(" ")[0])[:20]
            if len(rc) >= 14 and rc not in rcs:
                rcs.append(rc)
        try:
            found, saved, errors = fetch_docs(sid, rcs)
            print(f"автоархив {sid}: на BOE {found}, сохранено {saved}" + (f", ошибки: {'; '.join(errors)[:300]}" if errors else ""))
        except Exception as e:  # noqa: BLE001
            print(f"автоархив {sid}: ошибка {e!r}")
        done += 1
    print(f"автоархив: обработано {done}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
