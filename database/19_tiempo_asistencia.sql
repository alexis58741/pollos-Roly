-- Horario esperado de entrada y tolerancia por empleado.
-- Ejecutar después de las migraciones base y de roles.
begin;

create table if not exists public.horarios_asistencia (
  empleado_id uuid primary key references auth.users(id) on delete cascade,
  hora_entrada time without time zone not null,
  tolerancia_minutos smallint not null default 0 check (tolerancia_minutos between 0 and 180),
  updated_at timestamptz not null default now()
);

alter table public.horarios_asistencia enable row level security;
revoke all on table public.horarios_asistencia from anon, authenticated;
drop policy if exists horario_asistencia_admin on public.horarios_asistencia;
create policy horario_asistencia_admin on public.horarios_asistencia
  for all to authenticated
  using ((select roly_private.es_admin()))
  with check ((select roly_private.es_admin()));
grant select, insert, update on public.horarios_asistencia to authenticated;

insert into public.roly_schema_version(version) values (19) on conflict do nothing;
notify pgrst, 'reload schema';
commit;
