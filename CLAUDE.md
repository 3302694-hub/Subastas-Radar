# Subástica — CLAUDE.md

Контекст проекта для Claude. Читать в начале каждой сессии.

---

## Проект

**Subástica** (subastica.es) — агрегатор судебных аукционов Испании.
Репозиторий: `subastas-radar` (GitHub).

---

## Источники данных — что уже подключено

Всё что проводится **электронно через BOE** — уже у нас. Отдельные скраперы для этих источников не нужны.

| origen | Источник | Описание |
|--------|----------|----------|
| `judicial` | BOE / суды | Судебные аукционы (`SUB-JA-`) — основной поток |
| `hacienda` | BOE / AEAT + регионы | Налоговые (`SUB-AT-`); ATC Cataluña по решению суда 2022 тоже обязана через BOE |
| `seguridad_social` | BOE / TGSS | Соцстрах (`SUB-SS-`) |
| `notarial` | BOE / нотариус | Нотариальные аукционы |
| `administracion` | BOE / прочее | Административные |

**Регионы, чьи налоговые органы обязаны использовать BOE** (уже в наших данных):
Cataluña (ATC), Madrid, Murcia (ATRM), La Rioja — их аукционы идут как `hacienda` или `judicial`.

---

## Источники данных — ЧТО НЕ ПОДКЛЮЧЕНО (приоритет добавления)

### 🔴 Приоритет 1 — Patrimonio del Estado (Ministerio de Hacienda)
**Почему важно**: квартиры, дома, земли, наследственное имущество (abintestatos) по всей Испании. Десятки лотов в месяц, реальная недвижимость.
**Почему нет**: анонс публикуется в BOE как **PDF-объявление** в разделе «Otros anuncios» (секция V-B), без ID типа `SUB-`. Наш скрапер их не захватывает.
**Портал**: `hacienda.gob.es → Patrimonio del Estado → Subastas`
**Как добавить**: парсить BOE секцию V-B по ключевым словам «Patrimonio del Estado», «enajenación», «inmueble» — или скрапить сам портал hacienda.gob.es.

### 🟠 Приоритет 2 — Plataforma de Contratación del Sector Público (ACSP)
**Почему важно**: продажи публичного имущества от всех госорганов, регионов и муниципалитетов. Искать: `enajenación inmueble`, `subasta`, `compraventa bienes`.
**URL**: `contrataciondelestado.es`
**Пересечение с BOE**: частичное — крупные лоты дублируются, мелкие — нет.

### 🟡 Приоритет 3 — Автономии с самостоятельными порталами
Не используют BOE, поток редкий (имущество самих регионов, офлайн-участие):

| Автономия | Портал | Тип | Примечание |
|-----------|--------|-----|------------|
| **Andalucía** | `juntadeandalucia.es/.../patrimonio/subastas-concursos/` | 2–3 пакета в год | Полная документация (nota simple, catastro) |
| **Andalucía AVRA** | `juntadeandalucia.es/avra/` | Соцжильё, ежемесячно | Земля под застройку |
| **País Vasco** | `contratacion.euskadi.eus` | Самостоятельные торги | Diputaciones Forales + municipios |
| **Navarra** | Portal Contratación Navarra | Самостоятельные | Местные органы, активны в 2026 |
| **Aragón** | Gobierno Aragón — Subastas | — | — |
| **Galicia** | IGVS + Xunta | Локали и паркинги | — |
| **Asturias** | Principado — Subastas | Отдельные лоты | — |
| **Illes Balears** | Govern + BOIB | — | — |
| **Canarias** | Gobierno Canarias — Patrimonio | — | — |
| **Cantabria** | BOC + Patrimonio GVA | — | — |
| **Castilla y León** | BOCyL + Patrimonio JCyL | — | — |
| **Castilla-La Mancha** | Portal Contratación CLM | — | — |
| **Extremadura** | DOE | — | — |

### ⚪ Приоритет 4 — Специализированные гос. компании
| Источник | Тип | Примечание |
|----------|-----|------------|
| **ADIF** | Жд имущество, земля | Вероятно через BOE/ACSP |
| **INVIED** (Минобороны) | Недвижимость Минобороны | — |
| **SEPES** | Гос. земля под застройку | Собственный портал |

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
