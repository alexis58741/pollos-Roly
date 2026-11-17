-- Reinstala el disparador de tardanzas y genera multas faltantes desde el horario y sueldo diario.
-- Ejecutar después de database/30_multa_segun_pago_diario.sql y database/29_descuentos_multa_pagos_personal.sql.
begin;

create or replace function roly_private.generar_multa_asistencia_tardia()
returns trigger
language plpgsql security definer set search_path = '' as $$
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
    into v_hora,v_tolerancia from public.configuracion where id=1;
  if not found or v_hora is null then return new; end if;

  v_registro:=new.registrada_en at time zone 'America/La_Paz';
  v_limite:=new.fecha+v_hora+make_interval(mins=>coalesce(v_tolerancia,0));
  if v_registro<=v_limite then return new; end if;
  v_minutos:=greatest(1,ceil(extract(epoch from (v_registro-v_limite))/60.0)::integer);

  if new.personal_id is not null then
    select case when extract(dow from new.fecha) in (0,6) then pago_diario_fin_semana else pago_diario_semana end
      into v_pago_diario from public.personal_operativo where id=new.personal_id;
  elsif new.empleado_id is not null then
    select case when extract(dow from new.fecha) in (0,6) then pago_diario_fin_semana else pago_diario_semana end
      into v_pago_diario from public.perfiles where id=new.empleado_id;
  end if;
  if coalesce(v_pago_diario,0)<=0 then return new; end if;

  v_multa:=round((v_pago_diario/8/60)*v_minutos,2);
  insert into public.multas_asistencia(asistencia_id,empleado_id,personal_id,minutos_tarde,monto)
  values(new.id,new.empleado_id,new.personal_id,v_minutos,v_multa)
  on conflict(asistencia_id) do nothing;
  return new;
end;
$$;

revoke all on function roly_private.generar_multa_asistencia_tardia() from public,anon,authenticated;
drop trigger if exists generar_multa_asistencia_tardia on public.asistencias;
create trigger generar_multa_asistencia_tardia after insert on public.asistencias
for each row execute function roly_private.generar_multa_asistencia_tardia();

-- Corrige las multas pendientes con monto cero si ahora existe una tarifa diaria.
with calculadas as (
  select a.id,
    greatest(1,ceil(extract(epoch from ((a.registrada_en at time zone 'America/La_Paz')-
      (a.fecha+c.hora_entrada_asistencia+make_interval(mins=>coalesce(c.tolerancia_asistencia_minutos,0)))))/60.0)::integer) as minutos,
    case when extract(dow from a.fecha) in (0,6)
      then coalesce(pe.pago_diario_fin_semana,pr.pago_diario_fin_semana,0)
      else coalesce(pe.pago_diario_semana,pr.pago_diario_semana,0) end as pago_diario
  from public.asistencias a
  cross join public.configuracion c
  left join public.personal_operativo pe on pe.id=a.personal_id
  left join public.perfiles pr on pr.id=a.empleado_id
  where c.id=1 and c.hora_entrada_asistencia is not null
    and (a.registrada_en at time zone 'America/La_Paz')>
      (a.fecha+c.hora_entrada_asistencia+make_interval(mins=>coalesce(c.tolerancia_asistencia_minutos,0)))
)
update public.multas_asistencia m
   set minutos_tarde=x.minutos,monto=round((x.pago_diario/480)*x.minutos,2)
  from calculadas x
 where m.asistencia_id=x.id and m.estado='Pendiente' and m.monto=0
   and m.monto_descontado=0 and x.pago_diario>0;

-- Crea los registros faltantes para marcaciones tardías previas a esta reparación.
with calculadas as (
  select a.id,a.empleado_id,a.personal_id,
    greatest(1,ceil(extract(epoch from ((a.registrada_en at time zone 'America/La_Paz')-
      (a.fecha+c.hora_entrada_asistencia+make_interval(mins=>coalesce(c.tolerancia_asistencia_minutos,0)))))/60.0)::integer) as minutos,
    case when extract(dow from a.fecha) in (0,6)
      then coalesce(pe.pago_diario_fin_semana,pr.pago_diario_fin_semana,0)
      else coalesce(pe.pago_diario_semana,pr.pago_diario_semana,0) end as pago_diario
  from public.asistencias a
  cross join public.configuracion c
  left join public.personal_operativo pe on pe.id=a.personal_id
  left join public.perfiles pr on pr.id=a.empleado_id
  where c.id=1 and c.hora_entrada_asistencia is not null
    and (a.registrada_en at time zone 'America/La_Paz')>
      (a.fecha+c.hora_entrada_asistencia+make_interval(mins=>coalesce(c.tolerancia_asistencia_minutos,0)))
)
insert into public.multas_asistencia(asistencia_id,empleado_id,personal_id,minutos_tarde,monto)
select x.id,x.empleado_id,x.personal_id,x.minutos,round((x.pago_diario/480)*x.minutos,2)
  from calculadas x
 where x.pago_diario>0
on conflict(asistencia_id) do nothing;

insert into public.roly_schema_version(version) values(34) on conflict do nothing;
notify pgrst,'reload schema';
commit;
