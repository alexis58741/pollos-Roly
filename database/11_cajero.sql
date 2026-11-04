-- POLLOS ROLY · punto de venta y permisos de Cajero.
-- Ejecutar en Supabase SQL Editor después de 01–10. Repara las tablas POS
-- faltantes sin borrar datos; se puede volver a ejecutar.
begin;

-- El esquema privado normalmente lo crea 01_pollos_roly.sql. Créalo de forma
-- idempotente para que esta migración también informe claramente si falta la base.
create schema if not exists roly_private;
revoke all on schema roly_private from public;
grant usage on schema roly_private to authenticated;

do $$ begin
  if to_regclass('public.perfiles') is null or to_regclass('public.sucursales') is null then
    raise exception 'Faltan public.perfiles o public.sucursales. Ejecuta primero la base de Pollos Roly.';
  end if;
end $$;

-- Completar las tablas que esta instalación parcial no tenga. Todas las
-- creaciones son IF NOT EXISTS y preservan cualquier registro existente.
create table if not exists public.roly_schema_version (
  version integer primary key, applied_at timestamptz not null default now()
);
create table if not exists public.categorias (
  id uuid primary key default gen_random_uuid(), nombre text not null check(length(trim(nombre))>0),
  activa boolean not null default true
);
create table if not exists public.productos (
  id uuid primary key default gen_random_uuid(), nombre text not null check(length(trim(nombre))>0),
  categoria_id uuid not null references public.categorias(id), precio numeric(12,2) not null check(precio>0),
  activo boolean not null default true, created_at timestamptz not null default now(),
  descripcion text not null default '', precio_oferta numeric(12,2), en_oferta boolean not null default false,
  foto_path text not null default '', orden integer not null default 1,
  requiere_seleccion boolean not null default false, tipo_presas text not null default 'all'
);
-- En instalaciones con productos previos, añadir campos del menú extendido sin
-- reemplazar nombre, precio, categoría ni ningún dato guardado.
alter table public.categorias add column if not exists activa boolean not null default true;
alter table public.productos
  add column if not exists descripcion text not null default '',
  add column if not exists precio_oferta numeric(12,2),
  add column if not exists en_oferta boolean not null default false,
  add column if not exists foto_path text not null default '',
  add column if not exists orden integer not null default 1,
  add column if not exists requiere_seleccion boolean not null default false,
  add column if not exists tipo_presas text not null default 'all';
create table if not exists public.stock_snacks (
  id uuid primary key default gen_random_uuid(), producto_id uuid not null references public.productos(id),
  sucursal_id uuid not null references public.sucursales(id), cantidad integer not null default 0 check(cantidad>=0),
  minimo integer not null default 0 check(minimo>=0), unique(producto_id,sucursal_id)
);
create table if not exists public.turnos_caja (
  id uuid primary key default gen_random_uuid(), sucursal_id uuid not null references public.sucursales(id),
  cajero_id uuid not null references public.perfiles(id), fondo_inicial numeric(12,2) not null check(fondo_inicial>=0),
  apertura timestamptz not null default now(), cierre timestamptz, efectivo_esperado numeric(12,2),
  efectivo_contado numeric(12,2) check(efectivo_contado>=0),
  diferencia numeric(12,2) generated always as (efectivo_contado-efectivo_esperado) stored,
  observaciones text not null default '', check(cierre is null or cierre>=apertura),
  check((cierre is null and efectivo_contado is null and efectivo_esperado is null) or
        (cierre is not null and efectivo_contado is not null and efectivo_esperado is not null))
);
create unique index if not exists un_turno_abierto_por_cajero_sucursal on public.turnos_caja(sucursal_id,cajero_id) where cierre is null;
create table if not exists public.movimientos_caja (
  id uuid primary key default gen_random_uuid(), turno_id uuid not null references public.turnos_caja(id),
  tipo text not null check(tipo in ('Ingreso','Egreso')), monto numeric(12,2) not null check(monto>0),
  concepto text not null check(length(trim(concepto))>0), created_at timestamptz not null default now()
);
create table if not exists public.pedidos (
  id uuid primary key default gen_random_uuid(), numero bigint generated always as identity unique,
  sucursal_id uuid not null references public.sucursales(id), turno_id uuid not null references public.turnos_caja(id),
  cliente text not null default 'Cliente de mostrador',
  estado text not null default 'En preparación' check(estado in ('En preparación','Listo para entregar','Entregado','Cancelado')),
  total numeric(12,2) not null check(total>0), creado_por uuid not null references public.perfiles(id),
  created_at timestamptz not null default now()
);
create table if not exists public.detalle_pedido (
  id uuid primary key default gen_random_uuid(), pedido_id uuid not null references public.pedidos(id),
  producto_id uuid not null references public.productos(id), nombre_producto text not null,
  cantidad integer not null check(cantidad>0), precio_unitario numeric(12,2) not null check(precio_unitario>0),
  subtotal numeric(14,2) generated always as (cantidad*precio_unitario) stored,
  descuenta_stock boolean not null default false, unique(pedido_id,producto_id)
);
create table if not exists public.pagos_pedido (
  id uuid primary key default gen_random_uuid(), pedido_id uuid not null references public.pedidos(id),
  metodo text not null check(metodo in ('Efectivo','QR','Tarjeta')), monto numeric(12,2) not null check(monto>0),
  unique(pedido_id,metodo)
);
create table if not exists public.configuracion (
  id integer primary key default 1 check(id=1), nombre text not null default 'Pollos Roly',
  telefono text not null default '', direccion text not null default '',
  mensaje_ticket text not null default '¡Gracias por elegir Pollos Roly!', moneda text not null default 'BOB',
  zona_horaria text not null default 'America/La_Paz'
);

