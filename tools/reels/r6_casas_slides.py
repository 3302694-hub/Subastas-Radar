import asyncio, os
from playwright.async_api import async_playwright
exec(open('/tmp/reel/slides.py').read().split("S={}")[0])   # CSS, ICON, brand()
CSS+='''.card{width:920px;height:575px;object-fit:cover;border-radius:30px;display:block}
.cards{display:flex;flex-direction:column;gap:22px;margin-top:40px}
.rank{font-size:40px;font-weight:700;opacity:.85}
.ttl{font-size:68px;font-weight:800;line-height:1.05;margin-top:14px}
.price{display:flex;align-items:baseline;gap:22px;margin-top:26px;font-size:46px;font-weight:600}
.price s{opacity:.55}
.price b{font-size:78px;color:#9CF2C4}
.chips{display:flex;flex-wrap:wrap;gap:12px;margin-top:22px}
.chip{background:rgba(255,255,255,.12);border-radius:999px;padding:10px 22px;font-size:34px;font-weight:600}
.chip.y{background:#FFD600;color:#062B29}'''
D2='<div class="disc">Максимальная ставка на аукционе BOE; итоговая сделка может отличаться. Фото: Catastro · аэрофото © IGN (PNOA)</div>'
def house(rank,idf,ttl,chips,old,new,pct):
    return f'''<div class="bg"></div><div class="s" style="justify-content:flex-start;padding-top:120px">
<div class="rank">{rank}</div><div class="ttl">{ttl}</div>
<div class="cards"><img class="card" src="{idf}_fac.jpg" style="height:430px"><img class="card" src="{idf}_air.jpg" style="height:500px"></div>
<div class="chips">{''.join(f'<span class="chip{" y" if c.startswith("🏊") else ""}">{c}</span>' for c in chips)}</div>
<div class="mid muted" style="font-size:32px;margin-top:26px">оценка для торгов → максимальная ставка</div><div class="price" style="margin-top:4px"><s>{old}</s><b>{new}</b><span class="lime">{pct}</span></div></div>{brand()}{D2}'''
S={}
S['h0']=f'''<div class="s" style="padding:0"><img src="hook_bg.jpg" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover">
<div style="position:absolute;inset:0;background:linear-gradient(180deg,rgba(6,43,41,.9) 0%,rgba(6,43,41,.35) 45%,rgba(6,43,41,.92) 100%)"></div>
<div style="position:relative;padding:200px 80px 0"><div class="tag">● АУКЦИОНЫ BOE · ТОРРЕВЬЕХА</div>
<h1 style="margin-top:50px;font-size:118px">Дом в Испании<br>по цене<br><span class="lime">квартиры?</span></h1>
<div class="mid" style="margin-top:50px;font-size:56px">3 реальных аукциона<br>на Коста-Бланке</div></div>
<div class="disc" style="bottom:60px">Аэрофото © Instituto Geográfico Nacional (PNOA)</div></div>{brand().replace('bottom:110px','')}'''
S['h3']=house('#3','SUB-JA-2026-266978','Дом 133 м²<br>на участке 800 м²',['3 спальни · 2 ванные','1997','Av. Mediterráneo'],'501 568 €','321 004 €','−36 %')
S['h2']=house('#2','SUB-JA-2026-265360','Одноэтажный дом 286 м²<br>на участке 800 м²',['1988','Calle Covadonga'],'701 700 €','406 986 €','−42 %')
S['h1']=house('#1','SUB-JA-2025-254149','Дом 241 м², 2 этажа<br>+ гараж',['🏊 бассейн на аэрофото','2006','C/ Emilio Castelar'],'309 276 €','303 090 €','')
S['cmp']=f'''<div class="bg"></div><div class="s"><div class="tag">СРАВНИМ ЗА 1 М²</div>
<div class="row" style="margin-top:0">
<div class="pill">Квартира в Мадриде<small></small></div>
<div class="big" style="font-size:150px;margin:-6px 0 40px 6px">5 418 €</div>
<div class="pill" style="background:rgba(156,242,196,.16)">Эти дома в Торревьехе<small></small></div>
<div class="big lime" style="font-size:130px;margin-left:6px">1 258–2 414 €</div>
<div class="mid muted" style="font-size:40px;margin-top:30px">Мадрид — средняя оценка жилья MIVAU, II кв. 2026.<br>Дома — максимальная ставка ÷ площадь из BOE.</div></div></div>{brand()}'''
S['cta']=f'''<div class="bg"></div><div class="s" style="align-items:center;text-align:center;justify-content:center;padding-bottom:300px">
<div class="mark" style="width:200px;height:200px;border-radius:52px">{ICON.replace('width="70" height="41"','width="150" height="87"')}</div>
<h1 style="margin-top:60px">Такие аукционы —<br><span class="lime">каждую неделю</span></h1>
<div class="mid muted" style="margin-top:30px">Сохрани, чтобы не потерять</div>
<div class="mid" style="margin-top:110px;font-size:54px">subastica.es</div>
<div class="mid muted" style="font-size:38px;margin-top:14px">все аукционы недвижимости Испании на карте</div></div>'''
async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch(executable_path="/usr/bin/google-chrome",args=["--no-sandbox"])
        pg=await b.new_page(viewport={"width":1080,"height":1920})
        for k,v in S.items():
            open('/tmp/reel/x.html','w').write(f'<html><head><style>{CSS}</style></head><body>{v}</body></html>')
            await pg.goto('file:///tmp/reel/x.html'); await pg.wait_for_timeout(250); await pg.screenshot(path=f'/tmp/reel/t_{k}.png')
        await b.close()
asyncio.run(main())
