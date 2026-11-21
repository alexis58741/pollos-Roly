-- Confirma el nombre reconocido en la tablet antes de guardar asistencia y multa.
-- Ejecutar después de database/25_personal_sin_cuenta.sql.
begin;

drop function if exists public.marcar_asistencia_kiosco(jsonb);
drop function if exists public.marcar_asistencia_kiosco(jsonb, boolean);

create function public.marcar_asistencia_kiosco(p_descriptor jsonb, p_confirm boolean default false)
returns table (success boolean, message text, employee_name text, employee_role text, registered_at timestamptz, already_marked boolean)
language plpgsql security definer set search_path = '' as $$
declare
  v_candidate record;
  v_descriptor jsonb := p_descriptor;
  v_distance double precision;
  v_score double precision;
  v_best_score double precision := 0;
  v_best_user uuid;
  v_best_personal uuid;
  v_best_name text;
  v_best_role text;
  v_attendance public.asistencias%rowtype;
begin
  if v_descriptor is null or jsonb_typeof(v_descriptor) <> 'array' or jsonb_array_length(v_descriptor) <> 1024 then
    return query select false,'El escaneo facial no es válido.',null::text,null::text,null::timestamptz,false; return;
  end if;
  if exists(select 1 from jsonb_array_elements(v_descriptor) as item(value)
    where jsonb_typeof(item.value)<>'number' or case when jsonb_typeof(item.value)='number' then abs((item.value#>>'{}')::numeric)>10 else false end) then
    return query select false,'El escaneo facial no es válido.',null::text,null::text,null::timestamptz,false; return;
  end if;

  for v_candidate in
    select x.user_id,x.personal_id,x.employee_name,x.employee_role,x.descriptor from (
      select p.id as user_id,null::uuid as personal_id,
        coalesce(nullif(trim(p.nombre||' '||p.apellido),''),'Personal') as employee_name,p.rol as employee_role,f.descriptor
      from public.perfiles p join public.plantillas_faciales f on f.empleado_id=p.id
      where p.activo and p.rol = 'Cajero'
      union all
      select null::uuid,e.id,e.nombre,e.rol,f.descriptor
      from public.personal_operativo e join public.plantillas_faciales f on f.personal_id=e.id
      where e.activo and e.rol in ('Supervisor','Cocinero','Mesero','Repartidor','Limpieza')
    ) x
  loop
    if jsonb_typeof(v_candidate.descriptor)<>'array' or jsonb_array_length(v_candidate.descriptor)<>1024 then continue; end if;
    if exists(select 1 from jsonb_array_elements(v_candidate.descriptor) as item(value)
      where jsonb_typeof(item.value)<>'number' or case when jsonb_typeof(item.value)='number' then abs((item.value#>>'{}')::numeric)>10 else false end) then continue; end if;
    select sum(power((v_descriptor->>i)::double precision-(v_candidate.descriptor->>i)::double precision,2)) into v_distance from generate_series(0,1023) as indices(i);
    v_score := greatest(0,least(1,(1-sqrt(25*v_distance)/100-0.2)/0.6));
    if v_score>v_best_score then
      v_best_score:=v_score; v_best_user:=v_candidate.user_id; v_best_personal:=v_candidate.personal_id;
      v_best_name:=v_candidate.employee_name; v_best_role:=v_candidate.employee_role;
    end if;
  end loop;
  if v_best_user is null and v_best_personal is null or v_best_score<0.50 then
    return query select false,'No encontramos un rostro registrado. Pide al administrador que registre la plantilla facial.',null::text,null::text,null::timestamptz,false; return;
  end if;
  select * into v_attendance from public.asistencias a where a.fecha=(now() at time zone 'America/La_Paz')::date
    and ((v_best_user is not null and a.empleado_id=v_best_user) or (v_best_personal is not null and a.personal_id=v_best_personal));
  if found then return query select true,null::text,v_best_name,v_best_role,v_attendance.registrada_en,true; return; end if;
  if p_confirm is distinct from true then
    return query select true,'CONFIRMATION_REQUIRED',v_best_name,v_best_role,now(),false;
    return;
  end if;
  begin
    insert into public.asistencias(empleado_id,personal_id) values(v_best_user,v_best_personal) returning * into v_attendance;
  exception when unique_violation then
    select * into v_attendance from public.asistencias a where a.fecha=(now() at time zone 'America/La_Paz')::date
      and ((v_best_user is not null and a.empleado_id=v_best_user) or (v_best_personal is not null and a.personal_id=v_best_personal));
    return query select true,null::text,v_best_name,v_best_role,v_attendance.registrada_en,true; return;
  end;
  return query select true,null::text,v_best_name,v_best_role,v_attendance.registrada_en,false;
end;
$$;

revoke all on function public.marcar_asistencia_kiosco(jsonb, boolean) from public;
grant execute on function public.marcar_asistencia_kiosco(jsonb, boolean) to anon, authenticated;
insert into public.roly_schema_version(version) values(37) on conflict do nothing;
notify pgrst, 'reload schema';
commit;
