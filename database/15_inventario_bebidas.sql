-- Inventario de bebidas por sucursal y ubicación (freezer / almacén).
-- Ejecutar después de 11_cajero.sql, 12_cajero_pedidos.sql,
-- 13_cajero_pagos_mixtos.sql y 14_personalizacion_pollo.sql.
begin;

do $$
begin
  if to_regclass('public.productos') is null
    or to_regclass('public.categorias') is null
    or to_regclass('public.detalle_pedido') is null
    or to_regclass('public.pedidos') is null
    or to_regclass('public.sucursales') is null then
    raise exception 'Faltan tablas de Pollos Roly. Ejecuta primero la migración base y las migraciones del cajero 11, 12, 13 y 14.';
  end if;
end $$;

create table if not exists public.stock_bebidas (
  id uuid primary key default gen_random_uuid(),
  producto_id uuid not null references public.productos(id),
  sucursal_id uuid not null references public.sucursales(id),
  cantidad_freezer integer not null default 0 check (cantidad_freezer >= 0),
  cantidad_almacen integer not null default 0 check (cantidad_almacen >= 0),
  minimo integer not null default 0 check (minimo >= 0),
  unique (producto_id, sucursal_id)
);

alter table public.detalle_pedido
  add column if not exists bebidas_freezer integer not null default 0 check (bebidas_freezer >= 0),
  add column if not exists bebidas_almacen integer not null default 0 check (bebidas_almacen >= 0);

create or replace function roly_private.validar_stock_bebida()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if not exists (
    select 1 from public.productos p
    join public.categorias c on c.id = p.categoria_id
    where p.id = new.producto_id and lower(trim(c.nombre)) = 'bebidas'
  ) then
    raise exception 'El producto debe pertenecer a la categoría Bebidas.';
  end if;
  return new;
end $$;

revoke all on function roly_private.validar_stock_bebida() from public, anon, authenticated;
drop trigger if exists validar_stock_bebida on public.stock_bebidas;
create trigger validar_stock_bebida
before insert or update of producto_id on public.stock_bebidas
for each row execute function roly_private.validar_stock_bebida();

create or replace function roly_private.descontar_stock_bebida_detalle()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_nombre text;
  v_freezer integer;
  v_almacen integer;
  v_toma_freezer integer;
  v_toma_almacen integer;
begin
  new.bebidas_freezer := 0;
  new.bebidas_almacen := 0;
  select p.nombre into v_nombre
  from public.productos p
  join public.categorias c on c.id = p.categoria_id
  where p.id = new.producto_id and lower(trim(c.nombre)) = 'bebidas';
  if not found then return new; end if;

  select cantidad_freezer, cantidad_almacen into v_freezer, v_almacen
  from public.stock_bebidas
  where producto_id = new.producto_id
    and sucursal_id = (select pe.sucursal_id from public.pedidos pe where pe.id = new.pedido_id)
  for update;
  if not found then
    raise exception 'Registra el stock de % en el apartado Bebidas antes de venderlo.', v_nombre;
  end if;
  if v_freezer + v_almacen < new.cantidad then
    raise exception 'Stock insuficiente para %. Hay % bebidas disponibles.', v_nombre, v_freezer + v_almacen;
  end if;

  v_toma_freezer := least(v_freezer, new.cantidad);
  v_toma_almacen := new.cantidad - v_toma_freezer;
  update public.stock_bebidas
  set cantidad_freezer = cantidad_freezer - v_toma_freezer,
      cantidad_almacen = cantidad_almacen - v_toma_almacen
  where producto_id = new.producto_id
    and sucursal_id = (select pe.sucursal_id from public.pedidos pe where pe.id = new.pedido_id);
  new.bebidas_freezer := v_toma_freezer;
  new.bebidas_almacen := v_toma_almacen;
  return new;
end $$;

