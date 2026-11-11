"""Рилс «Почему вчера всего 3 новых лота» — всеобщая забастовка 11.11.2026 (стиль Subástica).
Запуск: python3 tools/reels/huelga_slides.py /tmp/huelga → /tmp/huelga/t_*.png
Цифры: subastas.detectada по дням (Europe/Madrid). Забастовка: CCOO и UGT, 11.11.2026 (Cuatrecasas, 20.10.2026)."""
import asyncio, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from playwright.async_api import async_playwright
from brand import CSS, brand, mark, page, photo, SITE

OUT = sys.argv[1] if len(sys.argv) > 1 else '/tmp/huelga'
os.makedirs(OUT, exist_ok=True)
SRC = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', 'site/social/src'))
F = lambda d, f: f'file://{SRC}/{d}/{f}.jpg'
DAYS = [('9 ноября', 52), ('10 ноября', 68), ('11 ноября', 3)]

CSS += '''.kpi{font-size:420px;font-weight:700;letter-spacing:-.04em;line-height:.85;color:#E6B83A}
.sub{font-size:50px;font-weight:600;line-height:1.2;margin-top:18px}
.bars{display:flex;flex-direction:column;gap:22px;margin-top:60px}
.bar{display:grid;grid-template-columns:1fr auto;gap:6px 20px;align-items:end}
.bar .l{font-size:38px;font-weight:600}.bar .v{font-size:52px;font-weight:700;color:#E6B83A}
.bar .t{grid-column:1/3;height:16px;border-radius:4px;background:rgba(244,241,234,.15)}
.bar .t i{display:block;height:100%;border-radius:4px;background:#D4A017}
.free{display:inline-block;background:#D4A017;color:#1A1F1C;border-radius:10px;padding:18px 30px;font-size:52px;font-weight:700;margin-top:40px}
'''
AER = '<div class="disc">Аэрофото © IGN-PNOA. Новые лоты — дата появления в базе Subástica (данные Portal de Subastas BOE).</div>'
mx = max(v for _, v in DAYS)
bars = '<div class="bars">' + ''.join(
    f'<div class="bar"><span class="l">{l}</span><span class="v">{v}</span><span class="t"><i style="width:{max(v / mx * 100, 1.5):.1f}%"></i></span></div>' for l, v in DAYS) + '</div>'

S = {}
S['h0'] = f'''{photo(F('SUB-JA-2026-267857', 'aereo_lejos0'), shade='hero_b')}<div class="s" style="justify-content:flex-start;padding-top:150px">
<div class="tag">Вчера, 11 ноября</div>
<div class="kpi" style="margin-top:40px">3</div>
<div class="sub">новых аукциона за весь день.<br>Почему так мало?</div></div>
<div style="position:absolute;left:80px;right:80px;bottom:300px">{bars}</div>{brand()}{AER}'''
S['why'] = f'''{photo(F('SUB-JA-2026-268255', 'aereo_lejos0'), shade='full')}<div class="s">
<div class="tag">Причина</div>
<h1 style="margin-top:40px;font-size:100px">Всеобщая<br><span class="hl">забастовка</span></h1>
<div class="row">
<div class="pill">11 ноября — по всей Испании<small>забастовку объявили профсоюзы CCOO и UGT</small></div>
<div class="pill">Требования<small>доступное жильё, рост зарплат, сокращение рабочего дня</small></div>
<div class="pill">Аукционы публикуют суды и ведомства<small>в день забастовки новых объявлений почти не было</small></div>
</div></div>{brand()}
<div class="disc">Источник о забастовке: Cuatrecasas, «Huelga general del 11 de noviembre», 20.10.2026.</div>'''
S['hoy'] = f'''{photo(F('SUB-JA-2026-259014', 'aereo_lejos0'), shade='full')}<div class="s">
<div class="tag">Что дальше</div>
<h1 style="margin-top:40px;font-size:96px">Сегодня<br><span class="hl">ждём обновлений</span></h1>
<div class="sub">Сколько новых лотов появилось —<br>смотрите на сайте</div>
<div class="mid" style="margin-top:50px;font-size:64px">{SITE}</div>
<div class="free">Доступ для всех БЕСПЛАТНО<br>до 31.12.2027</div></div>{brand()}{AER}'''
S['cta'] = f'''{photo(F('SUB-JA-2025-254149', 'aereo_medio0'), shade='full')}<div class="s" style="align-items:center;text-align:center;justify-content:center">
{mark(200)}
<h1 style="margin-top:60px;font-size:92px">Новые аукционы —<br><span class="hl">каждый день</span></h1>
<div class="mid" style="margin-top:90px;font-size:58px">{SITE}</div>
<div class="mid muted" style="font-size:38px;margin-top:14px">бесплатно до 31.12.2027</div></div>'''

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
