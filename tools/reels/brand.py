"""Фирменный стиль Subástica для слайдов рилс и сторис (1080x1920).

Стиль Sello, как на сайте subastica.es: тёмно-зелёный #1F4D3A, бумага #F4F1EA, горчичная печать #D4A017
(знак — горчичный молоток аукциониста),
заголовки IBM Plex Serif, цифры и текст IBM Plex Sans. Шрифты лежат в tools/reels/fonts (лицензия OFL).

Использование в скрипте слайдов:
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    from brand import CSS, ICON, brand, mark, SITE
Классы: .s (кадр) .bg (зелёный фон) .paper (светлый фон, ставить на <body> через body_class) .tag .brand .mark .disc
h1 .big .mid .muted .hl (горчичный акцент; .lime и .gold — старые имена того же цвета) .row .pill .chip .pct .rule
"""
import os

SITE = 'subastica.es'

# Цветовые темы кадров (THEME=naranja|wasabi|ciruela). Логотип не меняется — меняются фон, затемнение фото и акценты.
THEMES = {
    'naranja': dict(tint=(255, 90, 31), a=.86, text='#111111', acc='#FFFFFF', inv='#111111', chip='#111111', chipt='#FFFFFF', pill='rgba(0,0,0,.10)', pillb='rgba(0,0,0,.22)', logo='light'),
    'wasabi': dict(tint=(12, 12, 12), a=.80, text='#FFFFFF', acc='#C8F031', inv='#111111', chip='#C8F031', chipt='#111111', pill='rgba(255,255,255,.07)', pillb='rgba(200,240,49,.35)', logo='dark'),
    'ciruela': dict(tint=(59, 18, 54), a=.84, text='#FFFFFF', acc='#FF2E93', inv='#FFFFFF', chip='#FF2E93', chipt='#FFFFFF', pill='rgba(255,255,255,.08)', pillb='rgba(255,46,147,.4)', logo='dark'),
}
# По умолчанию — wasabi (шартрёз): яркий салатовый акцент на тёмном фоне, фото открыто и чёткое.
# Другую тему можно задать через env THEME=naranja|ciruela, выключить — THEME=none.
_T = os.environ.get('THEME', 'wasabi')
THEME = None if _T == 'none' else THEMES.get(_T, THEMES['wasabi'])
NAME = 'Subástica'
INSTAGRAM = '@subastica.es'
_F = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'fonts')
# Корпоративные файлы логотипа (архив subastica-logo-molotok, 11.11.2026) — tools/reels/logo/
_L = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'logo')
LOGO_ON_DARK = f'file://{_L}/subastica-logo-on-dark.png'    # светлый вариант без фона (из logo-dark)
LOGO_ON_LIGHT = f'file://{_L}/subastica-logo-on-light.png'  # тёмный текст без фона (logo-transparent)
AVATAR = f'file://{_L}/subastica-avatar.png'

GREEN, GREEN_INK, PAPER, INK, SEAL, SEAL_TXT = '#1F4D3A', '#143326', '#F4F1EA', '#1A1F1C', '#D4A017', '#E6B83A'

def _ff(fam, file, w):
    return f"@font-face{{font-family:'{fam}';src:url('file://{_F}/{file}') format('truetype');font-weight:{w}}}"

FONTS = ''.join([_ff('IBM Plex Sans', 'IBMPlexSans-Regular.ttf', 400), _ff('IBM Plex Sans', 'IBMPlexSans-Medium.ttf', 500),
                 _ff('IBM Plex Sans', 'IBMPlexSans-SemiBold.ttf', 600), _ff('IBM Plex Sans', 'IBMPlexSans-Bold.ttf', 700),
                 _ff('IBM Plex Serif', 'IBMPlexSerif-Medium.ttf', 500), _ff('IBM Plex Serif', 'IBMPlexSerif-SemiBold.ttf', 600)])

