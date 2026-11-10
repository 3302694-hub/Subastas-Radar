"""Страницы провинций и городов на трёх языках (для поиска Google) + sitemap.xml и robots.txt.

Собирается на сервере после обновления: python tools/seo_pages.py
Пишет site/subastas/<провинция>/[<город>/]index.html, site/en/subastas/…, site/ru/subastas/…
Эти файлы генерируются и в git не хранятся (.gitignore).

Гостям сайт показывает только часть аукционов, поэтому на странице — сводка и до 10 ближайших,
а полный список открывается в поиске после бесплатной регистрации.
"""
from __future__ import annotations

import html
import json
import os
import re
import shutil
import statistics
import sys
import unicodedata
import urllib.request
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SITE_DIR = ROOT / "site"
sys.path.insert(0, str(ROOT / "scraper"))
from alerts import norm_province  # noqa: E402

URL = os.environ.get("SUPABASE_URL", "https://jkxvxdhmothlamhotecu.supabase.co").rstrip("/")
KEY = os.environ.get("SUPABASE_SERVICE_KEY", "")
SITE = os.environ.get("SITE_URL", "https://subastica.es").rstrip("/")
LANGS = ("es", "en", "ru")
CITY_MIN = 5          # город получает свою страницу, если в нём столько открытых аукционов
SHOW = 10             # сколько аукционов показываем на странице
VER = datetime.now(timezone.utc).strftime("%Y%m%d")

GROUP = {"vivienda": "vivienda", "inmueble": "vivienda", "garaje": "g_garaje", "trastero": "g_garaje",
         "local": "g_local", "nave": "g_local", "solar": "g_terreno", "rustica": "g_terreno"}
LOWER = {"de", "del", "la", "las", "los", "el", "y", "i", "en", "les", "dels", "da", "do"}

