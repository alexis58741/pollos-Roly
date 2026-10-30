-- POLLOS ROLY · esquema inicial v1
-- Ejecutar completo en SQL Editor de un proyecto NUEVO de Supabase.
-- No modifica auth.users ni importa datos del sistema anterior.
begin;

do $$ begin
  if to_regclass('public.perfiles') is not null and to_regclass('public.roly_schema_version') is null then
    raise exception 'Este proyecto ya contiene perfiles de otro sistema. Usa un proyecto nuevo para Pollos Roly.';
  end if;
end $$;
create table if not exists public.roly_schema_version (version integer primary key, applied_at timestamptz not null default now());
insert into public.roly_schema_version(version) values (1) on conflict do nothing;
create schema if not exists roly_private;
revoke all on schema roly_private from public;
grant usage on schema roly_private to authenticated;

create table if not exists public.sucursales (
  id uuid primary key default gen_random_uuid(), nombre text not null check (length(trim(nombre)) between 1 and 100),
  direccion text not null default '', telefono text not null default '', activa boolean not null default true,
  created_at timestamptz not null default now()
);
create table if not exists public.perfiles (
  id uuid primary key references auth.users(id) on delete cascade,
  nombre text not null default '', apellido text not null default '', correo_contacto text not null default '', telefono text not null default '',
  rol text not null default 'Cajero' check (rol in ('Administrador','Supervisor','Cajero')),
  sucursal_id uuid references public.sucursales(id), activo boolean not null default false,
  created_at timestamptz not null default now()
);
create table if not exists public.personal_operativo (
  id uuid primary key default gen_random_uuid(), nombre text not null check(length(trim(nombre)) > 0),
  rol text not null check(rol in ('Administrador','Supervisor','Cajero','Cocinero','Mesero','Repartidor','Limpieza')),
  sucursal_id uuid not null references public.sucursales(id), telefono text not null default '', activo boolean not null default true,
  created_at timestamptz not null default now()
);
create table if not exists public.categorias (
  id uuid primary key default gen_random_uuid(), nombre text not null check(length(trim(nombre)) > 0), activa boolean not null default true
);
create unique index if not exists categorias_nombre_unico on public.categorias(lower(trim(nombre)));
create table if not exists public.productos (
  id uuid primary key default gen_random_uuid(), nombre text not null check(length(trim(nombre)) > 0),
  categoria_id uuid not null references public.categorias(id), precio numeric(12,2) not null check(precio > 0),
  activo boolean not null default true, created_at timestamptz not null default now()
);
create table if not exists public.insumos (
  id uuid primary key default gen_random_uuid(), nombre text not null check(length(trim(nombre)) > 0),
  sucursal_id uuid not null references public.sucursales(id), cantidad numeric(14,2) not null default 0 check(cantidad >= 0),
  minimo numeric(14,2) not null default 0 check(minimo >= 0), unidad text not null check(unidad in ('unidades','kg','litros','paquetes')),
  created_at timestamptz not null default now()
);
create unique index if not exists insumos_nombre_sucursal on public.insumos(sucursal_id,lower(trim(nombre)));
create table if not exists public.proveedores (
  id uuid primary key default gen_random_uuid(), nombre text not null check(length(trim(nombre)) > 0),
  contacto text not null default '', telefono text not null default '', nit text not null default '', activo boolean not null default true,
  created_at timestamptz not null default now()
);
create table if not exists public.compras (
  id uuid primary key default gen_random_uuid(), proveedor_id uuid not null references public.proveedores(id),
  insumo_id uuid not null references public.insumos(id), sucursal_id uuid not null references public.sucursales(id),
  cantidad numeric(14,2) not null check(cantidad > 0), costo_unitario numeric(12,2) not null check(costo_unitario > 0),
  total numeric(16,2) generated always as (cantidad * costo_unitario) stored,
  fecha date not null default (now() at time zone 'America/La_Paz')::date,
  observaciones text not null default '', estado text not null default 'Registrada' check(estado in ('Registrada','Anulada')),
  creado_por uuid not null references public.perfiles(id), created_at timestamptz not null default now()
);
create table if not exists public.stock_snacks (
  id uuid primary key default gen_random_uuid(), producto_id uuid not null references public.productos(id),
  sucursal_id uuid not null references public.sucursales(id), cantidad integer not null default 0 check(cantidad >= 0),
  minimo integer not null default 0 check(minimo >= 0), unique(producto_id,sucursal_id)
);
create table if not exists public.comunicados (
  id uuid primary key default gen_random_uuid(), titulo text not null check(length(trim(titulo)) > 0), mensaje text not null check(length(trim(mensaje)) > 0),
  sucursal_id uuid references public.sucursales(id), prioridad text not null default 'Normal' check(prioridad in ('Normal','Importante','Urgente')),
  publicado boolean not null default true, fecha date not null default (now() at time zone 'America/La_Paz')::date,
  created_at timestamptz not null default now()
);
create table if not exists public.pagos_personal (
  id uuid primary key default gen_random_uuid(), personal_id uuid not null references public.personal_operativo(id),
  sucursal_id uuid not null references public.sucursales(id), monto numeric(12,2) not null check(monto > 0),
  concepto text not null check(length(trim(concepto)) > 0), periodo date not null check(extract(day from periodo) = 1),
  fecha date not null default (now() at time zone 'America/La_Paz')::date,
  metodo text not null check(metodo in ('Efectivo','QR','Tarjeta')), estado text not null default 'Pendiente' check(estado in ('Pendiente','Pagado')),
  created_at timestamptz not null default now()
);
create table if not exists public.movimientos_financieros (
  id uuid primary key default gen_random_uuid(), tipo text not null check(tipo in ('Ingreso','Egreso')),
  sucursal_id uuid not null references public.sucursales(id), monto numeric(12,2) not null check(monto > 0),
  categoria text not null check(length(trim(categoria)) > 0), descripcion text not null check(length(trim(descripcion)) > 0),
  fecha date not null default (now() at time zone 'America/La_Paz')::date,
  metodo text not null check(metodo in ('Efectivo','QR','Tarjeta')), created_at timestamptz not null default now()
);
create table if not exists public.turnos_caja (
  id uuid primary key default gen_random_uuid(), sucursal_id uuid not null references public.sucursales(id),
  cajero_id uuid not null references public.perfiles(id), fondo_inicial numeric(12,2) not null check(fondo_inicial >= 0),
  apertura timestamptz not null default now(), cierre timestamptz,
  efectivo_esperado numeric(12,2), efectivo_contado numeric(12,2) check(efectivo_contado >= 0),
  diferencia numeric(12,2) generated always as (efectivo_contado - efectivo_esperado) stored,
  observaciones text not null default '', check(cierre is null or cierre >= apertura),
  check ((cierre is null and efectivo_contado is null and efectivo_esperado is null) or (cierre is not null and efectivo_contado is not null and efectivo_esperado is not null))
);
create unique index if not exists un_turno_abierto_por_sucursal on public.turnos_caja(sucursal_id) where cierre is null;
create table if not exists public.movimientos_caja (
  id uuid primary key default gen_random_uuid(), turno_id uuid not null references public.turnos_caja(id),
  tipo text not null check(tipo in ('Ingreso','Egreso')), monto numeric(12,2) not null check(monto > 0),
  concepto text not null check(length(trim(concepto)) > 0), created_at timestamptz not null default now()
);
create table if not exists public.pedidos (
  id uuid primary key default gen_random_uuid(), numero bigint generated always as identity unique,
  sucursal_id uuid not null references public.sucursales(id), turno_id uuid not null references public.turnos_caja(id),
  cliente text not null default 'Cliente de mostrador', estado text not null default 'En preparación' check(estado in ('En preparación','Listo para entregar','Entregado','Cancelado')),
  total numeric(12,2) not null check(total > 0), creado_por uuid not null references public.perfiles(id), created_at timestamptz not null default now()
);
create table if not exists public.detalle_pedido (
  id uuid primary key default gen_random_uuid(), pedido_id uuid not null references public.pedidos(id),
  producto_id uuid not null references public.productos(id), nombre_producto text not null,
  cantidad integer not null check(cantidad > 0), precio_unitario numeric(12,2) not null check(precio_unitario > 0),
  subtotal numeric(14,2) generated always as (cantidad * precio_unitario) stored,
  descuenta_stock boolean not null default false, unique(pedido_id,producto_id)
);
create table if not exists public.pagos_pedido (
  id uuid primary key default gen_random_uuid(), pedido_id uuid not null references public.pedidos(id),
  metodo text not null check(metodo in ('Efectivo','QR','Tarjeta')), monto numeric(12,2) not null check(monto > 0), unique(pedido_id,metodo)
);
create table if not exists public.configuracion (
  id integer primary key default 1 check(id = 1), nombre text not null default 'Pollos Roly', telefono text not null default '',
  direccion text not null default '', mensaje_ticket text not null default '¡Gracias por elegir Pollos Roly!',
  moneda text not null default 'BOB' check(moneda = 'BOB'), zona_horaria text not null default 'America/La_Paz' check(zona_horaria = 'America/La_Paz')
);

