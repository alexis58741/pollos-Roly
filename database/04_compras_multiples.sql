-- POLLOS ROLY · Compras con varios insumos, comprobante y proveedor opcional.
-- Ejecutar COMPLETO en SQL Editor sobre la base existente (después de 01 y 02).
-- No requiere 03. Conserva las compras anteriores y se puede repetir.
begin;
alter table public.compras alter column proveedor_id drop not null;
alter table public.compras add column if not exists documento_id uuid;
alter table public.compras add column if not exists comprobante text not null default '';
alter table public.compras drop constraint if exists compras_comprobante_valido;
alter table public.compras add constraint compras_comprobante_valido check(length(comprobante)<=120);
create index if not exists compras_documento_idx on public.compras(documento_id);

create or replace function public.registrar_compra_multiple(
  p_documento uuid,p_sucursal uuid,p_proveedor uuid,p_comprobante text,
  p_fecha date,p_observaciones text,p_items jsonb
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_item record; v_insumo public.insumos;
begin
  perform roly_private.exigir_admin();
  if p_documento is null or p_sucursal is null then raise exception 'Selecciona una sucursal válida.'; end if;
  -- Registro y anulación bloquean primero la sucursal para ordenar las actualizaciones.
  perform 1 from public.sucursales where id=p_sucursal and activa for update;
  if not found then raise exception 'La sucursal está inactiva o no existe.'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_documento::text,0));
  if exists(select 1 from public.compras where documento_id=p_documento or id=p_documento) then
    raise exception 'Esta compra ya fue registrada. Actualiza los datos antes de continuar.';
  end if;
  if p_proveedor is not null then
    perform 1 from public.proveedores where id=p_proveedor and activo for share;
    if not found then raise exception 'Proveedor inactivo o inexistente.'; end if;
  end if;
  if p_fecha is null or length(coalesce(p_comprobante,''))>120 or length(coalesce(p_observaciones,''))>2000 then raise exception 'Revisa fecha, comprobante y observaciones.'; end if;
  if p_items is null or jsonb_typeof(p_items)<>'array' then raise exception 'Agrega los insumos de la compra.'; end if;
  if jsonb_array_length(p_items) not between 1 and 100 then raise exception 'La compra necesita entre 1 y 100 insumos.'; end if;
  if exists(select 1 from jsonb_to_recordset(p_items) as x(insumo_id uuid,nombre text,unidad text,cantidad numeric,costo_unitario numeric)
    where nombre is null or length(trim(nombre)) not between 1 and 100 or unidad is null or unidad not in ('unidades','kg','litros','paquetes')
      or cantidad is null or cantidad<=0 or cantidad>1000000 or cantidad<>round(cantidad,2)
      or costo_unitario is null or costo_unitario<=0 or costo_unitario>1000000 or costo_unitario<>round(costo_unitario,2)) then
    raise exception 'Revisa nombre, unidad, cantidad y precio unitario de cada insumo.';
  end if;
  for v_item in select * from jsonb_to_recordset(p_items) as x(insumo_id uuid,nombre text,unidad text,cantidad numeric,costo_unitario numeric)
    order by coalesce(insumo_id::text,lower(trim(nombre))) loop
    if v_item.insumo_id is not null then
      select * into v_insumo from public.insumos where id=v_item.insumo_id and sucursal_id=p_sucursal for update;
      if not found then raise exception 'Un insumo no pertenece a la sucursal seleccionada.'; end if;
    else
      insert into public.insumos(nombre,sucursal_id,cantidad,minimo,unidad)
        values(trim(v_item.nombre),p_sucursal,0,0,v_item.unidad)
        on conflict(sucursal_id,lower(trim(nombre))) do nothing;
      select * into v_insumo from public.insumos where sucursal_id=p_sucursal and lower(trim(nombre))=lower(trim(v_item.nombre)) for update;
    end if;
    if v_insumo.unidad<>v_item.unidad then raise exception 'La unidad de % es %. Usa la misma unidad del inventario.',v_insumo.nombre,v_insumo.unidad; end if;
    insert into public.compras(documento_id,comprobante,proveedor_id,insumo_id,sucursal_id,cantidad,costo_unitario,fecha,observaciones,creado_por)
      values(p_documento,trim(coalesce(p_comprobante,'')),p_proveedor,v_insumo.id,p_sucursal,v_item.cantidad,v_item.costo_unitario,p_fecha,trim(coalesce(p_observaciones,'')),auth.uid());
    update public.insumos set cantidad=cantidad+v_item.cantidad where id=v_insumo.id;
  end loop;
  return p_documento;
end $$;

-- Recibe el id de cualquier línea; revierte el documento completo en una transacción.
-- Las compras antiguas sin documento_id conservan su anulación individual.
create or replace function public.anular_compra(p_compra uuid) returns void language plpgsql security definer set search_path = '' as $$
declare v_compra public.compras; v_item record; v_stock numeric;
begin
  perform roly_private.exigir_admin();
  select * into v_compra from public.compras where id=p_compra;
  if not found then raise exception 'Compra inexistente o ya anulada.'; end if;
  perform 1 from public.sucursales where id=v_compra.sucursal_id for update;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(coalesce(v_compra.documento_id,v_compra.id)::text,0));
  perform 1 from public.compras where (v_compra.documento_id is not null and documento_id=v_compra.documento_id) or id=v_compra.id order by id for update;
  if exists(select 1 from public.compras where ((v_compra.documento_id is not null and documento_id=v_compra.documento_id) or id=v_compra.id) and estado<>'Registrada') then
    raise exception 'Compra inexistente o ya anulada.';
  end if;
  for v_item in select insumo_id,sum(cantidad) as cantidad from public.compras
    where (v_compra.documento_id is not null and documento_id=v_compra.documento_id) or id=v_compra.id group by insumo_id order by insumo_id loop
    select cantidad into v_stock from public.insumos where id=v_item.insumo_id for update;
    if v_stock<v_item.cantidad then raise exception 'Stock insuficiente para revertir la compra completa.'; end if;
    update public.insumos set cantidad=cantidad-v_item.cantidad where id=v_item.insumo_id;
  end loop;
  update public.compras set estado='Anulada' where (v_compra.documento_id is not null and documento_id=v_compra.documento_id) or id=v_compra.id;
end $$;
revoke all on function public.registrar_compra_multiple(uuid,uuid,uuid,text,date,text,jsonb) from public,anon;
grant execute on function public.registrar_compra_multiple(uuid,uuid,uuid,text,date,text,jsonb) to authenticated;
revoke all on function public.anular_compra(uuid) from public,anon;
grant execute on function public.anular_compra(uuid) to authenticated;
insert into public.roly_schema_version(version) values(4) on conflict do nothing;
notify pgrst, 'reload schema';
commit;
