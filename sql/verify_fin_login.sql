-- 1) Verifica existencia de tabla de usuarios
select to_regclass('public.fin_usuarios') as tabla_fin_usuarios;

-- 2) Verifica existencia de función de login
select
  n.nspname as schema,
  p.proname as function_name,
  pg_get_function_identity_arguments(p.oid) as args
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'fin_login';

-- 3) Verifica usuario Admin en tabla
select id, usuario, activo, created_at
from public.fin_usuarios
where lower(usuario) = 'admin';

-- 4) Prueba login (debe devolver true)
select public.fin_login('Admin', 'pablo123') as login_ok;
