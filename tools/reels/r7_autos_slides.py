"""r7 «Машины дешевле телефона» — топ-5 авто из архива BOE по максимальной ставке.
Запуск: python3 tools/reels/r7_autos_slides.py /tmp/r7   → /tmp/r7/t_*.png (1080x1920)
Фото машин не используем (чужие фото и логотипы нельзя) — только типографика и общий контур авто."""
import asyncio, os, sys
from playwright.async_api import async_playwright

OUT = sys.argv[1] if len(sys.argv) > 1 else '/tmp/r7'
os.makedirs(OUT, exist_ok=True)
ICON = '<svg viewBox="2.5 8.5 19 11" width="70" height="41" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round"><path d="M4 18a8 8 0 0116 0"/><path d="M8 18a4 4 0 018 0"/><path d="M12 18l5-7"/></svg>'
# Общий контур седана, без марки
CAR = '''<svg viewBox="0 0 400 140" width="{w}" fill="none" stroke="{c}" stroke-width="6" stroke-linecap="round" stroke-linejoin="round">
<path d="M20 100 L20 78 Q22 66 40 62 L110 52 Q150 22 200 20 L250 20 Q290 22 320 52 L360 60 Q382 66 382 84 L382 100"/>
<path d="M20 100 H70 M130 100 H270 M330 100 H382"/>
<circle cx="100" cy="102" r="26"/><circle cx="300" cy="102" r="26"/>
<path d="M128 52 Q160 32 200 30 L206 52 Z M224 30 L250 30 Q280 32 300 52 L226 52 Z"/></svg>'''
CSS = '''*{box-sizing:border-box;margin:0}body{width:1080px;height:1920px;overflow:hidden;font-family:'Inter Display','Inter',sans-serif;color:#fff;background:#0B3F3C}
.s{position:absolute;inset:0;display:flex;flex-direction:column;justify-content:center;padding:170px 80px 260px}
.bg{position:absolute;inset:0;background:radial-gradient(120% 80% at 50% 0%,#0E7A73 0%,#0B4E4A 45%,#062B29 100%)}
.tag{display:inline-flex;align-self:flex-start;gap:14px;align-items:center;background:rgba(255,255,255,.14);border-radius:999px;padding:14px 26px;font-size:34px;font-weight:600;letter-spacing:.06em}
.brand{position:absolute;left:80px;bottom:110px;display:flex;gap:18px;align-items:center;font-size:40px;font-weight:700}
.mark{width:84px;height:84px;border-radius:22px;background:#0B6B66;border:3px solid rgba(255,255,255,.25);display:flex;align-items:center;justify-content:center}
.disc{position:absolute;left:80px;right:80px;bottom:50px;font-size:24px;opacity:.6}
h1{font-size:110px;line-height:1.0;font-weight:800;letter-spacing:-.02em}
.mid{font-size:56px;font-weight:700;line-height:1.15}
.muted{opacity:.75}.lime{color:#9CF2C4}
.rank{font-size:230px;font-weight:800;letter-spacing:-.05em;line-height:.9;color:rgba(156,242,196,.22)}
.model{font-size:104px;font-weight:800;line-height:1.0;letter-spacing:-.02em;margin-top:10px}
.chips{display:flex;flex-wrap:wrap;gap:14px;margin-top:34px}
.chip{background:rgba(255,255,255,.12);border-radius:999px;padding:12px 26px;font-size:36px;font-weight:600}
.chip.y{background:#FFD600;color:#062B29}
.lbl{font-size:36px;opacity:.7;margin-top:60px}
.old{font-size:64px;font-weight:600;opacity:.55;text-decoration:line-through;margin-top:8px}
.price{font-size:210px;font-weight:800;letter-spacing:-.04em;line-height:1;color:#9CF2C4;white-space:nowrap;margin-top:6px}
.pct{display:inline-block;margin-top:24px;background:#9CF2C4;color:#062B29;border-radius:20px;padding:10px 26px;font-size:54px;font-weight:800;align-self:flex-start}
.row{display:flex;flex-direction:column;gap:24px;margin-top:56px}
.pill{background:rgba(255,255,255,.1);border-radius:28px;padding:30px 38px;font-size:46px;font-weight:700;line-height:1.2}
.pill small{display:block;font-size:32px;font-weight:500;opacity:.7;margin-top:6px}
'''
def brand(): return f'<div class="brand"><div class="mark">{ICON}</div>SubastaRadar</div>'
DISC = '<div class="disc">Максимальная ставка на аукционе BOE (архив 2026); не цена сделки. Оценка — сумма, назначенная для торгов.</div>'

