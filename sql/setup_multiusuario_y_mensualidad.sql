create extension if not exists pgcrypto;

alter table public.fin_usuarios
  add column if not exists estado_pago text not null default 'ACTIVO',
  add column if not exists clave_mensual_hash text,
  add column if not exists es_admin boolean not null default false,
  add column if not exists pago_hasta date,
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

drop function if exists public.fin_login_multi(text, text, text);

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
  es_admin boolean,
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
    return query select false, null::uuid, null::text, null::text, false, 'Usuario no encontrado';
    return;
  end if;

  if v_usuario.activo = false then
    return query select false, null::uuid, v_usuario.usuario, v_usuario.estado_pago, coalesce(v_usuario.es_admin, false), 'Usuario inactivo';
    return;
  end if;

  if v_usuario.password_hash <> extensions.crypt(p_password, v_usuario.password_hash) then
    return query select false, null::uuid, v_usuario.usuario, v_usuario.estado_pago, coalesce(v_usuario.es_admin, false), 'Usuario o contraseña incorrectos';
    return;
  end if;

  if coalesce(v_usuario.estado_pago, 'ACTIVO') <> 'ACTIVO' then
    if coalesce(v_usuario.es_admin, false) = false then
      return query select false, null::uuid, v_usuario.usuario, v_usuario.estado_pago, false, 'Mensualidad pendiente. Contacta al administrador.';
      return;
    end if;
  end if;

  if v_usuario.pago_hasta is null or v_usuario.pago_hasta < current_date then
    if coalesce(v_usuario.es_admin, false) = false then
      update public.fin_usuarios
      set
        estado_pago = 'MOROSO',
        updated_at = now()
      where id = v_usuario.id;

      return query select false, null::uuid, v_usuario.usuario, 'MOROSO'::text, false, 'Mensualidad vencida. Contacta al administrador.';
      return;
    end if;
  end if;

  if coalesce(v_usuario.clave_mensual_hash, '') <> ''
     and v_usuario.clave_mensual_hash <> extensions.crypt(coalesce(p_clave_mensual, ''), v_usuario.clave_mensual_hash) then
    return query select false, null::uuid, v_usuario.usuario, v_usuario.estado_pago, coalesce(v_usuario.es_admin, false), 'Clave mensual inválida';
    return;
  end if;

  update public.fin_usuarios
  set updated_at = now()
  where id = v_usuario.id;

  return query select true, v_usuario.id, v_usuario.usuario, v_usuario.estado_pago, coalesce(v_usuario.es_admin, false), 'OK';
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

create or replace function public.fin_renovar_mensualidad(
  p_usuario text,
  p_nueva_clave text,
  p_meses integer default 1
)
returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_rows integer;
  v_meses integer := greatest(coalesce(p_meses, 1), 1);
begin
  update public.fin_usuarios
  set
    clave_mensual_hash = extensions.crypt(p_nueva_clave, extensions.gen_salt('bf')),
    estado_pago = 'ACTIVO',
    pago_hasta = (
      case
        when pago_hasta is null or pago_hasta < current_date then current_date
        else pago_hasta
      end
      + make_interval(months => v_meses)
    )::date,
    updated_at = now()
  where lower(usuario) = lower(trim(p_usuario));

  get diagnostics v_rows = row_count;
  return v_rows > 0;
end;
$$;

grant execute on function public.fin_renovar_mensualidad(text, text, integer) to anon, authenticated;

drop function if exists public.fin_admin_create_usuario(text, text, integer, boolean);

create or replace function public.fin_admin_create_usuario(
  p_usuario text,
  p_password text,
  p_meses integer default 1,
  p_es_admin boolean default false
)
returns table (
  ok boolean,
  usuario text,
  clave_mensual text,
  mensaje text
)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_usuario text := trim(coalesce(p_usuario, ''));
  v_password text := trim(coalesce(p_password, ''));
  v_meses integer := greatest(coalesce(p_meses, 1), 1);
  v_clave text;
