-- Платный курс «Обучение» (curso): уроки, доступ по метке, оплата через Telegram-бота (Stars).
-- Применяется в Supabase миграцией «curso». Здесь — копия для истории.
--
-- Как работает доступ:
--   * Оплата в боте (Edge Function tg-curso) вызывает curso_pago_registrar(): пишет платёж в curso_pagos
--     и создаёт / открывает метку в curso_accesos (дата старта = момент оплаты).
--   * Владелец в admin.html → «Обучение» может выдать доступ по email, закрыть или открыть его,
--     сдвинуть дату старта, открыть все уроки сразу.
--   * Урок открыт, если метка активна, урок опубликован и (расписание выключено, или у метки
--     «все уроки сразу», или с даты старта прошло curso_lecciones.dia дней). Администраторы видят всё.

-- ---------- уроки: программа видна всем, текст — только тем, кому урок открыт
create table if not exists public.curso_lecciones (
  id text primary key,                    -- «3.2»
  modulo int not null,
  orden int not null,                     -- сквозной порядок
  dia int not null default 0,             -- через сколько дней после старта открывается
  titulo jsonb not null,                  -- {"es": …, "en": …, "ru": …}
  publicada boolean not null default false,
  updated_at timestamptz not null default now()
);

create table if not exists public.curso_contenido (
  leccion_id text not null references public.curso_lecciones(id) on delete cascade,
  lang text not null check (lang in ('es','en','ru')),
  cuerpo text not null default '',        -- упрощённый Markdown: ##, -, 1., **, [текст](url), > цитата
  updated_at timestamptz not null default now(),
  primary key (leccion_id, lang)
);

-- ---------- метка доступа: одна строка на пользователя
create table if not exists public.curso_accesos (
  user_id uuid primary key references auth.users(id) on delete cascade,
  etiqueta text not null default 'curso',
  estado text not null default 'activo' check (estado in ('activo','cerrado')),
  inicio timestamptz not null default now(),   -- дата старта обучения
  fin timestamptz,                              -- null — бессрочно
  todo_abierto boolean not null default false,  -- все уроки сразу, без расписания
  origen text not null default 'admin' check (origen in ('telegram','admin')),
  tg_user_id bigint,
  nota text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by text
);

create table if not exists public.curso_pagos (
  id bigint generated always as identity primary key,
  user_id uuid references auth.users(id) on delete set null,
  tg_user_id bigint,
  tg_username text,
  charge_id text not null unique,               -- telegram_payment_charge_id: защита от повторной записи
  provider_charge_id text,
  amount int not null,
  currency text not null,
  payload text,
  raw jsonb,
  reembolsado boolean not null default false,
  created_at timestamptz not null default now()
);

-- одноразовая ссылка «сайт → бот»: связывает аккаунт сайта с пользователем Telegram
create table if not exists public.curso_vinculos (
  token text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '2 days',
  tg_user_id bigint,
  used_at timestamptz
);
create index if not exists curso_vinculos_user on public.curso_vinculos(user_id);
create index if not exists curso_pagos_user on public.curso_pagos(user_id);

alter table public.curso_lecciones enable row level security;
alter table public.curso_contenido enable row level security;
alter table public.curso_accesos enable row level security;
alter table public.curso_pagos enable row level security;
alter table public.curso_vinculos enable row level security;

-- настройки курса (читаются сайтом; секретов здесь нет — токен бота в секретах Edge Function)
insert into public.settings(key, value) values
  ('curso_venta', 'false'),        -- продажа включена
  ('curso_precio_xtr', ''),        -- цена в Telegram Stars; пусто — продажа невозможна
  ('curso_goteo', 'true'),         -- уроки открываются по расписанию от даты старта
  ('curso_dias', ''),              -- срок доступа после оплаты в днях; пусто — бессрочно
  ('curso_bot', '')                -- имя бота без @ (заполняется при подключении из админки)
on conflict (key) do nothing;

