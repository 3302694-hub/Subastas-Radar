import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scraper"))
import alerts  # noqa: E402


def S(**k):
    base = {"id": "X", "estado": "activa", "categoria": "vivienda", "provincia": "MURCIA",
            "valor_subasta": 90000, "detectada": "2026-11-10T08:17:00+00:00"}
    base.update(k)
    return base


A = {"id": 1, "provincia": "MURCIA", "categoria": "vivienda", "max_valor": 100000, "last_sent": "2026-11-10T07:00:00+00:00"}


def test_province_norm():
    assert alerts.norm_province("ALICANTE/ALACANT") == "ALICANTE"
    assert alerts.norm_province("Valencia/València") == "VALENCIA"
    assert alerts.norm_province("Murcia, Región de") == "MURCIA"
    assert alerts.norm_province("CÁDIZ") == "CÁDIZ"


def test_matches():
    assert alerts.matches(A, S())
    assert not alerts.matches(A, S(provincia="MADRID"))
    assert not alerts.matches(A, S(valor_subasta=150000))
    assert not alerts.matches(A, S(valor_subasta=None))
    assert not alerts.matches(A, S(categoria="garaje"))
    assert alerts.matches(A, S(categoria="local", oculta="Local comercial"))
    assert not alerts.matches(A, S(detectada="2026-11-10T06:00:00+00:00"))
    assert not alerts.matches(A, S(estado="cancelada"))
    assert alerts.matches({"id": 2, "last_sent": "2026-11-01T00:00:00+00:00"}, S(categoria="nave", provincia="LUGO", valor_subasta=None))
    assert not alerts.matches(dict(A, categoria="oculta"), S())


def test_build_sorts_and_caps():
    subs = [S(id=f"S{i}", detectada=f"2026-11-10T08:{i:02d}:00+00:00") for i in range(12)]
    env = alerts.build([dict(A, last_sent="2026-11-10T07:00:00.123+00:00")], subs)
    assert env[0]["total"] == 12 and len(env[0]["items"]) == alerts.MAX_ITEMS
    assert env[0]["items"][0]["id"] == "S11"
    assert "prov=MURCIA" in env[0]["url"] and "max=100000" in env[0]["url"]