-- Índices para filtros, relaciones y políticas.
create index if not exists perfiles_sucursal_idx on public.perfiles(sucursal_id);
create index if not exists personal_sucursal_idx on public.personal_operativo(sucursal_id);
create index if not exists productos_categoria_idx on public.productos(categoria_id);
create index if not exists compras_sucursal_fecha_idx on public.compras(sucursal_id,fecha);
create index if not exists compras_insumo_idx on public.compras(insumo_id);
create index if not exists compras_proveedor_idx on public.compras(proveedor_id);
create index if not exists compras_creador_idx on public.compras(creado_por);
create index if not exists stock_snacks_sucursal_idx on public.stock_snacks(sucursal_id);
create index if not exists comunicados_sucursal_idx on public.comunicados(sucursal_id);
create index if not exists pagos_personal_sucursal_fecha_idx on public.pagos_personal(sucursal_id,fecha);
create index if not exists pagos_personal_personal_idx on public.pagos_personal(personal_id);
create index if not exists finanzas_sucursal_fecha_idx on public.movimientos_financieros(sucursal_id,fecha);
create index if not exists turnos_cajero_idx on public.turnos_caja(cajero_id);
create index if not exists movimientos_caja_turno_idx on public.movimientos_caja(turno_id);
create index if not exists pedidos_sucursal_fecha_idx on public.pedidos(sucursal_id,created_at);
create index if not exists pedidos_turno_idx on public.pedidos(turno_id);
create index if not exists pedidos_creador_idx on public.pedidos(creado_por);
create index if not exists detalle_producto_idx on public.detalle_pedido(producto_id);

