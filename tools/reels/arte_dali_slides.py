"""Рилс «Налоговая продаёт Дали» — SUB-AT-2026-26R3386002007 (escultura «Trajano a caballo»).
Запуск: python3 tools/reels/arte_dali_slides.py /tmp/dali → /tmp/dali/t_*.png (1080x1920)
Фото и изображения скульптуры не используем (авторские права) — только типографика."""
import asyncio, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from playwright.async_api import async_playwright
from brand import CSS, ICON, brand, mark, page, SITE

OUT = sys.argv[1] if len(sys.argv) > 1 else '/tmp/dali'
os.makedirs(OUT, exist_ok=True)
CSS += '''.bz{position:absolute;inset:0;background:radial-gradient(110% 70% at 50% 10%,#6B4A24 0%,#3A2A14 45%,#160F07 100%)}
.bz::after{content:"";position:absolute;inset:40px;border:2px solid rgba(244,241,234,.12);border-radius:10px}
'''
SRC = '<div class="disc">Данные: BOE, аукцион SUB-AT-2026-26R3386002007 (AEAT, Астурия).</div>'

S = {}
S['h0'] = f'''<div class="bz"></div><div class="s" style="justify-content:flex-start;padding-top:200px">
<div class="tag">● АУКЦИОН BOE · ИДУТ ТОРГИ</div>
<h1 style="margin-top:70px">Налоговая<br>Испании<br>продаёт<br><span class="gold">Дали</span></h1>
<div class="rule"></div>
<div class="mid">Бронзовая скульптура<br>Сальвадора Дали —<br>на государственном аукционе</div>
<div class="mid muted" style="font-size:44px;margin-top:40px">Там же, где продают квартиры и машины</div></div>{brand()}{SRC}'''
S['what'] = f'''<div class="bz"></div><div class="s"><div class="tag">ЧТО ПРОДАЮТ</div>
<div class="gold" style="font-size:44px;font-weight:600;margin-top:20px">«Trajano a caballo»</div>
<h1 style="margin-top:14px;font-size:112px">Траян<br>на коне</h1>
<div class="row">
<div class="pill">Бронза, литьё по восковой модели<small>зелёная патина · отлита в 1982 году</small></div>
<div class="pill">Авторская отливка<small>prueba de artista: тираж 8 экземпляров + 2 авторских</small></div>
</div></div>{brand()}{SRC}'''
S['size'] = f'''<div class="bz"></div><div class="s"><div class="tag">РАЗМЕР</div>
<div class="big gold" style="font-size:170px;margin-top:20px">147 см</div>
<div class="mid muted" style="font-size:46px;margin-top:20px">147 × 120 × 84 см — сама скульптура</div>
<div class="row"><div class="pill">+ постамент из железа<small>160 × 180 × 81 см, оксидированный и вощёный</small></div></div>
<div class="mid" style="margin-top:60px;font-size:50px">Это не статуэтка на полку —<br>для неё нужен сад или холл</div></div>{brand()}{SRC}'''
S['traj'] = f'''<div class="bg"></div><div class="s"><div class="tag">КСТАТИ</div>
<div class="mid" style="font-size:72px;margin-top:20px">Траян — первый римский император, родившийся<br><span class="lime">не в Италии</span></div>
<div class="mid muted" style="font-size:52px;margin-top:50px">а в Италике —<br>под нынешней Севильей 🇪🇸</div></div>{brand()}'''
S['cmp'] = f'''<div class="bz"></div><div class="s"><div class="tag">ПОЧЕМУ ТАК ДОРОГО</div>
<div class="row" style="margin-top:40px">
<div class="pill">Маленькие отливки, ~20 см<small>тираж 375 экземпляров · продаются примерно за 2&nbsp;000&nbsp;€</small></div>
<div class="pill" style="background:rgba(232,196,138,.18)">Эта — 147 см<small>тираж 8 + 2 авторских, и это один из авторских</small></div>
</div>
<div class="mid muted" style="font-size:42px;margin-top:60px">оценка для торгов</div>
<div class="big gold">600 000 €</div></div>{brand()}
<div class="disc">Цена малых отливок — предложения галерей (1stDibs). Оценка — сумма, назначенная AEAT для торгов.</div>'''
S['cond'] = f'''<div class="bg"></div><div class="s"><div class="tag">УСЛОВИЯ</div>
<div class="row" style="margin-top:40px">
<div class="pill">до 23 ноября, 18:00<small>приём ставок на portal de subastas BOE</small></div>
<div class="pill">60 000 €<small>депозит — 10 % от оценки</small></div>
<div class="pill">Пока без ставок*<small>торги открыты с 3 ноября · Агентство по налогам, Астурия</small></div>
<div class="pill" style="font-size:44px">⚠️ Осмотр в BOE не указан<small>подлинность и состояние проверяйте сами, до ставки</small></div>
</div></div>{brand()}<div class="disc">*по данным BOE на 7 ноября 2026. Итоговую цену определят ставки.</div>'''
S['cta'] = f'''<div class="bg"></div><div class="s" style="align-items:center;text-align:center;justify-content:center;padding-bottom:300px">
{mark(200)}
<h1 style="margin-top:60px;font-size:96px">Квартиры, машины…<br><span class="gold">и Дали</span></h1>
<div class="mid muted" style="margin-top:30px">Сохрани, чтобы не потерять</div>
<div class="mid" style="margin-top:110px;font-size:54px">{SITE}</div>
<div class="mid muted" style="font-size:38px;margin-top:14px">все аукционы BOE на карте</div></div>'''

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-sandbox"])
        pg = await b.new_page(viewport={"width": 1080, "height": 1920})
        for k, v in S.items():
            f = f'{OUT}/x.html'
            open(f, 'w').write(page(v, css=CSS))
            await pg.goto('file://' + f); await pg.wait_for_timeout(250)
            await pg.screenshot(path=f'{OUT}/t_{k}.png')
        await b.close()
asyncio.run(main())
