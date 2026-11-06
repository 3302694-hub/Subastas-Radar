import sys, re, urllib.request
sys.path.insert(0, "scraper")
import scrape
f = scrape.Fetcher(delay=1.0)
def raw(url, ua=None):
    try:
        req = urllib.request.Request(url, headers={"User-Agent": ua or "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130 Safari/537.36", "Accept": "*/*"})
        with urllib.request.urlopen(req, timeout=30) as r:
            b = r.read()
            print(f"=== {r.status} {url} {len(b)} bytes ct={r.headers.get('content-type')}")
            return b
    except Exception as e:
        print(f"=== ERR {url} {e!r}")
        return b""
for code in ["35103500", "35101000", "35103000", "35103600"]:
    b = raw(f"https://apps.fomento.gob.es/BoletinOnline2/sedal/{code}.XLS")
    if b[:8]: print("   head", b[:8])
h = raw("https://www.mivau.gob.es/vivienda/estadisticas/valor-tasado-de-vivienda")
if not h:
    h = raw("https://www.mivau.gob.es/el-ministerio/informacion-estadistica/vivienda-y-actuaciones-urbanas/estadisticas/valor-tasado-de-vivienda")
for m in sorted(set(re.findall(rb'href="([^"]+\.(?:xls|xlsx|csv)[^"]*)"', h, re.I)))[:20]:
    print("   link", m.decode(errors="replace"))
p = raw("https://www.penotariado.com/")
for s in re.findall(rb'src="([^"]+\.js[^"]*)"', p)[:10]:
    print("   script", s.decode(errors="replace"))
print(raw("https://www.penotariado.com/robots.txt")[:600].decode(errors="replace"))
for m in sorted(set(re.findall(rb'https?://[a-z0-9.\-]+penotariado[a-z0-9.\-]*/[^"\' )]*', p, re.I)))[:20]:
    print("   url", m.decode(errors="replace"))