-- ---------- проверки доступа
create or replace function public.curso_setting(p_key text) returns text
language sql stable security definer set search_path = public as $$
  select value from public.settings where key = p_key
$$;

create or replace function public.curso_acceso_activo(p_uid uuid default auth.uid()) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.curso_accesos a
    where a.user_id = p_uid and a.estado = 'activo' and a.inicio <= now() and (a.fin is null or a.fin > now()))
$$;

-- когда урок откроется для пользователя (null — нет доступа или урок не опубликован)
create or replace function public.curso_abre_en(p_leccion text, p_uid uuid default auth.uid()) returns timestamptz
language sql stable security definer set search_path = public as $$
  select case
    when l.publicada is not true then null
    when not public.curso_acceso_activo(p_uid) then null
    when coalesce(public.curso_setting('curso_goteo'), 'true') <> 'true' or a.todo_abierto then a.inicio
    else a.inicio + make_interval(days => l.dia)
  end
  from public.curso_lecciones l
  left join public.curso_accesos a on a.user_id = p_uid
  where l.id = p_leccion
$$;

create or replace function public.curso_leccion_abierta(p_leccion text) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_admin() or coalesce(public.curso_abre_en(p_leccion) <= now(), false)
$$;

drop policy if exists "curso_lecciones_read" on public.curso_lecciones;
create policy "curso_lecciones_read" on public.curso_lecciones for select to anon, authenticated using (true);
drop policy if exists "curso_contenido_read" on public.curso_contenido;
create policy "curso_contenido_read" on public.curso_contenido for select to authenticated
  using (public.curso_leccion_abierta(leccion_id));
drop policy if exists "curso_accesos_own" on public.curso_accesos;
create policy "curso_accesos_own" on public.curso_accesos for select to authenticated using (user_id = auth.uid());
-- curso_pagos и curso_vinculos: без политик — только через функции и service role

-- ---------- для пользователя сайта
create or replace function public.curso_estado() returns json
language plpgsql stable security definer set search_path = public as $$
declare uid uuid := auth.uid(); a public.curso_accesos; r json;
begin
  select * into a from public.curso_accesos where user_id = uid;
  select json_build_object(
    'logged', uid is not null,
    'admin', public.is_admin(),
    'activo', uid is not null and public.curso_acceso_activo(uid),
    'acceso', case when a.user_id is null then null else json_build_object(
      'estado', a.estado, 'inicio', a.inicio, 'fin', a.fin, 'etiqueta', a.etiqueta, 'todo_abierto', a.todo_abierto) end,
    'venta', public.curso_setting('curso_venta') = 'true' and coalesce(public.curso_setting('curso_precio_xtr'), '') ~ '^[1-9][0-9]*$'
             and coalesce(public.curso_setting('curso_bot'), '') <> '',
    'precio_xtr', nullif(public.curso_setting('curso_precio_xtr'), '')::int,
    'bot', nullif(public.curso_setting('curso_bot'), ''),
    'goteo', coalesce(public.curso_setting('curso_goteo'), 'true') = 'true',
    'lecciones', coalesce((select json_agg(json_build_object(
        'id', l.id, 'modulo', l.modulo, 'orden', l.orden, 'dia', l.dia, 'titulo', l.titulo, 'publicada', l.publicada,
        'abre_en', case when uid is null then null else public.curso_abre_en(l.id, uid) end,
        'abierta', uid is not null and public.curso_leccion_abierta(l.id)) order by l.orden)
      from public.curso_lecciones l), '[]'::json)
  ) into r;
  return r;
end $$;

-- ссылка на бота: https://t.me/<bot>?start=c_<token>
create or replace function public.curso_token() returns text
language plpgsql volatile security definer set search_path = public as $$
declare uid uuid := auth.uid(); t text;
begin
  if uid is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  select token into t from public.curso_vinculos
   where user_id = uid and used_at is null and expires_at > now() + interval '1 hour'
   order by created_at desc limit 1;
  if t is null then
    if (select count(*) from public.curso_vinculos where user_id = uid and created_at > now() - interval '1 day') >= 20 then
      raise exception 'too many' using errcode = '54000';
    end if;
    t := encode(extensions.gen_random_bytes(18), 'hex');
    insert into public.curso_vinculos(token, user_id) values (t, uid);
  end if;
  return t;
