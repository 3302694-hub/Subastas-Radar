import sys, re, json
sys.path.insert(0, "scraper")
from bs4 import BeautifulSoup
import boe, scrape
f = scrape.Fetcher(delay=1.2)
def show(tag, url, n=700, raw=False):
    try:
        h = f.get(url)
        t = h if raw else BeautifulSoup(h, "html.parser").get_text(" | ", strip=True)
        print(f"=== {tag} [{f.last_status}] {url}\n{t[:n]}\n")
        return h
    except Exception as e:
        print(f"=== {tag} ERROR {e!r}\n")
        return ""
# 1. Catastro
for rc in ["7309217DF3970G0002KJ", "9979711XH9197H0030LQ"]:
    show("CAT DNPRC " + rc, f"https://ovc.catastro.meh.es/OVCServWeb/OVCWcfCallejero/COVCCallejero.svc/json/Consulta_DNPRC?RefCat={rc}", 2500, raw=True)
    show("CAT CPMRC " + rc, f"https://ovc.catastro.meh.es/OVCServWeb/OVCWcfCallejero/COVCCoordenadas.svc/json/Consulta_CPMRC?SRS=EPSG:4326&RefCat={rc[:14]}", 800, raw=True)
# 2. Active auctions: Pujas tab
for sid in ["SUB-JA-2026-266368", "SUB-JA-2026-266295", "SUB-JA-2026-245072", "SUB-RC-2026-0025I20260008", "SUB-JA-2026-263800"]:
    h = f.get(boe.detail_url(sid, 5))
    t = BeautifulSoup(h, "html.parser").get_text(" | ", strip=True)
    i = t.find("Pujas | Pujas")
    print("=== BIDS", sid, boe.parse_bids(h), "::", t[i:i+400] if i >= 0 else t[t.find("Subasta SUB"):][:500], "\n")
# 3. BOE gazette edict
show("EDICTO", "https://www.boe.es/diario_boe/txt.php?id=BOE-B-2026-31019", 1500)
# 4. ICANE MIVAU csv
show("ICANE", "https://www.icane.es/data/api/precio-vivienda-libre-municipios-tasaciones.csv", 1500, raw=True)
# 5. penotariado
h = show("PENOT", "https://www.penotariado.com/", 300, raw=True)
for s in re.findall(r'src="([^"]+\.js[^"]*)"', h)[:12]:
    print("script", s)
for m in set(re.findall(r'https?://[a-z0-9.\-]+/[a-z0-9_\-/]*api[a-z0-9_\-/]*', h, re.I)):
    print("api-like", m)
