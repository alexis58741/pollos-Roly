-- POLLOS ROLY · Modo de asistencia en tablet compartida.
-- Ejecutar después de database/06_asistencia.sql y database/07_asistencia_biometrica.sql.
-- La función compara el descriptor recibido sin devolver ni exponer las plantillas guardadas.
begin;

do $$
begin
  if to_regclass('public.perfiles') is null
     or to_regclass('public.asistencias') is null
     or to_regclass('public.plantillas_faciales') is null then
    raise exception 'Faltan perfiles o tablas de asistencia. Ejecuta primero database/06_asistencia.sql y database/07_asistencia_biometrica.sql.';
  end if;
end;
$$;

create or replace function public.marcar_asistencia_kiosco(p_descriptor jsonb)
returns table (
  success boolean,
  message text,
  employee_name text,
  employee_role text,
  registered_at timestamptz,
  already_marked boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_candidate record;
  v_descriptor jsonb := p_descriptor;
  v_distance double precision;
  v_score double precision;
  v_best_score double precision := 0;
  v_best_id uuid;
  v_best_name text;
  v_best_role text;
  v_attendance public.asistencias%rowtype;
begin
  if v_descriptor is null or jsonb_typeof(v_descriptor) <> 'array'
     or jsonb_array_length(v_descriptor) <> 1024 then
    return query select false, 'El escaneo facial no es válido.', null::text, null::text, null::timestamptz, false;
    return;
  end if;

  if exists (
    select 1 from jsonb_array_elements(v_descriptor) as item(value)
    where jsonb_typeof(item.value) <> 'number'
       or case when jsonb_typeof(item.value) = 'number'
               then abs((item.value #>> '{}')::numeric) > 10
               else false end
  ) then
    return query select false, 'El escaneo facial no es válido.', null::text, null::text, null::timestamptz, false;
    return;
  end if;

  for v_candidate in
    select p.id, p.nombre, p.apellido, p.rol, f.descriptor
      from public.perfiles as p
      join public.plantillas_faciales as f on f.empleado_id = p.id
     where p.activo = true
       and p.rol in ('Supervisor', 'Cajero', 'Cocinero', 'Mesero', 'Repartidor', 'Limpieza')
  loop
    if jsonb_typeof(v_candidate.descriptor) <> 'array'
       or jsonb_array_length(v_candidate.descriptor) <> 1024 then
      continue;
    end if;
    if exists (
      select 1 from jsonb_array_elements(v_candidate.descriptor) as item(value)
      where jsonb_typeof(item.value) <> 'number'
         or case when jsonb_typeof(item.value) = 'number'
                 then abs((item.value #>> '{}')::numeric) > 10
                 else false end
    ) then
      continue;
    end if;

    select sum(power((v_descriptor ->> i)::double precision - (v_candidate.descriptor ->> i)::double precision, 2))
      into v_distance
      from generate_series(0, 1023) as indices(i);

    -- Misma escala de similitud que el verificador facial de la tablet.
    v_score := greatest(0, least(1, (1 - sqrt(25 * v_distance) / 100 - 0.2) / 0.6));
    if v_score > v_best_score then
      v_best_score := v_score;
      v_best_id := v_candidate.id;
      v_best_name := coalesce(nullif(trim(v_candidate.nombre || ' ' || v_candidate.apellido), ''), 'Personal');
      v_best_role := v_candidate.rol;
    end if;
  end loop;

  if v_best_id is null or v_best_score < 0.50 then
    return query select false, 'No encontramos un rostro registrado. Pide al administrador que registre la plantilla facial.', null::text, null::text, null::timestamptz, false;
    return;
  end if;

  select * into v_attendance
    from public.asistencias as a
   where a.empleado_id = v_best_id
     and a.fecha = (now() at time zone 'America/La_Paz')::date;

  if found then
    return query select true, null::text, v_best_name, v_best_role, v_attendance.registrada_en, true;
    return;
  end if;

  begin
    insert into public.asistencias (empleado_id)
    values (v_best_id)
    returning * into v_attendance;
  exception when unique_violation then
    select * into v_attendance from public.asistencias as a
     where a.empleado_id = v_best_id
       and a.fecha = (now() at time zone 'America/La_Paz')::date;
    return query select true, null::text, v_best_name, v_best_role, v_attendance.registrada_en, true;
    return;
  end;

  return query select true, null::text, v_best_name, v_best_role, v_attendance.registrada_en, false;
end;
$$;

revoke all on function public.marcar_asistencia_kiosco(jsonb) from public;
grant execute on function public.marcar_asistencia_kiosco(jsonb) to anon, authenticated;

insert into public.roly_schema_version(version) values (24) on conflict do nothing;
notify pgrst, 'reload schema';
commit;
