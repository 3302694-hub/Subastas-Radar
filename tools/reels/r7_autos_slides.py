"""r7 «Машины дешевле телефона» — топ-5 авто из архива BOE по максимальной ставке (стиль Subástica, v2).
Запуск: python3 tools/reels/r7_autos_slides.py /tmp/r7  → /tmp/r7/t_*.png (1080x1920)
Фото есть только у BMW 320d (документы аукциона SUB-RC-2026-0025V20260006, номера размыты);
у остальных четырёх машин фото в BOE нет — для них светлые кадры с контуром авто без марки."""
import asyncio, os, shutil, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from playwright.async_api import async_playwright
from brand import CSS, brand, mark, page, photo, blur_boxes, SITE

OUT = sys.argv[1] if len(sys.argv) > 1 else '/tmp/r7'
os.makedirs(OUT, exist_ok=True)
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
BMW = os.path.join(ROOT, 'site/social/src/SUB-RC-2026-0025V20260006')
# номер самой машины и номера соседних машин на заднем плане
blur_boxes(f'{BMW}/foto_02.jpg', f'{OUT}/bmw_hero.jpg', [(1540, 690, 1600, 810), (100, 135, 175, 180), (220, 135, 290, 168), (375, 105, 430, 135)])
shutil.copy(f'{BMW}/foto_01.jpg', f'{OUT}/bmw_damage.jpg')
shutil.copy(f'{BMW}/foto_07.jpg', f'{OUT}/bmw_side.jpg')
P = lambda n: f'file://{OUT}/{n}'

CAR = '''<svg viewBox="0 0 400 140" width="{w}" fill="none" stroke="{c}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round">
<path d="M20 100 L20 78 Q22 66 40 62 L110 52 Q150 22 200 20 L250 20 Q290 22 320 52 L360 60 Q382 66 382 84 L382 100"/>
<path d="M20 100 H70 M130 100 H270 M330 100 H382"/>
<circle cx="100" cy="102" r="26"/><circle cx="300" cy="102" r="26"/>
<path d="M128 52 Q160 32 200 30 L206 52 Z M224 30 L250 30 Q280 32 300 52 L226 52 Z"/></svg>'''
CSS += '''.rank{font-family:'IBM Plex Serif',serif;font-size:200px;font-weight:600;line-height:.9;color:#D4A017}
.model{font-family:'IBM Plex Serif',serif;font-size:100px;font-weight:600;line-height:1.0;margin-top:10px}
.lbl{font-size:36px;opacity:.7;margin-top:50px}
.old{font-size:64px;font-weight:500;opacity:.55;text-decoration:line-through;margin-top:8px}
.price{font-size:210px;font-weight:700;letter-spacing:-.03em;line-height:1;color:#E6B83A;white-space:nowrap;margin-top:6px}
body.paper .price{color:#1F4D3A}
body.paper .chip{border-color:rgba(26,31,28,.3)}
.cap{position:absolute;right:120px;top:120px;font-size:24px;opacity:.75}
'''
DISC = '<div class="disc">Максимальная ставка на аукционе BOE (архив 2026); не цена сделки. Оценка — сумма, назначенная для торгов.</div>'
NOPHOTO = '<div class="cap">фото в аукционе нет</div>'

def price(n): return n.replace(' ', '<span style="margin-left:.2em"></span>', 1)

def car(rank, model, chips, old, new, pct, extra='', bg=None):
    ch = ''.join(f'<span class="chip{" y" if c.startswith("!") else ""}">{c.lstrip("!")}</span>' for c in chips)
    p = f'<span class="pct">{pct}</span>' if pct else ''
    if bg:   # фото машины: текст внизу на затемнении
        return f'''{photo(P(bg), pos="28% 50%", shade="bottom")}<div class="cap">фото: документы аукциона BOE</div>
<div class="s" style="justify-content:flex-end;padding-bottom:380px">
<div class="rank">#{rank}</div><div class="model">{model}</div><div class="chips">{ch}</div>
<div class="lbl">оценка для торгов → максимальная ставка</div><div class="old">{old}</div>
<div class="price">{price(new)}</div>{p}{extra}</div>{brand()}{DISC}'''
    return f'''<div class="bg"></div>{NOPHOTO}<div class="s" style="justify-content:flex-start;padding-top:150px">
<div class="rank">#{rank}</div><div class="model">{model}</div><div class="chips">{ch}</div>
<div style="margin-top:70px">{CAR.format(w=920, c="rgba(31,77,58,.35)")}</div>
<div class="lbl">оценка для торгов → максимальная ставка</div><div class="old">{old}</div>
<div class="price">{price(new)}</div>{p}{extra}</div>{brand()}{DISC}'''

