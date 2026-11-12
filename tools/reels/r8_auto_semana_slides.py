"""r8 «Авто недели» — идущий аукцион машины (стиль Subástica).
Лот: SUB-AT-2026-26R3886002006 — Citroën C5 Aircross Plug-in Hybrid, рег. 10.08.2023, AEAT Тенерифе.
Запуск: python3 tools/reels/r8_auto_semana_slides.py /tmp/r8 → /tmp/r8/t_*.png (1080x1920)
Фото — документы аукциона BOE (site/social/src/<id>/foto_NN.jpg), номера размыты blur_boxes()."""
import asyncio, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from playwright.async_api import async_playwright
from brand import CSS, brand, mark, page, photo, photo_card, blur_boxes, SITE

OUT = sys.argv[1] if len(sys.argv) > 1 else '/tmp/r8'
os.makedirs(OUT, exist_ok=True)
SID = 'SUB-AT-2026-26R3886002006'
D = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', 'site/social/src', SID))
PLATES = {'foto_05': [(745, 330, 950, 430)], 'foto_01': [(225, 565, 535, 660)], 'foto_03': [(1075, 520, 1225, 670)],
          'foto_06': [(265, 295, 480, 370)], 'foto_08': [(190, 150, 375, 215)], 'foto_07': []}
for k, b in PLATES.items():
    blur_boxes(f'{D}/{k}.jpg', f'{OUT}/{k}.jpg', b, radius=22)
P = lambda k: f'file://{OUT}/{k}.jpg'

CSS += '''.cap{position:absolute;right:56px;top:964px;font-size:24px;opacity:.85;text-shadow:0 1px 6px rgba(0,0,0,.6)}
.kpi{font-size:200px;font-weight:700;letter-spacing:-.03em;line-height:.95;color:#E6B83A;white-space:nowrap}
.sub{font-size:46px;font-weight:600;line-height:1.2;margin-top:16px}
.old{font-size:72px;font-weight:600;opacity:.6;text-decoration:line-through}
.pill{font-size:42px;padding:22px 30px}
.pill small{font-size:28px}
.row{gap:14px}
'''
CAP = '<div class="cap">фото: документы аукциона BOE · номер скрыт</div>'
DISC = '<div class="disc">Оценка для торгов (valor de subasta) по данным BOE; это не рыночная цена. Итоговую цену определят ставки.</div>'

S = {}
S['h0'] = f'''{photo_card(P('foto_05'))}{CAP}<div class="tag" style="position:absolute;top:140px;left:56px">● Авто недели · аукцион идёт</div>
<div class="s" style="justify-content:flex-start;padding-top:1010px">
<h1 style="font-size:92px">Гибрид 2023 года</h1>
<div class="sub" style="margin-top:6px">Citroën C5 Aircross Plug-in Hybrid</div>
<div class="old" style="margin-top:20px;font-size:60px;opacity:.72">оценка 15&nbsp;544&nbsp;€</div>
<div class="kpi" style="margin-top:2px;font-size:158px">8&nbsp;054,40&nbsp;€</div><div class="sub" style="font-size:40px">текущая ставка · аукцион идёт</div></div>{brand()}{DISC}'''
S['spec'] = f'''{photo_card(P('foto_03'))}{CAP}<div class="tag" style="position:absolute;top:140px;left:56px">Что за машина</div><div class="s" style="justify-content:flex-start;padding-top:1000px">
<div class="row" style="margin-top:0">
<div class="pill">Подключаемый гибрид<small>бензин + электромотор, заряжается от розетки</small></div>
<div class="pill">Первая регистрация — август 2023<small>по данным BOE</small></div>
<div class="pill">Продаётся 100 % машины<small>полная собственность, не доля</small></div>
<div class="pill">Обременения — 0 €<small>по справке в документах аукциона</small></div>
</div></div>{brand()}'''
S['cmp'] = f'''{photo_card(P('foto_01'))}{CAP}<div class="tag" style="position:absolute;top:140px;left:56px">Для сравнения</div><div class="s" style="justify-content:flex-start;padding-top:1000px">
<div class="sub" style="margin-top:0">Новым этот гибрид стоил <span class="old" style="font-size:52px">от 38&nbsp;700&nbsp;€</span></div>
<div class="sub" style="margin-top:24px">Оценка для торгов</div>
<div class="kpi" style="font-size:150px">15&nbsp;544&nbsp;€</div>
<div class="row" style="margin-top:20px"><div class="pill">Депозит для участия — 1&nbsp;554&nbsp;€<small>10 % оценки, возвращается, если не выиграли</small></div></div></div>{brand()}
<div class="disc">Цена новой машины — версия Plug-in Hybrid 180, прайс Citroën Испания, 2022–2023 (motor.es).</div>'''
S['ojo'] = f'''{photo_card(P('foto_07'))}{CAP}<div class="tag" style="position:absolute;top:140px;left:56px">⚠️ Смотрите внимательно</div><div class="s" style="justify-content:flex-start;padding-top:1000px">
<div class="row" style="margin-top:0">
<div class="pill">На боку — вмятины и царапины<small>видно на фото из документов аукциона</small></div>
<div class="pill">Пробег проверьте сами<small>в отчёте о состоянии (informe de estado) в документах BOE</small></div>
<div class="pill">Машина на Тенерифе<small>перевозка и оформление — за счёт покупателя</small></div>
</div></div>{brand()}'''
S['cuando'] = f'''{photo_card(P('foto_06'))}{CAP}<div class="tag" style="position:absolute;top:140px;left:56px">Как участвовать</div><div class="s" style="justify-content:flex-start;padding-top:1000px">
<div class="row" style="margin-top:0">
<div class="pill">Ставки до 23 ноября, 18:00<small>на портале аукционов BOE</small></div>
<div class="pill">Машину можно осмотреть<small>контакт для осмотра указан в объявлении BOE</small></div>
<div class="pill">Продавец — Налоговое агентство<small>AEAT, отдел аукционов Тенерифе</small></div>
</div></div>{brand()}'''
S['cta'] = f'''{photo(P('foto_08'), pos='50% 50%', shade='full')}<div class="s" style="align-items:center;text-align:center;justify-content:center">
{mark(200)}
<h1 style="margin-top:60px;font-size:92px">Машины, квартиры, дома —<br><span class="hl">аукционы каждую неделю</span></h1>
<div class="mid" style="margin-top:110px;font-size:54px">{SITE}</div>
<div class="mid muted" style="font-size:38px;margin-top:14px">ссылка на этот лот — в описании</div></div>'''

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