# Молоток аукциониста (горчичный) — как на сайте с 11.11.2026, вместо прежнего ромба
GAVEL = '''url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='-4 -4 32 32'%3E%3Cg transform='rotate(135 12 12)'%3E%3Crect x='2' y='12.5' width='20' height='8' rx='2.4'/%3E%3Crect x='9.8' y='3' width='4.4' height='9.5' rx='2'/%3E%3C/g%3E%3C/svg%3E") center/contain no-repeat'''

# ICON — буква знака; оставлено для старых скриптов, где он вставлялся внутрь .mark
ICON = '<span class="mk-s">S</span>'

CSS = FONTS + f'''*{{box-sizing:border-box;margin:0}}
body{{width:1080px;height:1920px;overflow:hidden;font-family:'IBM Plex Sans',sans-serif;color:{PAPER};background:{GREEN};font-variant-numeric:tabular-nums}}
body.paper{{background:{PAPER};color:{INK}}}
.s{{position:absolute;inset:0;display:flex;flex-direction:column;justify-content:center;padding:170px 80px 380px}}
.s>.tag{{position:absolute;top:170px;left:80px}}
.bg{{position:absolute;inset:0;background:radial-gradient(120% 75% at 50% 0%,#2C6A51 0%,{GREEN} 50%,{GREEN_INK} 100%)}}
.bg::after{{content:"";position:absolute;inset:40px;border:2px solid rgba(244,241,234,.12);border-radius:10px}}
body.paper .bg{{background:{PAPER}}}
body.paper .bg::after{{border-color:rgba(26,31,28,.12)}}
.tag{{display:inline-flex;align-self:flex-start;gap:14px;align-items:center;border:2px solid rgba(244,241,234,.35);border-radius:8px;padding:12px 24px;font-size:32px;font-weight:600;letter-spacing:.12em;text-transform:uppercase}}
/* логотип — файлы из tools/reels/logo */
.brand img{{height:84px;display:block}}
.brand .lg-l,body.paper .brand .lg-d{{display:none}}
body.paper .brand .lg-l{{display:block}}
.avatar{{display:block;border-radius:22%;box-shadow:0 18px 50px rgba(0,0,0,.35)}}
body.paper .tag{{border-color:rgba(26,31,28,.3)}}
.brand{{position:absolute;right:64px;bottom:260px;display:flex;gap:20px;align-items:center}}
.mark{{width:84px;height:84px;font-size:47px;border-radius:50%;background:{PAPER};color:{GREEN};position:relative;display:flex;align-items:center;justify-content:center;flex:none}}
.mark::after{{content:"";position:absolute;right:-.10em;top:-.08em;width:.78em;height:.78em;background:{SEAL};-webkit-mask:{GAVEL};mask:{GAVEL}}}
body.paper .mark{{background:{GREEN};color:{PAPER}}}
.mk-s{{font:600 1em/1 'IBM Plex Serif',serif;font-size:inherit}}
.mark .mk-s{{font-size:48px}}
.wm{{font:600 40px/1 'IBM Plex Serif',serif;letter-spacing:.1em}}
.wm i{{font-style:normal;position:relative;display:inline-block}}
.wm i::after{{content:"";position:absolute;left:.26em;top:-.26em;width:.58em;height:.58em;background:{SEAL};-webkit-mask:{GAVEL};mask:{GAVEL}}}
.disc{{position:absolute;left:64px;right:64px;bottom:60px;font-size:24px;opacity:.65}}
h1{{font-family:'IBM Plex Serif',serif;font-size:104px;line-height:1.02;font-weight:600;letter-spacing:-.01em}}
.serif{{font-family:'IBM Plex Serif',serif}}
.big{{white-space:nowrap;font-size:200px;font-weight:700;letter-spacing:-.03em;line-height:1}}
.mid{{font-size:60px;font-weight:600;line-height:1.15}}
.muted{{opacity:.75}}
.hl,.lime,.gold{{color:{SEAL_TXT}}}
body.paper .hl,body.paper .lime,body.paper .gold{{color:#9A7300}}
.row{{display:flex;flex-direction:column;gap:22px;margin-top:56px}}
.pill{{background:rgba(244,241,234,.07);border:2px solid rgba(244,241,234,.16);border-radius:12px;padding:30px 38px;font-size:50px;font-weight:600;line-height:1.2}}
.pill small{{display:block;font-size:32px;font-weight:400;opacity:.75;margin-top:6px}}
body.paper .pill{{background:rgba(31,77,58,.06);border-color:rgba(31,77,58,.18)}}
.chips{{display:flex;flex-wrap:wrap;gap:14px;margin-top:30px}}
.chip{{border:2px solid rgba(244,241,234,.3);border-radius:8px;padding:10px 22px;font-size:34px;font-weight:600}}
.chip.y{{background:{SEAL};border-color:{SEAL};color:{INK}}}
.pct{{display:inline-block;align-self:flex-start;margin-top:24px;background:{SEAL};color:{INK};border-radius:8px;padding:10px 26px;font-size:54px;font-weight:700}}
.rule{{width:160px;height:6px;background:{SEAL};margin:50px 0}}
.seal{{display:inline-block;width:.42em;height:.42em;background:{SEAL};transform:rotate(45deg);margin:0 .25em .08em}}
'''

