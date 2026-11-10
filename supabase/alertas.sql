-- Почтовые оповещения о новых аукционах (подписка при регистрации и из раздела «Уведомления»)
create table if not exists public.alertas (
  id bigserial primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  email text,
  provincia text,            -- ключ провинции как на сайте (normProvince), null = вся Испания
  categoria text,            -- группа: vivienda | g_garaje | g_local | g_terreno | oculta; null = всё
  max_valor numeric,         -- null = без лимита
  idioma text not null default 'es' check (idioma in ('es','en','ru')),
  activa boolean not null default true,
  token uuid not null default gen_random_uuid() unique,
  last_sent timestamptz not null default now(),
  enviados int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists alertas_user_idx on public.alertas(user_id);
alter table public.alertas enable row level security;

create policy alertas_own_select on public.alertas for select to authenticated using (user_id = (select auth.uid()));
create policy alertas_own_insert on public.alertas for insert to authenticated with check (user_id = (select auth.uid()));
create policy alertas_own_update on public.alertas for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy alertas_own_delete on public.alertas for delete to authenticated using (user_id = (select auth.uid()));

-- email берём из аккаунта, а не от клиента; служебные поля клиент менять не может; не больше 5 алертов
create or replace function public.alertas_before() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    if (select count(*) from alertas where user_id = new.user_id) >= 5 then
      raise exception 'too_many_alerts';
    end if;
    new.email := (select email from auth.users where id = new.user_id);
    new.token := gen_random_uuid();
    new.last_sent := now();
    new.enviados := 0;
    new.created_at := now();
  else
    if coalesce(auth.role(), '') <> 'service_role' then
      new.email := old.email; new.token := old.token; new.last_sent := old.last_sent;
      new.enviados := old.enviados; new.created_at := old.created_at; new.user_id := old.user_id;
    end if;
  end if;
  return new;
end $$;
create trigger alertas_before before insert or update on public.alertas
for each row execute function public.alertas_before();