-- No se confía en roles enviados en user_metadata.
create or replace function roly_private.es_admin() returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.perfiles where id = (select auth.uid()) and activo and rol = 'Administrador');
$$;
revoke all on function roly_private.es_admin() from public, anon;
grant execute on function roly_private.es_admin() to authenticated;
create or replace function roly_private.exigir_admin() returns void language plpgsql security definer set search_path = '' as $$
begin
  if not roly_private.es_admin() then raise exception 'Se requiere un administrador activo.' using errcode = '42501'; end if;
end $$;
revoke all on function roly_private.exigir_admin() from public, anon, authenticated;
create or replace function roly_private.crear_perfil() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.perfiles(id,nombre,correo_contacto) values(new.id,coalesce(new.raw_user_meta_data->>'nombre',''),coalesce(new.email,'')) on conflict(id) do nothing;
  return new;
end $$;
revoke all on function roly_private.crear_perfil() from public, anon, authenticated;
drop trigger if exists roly_nuevo_usuario on auth.users;
create trigger roly_nuevo_usuario after insert on auth.users for each row execute function roly_private.crear_perfil();
-- Admite usuarios creados antes de ejecutar este script; todos quedan sin acceso hasta activarlos.
insert into public.perfiles(id,nombre,correo_contacto) select id,coalesce(raw_user_meta_data->>'nombre',''),coalesce(email,'') from auth.users on conflict(id) do nothing;

create or replace function public.actualizar_mi_perfil(p_nombre text,p_apellido text,p_telefono text,p_correo_contacto text) returns void language plpgsql security definer set search_path = '' as $$
begin
  if not exists(select 1 from public.perfiles where id = auth.uid() and activo) then raise exception 'Perfil no autorizado.' using errcode = '42501'; end if;
  if length(trim(p_nombre)) = 0 then raise exception 'El nombre es obligatorio.'; end if;
  update public.perfiles set nombre=trim(p_nombre),apellido=coalesce(p_apellido,''),telefono=coalesce(p_telefono,''),correo_contacto=coalesce(p_correo_contacto,'') where id=auth.uid();
