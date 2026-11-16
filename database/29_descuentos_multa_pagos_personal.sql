-- Descuenta de cada pago las multas de asistencia pendientes, en orden de fecha.
-- Ejecutar después de database/28_pago_diario_multas.sql en Supabase.
begin;

alter table public.pagos_personal add column if not exists monto_bruto numeric(12,2);
alter table public.pagos_personal add column if not exists descuento_tardanza numeric(12,2) not null default 0;
-- No se actualizan filas antiguas: el trigger protege los pagos ya realizados.
-- La interfaz interpreta monto_bruto NULL en pagos anteriores como el monto registrado.

do $$
declare c record;
begin
  for c in select conname from pg_constraint
    where conrelid='public.pagos_personal'::regclass and contype='c'
      and pg_get_constraintdef(oid) ~ 'monto[[:space:]]*>[[:space:]]*[(]?0'
      and pg_get_constraintdef(oid) !~ 'monto[[:space:]]*>='
  loop
    execute format('alter table public.pagos_personal drop constraint %I', c.conname);
  end loop;
end;
$$;
do $$ begin
  if not exists(select 1 from pg_constraint where conrelid='public.pagos_personal'::regclass and conname='pagos_personal_monto_no_negativo') then
    alter table public.pagos_personal add constraint pagos_personal_monto_no_negativo check(monto >= 0);
  end if;
  if not exists(select 1 from pg_constraint where conrelid='public.pagos_personal'::regclass and conname='pagos_personal_monto_bruto_positivo') then
    alter table public.pagos_personal add constraint pagos_personal_monto_bruto_positivo check(monto_bruto is null or monto_bruto > 0);
  end if;
  if not exists(select 1 from pg_constraint where conrelid='public.pagos_personal'::regclass and conname='pagos_personal_descuento_no_negativo') then
    alter table public.pagos_personal add constraint pagos_personal_descuento_no_negativo check(descuento_tardanza >= 0);
  end if;
end $$;

alter table public.multas_asistencia add column if not exists monto_descontado numeric(12,2) not null default 0;
update public.multas_asistencia set monto_descontado=monto where estado='Descontada' and monto_descontado=0;
create index if not exists asistencias_personal_fecha_idx on public.asistencias(personal_id,fecha);
create index if not exists asistencias_empleado_fecha_idx on public.asistencias(empleado_id,fecha);
create index if not exists multas_asistencia_pendientes_idx on public.multas_asistencia(asistencia_id) where estado='Pendiente';

create table if not exists public.pagos_personal_multas (
  pago_personal_id uuid not null references public.pagos_personal(id) on delete cascade,
  multa_id uuid not null references public.multas_asistencia(id),
  monto numeric(12,2) not null check(monto > 0),
  primary key(pago_personal_id,multa_id)
);
alter table public.pagos_personal_multas enable row level security;
revoke all on public.pagos_personal_multas from anon,authenticated;

create or replace function public.registrar_pago_personal_con_multas(
  p_personal uuid,
  p_monto_bruto numeric,
  p_fecha date,
  p_tipo_pago text,
  p_concepto text,
  p_observaciones text,
  p_metodo text,
  p_estado text
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_personal record;
  v_pago uuid := gen_random_uuid();
  v_multa record;
  v_pendiente numeric(12,2);
  v_aplicado numeric(12,2);
  v_total_descuento numeric(12,2) := 0;
begin
  perform roly_private.exigir_admin();
  if p_personal is null or p_monto_bruto is null or p_monto_bruto <= 0 or p_fecha is null then
    raise exception 'El empleado, la fecha y el monto bruto son obligatorios.' using errcode='22023';
  end if;
  if p_tipo_pago not in ('Pago Diario','Pago Semanal','Pago Quincenal','Pago Mensual','Horas Extra','Bono','Otro')
     or p_metodo not in ('Efectivo','QR','Tarjeta') or p_estado not in ('Pendiente','Pagado')
     or length(trim(coalesce(p_concepto,'')))=0 then
    raise exception 'Los datos del pago no son válidos.' using errcode='22023';
  end if;
  select id,nombre,sucursal_id into v_personal from public.personal_operativo where id=p_personal and activo for update;
  if not found then raise exception 'El empleado no está activo.' using errcode='23503'; end if;

  for v_multa in
    select m.id,m.monto,m.monto_descontado
      from public.multas_asistencia m
      join public.asistencias a on a.id=m.asistencia_id
     where m.estado='Pendiente' and a.fecha<=p_fecha
       and (a.personal_id=p_personal or a.empleado_id=p_personal)
     order by a.fecha,a.registrada_en,m.id
     for update of m
  loop
    v_pendiente := greatest(0,round(v_multa.monto-v_multa.monto_descontado,2));
    if v_pendiente > 0 and v_total_descuento < p_monto_bruto then
      v_aplicado := least(v_pendiente,p_monto_bruto-v_total_descuento);
      insert into public.pagos_personal_multas(pago_personal_id,multa_id,monto) values(v_pago,v_multa.id,v_aplicado);
      update public.multas_asistencia set monto_descontado=monto_descontado+v_aplicado,
        estado=case when monto_descontado+v_aplicado>=monto then 'Descontada' else 'Pendiente' end
       where id=v_multa.id;
      v_total_descuento := v_total_descuento+v_aplicado;
    end if;
  end loop;

  insert into public.pagos_personal(id,personal_id,nombre_empleado,sucursal_id,tipo_pago,monto_bruto,descuento_tardanza,monto,concepto,observaciones,periodo,fecha,metodo,estado)
  values(v_pago,v_personal.id,v_personal.nombre,v_personal.sucursal_id,p_tipo_pago,p_monto_bruto,v_total_descuento,
    greatest(0,p_monto_bruto-v_total_descuento),trim(p_concepto),coalesce(p_observaciones,''),date_trunc('month',p_fecha)::date,p_fecha,p_metodo,p_estado);
  return v_pago;
end;
$$;

revoke all on function public.registrar_pago_personal_con_multas(uuid,numeric,date,text,text,text,text,text) from public,anon;
grant execute on function public.registrar_pago_personal_con_multas(uuid,numeric,date,text,text,text,text,text) to authenticated;
insert into public.roly_schema_version(version) values (29) on conflict do nothing;
notify pgrst,'reload schema';
commit;
