-- Pago diario diferenciado y multas por minuto según el día de asistencia.
-- Ejecutar después de database/25_personal_sin_cuenta.sql. Reemplaza el cálculo mensual de la migración 27.
begin;

alter table public.personal_operativo add column if not exists pago_diario_semana numeric(12,2) not null default 0 check (pago_diario_semana >= 0);
alter table public.personal_operativo add column if not exists pago_diario_fin_semana numeric(12,2) not null default 0 check (pago_diario_fin_semana >= 0);
alter table public.perfiles add column if not exists pago_diario_semana numeric(12,2) not null default 0 check (pago_diario_semana >= 0);
alter table public.perfiles add column if not exists pago_diario_fin_semana numeric(12,2) not null default 0 check (pago_diario_fin_semana >= 0);

-- Si la tarifa mensual de la migración 27 ya se había configurado, conviértela a una tarifa diaria inicial igual para ambos tipos de día.
do $$ begin
  if exists(select 1 from information_schema.columns where table_schema='public' and table_name='personal_operativo' and column_name='sueldo_mensual') then
    execute 'update public.personal_operativo set pago_diario_semana=round(sueldo_mensual/30,2), pago_diario_fin_semana=round(sueldo_mensual/30,2) where sueldo_mensual>0 and pago_diario_semana=0 and pago_diario_fin_semana=0';
  end if;
  if exists(select 1 from information_schema.columns where table_schema='public' and table_name='perfiles' and column_name='sueldo_mensual') then
    execute 'update public.perfiles set pago_diario_semana=round(sueldo_mensual/30,2), pago_diario_fin_semana=round(sueldo_mensual/30,2) where sueldo_mensual>0 and pago_diario_semana=0 and pago_diario_fin_semana=0';
  end if;
end $$;

create or replace function roly_private.generar_multa_asistencia_tardia()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_hora time without time zone;
  v_tolerancia integer;
  v_monto_fijo numeric(12,2);
  v_pago_diario numeric(12,2);
  v_registro timestamp without time zone;
  v_limite timestamp without time zone;
  v_minutos integer;
  v_multa numeric(12,2);
begin
  select hora_entrada_asistencia,tolerancia_asistencia_minutos,monto_multa_asistencia
    into v_hora,v_tolerancia,v_monto_fijo from public.configuracion where id=1;
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
  v_multa:=case when coalesce(v_pago_diario,0)>0 then round((v_pago_diario/8/60)*v_minutos,2) else coalesce(v_monto_fijo,0) end;
  insert into public.multas_asistencia(asistencia_id,empleado_id,personal_id,minutos_tarde,monto)
  values(new.id,new.empleado_id,new.personal_id,v_minutos,v_multa) on conflict(asistencia_id) do nothing;
  return new;
end;
$$;

revoke all on function roly_private.generar_multa_asistencia_tardia() from public,anon,authenticated;
insert into public.roly_schema_version(version) values(28) on conflict do nothing;
notify pgrst,'reload schema';
commit;
