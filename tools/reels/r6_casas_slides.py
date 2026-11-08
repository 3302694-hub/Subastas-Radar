"""r6 «Дом в Испании по цене квартиры?» — 3 дома в Торревьехе (стиль Subástica, v2: фото на весь кадр).
Запуск: python3 tools/reels/r6_casas_slides.py /tmp/r6 → /tmp/r6/t_*.png (1080x1920)
Материалы: site/social/src/<id>/ (fachada0.jpg — Catastro, aereo_*.jpg — © IGN-PNOA, parcela0.gml — контур участка)."""
import asyncio, math, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from PIL import Image
from playwright.async_api import async_playwright
from brand import CSS, brand, mark, page, photo, SITE

OUT = sys.argv[1] if len(sys.argv) > 1 else '/tmp/r6'
os.makedirs(OUT, exist_ok=True)
SRC = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', 'site/social/src'))
# draw(): контур участка на аэрофото — из parcel_outline.py (без его цикла по argv)
exec(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'parcel_outline.py')).read().split('for d in sys.argv')[0])
IDS = ['SUB-JA-2026-266978', 'SUB-JA-2026-265360', 'SUB-JA-2025-254149']
cwd = os.getcwd(); os.chdir(SRC)
for d in IDS:
    draw(d, 'aereo_cerca0.jpg', 70, 125, f'{OUT}/{d}_cerca.jpg', 7)
    f = Image.open(f'{d}/fachada0.jpg').convert('RGB'); W, H = f.size
    f = f.crop((0, 24, W, H)); W, H = f.size; th = int(W / 1.4)
    f.crop((0, (H - th) // 2, W, (H - th) // 2 + th)).resize((700, 500)).save(f'{OUT}/{d}_fac.jpg', quality=92)
for n, (d, a) in enumerate([('SUB-JA-2025-254149', 'aereo_medio0'), ('SUB-JA-2026-266978', 'aereo_lejos0'), ('SUB-JA-2026-265360', 'aereo_medio0')]):
    Image.open(f'{d}/{a}.jpg').save(f'{OUT}/bg{n}.jpg', quality=90)
os.chdir(cwd)
P = lambda n: f'file://{OUT}/{n}'

CSS += '''.rank{font-family:'IBM Plex Serif',serif;font-size:120px;font-weight:600;line-height:.9;color:#D4A017}
.ttl{font-family:'IBM Plex Serif',serif;font-size:70px;font-weight:600;line-height:1.05;margin-top:14px}
.fac{position:absolute;right:80px;top:560px;width:460px;height:328px;object-fit:cover;border-radius:10px;border:6px solid #F4F1EA;box-shadow:0 20px 50px rgba(0,0,0,.45)}
.faccap{position:absolute;right:80px;top:902px;font-size:24px;opacity:.85;text-shadow:0 1px 6px rgba(0,0,0,.7)}
.price{display:flex;align-items:baseline;gap:22px;margin-top:20px;font-size:46px;font-weight:600}
.price s{opacity:.6}
.price b{font-size:96px;color:#E6B83A;font-weight:700}
.lbl{font-size:32px;opacity:.75;margin-top:26px}
'''
D2 = '<div class="disc">Максимальная ставка на аукционе BOE; итоговая сделка может отличаться. Фото: Catastro · аэрофото © IGN-PNOA, граница участка — Catastro.</div>'

def house(rank, idf, ttl, chips, old, new, pct):
    ch = ''.join(f'<span class="chip{" y" if c.startswith("🏊") else ""}">{c}</span>' for c in chips)
    pc = f'<span class="pct" style="margin:0;font-size:46px">{pct}</span>' if pct else ''
    return f'''{photo(P(idf + "_cerca.jpg"), shade="both")}
<div class="s" style="justify-content:space-between;padding-top:160px;padding-bottom:380px">
<div><div class="rank">{rank}</div><div class="ttl">{ttl}</div></div>
<div><div class="chips">{ch}</div><div class="lbl">оценка для торгов → максимальная ставка</div>
<div class="price"><s>{old}</s><b>{new}</b>{pc}</div></div></div>
<img class="fac" src="{P(idf + '_fac.jpg')}"><div class="faccap">фасад · Catastro</div>{brand()}{D2}'''

S = {}
S['h0'] = f'''{photo(P("bg0.jpg"), shade="both")}<div class="s" style="justify-content:space-between;padding-top:200px">
<div><div class="tag">● Аукционы BOE · Торревьеха</div>
<h1 style="margin-top:50px;font-size:118px">Дом в Испании<br>по цене<br><span class="hl">квартиры?</span></h1></div>
<div class="mid" style="font-size:56px">3 реальных аукциона<br>на Коста-Бланке</div></div>{brand()}
<div class="disc">Аэрофото © Instituto Geográfico Nacional (PNOA)</div>'''
S['h3'] = house('#3', 'SUB-JA-2026-266978', 'Дом 133 м²<br>на участке 800 м²', ['3 спальни · 2 ванные', '1997', 'Av. Mediterráneo'], '501 568 €', '321 004 €', '−36 %')
S['h2'] = house('#2', 'SUB-JA-2026-265360', 'Одноэтажный дом<br>286 м², участок 800 м²', ['1988', 'Calle Covadonga'], '701 700 €', '406 986 €', '−42 %')
S['h1'] = house('#1', 'SUB-JA-2025-254149', 'Дом 241 м², 2 этажа<br>+ гараж', ['🏊 бассейн на аэрофото', '2006', 'C/ Emilio Castelar'], '309 276 €', '303 090 €', '')
S['cmp'] = f'''{photo(P("bg1.jpg"), shade="full")}<div class="s"><div class="tag">Сравним за 1 м²</div>
<div class="row" style="margin-top:0">
<div class="pill">Квартира в Мадриде</div>
<div class="big" style="font-size:150px;margin:-6px 0 40px 6px">5 418 €</div>
<div class="pill" style="border-color:rgba(212,160,23,.6)">Эти дома в Торревьехе</div>
<div class="big hl" style="font-size:130px;margin-left:6px">1 258–2 414 €</div>
<div class="mid muted" style="font-size:40px;margin-top:30px">Мадрид — средняя оценка жилья MIVAU, II кв. 2026.<br>Дома — максимальная ставка ÷ площадь из BOE.</div></div></div>{brand()}
<div class="disc">Аэрофото © IGN-PNOA</div>'''
S['cta'] = f'''{photo(P("bg2.jpg"), shade="full")}<div class="s" style="align-items:center;text-align:center;justify-content:center;padding-bottom:380px">
{mark(200)}
<h1 style="margin-top:60px">Такие аукционы<br><span class="hl">каждую неделю</span></h1>
<div class="mid muted" style="margin-top:30px">Сохрани, чтобы не потерять</div>
<div class="mid" style="margin-top:110px;font-size:54px">{SITE}</div>
<div class="mid muted" style="font-size:38px;margin-top:14px">все аукционы недвижимости Испании на карте</div></div>'''

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-sandbox", "--allow-file-access-from-files"])
        pg = await b.new_page(viewport={"width": 1080, "height": 1920})
        for k, v in S.items():
            open(f'{OUT}/x.html', 'w').write(page(v, css=CSS))
            await pg.goto(f'file://{OUT}/x.html'); await pg.wait_for_timeout(400)
            await pg.screenshot(path=f'{OUT}/t_{k}.png')
        await b.close()
asyncio.run(main())
