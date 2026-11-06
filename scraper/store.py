"""Хранилище аукционов в Supabase (REST API, только стандартная библиотека).

Сборщик работает с ключом service_role: он обходит ограничения доступа (RLS)
и может читать/писать всю таблицу. Ключ хранится только в секретах GitHub.
"""
from __future__ import annotations

import json
import urllib.error
import urllib.request
from datetime import datetime, timezone

PAGE = 1000
BATCH = 200


class SupabaseStore:
    def __init__(self, url: str, service_key: str, table: str = "subastas"):
        self.base = url.rstrip("/") + "/rest/v1/"
        self.key = service_key
        self.table = table

    def _req(self, method: str, path: str, body=None, headers: dict | None = None):
        h = {
            "apikey": self.key,
            "Authorization": f"Bearer {self.key}",
            "Content-Type": "application/json",
            "Accept": "application/json",
        }
        h.update(headers or {})
        data = json.dumps(body, ensure_ascii=False).encode() if body is not None else None
        req = urllib.request.Request(self.base + path, data=data, method=method, headers=h)
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                raw = r.read()
                return json.loads(raw) if raw else None
        except urllib.error.HTTPError as e:
            msg = e.read().decode(errors="replace")[:500]
            raise RuntimeError(f"Supabase {method} {path[:60]}: HTTP {e.code} {msg}") from None

    def load_all(self) -> dict[str, dict]:
        out: dict[str, dict] = {}
        start = 0
        while True:
            rows = self._req("GET", f"{self.table}?select=id,data&order=id",
                             headers={"Range-Unit": "items", "Range": f"{start}-{start + PAGE - 1}"})
            for r in rows or []:
                out[r["id"]] = r["data"]
            if not rows or len(rows) < PAGE:
                return out
            start += PAGE

    def upsert(self, records: list[dict], teaser_ids: set[str]) -> None:
        now = datetime.now(timezone.utc).isoformat()
        rows = [{
            "id": s["id"],
            "data": s,
            "estado": s.get("estado"),
            "detectada": s.get("detectada"),
            "fecha_fin": s.get("fecha_fin"),
            "teaser": s["id"] in teaser_ids,
            "updated_at": now,
        } for s in records]
        for i in range(0, len(rows), BATCH):
            self._req("POST", f"{self.table}?on_conflict=id", rows[i:i + BATCH],
                      headers={"Prefer": "resolution=merge-duplicates,return=minimal"})

    def delete(self, ids: list[str]) -> None:
        ids = list(ids)
        for i in range(0, len(ids), 100):
            chunk = ",".join('"' + x.replace('"', "") + '"' for x in ids[i:i + 100])
            self._req("DELETE", f"{self.table}?id=in.({chunk})", headers={"Prefer": "return=minimal"})
