create table if not exists public.fin_movimientos (
  id uuid primary key default gen_random_uuid(),
  monto numeric(14,2) not null check (monto > 0),
  descripcion text not null,
  tipo text not null check (tipo in ('INGRESO', 'GASTO')),
  categoria_id bigint not null,
  fecha date not null default current_date,
  created_at timestamptz not null default now(),
  constraint fin_movimientos_categoria_fk
    foreign key (categoria_id)
    references public.fin_categorias(id)
    on update cascade
    on delete restrict
);

create index if not exists fin_movimientos_fecha_idx
  on public.fin_movimientos (fecha desc);

create index if not exists fin_movimientos_tipo_idx
  on public.fin_movimientos (tipo);

create index if not exists fin_movimientos_categoria_idx
  on public.fin_movimientos (categoria_id);

alter table public.fin_movimientos enable row level security;

drop policy if exists "allow_all_fin_movimientos_select" on public.fin_movimientos;
drop policy if exists "allow_all_fin_movimientos_insert" on public.fin_movimientos;
drop policy if exists "allow_all_fin_movimientos_update" on public.fin_movimientos;
drop policy if exists "allow_all_fin_movimientos_delete" on public.fin_movimientos;

create policy "allow_all_fin_movimientos_select"
  on public.fin_movimientos
  for select
  to anon, authenticated
  using (true);

create policy "allow_all_fin_movimientos_insert"
  on public.fin_movimientos
  for insert
  to anon, authenticated
  with check (true);

create policy "allow_all_fin_movimientos_update"
  on public.fin_movimientos
  for update
  to anon, authenticated
  using (true)
  with check (true);

create policy "allow_all_fin_movimientos_delete"
  on public.fin_movimientos
  for delete
  to anon, authenticated
  using (true);
