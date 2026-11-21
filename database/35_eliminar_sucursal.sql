-- CRUD de sucursales: permite borrar solo sucursales sin datos vinculados.
-- Las sucursales con historial deben desactivarse desde el panel.
begin;

create or replace function public.eliminar_sucursal_si_sin_datos(p_sucursal uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_fk record;
  v_referenciada boolean;
begin
  perform roly_private.exigir_admin();

  if p_sucursal is null then
    raise exception 'Selecciona una sucursal válida.' using errcode = '22023';
  end if;
  if not exists (select 1 from public.sucursales where id = p_sucursal) then
    raise exception 'La sucursal ya no existe. Actualiza la pantalla.' using errcode = 'P0002';
  end if;

  -- Busca todas las FK de la base que apuntan a sucursales.id. Así no depende
  -- de una lista fija y no elimina datos en cascada ni rompe referencias.
  for v_fk in
    select ns.nspname as schema_name,
           tbl.relname as table_name,
           att.attname as column_name
      from pg_catalog.pg_constraint con
      join pg_catalog.pg_class tbl on tbl.oid = con.conrelid
      join pg_catalog.pg_namespace ns on ns.oid = tbl.relnamespace
      join pg_catalog.pg_attribute att
        on att.attrelid = con.conrelid
       and att.attnum = con.conkey[array_position(con.confkey, (
         select a.attnum from pg_catalog.pg_attribute a
          where a.attrelid = 'public.sucursales'::regclass and a.attname = 'id'
       ))]
     where con.contype = 'f'
       and con.confrelid = 'public.sucursales'::regclass
       and array_position(con.confkey, (
         select a.attnum from pg_catalog.pg_attribute a
          where a.attrelid = 'public.sucursales'::regclass and a.attname = 'id'
       )) is not null
  loop
    execute format('select exists (select 1 from %I.%I where %I = $1)',
                   v_fk.schema_name, v_fk.table_name, v_fk.column_name)
       into v_referenciada using p_sucursal;
    if v_referenciada then
      raise exception 'sucursal_con_datos' using errcode = '23503';
    end if;
  end loop;

  delete from public.sucursales where id = p_sucursal;
end;
$$;

revoke all on function public.eliminar_sucursal_si_sin_datos(uuid) from public, anon, authenticated;
grant execute on function public.eliminar_sucursal_si_sin_datos(uuid) to authenticated;
insert into public.roly_schema_version(version) values (35) on conflict do nothing;

commit;