T = {
    "es": {
        "title": "Subastas en {p}: {n} abiertas | Subástica", "h1": "Subastas públicas en {p}",
        "desc": "{n} subastas abiertas en {p}: viviendas, garajes, locales y terrenos del BOE y la Seguridad Social. Precios, depósito y fechas, actualizado a diario.",
        "lead": "Ahora mismo hay {n} subastas abiertas en {p}. Las reunimos del Portal de Subastas del BOE y del catálogo de la Seguridad Social y las actualizamos varias veces al día.",
        "types": "Qué se subasta", "price": "Valor de subasta mediano: {v}.",
        "hist": "En los últimos 12 meses terminaron {d} subastas en {p}; el {b} % tuvo pujas y la puja más alta fue, en la mediana, el {m} % del valor de subasta.",
        "soon": "Terminan pronto", "start": "Valor de subasta", "ends": "Termina", "nextd": "por anunciar",
        "all": "Ver las {n} subastas de {p} en el buscador", "free": "El buscador es gratuito: regístrate para ver todas, con filtros, mapa y alertas por correo.",
        "cities": "Ciudades de {p}", "provs": "Otras provincias", "back": "Todas las provincias",
        "g": {"vivienda": "Viviendas", "g_garaje": "Garajes y trasteros", "g_local": "Locales y naves", "g_terreno": "Terrenos", "g_otros": "Otros bienes"},
        "c": {"vivienda": "Vivienda", "inmueble": "Inmueble", "garaje": "Garaje", "trastero": "Trastero", "local": "Local", "nave": "Nave", "solar": "Solar", "rustica": "Finca rústica"},
        "other": "Bien", "spain": "España", "index_title": "Subastas por provincia | Subástica",
        "index_h1": "Subastas públicas por provincia", "index_lead": "{n} subastas abiertas en España. Elige una provincia.",
    },
    "en": {
        "title": "Property auctions in {p}: {n} open | Subástica", "h1": "Public auctions in {p}",
        "desc": "{n} open auctions in {p}: homes, parking spaces, commercial units and land from the BOE and Social Security. Prices, deposit and dates, updated daily.",
        "lead": "There are {n} open auctions in {p} right now. We gather them from the BOE auction portal and the Social Security catalogue and update them several times a day.",
        "types": "What's on auction", "price": "Median auction value: {v}.",
        "hist": "In the last 12 months {d} auctions ended in {p}; {b}% had bids, and the median top bid was {m}% of the auction value.",
        "soon": "Ending soon", "start": "Auction value", "ends": "Ends", "nextd": "to be announced",
        "all": "See all {n} auctions in {p} in the search", "free": "The search is free: sign up to see them all, with filters, a map and email alerts.",
        "cities": "Towns in {p}", "provs": "Other provinces", "back": "All provinces",
        "g": {"vivienda": "Homes", "g_garaje": "Parking and storage", "g_local": "Shops and warehouses", "g_terreno": "Land", "g_otros": "Other assets"},
        "c": {"vivienda": "Home", "inmueble": "Property", "garaje": "Parking space", "trastero": "Storage room", "local": "Commercial unit", "nave": "Warehouse", "solar": "Plot", "rustica": "Rural land"},
        "other": "Asset", "spain": "Spain", "index_title": "Auctions by province | Subástica",
        "index_h1": "Public auctions by province", "index_lead": "{n} open auctions in Spain. Choose a province.",
    },
    "ru": {
        "title": "Аукционы недвижимости: {p} — {n} открытых | Subástica", "h1": "Аукционы: {p}",
        "desc": "{n} открытых аукционов, {p}: квартиры, гаражи, помещения и земля из BOE и Seguridad Social. Цены, депозит и даты, обновляется ежедневно.",
        "lead": "Сейчас открыто аукционов: {n} ({p}). Мы собираем их с портала аукционов BOE и из каталога Seguridad Social и обновляем несколько раз в день.",
        "types": "Что продаётся", "price": "Медианная стоимость лота: {v}.",
        "hist": "За последние 12 месяцев завершилось {d} аукционов ({p}); ставки были в {b} %, медиана максимальной ставки — {m} % от стоимости лота.",
        "soon": "Скоро завершатся", "start": "Стоимость лота", "ends": "Конец", "nextd": "дата ещё не объявлена",
        "all": "Все {n} аукционов ({p}) в поиске", "free": "Поиск бесплатный: зарегистрируйтесь, чтобы видеть все аукционы, фильтры, карту и оповещения на почту.",
        "cities": "Города: {p}", "provs": "Другие провинции", "back": "Все провинции",
        "g": {"vivienda": "Жильё", "g_garaje": "Гаражи и кладовые", "g_local": "Помещения и склады", "g_terreno": "Земля", "g_otros": "Другое"},
        "c": {"vivienda": "Жильё", "inmueble": "Недвижимость", "garaje": "Гараж", "trastero": "Кладовая", "local": "Помещение", "nave": "Склад", "solar": "Участок", "rustica": "Земля"},
        "other": "Имущество", "spain": "Испания", "index_title": "Аукционы по провинциям | Subástica",
        "index_h1": "Аукционы по провинциям Испании", "index_lead": "Открытых аукционов в Испании: {n}. Выберите провинцию.",
    },
}
LOC = {"es": "es-ES", "en": "en-GB", "ru": "ru-RU"}
MONTHS = {
    "es": ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sept", "oct", "nov", "dic"],
    "en": ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
    "ru": ["янв", "фев", "мар", "апр", "мая", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"],
}


def place(s: str) -> str:
    s = re.sub(r"\b([LD])\s?¿\s?", r"\1'", s or "").replace("¿", "'")
    parts = re.split(r"(\s+|-|/|\()", s.lower())
    out = []
    for i, w in enumerate(parts):
        if not w.strip() or re.fullmatch(r"\s+|-|/|\(", w):
            out.append(w)
        elif i > 0 and w in LOWER:
            out.append(w)
        elif re.match(r"^[ld]'", w):
            out.append(w[0].upper() + "'" + w[2:3].upper() + w[3:])
        else:
            out.append(w[:1].upper() + w[1:])
    return "".join(out)


def slug(s: str) -> str:
    s = unicodedata.normalize("NFD", (s or "").lower())
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    return re.sub(r"[^a-z0-9]+", "-", s).strip("-")


def eur(v, lang: str) -> str:
    if v is None:
        return "—"
    n = f"{round(v):,}"
    return (n.replace(",", ".") + " €") if lang == "es" else (n.replace(",", " ") + " €") if lang == "ru" else "€" + n


def when(iso: str | None, lang: str) -> str:
    if not iso:
        return T[lang]["nextd"]
    try:
        d = datetime.fromisoformat(iso)
    except ValueError:
        return T[lang]["nextd"]
    return f"{d.day} {MONTHS[lang][d.month - 1]} {d.year}"


def fill(s: str, **k) -> str:
    return s.format(**k)


def e(s) -> str:
    return html.escape(str(s if s is not None else ""), quote=True)


# ---------- данные
def load_open() -> list[dict]:
    if not KEY:
        raise SystemExit("seo_pages: нет SUPABASE_SERVICE_KEY")
    sel = ("id,cat:data->>categoria,oculta:data->>oculta,loc:data->>localidad,prov:data->>provincia,"
           "valor:data->>valor_subasta,fin:data->>fecha_fin,estado:data->>estado")
    out, off = [], 0
    while True:
        req = urllib.request.Request(
            f"{URL}/rest/v1/subastas?select={sel}&data->>estado=in.(activa,proxima)&order=id&limit=1000&offset={off}",
            headers={"apikey": KEY, "Authorization": f"Bearer {KEY}"})
        with urllib.request.urlopen(req, timeout=60) as r:
            rows = json.loads(r.read())
        out += rows
        if len(rows) < 1000:
            break
        off += 1000
    for s in out:
        s["valor"] = float(s["valor"]) if s.get("valor") not in (None, "") else None
        s["p"] = norm_province(s.get("prov") or "")
        s["city"] = place(s.get("loc") or "").strip()
    return out


# ---------- разметка
def page(lang: str, path: str, title: str, desc: str, body: str, alts: dict[str, str]) -> str:
    links = "".join(f'<link rel="alternate" hreflang="{l}" href="{SITE}{u}">' for l, u in alts.items())
    links += f'<link rel="alternate" hreflang="x-default" href="{SITE}{alts["es"]}">'
    cur = ' aria-current="page"'
    nav = "".join(f'<a href="{u}" hreflang="{l}"{cur if l == lang else ""}>{l.upper()}</a>' for l, u in alts.items())
    return f"""<!DOCTYPE html>
<html lang="{lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{e(title)}</title>
<meta name="description" content="{e(desc)}">
<link rel="canonical" href="{SITE}{path}">{links}
<meta name="theme-color" content="#1F4D3A">
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 32 32%22%3E%3Ccircle cx=%2216%22 cy=%2216%22 r=%2216%22 fill=%22%231F4D3A%22/%3E%3Ctext x=%2216%22 y=%2222.5%22 text-anchor=%22middle%22 font-family=%22Georgia,serif%22 font-weight=%22700%22 font-size=%2219%22 fill=%22%23F4F1EA%22%3ES%3C/text%3E%3Crect x=%2222%22 y=%225%22 width=%225%22 height=%225%22 fill=%22%23D4A017%22 transform=%22rotate(45 24.5 7.5)%22/%3E%3C/svg%3E">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600;700&family=IBM+Plex+Serif:wght@500;600&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/assets/style.css?v={VER}">
<link rel="stylesheet" href="/assets/legal.css?v={VER}">
<link rel="stylesheet" href="/assets/seo.css?v={VER}">
</head>
<body>
<header class="top"><div class="wrap top-in"><a class="brand" href="/"><span class="brand-mark" aria-hidden="true">S</span><span class="wordmark" aria-hidden="true">SUB<span class="wm-a">A</span>STICA</span><span class="sr">Subástica</span></a>
<nav class="seo-lang">{nav}</nav></div></header>
<main class="legal seo">
{body}
</main>
<footer class="foot"><div class="wrap foot-in"><p class="foot-links"><a href="/aviso-legal.html">Aviso legal</a> · <a href="/terminos.html">Términos y condiciones</a> · <a href="/privacidad.html">Privacidad</a> · <a href="/cookies.html">Cookies</a> · <a href="/servicios.html">Servicios</a> · <a href="/estadisticas.html">Estadísticas</a></p><p class="fine">Datos del Portal de Subastas del BOE — <a href="https://subastas.boe.es" rel="noopener">subastas.boe.es</a> — y del catálogo de subastas de la Seguridad Social — <a href="https://www.seg-social.es" rel="noopener">seg-social.es</a>. Subástica es un servicio independiente.</p></div></footer>
</body>
</html>
"""


def prefix(lang: str) -> str:
    return "" if lang == "es" else f"/{lang}"


def block(lang: str, label: str, items: list[dict], stats: dict | None, search_url: str) -> str:
    t = T[lang]
    n = len(items)
    groups = Counter(GROUP.get("vivienda" if s.get("oculta") else s.get("cat"), "g_otros") for s in items)
    vals = [s["valor"] for s in items if s.get("valor")]
    parts = [f"<h1>{e(fill(t['h1'], p=label))}</h1>", f"<p class=\"seo-lead\">{e(fill(t['lead'], n=n, p=label))}</p>"]
    if groups:
        lis = "".join(f"<li><b>{groups[g]}</b> {e(t['g'][g])}</li>" for g in ("vivienda", "g_garaje", "g_local", "g_terreno", "g_otros") if groups.get(g))
        parts.append(f"<h2>{e(t['types'])}</h2><ul class=\"seo-types\">{lis}</ul>")
    if vals:
        parts.append(f"<p>{e(fill(t['price'], v=eur(statistics.median(vals), lang)))}</p>")
    if stats and stats.get("pct_con_pujas") is not None and stats.get("mediana_puja_pct") is not None:
        b = str(stats["pct_con_pujas"]).replace(".", "," if lang != "en" else ".")
        m = str(stats["mediana_puja_pct"]).replace(".0", "").replace(".", "," if lang != "en" else ".")
        parts.append(f"<p>{e(fill(t['hist'], d=stats['terminadas'], p=label, b=b, m=m))}</p>")
    soon = sorted(items, key=lambda s: s.get("fin") or "9999")[:SHOW]
    if soon:
        rows = "".join(
            f"<li><a href=\"/#/s/{e(s['id'])}\"><b>{e(t['c'].get('vivienda' if s.get('oculta') else s.get('cat'), t['other']))}"
            f"{', ' + e(s['city']) if s.get('city') else ''}</b><span>{e(t['start'])}: {e(eur(s.get('valor'), lang))} · {e(t['ends'])}: {e(when(s.get('fin'), lang))}</span></a></li>"
            for s in soon)
        parts.append(f"<h2>{e(t['soon'])}</h2><ul class=\"seo-list\">{rows}</ul>")
    parts.append(f"<p class=\"seo-cta\"><a class=\"btn\" href=\"{e(search_url)}\">{e(fill(t['all'], n=n, p=label))}</a></p><p class=\"muted\">{e(t['free'])}</p>")
    return "".join(parts)


def main() -> int:
    items = load_open()
    stats = {}
    sf = SITE_DIR / "data" / "stats.json"
    if sf.exists():
        stats = json.loads(sf.read_text("utf-8")).get("por_provincia", {})
    by_prov = defaultdict(list)
    for s in items:
        if s["p"]:
            by_prov[s["p"]].append(s)
    # пересобираем с нуля, чтобы не оставались страницы провинций без аукционов
    for d in (SITE_DIR / "subastas", SITE_DIR / "en", SITE_DIR / "ru"):
        shutil.rmtree(d, ignore_errors=True)
    urls = []
    provs = sorted(by_prov, key=lambda p: slug(p))

    def write(rel: str, content: str):
        f = SITE_DIR / rel.strip("/") / "index.html"
        f.parent.mkdir(parents=True, exist_ok=True)
        f.write_text(content, "utf-8")

    for lang in LANGS:
        t = T[lang]
        # оглавление
        path = f"{prefix(lang)}/subastas/"
        alts = {l: f"{prefix(l)}/subastas/" for l in LANGS}
        lis = "".join(f"<li><a href=\"{prefix(lang)}/subastas/{slug(p)}/\">{e(place(p))}</a> <span>{len(by_prov[p])}</span></li>" for p in provs)
        body = f"<h1>{e(t['index_h1'])}</h1><p class=\"seo-lead\">{e(fill(t['index_lead'], n=len(items)))}</p><ul class=\"seo-provs\">{lis}</ul>"
        write(path, page(lang, path, t["index_title"], fill(t["index_lead"], n=len(items)), body, alts))
        urls.append(path)
        for p in provs:
            ps, label = slug(p), place(p)
            path = f"{prefix(lang)}/subastas/{ps}/"
            alts = {l: f"{prefix(l)}/subastas/{ps}/" for l in LANGS}
            cities = Counter(s["city"] for s in by_prov[p] if s["city"])
            big = sorted([c for c, k in cities.items() if k >= CITY_MIN], key=slug)
            body = block(lang, label, by_prov[p], stats.get(p), f"/?prov={p}&l={lang}")
            if big:
                body += f"<h2>{e(fill(t['cities'], p=label))}</h2><ul class=\"seo-provs\">" + "".join(
                    f"<li><a href=\"{path}{slug(c)}/\">{e(c)}</a> <span>{cities[c]}</span></li>" for c in big) + "</ul>"
            body += f"<h2>{e(t['provs'])}</h2><ul class=\"seo-provs seo-small\">" + "".join(
                f"<li><a href=\"{prefix(lang)}/subastas/{slug(o)}/\">{e(place(o))}</a></li>" for o in provs if o != p) + "</ul>"
            write(path, page(lang, path, fill(t["title"], p=label, n=len(by_prov[p])), fill(t["desc"], p=label, n=len(by_prov[p])), body, alts))
            urls.append(path)
            for c in big:
                cs = slug(c)
                cpath = f"{path}{cs}/"
                calts = {l: f"{prefix(l)}/subastas/{ps}/{cs}/" for l in LANGS}
                lab = f"{c} ({label})" if c != label else c
                its = [s for s in by_prov[p] if s["city"] == c]
                body = block(lang, lab, its, None, f"/?prov={p}&q={c}&l={lang}")
                body += f"<p><a href=\"{path}\">← {e(label)}</a> · <a href=\"{prefix(lang)}/subastas/\">{e(t['back'])}</a></p>"
                write(cpath, page(lang, cpath, fill(t["title"], p=lab, n=len(its)), fill(t["desc"], p=lab, n=len(its)), body, calts))
                urls.append(cpath)

    today = datetime.now(timezone.utc).date().isoformat()
    main_pages = ["/", "/estadisticas.html", "/servicios.html", "/aviso-legal.html", "/terminos.html", "/privacidad.html", "/cookies.html"]
    sm = "".join(f"<url><loc>{SITE}{u}</loc><lastmod>{today}</lastmod></url>" for u in main_pages + urls)
    (SITE_DIR / "sitemap.xml").write_text(f'<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">{sm}</urlset>', "utf-8")
    (SITE_DIR / "robots.txt").write_text(f"User-agent: *\nDisallow: /admin.html\nDisallow: /baja.html\nSitemap: {SITE}/sitemap.xml\n", "utf-8")
    print(f"seo_pages: провинций {len(provs)}, страниц {len(urls)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
