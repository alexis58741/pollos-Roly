-- Personalización de cada porción de pollo en ventas del cajero.
-- Ejecutar después de 11_cajero.sql, 12_cajero_pedidos.sql y 13_cajero_pagos_mixtos.sql.
begin;

alter table public.detalle_pedido
  add column if not exists personalizacion jsonb not null default '[]'::jsonb;

do $$ begin
  if not exists (
    select 1 from pg_constraint
    where conrelid='public.detalle_pedido'::regclass and conname='detalle_pedido_personalizacion_array'
  ) then
    alter table public.detalle_pedido add constraint detalle_pedido_personalizacion_array
      check (jsonb_typeof(personalizacion)='array');
  end if;
end $$;

create or replace function roly_private.validar_personalizacion_pollo(
  p_producto uuid, p_cantidad integer, p_personalizacion jsonb
) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_producto record;
  v_eleccion jsonb;
  v_acompanamientos jsonb;
  v_presa text;
  v_preparacion text;
begin
  if p_personalizacion is null or jsonb_typeof(p_personalizacion)<>'array' then
    raise exception 'La personalización del producto debe ser una lista.';
  end if;
  select requiere_seleccion,tipo_presas into v_producto
    from public.productos where id=p_producto;
  if not found then raise exception 'El producto no existe.'; end if;
  if not v_producto.requiere_seleccion then
    if jsonb_array_length(p_personalizacion)>0 then
      raise exception 'Este producto no admite personalización de pollo.';
    end if;
    return;
  end if;
  if jsonb_array_length(p_personalizacion)<>p_cantidad then
    raise exception 'Configura la presa, preparación y acompañamientos de cada porción.';
  end if;
  for v_eleccion in select value from jsonb_array_elements(p_personalizacion) as e(value) loop
    if jsonb_typeof(v_eleccion)<>'object' then raise exception 'Una personalización no es válida.'; end if;
    v_presa:=v_eleccion->>'piece';
    v_preparacion:=v_eleccion->>'preparation';
    v_acompanamientos:=v_eleccion->'accompaniments';
    if v_presa is null or v_presa not in ('Pechuga','Ala','Pierna','Contra') then raise exception 'Selecciona una presa válida.'; end if;
    if (v_producto.tipo_presas='breast_wing' and v_presa not in ('Pechuga','Ala')) or
       (v_producto.tipo_presas='leg_thigh' and v_presa not in ('Pierna','Contra')) then
      raise exception 'La presa elegida no está disponible para este producto.';
    end if;
    if v_preparacion is null or v_preparacion not in ('Brasa','Broaster','Espiedo') then raise exception 'Selecciona Brasa, Broaster o Espiedo.'; end if;
    if v_acompanamientos is null or jsonb_typeof(v_acompanamientos)<>'array' then
      raise exception 'Selecciona los acompañamientos de la porción.';
    end if;
    if exists(select 1 from jsonb_array_elements_text(v_acompanamientos) a(value)
      where value not in ('Arroz','Fideo','Papa')) then raise exception 'Hay un acompañamiento no válido.'; end if;
    if (select count(*) from jsonb_array_elements_text(v_acompanamientos)) <>
       (select count(distinct value) from jsonb_array_elements_text(v_acompanamientos)) then
      raise exception 'No repitas acompañamientos.';
    end if;
  end loop;
end $$;