def brand(extra_style=''):
    """Логотип Subástica (корпоративный файл): правый нижний угол, приподнят над подписью Instagram.
    На тёмном/фото — светлый вариант, на кадрах body.paper — тёмный."""
    return (f'<div class="brand" style="{extra_style}"><img class="lg-d" src="{LOGO_ON_DARK}">'
            f'<img class="lg-l" src="{LOGO_ON_LIGHT}"></div>')

def mark(size=200):
    """Крупный знак для финального кадра — аватар из корпоративного набора."""
    return f'<img class="avatar" src="{AVATAR}" style="width:{size}px;height:{size}px;margin:0 auto">'

def theme_css():
    if not THEME:
        return ''
    t = THEME; r, g, b = t['tint']
    logo = '.brand .lg-d{display:none!important}.brand .lg-l{display:block!important}' if t['logo'] == 'light' else ''
    return (f"body,body.paper{{color:{t['text']};background:rgb({r},{g},{b})}}.bg{{background:rgb({r},{g},{b})!important}}.bg::after{{border-color:rgba(127,127,127,.25)}}"
            f".hl,.lime,.gold,.kpi,.price,.bar .v,.rank,body.paper .hl,body.paper .price{{color:{t['acc']}!important}}"
            f".bar .t i,.pct,.chip.y,.free,.rule{{background:{t['chip']}!important;color:{t['chipt']}!important;border-color:{t['chip']}!important}}"
            f".bar .t{{background:rgba(127,127,127,.25)!important}}.tag{{border-color:{t['pillb']}!important;color:{t['text']}}}"
            f".pill{{background:{t['pill']}!important;border-color:{t['pillb']}!important}}.chip{{border-color:{t['pillb']}!important}}{logo}")

def page(body_html, paper=False, css=None):
    return f'<html><head><meta charset="utf-8"><style>{css or CSS}{theme_css()}</style></head><body class="{"paper" if paper else ""}">{body_html}</body></html>'


