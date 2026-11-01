-- Operaciones seguras para editar y anular pedidos desde el punto de venta.
-- Requiere database/01_pollos_roly.sql y database/11_cajero.sql.
begin;

create or replace function public.actualizar_pedido_cajero(
  p_pedido uuid, p_cliente text, p_items jsonb, p_metodo text
) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_turno public.turnos_caja;
  v_pedido public.pedidos;
  v_turno_id uuid;
  v_producto record;
  v_item record;
  v_total numeric := 0;
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
  if exists(select 1 from jsonb_to_recordset(p_items) as x(producto_id uuid,cantidad numeric)
    where producto_id is null or cantidad is null or cantidad<=0 or cantidad<>trunc(cantidad) or cantidad>100000) then
    raise exception 'Cantidad de producto inválida.';
  end if;
  if (select count(*) from jsonb_to_recordset(p_items) as x(producto_id uuid)) <>
     (select count(distinct producto_id) from jsonb_to_recordset(p_items) as x(producto_id uuid)) then
    raise exception 'Agrupa los productos repetidos en una sola línea.';
  end if;
  if p_metodo not in ('Efectivo','QR','Tarjeta') or p_metodo is null then raise exception 'Método de pago inválido.'; end if;

  -- Libera las unidades de snacks de la versión anterior antes de validar la nueva.
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

  delete from public.detalle_pedido where pedido_id=p_pedido;
  for v_item in select * from jsonb_to_recordset(p_items) as x(producto_id uuid,cantidad integer) order by producto_id loop
    select (case when p.en_oferta and p.precio_oferta is not null then p.precio_oferta else p.precio end) as precio,
      p.nombre,lower(trim(c.nombre))='snacks' as snack into v_producto
      from public.productos p join public.categorias c on c.id=p.categoria_id where p.id=v_item.producto_id;
    insert into public.detalle_pedido(pedido_id,producto_id,nombre_producto,cantidad,precio_unitario,descuenta_stock)
      values(p_pedido,v_item.producto_id,v_producto.nombre,v_item.cantidad,v_producto.precio,v_producto.snack);
  end loop;
  delete from public.pagos_pedido where pedido_id=p_pedido;
  insert into public.pagos_pedido(pedido_id,metodo,monto) values(p_pedido,p_metodo,v_total);
  update public.pedidos set cliente=coalesce(nullif(trim(p_cliente),''),'Cliente de mostrador'),total=v_total where id=p_pedido;
end $$;

create or replace function public.anular_pedido_cajero(p_pedido uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_turno_id uuid;
  v_turno public.turnos_caja;
  v_pedido public.pedidos;
  v_linea record;
  v_cajero boolean := roly_private.es_cajero();
begin
  if not roly_private.es_admin() and not v_cajero then
    raise exception 'Se requiere un cajero o administrador activo.' using errcode='42501';
  end if;
  select turno_id into v_turno_id from public.pedidos where id=p_pedido;
  if not found then raise exception 'El pedido no existe.'; end if;
  select * into v_turno from public.turnos_caja where id=v_turno_id for update;
  select * into v_pedido from public.pedidos where id=p_pedido for update;
  if v_pedido.estado='Cancelado' then raise exception 'El pedido ya está anulado.'; end if;
  if v_turno.cierre is not null then raise exception 'No se puede anular un pedido de un turno cerrado.'; end if;
  if v_cajero and (v_turno.cajero_id<>auth.uid() or v_turno.sucursal_id<>roly_private.cajero_sucursal()) then
    raise exception 'Solo puedes anular pedidos de tu turno.' using errcode='42501';
  end if;
  for v_linea in select producto_id,cantidad from public.detalle_pedido
    where pedido_id=p_pedido and descuenta_stock order by producto_id loop
    update public.stock_snacks set cantidad=cantidad+v_linea.cantidad
      where producto_id=v_linea.producto_id and sucursal_id=v_pedido.sucursal_id;
  end loop;
  update public.pedidos set estado='Cancelado' where id=p_pedido;
end $$;

revoke all on function public.actualizar_pedido_cajero(uuid,text,jsonb,text) from public,anon;
revoke all on function public.anular_pedido_cajero(uuid) from public,anon;
grant execute on function public.actualizar_pedido_cajero(uuid,text,jsonb,text) to authenticated;
grant execute on function public.anular_pedido_cajero(uuid) to authenticated;
notify pgrst,'reload schema';
commit;
