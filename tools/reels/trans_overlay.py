"""Прозрачные оверлеи (1080x1920) для AI-таймлапса трансформации — наложить на видео Kling.
Бренд Subástica, шартрёз. Запуск: python3 tools/reels/trans_overlay.py /tmp/tl → /tmp/tl/ov_*.png (с альфой)."""
import asyncio, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from playwright.async_api import async_playwright
from brand import FONTS, LOGO_ON_DARK

OUT = sys.argv[1] if len(sys.argv) > 1 else '/tmp/tl'
os.makedirs(OUT, exist_ok=True)
A = '#C8F031'
SH = 'text-shadow:0 3px 18px rgba(0,0,0,.65),0 1px 4px rgba(0,0,0,.6)'
CSS = FONTS + f'''*{{margin:0;box-sizing:border-box;font-family:'IBM Plex Sans',sans-serif}}
html,body{{width:1080px;height:1920px;background:transparent;color:#fff;overflow:hidden}}
.serif{{font-family:'IBM Plex Serif',serif}}
.hl{{color:{A}}}
.tag{{display:inline-flex;align-items:center;gap:14px;border:2px solid rgba(255,255,255,.55);border-radius:10px;padding:14px 26px;font-size:34px;font-weight:600;letter-spacing:.1em;text-transform:uppercase;{SH};backdrop-filter:blur(2px)}}
.lgtop{{position:absolute;top:60px;right:120px;height:66px}}
.kpi{{font-size:200px;font-weight:700;letter-spacing:-.03em;line-height:.95;color:{A};{SH}}}
.h1{{font-family:'IBM Plex Serif',serif;font-size:96px;font-weight:600;line-height:1.02;{SH}}}
.sub{{font-size:48px;font-weight:600;{SH}}}
/* нижняя плашка — прикрывает вотермарк и держит пометку IA */
.foot{{position:absolute;left:0;right:0;bottom:0;height:150px;background:linear-gradient(180deg,rgba(10,10,10,0) 0%,rgba(10,10,10,.5) 42%,rgba(10,10,10,.9) 80%,rgba(10,10,10,.99) 100%)}}
.iaw{{position:absolute;right:120px;bottom:34px;font-size:24px;font-weight:600;opacity:.7;{SH}}}
'''

def wrap(body):
    return f'<html><head><meta charset="utf-8"><style>{CSS}</style></head><body>{body}</body></html>'

PAGES = {
 # постоянный слой: логотип сверху, бейдж IA, нижняя плашка с пометкой (прикрывает вотермарк Kling)
 'base': f'''<img class="lgtop" src="{LOGO_ON_DARK}">
<div class="foot"></div>''',
 # крючок с ценой (начало)
 'hook': f'''<div style="position:absolute;top:150px;left:120px;right:120px">
<div class="tag">● En subasta ahora · Elche</div>
<div class="h1" style="margin-top:28px">Esto sale a <span class="hl">subasta</span></div>
<div class="kpi" style="margin-top:22px">81.623&nbsp;€</div>
<div class="sub" style="margin-top:8px">parcela urbana · 4.692 m²</div></div>''',
 # середина — момент трансформации
 'mid': f'''<div style="position:absolute;top:150px;left:120px;right:120px">
<div class="h1" style="font-size:104px">¿Y si fuera<br><span class="hl">así?</span> 👀</div></div>''',
 # финал — CTA
 'cta': f'''<div style="position:absolute;left:120px;right:120px;bottom:200px">
<div class="sub" style="font-size:40px;opacity:.9">Oportunidades del BOE, sin estrés</div>
<div class="h1" style="font-size:84px;margin-top:10px;color:{A}">subastica.es</div>
<div class="sub" style="font-size:36px;margin-top:10px;opacity:.9">enlace a este lote en la bio</div></div>''',
}

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-sandbox", "--allow-file-access-from-files"])
        pg = await b.new_page(viewport={"width": 1080, "height": 1920})
        for k, body in PAGES.items():
            open(f'{OUT}/x.html', 'w').write(wrap(body))
            await pg.goto(f'file://{OUT}/x.html'); await pg.wait_for_timeout(300)
            await pg.screenshot(path=f'{OUT}/ov_{k}.png', omit_background=True)
        await b.close()
asyncio.run(main())