end $$;

create or replace function roly_private.validar_snack() returns trigger language plpgsql set search_path = '' as $$
begin
  if not exists(select 1 from public.productos p join public.categorias c on c.id=p.categoria_id where p.id=new.producto_id and lower(trim(c.nombre))='snacks') then
    raise exception 'El producto debe pertenecer a la categoría Snacks.';
  end if;
  return new;
end $$;
drop trigger if exists validar_stock_snack on public.stock_snacks;
create trigger validar_stock_snack before insert or update of producto_id on public.stock_snacks for each row execute function roly_private.validar_snack();

create or replace function roly_private.validar_pago_personal() returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op='UPDATE' and old.estado='Pagado' then raise exception 'Un pago realizado es inmutable. Registra un movimiento de corrección.'; end if;
  select sucursal_id into new.sucursal_id from public.personal_operativo where id=new.personal_id;
  if not found then raise exception 'Personal no encontrado.'; end if;
  return new;
end $$;
drop trigger if exists validar_pago_personal on public.pagos_personal;
create trigger validar_pago_personal before insert or update on public.pagos_personal for each row execute function roly_private.validar_pago_personal();

-- Operaciones financieras por RPC: una transacción y controles en el servidor.
create or replace function public.registrar_compra(p_proveedor uuid,p_insumo uuid,p_cantidad numeric,p_costo numeric,p_fecha date,p_observaciones text default '') returns uuid language plpgsql security definer set search_path = '' as $$
declare v_insumo public.insumos; v_id uuid;
begin
  perform roly_private.exigir_admin();
  if p_cantidad is null or p_cantidad<=0 or p_cantidad<>round(p_cantidad,2) or p_costo is null or p_costo<=0 or p_costo<>round(p_costo,2) then raise exception 'Cantidad y costo positivos, con hasta dos decimales.'; end if;
  if not exists(select 1 from public.proveedores where id=p_proveedor and activo) then raise exception 'Proveedor inactivo o inexistente.'; end if;
  select * into v_insumo from public.insumos where id=p_insumo for update;
  if not found then raise exception 'Insumo inexistente.'; end if;
  insert into public.compras(proveedor_id,insumo_id,sucursal_id,cantidad,costo_unitario,fecha,observaciones,creado_por)
  values(p_proveedor,p_insumo,v_insumo.sucursal_id,p_cantidad,p_costo,p_fecha,coalesce(p_observaciones,''),auth.uid()) returning id into v_id;
  update public.insumos set cantidad=cantidad+p_cantidad where id=p_insumo;
  return v_id;
end $$;
create or replace function public.anular_compra(p_compra uuid) returns void language plpgsql security definer set search_path = '' as $$
declare v_compra public.compras; v_stock numeric;
begin
  perform roly_private.exigir_admin();
  select * into v_compra from public.compras where id=p_compra for update;
  if not found or v_compra.estado<>'Registrada' then raise exception 'Compra inexistente o ya anulada.'; end if;
  select cantidad into v_stock from public.insumos where id=v_compra.insumo_id for update;
  if v_stock<v_compra.cantidad then raise exception 'Stock insuficiente para revertir la compra.'; end if;
  update public.insumos set cantidad=cantidad-v_compra.cantidad where id=v_compra.insumo_id;
  update public.compras set estado='Anulada' where id=p_compra;
end $$;

create or replace function roly_private.efectivo_turno(p_turno uuid) returns numeric language sql stable set search_path = '' as $$
  select t.fondo_inicial
    + coalesce((select sum(pp.monto) from public.pagos_pedido pp join public.pedidos p on p.id=pp.pedido_id where p.turno_id=t.id and p.estado<>'Cancelado' and pp.metodo='Efectivo'),0)
    + coalesce((select sum(case when m.tipo='Ingreso' then m.monto else -m.monto end) from public.movimientos_caja m where m.turno_id=t.id),0)
  from public.turnos_caja t where t.id=p_turno;
