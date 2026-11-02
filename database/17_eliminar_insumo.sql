-- Eliminación explícita de insumos sin borrar registros referenciados por compras.
-- La relación de compras se conserva como historial: los insumos con compras no se eliminan.
begin;

create or replace function public.eliminar_insumo(p_insumo uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform roly_private.exigir_admin();

  if p_insumo is null then
    raise exception 'Selecciona un insumo válido.' using errcode = '22023';
  end if;

  if not exists (select 1 from public.insumos where id = p_insumo) then
    raise exception 'El insumo ya no existe. Actualiza la pantalla.' using errcode = 'P0002';
  end if;

  if exists (select 1 from public.compras where insumo_id = p_insumo) then
    raise exception 'insumo_con_compras' using errcode = '23503';
  end if;

  delete from public.insumos where id = p_insumo;
end;
$$;

revoke all on function public.eliminar_insumo(uuid) from public, anon, authenticated;
grant execute on function public.eliminar_insumo(uuid) to authenticated;

commit;
