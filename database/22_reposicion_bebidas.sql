-- Ejecutar después de 15_inventario_bebidas.sql.
begin;

create or replace function public.reponer_freezer_bebida(p_stock uuid, p_cantidad integer)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_sucursal uuid;
  v_almacen integer;
  v_perfil record;
begin
  select rol, activo, sucursal_id into v_perfil
  from public.perfiles where id = (select auth.uid());
  if not found or not v_perfil.activo or v_perfil.rol::text not in ('Administrador', 'Cajero') then
    raise exception 'No tienes permiso para reponer el freezer.' using errcode = '42501';
  end if;
  if p_cantidad is null or p_cantidad <= 0 then
    raise exception 'La cantidad debe ser mayor que cero.';
  end if;
  select sucursal_id, cantidad_almacen into v_sucursal, v_almacen
  from public.stock_bebidas where id = p_stock for update;
  if not found then raise exception 'El stock de esta bebida no existe.'; end if;
  if v_perfil.rol::text = 'Cajero' and v_perfil.sucursal_id is distinct from v_sucursal then
    raise exception 'Solo puedes reponer bebidas de tu sucursal.' using errcode = '42501';
  end if;
  if p_cantidad > v_almacen then
    raise exception 'No hay suficientes bebidas en almacén. Disponibles: %.', v_almacen;
  end if;
  update public.stock_bebidas
  set cantidad_almacen = cantidad_almacen - p_cantidad,
      cantidad_freezer = cantidad_freezer + p_cantidad
  where id = p_stock;
end $$;

revoke all on function public.reponer_freezer_bebida(uuid, integer) from public, anon;
grant execute on function public.reponer_freezer_bebida(uuid, integer) to authenticated;

create or replace view public.alertas_stock with (security_invoker=true) as
  select 'Insumo'::text as tipo,id as referencia_id,sucursal_id,nombre,cantidad,minimo,unidad
    from public.insumos where cantidad<=minimo
  union all
  select 'Snack',s.id,s.sucursal_id,p.nombre,s.cantidad,s.minimo,'unidades'
    from public.stock_snacks s join public.productos p on p.id=s.producto_id where s.cantidad<=s.minimo
  union all
  select 'Bebida',s.id,s.sucursal_id,p.nombre,s.cantidad_freezer,s.minimo,'unidades en freezer'
    from public.stock_bebidas s join public.productos p on p.id=s.producto_id
    where s.cantidad_freezer<=s.minimo;
grant select on public.alertas_stock to authenticated;
notify pgrst, 'reload schema';
commit;