end $$;

-- ---------- только для бота (service role)
create or replace function public.curso_vinculo_usar(p_token text, p_tg_user bigint) returns json
language plpgsql volatile security definer set search_path = public as $$
declare v public.curso_vinculos; p public.profiles;
begin
  select * into v from public.curso_vinculos where token = p_token for update;
  if v.token is null or v.expires_at < now() then return json_build_object('ok', false, 'error', 'token'); end if;
  if v.tg_user_id is not null and v.tg_user_id <> p_tg_user then return json_build_object('ok', false, 'error', 'other_tg'); end if;
  update public.curso_vinculos set tg_user_id = p_tg_user, used_at = coalesce(used_at, now()) where token = p_token;
  select * into p from public.profiles where id = v.user_id;
  return json_build_object('ok', true, 'user_id', v.user_id, 'email', p.email,
    'activo', public.curso_acceso_activo(v.user_id));
end $$;

create or replace function public.curso_pago_registrar(
  p_token text, p_tg_user bigint, p_tg_username text, p_charge text, p_provider_charge text,
  p_amount int, p_currency text, p_payload text, p_raw jsonb) returns json
language plpgsql volatile security definer set search_path = public as $$
declare v public.curso_vinculos; a public.curso_accesos; dias int; nuevo boolean;
begin
  select * into v from public.curso_vinculos where token = p_token;
  if v.token is null or v.tg_user_id is distinct from p_tg_user then
    -- платёж пришёл, а связь не найдена: сохраняем, чтобы владелец выдал доступ вручную
    insert into public.curso_pagos(user_id, tg_user_id, tg_username, charge_id, provider_charge_id, amount, currency, payload, raw)
    values (null, p_tg_user, p_tg_username, p_charge, p_provider_charge, p_amount, p_currency, p_payload, p_raw)
    on conflict (charge_id) do nothing;
    return json_build_object('ok', false, 'error', 'token');
  end if;
  insert into public.curso_pagos(user_id, tg_user_id, tg_username, charge_id, provider_charge_id, amount, currency, payload, raw)
  values (v.user_id, p_tg_user, p_tg_username, p_charge, p_provider_charge, p_amount, p_currency, p_payload, p_raw)
  on conflict (charge_id) do nothing;
  if not found then return json_build_object('ok', true, 'repeat', true, 'user_id', v.user_id); end if;

  dias := nullif(public.curso_setting('curso_dias'), '')::int;
  select * into a from public.curso_accesos where user_id = v.user_id for update;
  nuevo := a.user_id is null or a.estado <> 'activo' or (a.fin is not null and a.fin <= now());
  insert into public.curso_accesos(user_id, etiqueta, estado, inicio, fin, origen, tg_user_id, updated_by)
  values (v.user_id, 'curso-' || to_char(now() at time zone 'Europe/Madrid', 'YYYY-MM'), 'activo', now(),
          case when dias is null then null else now() + make_interval(days => dias) end, 'telegram', p_tg_user, 'telegram')
  on conflict (user_id) do update set
    estado = 'activo',
    inicio = case when nuevo then now() else curso_accesos.inicio end,
    fin = case when dias is null then null
               when nuevo then now() + make_interval(days => dias)
               else greatest(curso_accesos.fin, now()) + make_interval(days => dias) end,
    etiqueta = case when nuevo then excluded.etiqueta else curso_accesos.etiqueta end,
    origen = 'telegram', tg_user_id = p_tg_user, updated_at = now(), updated_by = 'telegram';
  return json_build_object('ok', true, 'user_id', v.user_id, 'nuevo', nuevo);
