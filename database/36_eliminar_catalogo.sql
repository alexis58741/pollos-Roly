-- Elimina productos o categorías solo cuando no tienen relaciones comerciales.
-- No se borran ventas, inventario ni detalles históricos.
begin;

create or replace function public.eliminar_catalogo_sin_referencias(p_tipo text, p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tabla regclass;
  v_fk record;
  v_referenciada boolean;
begin
  perform roly_private.exigir_admin();
  if p_id is null or p_tipo is null or p_tipo not in ('product', 'category') then
    raise exception 'Selecciona un producto o categoría válido.' using errcode = '22023';
  end if;

  v_tabla := case p_tipo when 'product' then 'public.productos'::regclass else 'public.categorias'::regclass end;
  if not exists (select 1 from public.productos where id = p_id) and p_tipo = 'product' then
    raise exception 'El producto ya no existe. Actualiza la pantalla.' using errcode = 'P0002';
  end if;
  if not exists (select 1 from public.categorias where id = p_id) and p_tipo = 'category' then
    raise exception 'La categoría ya no existe. Actualiza la pantalla.' using errcode = 'P0002';
  end if;

  for v_fk in
    select ns.nspname as schema_name, tbl.relname as table_name, att.attname as column_name
      from pg_catalog.pg_constraint con
      join pg_catalog.pg_class tbl on tbl.oid = con.conrelid
      join pg_catalog.pg_namespace ns on ns.oid = tbl.relnamespace
      join pg_catalog.pg_attribute att
        on att.attrelid = con.conrelid
       and att.attnum = con.conkey[array_position(con.confkey, (
         select a.attnum from pg_catalog.pg_attribute a
          where a.attrelid = v_tabla and a.attname = 'id'
       ))]
     where con.contype = 'f'
       and con.confrelid = v_tabla
       and array_position(con.confkey, (
         select a.attnum from pg_catalog.pg_attribute a
          where a.attrelid = v_tabla and a.attname = 'id'
       )) is not null
  loop
    execute format('select exists (select 1 from %I.%I where %I = $1)',
                   v_fk.schema_name, v_fk.table_name, v_fk.column_name)
       into v_referenciada using p_id;
    if v_referenciada then
      raise exception 'catalogo_con_referencias' using errcode = '23503';
    end if;
  end loop;

  if p_tipo = 'product' then
    delete from public.productos where id = p_id;
  else
    delete from public.categorias where id = p_id;
  end if;
end;
$$;

revoke all on function public.eliminar_catalogo_sin_referencias(text, uuid) from public, anon, authenticated;
grant execute on function public.eliminar_catalogo_sin_referencias(text, uuid) to authenticated;
insert into public.roly_schema_version(version) values (36) on conflict do nothing;

commit;
