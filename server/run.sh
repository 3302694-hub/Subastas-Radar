#!/usr/bin/env bash
# Запуск задач Subástica на своём сервере вместо GitHub Actions.
# ./run.sh update | history | fotos | fav | deploy
set -uo pipefail
APP=/opt/subastica
cd "$APP/repo"
set -a; . "$APP/.env"; set +a
PY="$APP/venv/bin/python"
LOG="$APP/logs/$1-$(date +%F).log"
exec >>"$LOG" 2>&1
echo "=== $(date -Is) $1"
lock() { exec 9>"/tmp/subastica-$1.lock"; flock -n 9 || { echo "уже идёт"; exit 0; }; }

# Код берём с GitHub (там только код; данные живут на сервере и коммитятся здесь же)
sync() {
  git remote get-url origin >/dev/null 2>&1 || return 0
  git -c rebase.autoStash=true pull -q --rebase origin main || { git rebase --abort 2>/dev/null; echo "обновить код с GitHub не удалось, работаем на прежнем"; }
}

commit() {
  git add -A "$@"
  git diff --cached --quiet || git commit -qm "$MSG $(date -u +'%Y-%m-%d %H:%M')"
}

deploy() {
  lock deploy
  rm -rf /tmp/subastica-site && cp -r site /tmp/subastica-site
  V=$(git rev-parse --short=8 HEAD)
  sed -i -E "s/\?v=[0-9A-Za-z]+/?v=$V/g" /tmp/subastica-site/index.html
  npx --yes wrangler@3 pages project list 2>/dev/null | grep -qw "$CF_PAGES_PROJECT" \
    || npx --yes wrangler@3 pages project create "$CF_PAGES_PROJECT" --production-branch main
  npx --yes wrangler@3 pages deploy /tmp/subastica-site --project-name "$CF_PAGES_PROJECT" --branch main --commit-dirty=true
}

case "$1" in
  update)  lock scrape; sync; "$PY" scraper/scrape.py --max-pages 80 --max-new 400; MSG="Обновление аукционов" commit site/data site/feed.xml; deploy ;;
  history) lock history; "$PY" scraper/history.py --months 12 --budget-min 100; MSG="Архив завершённых аукционов" commit site/data/historico ;;
  fotos)   lock fotos; "$PY" scraper/docs_fotos.py ;;
  fav)     lock fav; "$PY" scraper/docs_fav.py ;;
  deploy)  sync; deploy ;;
  *) echo "неизвестная задача $1"; exit 1 ;;
esac
echo "=== готово $(date -Is)"
