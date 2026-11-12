"""Рилс «Цифры недели» — что продаёт государство на аукционах BOE прямо сейчас (стиль Subástica).
Запуск: python3 tools/reels/cifras_semana_slides.py /tmp/cifras → /tmp/cifras/t_*.png (1080x1920)
Каждую неделю: обновить D (запросы — в docs/SOCIAL.md, раздел «Цифры недели») и фоны BG (аэрофото лотов из
site/social/src/<id>/, материалы — workflow social-assets.yml)."""
import asyncio, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from playwright.async_api import async_playwright
from brand import CSS, brand, mark, page, photo, SITE

OUT = sys.argv[1] if len(sys.argv) > 1 else '/tmp/cifras'
os.makedirs(OUT, exist_ok=True)
SRC = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', 'site/social/src'))
F = lambda d, f: f'file://{SRC}/{d}/{f}.jpg'

# Снимок базы на дату выпуска (активные + ближайшие аукционы)
D = dict(fecha='11 ноября 2026', hasta='18 ноября', total=1454, valor_mln=256, nuevas=355, terminan=348,
         cats=[('Квартиры и дома', 827), ('Гаражи', 158), ('Помещения', 121), ('Сельские участки', 105), ('Участки под застройку', 87), ('Машины', 34)],
         provs=[('Барселона', 132), ('Мадрид', 126), ('Мурсия', 105), ('Аликанте', 104), ('Валенсия', 74)],
         mediana_viv=132649, viv_100k=281)
BG = dict(h0=F('SUB-JA-2026-267857', 'aereo_lejos0'), cats=F('SUB-JA-2026-268255', 'aereo_medio0'),
          precio=F('SUB-JA-2026-267857', 'aereo_medio0'), provs=F('SUB-JA-2026-259014', 'aereo_lejos0'),
          ritmo=F('SUB-JA-2025-254149', 'aereo_medio0'), arte=F('SUB-AT-2026-26R3386002007', 'foto_01'),
          cta=F('SUB-JA-2026-268255', 'aereo_lejos0'))
n = lambda x: f'{x:,}'.replace(',', '&nbsp;')

CSS += '''.cap{position:absolute;right:120px;top:120px;font-size:24px;opacity:.8}
.bars{display:flex;flex-direction:column;gap:26px;margin-top:50px}
.bar{display:grid;grid-template-columns:1fr auto;gap:6px 20px;align-items:end}
.bar .l{font-size:40px;font-weight:600}
.bar .v{font-size:56px;font-weight:700;color:#E6B83A}
.bar .t{grid-column:1/3;height:16px;border-radius:4px;background:rgba(244,241,234,.15);overflow:hidden}
.bar .t i{display:block;height:100%;background:#D4A017}
.kpi{font-size:240px;font-weight:700;letter-spacing:-.04em;line-height:.95;color:#E6B83A;white-space:nowrap}
.sub{font-size:48px;font-weight:600;line-height:1.2;margin-top:18px}
'''
AER = '<div class="disc">Аэрофото районов, где сейчас идут аукционы: © Instituto Geográfico Nacional (PNOA).</div>'

def bars(rows):
    mx = max(v for _, v in rows)
    return '<div class="bars">' + ''.join(
        f'<div class="bar"><span class="l">{l}</span><span class="v">{n(v)}</span><span class="t"><i style="width:{v / mx * 100:.1f}%"></i></span></div>'
        for l, v in rows) + '</div>'

S = {}
S['h0'] = f'''{photo(BG['h0'], shade='both')}<div class="s" style="justify-content:space-between;padding-top:200px">
<div><div class="tag">● Цифры недели · {D['fecha']}</div>
<h1 style="margin-top:50px;font-size:108px">Что сейчас<br>продаёт<br><span class="hl">государство</span></h1></div>
<div><div class="kpi">{n(D['total'])}</div><div class="sub">аукционов BOE идут или вот-вот начнутся —<br>с оценкой для торгов на {D['valor_mln']} млн €</div></div></div>{brand()}{AER}'''
S['cats'] = f'''{photo(BG['cats'], shade='full')}<div class="cap">Мадрид · аэрофото © IGN-PNOA</div><div class="s">
<div class="tag">Что продают</div>{bars(D['cats'])}
<div class="sub muted" style="font-size:36px;margin-top:40px">+ склады, кладовки, права, техника<br>и даже искусство</div></div>{brand()}'''
S['precio'] = f'''{photo(BG['precio'], shade='full')}<div class="cap">Барселона · аэрофото © IGN-PNOA</div><div class="s">
<div class="tag">Сколько стоят квартиры</div>
<div class="sub" style="margin-top:40px">Половина квартир и домов —<br>с оценкой до</div>
<div class="kpi" style="font-size:190px">{n(-(-D['mediana_viv'] // 1000) * 1000)}&nbsp;€</div>
<div class="row"><div class="pill">{n(D['viv_100k'])} лотов дешевле 100 000 €<small>среди них есть доли и узуфрукт — на сайте они помечены</small></div></div></div>{brand()}
<div class="disc">Оценка для торгов (valor de subasta) по данным BOE; это не рыночная цена и не цена продажи.</div>'''
S['provs'] = f'''{photo(BG['provs'], shade='full')}<div class="cap">Мурсия · аэрофото © IGN-PNOA</div><div class="s">
<div class="tag">Где больше всего</div>{bars(D['provs'])}
<div class="sub muted" style="font-size:36px;margin-top:40px">Аукционы идут по всей Испании</div></div>{brand()}'''
S['ritmo'] = f'''{photo(BG['ritmo'], shade='full')}<div class="cap">Торревьеха · аэрофото © IGN-PNOA</div><div class="s">
<div class="tag">Ритм недели</div>
<div class="kpi" style="margin-top:40px;font-size:200px">+{n(D['nuevas'])}</div><div class="sub">новых аукционов за 7 дней</div>
<div class="kpi" style="margin-top:70px;font-size:200px">{n(D['terminan'])}</div><div class="sub">закончатся до {D['hasta']} —<br>успейте посмотреть</div></div>{brand()}'''
S['arte'] = f'''{photo(BG['arte'], pos='50% 45%', shade='bottom')}<div class="cap">фото: документы аукциона BOE</div>
<div class="s" style="justify-content:flex-end">
<div class="tag" style="position:absolute;top:170px;left:120px;background:rgba(20,51,38,.7)">Лот недели</div>
<h1 style="font-size:96px">Бронзовый<br><span class="hl">Дали</span></h1>
<div class="sub">«Траян на коне», оценка 600&nbsp;000 € —<br>торги до 23 ноября</div></div>{brand()}'''
S['cta'] = f'''{photo(BG['cta'], shade='full')}<div class="s" style="align-items:center;text-align:center;justify-content:center">
{mark(200)}
<h1 style="margin-top:60px;font-size:96px">Цифры<br><span class="hl">каждую неделю</span></h1>
<div class="mid muted" style="margin-top:30px">Подпишись, чтобы не пропустить</div>
<div class="mid" style="margin-top:110px;font-size:54px">{SITE}</div>
<div class="mid muted" style="font-size:38px;margin-top:14px">все аукционы BOE на карте</div></div>'''

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
