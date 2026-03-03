create extension if not exists pgcrypto;

create table if not exists public.fin_usuarios (
  id uuid primary key default gen_random_uuid(),
  usuario text not null unique,
  password_hash text not null,
  activo boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.fin_usuarios enable row level security;

drop policy if exists "deny_all_select_fin_usuarios" on public.fin_usuarios;
drop policy if exists "deny_all_insert_fin_usuarios" on public.fin_usuarios;
drop policy if exists "deny_all_update_fin_usuarios" on public.fin_usuarios;
drop policy if exists "deny_all_delete_fin_usuarios" on public.fin_usuarios;

create policy "deny_all_select_fin_usuarios"
  on public.fin_usuarios
  for select
  to anon, authenticated
  using (false);

create policy "deny_all_insert_fin_usuarios"
  on public.fin_usuarios
  for insert
  to anon, authenticated
  with check (false);

create policy "deny_all_update_fin_usuarios"
  on public.fin_usuarios
  for update
  to anon, authenticated
  using (false)
  with check (false);

create policy "deny_all_delete_fin_usuarios"
  on public.fin_usuarios
  for delete
  to anon, authenticated
  using (false);

create or replace function public.fin_login(p_usuario text, p_password text)
returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_ok boolean;
begin
  select exists (
    select 1
    from public.fin_usuarios u
    where lower(u.usuario) = lower(trim(p_usuario))
      and u.activo = true
      and u.password_hash = extensions.crypt(p_password, u.password_hash)
  ) into v_ok;

  return coalesce(v_ok, false);
end;
$$;

grant execute on function public.fin_login(text, text) to anon, authenticated;

insert into public.fin_usuarios (usuario, password_hash, activo)
values ('Admin', extensions.crypt('pablo123', extensions.gen_salt('bf')), true)
on conflict (usuario)
do update set
  password_hash = excluded.password_hash,
  activo = true;