S, PAPER = {}, {'c5', 'c4', 'c2', 'c1'}
S['h0'] = f'''{photo(P("bmw_hero.jpg"), pos="58% 50%", shade="both")}<div class="s" style="justify-content:space-between;padding-top:200px">
<div><div class="tag">● АРХИВ АУКЦИОНОВ BOE · 2026</div>
<h1 style="margin-top:60px">Машины<br>дешевле<br><span class="hl">телефона</span></h1></div>
<div><div class="mid">Новый iPhone 18 Pro Max —<br><span class="hl">от 1 619 €</span></div>
<div class="mid muted" style="font-size:44px;margin-top:24px">А вот за сколько уходили машины<br>на государственных аукционах ↓</div></div></div>{brand()}
<div class="disc">Цена iPhone — Apple Store Испания, 256 ГБ, сентябрь 2026. Фото: BMW 320d из топ-5, документы аукциона BOE.</div>'''
S['c5'] = car(5, 'Lexus<br>IS 220d', ['2007', 'Андалусия · AEAT'], '2 970 €', '1 897 €', '−36 %',
              '<div class="mid muted" style="font-size:38px;margin-top:30px">дороже базового iPhone,<br>но дешевле версии на 1 ТБ (2 369 €)</div>')
S['c4'] = car(4, 'Mercedes<br>C 200 CDI', ['2015', 'Андалусия · AEAT'], '6 897 €', '1 190 €', '−83 %')
S['c3'] = car(3, 'BMW<br>320d', ['2007', 'Альбасете'], '2 300 €', '1 150 €', '−50 %', bg='bmw_hero.jpg')
S['c2'] = car(2, 'Volkswagen<br>Golf', ['Альбасете', 'год не подтверждён'], '950 €', '775 €', '−18 %')
S['c1'] = car(1, 'Mercedes<br>S 320', ['2004', 'Каталония · AEAT'], '5 338 €', '734 €', '−86 %',
              '<div class="mid" style="font-size:44px;margin-top:30px">представительский седан —<br><span class="hl">в 2 раза дешевле</span> базового iPhone</div>')
S['chk'] = f'''{photo(P("bmw_damage.jpg"), pos="40% 50%", shade="full")}<div class="cap">BMW 320d · фото: документы аукциона BOE</div>
<div class="s"><div class="tag">⚠️ Прежде чем ставить</div>
<div class="row">
<div class="pill">Машина продаётся как есть<small>без гарантии и часто без пробной поездки</small></div>
<div class="pill">Посмотрите отчёт DGT<small>informe del vehículo: владельцы, ITV, аресты</small></div>
<div class="pill">Добавьте расходы<small>налог ITP, перерегистрация, эвакуатор, ITV</small></div>
<div class="pill">Ставка ≠ покупка<small>часть аукционов закрывается без продажи</small></div>
</div></div>{brand()}'''
S['cta'] = f'''{photo(P("bmw_side.jpg"), pos="50% 40%", shade="full")}<div class="s" style="align-items:center;text-align:center;justify-content:center;padding-bottom:380px">
{mark(200)}
<h1 style="margin-top:60px;font-size:92px">Машины, квартиры, дома —<br><span class="hl">аукционы каждую неделю</span></h1>
<div class="mid muted" style="margin-top:30px">Сохрани, чтобы не потерять</div>
<div class="mid" style="margin-top:110px;font-size:54px">{SITE}</div>
<div class="mid muted" style="font-size:38px;margin-top:14px">все аукционы BOE на карте</div></div>'''

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-sandbox", "--allow-file-access-from-files"])
        pg = await b.new_page(viewport={"width": 1080, "height": 1920})
        for k, v in S.items():
            f = f'{OUT}/x.html'
            open(f, 'w').write(page(v, paper=k in PAPER, css=CSS))
            await pg.goto('file://' + f); await pg.wait_for_timeout(400)
            await pg.screenshot(path=f'{OUT}/t_{k}.png')
        await b.close()
asyncio.run(main())