end $$;

-- цена и доступность продажи для бота
create or replace function public.curso_bot_config() returns json
language sql stable security definer set search_path = public as $$
  select json_build_object(
    'venta', public.curso_setting('curso_venta') = 'true',
    'precio_xtr', case when coalesce(public.curso_setting('curso_precio_xtr'), '') ~ '^[1-9][0-9]*$'
                       then public.curso_setting('curso_precio_xtr')::int end)
$$;

create or replace function public.curso_set_bot(p_bot text) returns void
language sql volatile security definer set search_path = public as $$
  insert into public.settings(key, value) values ('curso_bot', p_bot)
  on conflict (key) do update set value = excluded.value
$$;

revoke all on function public.curso_vinculo_usar(text, bigint) from public, anon, authenticated;
revoke all on function public.curso_pago_registrar(text, bigint, text, text, text, int, text, text, jsonb) from public, anon, authenticated;
revoke all on function public.curso_bot_config() from public, anon, authenticated;
revoke all on function public.curso_set_bot(text) from public, anon, authenticated;
grant execute on function public.curso_vinculo_usar(text, bigint) to service_role;
grant execute on function public.curso_pago_registrar(text, bigint, text, text, text, int, text, text, jsonb) to service_role;
grant execute on function public.curso_bot_config() to service_role;
grant execute on function public.curso_set_bot(text) to service_role;
revoke all on function public.curso_token() from public, anon;
grant execute on function public.curso_token() to authenticated;

-- ---------- для владельца (admin.html)
create or replace function public.admin_curso_list(p_search text default '') returns json
language plpgsql stable security definer set search_path = public as $$
declare r json;
begin
  perform public._require_admin();
  p_search := lower(trim(coalesce(p_search, '')));
  select coalesce(json_agg(x order by x.updated_at desc), '[]'::json) into r from (
    select a.user_id, p.email, a.etiqueta, a.estado, a.inicio, a.fin, a.todo_abierto, a.origen, a.tg_user_id, a.nota,
           a.created_at, a.updated_at, a.updated_by,
           public.curso_acceso_activo(a.user_id) as activo,
           (select count(*) from public.curso_pagos g where g.user_id = a.user_id) as pagos,
           (select coalesce(sum(g.amount), 0) from public.curso_pagos g where g.user_id = a.user_id and not g.reembolsado) as total_xtr
    from public.curso_accesos a left join public.profiles p on p.id = a.user_id
    where p_search = '' or lower(coalesce(p.email, '')) like '%' || p_search || '%'
       or lower(a.etiqueta) like '%' || p_search || '%' or lower(coalesce(a.nota, '')) like '%' || p_search || '%'
  ) x;
  return r;
end $$;

-- создать или изменить метку по email. Пустые параметры не меняют поле.
create or replace function public.admin_curso_set(
  p_email text, p_estado text default null, p_inicio timestamptz default null, p_fin timestamptz default null,
  p_clear_fin boolean default false, p_todo boolean default null, p_etiqueta text default null, p_nota text default null)
returns json language plpgsql volatile security definer set search_path = public as $$
declare uid uuid; who text := auth.jwt() ->> 'email'; a public.curso_accesos;
begin
  perform public._require_admin();
  select id into uid from public.profiles where email_norm = public.normalize_email(p_email) limit 1;
  if uid is null then raise exception 'Пользователь с таким email не найден: он должен зарегистрироваться на сайте' using errcode = 'P0002'; end if;
  if p_estado is not null and p_estado not in ('activo','cerrado') then raise exception 'bad estado'; end if;
  insert into public.curso_accesos(user_id, etiqueta, estado, inicio, fin, todo_abierto, origen, nota, updated_by)
  values (uid, coalesce(nullif(trim(p_etiqueta), ''), 'curso-manual'), coalesce(p_estado, 'activo'), coalesce(p_inicio, now()),
          case when p_clear_fin then null else p_fin end, coalesce(p_todo, false), 'admin', p_nota, who)
  on conflict (user_id) do update set
    estado = coalesce(p_estado, curso_accesos.estado),
    inicio = coalesce(p_inicio, curso_accesos.inicio),
    fin = case when p_clear_fin then null else coalesce(p_fin, curso_accesos.fin) end,
    todo_abierto = coalesce(p_todo, curso_accesos.todo_abierto),
    etiqueta = coalesce(nullif(trim(p_etiqueta), ''), curso_accesos.etiqueta),
    nota = coalesce(p_nota, curso_accesos.nota),
    updated_at = now(), updated_by = who
  returning * into a;
  return row_to_json(a);