$$;
create or replace function public.abrir_turno(p_sucursal uuid,p_fondo numeric,p_observaciones text default '') returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  perform roly_private.exigir_admin();
  if p_fondo is null or p_fondo<0 or p_fondo<>round(p_fondo,2) then raise exception 'Fondo inicial inválido.'; end if;
  if not exists(select 1 from public.sucursales where id=p_sucursal and activa) then raise exception 'Sucursal inactiva o inexistente.'; end if;
  insert into public.turnos_caja(sucursal_id,cajero_id,fondo_inicial,observaciones) values(p_sucursal,auth.uid(),p_fondo,coalesce(p_observaciones,'')) returning id into v_id;
  return v_id;
end $$;
create or replace function public.registrar_movimiento_caja(p_turno uuid,p_tipo text,p_monto numeric,p_concepto text) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_turno public.turnos_caja; v_id uuid;
begin
  perform roly_private.exigir_admin();
  select * into v_turno from public.turnos_caja where id=p_turno for update;
  if not found or v_turno.cierre is not null then raise exception 'El turno no existe o está cerrado.'; end if;
  if p_monto is null or p_monto<=0 or p_monto<>round(p_monto,2) then raise exception 'Monto inválido.'; end if;
  if p_tipo='Egreso' and p_monto>roly_private.efectivo_turno(p_turno) then raise exception 'Efectivo insuficiente.'; end if;
  insert into public.movimientos_caja(turno_id,tipo,monto,concepto) values(p_turno,p_tipo,p_monto,p_concepto) returning id into v_id;
  return v_id;
end $$;
create or replace function public.cerrar_turno(p_turno uuid,p_contado numeric,p_observaciones text default '') returns void language plpgsql security definer set search_path = '' as $$
declare v_turno public.turnos_caja;
begin
  perform roly_private.exigir_admin();
  select * into v_turno from public.turnos_caja where id=p_turno for update;
  if not found or v_turno.cierre is not null then raise exception 'El turno no existe o está cerrado.'; end if;
  if p_contado is null or p_contado<0 or p_contado<>round(p_contado,2) then raise exception 'Efectivo contado inválido.'; end if;
  update public.turnos_caja set cierre=clock_timestamp(),efectivo_contado=p_contado,efectivo_esperado=roly_private.efectivo_turno(p_turno),observaciones=coalesce(p_observaciones,'') where id=p_turno;
end $$;

