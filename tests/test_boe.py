"""Тесты парсера на упрощённых копиях разметки Портала аукционов BOE.
Запуск: python -m pytest tests  (или просто python tests/test_boe.py)
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scraper"))
import boe  # noqa: E402

SEARCH = """
<div class="listadoResult"><ul>
 <li class="resultado-busqueda">
  <h3>SUBASTA SUB-JA-2026-251234</h3>
  <h4>JUZGADO DE PRIMERA INSTANCIA Nº 3 DE MÁLAGA</h4>
  <p>Expediente: 0123/2024</p>
  <p>Estado: Celebrándose - [Conclusión prevista: 01/12/2026 a las 18:00:00]</p>
  <p>VIVIENDA EN CALLE EJEMPLO 1, MÁLAGA</p>
  <a href="./detalleSubasta.php?idSub=SUB-JA-2026-251234&amp;idBus=_abc&amp;idLote=&amp;numPagBus=" class="resultado-busqueda-link-defecto">Más...</a>
 </li>
 <li class="resultado-busqueda">
  <h3>SUBASTA SUB-AT-2026-26R2886001001</h3>
  <h4>AGENCIA TRIBUTARIA - DEPENDENCIA REGIONAL DE RECAUDACIÓN</h4>
  <p>Estado: Próxima apertura</p>
  <p>TURISMO MARCA EJEMPLO</p>
  <a href="./detalleSubasta.php?idSub=SUB-AT-2026-26R2886001001&amp;idBus=_abc">Más...</a>
 </li>
</ul></div>
<div class="paginar2"><ul>
 <li><a href="subastas_ava.php?accion=Mas&amp;id_busqueda=_ZXY-50-50"><span class="pagSig">Pág. siguiente</span></a></li>
</ul></div>
"""

GENERAL = """
<div id="idBloqueDatos1"><table>
<tr><th>Identificador</th><td><strong>SUB-JA-2026-251234</strong></td></tr>
<tr><th>Tipo de subasta</th><td><strong>JUDICIAL EN VÍA DE APREMIO</strong></td></tr>
<tr><th>Cuenta expediente</th><td>2930 0000 05 0123 24</td></tr>
<tr><th>Fecha de inicio</th><td>12-11-2026 18:00:00 CET  (ISO: 2026-11-12T18:00:00+01:00)</td></tr>
<tr><th>Fecha de conclusión</th><td>02-12-2026 18:00:00 CET  (ISO: 2026-12-02T18:00:00+01:00)</td></tr>
<tr><th>Cantidad reclamada</th><td>98.512,33 €</td></tr>
<tr><th>Lotes</th><td>Sin lotes</td></tr>
<tr><th>Anuncio BOE</th><td>BOE-B-2026-41001</td></tr>
<tr><th>Valor subasta</th><td>180.000,00 €</td></tr>
<tr><th>Tasación</th><td>185.400,00 €</td></tr>
<tr><th>Puja mínima</th><td>Sin puja mínima</td></tr>
<tr><th>Tramos entre pujas</th><td>3.600,00 €</td></tr>
<tr><th>Importe del depósito</th><td>9.000,00 €</td></tr>
</table></div>
"""

ASSETS = """
<div id="idBloqueDatos3">
<h4>Bien 1 - Inmueble (Vivienda)</h4>
<table>
<tr><th>Descripción</th><td>VIVIENDA EN CALLE EJEMPLO 1, 2ºB, 85 M2</td></tr>
<tr><th>Referencia catastral</th><td>0000000AA0000A0001AA</td></tr>
<tr><th>Dirección</th><td>CALLE EJEMPLO 1</td></tr>
<tr><th>Código Postal</th><td>29001</td></tr>
<tr><th>Localidad</th><td>Málaga</td></tr>
<tr><th>Provincia</th><td>Málaga</td></tr>
<tr><th>Situación posesoria</th><td>Ocupado</td></tr>
<tr><th>Visitable</th><td>No</td></tr>
</table>
</div>
"""


def test_search():
    items, nexts = boe.parse_search_page(SEARCH, "https://subastas.boe.es/subastas_ava.php")
    assert [i["id"] for i in items] == ["SUB-JA-2026-251234", "SUB-AT-2026-26R2886001001"] or \
        items[0]["id"] == "SUB-JA-2026-251234"
    assert items[0]["authority"].startswith("JUZGADO")
    assert "Celebrándose" in items[0]["status_text"]
    assert nexts == ["https://subastas.boe.es/subastas_ava.php?accion=Mas&id_busqueda=_ZXY-50-50"]


def test_general_and_record():
    g = boe.parse_general(GENERAL)
    assert g["id"] == "SUB-JA-2026-251234"
    assert g["valor_subasta"] == 180000.0
    assert g["deposito"] == 9000.0
    assert g["puja_minima"] is None
    assert g["fecha_fin"] == "2026-12-02T18:00:00+01:00"
    assets = boe.parse_assets(ASSETS)
    assert len(assets) == 1 and assets[0]["provincia"] == "Málaga"
    assert assets[0]["tipo_bien"] == "Vivienda"
    rec = boe.build_record({"id": g["id"], "summary": ""}, g, {"nombre": "Juzgado"}, assets)
    assert rec["origen"] == "judicial"
    assert rec["categoria"] == "vivienda"
    assert rec["provincia"] == "MÁLAGA"


FORM = """
<form action="subastas_ava.php" method="get" id="formBuscar">
 <input type="hidden" name="campo[0]" value="SUBASTA.ORIGEN">
 <select name="dato[0]"><option value="">Cualquiera</option><option value="J">Judicial</option></select>
 <input type="hidden" name="campo[2]" value="SUBASTA.ESTADO">
 <select name="dato[2]"><option value="" selected>Cualquiera</option><option value="PU">Próxima apertura</option><option value="EJ">Celebrándose</option></select>
 <input type="text" name="dato[5]" value="">
 <input type="checkbox" name="foo" value="1">
 <select name="page_hits"><option value="25">25</option><option value="50" selected>50</option><option value="500">500</option></select>
 <select name="sort_field[0]"><option value="SUBASTA.FECHA_FIN">Fin</option></select>
 <input type="hidden" name="accion" value="Buscar">
 <input type="submit" value="Buscar">
