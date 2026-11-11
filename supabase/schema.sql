-- =====================================================================
--  Subástica — база данных Supabase
--  Выполните ОДИН раз: Supabase → SQL Editor → New query → вставить → Run
-- =====================================================================

-- ---------- Настройки (срок бесплатного периода для НОВЫХ пользователей)
create table if not exists public.settings (
  key   text primary key,
  value text not null
);
insert into public.settings (key, value) values ('default_trial_until', '2027-12-31')
on conflict (key) do nothing;

-- ---------- Доверенные адреса: полный доступ без ограничения срока
create table if not exists public.trusted_emails (
  email      text primary key,
  note       text,
  created_at timestamptz default now()
);

-- ---------- Одноразовые почтовые сервисы: такие адреса бесплатный период не получают
create table if not exists public.disposable_domains (domain text primary key);
insert into public.disposable_domains (domain) values
 ('10minutemail.com'),('10minutemail.net'),('20minutemail.com'),('33mail.com'),('anonaddy.me'),
 ('burnermail.io'),('byom.de'),('crazymailing.com'),('discard.email'),('dispostable.com'),
 ('dropmail.me'),('emailondeck.com'),('fakeinbox.com'),('fakemail.net'),('getairmail.com'),
 ('getnada.com'),('guerrillamail.biz'),('guerrillamail.com'),('guerrillamail.de'),('guerrillamail.info'),
 ('guerrillamail.net'),('guerrillamail.org'),('guerrillamailblock.com'),('harakirimail.com'),
 ('inboxbear.com'),('inboxkitten.com'),('jetable.org'),('mailcatch.com'),('maildrop.cc'),
 ('mailinator.com'),('mailinator.net'),('mailnesia.com'),('mailpoof.com'),('mailsac.com'),
 ('mailtemp.info'),('mintemail.com'),('moakt.com'),('mohmal.com'),('mytemp.email'),('nada.email'),
 ('sharklasers.com'),('spam4.me'),('spambox.us'),('spamgourmet.com'),('temp-mail.io'),
 ('temp-mail.org'),('tempail.com'),('tempinbox.com'),('tempmail.com'),('tempmail.dev'),
 ('tempmail.net'),('tempmail.plus'),('tempmailo.com'),('tempr.email'),('throwawaymail.com'),
 ('tmail.ws'),('tmpmail.net'),('tmpmail.org'),('trashmail.com'),('trashmail.de'),('trashmail.net'),
 ('yopmail.com'),('yopmail.fr'),('yopmail.net'),('cool.fr.nf'),('jetable.fr.nf'),('mail-temp.com'),
 ('emailfake.com'),('generator.email'),('linshiyouxiang.net'),('minuteinbox.com'),('owlymail.com'),
 ('rootfest.net'),('tempmailaddress.com'),('fexpost.com'),('fexbox.org'),('mailbox.in.ua'),
 ('rover.info'),('inpwa.com'),('vomoto.com'),('wuuvo.com'),('zetmail.com'),('emltmp.com'),('mailto.plus')
on conflict do nothing;

-- ---------- Профили пользователей
create table if not exists public.profiles (
  id                  uuid primary key references auth.users on delete cascade,
  email               text,
  email_norm          text,             -- адрес после «склейки» (gmail без точек и +меток)
  provider            text,             -- email | google | apple
  access_until        date,             -- ДО КАКОГО ДНЯ ВКЛЮЧИТЕЛЬНО открыт доступ (меняйте вручную)
  trial_granted       boolean default false,
  trial_denied_reason text,             -- disposable_email | duplicate_email | duplicate_device
  duplicate_of        uuid,             -- с каким аккаунтом совпал
  device_checked      boolean default false,
  note                text,             -- ваша заметка
  view_mode           text default 'novato',                       -- novato | inversor | pro
  allowed_modes       text[] default array['novato','inversor','pro'],  -- какие режимы доступны (тариф)
  created_at          timestamptz default now(),
  last_seen           timestamptz
);
-- для баз, созданных предыдущей версией схемы
alter table public.profiles add column if not exists view_mode text default 'novato';
alter table public.profiles add column if not exists allowed_modes text[] default array['novato','inversor','pro'];
create index if not exists profiles_email_norm_idx on public.profiles (email_norm);

