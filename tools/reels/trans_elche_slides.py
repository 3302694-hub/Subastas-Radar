"""Рилс-трансформация «до → после» — участок urbano в Эльче (Altabix), AEAT.
Лот SUB-AT-2026-26R4686001257. valor_subasta 81.623,85 €, depósito 4.081 €, до 23.11.2026.
Фото: antes.jpg (реальное фото участка), despues.jpg (РЕКРЕАЦИЯ С ИИ — не реальный объект, помечено на кадре).
Запуск: python3 tools/reels/trans_elche_slides.py /tmp/trans → /tmp/trans/t_*.png"""
import asyncio, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from playwright.async_api import async_playwright
from brand import CSS, brand, mark, page, photo, photo_card, SITE

OUT = sys.argv[1] if len(sys.argv) > 1 else '/tmp/trans'
os.makedirs(OUT, exist_ok=True)
ANTES = f'file://{OUT}/antes.jpg'
DESPUES = f'file://{OUT}/despues.jpg'

CSS += '''.kpi{font-size:190px;font-weight:700;letter-spacing:-.03em;line-height:.95;color:#C8F031;white-space:nowrap}
.sub{font-size:46px;font-weight:600;line-height:1.2;margin-top:14px}
.badge{position:absolute;top:150px;right:120px;background:#C8F031;color:#111;font-size:30px;font-weight:700;letter-spacing:.04em;padding:12px 22px;border-radius:12px;text-transform:uppercase}
.pill{font-size:42px;padding:22px 30px}.pill small{font-size:28px}.row{gap:14px}
'''

S = {}
# 1 — ДО: реальный участок, крючок с ценой
S['antes'] = f'''{photo(ANTES, pos='50% 42%', shade='hero_b')}<div class="s" style="justify-content:flex-start;padding-top:150px">
<div class="tag">● En subasta ahora · Elche</div>
<h1 style="margin-top:34px;font-size:96px">Esto sale a<br><span class="hl">subasta</span></h1>
<div class="kpi" style="margin-top:30px">81.623 €</div>
<div class="sub">valor de subasta · parcela urbana de 4.692 m²</div></div>{brand()}
<div class="disc">Valor de subasta (AEAT), no precio de mercado. Foto del inmueble.</div>'''
# 2 — ПОСЛЕ: рекреация с ИИ (помечено)
S['despues'] = f'''{photo_card(DESPUES, top=300, height=620)}<div class="badge">Recreación · IA</div>
<div class="tag" style="position:absolute;top:150px;left:120px">El potencial</div>
<div class="s" style="justify-content:flex-start;padding-top:1010px">
<h1 style="font-size:88px">¿Y si fuera<br><span class="hl">así?</span></h1>
<div class="sub" style="margin-top:14px">Parcela urbana · se puede construir</div></div>{brand()}
<div class="disc">Recreación con IA: idea del potencial. No es el estado actual ni una promesa de resultado.</div>'''
# 3 — ФАКТЫ
S['datos'] = f'''{photo(ANTES, pos='50% 42%', shade='both', blur=8)}<div class="tag" style="position:absolute;top:150px;left:120px">Los datos</div>
<div class="s" style="justify-content:center">
<div class="row">
<div class="pill">Parcela urbana · 4.692 m²<small>Elche (Altabix), Alicante</small></div>
<div class="pill">Valor de subasta — 81.623,85 €<small>subasta de la Agencia Tributaria (AEAT)</small></div>
<div class="pill">Depósito para pujar — 4.081 €<small>5 % del valor; se devuelve si no ganas</small></div>
<div class="pill">Pujas hasta el 23 de noviembre<small>en el Portal de Subastas del BOE</small></div>
</div></div>{brand()}
<div class="disc">Comprueba siempre calificación urbanística y cargas en los documentos de la subasta.</div>'''
# 4 — CTA
S['cta'] = f'''{photo(DESPUES, pos='50% 50%', shade='full')}<div class="s" style="align-items:center;text-align:center;justify-content:center">
{mark(200)}
<h1 style="margin-top:60px;font-size:90px">Oportunidades del BOE,<br><span class="hl">sin estrés</span></h1>
<div class="mid" style="margin-top:100px;font-size:56px">{SITE}</div>
<div class="mid muted" style="font-size:38px;margin-top:14px">enlace a este lote en la bio</div></div>'''

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
