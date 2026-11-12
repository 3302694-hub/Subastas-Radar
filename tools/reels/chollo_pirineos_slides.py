"""Рилс «Чолло дня» — дом в Пиренеях (стиль Subástica).
Лот SUB-AT-2026-26R0886001336: casa de dos plantas, c/ Herrería 8, Embún (Valle de Hecho), Huesca.
Оценка 11.858,61 €, AEAT, до 16.11.2026. Фото фасада: Catastro. Аэрофото © IGN-PNOA.
Запуск: python3 tools/reels/chollo_pirineos_slides.py /tmp/chollo"""
import asyncio, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from playwright.async_api import async_playwright
from brand import CSS, brand, mark, page, photo, photo_card, SITE

OUT = sys.argv[1] if len(sys.argv) > 1 else '/tmp/chollo'
os.makedirs(OUT, exist_ok=True)
D = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', 'site/social/src/SUB-AT-2026-26R0886001336'))
FACH = f'file://{D}/fachada0.jpg'
CERCA = f'file://{D}/aereo_cerca0.jpg'
MEDIO = f'file://{D}/aereo_medio0.jpg'
LEJOS = f'file://{D}/aereo_lejos0.jpg'

CSS += '''.cap{position:absolute;right:56px;top:964px;font-size:24px;opacity:.85;text-shadow:0 1px 6px rgba(0,0,0,.6)}
.kpi{font-size:200px;font-weight:700;letter-spacing:-.03em;line-height:.95;color:#C8F031;white-space:nowrap}
.sub{font-size:48px;font-weight:600;line-height:1.2;margin-top:14px}
.pill{font-size:42px;padding:22px 30px}.pill small{font-size:28px}.row{gap:14px}
'''
CAP = '<div class="cap">фото: Catastro</div>'
DISC = '<div class="disc">Оценка для торгов (valor de subasta) по данным BOE — это не рыночная цена. Итоговую цену определят ставки. Аэрофото © IGN-PNOA.</div>'

S = {}
S['h0'] = f'''{photo_card(FACH, top=240, height=680)}{CAP}<div class="tag" style="position:absolute;top:140px;left:56px">● Чолло дня · аукцион идёт</div>
<div class="s" style="justify-content:flex-start;padding-top:1000px">
<h1 style="font-size:94px">Дом в <span class="hl">Пиренеях</span></h1>
<div class="kpi" style="margin-top:18px;font-size:172px">11&nbsp;858&nbsp;€</div>
<div class="sub" style="font-size:40px">целый дом, два этажа · оценка для торгов</div></div>{brand()}{DISC}'''

S['casa'] = f'''{photo(MEDIO, shade='both')}<div class="tag" style="position:absolute;top:150px;left:120px">Что за дом</div>
<div class="s" style="justify-content:center">
<div class="row">
<div class="pill">Каменный дом в два этажа<small>calle Herrería 8, село Embún</small></div>
<div class="pill">Valle de Hecho, Уэска<small>Арагонские Пиренеи</small></div>
<div class="pill">Участок 71,6 м²<small>по данным BOE</small></div>
<div class="pill">Продаётся 100 % дома<small>полная собственность, не доля</small></div>
</div></div>{brand()}{DISC}'''

S['precio'] = f'''{photo(CERCA, shade='both')}<div class="tag" style="position:absolute;top:150px;left:120px">Сколько и как</div>
<div class="s" style="justify-content:center">
<div class="sub" style="margin-top:0">Оценка для торгов</div>
<div class="kpi">11&nbsp;858&nbsp;€</div>
<div class="row" style="margin-top:34px">
<div class="pill">Депозит для участия — 593 €<small>5 % оценки, возвращается, если не выиграли</small></div>
<div class="pill">Ставки до 16 ноября<small>продавец — Налоговое агентство (AEAT)</small></div>
</div></div>{brand()}{DISC}'''

S['ojo'] = f'''{photo(MEDIO, shade='both', blur=4)}<div class="tag" style="position:absolute;top:150px;left:120px">⚠️ Проверьте перед ставкой</div>
<div class="s" style="justify-content:center">
<div class="row" style="margin-top:0">
<div class="pill">Кто живёт — не указано<small>situación posesoria: no consta</small></div>
<div class="pill">Осмотр не предусмотрен<small>visitable: no consta — внутрь до торгов не попасть</small></div>
<div class="pill">Состояние — по документам<small>село в Пиренеях, дом может требовать ремонта</small></div>
</div></div>{brand()}'''

S['cta'] = f'''{photo(LEJOS, shade='full')}<div class="s" style="align-items:center;text-align:center;justify-content:center">
{mark(200)}
<h1 style="margin-top:60px;font-size:90px">Дома, квартиры, земля —<br><span class="hl">аукционы BOE</span></h1>
<div class="mid" style="margin-top:100px;font-size:56px">{SITE}</div>
<div class="mid muted" style="font-size:38px;margin-top:14px">ссылка на этот лот — в профиле</div></div>'''

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
