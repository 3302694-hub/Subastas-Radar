"""Рилс «Налоговая продаёт Дали» — SUB-AT-2026-26R3386002007 (escultura «Trajano a caballo»).
Запуск: python3 tools/reels/arte_dali_slides.py /tmp/dali → /tmp/dali/t_*.png (1080x1920)
Фото и изображения скульптуры не используем (авторские права) — только типографика."""
import asyncio, os, sys
from playwright.async_api import async_playwright

OUT = sys.argv[1] if len(sys.argv) > 1 else '/tmp/dali'
os.makedirs(OUT, exist_ok=True)
ICON = '<svg viewBox="2.5 8.5 19 11" width="70" height="41" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round"><path d="M4 18a8 8 0 0116 0"/><path d="M8 18a4 4 0 018 0"/><path d="M12 18l5-7"/></svg>'
CSS = '''*{box-sizing:border-box;margin:0}body{width:1080px;height:1920px;overflow:hidden;font-family:'Inter Display','Inter',sans-serif;color:#fff;background:#0B3F3C}
.s{position:absolute;inset:0;display:flex;flex-direction:column;justify-content:center;padding:170px 80px 260px}
.bg{position:absolute;inset:0;background:radial-gradient(120% 80% at 50% 0%,#0E7A73 0%,#0B4E4A 45%,#062B29 100%)}
.bz{position:absolute;inset:0;background:radial-gradient(110% 70% at 50% 10%,#6B4A24 0%,#3A2A14 45%,#160F07 100%)}
.tag{display:inline-flex;align-self:flex-start;gap:14px;align-items:center;background:rgba(255,255,255,.14);border-radius:999px;padding:14px 26px;font-size:34px;font-weight:600;letter-spacing:.06em}
.brand{position:absolute;left:80px;bottom:110px;display:flex;gap:18px;align-items:center;font-size:40px;font-weight:700}
.mark{width:84px;height:84px;border-radius:22px;background:#0B6B66;border:3px solid rgba(255,255,255,.25);display:flex;align-items:center;justify-content:center}
.disc{position:absolute;left:80px;right:80px;bottom:50px;font-size:24px;opacity:.6}
h1{font-size:120px;line-height:1.0;font-weight:800;letter-spacing:-.02em}
.mid{font-size:56px;font-weight:700;line-height:1.15}
.muted{opacity:.75}.lime{color:#9CF2C4}.gold{color:#E8C48A}
.big{font-size:190px;font-weight:800;letter-spacing:-.04em;line-height:1;white-space:nowrap}
.row{display:flex;flex-direction:column;gap:24px;margin-top:56px}
.pill{background:rgba(255,255,255,.1);border-radius:28px;padding:30px 38px;font-size:50px;font-weight:700;line-height:1.2}
.pill small{display:block;font-size:32px;font-weight:500;opacity:.7;margin-top:6px}
.rule{width:180px;height:8px;border-radius:4px;background:#E8C48A;margin:50px 0}
'''
def brand(): return f'<div class="brand"><div class="mark">{ICON}</div>Subástica</div>'
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
<div class="mark" style="width:200px;height:200px;border-radius:52px">{ICON.replace('width="70" height="41"', 'width="150" height="87"')}</div>
<h1 style="margin-top:60px;font-size:96px">Квартиры, машины…<br><span class="gold">и Дали</span></h1>
<div class="mid muted" style="margin-top:30px">Сохрани, чтобы не потерять</div>
<div class="mid" style="margin-top:110px;font-size:54px">subastica.es</div>
<div class="mid muted" style="font-size:38px;margin-top:14px">все аукционы BOE на карте</div></div>'''

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-sandbox"])
        pg = await b.new_page(viewport={"width": 1080, "height": 1920})
        for k, v in S.items():
            f = f'{OUT}/x.html'
            open(f, 'w').write(f'<html><head><meta charset="utf-8"><style>{CSS}</style></head><body>{v}</body></html>')
            await pg.goto('file://' + f); await pg.wait_for_timeout(250)
            await pg.screenshot(path=f'{OUT}/t_{k}.png')
        await b.close()
asyncio.run(main())