</form>
"""


def test_form():
    f = boe.parse_search_form(FORM, "https://subastas.boe.es/subastas_ava.php", "EJ")
    d = dict(f["fields"])
    assert f["method"] == "get" and f["url"] == "https://subastas.boe.es/subastas_ava.php"
    assert d["dato[2]"] == "EJ" and d["campo[2]"] == "SUBASTA.ESTADO"
    assert d["page_hits"] == "500" and d["accion"] == "Buscar" and "foo" not in d
    assert boe.parse_search_form("<form></form>", "x", "EJ") is None
    assert boe.page_error("<p>ERROR: Se ha producido un error en la b&uacute;squeda</p>").startswith("ERROR: Se ha")


def test_category_from_boe_type():
    a = [{"tipo_bien": "Vivienda", "titulo": "Bien 1 - Inmueble (Vivienda)", "descripcion": "FINCA ... SAN PEDRO DE NAVES"}]
    assert boe.category_of(a) == "vivienda"
    assert boe.category_of([{"tipo_bien": "Turismos", "titulo": "Bien 1 - Vehículo (Turismos)", "descripcion": ""}]) == "vehiculo"
    assert boe.category_of([{"tipo_bien": "Otros", "titulo": "Bien 1 - Inmueble (Otros)", "descripcion": "PLAZA DE GARAJE"}]) == "garaje"


def test_helpers():
    assert boe.parse_money("1.234.567,89 €") == 1234567.89
    assert boe.parse_date("01/12/2026 a las 18:00:00").startswith("2026-12-01T18:00")
    assert boe.categorize("Plaza de garaje nº 5") == "garaje"
    assert boe.categorize("Turismo Seat") == "vehiculo"
    assert boe.origin_from_id("SUB-AT-2026-1") == "hacienda"
    assert boe.status_code("Estado: Celebrándose - [Conclusión prevista: ...]", None) == "activa"
    assert boe.status_code("Concluida en Portal de Subastas", None) == "finalizada"
    assert boe.status_code("", "2000-01-01T00:00:00+00:00") == "finalizada"


if __name__ == "__main__":
    for name, fn in list(globals().items()):
        if name.startswith("test_"):
            fn()
            print("ok", name)