-- Preparado para el futuro POS; no hay ventas ficticias en esta base.
-- Items: [{"producto_id":"uuid","cantidad":2}]; pagos: [{"metodo":"Efectivo","monto":40}].
create or replace function public.registrar_pedido(p_turno uuid,p_cliente text,p_items jsonb,p_pagos jsonb) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_turno public.turnos_caja; v_producto record; v_item record; v_id uuid; v_total numeric:=0; v_suma numeric; v_stock integer; v_snack boolean;
begin
  perform roly_private.exigir_admin();
  select * into v_turno from public.turnos_caja where id=p_turno for update;
  if not found or v_turno.cierre is not null then raise exception 'Abre un turno para registrar pedidos.'; end if;
  if p_items is null or jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)=0 then raise exception 'El pedido necesita productos.'; end if;
  if p_pagos is null or jsonb_typeof(p_pagos)<>'array' or jsonb_array_length(p_pagos)=0 then raise exception 'El pedido necesita pagos.'; end if;
  if exists(select 1 from jsonb_to_recordset(p_items) as x(producto_id uuid,cantidad numeric) where producto_id is null or cantidad is null or cantidad<=0 or cantidad<>trunc(cantidad) or cantidad>100000) then raise exception 'Cantidad de producto inválida.'; end if;
  if (select count(*) from jsonb_to_recordset(p_items) as x(producto_id uuid))<>(select count(distinct producto_id) from jsonb_to_recordset(p_items) as x(producto_id uuid)) then raise exception 'Agrupa los productos repetidos en una sola línea.'; end if;
  for v_item in select * from jsonb_to_recordset(p_items) as x(producto_id uuid,cantidad integer) order by producto_id loop
    select p.precio,p.activo,c.activa into v_producto from public.productos p join public.categorias c on c.id=p.categoria_id where p.id=v_item.producto_id for share of p,c;
    if not found or not v_producto.activo or not v_producto.activa then raise exception 'Producto o categoría no disponible.'; end if;
    v_total:=v_total+v_producto.precio*v_item.cantidad;
  end loop;
  if exists(select 1 from jsonb_to_recordset(p_pagos) as x(metodo text,monto numeric) where metodo is null or metodo not in ('Efectivo','QR','Tarjeta') or monto is null or monto<=0 or monto<>round(monto,2)) then raise exception 'Método o monto de pago inválido.'; end if;
  select sum(monto) into v_suma from jsonb_to_recordset(p_pagos) as x(metodo text,monto numeric);
  if v_suma<>v_total then raise exception 'Los pagos deben sumar exactamente el total del pedido.'; end if;
  insert into public.pedidos(sucursal_id,turno_id,cliente,total,creado_por) values(v_turno.sucursal_id,p_turno,coalesce(nullif(trim(p_cliente),''),'Cliente de mostrador'),v_total,auth.uid()) returning id into v_id;
  for v_item in select * from jsonb_to_recordset(p_items) as x(producto_id uuid,cantidad integer) order by producto_id loop
    select p.nombre,p.precio,lower(trim(c.nombre))='snacks' as snack into v_producto from public.productos p join public.categorias c on c.id=p.categoria_id where p.id=v_item.producto_id;
    v_snack:=v_producto.snack;
    if v_snack then
      select cantidad into v_stock from public.stock_snacks where producto_id=v_item.producto_id and sucursal_id=v_turno.sucursal_id for update;
      if not found or v_stock<v_item.cantidad then raise exception 'Stock insuficiente para %.',v_producto.nombre; end if;
      update public.stock_snacks set cantidad=cantidad-v_item.cantidad where producto_id=v_item.producto_id and sucursal_id=v_turno.sucursal_id;
    end if;
    insert into public.detalle_pedido(pedido_id,producto_id,nombre_producto,cantidad,precio_unitario,descuenta_stock) values(v_id,v_item.producto_id,v_producto.nombre,v_item.cantidad,v_producto.precio,v_snack);
  end loop;
  insert into public.pagos_pedido(pedido_id,metodo,monto) select v_id,metodo,sum(monto) from jsonb_to_recordset(p_pagos) as x(metodo text,monto numeric) group by metodo;
  return v_id;
end $$;
create or replace function public.cambiar_estado_pedido(p_pedido uuid,p_estado text) returns void language plpgsql security definer set search_path = '' as $$
declare v_pedido public.pedidos; v_cierre timestamptz; v_linea record; v_turno uuid;
begin
  perform roly_private.exigir_admin();
  select turno_id into v_turno from public.pedidos where id=p_pedido;
  if not found then raise exception 'Pedido inexistente.'; end if;
  -- Mismo orden de locks que registrar_pedido/cerrar_turno: primero turno.
  select cierre into v_cierre from public.turnos_caja where id=v_turno for update;
  select * into v_pedido from public.pedidos where id=p_pedido for update;
  if v_pedido.estado='Cancelado' then raise exception 'Un pedido cancelado no puede modificarse.'; end if;
  if p_estado not in ('En preparación','Listo para entregar','Entregado','Cancelado') or p_estado is null then raise exception 'Estado inválido.'; end if;
  if p_estado='Cancelado' then
    if v_cierre is not null then raise exception 'No se puede cancelar una venta de un turno cerrado.'; end if;
    for v_linea in select * from public.detalle_pedido where pedido_id=p_pedido and descuenta_stock order by producto_id loop
      update public.stock_snacks set cantidad=cantidad+v_linea.cantidad where producto_id=v_linea.producto_id and sucursal_id=v_pedido.sucursal_id;
    end loop;
  end if;
  update public.pedidos set estado=p_estado where id=p_pedido;
end $$;

