-- Permite que el Administrador guarde hora y tolerancia aun si otra migración
-- retiró el permiso de UPDATE directo sobre configuracion.
-- Ejecutar después de database/20_tiempo_asistencia_general.sql.
begin;

create or replace function public.guardar_tiempo_asistencia(p_hora time without time zone,p_tolerancia integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Validar el perfil directamente. En instalaciones con helpers RLS antiguos,
  -- roly_private.es_admin() puede rechazar a un admin que requireAdmin ya validó.
  if not exists (
    select 1 from public.perfiles
     where id=(select auth.uid()) and activo is true and rol='Administrador'
  ) then
    raise exception 'Tu perfil no tiene Administrador activo en Supabase.' using errcode='42501';
  end if;
  if p_hora is null then raise exception 'Indica una hora válida.' using errcode='22023'; end if;
  if p_tolerancia is null or p_tolerancia<0 or p_tolerancia>180 then
    raise exception 'La tolerancia debe estar entre 0 y 180 minutos.' using errcode='22023';
  end if;
  update public.configuracion
     set hora_entrada_asistencia=p_hora,
         tolerancia_asistencia_minutos=p_tolerancia
   where id=1;
  if not found then raise exception 'No se encontró la configuración del negocio.'; end if;
end;
$$;

revoke all on function public.guardar_tiempo_asistencia(time without time zone,integer) from public,anon;
grant execute on function public.guardar_tiempo_asistencia(time without time zone,integer) to authenticated;
insert into public.roly_schema_version(version) values (31) on conflict do nothing;
notify pgrst,'reload schema';
commit;
