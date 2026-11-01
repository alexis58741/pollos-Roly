-- Permite conservar o cambiar pagos combinados al editar un pedido del turno.
-- Requiere database/11_cajero.sql y database/12_cajero_pedidos.sql.
begin;

create or replace function public.actualizar_pedido_cajero_mixto(
  p_pedido uuid, p_cliente text, p_items jsonb, p_pagos jsonb
) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_turno public.turnos_caja;
  v_pedido public.pedidos;
  v_turno_id uuid;
  v_producto record;
  v_item record;
  v_total numeric := 0;
  v_suma numeric := 0;
  v_stock integer;
  v_cajero boolean := roly_private.es_cajero();
begin
  if not roly_private.es_admin() and not v_cajero then
    raise exception 'Se requiere un cajero o administrador activo.' using errcode='42501';
  end if;
  select turno_id into v_turno_id from public.pedidos where id=p_pedido;
  if not found then raise exception 'El pedido no existe.'; end if;
  select * into v_turno from public.turnos_caja where id=v_turno_id for update;
  if not found or v_turno.cierre is not null then raise exception 'No se puede editar un pedido de un turno cerrado.'; end if;
  if v_cajero and (v_turno.cajero_id<>auth.uid() or v_turno.sucursal_id<>roly_private.cajero_sucursal()) then
    raise exception 'Solo puedes editar pedidos de tu turno.' using errcode='42501';
  end if;
  select * into v_pedido from public.pedidos where id=p_pedido for update;
  if v_pedido.estado='Cancelado' then raise exception 'Un pedido anulado no se puede editar.'; end if;
  if p_items is null or jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)=0 or jsonb_array_length(p_items)>100 then
    raise exception 'El pedido necesita productos.';
  end if;
  if p_pagos is null or jsonb_typeof(p_pagos)<>'array' or jsonb_array_length(p_pagos)=0 or jsonb_array_length(p_pagos)>3 then
    raise exception 'El pedido necesita uno o más métodos de pago.';
  end if;
  if exists(select 1 from jsonb_to_recordset(p_items) as x(producto_id uuid,cantidad numeric)
    where producto_id is null or cantidad is null or cantidad<=0 or cantidad<>trunc(cantidad) or cantidad>100000) then
    raise exception 'Cantidad de producto inválida.';
  end if;
  if (select count(*) from jsonb_to_recordset(p_items) as x(producto_id uuid)) <>
     (select count(distinct producto_id) from jsonb_to_recordset(p_items) as x(producto_id uuid)) then
    raise exception 'Agrupa los productos repetidos en una sola línea.';
  end if;
  if exists(select 1 from jsonb_to_recordset(p_pagos) as x(metodo text,monto numeric)
    where metodo is null or metodo not in ('Efectivo','QR','Tarjeta') or monto is null or monto<=0 or monto<>round(monto,2)) then
    raise exception 'Método o monto de pago inválido.';
  end if;
  if (select count(*) from jsonb_to_recordset(p_pagos) as x(metodo text)) <>
     (select count(distinct metodo) from jsonb_to_recordset(p_pagos) as x(metodo text)) then
    raise exception 'No repitas un método de pago; combina sus montos.';
  end if;

  -- Libera el stock de snacks del pedido anterior antes de revisar la nueva selección.
  for v_item in select producto_id,cantidad from public.detalle_pedido
    where pedido_id=p_pedido and descuenta_stock order by producto_id loop
    update public.stock_snacks set cantidad=cantidad+v_item.cantidad
      where producto_id=v_item.producto_id and sucursal_id=v_pedido.sucursal_id;
  end loop;

  for v_item in select * from jsonb_to_recordset(p_items) as x(producto_id uuid,cantidad integer) order by producto_id loop
    select (case when p.en_oferta and p.precio_oferta is not null then p.precio_oferta else p.precio end) as precio,
      p.nombre,p.activo,c.activa,lower(trim(c.nombre))='snacks' as snack
      into v_producto from public.productos p join public.categorias c on c.id=p.categoria_id
      where p.id=v_item.producto_id for share of p,c;
    if not found or not v_producto.activo or not v_producto.activa then raise exception 'Producto o categoría no disponible.'; end if;
    v_total:=v_total+v_producto.precio*v_item.cantidad;
    if v_producto.snack then
      select cantidad into v_stock from public.stock_snacks
        where producto_id=v_item.producto_id and sucursal_id=v_pedido.sucursal_id for update;
      if not found or v_stock<v_item.cantidad then raise exception 'Stock insuficiente para %.',v_producto.nombre; end if;
      update public.stock_snacks set cantidad=cantidad-v_item.cantidad
        where producto_id=v_item.producto_id and sucursal_id=v_pedido.sucursal_id;
    end if;
  end loop;
  if v_total<=0 then raise exception 'El total del pedido debe ser mayor a cero.'; end if;
  select sum(monto) into v_suma from jsonb_to_recordset(p_pagos) as x(metodo text,monto numeric);
  if v_suma<>v_total then raise exception 'Los pagos deben sumar exactamente el total del pedido.'; end if;

  delete from public.detalle_pedido where pedido_id=p_pedido;
  for v_item in select * from jsonb_to_recordset(p_items) as x(producto_id uuid,cantidad integer) order by producto_id loop
    select (case when p.en_oferta and p.precio_oferta is not null then p.precio_oferta else p.precio end) as precio,
      p.nombre,lower(trim(c.nombre))='snacks' as snack into v_producto
      from public.productos p join public.categorias c on c.id=p.categoria_id where p.id=v_item.producto_id;
    insert into public.detalle_pedido(pedido_id,producto_id,nombre_producto,cantidad,precio_unitario,descuenta_stock)
      values(p_pedido,v_item.producto_id,v_producto.nombre,v_item.cantidad,v_producto.precio,v_producto.snack);
  end loop;
  delete from public.pagos_pedido where pedido_id=p_pedido;
  insert into public.pagos_pedido(pedido_id,metodo,monto)
    select p_pedido,metodo,sum(monto) from jsonb_to_recordset(p_pagos) as x(metodo text,monto numeric) group by metodo;
  update public.pedidos set cliente=coalesce(nullif(trim(p_cliente),''),'Cliente de mostrador'),total=v_total where id=p_pedido;
end $$;

revoke all on function public.actualizar_pedido_cajero_mixto(uuid,text,jsonb,jsonb) from public,anon;
grant execute on function public.actualizar_pedido_cajero_mixto(uuid,text,jsonb,jsonb) to authenticated;
notify pgrst,'reload schema';
commit;
