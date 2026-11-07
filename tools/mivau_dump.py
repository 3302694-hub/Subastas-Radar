import sys, urllib.request, xlrd
for url in sys.argv[1:]:
    data = urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"}), timeout=90).read()
    wb = xlrd.open_workbook(file_contents=data)
    print("==", url, len(data), "bytes, sheets:", wb.sheet_names()[:3], "...", wb.sheet_names()[-3:])
    sh = wb.sheets()[-1]
    print("last sheet", sh.name, sh.nrows, "x", sh.ncols)
    for r in list(range(min(sh.nrows, 22))) + [r for r in range(sh.nrows) if any("adalona" in str(c) for c in sh.row_values(r))]:
        print(r, [c for c in sh.row_values(r)][:12])