do $$ begin
  if not exists(select 1 from information_schema.columns where table_schema='public' and table_name='perfiles' and column_name='rol') or
     not exists(select 1 from information_schema.columns where table_schema='public' and table_name='perfiles' and column_name='activo') or
     not exists(select 1 from information_schema.columns where table_schema='public' and table_name='perfiles' and column_name='sucursal_id') or
     not exists(select 1 from information_schema.columns where table_schema='public' and table_name='sucursales' and column_name='activa') then
    raise exception 'perfiles o sucursales no tienen las columnas de Pollos Roly. Se detuvo sin reemplazar datos.';
  end if;
end $$;

-- Reponer explícitamente las funciones auxiliares por si la instalación base
-- quedó incompleta. Ambas se ejecutan con privilegios limitados y auth.uid().
create or replace function roly_private.es_admin()
returns boolean language sql stable security definer set search_path = '' as $$
select exists(select 1 from public.perfiles p where p.id=auth.uid() and p.activo is true and lower(trim(p.rol::text)) in ('administrador','admin','administrator'))
$$;
revoke all on function roly_private.es_admin() from public, anon;
grant execute on function roly_private.es_admin() to authenticated;

create or replace function roly_private.efectivo_turno(p_turno uuid)
returns numeric language sql stable set search_path = '' as $$
  select t.fondo_inicial
    + coalesce((select sum(pp.monto) from public.pagos_pedido pp join public.pedidos p on p.id=pp.pedido_id where p.turno_id=t.id and p.estado<>'Cancelado' and pp.metodo='Efectivo'),0)
    + coalesce((select sum(case when m.tipo='Ingreso' then m.monto else -m.monto end) from public.movimientos_caja m where m.turno_id=t.id),0)
  from public.turnos_caja t where t.id=p_turno;
$$;
revoke all on function roly_private.efectivo_turno(uuid) from public, anon, authenticated;