end $$;

create or replace function public.admin_curso_pagos(p_limit int default 200) returns json
language plpgsql stable security definer set search_path = public as $$
declare r json;
begin
  perform public._require_admin();
  select coalesce(json_agg(x), '[]'::json) into r from (
    select g.id, g.created_at, g.user_id, p.email, g.tg_user_id, g.tg_username, g.amount, g.currency, g.charge_id, g.reembolsado
    from public.curso_pagos g left join public.profiles p on p.id = g.user_id
    order by g.created_at desc limit least(greatest(p_limit, 1), 1000)) x;
  return r;
end $$;

-- привязать платёж без связи к пользователю сайта (если оплатили не по ссылке с сайта)
create or replace function public.admin_curso_pago_asignar(p_id bigint, p_email text) returns json
language plpgsql volatile security definer set search_path = public as $$
declare uid uuid; g public.curso_pagos;
begin
  perform public._require_admin();
  select id into uid from public.profiles where email_norm = public.normalize_email(p_email) limit 1;
  if uid is null then raise exception 'Пользователь с таким email не найден' using errcode = 'P0002'; end if;
  update public.curso_pagos set user_id = uid where id = p_id returning * into g;
  if g.id is null then raise exception 'Нет платежа %', p_id; end if;
  return public.admin_curso_set(p_email, 'activo', null, null, false, null, null, 'оплата #' || p_id || ' привязана вручную');
end $$;

create or replace function public.admin_curso_config(
  p_venta boolean default null, p_precio_xtr int default null, p_goteo boolean default null, p_dias int default null, p_clear_dias boolean default false)
returns json language plpgsql volatile security definer set search_path = public as $$
begin
  perform public._require_admin();
  if p_precio_xtr is not null and (p_precio_xtr < 1 or p_precio_xtr > 100000) then raise exception 'Цена в Stars: от 1 до 100000'; end if;
  if p_dias is not null and p_dias < 1 then raise exception 'Срок доступа: от 1 дня'; end if;
  if p_venta is not null then insert into settings values ('curso_venta', p_venta::text) on conflict (key) do update set value = excluded.value; end if;
  if p_precio_xtr is not null then insert into settings values ('curso_precio_xtr', p_precio_xtr::text) on conflict (key) do update set value = excluded.value; end if;
  if p_goteo is not null then insert into settings values ('curso_goteo', p_goteo::text) on conflict (key) do update set value = excluded.value; end if;
  if p_clear_dias then update settings set value = '' where key = 'curso_dias';
  elsif p_dias is not null then insert into settings values ('curso_dias', p_dias::text) on conflict (key) do update set value = excluded.value; end if;
  return (select json_object_agg(key, value) from settings where key like 'curso\_%');
end $$;

create or replace function public.admin_curso_leccion(p_id text) returns json
language plpgsql stable security definer set search_path = public as $$
declare r json;
begin
  perform public._require_admin();
  select json_build_object('leccion', row_to_json(l),
    'cuerpo', coalesce((select json_object_agg(c.lang, c.cuerpo) from curso_contenido c where c.leccion_id = l.id), '{}'::json))
  into r from curso_lecciones l where l.id = p_id;
  return r;
end $$;

