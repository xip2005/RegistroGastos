-- Vista previa: revisa qué movimientos de ahorro podrían estar invertidos
select
  m.id,
  m.fecha,
  m.descripcion,
  m.tipo,
  m.monto,
  c.nombre as categoria
from public.fin_movimientos m
join public.fin_categorias c on c.id = m.categoria_id
where c.icono = 'SAVINGS'
order by m.fecha desc;

-- Ajuste recomendado para datos cargados con la lógica anterior:
-- 1) Si la descripción parece RETIRO, debe quedar como GASTO
update public.fin_movimientos m
set tipo = 'GASTO'
from public.fin_categorias c
where c.id = m.categoria_id
  and c.icono = 'SAVINGS'
  and m.descripcion ilike '%retiro%'
  and m.tipo <> 'GASTO';

-- 2) Si NO parece retiro, se considera DEPÓSITO de ahorro y queda como INGRESO
update public.fin_movimientos m
set tipo = 'INGRESO'
from public.fin_categorias c
where c.id = m.categoria_id
  and c.icono = 'SAVINGS'
  and m.descripcion not ilike '%retiro%'
  and m.tipo <> 'INGRESO';

-- Verificación final
select
  m.id,
  m.fecha,
  m.descripcion,
  m.tipo,
  m.monto,
  c.nombre as categoria
from public.fin_movimientos m
join public.fin_categorias c on c.id = m.categoria_id
where c.icono = 'SAVINGS'
order by m.fecha desc;
