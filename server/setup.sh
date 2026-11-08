#!/usr/bin/env bash
# Первичная настройка сервера (Ubuntu 24.04). Запускать от root:  bash setup.sh /путь/к/subastica-backup.bundle
set -euo pipefail
BUNDLE="${1:?укажите путь к subastica-backup.bundle}"
APP=/opt/subastica
timedatectl set-timezone Europe/Madrid
apt-get update -q
apt-get install -yq git python3-venv python3-pip nodejs npm cron
mkdir -p "$APP/logs"
[ -d "$APP/repo" ] || git clone -q "$BUNDLE" "$APP/repo"
cd "$APP/repo"
git remote remove origin 2>/dev/null || true
git config user.name "subastica-bot"; git config user.email "bot@subastica.es"
python3 -m venv "$APP/venv"
"$APP/venv/bin/pip" install -q -r requirements.txt pymupdf pillow numpy
[ -f "$APP/.env" ] || { cp server/env.example "$APP/.env"; chmod 600 "$APP/.env"; echo ">>> Заполните $APP/.env и запустите setup.sh ещё раз"; exit 0; }
chmod +x server/run.sh
crontab server/crontab.txt
echo ">>> Готово. Проверка: $APP/repo/server/run.sh deploy && tail $APP/logs/deploy-*.log"