-- RLS y lectura del catálogo para admins y cajeros. Solo admins escriben menú.
do $$ declare t text; begin
  foreach t in array array['categorias','productos','stock_snacks','turnos_caja','movimientos_caja','pedidos','detalle_pedido','pagos_pedido','configuracion'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('revoke all on table public.%I from anon, authenticated',t);
    execute format('drop policy if exists roly_admin on public.%I',t);
    execute format('create policy roly_admin on public.%I for all to authenticated using ((select roly_private.es_admin())) with check ((select roly_private.es_admin()))',t);
    execute format('grant select on public.%I to authenticated',t);
  end loop;
end $$;
grant insert,update on public.categorias,public.productos,public.stock_snacks to authenticated;

create or replace function roly_private.es_cajero()
returns boolean language sql stable security definer set search_path = '' as $$
select exists(select 1 from public.perfiles p join public.sucursales s on s.id=p.sucursal_id where p.id=auth.uid() and p.activo is true and lower(trim(p.rol::text)) in ('cajero','cashier','caja') and s.activa is true)
$$;
revoke all on function roly_private.es_cajero() from public, anon;
grant execute on function roly_private.es_cajero() to authenticated;

create or replace function roly_private.cajero_sucursal()
returns uuid language sql stable security definer set search_path = '' as $$
select p.sucursal_id from public.perfiles p where p.id=auth.uid() and p.activo is true and lower(trim(p.rol::text)) in ('cajero','cashier','caja')
$$;
revoke all on function roly_private.cajero_sucursal() from public, anon;
grant execute on function roly_private.cajero_sucursal() to authenticated;

create or replace function roly_private.exigir_cajero_o_admin()
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not roly_private.es_admin() and not roly_private.es_cajero() then
    raise exception 'Se requiere un cajero o administrador activo.' using errcode='42501';
  end if;
end $$;
revoke all on function roly_private.exigir_cajero_o_admin() from public, anon, authenticated;

-- El cajero consulta catálogo, sucursal asignada y operaciones de su turno.
drop policy if exists roly_cajero_sucursal on public.sucursales;
create policy roly_cajero_sucursal on public.sucursales for select to authenticated
using(id=(select roly_private.cajero_sucursal()));
drop policy if exists roly_cajero_configuracion on public.configuracion;
create policy roly_cajero_configuracion on public.configuracion for select to authenticated
using((select roly_private.es_cajero()));
drop policy if exists roly_cajero_categorias on public.categorias;
create policy roly_cajero_categorias on public.categorias for select to authenticated
using((select roly_private.es_cajero()) and activa);
drop policy if exists roly_cajero_productos on public.productos;
create policy roly_cajero_productos on public.productos for select to authenticated
using((select roly_private.es_cajero()) and activo and exists(
  select 1 from public.categorias c where c.id=categoria_id and c.activa
));
drop policy if exists roly_cajero_stock_snacks on public.stock_snacks;
create policy roly_cajero_stock_snacks on public.stock_snacks for select to authenticated
using(sucursal_id=(select roly_private.cajero_sucursal()));
drop policy if exists roly_cajero_turnos on public.turnos_caja;
create policy roly_cajero_turnos on public.turnos_caja for select to authenticated
using(cajero_id=(select auth.uid()) and sucursal_id=(select roly_private.cajero_sucursal()));
drop policy if exists roly_cajero_movimientos_caja on public.movimientos_caja;
create policy roly_cajero_movimientos_caja on public.movimientos_caja for select to authenticated
using(exists(select 1 from public.turnos_caja t where t.id=turno_id and t.cajero_id=(select auth.uid())));
drop policy if exists roly_cajero_pedidos on public.pedidos;
create policy roly_cajero_pedidos on public.pedidos for select to authenticated
using(sucursal_id=(select roly_private.cajero_sucursal()));
drop policy if exists roly_cajero_detalle_pedido on public.detalle_pedido;
create policy roly_cajero_detalle_pedido on public.detalle_pedido for select to authenticated
using(exists(select 1 from public.pedidos p where p.id=pedido_id and p.sucursal_id=(select roly_private.cajero_sucursal())));
drop policy if exists roly_cajero_pagos_pedido on public.pagos_pedido;
create policy roly_cajero_pagos_pedido on public.pagos_pedido for select to authenticated
using(exists(select 1 from public.pedidos p where p.id=pedido_id and p.sucursal_id=(select roly_private.cajero_sucursal())));

create or replace function public.abrir_turno(p_sucursal uuid,p_fondo numeric,p_observaciones text default '')
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_cajero boolean:=roly_private.es_cajero();
begin
  perform roly_private.exigir_cajero_o_admin();
  if v_cajero and p_sucursal is distinct from roly_private.cajero_sucursal() then raise exception 'Solo puedes abrir caja en tu sucursal.' using errcode='42501'; end if;
  if p_fondo is null or p_fondo<0 or p_fondo<>round(p_fondo,2) then raise exception 'Fondo inicial inválido.'; end if;
  if not exists(select 1 from public.sucursales where id=p_sucursal and activa) then raise exception 'Sucursal inactiva o inexistente.'; end if;
  insert into public.turnos_caja(sucursal_id,cajero_id,fondo_inicial,observaciones)
  values(p_sucursal,auth.uid(),p_fondo,coalesce(p_observaciones,'')) returning id into v_id;
  return v_id;
end $$;

create or replace function public.registrar_movimiento_caja(p_turno uuid,p_tipo text,p_monto numeric,p_concepto text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_turno public.turnos_caja; v_id uuid; v_cajero boolean:=roly_private.es_cajero();
begin
  perform roly_private.exigir_cajero_o_admin();
  select * into v_turno from public.turnos_caja where id=p_turno for update;
  if not found or v_turno.cierre is not null then raise exception 'El turno no existe o está cerrado.'; end if;
  if v_cajero and v_turno.cajero_id<>auth.uid() then raise exception 'Solo puedes modificar tu propio turno.' using errcode='42501'; end if;
  if p_tipo not in ('Ingreso','Egreso') or p_tipo is null then raise exception 'Tipo de movimiento inválido.'; end if;
  if p_concepto is null or length(trim(p_concepto)) not between 1 and 200 then raise exception 'Escribe un concepto válido.'; end if;
  if p_monto is null or p_monto<=0 or p_monto<>round(p_monto,2) then raise exception 'Monto inválido.'; end if;
  if p_tipo='Egreso' and p_monto>roly_private.efectivo_turno(p_turno) then raise exception 'Efectivo insuficiente.'; end if;
  insert into public.movimientos_caja(turno_id,tipo,monto,concepto) values(p_turno,p_tipo,p_monto,trim(p_concepto)) returning id into v_id;
  return v_id;
end $$;

create or replace function public.cerrar_turno(p_turno uuid,p_contado numeric,p_observaciones text default '')
returns void language plpgsql security definer set search_path = '' as $$
declare v_turno public.turnos_caja; v_cajero boolean:=roly_private.es_cajero();
begin
  perform roly_private.exigir_cajero_o_admin();
  select * into v_turno from public.turnos_caja where id=p_turno for update;
  if not found or v_turno.cierre is not null then raise exception 'El turno no existe o ya está cerrado.'; end if;
  if v_cajero and v_turno.cajero_id<>auth.uid() then raise exception 'Solo puedes cerrar tu propio turno.' using errcode='42501'; end if;
  if p_contado is null or p_contado<0 or p_contado<>round(p_contado,2) then raise exception 'Efectivo contado inválido.'; end if;
  update public.turnos_caja set cierre=clock_timestamp(),efectivo_contado=p_contado,
    efectivo_esperado=roly_private.efectivo_turno(p_turno),observaciones=coalesce(p_observaciones,'')
  where id=p_turno;
end $$;

create or replace function public.registrar_pedido(p_turno uuid,p_cliente text,p_items jsonb,p_pagos jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_turno public.turnos_caja; v_producto record; v_item record; v_id uuid;
  v_total numeric:=0; v_suma numeric; v_stock integer; v_snack boolean;
  v_cajero boolean:=roly_private.es_cajero();
begin
  perform roly_private.exigir_cajero_o_admin();
  select * into v_turno from public.turnos_caja where id=p_turno for update;
  if not found or v_turno.cierre is not null then raise exception 'Abre un turno para registrar pedidos.'; end if;
  if v_cajero and (v_turno.cajero_id<>auth.uid() or v_turno.sucursal_id<>roly_private.cajero_sucursal()) then raise exception 'Solo puedes registrar ventas en tu propio turno.' using errcode='42501'; end if;
  if p_items is null or jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)=0 then raise exception 'El pedido necesita productos.'; end if;
  if p_pagos is null or jsonb_typeof(p_pagos)<>'array' or jsonb_array_length(p_pagos)=0 then raise exception 'El pedido necesita pagos.'; end if;
  if exists(select 1 from jsonb_to_recordset(p_items) as x(producto_id uuid,cantidad numeric) where producto_id is null or cantidad is null or cantidad<=0 or cantidad<>trunc(cantidad) or cantidad>100000) then raise exception 'Cantidad de producto inválida.'; end if;
  if (select count(*) from jsonb_to_recordset(p_items) as x(producto_id uuid))<>(select count(distinct producto_id) from jsonb_to_recordset(p_items) as x(producto_id uuid)) then raise exception 'Agrupa los productos repetidos en una sola línea.'; end if;
  for v_item in select * from jsonb_to_recordset(p_items) as x(producto_id uuid,cantidad integer) order by producto_id loop
    select (case when p.en_oferta then p.precio_oferta else p.precio end) as precio,p.activo,c.activa
    into v_producto from public.productos p join public.categorias c on c.id=p.categoria_id
    where p.id=v_item.producto_id for share of p,c;
    if not found or not v_producto.activo or not v_producto.activa then raise exception 'Producto o categoría no disponible.'; end if;
    v_total:=v_total+v_producto.precio*v_item.cantidad;
  end loop;
  if exists(select 1 from jsonb_to_recordset(p_pagos) as x(metodo text,monto numeric) where metodo is null or metodo not in ('Efectivo','QR','Tarjeta') or monto is null or monto<=0 or monto<>round(monto,2)) then raise exception 'Método o monto de pago inválido.'; end if;
  select sum(monto) into v_suma from jsonb_to_recordset(p_pagos) as x(metodo text,monto numeric);
  if v_suma<>v_total then raise exception 'Los pagos deben sumar exactamente el total del pedido.'; end if;
  insert into public.pedidos(sucursal_id,turno_id,cliente,total,creado_por)
  values(v_turno.sucursal_id,p_turno,coalesce(nullif(trim(p_cliente),''),'Cliente de mostrador'),v_total,auth.uid()) returning id into v_id;
  for v_item in select * from jsonb_to_recordset(p_items) as x(producto_id uuid,cantidad integer) order by producto_id loop
    select p.nombre,(case when p.en_oferta then p.precio_oferta else p.precio end) as precio,
      lower(trim(c.nombre))='snacks' as snack into v_producto
    from public.productos p join public.categorias c on c.id=p.categoria_id where p.id=v_item.producto_id;
    v_snack:=v_producto.snack;
    if v_snack then
      select cantidad into v_stock from public.stock_snacks where producto_id=v_item.producto_id and sucursal_id=v_turno.sucursal_id for update;
      if not found or v_stock<v_item.cantidad then raise exception 'Stock insuficiente para %.',v_producto.nombre; end if;
      update public.stock_snacks set cantidad=cantidad-v_item.cantidad where producto_id=v_item.producto_id and sucursal_id=v_turno.sucursal_id;
    end if;
    insert into public.detalle_pedido(pedido_id,producto_id,nombre_producto,cantidad,precio_unitario,descuenta_stock)
    values(v_id,v_item.producto_id,v_producto.nombre,v_item.cantidad,v_producto.precio,v_snack);
  end loop;
  insert into public.pagos_pedido(pedido_id,metodo,monto)
  select v_id,metodo,sum(monto) from jsonb_to_recordset(p_pagos) as x(metodo text,monto numeric) group by metodo;
  return v_id;
end $$;

do $$ declare f text; begin
  foreach f in array array[
    'public.abrir_turno(uuid,numeric,text)',
    'public.registrar_movimiento_caja(uuid,text,numeric,text)',
    'public.cerrar_turno(uuid,numeric,text)',
    'public.registrar_pedido(uuid,text,jsonb,jsonb)'
  ] loop
    execute format('revoke all on function %s from public, anon',f);
    execute format('grant execute on function %s to authenticated',f);
  end loop;
end $$;

insert into public.roly_schema_version(version) values(11) on conflict do nothing;
notify pgrst,'reload schema';
commit;
