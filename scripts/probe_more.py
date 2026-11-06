import urllib.request, xlrd
for code in ["35103500", "35101000"]:
    b = urllib.request.urlopen(urllib.request.Request(f"https://apps.fomento.gob.es/BoletinOnline2/sedal/{code}.XLS", headers={"User-Agent": "Mozilla/5.0"}), timeout=60).read()
    wb = xlrd.open_workbook(file_contents=b)
    print("=== FILE", code, "sheets:", len(wb.sheets()), [s.name for s in wb.sheets()][:6], "...", [s.name for s in wb.sheets()][-4:])
    for sh in [wb.sheets()[0], wb.sheets()[-1]]:
        print("--- sheet", sh.name, sh.nrows, "x", sh.ncols)
        for r in range(min(sh.nrows, 22)):
            print("  ", r, [str(c)[:22] for c in sh.row_values(r)[:9]])
    if code == "35103500":
        sh = wb.sheets()[-1]
        for r in range(sh.nrows):
            row = sh.row_values(r)
            if any("Badalona" in str(c) or "Caravaca" in str(c) or "Albacete" in str(c) for c in row[:3]):
                print("  hit", r, [str(c)[:22] for c in row[:9]])
