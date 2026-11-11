#!/usr/bin/env bash
# Сборка рилс из PNG-слайдов 1080x1920: лёгкий наезд, переходы, музыка.
# Пример: tools/reels/render.sh out.mp4 "t_h0.png:3.4 t_h3.png:5.6 t_cta.png:3.6"
set -e
OUT=$1; SPEC=$2
# MUSIC=none — без музыки (тихая дорожка): музыку добавляют в приложении Instagram.
# Трек 0d3ede45… пользователю не нравится (11.11.2026) — указывать MUSIC явно.
MUSIC=${MUSIC:-none}
TMP=$(mktemp -d); i=0; ins=(); durs=()
for item in $SPEC; do f=${item%%:*}; d=${item##*:}
  ffmpeg -loglevel error -y -loop 1 -framerate 30 -t $d -i "$f" -vf "scale=1188:2112,zoompan=z='1+0.035*on/($d*30)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=1080x1920:fps=30,format=yuv420p" -c:v libx264 -preset veryfast -crf 18 $TMP/$i.mp4
  ins+=(-i $TMP/$i.mp4); durs+=($d); i=$((i+1)); done
fc=""; prev="[0]"; off=0
for ((k=1;k<i;k++)); do off=$(python3 -c "print(round($off+${durs[$((k-1))]}-0.3,2))"); fc+="$prev[$k]xfade=transition=slideleft:duration=0.3:offset=$off[v$k];"; prev="[v$k]"; done
ffmpeg -loglevel error -y "${ins[@]}" -filter_complex "${fc}${prev}format=yuv420p[v]" -map "[v]" -c:v libx264 -preset veryfast -crf 20 $TMP/v.mp4
D=$(ffprobe -v error -show_entries format=duration -of csv=p=0 $TMP/v.mp4); FO=$(python3 -c "print($D-1.5)")
if [ "$MUSIC" = none ]; then
  ffmpeg -loglevel error -y -i $TMP/v.mp4 -f lavfi -i anullsrc=r=48000:cl=stereo -map 0:v -map 1:a -c:v copy -c:a aac -b:a 128k -shortest -movflags +faststart "$OUT"
else
ffmpeg -loglevel error -y -i $TMP/v.mp4 -i "$MUSIC" -filter_complex "[1:a]atrim=0:$D,afade=t=in:d=0.5,afade=t=out:st=$FO:d=1.5,volume=0.9[a]" -map 0:v -map "[a]" -c:v copy -c:a aac -b:a 192k -shortest -movflags +faststart "$OUT"
fi
echo "$OUT ($D c)"