revoke all on function roly_private.descontar_stock_bebida_detalle() from public, anon, authenticated;
drop trigger if exists descontar_stock_bebida_detalle on public.detalle_pedido;
create trigger descontar_stock_bebida_detalle
before insert on public.detalle_pedido
for each row execute function roly_private.descontar_stock_bebida_detalle();

create or replace function roly_private.devolver_stock_bebida_detalle()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_sucursal uuid;
begin
  if old.bebidas_freezer = 0 and old.bebidas_almacen = 0 then return old; end if;
  select sucursal_id into v_sucursal from public.pedidos where id = old.pedido_id;
  update public.stock_bebidas
  set cantidad_freezer = cantidad_freezer + old.bebidas_freezer,
      cantidad_almacen = cantidad_almacen + old.bebidas_almacen
  where producto_id = old.producto_id and sucursal_id = v_sucursal;
  return old;
end $$;

revoke all on function roly_private.devolver_stock_bebida_detalle() from public, anon, authenticated;
drop trigger if exists devolver_stock_bebida_detalle on public.detalle_pedido;
create trigger devolver_stock_bebida_detalle
before delete on public.detalle_pedido
for each row execute function roly_private.devolver_stock_bebida_detalle();

create or replace function roly_private.devolver_stock_bebida_pedido_anulado()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_linea record;
begin
  if old.estado = 'Cancelado' or new.estado <> 'Cancelado' then return new; end if;
  for v_linea in
    select id, producto_id, bebidas_freezer, bebidas_almacen
    from public.detalle_pedido
    where pedido_id = new.id and (bebidas_freezer > 0 or bebidas_almacen > 0)
    order by producto_id
  loop
    update public.stock_bebidas
    set cantidad_freezer = cantidad_freezer + v_linea.bebidas_freezer,
        cantidad_almacen = cantidad_almacen + v_linea.bebidas_almacen
    where producto_id = v_linea.producto_id and sucursal_id = new.sucursal_id;
    update public.detalle_pedido
    set bebidas_freezer = 0, bebidas_almacen = 0
    where id = v_linea.id;
  end loop;
  return new;
end $$;

revoke all on function roly_private.devolver_stock_bebida_pedido_anulado() from public, anon, authenticated;
drop trigger if exists devolver_stock_bebida_pedido_anulado on public.pedidos;
create trigger devolver_stock_bebida_pedido_anulado
after update of estado on public.pedidos
for each row when (old.estado is distinct from new.estado)
execute function roly_private.devolver_stock_bebida_pedido_anulado();

alter table public.stock_bebidas enable row level security;
revoke all on table public.stock_bebidas from anon, authenticated;
grant select, insert, update on public.stock_bebidas to authenticated;
drop policy if exists roly_admin on public.stock_bebidas;
create policy roly_admin on public.stock_bebidas for all to authenticated
using ((select roly_private.es_admin()))
with check ((select roly_private.es_admin()));
drop policy if exists roly_cajero_stock_bebidas on public.stock_bebidas;
create policy roly_cajero_stock_bebidas on public.stock_bebidas for select to authenticated
using (sucursal_id = (select roly_private.cajero_sucursal()));

create or replace view public.alertas_stock with (security_invoker=true) as
  select 'Insumo'::text as tipo,id as referencia_id,sucursal_id,nombre,cantidad,minimo,unidad
    from public.insumos where cantidad<=minimo
  union all
  select 'Snack',s.id,s.sucursal_id,p.nombre,s.cantidad,s.minimo,'unidades'
    from public.stock_snacks s join public.productos p on p.id=s.producto_id where s.cantidad<=s.minimo
  union all
  select 'Bebida',s.id,s.sucursal_id,p.nombre,(s.cantidad_freezer+s.cantidad_almacen),s.minimo,'unidades'
    from public.stock_bebidas s join public.productos p on p.id=s.producto_id
    where (s.cantidad_freezer+s.cantidad_almacen)<=s.minimo;

grant select on public.alertas_stock to authenticated;
notify pgrst, 'reload schema';
commit;
