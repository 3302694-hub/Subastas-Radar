"""Фирменный стиль Subástica для слайдов рилс и сторис (1080x1920).

Стиль Sello, как на сайте subastica.es: тёмно-зелёный #1F4D3A, бумага #F4F1EA, горчичная печать #D4A017,
заголовки IBM Plex Serif, цифры и текст IBM Plex Sans. Шрифты лежат в tools/reels/fonts (лицензия OFL).

Использование в скрипте слайдов:
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    from brand import CSS, ICON, brand, mark, SITE
Классы: .s (кадр) .bg (зелёный фон) .paper (светлый фон, ставить на <body> через body_class) .tag .brand .mark .disc
h1 .big .mid .muted .hl (горчичный акцент; .lime и .gold — старые имена того же цвета) .row .pill .chip .pct .rule
"""
import os

SITE = 'subastica.es'
NAME = 'Subástica'
INSTAGRAM = '@subastica.es'
_F = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'fonts')

GREEN, GREEN_INK, PAPER, INK, SEAL, SEAL_TXT = '#1F4D3A', '#143326', '#F4F1EA', '#1A1F1C', '#D4A017', '#E6B83A'

def _ff(fam, file, w):
    return f"@font-face{{font-family:'{fam}';src:url('file://{_F}/{file}') format('truetype');font-weight:{w}}}"

FONTS = ''.join([_ff('IBM Plex Sans', 'IBMPlexSans-Regular.ttf', 400), _ff('IBM Plex Sans', 'IBMPlexSans-Medium.ttf', 500),
                 _ff('IBM Plex Sans', 'IBMPlexSans-SemiBold.ttf', 600), _ff('IBM Plex Sans', 'IBMPlexSans-Bold.ttf', 700),
                 _ff('IBM Plex Serif', 'IBMPlexSerif-Medium.ttf', 500), _ff('IBM Plex Serif', 'IBMPlexSerif-SemiBold.ttf', 600)])

# ICON — буква знака; оставлено для старых скриптов, где он вставлялся внутрь .mark
ICON = '<span class="mk-s">S</span>'

CSS = FONTS + f'''*{{box-sizing:border-box;margin:0}}
body{{width:1080px;height:1920px;overflow:hidden;font-family:'IBM Plex Sans',sans-serif;color:{PAPER};background:{GREEN};font-variant-numeric:tabular-nums}}
body.paper{{background:{PAPER};color:{INK}}}
.s{{position:absolute;inset:0;display:flex;flex-direction:column;justify-content:center;padding:170px 80px 260px}}
.s>.tag{{position:absolute;top:170px;left:80px}}
.bg{{position:absolute;inset:0;background:radial-gradient(120% 75% at 50% 0%,#2C6A51 0%,{GREEN} 50%,{GREEN_INK} 100%)}}
.bg::after{{content:"";position:absolute;inset:40px;border:2px solid rgba(244,241,234,.12);border-radius:10px}}
body.paper .bg{{background:{PAPER}}}
body.paper .bg::after{{border-color:rgba(26,31,28,.12)}}
.tag{{display:inline-flex;align-self:flex-start;gap:14px;align-items:center;border:2px solid rgba(244,241,234,.35);border-radius:8px;padding:12px 24px;font-size:32px;font-weight:600;letter-spacing:.12em;text-transform:uppercase}}
body.paper .tag{{border-color:rgba(26,31,28,.3)}}
.brand{{position:absolute;left:64px;bottom:64px;display:flex;gap:20px;align-items:center}}
.mark{{width:84px;height:84px;border-radius:50%;background:{PAPER};color:{GREEN};position:relative;display:flex;align-items:center;justify-content:center;flex:none}}
.mark::after{{content:"";position:absolute;right:7%;top:7%;width:18%;height:18%;background:{SEAL};transform:rotate(45deg)}}
body.paper .mark{{background:{GREEN};color:{PAPER}}}
.mk-s{{font:600 1em/1 'IBM Plex Serif',serif;font-size:inherit}}
.mark .mk-s{{font-size:48px}}
.wm{{font:600 40px/1 'IBM Plex Serif',serif;letter-spacing:.1em}}
.wm i{{font-style:normal;position:relative;display:inline-block}}
.wm i::after{{content:"";position:absolute;left:.29em;top:-.22em;width:.2em;height:.2em;background:{SEAL};transform:rotate(45deg)}}
.disc{{position:absolute;left:64px;right:64px;bottom:168px;font-size:24px;opacity:.65}}
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
    """Знак + словесный знак SUBÁSTICA внизу кадра."""
    return f'<div class="brand" style="{extra_style}"><div class="mark">{ICON}</div><span class="wm">SUB<i>A</i>STICA</span></div>'

def mark(size=200):
    """Крупный знак для финального кадра."""
    return f'<div class="mark" style="width:{size}px;height:{size}px"><span class="mk-s" style="font-size:{int(size*.58)}px">S</span></div>'

def page(body_html, paper=False, css=None):
    return f'<html><head><meta charset="utf-8"><style>{css or CSS}</style></head><body class="{"paper" if paper else ""}">{body_html}</body></html>'


def photo(src, pos='50% 50%', shade='both', blur=0, scale=1.0):
    """Фотография на весь кадр + затемнение, чтобы текст читался.
    shade: both (сверху и снизу), hero (текст сверху, фото открыто в середине), bottom, top, full (ровно по всему кадру)."""
    g = {'both': 'linear-gradient(180deg,rgba(20,51,38,.94) 0%,rgba(20,51,38,.7) 28%,rgba(20,51,38,.12) 48%,rgba(20,51,38,.3) 62%,rgba(20,51,38,.95) 100%)',
         'bottom': 'linear-gradient(180deg,rgba(20,51,38,.25) 0%,rgba(20,51,38,.1) 35%,rgba(20,51,38,.9) 68%,rgba(20,51,38,.97) 100%)',
         'top': 'linear-gradient(180deg,rgba(20,51,38,.95) 0%,rgba(20,51,38,.6) 35%,rgba(20,51,38,0) 60%)',
         'hero': 'linear-gradient(180deg,rgba(20,51,38,.95) 0%,rgba(20,51,38,.8) 30%,rgba(20,51,38,0) 46%,rgba(20,51,38,0) 76%,rgba(20,51,38,.92) 92%)',
         'full': 'rgba(20,51,38,.62)'}[shade]
    f = f'filter:blur({blur}px);' if blur else ''
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