revoke all on function roly_private.validar_personalizacion_pollo(uuid,integer,jsonb) from public,anon,authenticated;

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
  if p_items is null or jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)=0 or jsonb_array_length(p_items)>100 then raise exception 'El pedido necesita productos.'; end if;
  if p_pagos is null or jsonb_typeof(p_pagos)<>'array' or jsonb_array_length(p_pagos)=0 or jsonb_array_length(p_pagos)>3 then raise exception 'El pedido necesita pagos.'; end if;
  if exists(select 1 from jsonb_to_recordset(p_items) as x(producto_id uuid,cantidad numeric) where producto_id is null or cantidad is null or cantidad<=0 or cantidad<>trunc(cantidad) or cantidad>100000) then raise exception 'Cantidad de producto inválida.'; end if;
  if (select count(*) from jsonb_to_recordset(p_items) as x(producto_id uuid))<>(select count(distinct producto_id) from jsonb_to_recordset(p_items) as x(producto_id uuid)) then raise exception 'Agrupa los productos repetidos en una sola línea.'; end if;
  for v_item in select * from jsonb_to_recordset(p_items) as x(producto_id uuid,cantidad integer,personalizacion jsonb) order by producto_id loop
    select (case when p.en_oferta and p.precio_oferta is not null then p.precio_oferta else p.precio end) as precio,
      p.activo,c.activa into v_producto from public.productos p join public.categorias c on c.id=p.categoria_id
      where p.id=v_item.producto_id for share of p,c;
    if not found or not v_producto.activo or not v_producto.activa then raise exception 'Producto o categoría no disponible.'; end if;
    perform roly_private.validar_personalizacion_pollo(v_item.producto_id,v_item.cantidad,coalesce(v_item.personalizacion,'[]'::jsonb));
    v_total:=v_total+v_producto.precio*v_item.cantidad;
  end loop;
  if exists(select 1 from jsonb_to_recordset(p_pagos) as x(metodo text,monto numeric) where metodo is null or metodo not in ('Efectivo','QR','Tarjeta') or monto is null or monto<=0 or monto<>round(monto,2)) then raise exception 'Método o monto de pago inválido.'; end if;
  if (select count(*) from jsonb_to_recordset(p_pagos) as x(metodo text))<>(select count(distinct metodo) from jsonb_to_recordset(p_pagos) as x(metodo text)) then raise exception 'No repitas un método de pago.'; end if;
  select sum(monto) into v_suma from jsonb_to_recordset(p_pagos) as x(metodo text,monto numeric);
  if v_suma<>v_total then raise exception 'Los pagos deben sumar exactamente el total del pedido.'; end if;
  insert into public.pedidos(sucursal_id,turno_id,cliente,total,creado_por)
    values(v_turno.sucursal_id,p_turno,coalesce(nullif(trim(p_cliente),''),'Cliente de mostrador'),v_total,auth.uid()) returning id into v_id;
  for v_item in select * from jsonb_to_recordset(p_items) as x(producto_id uuid,cantidad integer,personalizacion jsonb) order by producto_id loop
    select p.nombre,(case when p.en_oferta and p.precio_oferta is not null then p.precio_oferta else p.precio end) as precio,
      lower(trim(c.nombre))='snacks' as snack into v_producto
      from public.productos p join public.categorias c on c.id=p.categoria_id where p.id=v_item.producto_id;
    v_snack:=v_producto.snack;
    if v_snack then
      select cantidad into v_stock from public.stock_snacks where producto_id=v_item.producto_id and sucursal_id=v_turno.sucursal_id for update;
      if not found or v_stock<v_item.cantidad then raise exception 'Stock insuficiente para %.',v_producto.nombre; end if;
      update public.stock_snacks set cantidad=cantidad-v_item.cantidad where producto_id=v_item.producto_id and sucursal_id=v_turno.sucursal_id;
    end if;
    insert into public.detalle_pedido(pedido_id,producto_id,nombre_producto,cantidad,precio_unitario,descuenta_stock,personalizacion)
      values(v_id,v_item.producto_id,v_producto.nombre,v_item.cantidad,v_producto.precio,v_snack,coalesce(v_item.personalizacion,'[]'::jsonb));
  end loop;
  insert into public.pagos_pedido(pedido_id,metodo,monto)
    select v_id,metodo,sum(monto) from jsonb_to_recordset(p_pagos) as x(metodo text,monto numeric) group by metodo;
  return v_id;
end $$;

create or replace function public.actualizar_pedido_cajero_mixto(
  p_pedido uuid, p_cliente text, p_items jsonb, p_pagos jsonb
) returns void language plpgsql security definer set search_path = '' as $$
declare
  v_turno public.turnos_caja; v_pedido public.pedidos; v_turno_id uuid;
  v_producto record; v_item record; v_total numeric:=0; v_suma numeric:=0; v_stock integer;
  v_cajero boolean:=roly_private.es_cajero();
