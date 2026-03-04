-- 1) Verifica columnas nuevas en usuarios
select column_name, data_type
from information_schema.columns
where table_schema = 'public'
  and table_name = 'fin_usuarios'
  and column_name in ('estado_pago', 'clave_mensual_hash', 'clave_mensual_visible', 'es_admin', 'pago_hasta', 'updated_at')
order by column_name;

-- 2) Verifica columna usuario_id en movimientos
select column_name, data_type
from information_schema.columns
where table_schema = 'public'
  and table_name = 'fin_movimientos'
  and column_name = 'usuario_id';

-- 3) Verifica función de login multi
select
  n.nspname as schema,
  p.proname as function_name,
  pg_get_function_identity_arguments(p.oid) as args
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'fin_login_multi';

-- 4) Verifica funciones admin
select
  n.nspname as schema,
  p.proname as function_name,
  pg_get_function_identity_arguments(p.oid) as args
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('fin_admin_create_usuario', 'fin_admin_get_clave_mensual', 'fin_admin_list_usuarios', 'fin_admin_set_estado_pago', 'fin_admin_clear_clave_mensual', 'fin_admin_delete_usuario', 'fin_renovar_mensualidad')
order by p.proname;

-- 5) Prueba login multi (reemplaza por usuario real y clave mensual real)
-- select * from public.fin_login_multi('Admin', 'pablo123', 'TU-CLAVE-MENSUAL');

-- 6) Pruebas admin
-- select * from public.fin_admin_list_usuarios();
-- select * from public.fin_admin_create_usuario('cliente2', 'cliente2pass', 1, false);
-- select * from public.fin_admin_get_clave_mensual('cliente1');
-- select public.fin_admin_set_estado_pago('cliente1', 'MOROSO', null);
-- select public.fin_admin_clear_clave_mensual('cliente1');
-- select * from public.fin_admin_delete_usuario('cliente1');