-- ---------- Устройства (для поиска повторных регистраций)
create table if not exists public.devices (
  id          bigserial primary key,
  user_id     uuid references auth.users on delete cascade,
  local_id    text,      -- случайный ID, сохранённый в браузере
  fingerprint text,      -- хеш характеристик браузера/устройства
  ip          text,
  user_agent  text,
  created_at  timestamptz default now(),
  unique (user_id, local_id, fingerprint)
);
create index if not exists devices_local_idx on public.devices (local_id);
create index if not exists devices_fp_idx on public.devices (fingerprint, ip);

-- ---------- Аукционы (заполняет сборщик)
create table if not exists public.subastas (
  id         text primary key,
  data       jsonb not null,
  estado     text,
  detectada  timestamptz,
  fecha_fin  timestamptz,
  teaser     boolean default false,   -- входит в 10 бесплатных свежих аукционов
  updated_at timestamptz default now()
);
create index if not exists subastas_estado_idx on public.subastas (estado);
create index if not exists subastas_detectada_idx on public.subastas (detectada desc);

-- =====================================================================
--  Функции
-- =====================================================================

-- «Склейка» адресов: Ivan.Petrov+promo@gmail.com → ivanpetrov@gmail.com
create or replace function public.normalize_email(e text)
returns text language plpgsql immutable as $$
declare l text; d text;
begin
  e := lower(trim(coalesce(e, '')));
  l := split_part(e, '@', 1);
  d := split_part(e, '@', 2);
  l := split_part(l, '+', 1);
  if d in ('gmail.com', 'googlemail.com') then
    l := replace(l, '.', '');
    d := 'gmail.com';
  end if;
  return l || '@' || d;
end $$;

-- Новый пользователь → профиль с бесплатным периодом (если не найден дубль)
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  n text := public.normalize_email(new.email);
  dom text := split_part(n, '@', 2);
  until date;
  dup uuid;
  reason text;
  trusted boolean;
begin
  select value::date into until from public.settings where key = 'default_trial_until';
  select exists (select 1 from public.trusted_emails t where public.normalize_email(t.email) = n) into trusted;
  select p.id into dup from public.profiles p where p.email_norm = n and p.id <> new.id limit 1;

  if not trusted then
    if exists (select 1 from public.disposable_domains where domain = dom) then
      reason := 'disposable_email';
    elsif dup is not null then
      reason := 'duplicate_email';
    end if;
  end if;

  insert into public.profiles (id, email, email_norm, provider, access_until, trial_granted, trial_denied_reason, duplicate_of)
  values (new.id, new.email, n, coalesce(new.raw_app_meta_data ->> 'provider', 'email'),
          case when reason is null then until end, reason is null, reason, dup)
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Текущий пользователь в списке доверенных?
create or replace function public.is_trusted()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(auth.jwt() ->> 'email', '') <> '' and exists (
    select 1 from public.trusted_emails t
    where public.normalize_email(t.email) = public.normalize_email(auth.jwt() ->> 'email'));
$$;

-- Есть ли у текущего пользователя полный доступ
create or replace function public.has_access()
returns boolean language sql stable security definer set search_path = public as $$
  select auth.uid() is not null and (
    public.is_trusted()
    or exists (select 1 from public.profiles p
               where p.id = auth.uid() and p.access_until is not null and p.access_until >= current_date));
$$;

-- Сайт вызывает после входа: запоминает устройство, проверяет дубли, возвращает статус
create or replace function public.register_device(p_local_id text, p_fingerprint text)
returns json language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  hdrs json := coalesce(nullif(current_setting('request.headers', true), ''), '{}')::json;
  v_ip text := trim(split_part(coalesce(hdrs ->> 'x-forwarded-for', ''), ',', 1));
  prof public.profiles;
  other uuid;