begin
  if v_usuario = '' then
    return query select false, ''::text, ''::text, 'Usuario requerido';
    return;
  end if;

  if v_password = '' then
    return query select false, v_usuario, ''::text, 'Contraseña requerida';
    return;
  end if;

  if exists (
    select 1
    from public.fin_usuarios u
    where lower(u.usuario) = lower(v_usuario)
  ) then
    return query select false, v_usuario, ''::text, 'El usuario ya existe';
    return;
  end if;

  v_clave := format(
    'CLAVE-%s-%s',
    to_char(current_date, 'MMYYYY'),
    lpad((floor(random() * 9000) + 1000)::int::text, 4, '0')
  );

  insert into public.fin_usuarios (
    usuario,
    password_hash,
    activo,
    estado_pago,
    clave_mensual_hash,
    es_admin,
    pago_hasta,
    updated_at
  )
  values (
    v_usuario,
    extensions.crypt(v_password, extensions.gen_salt('bf')),
    true,
    'ACTIVO',
    extensions.crypt(v_clave, extensions.gen_salt('bf')),
    coalesce(p_es_admin, false),
    (
      case
        when coalesce(p_es_admin, false) then current_date + make_interval(months => 120)
        else current_date + make_interval(months => v_meses)
      end
    )::date,
    now()
  );

  return query select true, v_usuario, v_clave, 'Usuario creado correctamente';
end;
$$;

grant execute on function public.fin_admin_create_usuario(text, text, integer, boolean) to anon, authenticated;

create or replace function public.fin_admin_list_usuarios()
returns table (
  id uuid,
  usuario text,
  estado_pago text,
  pago_hasta date,
  es_admin boolean,
  activo boolean,
  updated_at timestamptz
)
language sql
security definer
set search_path = public, extensions
as $$
  select
    u.id,
    u.usuario,
    coalesce(u.estado_pago, 'ACTIVO') as estado_pago,
    u.pago_hasta,
    coalesce(u.es_admin, false) as es_admin,
    coalesce(u.activo, true) as activo,
    u.updated_at
  from public.fin_usuarios u
  order by lower(u.usuario);
$$;

grant execute on function public.fin_admin_list_usuarios() to anon, authenticated;

create or replace function public.fin_admin_set_estado_pago(
  p_usuario text,
  p_estado text,
  p_pago_hasta date default null
)
returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_rows integer;
  v_estado text := upper(trim(coalesce(p_estado, '')));
begin
  if v_estado not in ('ACTIVO', 'MOROSO') then
    raise exception 'Estado inválido. Usa ACTIVO o MOROSO';
  end if;

  update public.fin_usuarios
  set
    estado_pago = v_estado,
    pago_hasta = case when p_pago_hasta is not null then p_pago_hasta else pago_hasta end,
    updated_at = now()
  where lower(usuario) = lower(trim(p_usuario));

  get diagnostics v_rows = row_count;
  return v_rows > 0;
end;
$$;

grant execute on function public.fin_admin_set_estado_pago(text, text, date) to anon, authenticated;

update public.fin_usuarios
set
  es_admin = true,
  estado_pago = 'ACTIVO',
  pago_hasta = coalesce(pago_hasta, current_date + interval '120 months')::date,
  updated_at = now()
where lower(usuario) = 'admin';

-- Ejemplos rápidos de administración:
-- Marcar mensualidad pendiente:
-- update public.fin_usuarios set estado_pago = 'MOROSO' where lower(usuario) = lower('cliente1');
--
-- Reactivar y definir clave mensual:
-- select public.fin_set_clave_mensual('cliente1', 'CLAVE-MAR-2026');
--
-- Renovar mensualidad (1 mes) y actualizar clave mensual:
-- select public.fin_renovar_mensualidad('cliente1', 'CLAVE-ABR-2026', 1);
--
-- Marcar creador como admin (si usas otro usuario distinto a Admin):
-- update public.fin_usuarios set es_admin = true, estado_pago = 'ACTIVO' where lower(usuario) = lower('tu_usuario');