-- RLS en todas las tablas. Solo el administrador activo gestiona el negocio.
-- Supervisor y Cajero quedan sin acceso operativo hasta implementar sus módulos.
do $$ declare t text; begin
  foreach t in array array['sucursales','perfiles','personal_operativo','categorias','productos','insumos','proveedores','compras','stock_snacks','comunicados','pagos_personal','movimientos_financieros','turnos_caja','movimientos_caja','pedidos','detalle_pedido','pagos_pedido','configuracion','roly_schema_version'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('revoke all on table public.%I from anon, authenticated',t);
    execute format('drop policy if exists roly_admin on public.%I',t);
    execute format('create policy roly_admin on public.%I for all to authenticated using ((select roly_private.es_admin())) with check ((select roly_private.es_admin()))',t);
    if t<>'roly_schema_version' then execute format('grant select on public.%I to authenticated',t); end if;
  end loop;
end $$;
drop policy if exists roly_ver_mi_perfil on public.perfiles;
create policy roly_ver_mi_perfil on public.perfiles for select to authenticated using(id=(select auth.uid()));
grant insert,update on public.sucursales,public.personal_operativo,public.categorias,public.productos,public.insumos,public.proveedores,public.stock_snacks,public.comunicados,public.pagos_personal,public.configuracion to authenticated;
grant update on public.perfiles to authenticated;
grant insert on public.movimientos_financieros to authenticated;
-- Sin borrados físicos ni escrituras directas a compras, pedidos o caja.

-- Vistas invocadoras: respetan RLS y no duplican importes por joins de detalle.
create or replace view public.resumen_ventas with (security_invoker=true) as
  select sucursal_id,(created_at at time zone 'America/La_Paz')::date as fecha,count(*) as pedidos,sum(total) as total
  from public.pedidos where estado<>'Cancelado' group by sucursal_id,(created_at at time zone 'America/La_Paz')::date;
create or replace view public.resumen_pagos with (security_invoker=true) as
  select p.sucursal_id,(p.created_at at time zone 'America/La_Paz')::date as fecha,pp.metodo,sum(pp.monto) as total
  from public.pagos_pedido pp join public.pedidos p on p.id=pp.pedido_id where p.estado<>'Cancelado'
  group by p.sucursal_id,(p.created_at at time zone 'America/La_Paz')::date,pp.metodo;
create or replace view public.resumen_productos with (security_invoker=true) as
  select p.sucursal_id,(p.created_at at time zone 'America/La_Paz')::date as fecha,d.producto_id,d.nombre_producto,sum(d.cantidad) as cantidad,sum(d.subtotal) as recaudado
  from public.detalle_pedido d join public.pedidos p on p.id=d.pedido_id where p.estado<>'Cancelado'
  group by p.sucursal_id,(p.created_at at time zone 'America/La_Paz')::date,d.producto_id,d.nombre_producto;
create or replace view public.alertas_stock with (security_invoker=true) as
  select 'Insumo'::text as tipo,id as referencia_id,sucursal_id,nombre,cantidad,minimo,unidad from public.insumos where cantidad<=minimo
  union all
  select 'Snack',s.id,s.sucursal_id,p.nombre,s.cantidad,s.minimo,'unidades' from public.stock_snacks s join public.productos p on p.id=s.producto_id where s.cantidad<=s.minimo;
revoke all on public.resumen_ventas,public.resumen_pagos,public.resumen_productos,public.alertas_stock from anon;
grant select on public.resumen_ventas,public.resumen_pagos,public.resumen_productos,public.alertas_stock to authenticated;

-- Las funciones SECURITY DEFINER no quedan públicas.
do $$ declare f record; begin
  for f in select p.oid::regprocedure as signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where (n.nspname='public' and p.proname in ('actualizar_mi_perfil','registrar_compra','anular_compra','abrir_turno','registrar_movimiento_caja','cerrar_turno','registrar_pedido','cambiar_estado_pedido'))
      or (n.nspname='roly_private' and p.proname<>'es_admin') loop
    execute format('revoke all on function %s from public, anon, authenticated',f.signature);
    if f.signature::text not like 'roly_private.%' then execute format('grant execute on function %s to authenticated',f.signature); end if;
  end loop;
end $$;

insert into public.configuracion(id) values(1) on conflict do nothing;
insert into public.categorias(nombre) values('Pollos'),('Acompañamientos'),('Bebidas'),('Snacks') on conflict do nothing;
-- No se crean sucursales, personal, ventas, compras ni stock ficticios.
commit;
