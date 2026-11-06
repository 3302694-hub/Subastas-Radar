import urllib.request, xlrd
b = urllib.request.urlopen(urllib.request.Request("https://apps.fomento.gob.es/BoletinOnline2/sedal/35101000.XLS", headers={"User-Agent": "Mozilla/5.0"}), timeout=60).read()
sh = xlrd.open_workbook(file_contents=b).sheets()[-1]
for r in range(sh.nrows):
    print("ROW", r, "|".join(str(c)[:14] for c in sh.row_values(r)))
b = urllib.request.urlopen(urllib.request.Request("https://apps.fomento.gob.es/BoletinOnline2/sedal/35103500.XLS", headers={"User-Agent": "Mozilla/5.0"}), timeout=60).read()
sh = xlrd.open_workbook(file_contents=b).sheets()[-1]
for r in list(range(0, 16)) + list(range(120, 130)):
    print("MUN", r, "|".join(str(c)[:16] for c in sh.row_values(r)))
