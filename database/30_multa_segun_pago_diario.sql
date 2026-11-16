-- Quita el monto fijo global: calcula la multa usando la tarifa diaria de la persona.
-- Ejecutar después de database/28_pago_diario_multas.sql.
begin;

create or replace function roly_private.generar_multa_asistencia_tardia()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_hora time without time zone;
  v_tolerancia integer;
  v_pago_diario numeric(12,2);
  v_registro timestamp without time zone;
  v_limite timestamp without time zone;
  v_minutos integer;
  v_multa numeric(12,2);
begin
  select hora_entrada_asistencia,tolerancia_asistencia_minutos
    into v_hora,v_tolerancia
    from public.configuracion where id=1;
  if not found or v_hora is null then return new; end if;

  v_registro := new.registrada_en at time zone 'America/La_Paz';
  v_limite := new.fecha + v_hora + make_interval(mins=>coalesce(v_tolerancia,0));
  if v_registro <= v_limite then return new; end if;
  v_minutos := greatest(1,ceil(extract(epoch from (v_registro-v_limite))/60.0)::integer);

  if new.personal_id is not null then
    select case when extract(dow from new.fecha) in (0,6) then pago_diario_fin_semana else pago_diario_semana end
      into v_pago_diario from public.personal_operativo where id=new.personal_id;
  elsif new.empleado_id is not null then
    select case when extract(dow from new.fecha) in (0,6) then pago_diario_fin_semana else pago_diario_semana end
      into v_pago_diario from public.perfiles where id=new.empleado_id;
  end if;

  -- Sin una tarifa configurada no se inventa una multa fija.
  if coalesce(v_pago_diario,0) <= 0 then return new; end if;
  v_multa := round((v_pago_diario/8/60)*v_minutos,2);
  insert into public.multas_asistencia(asistencia_id,empleado_id,personal_id,minutos_tarde,monto)
  values(new.id,new.empleado_id,new.personal_id,v_minutos,v_multa)
  on conflict(asistencia_id) do nothing;
  return new;
end;
$$;

revoke all on function roly_private.generar_multa_asistencia_tardia() from public,anon,authenticated;
insert into public.roly_schema_version(version) values (30) on conflict do nothing;
notify pgrst,'reload schema';
commit;
