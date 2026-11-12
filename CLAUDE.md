# Subástica — CLAUDE.md

Контекст проекта для Claude. Читать в начале каждой сессии.

---

## Проект

**Subástica** (subastica.es) — агрегатор судебных аукционов Испании.
Репозиторий: `subastas-radar` (GitHub).

---

## Источники данных — что уже подключено

Все данные идут через **BOE** (`subastas.boe.es`). Отдельный скрапер для AEAT и других не нужен.

| origen | Источник | Описание |
|--------|----------|----------|
| `judicial` | BOE / суды | Судебные аукционы (`SUB-JA-`) — основной поток |
| `hacienda` | BOE / AEAT | Налоговые аукционы Агентства по налогам (`SUB-AT-`) |
| `notarial` | BOE / нотариус | Нотариальные аукционы |
| `administracion` | BOE / прочее | Административные |

**Вывод**: AEAT (`subastas.hacienda.gob.es`) уже собирается через BOE как `origen: "hacienda"`. Дополнительный скрапер AEAT не нужен.

---

## Региональные порталы — статус

Региональные порталы — **отдельные сайты вне BOE**, редкий поток (имущество самих регионов, не судебные). Низкий приоритет.

| Регион | Портал | Тип | Приоритет |
|--------|--------|-----|-----------|
| Andalucía | `juntadeandalucia.es/.../patrimonio/subastas-concursos/` | Офлайн, 2–3 раза в год | Низкий |
| Andalucía — жильё | `juntadeandalucia.es/avra/` (AVRA) | Соцжильё, ежемесячно | Низкий |
| Catalunya | `gencat.cat/subastes` | — | Низкий |
| Madrid | `comunidad.madrid/subastas` | — | Низкий |
| Valencia | `gva.es/subhastes` | — | Низкий |
| País Vasco | `ogasun.ejgv.euskadi.eus` | — | Низкий |
| Galicia | `xunta.gal/subhastas` | — | Низкий |

---

## Поле `autoridad` — важное

`s.autoridad` — название суда/органа, управляющего аукционом. **Может быть в другом городе**, чем объект.
Пример: SUB-JA-2026-264027 — объект в Villa del Prado (Madrid), суд в Torrevieja.

**`autoridad` исключён из поля `_text`** (поиска по тексту) — коммит `0c7b006`.

---

## Архитектура

- **Frontend**: `site/assets/app.js` — SPA, данные из JSON-файлов
- **Данные**: `site/data/historico/YYYY-MM.json` — помесячные файлы
- **Backend**: `server/` — cron-скрипты сбора данных
- **Supabase**: хранение документов (`subasta_docs`), тикеты (`docs_tickets`)
- **Edge Function**: `docs-ingest` — приём фото из Chrome (v4, с CORS)
- **Хостинг**: Cloudflare

---

## Безопасность (обязательные правила)

- Ключ `service_role` Supabase и секреты (Google client secret, RESEND_API_KEY, токен Cloudflare) — только в `.env` на сервере и в панели Supabase. Не в чат, не в файлы сайта.
- Не читать токены сессий и cookies из браузера; для загрузок — только одноразовые билеты.
- Никогда не вводить пароли, Cl@ve или сертификаты на портале BOE.
- Не воспроизводить тексты конкурентов.
- Публиковать в Instagram только после явного «да».
- Изменения схемы рабочей базы — только с явного разрешения пользователя.
- Не делать `git push --force`; на GitHub не возвращать запуски по расписанию.
- Ключ Maps — браузерный и публичный, ограничен сайтами.

---

## Pending задачи

- [ ] Загрузка фото через Chrome: BOE CSP блокирует `fetch()` к внешним доменам со страниц BOE. Завтра проверить — возможно, истекла сессия BOE (ранее сегодня работало).
- [ ] Crontab на сервере: обновить до `*/10` командой `sudo crontab /opt/subastica/repo/server/crontab.txt`
- [ ] Данные владельца для Aviso legal
- [ ] Данные INE и CGPJ
- [ ] Решение: сделать GitHub репо приватным
- [ ] Отложено: Stripe, idealista key, Telegram