def photo(src, pos='50% 50%', shade='both', blur=0, scale=1.0, sharp=True):
    """Фотография на весь кадр + затемнение, чтобы текст читался.
    shade:
      hero_b — вариант B: фото открыто во всю середину, затемнены только верх и низ под текстом (для первого кадра/обложки);
      both — затемнение сверху и снизу, середина приоткрыта;
      hero — текст сверху, фото открыто в середине;
      bottom, top, full — соответственно.
    sharp=True добавляет лёгкую резкость и насыщенность (contrast/saturate), чтобы фон не выглядел мутным."""
    if THEME:
        r, gg, b = THEME['tint']; A = THEME['a']
        c = lambda x: f'rgba({r},{gg},{b},{min(1, x):.2f})'
        g = {'hero_b': f'linear-gradient(180deg,{c(A+.12)} 0%,{c(A-.05)} 24%,{c(0)} 40%,{c(0)} 56%,{c(A-.05)} 74%,{c(A+.14)} 100%)',
             'both': f'linear-gradient(180deg,{c(A+.1)} 0%,{c(A-.1)} 28%,{c(.12)} 48%,{c(.28)} 62%,{c(A+.1)} 100%)',
             'hero': f'linear-gradient(180deg,{c(A+.1)} 0%,{c(A)} 30%,{c(0)} 46%,{c(0)} 76%,{c(A)} 92%)',
             'bottom': f'linear-gradient(180deg,{c(.2)} 0%,{c(.05)} 35%,{c(A)} 68%,{c(A+.1)} 100%)',
             'top': f'linear-gradient(180deg,{c(A+.1)} 0%,{c(A-.2)} 35%,{c(0)} 60%)',
             'full': c(A)}[shade]
    else:
        g = None
    g = g or {'hero_b': 'linear-gradient(180deg,rgba(20,51,38,.95) 0%,rgba(20,51,38,.65) 24%,rgba(20,51,38,0) 40%,rgba(20,51,38,0) 56%,rgba(20,51,38,.7) 74%,rgba(20,51,38,.96) 100%)',
         'both': 'linear-gradient(180deg,rgba(20,51,38,.94) 0%,rgba(20,51,38,.7) 28%,rgba(20,51,38,.12) 48%,rgba(20,51,38,.3) 62%,rgba(20,51,38,.95) 100%)',
         'bottom': 'linear-gradient(180deg,rgba(20,51,38,.25) 0%,rgba(20,51,38,.1) 35%,rgba(20,51,38,.9) 68%,rgba(20,51,38,.97) 100%)',
         'top': 'linear-gradient(180deg,rgba(20,51,38,.95) 0%,rgba(20,51,38,.6) 35%,rgba(20,51,38,0) 60%)',
         'hero': 'linear-gradient(180deg,rgba(20,51,38,.95) 0%,rgba(20,51,38,.8) 30%,rgba(20,51,38,0) 46%,rgba(20,51,38,0) 76%,rgba(20,51,38,.92) 92%)',
         'full': 'rgba(20,51,38,.62)'}[shade]
    fx = []
    if blur: fx.append(f'blur({blur}px)')
    if sharp: fx.append('contrast(1.08) saturate(1.18)')
    f = f'filter:{" ".join(fx)};' if fx else ''
    t = f'transform:scale({scale});' if scale != 1.0 else ''
    return (f'<img src="{src}" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;object-position:{pos};{f}{t}">'
            f'<div style="position:absolute;inset:0;background:{g}"></div>')


def blur_boxes(src, dst, boxes, radius=18):
    """Размыть номера машин и прочее лишнее: boxes — [(x0,y0,x1,y1), …] в пикселях исходника."""
    from PIL import Image, ImageFilter
    im = Image.open(src).convert('RGB')
    for b in boxes:
        reg = im.crop(b).filter(ImageFilter.GaussianBlur(radius)); im.paste(reg, b[:2])
    im.save(dst, quality=92)


def photo_card(src, top=230, height=720, pos='50% 50%'):
    """Горизонтальное фото целиком: размытый фон из того же снимка + чёткая карточка сверху.
    Текст кадра ставить ниже карточки (padding-top ≈ top + height + 60).
    Карточка — с лёгкой резкостью (contrast/saturate), чтобы снимок не выглядел мутным."""
    return (f'<img src="{src}" style="position:absolute;inset:-60px;width:calc(100% + 120px);height:calc(100% + 120px);object-fit:cover;filter:blur(36px) brightness(.7)">'
            f'<div style="position:absolute;inset:0;background:{("rgba(%d,%d,%d,.6)" % THEME["tint"]) if THEME else "rgba(20,51,38,.55)"}"></div>'
            f'<img src="{src}" style="position:absolute;left:40px;right:40px;top:{top}px;width:1000px;height:{height}px;object-fit:cover;object-position:{pos};filter:contrast(1.08) saturate(1.18);border-radius:14px;box-shadow:0 24px 60px rgba(0,0,0,.45)">')