create or replace function public.admin_curso_leccion_save(
  p_id text, p_publicada boolean default null, p_dia int default null, p_titulo jsonb default null,
  p_es text default null, p_en text default null, p_ru text default null) returns void
language plpgsql volatile security definer set search_path = public as $$
begin
  perform public._require_admin();
  update curso_lecciones set publicada = coalesce(p_publicada, publicada), dia = coalesce(p_dia, dia),
    titulo = coalesce(p_titulo, titulo), updated_at = now() where id = p_id;
  if not found then raise exception 'Нет урока %', p_id; end if;
  if p_es is not null then insert into curso_contenido values (p_id, 'es', p_es, now()) on conflict (leccion_id, lang) do update set cuerpo = excluded.cuerpo, updated_at = now(); end if;
  if p_en is not null then insert into curso_contenido values (p_id, 'en', p_en, now()) on conflict (leccion_id, lang) do update set cuerpo = excluded.cuerpo, updated_at = now(); end if;
  if p_ru is not null then insert into curso_contenido values (p_id, 'ru', p_ru, now()) on conflict (leccion_id, lang) do update set cuerpo = excluded.cuerpo, updated_at = now(); end if;
end $$;

-- ---------- программа: 6 модулей, 34 урока; день открытия — вторник/четверг от даты старта
insert into public.curso_lecciones(id, modulo, orden, dia, titulo) values
 ('0.1',0, 0, 0,'{"es":"Cómo funciona el curso","en":"How the course works","ru":"Как устроен курс"}'),
 ('1.1',1, 1, 0,'{"es":"Por qué en España se venden viviendas en subasta","en":"Why homes in Spain are sold at auction","ru":"Почему в Испании жильё продаётся с торгов"}'),
 ('1.2',1, 2, 2,'{"es":"Quién vende: juzgado, Hacienda, Seguridad Social, notario","en":"Who sells: courts, Tax Agency, Social Security, notaries","ru":"Кто продаёт: суд, налоговая, Seguridad Social, нотариус"}'),
 ('1.3',1, 3, 7,'{"es":"Vocabulario de la subasta en 5 minutos","en":"Auction vocabulary in 5 minutes","ru":"Словарь аукциона за 5 минут"}'),
 ('1.4',1, 4, 9,'{"es":"Lo que una subasta no es","en":"What an auction is not","ru":"Чем аукцион не является"}'),
 ('2.1',2, 5,14,'{"es":"NIE: sin él no puedes pujar","en":"NIE: you can''t bid without it","ru":"NIE: без него ставку не поставить"}'),
 ('2.2',2, 6,16,'{"es":"Entrar en el Portal: certificado digital o Cl@ve","en":"Signing in to the portal: digital certificate or Cl@ve","ru":"Вход на портал: цифровой сертификат или Cl@ve"}'),
 ('2.3',2, 7,21,'{"es":"Cuenta y dinero: cómo se constituye el depósito","en":"Account and money: how the deposit is paid","ru":"Счёт и деньги: как вносится депозит"}'),
 ('2.4',2, 8,23,'{"es":"Pujar desde el extranjero o con un representante","en":"Bidding from abroad or through a representative","ru":"Участие из-за границы и через представителя"}'),
 ('3.1',3, 9,28,'{"es":"La ficha del lote en el Portal","en":"The lot page on the portal","ru":"Карточка лота на портале"}'),
 ('3.2',3,10,30,'{"es":"El 70 % y el 50 % no son un descuento","en":"70% and 50% are not a discount","ru":"70 % и 50 % — это не скидка"}'),
 ('3.3',3,11,35,'{"es":"El Catastro en 3 minutos","en":"The Cadastre in 3 minutes","ru":"Катастро за 3 минуты"}'),
 ('3.4',3,12,37,'{"es":"Nota simple: qué buscar","en":"Nota simple: what to look for","ru":"Nota simple: что в ней искать"}'),
 ('3.5',3,13,42,'{"es":"Qué cargas se quedan contigo","en":"Which charges stay with you","ru":"Какие обременения останутся с вами"}'),
 ('3.6',3,14,44,'{"es":"Quién vive en la vivienda y qué hacer","en":"Who lives in the property and what to do","ru":"Кто живёт в квартире и что с этим делать"}'),
 ('3.7',3,15,49,'{"es":"Comunidad e IBI: deudas ajenas que llegan a ti","en":"Community fees and IBI: other people''s debts that reach you","ru":"Община и IBI: чужие долги, которые придут к вам"}'),
 ('4.1',4,16,51,'{"es":"La subasta judicial tras la reforma de 2025","en":"Court auctions after the 2025 reform","ru":"Судебные торги после реформы 2025"}'),
 ('4.2',4,17,56,'{"es":"Subasta hipotecaria: umbrales del 70, 60, 50 y 40 %","en":"Mortgage auctions: the 70, 60, 50 and 40% thresholds","ru":"Ипотечный аукцион: пороги 70 / 60 / 50 / 40 %"}'),
 ('4.3',4,18,58,'{"es":"El banco ejecutante también puja","en":"The enforcing bank bids too","ru":"Банк-взыскатель тоже ставит"}'),
 ('4.4',4,19,63,'{"es":"Subasta sin pujas: qué pasa después","en":"No bids: what happens next","ru":"Аукцион без ставок: что дальше"}'),
 ('4.5',4,20,65,'{"es":"Subastas de la Agencia Tributaria","en":"Tax Agency (AEAT) auctions","ru":"Торги налоговой (AEAT)"}'),
 ('4.6',4,21,70,'{"es":"Subastas de la Seguridad Social","en":"Social Security auctions","ru":"Торги Seguridad Social"}'),
 ('4.7',4,22,72,'{"es":"Subastas notariales y otras","en":"Notarial and other auctions","ru":"Нотариальные и другие торги"}'),
 ('5.1',5,23,77,'{"es":"El depósito: cuánto, cuándo y cuándo vuelve","en":"The deposit: how much, when, and when it comes back","ru":"Депозит: сколько, когда и когда вернут"}'),
 ('5.2',5,24,79,'{"es":"ITP o IVA: qué impuesto paga el comprador","en":"ITP or VAT: which tax the buyer pays","ru":"ITP или IVA: какой налог платит покупатель"}'),
 ('5.3',5,25,84,'{"es":"Inscripción sin notario","en":"Registration without a notary","ru":"Регистрация без нотариуса"}'),
 ('5.4',5,26,86,'{"es":"Gastos que se olvidan","en":"Costs people forget","ru":"Расходы, о которых забывают"}'),
 ('5.5',5,27,91,'{"es":"Calcula tu precio máximo antes de pujar","en":"Work out your maximum price before bidding","ru":"Считаем цену потолка до ставки"}'),
 ('6.1',6,28,93,'{"es":"Lista de control para la última semana","en":"Checklist for the final week","ru":"Чек-лист за неделю до конца торгов"}'),
 ('6.2',6,29,98,'{"es":"Cómo pujar en el Portal, paso a paso","en":"How to bid on the portal, step by step","ru":"Как поставить ставку на портале"}'),
 ('6.3',6,30,100,'{"es":"Reserva de postura","en":"Bid reservation (reserva de postura)","ru":"Резерв ставки (reserva de postura)"}'),
 ('6.4',6,31,105,'{"es":"Has ganado: plazos y documentos","en":"You won: deadlines and documents","ru":"Вы выиграли: сроки и документы"}'),
 ('6.5',6,32,107,'{"es":"No ganaste o no pudiste pagar","en":"You didn''t win or couldn''t pay","ru":"Вы не выиграли или не смогли заплатить"}'),
 ('6.6',6,33,112,'{"es":"Un lote de principio a fin + test final","en":"One lot from start to finish + final test","ru":"Разбор одного лота от начала до конца + итоговый тест"}')
on conflict (id) do nothing;
