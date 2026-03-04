create extension if not exists pgcrypto;

alter table public.fin_usuarios
  add column if not exists estado_pago text not null default 'ACTIVO',
  add column if not exists clave_mensual_hash text,
  add column if not exists updated_at timestamptz not null default now();

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'fin_usuarios_estado_pago_chk'
  ) then
    alter table public.fin_usuarios
      add constraint fin_usuarios_estado_pago_chk
      check (estado_pago in ('ACTIVO', 'MOROSO'));
  end if;
end $$;

alter table public.fin_movimientos
  add column if not exists usuario_id uuid;

alter table public.fin_movimientos
  drop constraint if exists fin_movimientos_usuario_fk;

alter table public.fin_movimientos
  add constraint fin_movimientos_usuario_fk
  foreign key (usuario_id)
  references public.fin_usuarios(id)
  on update cascade
  on delete restrict;

update public.fin_movimientos m
set usuario_id = u.id
from (
  select id
  from public.fin_usuarios
  order by created_at asc
  limit 1
) u
where m.usuario_id is null;

alter table public.fin_movimientos
  alter column usuario_id set not null;

create index if not exists fin_movimientos_usuario_fecha_idx
  on public.fin_movimientos (usuario_id, fecha desc);

-- Opcional: mejorar selectividad en búsquedas por usuario+categoria
create index if not exists fin_movimientos_usuario_categoria_idx
  on public.fin_movimientos (usuario_id, categoria_id);

create or replace function public.fin_login_multi(
  p_usuario text,
  p_password text,
  p_clave_mensual text
)
returns table (
  ok boolean,
  user_id uuid,
  usuario text,
  estado_pago text,
  mensaje text
)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_usuario public.fin_usuarios%rowtype;
begin
  select *
  into v_usuario
  from public.fin_usuarios u
  where lower(u.usuario) = lower(trim(p_usuario))
  limit 1;

  if not found then
    return query select false, null::uuid, null::text, null::text, 'Usuario no encontrado';
    return;
  end if;

  if v_usuario.activo = false then
    return query select false, null::uuid, v_usuario.usuario, v_usuario.estado_pago, 'Usuario inactivo';
    return;
  end if;

  if v_usuario.password_hash <> extensions.crypt(p_password, v_usuario.password_hash) then
    return query select false, null::uuid, v_usuario.usuario, v_usuario.estado_pago, 'Usuario o contraseña incorrectos';
    return;
  end if;

  if coalesce(v_usuario.estado_pago, 'ACTIVO') <> 'ACTIVO' then
    return query select false, null::uuid, v_usuario.usuario, v_usuario.estado_pago, 'Mensualidad pendiente. Contacta al administrador.';
    return;
  end if;

  if coalesce(v_usuario.clave_mensual_hash, '') <> ''
     and v_usuario.clave_mensual_hash <> extensions.crypt(coalesce(p_clave_mensual, ''), v_usuario.clave_mensual_hash) then
    return query select false, null::uuid, v_usuario.usuario, v_usuario.estado_pago, 'Clave mensual inválida';
    return;
  end if;

  update public.fin_usuarios
  set updated_at = now()
  where id = v_usuario.id;

  return query select true, v_usuario.id, v_usuario.usuario, v_usuario.estado_pago, 'OK';
end;
$$;

grant execute on function public.fin_login_multi(text, text, text) to anon, authenticated;

create or replace function public.fin_set_clave_mensual(
  p_usuario text,
  p_nueva_clave text
)
returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_rows integer;
begin
  update public.fin_usuarios
  set
    clave_mensual_hash = extensions.crypt(p_nueva_clave, extensions.gen_salt('bf')),
    estado_pago = 'ACTIVO',
    updated_at = now()
  where lower(usuario) = lower(trim(p_usuario));

  get diagnostics v_rows = row_count;
  return v_rows > 0;
end;
$$;

grant execute on function public.fin_set_clave_mensual(text, text) to anon, authenticated;

-- Ejemplos rápidos de administración:
-- Marcar mensualidad pendiente:
-- update public.fin_usuarios set estado_pago = 'MOROSO' where lower(usuario) = lower('cliente1');
--
-- Reactivar y definir clave mensual:
-- select public.fin_set_clave_mensual('cliente1', 'CLAVE-MAR-2026');