begin
  if not roly_private.es_admin() and not v_cajero then raise exception 'Se requiere un cajero o administrador activo.' using errcode='42501'; end if;
  select turno_id into v_turno_id from public.pedidos where id=p_pedido;
  if not found then raise exception 'El pedido no existe.'; end if;
  select * into v_turno from public.turnos_caja where id=v_turno_id for update;
  if not found or v_turno.cierre is not null then raise exception 'No se puede editar un pedido de un turno cerrado.'; end if;
  if v_cajero and (v_turno.cajero_id<>auth.uid() or v_turno.sucursal_id<>roly_private.cajero_sucursal()) then raise exception 'Solo puedes editar pedidos de tu turno.' using errcode='42501'; end if;
  select * into v_pedido from public.pedidos where id=p_pedido for update;
  if v_pedido.estado='Cancelado' then raise exception 'Un pedido anulado no se puede editar.'; end if;
  if p_items is null or jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)=0 or jsonb_array_length(p_items)>100 then raise exception 'El pedido necesita productos.'; end if;
  if p_pagos is null or jsonb_typeof(p_pagos)<>'array' or jsonb_array_length(p_pagos)=0 or jsonb_array_length(p_pagos)>3 then raise exception 'El pedido necesita uno o más métodos de pago.'; end if;
  if exists(select 1 from jsonb_to_recordset(p_items) as x(producto_id uuid,cantidad numeric) where producto_id is null or cantidad is null or cantidad<=0 or cantidad<>trunc(cantidad) or cantidad>100000) then raise exception 'Cantidad de producto inválida.'; end if;
  if (select count(*) from jsonb_to_recordset(p_items) as x(producto_id uuid))<>(select count(distinct producto_id) from jsonb_to_recordset(p_items) as x(producto_id uuid)) then raise exception 'Agrupa los productos repetidos en una sola línea.'; end if;
  if exists(select 1 from jsonb_to_recordset(p_pagos) as x(metodo text,monto numeric) where metodo is null or metodo not in ('Efectivo','QR','Tarjeta') or monto is null or monto<=0 or monto<>round(monto,2)) then raise exception 'Método o monto de pago inválido.'; end if;
  if (select count(*) from jsonb_to_recordset(p_pagos) as x(metodo text))<>(select count(distinct metodo) from jsonb_to_recordset(p_pagos) as x(metodo text)) then raise exception 'No repitas un método de pago; combina sus montos.'; end if;
  for v_item in select * from jsonb_to_recordset(p_items) as x(producto_id uuid,cantidad integer,personalizacion jsonb) order by producto_id loop
    select (case when p.en_oferta and p.precio_oferta is not null then p.precio_oferta else p.precio end) as precio,
      p.nombre,p.activo,c.activa,lower(trim(c.nombre))='snacks' as snack into v_producto
      from public.productos p join public.categorias c on c.id=p.categoria_id where p.id=v_item.producto_id for share of p,c;
    if not found or not v_producto.activo or not v_producto.activa then raise exception 'Producto o categoría no disponible.'; end if;
    perform roly_private.validar_personalizacion_pollo(v_item.producto_id,v_item.cantidad,coalesce(v_item.personalizacion,'[]'::jsonb));
    v_total:=v_total+v_producto.precio*v_item.cantidad;
  end loop;
  for v_item in select producto_id,cantidad from public.detalle_pedido where pedido_id=p_pedido and descuenta_stock order by producto_id loop
    update public.stock_snacks set cantidad=cantidad+v_item.cantidad where producto_id=v_item.producto_id and sucursal_id=v_pedido.sucursal_id;
  end loop;
  for v_item in select * from jsonb_to_recordset(p_items) as x(producto_id uuid,cantidad integer) order by producto_id loop
    select lower(trim(c.nombre))='snacks' as snack into v_producto from public.productos p join public.categorias c on c.id=p.categoria_id where p.id=v_item.producto_id;
    if v_producto.snack then
      select cantidad into v_stock from public.stock_snacks where producto_id=v_item.producto_id and sucursal_id=v_pedido.sucursal_id for update;
      if not found or v_stock<v_item.cantidad then raise exception 'Stock insuficiente para el producto.'; end if;
      update public.stock_snacks set cantidad=cantidad-v_item.cantidad where producto_id=v_item.producto_id and sucursal_id=v_pedido.sucursal_id;
    end if;
  end loop;
  if v_total<=0 then raise exception 'El total del pedido debe ser mayor a cero.'; end if;
  select sum(monto) into v_suma from jsonb_to_recordset(p_pagos) as x(metodo text,monto numeric);
  if v_suma<>v_total then raise exception 'Los pagos deben sumar exactamente el total del pedido.'; end if;
  delete from public.detalle_pedido where pedido_id=p_pedido;
  for v_item in select * from jsonb_to_recordset(p_items) as x(producto_id uuid,cantidad integer,personalizacion jsonb) order by producto_id loop
    select (case when p.en_oferta and p.precio_oferta is not null then p.precio_oferta else p.precio end) as precio,
      p.nombre,lower(trim(c.nombre))='snacks' as snack into v_producto
      from public.productos p join public.categorias c on c.id=p.categoria_id where p.id=v_item.producto_id;
    insert into public.detalle_pedido(pedido_id,producto_id,nombre_producto,cantidad,precio_unitario,descuenta_stock,personalizacion)
      values(p_pedido,v_item.producto_id,v_producto.nombre,v_item.cantidad,v_producto.precio,v_producto.snack,coalesce(v_item.personalizacion,'[]'::jsonb));
  end loop;
  delete from public.pagos_pedido where pedido_id=p_pedido;
  insert into public.pagos_pedido(pedido_id,metodo,monto)
    select p_pedido,metodo,sum(monto) from jsonb_to_recordset(p_pagos) as x(metodo text,monto numeric) group by metodo;
  update public.pedidos set cliente=coalesce(nullif(trim(p_cliente),''),'Cliente de mostrador'),total=v_total where id=p_pedido;
end $$;

do $$ declare f text; begin
  foreach f in array array['public.registrar_pedido(uuid,text,jsonb,jsonb)','public.actualizar_pedido_cajero_mixto(uuid,text,jsonb,jsonb)'] loop
    execute format('revoke all on function %s from public,anon',f);
    execute format('grant execute on function %s to authenticated',f);
  end loop;
end $$;

insert into public.roly_schema_version(version) values(14) on conflict do nothing;
notify pgrst,'reload schema';
commit;
