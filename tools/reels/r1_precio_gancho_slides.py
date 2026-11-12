import asyncio, os, sys
from playwright.async_api import async_playwright
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from brand import CSS, ICON, brand, mark, SITE
DISC='<div class="disc">Оценка по открытым данным (MIVAU), требует проверки. Итоговая цена определяется ставками.</div>'
S={}
S['s1']=f'''<div class="s" style="padding:0;justify-content:flex-start"><img src="bg.jpg" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;opacity:.55">
<div style="position:absolute;inset:0;background:linear-gradient(180deg,rgba(20,51,38,.85) 0%,rgba(20,51,38,.2) 40%,rgba(20,51,38,.9) 100%)"></div>
<div style="position:relative;padding:170px 120px 0"><div class="tag">● АУКЦИОН BOE · МАДРИД</div>
<h1 style="margin-top:44px;font-size:104px">Квартира<br>в Мадриде</h1></div>
<img src="card.jpg" style="position:relative;margin:56px 60px 0;width:960px;height:555px;object-fit:cover;border-radius:12px;box-shadow:0 30px 80px rgba(0,0,0,.5)">
<div style="position:relative;padding:50px 120px 0"><div class="mid muted" style="font-size:52px">на аукционе за</div><div class="big lime" style="font-size:190px">80 000 €</div></div>
<div class="disc" style="bottom:60px">Фото: Dirección General del Catastro</div></div>{brand().replace('bottom:110px','')}'''
S['s2']=f'''<div class="bg"></div><div class="s"><div class="tag">ОБЪЕКТ</div>
<div class="row" style="margin-top:60px">
<div class="pill">85 м²<small>площадь (Catastro)</small></div>
<div class="pill">1963<small>год постройки</small></div>
<div class="pill" style="font-size:50px">Calle Nuestra Señora<br>de la Luz, Madrid<small></small></div>
<div class="pill">Квартира<small>1-й этаж</small></div></div></div>{brand()}'''
def s3(v):
    return f'''<div class="bg"></div><div class="s"><div class="tag">РЫНОЧНАЯ ОЦЕНКА</div>
<div style="margin-top:0" class="mid muted">Похожая квартира в Мадриде стоит</div>
<div class="big" style="font-size:150px;margin-top:20px">≈ {v}</div>
<div class="mid muted" style="font-size:44px;margin-top:40px">5 418 €/м² × 85 м²<br>средняя оценка жилья в Мадриде, MIVAU · II кв. 2026</div></div>{brand()}{DISC}'''
S['s4']=f'''<div class="bg"></div><div class="s"><div class="tag">РАЗНИЦА</div>
<div class="big lime" style="font-size:300px;margin-top:0">−83 %</div>
<div class="mid" style="margin-top:20px">цена аукциона ниже<br>рыночной оценки</div>
<div class="row"><div class="pill">80 000 €<small>аукцион</small></div><div class="pill">≈ 460 600 €<small>оценка</small></div></div></div>{brand()}{DISC}'''
S['s5']=f'''<div class="bg"></div><div class="s"><div class="tag">УСЛОВИЯ</div>
<div class="row" style="margin-top:60px">
<div class="pill">до 18 ноября<small>приём ставок</small></div>
<div class="pill">4 000 €<small>депозит 5 %</small></div>
<div class="pill" style="font-size:46px;line-height:1.25;display:block">⚠️ Возможны долги<br>и обременения:<br>перед ставкой проверьте<br>nota simple</div></div></div>{brand()}{DISC}'''
S['s6']=f'''<div class="bg"></div><div class="s" style="align-items:center;text-align:center;justify-content:center;padding-bottom:300px">
{mark(200)}
<h1 style="margin-top:60px">Пиши <span class="lime">SUBASTA</span><br>в комментариях</h1>
<div class="mid muted" style="margin-top:30px">пришлю ссылку на лот</div>
<div class="mid" style="margin-top:110px;font-size:54px">{SITE}</div>
<div class="mid muted" style="font-size:38px;margin-top:14px">все аукционы недвижимости Испании на карте</div></div>'''
async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch(executable_path="/usr/bin/google-chrome",args=["--no-sandbox"])
        pg=await b.new_page(viewport={"width":1080,"height":1920})
        async def shot(html,name):
            await pg.set_content(f'<html><head><style>{CSS}</style></head><body>{html}</body></html>')
            await pg.wait_for_timeout(150)
            await pg.screenshot(path=name)
        import os
        base='file:///tmp/reel/'
        await pg.goto(base+'x.html') if os.path.exists('/tmp/reel/x.html') else None
        for k,v in S.items():
            open('/tmp/reel/x.html','w').write(f'<html><head><style>{CSS}</style></head><body>{v}</body></html>')
            await pg.goto(base+'x.html'); await pg.wait_for_timeout(200); await pg.screenshot(path=f'/tmp/reel/{k}.png')
        os.makedirs('/tmp/reel/cnt',exist_ok=True)
        N=36
        for i in range(N+1):
            t=i/N; e=1-(1-t)**3; val=round(460600*e/100)*100
            txt=f"{val:,}".replace(","," ")+" €"
            open('/tmp/reel/x.html','w').write(f'<html><head><style>{CSS}</style></head><body>{s3(txt)}</body></html>')
            await pg.goto(base+'x.html'); await pg.screenshot(path=f'/tmp/reel/cnt/{i:03d}.png')
        await b.close()
asyncio.run(main())