begin
  if uid is null then raise exception 'not authenticated'; end if;
  p_local_id := left(coalesce(p_local_id, ''), 100);
  p_fingerprint := left(coalesce(p_fingerprint, ''), 100);

  insert into public.devices (user_id, local_id, fingerprint, ip, user_agent)
  values (uid, p_local_id, p_fingerprint, v_ip, left(hdrs ->> 'user-agent', 300))
  on conflict (user_id, local_id, fingerprint) do nothing;

  select * into prof from public.profiles where id = uid;
  if not found then  -- на случай, если профиль не создался
    insert into public.profiles (id, email, email_norm, provider)
    values (uid, auth.jwt() ->> 'email', public.normalize_email(auth.jwt() ->> 'email'), 'email');
    select * into prof from public.profiles where id = uid;
  end if;

  -- Проверяем устройство один раз — при первом входе нового аккаунта
  if not prof.device_checked then
    if prof.trial_granted and not public.is_trusted() then
      select d.user_id into other
      from public.devices d
      join public.profiles p on p.id = d.user_id
      where d.user_id <> uid
        and p.trial_granted
        and p.created_at < prof.created_at
        and ((p_local_id <> '' and d.local_id = p_local_id)
             or (p_fingerprint <> '' and v_ip <> '' and d.fingerprint = p_fingerprint and d.ip = v_ip))
      limit 1;
      if other is not null then
        update public.profiles
           set access_until = null, trial_granted = false,
               trial_denied_reason = 'duplicate_device', duplicate_of = other
         where id = uid;
      end if;
    end if;
    update public.profiles set device_checked = true where id = uid;
  end if;

  update public.profiles set last_seen = now() where id = uid;
  select * into prof from public.profiles where id = uid;
  return json_build_object(
    'email', prof.email,
    'access_until', prof.access_until,
    'trusted', public.is_trusted(),
    'has_access', public.has_access(),
    'reason', prof.trial_denied_reason,
    'view_mode', prof.view_mode,
    'allowed_modes', prof.allowed_modes);
end $$;

-- Пользователь выбирает режим отображения (только из разрешённых ему)
create or replace function public.set_view_mode(p_mode text)
returns json language plpgsql security definer set search_path = public as $$
declare prof public.profiles;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if p_mode not in ('novato', 'inversor', 'pro') then raise exception 'unknown mode %', p_mode; end if;
  select * into prof from public.profiles where id = auth.uid();
  if not (public.is_trusted() or p_mode = any (coalesce(prof.allowed_modes, array['novato']))) then
    raise exception 'mode % not allowed', p_mode using errcode = '42501';
  end if;
  update public.profiles set view_mode = p_mode where id = auth.uid();
  return json_build_object('view_mode', p_mode);
end $$;
grant execute on function public.set_view_mode(text) to authenticated;

grant execute on function public.register_device(text, text) to authenticated;
grant execute on function public.has_access() to anon, authenticated;
grant execute on function public.is_trusted() to anon, authenticated;

-- =====================================================================
--  Права доступа (Row Level Security)
-- =====================================================================
alter table public.settings           enable row level security;
alter table public.trusted_emails     enable row level security;
alter table public.disposable_domains enable row level security;
alter table public.profiles           enable row level security;
alter table public.devices            enable row level security;
alter table public.subastas           enable row level security;

drop policy if exists "settings_public_read" on public.settings;
create policy "settings_public_read" on public.settings for select using (true);

drop policy if exists "profiles_own_read" on public.profiles;
create policy "profiles_own_read" on public.profiles for select to authenticated using (id = auth.uid());
-- изменять профили (в т.ч. срок доступа) может только администратор через панель Supabase

-- Аукционы: 10 свежих текущих и все завершённые видят все; остальное — только с доступом
drop policy if exists "subastas_read" on public.subastas;
create policy "subastas_read" on public.subastas for select to anon, authenticated
using (
  teaser
  or estado in ('finalizada', 'cancelada', 'suspendida')
  or (select public.has_access())
);

-- =====================================================================
--  Удобные представления для администратора (видны только в панели)
-- =====================================================================
create or replace view public.admin_users with (security_invoker = true) as
select p.email, p.provider, p.access_until, p.view_mode, p.allowed_modes, p.trial_granted, p.trial_denied_reason,
       d.email as duplicate_of_email, p.created_at, p.last_seen, p.note, p.id
from public.profiles p
left join public.profiles d on d.id = p.duplicate_of
order by p.created_at desc;
revoke all on public.admin_users from anon, authenticated;
