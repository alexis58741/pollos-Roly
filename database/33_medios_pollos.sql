-- Acepta pollos enteros o medios pollos y agrega dos o una presa de cada tipo.
-- Ejecutar después de database/32_stock_presas_por_turno.sql.
begin;

drop function if exists public.agregar_pollos_stock(uuid,integer,integer);
create or replace function public.agregar_pollos_stock(p_turno uuid,p_broaster numeric,p_espiedo numeric)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_sucursal uuid;
  v_broaster integer;
  v_espiedo integer;
begin
  if p_broaster is null or p_espiedo is null
     or p_broaster<0 or p_espiedo<0
     or p_broaster+p_espiedo<0.5 or p_broaster+p_espiedo>10000
     or p_broaster*2<>trunc(p_broaster*2)
     or p_espiedo*2<>trunc(p_espiedo*2) then
    raise exception 'Usa cantidades desde 0,5 y en incrementos de medio pollo.' using errcode='22023';
  end if;
  v_broaster:=(p_broaster*2)::integer;
  v_espiedo:=(p_espiedo*2)::integer;

  select t.sucursal_id into v_sucursal
    from public.turnos_caja t
    join public.perfiles p on p.id=t.cajero_id
   where t.id=p_turno and t.cajero_id=(select auth.uid()) and t.cierre is null
     and p.activo and p.rol='Cajero' and p.sucursal_id=t.sucursal_id
   for update of t;
  if not found then raise exception 'Abre una caja para registrar pollos en este turno.' using errcode='42501'; end if;

  insert into public.stock_presas_turno as s(
    turno_id,sucursal_id,broaster_alas,broaster_pechugas,broaster_contras,broaster_piernas,
    espiedo_alas,espiedo_pechugas,espiedo_contras,espiedo_piernas
  ) values(p_turno,v_sucursal,v_broaster,v_broaster,v_broaster,v_broaster,v_espiedo,v_espiedo,v_espiedo,v_espiedo)
  on conflict(turno_id) do update set
    broaster_alas=s.broaster_alas+excluded.broaster_alas,
    broaster_pechugas=s.broaster_pechugas+excluded.broaster_pechugas,
    broaster_contras=s.broaster_contras+excluded.broaster_contras,
    broaster_piernas=s.broaster_piernas+excluded.broaster_piernas,
    espiedo_alas=s.espiedo_alas+excluded.espiedo_alas,
    espiedo_pechugas=s.espiedo_pechugas+excluded.espiedo_pechugas,
    espiedo_contras=s.espiedo_contras+excluded.espiedo_contras,
    espiedo_piernas=s.espiedo_piernas+excluded.espiedo_piernas,
    actualizado_en=now();
end $$;

revoke all on function public.agregar_pollos_stock(uuid,numeric,numeric) from public,anon;
grant execute on function public.agregar_pollos_stock(uuid,numeric,numeric) to authenticated;
insert into public.roly_schema_version(version) values(33) on conflict do nothing;
notify pgrst,'reload schema';
commit;
