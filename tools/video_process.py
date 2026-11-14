#!/usr/bin/env python3
"""Подготовка видео для Reels: денойз, вырезание пауз, скорость, субтитры (RU) с акцентными словами.
Запуск: SPEED=1.1 python tools/video_process.py IN.mp4 OUT.mp4"""
import subprocess as sp, sys, os, re

IN, OUT = sys.argv[1], sys.argv[2]
SPEED = float(os.environ.get("SPEED", "1.1"))
ACCENT = "&H0000D4FF"   # жёлтый (ASS = &H00BBGGRR) для акцентных слов
WHITE  = "&H00FFFFFF"

def run(cmd, **kw): print("+", " ".join(map(str, cmd))); return sp.run(cmd, check=True, **kw)
def probe_dur(f): return float(sp.run(["ffprobe","-v","error","-show_entries","format=duration","-of","csv=p=0",f],capture_output=True,text=True).stdout.strip())

# 1) денойз речи + лёгкий хайпасс от гула (удаляем внешние шумы)
run(["ffmpeg","-y","-i",IN,"-af","highpass=f=90,afftdn=nf=-26,dynaudnorm","-c:v","copy","/tmp/clean.mp4"])

# 2) детект тишины и сборка «keep»-сегментов (вырезаем паузы синхронно по видео+аудио)
p = sp.run(["ffmpeg","-i","/tmp/clean.mp4","-af","silencedetect=noise=-30dB:d=0.45","-f","null","-"],capture_output=True,text=True)
log = p.stderr
starts = [float(x) for x in re.findall(r"silence_start: ([\d.]+)", log)]
ends   = [float(x) for x in re.findall(r"silence_end: ([\d.]+)", log)]
dur = probe_dur("/tmp/clean.mp4")
if len(ends) < len(starts): ends = ends + [dur]
pad = 0.07
keep, cur = [], 0.0
for s, e in zip(starts, ends):
    seg_end = max(cur, s + pad)
    if seg_end > cur + 0.12: keep.append((cur, min(seg_end, dur)))
    cur = max(cur, e - pad)
if dur - cur > 0.12: keep.append((cur, dur))
if not keep: keep = [(0.0, dur)]
print(f"keep segments: {len(keep)}  (было тишины: {len(starts)})")

# 3) вырезать паузы + ускорить + вписать по ширине 1080 (для Reels и размера)
fc = []
for i,(a,b) in enumerate(keep):
    fc.append(f"[0:v]trim={a:.3f}:{b:.3f},setpts=PTS-STARTPTS[v{i}]")
    fc.append(f"[0:a]atrim={a:.3f}:{b:.3f},asetpts=PTS-STARTPTS[a{i}]")
cat = "".join(f"[v{i}][a{i}]" for i in range(len(keep)))
fc.append(f"{cat}concat=n={len(keep)}:v=1:a=1[vc][ac]")
fc.append(f"[vc]setpts=PTS/{SPEED},scale='if(gt(iw,1080),1080,iw)':-2[vs]")
fc.append(f"[ac]atempo={SPEED}[as]")
open("/tmp/fc.txt","w").write(";\n".join(fc))
run(["ffmpeg","-y","-i","/tmp/clean.mp4","-filter_complex_script","/tmp/fc.txt",
     "-map","[vs]","-map","[as]","-c:v","libx264","-preset","veryfast","-crf","20",
     "-c:a","aac","-b:a","160k","-movflags","+faststart","/tmp/fast.mp4"])

# 4) субтитры: whisper с word-level таймингами (RU)
from faster_whisper import WhisperModel
model = WhisperModel("small", device="cpu", compute_type="int8")
segments,_ = model.transcribe("/tmp/fast.mp4", language="ru", word_timestamps=True, vad_filter=True)
words = []
for seg in segments:
    for w in (seg.words or []):
        t = w.word.strip()
        if t: words.append((w.start, w.end, t))

# группируем слова в короткие строки; акцентными помечаем числа и самое длинное слово строки
def is_num(s): return any(c.isdigit() for c in s)
def clean(s): return re.sub(r"[.,!?;:«»\"()]", "", s)
lines, cur_line = [], []
for i,(s,e,t) in enumerate(words):
    cur_line.append((s,e,t))
    gap = (words[i+1][0]-e) if i+1<len(words) else 99
    if len(cur_line) >= 5 or gap > 0.45 or clean(t)[-1:] in ".!?":
        lines.append(cur_line); cur_line=[]
if cur_line: lines.append(cur_line)

def ts(t):
    h=int(t//3600); m=int(t%3600//60); s=t-h*3600-m*60
    return f"{h:01d}:{m:02d}:{s:05.2f}"

ass = ["[Script Info]","ScriptType: v4.00+","PlayResX: 1080","PlayResY: 1920","WrapStyle: 2","",
"[V4+ Styles]","Format: Name, Fontname, Fontsize, PrimaryColour, OutlineColour, BackColour, Bold, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
f"Style: Def,DejaVu Sans,46,{WHITE},&H00101010,&HB0000000,-1,3,0,2,80,80,260,1","",
"[Events]","Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text"]
for ln in lines:
    s = ln[0][0]; e = ln[-1][1]
    maxlen = max((len(clean(w[2])) for w in ln), default=0)
    picked = False
    parts=[]
    for (ws,we,wt) in ln:
        cw = clean(wt)
        accent = is_num(cw) or (not picked and len(cw)==maxlen and maxlen>=6)
        if accent and not is_num(cw): picked=True
        if accent: parts.append(f"{{\\c{ACCENT}}}{wt}{{\\c{WHITE}}}")
        else: parts.append(wt)
    text = " ".join(parts)
    ass.append(f"Dialogue: 0,{ts(s)},{ts(e)},Def,,0,0,0,,{text}")
open("/tmp/subs.ass","w").write("\n".join(ass))

# 5) прожечь субтитры
run(["ffmpeg","-y","-i","/tmp/fast.mp4","-vf","ass=/tmp/subs.ass","-c:a","copy",
     "-c:v","libx264","-preset","veryfast","-crf","20","-movflags","+faststart",OUT])
print("DONE", OUT, "dur=", probe_dur(OUT))
