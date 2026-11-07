import json,re,math
from PIL import Image,ImageDraw
exec(open('/tmp/reel/outline.py').read().split('for d in sys.argv')[0])
ids=['SUB-JA-2026-265360','SUB-JA-2025-254149','SUB-JA-2026-266978']
for d in ids:
    P=draw(d,'aereo_cerca0.jpg',70,125,f'/tmp/reel/{d}_cerca.jpg',7)
    xs=[p[0] for p in P]; ys=[p[1] for p in P]
    cx,cy=(min(xs)+max(xs))/2,(min(ys)+max(ys))/2
    w=min(1080,max(max(xs)-min(xs),(max(ys)-min(ys))*1.6)*1.5); h=w/1.6
    im=Image.open(f'/tmp/reel/{d}_cerca.jpg')
    x0=min(max(0,cx-w/2),1080-w); y0=min(max(0,cy-h/2),1920-h); box=(x0,y0,x0+w,y0+h)
    im.crop(tuple(map(int,box))).resize((960,600)).save(f'/tmp/reel/{d}_air.jpg',quality=92)
    f=Image.open(f'{d}/fachada0.jpg'); W,H=f.size
    f=f.crop((0,24,W,H)); W,H=f.size; th=int(W/1.6)
    f.crop((0,(H-th)//2,W,(H-th)//2+th)).resize((960,600)).save(f'/tmp/reel/{d}_fac.jpg',quality=92)
# фон для крючка: дальний план района
im=Image.open('SUB-JA-2025-254149/aereo_medio0.jpg'); im.save('/tmp/reel/hook_bg.jpg',quality=90)
print('ok')