def car(rank, model, chips, old, new, pct, extra=''):
    ch = ''.join(f'<span class="chip{" y" if c.startswith("!") else ""}">{c.lstrip("!")}</span>' for c in chips)
    p = f'<span class="pct">{pct}</span>' if pct else ''
    return f'''<div class="bg"></div><div class="s" style="justify-content:flex-start;padding-top:150px">
<div class="rank">#{rank}</div><div class="model">{model}</div><div class="chips">{ch}</div>
<div style="margin-top:70px;opacity:.9">{CAR.format(w=920, c="rgba(255,255,255,.35)")}</div>
<div class="lbl">оценка для торгов → максимальная ставка</div><div class="old">{old}</div>
<div class="price">{new.replace(' ', '<span style="margin-left:.2em"></span>', 1)}</div>{p}{extra}</div>{brand()}{DISC}'''

S = {}
S['h0'] = f'''<div class="bg"></div><div class="s" style="justify-content:flex-start;padding-top:200px">
<div class="tag">● АРХИВ АУКЦИОНОВ BOE · 2026</div>
<h1 style="margin-top:60px">Машины<br>дешевле<br><span class="lime">телефона</span></h1>
<div style="margin-top:80px">{CAR.format(w=920, c="#9CF2C4")}</div>
<div class="mid" style="margin-top:80px">Новый iPhone 18 Pro Max —<br><span class="lime">от 1 619 €</span></div>
<div class="mid muted" style="font-size:44px;margin-top:24px">А вот за сколько уходили машины<br>на государственных аукционах ↓</div></div>{brand()}
<div class="disc">Цена iPhone — Apple Store Испания, 256 ГБ, сентябрь 2026.</div>'''
S['c5'] = car(5, 'Lexus<br>IS 220d', ['2007', 'Андалусия · AEAT'], '2 970 €', '1 897 €', '−36 %',
              '<div class="mid muted" style="font-size:38px;margin-top:30px">дороже базового iPhone,<br>но дешевле версии на 1 ТБ (2 369 €)</div>')
S['c4'] = car(4, 'Mercedes<br>C 200 CDI', ['2015', 'Андалусия · AEAT'], '6 897 €', '1 190 €', '−83 %')
S['c3'] = car(3, 'BMW<br>320d', ['2007', 'Альбасете'], '2 300 €', '1 150 €', '−50 %')
S['c2'] = car(2, 'Volkswagen<br>Golf', ['Альбасете', 'год не подтверждён'], '950 €', '775 €', '−18 %')
S['c1'] = car(1, 'Mercedes<br>S 320', ['2004', 'Каталония · AEAT'], '5 338 €', '734 €', '−86 %',
              '<div class="mid" style="font-size:44px;margin-top:30px">представительский седан —<br><span class="lime">в 2 раза дешевле</span> базового iPhone</div>')
S['chk'] = f'''<div class="bg"></div><div class="s"><div class="tag">⚠️ ПРЕЖДЕ ЧЕМ СТАВИТЬ</div>
<div class="row">
<div class="pill">Машина продаётся как есть<small>без гарантии и часто без пробной поездки</small></div>
<div class="pill">Посмотрите отчёт DGT<small>informe del vehículo: владельцы, ITV, аресты</small></div>
<div class="pill">Добавьте расходы<small>налог ITP, перерегистрация, эвакуатор, ITV</small></div>
<div class="pill">Ставка ≠ покупка<small>часть аукционов закрывается без продажи</small></div>
</div></div>{brand()}'''
S['cta'] = f'''<div class="bg"></div><div class="s" style="align-items:center;text-align:center;justify-content:center;padding-bottom:300px">
<div class="mark" style="width:200px;height:200px;border-radius:52px">{ICON.replace('width="70" height="41"', 'width="150" height="87"')}</div>
<h1 style="margin-top:60px;font-size:92px">Машины, квартиры, дома —<br><span class="lime">аукционы каждую неделю</span></h1>
<div class="mid muted" style="margin-top:30px">Сохрани, чтобы не потерять</div>
<div class="mid" style="margin-top:110px;font-size:54px">subasta-radar.es</div>
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
