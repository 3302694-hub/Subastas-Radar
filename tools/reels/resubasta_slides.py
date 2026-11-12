"""Рилс «Resubasta» — аукцион состоялся, объект выставлен снова (стиль Subástica).
Объект: вилла в Торревьехе (Los Balcones), C/ Raúl Ferrández Giménez 53.
1-й аукцион SUB-JA-2026-265255 (завершён 07.09.2026): стоимость 528 000 €, макс. ставка 295 680 € (56%).
2-й аукцион SUB-JA-2026-267773 (активен): снова на торгах до 16.11.2026.
Аэрофото © IGN-PNOA (CC BY 4.0). Запуск: python3 tools/reels/resubasta_slides.py /tmp/resub"""
import asyncio, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from playwright.async_api import async_playwright
from brand import CSS, brand, mark, page, photo, SITE

OUT = sys.argv[1] if len(sys.argv) > 1 else '/tmp/resub'
os.makedirs(OUT, exist_ok=True)
SRC = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', 'site/social/src/SUB-JA-2026-267773'))
CERCA = f'file://{SRC}/aereo_cerca0.jpg'
MEDIO = f'file://{SRC}/aereo_medio0.jpg'

CSS += '''.kpi{font-size:180px;font-weight:700;letter-spacing:-.03em;line-height:.95;color:#C8F031;white-space:nowrap}
.sub{font-size:48px;font-weight:600;line-height:1.2;margin-top:14px}
.old{font-size:66px;font-weight:600;opacity:.6;text-decoration:line-through}
.pill{font-size:42px;padding:22px 30px}.pill small{font-size:28px}.row{gap:14px}
.pct{font-size:50px}
'''
AER = '<div class="disc">Стоимость лота (valor de subasta) по данным BOE — это не рыночная цена. «Макс. ставка» — наивысшая ставка на завершённых торгах. Аэрофото © IGN-PNOA.</div>'

S = {}
S['h0'] = f'''{photo(CERCA, shade='hero_b')}<div class="s" style="justify-content:flex-start;padding-top:150px">
<div class="tag">● Торревьеха · судебный аукцион</div>
<h1 style="margin-top:34px;font-size:98px">Эту виллу уже<br><span class="hl">выставляли</span></h1>
<div class="sub" style="margin-top:20px">…и вот она снова на торгах</div></div>{brand()}
<div class="disc">Аэрофото © IGN-PNOA. Вилла с бассейном, урбанизация Los Balcones.</div>'''

S['historia'] = f'''{photo(MEDIO, shade='both')}<div class="tag" style="position:absolute;top:150px;left:120px">Что было</div>
<div class="s" style="justify-content:center">
<div class="sub" style="margin-top:0">Стартовая цена торгов</div>
<div class="kpi" style="font-size:150px">528&nbsp;000&nbsp;€</div>
<div class="sub" style="margin-top:28px">Максимальная ставка дошла до</div>
<div class="kpi">295&nbsp;680&nbsp;€</div>
<div class="pct" style="display:inline-block;align-self:flex-start;margin-top:18px">56&nbsp;% от стартовой цены</div>
<div class="sub" style="font-size:40px;margin-top:22px">Торги завершились 7 сентября 2026</div></div>{brand()}{AER}'''

S['ahora'] = f'''{photo(CERCA, shade='both')}<div class="tag" style="position:absolute;top:150px;left:120px">Что сейчас</div>
<div class="s" style="justify-content:center">
<h1 style="font-size:92px">Снова на<br><span class="hl">аукционе</span></h1>
<div class="row" style="margin-top:40px">
<div class="pill">Приём ставок — до 16 ноября<small>на портале аукционов BOE</small></div>
<div class="pill">Та же вилла, новые торги<small>второй заход после завершённого аукциона</small></div>
</div></div>{brand()}{AER}'''

S['ojo'] = f'''{photo(MEDIO, shade='both', blur=4)}<div class="tag" style="position:absolute;top:150px;left:120px">⚠️ Проверьте перед ставкой</div>
<div class="s" style="justify-content:center">
<div class="row" style="margin-top:0">
<div class="pill">Нет данных о жильцах<small>кто занимает дом — в объявлении не указано</small></div>
<div class="pill">Без осмотра<small>visitable: No — внутрь не попасть до торгов</small></div>
<div class="pill">Обременения не указаны<small>проверьте nota simple и документы аукциона</small></div>
</div></div>{brand()}'''

S['cta'] = f'''{photo(CERCA, shade='full')}<div class="s" style="align-items:center;text-align:center;justify-content:center">
{mark(200)}
<h1 style="margin-top:60px;font-size:90px">Следим за аукционами<br><span class="hl">за вас</span></h1>
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
