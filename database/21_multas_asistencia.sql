-- POLLOS ROLY · Multa global automática por tardanza.
-- Ejecutar después de database/20_tiempo_asistencia_general.sql y database/06_asistencia.sql.
begin;

alter table public.configuracion
  add column if not exists monto_multa_asistencia numeric(12,2) not null default 0;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.configuracion'::regclass
      and conname = 'configuracion_monto_multa_asistencia_no_negativo'
  ) then
    alter table public.configuracion
      add constraint configuracion_monto_multa_asistencia_no_negativo
      check (monto_multa_asistencia >= 0);
  end if;
end;
$$;

create table if not exists public.multas_asistencia (
  id uuid primary key default gen_random_uuid(),
  asistencia_id uuid not null unique references public.asistencias(id) on delete cascade,
  empleado_id uuid not null references auth.users(id),
  minutos_tarde integer not null check (minutos_tarde > 0),
  monto numeric(12,2) not null check (monto >= 0),
  estado text not null default 'Pendiente' check (estado in ('Pendiente', 'Descontada', 'Anulada')),
  creada_en timestamptz not null default now()
);

alter table public.multas_asistencia enable row level security;
revoke all on public.multas_asistencia from anon, authenticated;
grant select on public.multas_asistencia to authenticated;
drop policy if exists multas_asistencia_admin_select on public.multas_asistencia;
create policy multas_asistencia_admin_select on public.multas_asistencia
  for select to authenticated using ((select roly_private.es_admin()));

create or replace function roly_private.generar_multa_asistencia_tardia()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_hora_entrada time without time zone;
  v_tolerancia integer;
  v_monto numeric(12,2);
  v_registro_local timestamp without time zone;
  v_limite_local timestamp without time zone;
  v_minutos_tarde integer;
begin
  select c.hora_entrada_asistencia,
         c.tolerancia_asistencia_minutos,
         c.monto_multa_asistencia
    into v_hora_entrada, v_tolerancia, v_monto
    from public.configuracion as c
   where c.id = 1;

  if not found or v_hora_entrada is null then
    return new;
  end if;

  v_registro_local := new.registrada_en at time zone 'America/La_Paz';
  v_limite_local := new.fecha + v_hora_entrada + make_interval(mins => coalesce(v_tolerancia, 0));

  if v_registro_local <= v_limite_local then
    return new;
  end if;

  v_minutos_tarde := greatest(1, ceil(extract(epoch from (v_registro_local - v_limite_local)) / 60.0)::integer);
  insert into public.multas_asistencia (asistencia_id, empleado_id, minutos_tarde, monto)
  values (new.id, new.empleado_id, v_minutos_tarde, coalesce(v_monto, 0))
  on conflict (asistencia_id) do nothing;

  return new;
end;
$$;

revoke all on function roly_private.generar_multa_asistencia_tardia() from public, anon, authenticated;
drop trigger if exists generar_multa_asistencia_tardia on public.asistencias;
create trigger generar_multa_asistencia_tardia
  after insert on public.asistencias
  for each row execute function roly_private.generar_multa_asistencia_tardia();

insert into public.roly_schema_version(version) values (21) on conflict do nothing;
notify pgrst, 'reload schema';
commit;
