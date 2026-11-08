-- POLLOS ROLY · Personal operativo sin cuenta de acceso y asistencia facial compartida.
-- Ejecutar después de database/21_multas_asistencia.sql y database/24_asistencia_kiosco.sql.
begin;

alter table public.asistencias alter column empleado_id drop not null;
alter table public.asistencias add column if not exists personal_id uuid references public.personal_operativo(id);
update public.asistencias a set personal_id=p.id, empleado_id=null from public.perfiles p
 where a.empleado_id=p.id and p.rol not in ('Administrador','Cajero')
   and exists(select 1 from public.personal_operativo e where e.id=p.id);
create unique index if not exists asistencias_personal_fecha_unica on public.asistencias(personal_id, fecha) where personal_id is not null;
do $$ begin
  if not exists (select 1 from pg_constraint where conrelid='public.asistencias'::regclass and conname='asistencias_un_sujeto') then
    alter table public.asistencias add constraint asistencias_un_sujeto check ((empleado_id is not null) <> (personal_id is not null));
  end if;
end $$;

alter table public.plantillas_faciales drop constraint if exists plantillas_faciales_pkey;
alter table public.plantillas_faciales alter column empleado_id drop not null;
alter table public.plantillas_faciales add column if not exists id uuid default gen_random_uuid();
alter table public.plantillas_faciales add column if not exists personal_id uuid references public.personal_operativo(id) on delete cascade;
update public.plantillas_faciales set id=gen_random_uuid() where id is null;
update public.plantillas_faciales f set personal_id=p.id,empleado_id=null from public.perfiles p
 where f.empleado_id=p.id and p.rol not in ('Administrador','Cajero')
   and exists(select 1 from public.personal_operativo e where e.id=p.id);
alter table public.plantillas_faciales alter column id set not null;
do $$ begin
  if not exists (select 1 from pg_constraint where conrelid='public.plantillas_faciales'::regclass and conname='plantillas_faciales_pkey') then
    alter table public.plantillas_faciales add constraint plantillas_faciales_pkey primary key(id);
  end if;
  if not exists (select 1 from pg_constraint where conrelid='public.plantillas_faciales'::regclass and conname='plantillas_faciales_un_sujeto') then
    alter table public.plantillas_faciales add constraint plantillas_faciales_un_sujeto check ((empleado_id is not null) <> (personal_id is not null));
  end if;
end $$;
create unique index if not exists plantillas_faciales_usuario_unico on public.plantillas_faciales(empleado_id) where empleado_id is not null;
create unique index if not exists plantillas_faciales_personal_unico on public.plantillas_faciales(personal_id) where personal_id is not null;

grant select, insert, update on public.plantillas_faciales to authenticated;
drop policy if exists plantilla_admin_personal on public.plantillas_faciales;
create policy plantilla_admin_personal on public.plantillas_faciales for all to authenticated
  using ((select roly_private.es_admin()) and personal_id is not null)
  with check ((select roly_private.es_admin()) and personal_id is not null);
drop policy if exists plantilla_actualizar_propia on public.plantillas_faciales;
create policy plantilla_actualizar_propia on public.plantillas_faciales for update to authenticated
  using (empleado_id = (select auth.uid()))
  with check (empleado_id = (select auth.uid()));

alter table public.multas_asistencia alter column empleado_id drop not null;
alter table public.multas_asistencia add column if not exists personal_id uuid references public.personal_operativo(id);
update public.multas_asistencia m set personal_id=a.personal_id,empleado_id=null from public.asistencias a
 where m.asistencia_id=a.id and a.personal_id is not null;

create or replace function roly_private.generar_multa_asistencia_tardia()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_hora_entrada time without time zone;
  v_tolerancia integer;
  v_monto numeric(12,2);
  v_registro_local timestamp without time zone;
  v_limite_local timestamp without time zone;
  v_minutos_tarde integer;
begin
  select c.hora_entrada_asistencia, c.tolerancia_asistencia_minutos, c.monto_multa_asistencia
    into v_hora_entrada, v_tolerancia, v_monto from public.configuracion c where c.id=1;
  if not found or v_hora_entrada is null then return new; end if;
  v_registro_local := new.registrada_en at time zone 'America/La_Paz';
  v_limite_local := new.fecha + v_hora_entrada + make_interval(mins => coalesce(v_tolerancia,0));
  if v_registro_local <= v_limite_local then return new; end if;
  v_minutos_tarde := greatest(1, ceil(extract(epoch from (v_registro_local-v_limite_local))/60.0)::integer);
  insert into public.multas_asistencia(asistencia_id, empleado_id, personal_id, minutos_tarde, monto)
  values(new.id,new.empleado_id,new.personal_id,v_minutos_tarde,coalesce(v_monto,0)) on conflict(asistencia_id) do nothing;
  return new;
end;
$$;

create or replace function public.marcar_asistencia_kiosco(p_descriptor jsonb)
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

revoke all on function public.marcar_asistencia_kiosco(jsonb) from public;
grant execute on function public.marcar_asistencia_kiosco(jsonb) to anon,authenticated;
insert into public.roly_schema_version(version) values(25) on conflict do nothing;
notify pgrst,'reload schema';
commit;
