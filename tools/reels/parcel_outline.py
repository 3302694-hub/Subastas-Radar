import json,re,math,sys
from PIL import Image,ImageDraw
def poly(d):
    g=open(f'{d}/parcela0.gml',encoding='latin-1').read()
    pts=re.search(r'<gml:posList[^>]*>([^<]+)</gml:posList>',g).group(1).split()
    return [(float(pts[i]),float(pts[i+1])) for i in range(0,len(pts),2)]
def draw(d,name,w,h,out,width=6):
    info=json.load(open(f'{d}/info.json')); c=info['catastro'][0]; lat0,lon0=c['lat'],c['lon']
    dlat=h/111320/2; dlon=w/(111320*math.cos(math.radians(lat0)))/2
    im=Image.open(f'{d}/{name}').convert('RGB'); W,H=im.size
    P=[(((lo-(lon0-dlon))/(2*dlon))*W, (((lat0+dlat)-la)/(2*dlat))*H) for la,lo in poly(d)]
    dr=ImageDraw.Draw(im); dr.line(P+[P[0]],fill=(255,214,0),width=width,joint='curve')
    im.save(out,quality=92); return P
for d in sys.argv[1:]:
    P=draw(d,'aereo_cerca0.jpg',70,125,f'/tmp/reel/{d}_cerca.jpg',8)
    draw(d,'aereo_medio0.jpg',160,285,f'/tmp/reel/{d}_medio.jpg',6)
    print(d,[tuple(map(int,p)) for p in P][:3])
