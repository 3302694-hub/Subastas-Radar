"""Образовательный рилс «Почему объект снова на торгах» (resubasta) — стиль Subástica.
Фон — аэрофото виллы из Торревьехи + скриншот карточки с сайта. Текст на тёмных подложках.
Запуск: python3 tools/reels/edu_resubasta_slides.py /tmp/edu → /tmp/edu/t_*.png"""
import asyncio, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from playwright.async_api import async_playwright
from brand import CSS, brand, mark, page, photo, SITE

OUT = sys.argv[1] if len(sys.argv) > 1 else '/tmp/edu'
os.makedirs(OUT, exist_ok=True)
D = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', 'site/social/src/SUB-JA-2026-267773'))
CERCA = f'file://{D}/aereo_cerca0.jpg'
MEDIO = f'file://{D}/aereo_medio0.jpg'
SHOT = f'file://{OUT}/shot_detalle.jpg'   # скриншот карточки Торревьехи с нашего сайта

CSS += '''.sub{font-size:48px;font-weight:600;line-height:1.25;margin-top:18px}
.pill{font-size:44px;padding:24px 32px}.pill small{font-size:28px}
.row{gap:16px;margin-top:40px}
.panel{background:rgba(8,10,8,.55);backdrop-filter:blur(10px);border:1px solid rgba(255,255,255,.1);border-radius:26px;padding:44px 46px}
.num{display:inline-flex;align-items:center;justify-content:center;width:60px;height:60px;border-radius:50%;background:#C8F031;color:#111;font-weight:700;font-size:36px;margin-right:16px;flex:none}
.li{display:flex;align-items:flex-start;font-size:44px;font-weight:600;line-height:1.25;margin-top:26px}
.li:first-child{margin-top:0}
'''
AER = '<div class="disc">Аэрофото © IGN-PNOA. Условия каждой resubasta свои — сверяйтесь с объявлением и документами на портале BOE.</div>'

S = {}
# 1 — заголовок сверху, описание ниже, на тёмной подложке
S['h0'] = f'''{photo(CERCA, shade='top')}<div class="s" style="justify-content:flex-start;padding-top:130px">
<div class="panel">
<div class="tag" style="margin-bottom:22px">Разбор · как это работает</div>
<h1 style="font-size:100px">Почему объект<br>снова на <span class="hl">торгах?</span></h1>
<div class="sub">Та вилла в Торревьехе за 528&nbsp;000&nbsp;€ уже была на аукционе — и вернулась. Это <span class="hl">resubasta</span>.</div></div></div>{brand()}
<div class="disc">Аэрофото © IGN-PNOA.</div>'''

# 2 — то же: текст сверху на подложке
S['que'] = f'''{photo(MEDIO, shade='top')}<div class="s" style="justify-content:flex-start;padding-top:130px">
<div class="panel">
<div class="tag" style="margin-bottom:22px">Что это</div>
<h1 style="font-size:84px">Resubasta —<br>повторные торги</h1>
<div class="sub">Аукцион завершился, но объект не ушёл с молотка — и его выставляют <span class="hl">заново</span>, часто на более мягких условиях.</div></div></div>{brand()}
<div class="disc">Аэрофото © IGN-PNOA.</div>'''

# 3 — скриншот карточки с нашего сайта (соц.доказательство)
S['ejemplo'] = f'''<img src="{SHOT}" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;object-position:50% 44%">
<div style="position:absolute;inset:0;background:linear-gradient(180deg,rgba(8,10,8,.9) 0%,rgba(8,10,8,.35) 20%,rgba(8,10,8,0) 38%,rgba(8,10,8,0) 66%,rgba(8,10,8,.9) 100%)"></div>
<div style="position:absolute;top:130px;left:56px;right:56px">
<div class="tag">● У нас на сайте</div>
<h1 style="margin-top:22px;font-size:74px">Та самая вилла —<br>аукцион <span class="hl">завершён</span></h1></div>
<div style="position:absolute;left:56px;right:56px;bottom:340px">
<div class="panel"><div class="sub" style="margin-top:0;font-size:44px">Макс. ставка — 295&nbsp;680&nbsp;€, это 56&nbsp;% от цены. Теперь объект <span class="hl">снова на торгах</span>.</div></div></div>{brand()}
<div class="disc">Скриншот карточки subastica.es. Аэрофото © IGN-PNOA · Catastro.</div>'''

# 4 — причины, список на подложке
S['porque'] = f'''{photo(MEDIO, shade='both', blur=6)}<div class="s" style="justify-content:center">
<div class="tag" style="position:absolute;top:150px;left:120px">Почему возвращается</div>
<div class="panel">
<div class="li"><span class="num">1</span><span>Не было ставок<br><span style="font-weight:400;opacity:.8;font-size:34px">торги признали несостоявшимися (desierta)</span></span></div>
<div class="li"><span class="num">2</span><span>Ставки не дотянули<br><span style="font-weight:400;opacity:.8;font-size:34px">максимум оказался ниже порога продажи</span></span></div>
<div class="li"><span class="num">3</span><span>Победитель не оплатил<br><span style="font-weight:400;opacity:.8;font-size:34px">не внёс сумму в срок — назначают новые торги</span></span></div>
</div></div>{brand()}'''

# 5 — что даёт покупателю (pills уже с фоном)
S['para_ti'] = f'''{photo(CERCA, shade='both')}<div class="tag" style="position:absolute;top:150px;left:120px">Что это даёт покупателю</div>
<div class="s" style="justify-content:center">
<div class="panel"><div class="row" style="margin-top:0">
<div class="pill">Второй шанс<small>объект, который ты мог упустить, снова доступен</small></div>
<div class="pill">Иногда мягче условия<small>на повторных торгах порог входа бывает ниже</small></div>
<div class="pill">Меньше ажиотажа<small>часть участников уже отсеялась на первом аукционе</small></div>
</div></div></div>{brand()}{AER}'''

# 6 — CTA
S['cta'] = f'''{photo(MEDIO, shade='full')}<div class="s" style="align-items:center;text-align:center;justify-content:center">
{mark(200)}
<h1 style="margin-top:60px;font-size:82px">Мы ловим такие<br><span class="hl">вторые шансы</span></h1>
<div class="sub" style="font-size:44px">и показываем, когда объект вернулся на торги</div>
<div class="mid" style="margin-top:70px;font-size:56px">{SITE}</div></div>'''

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
