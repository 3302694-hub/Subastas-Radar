"""Материалы для рилс: полное описание лота из BOE, данные и фото фасада из Катастро,
аэрофото PNOA (© Instituto Geográfico Nacional, CC BY 4.0), фото лота из документов аукциона
(subasta_fotos → foto_NN.jpg) и, по желанию, музыка.
Запуск: python tools/social_assets.py SUB-... SUB-... [--music URL]
Всё складывается в site/social/src/<id>/."""
import json, math, os, re, sys, urllib.parse, urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scraper"))
from scrape import Fetcher            # noqa: E402
import boe, enrich                    # noqa: E402

OUT = Path(__file__).resolve().parent.parent / "site" / "social" / "src"
UA = {"User-Agent": "Mozilla/5.0 (Subastica; +https://subastica.es)"}
MUSIC_HOSTS = ("ai-music-tracks.s3.us-east-1.amazonaws.com", "assets.vidiq.com")


def binary(url: str) -> bytes:
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=60) as r:
        return r.read()


SB_URL = os.environ.get("SUPABASE_URL", "https://jkxvxdhmothlamhotecu.supabase.co").rstrip("/")
SB_KEY = os.environ.get("SUPABASE_SERVICE_KEY", "")


def lot_photos(sid: str, d: Path) -> None:
    """Фото лота, уже вынутые из документов аукциона (таблица subasta_fotos, публичное хранилище fotos/).
    Кладёт foto_01.jpg… (главное фото — первым) и fotos.json со списком исходных путей."""
    if not SB_KEY:
        print(sid, "фото лота: нет SUPABASE_SERVICE_KEY, пропуск"); return
    q = f"{SB_URL}/rest/v1/subasta_fotos?subasta_id=eq.{urllib.parse.quote(sid)}&visible=eq.true&select=path,portada&order=portada.desc,path"
    req = urllib.request.Request(q, headers={"apikey": SB_KEY, "Authorization": f"Bearer {SB_KEY}"})
    with urllib.request.urlopen(req, timeout=60) as r:
        rows = json.load(r)
    got = []
    for n, row in enumerate(rows[:12], 1):
        try:
            (d / f"foto_{n:02d}.jpg").write_bytes(binary(f"{SB_URL}/storage/v1/object/public/fotos/{urllib.parse.quote(row['path'])}"))
            got.append({"file": f"foto_{n:02d}.jpg", "path": row["path"], "portada": row.get("portada")})
        except Exception as e:  # noqa: BLE001
            print(sid, "фото", row["path"], e)
    if got:
        (d / "fotos.json").write_text(json.dumps(got, ensure_ascii=False, indent=1))
    print(sid, "фото лота:", len(got))


def ortho(lat: float, lon: float, w_m: float, h_m: float, px=(1080, 1920)) -> bytes:
    dlat = h_m / 111320 / 2
    dlon = w_m / (111320 * math.cos(math.radians(lat))) / 2
    bbox = f"{lat - dlat},{lon - dlon},{lat + dlat},{lon + dlon}"   # WMS 1.3.0 + EPSG:4326: широта, долгота
    url = ("https://www.ign.es/wms-inspire/pnoa-ma?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap&LAYERS=OI.OrthoimageCoverage"
           f"&STYLES=&CRS=EPSG:4326&BBOX={bbox}&WIDTH={px[0]}&HEIGHT={px[1]}&FORMAT=image/jpeg")
    return binary(url)


def main(args):
    music = None
    if "--music" in args:
        i = args.index("--music"); music = args[i + 1]; args = args[:i] + args[i + 2:]
    f = Fetcher()
    for sid in args:
        if not re.fullmatch(r"SUB-[A-Z]{2}-\d{4}-[0-9A-Z]+", sid):
            print("пропуск", sid); continue
        d = OUT / sid; d.mkdir(parents=True, exist_ok=True)
        info = {"id": sid}
        try:
            html = f.get(f"https://subastas.boe.es/detalleSubasta.php?idSub={sid}&ver=3")
            info["bienes"] = boe.parse_assets(html)
        except Exception as e:  # noqa: BLE001
            print(sid, "BOE:", e)
        rcs = [b.get("ref_catastral") for b in info.get("bienes") or [] if b.get("ref_catastral")]
        for n, rc in enumerate(rcs[:3]):
            cat = enrich.catastro_lookup(f, rc) or {}
            info.setdefault("catastro", []).append(cat)
            rc14 = re.sub(r"[^0-9A-Z]", "", rc.upper())[:14]
            try:
                (d / f"fachada{n}.jpg").write_bytes(binary(
                    f"https://ovc.catastro.meh.es/OVCServWeb/OVCWcfLibres/OVCFotoFachada.svc/RecuperarFotoFachadaGet?ReferenciaCatastral={rc14}"))
            except Exception as e:  # noqa: BLE001
                print(sid, "фасад:", e)
            try:   # контур участка (INSPIRE, кадастровые участки)
                (d / f"parcela{n}.gml").write_bytes(binary(
                    "https://ovc.catastro.meh.es/INSPIRE/wfsCP.aspx?service=wfs&version=2&request=getfeature"
                    f"&STOREDQUERIE_ID=GetParcel&refcat={rc14}&srsname=EPSG::4326"))
            except Exception as e:  # noqa: BLE001
                print(sid, "контур:", e)
            if cat.get("lat"):
                for name, (w, h) in {"aereo_cerca": (70, 125), "aereo_medio": (160, 285), "aereo_lejos": (600, 1065)}.items():
                    try:
                        (d / f"{name}{n}.jpg").write_bytes(ortho(cat["lat"], cat["lon"], w, h))
                    except Exception as e:  # noqa: BLE001
                        print(sid, name, e)
        try:
            lot_photos(sid, d)
        except Exception as e:  # noqa: BLE001
            print(sid, "фото лота:", e)
        (d / "info.json").write_text(json.dumps(info, ensure_ascii=False, indent=1))
        print(sid, "готово:", sorted(p.name for p in d.iterdir()))
    if music:
        if urllib.parse.urlparse(music).hostname not in MUSIC_HOSTS:
            print("музыка: чужой адрес, пропуск")
        else:
            (OUT / "music").mkdir(parents=True, exist_ok=True)
            name = re.sub(r"[^0-9a-z.-]", "", music.rsplit("/", 1)[-1].lower())[-60:]
            (OUT / "music" / name).write_bytes(binary(music))
            print("музыка:", name)


if __name__ == "__main__":
    main(sys.argv[1:])
