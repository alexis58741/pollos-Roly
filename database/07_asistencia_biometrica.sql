-- POLLOS ROLY · Plantilla facial y verificación para asistencia.
-- Ejecutar después de 01, 05 y 06 en Supabase SQL Editor.
begin;

-- Conserva las asistencias anteriores, pero deja de exigir una foto por registro.
alter table public.asistencias alter column foto_path drop not null;
-- La app deja de subir fotos por cada asistencia. Conserva el bucket privado histórico, pero cierra nuevas cargas.
drop policy if exists asistencia_foto_subir on storage.objects;

create table if not exists public.plantillas_faciales (
  empleado_id uuid primary key references auth.users(id) on delete cascade,
  descriptor jsonb not null,
  creado_en timestamptz not null default now(),
  constraint plantilla_descriptor_formato check (
    jsonb_typeof(descriptor) = 'array' and jsonb_array_length(descriptor) = 1024
  )
);
alter table public.plantillas_faciales enable row level security;
revoke all on public.plantillas_faciales from anon, authenticated;
grant select, insert on public.plantillas_faciales to authenticated;
drop policy if exists plantilla_ver_propia on public.plantillas_faciales;
create policy plantilla_ver_propia on public.plantillas_faciales
  for select to authenticated using (empleado_id = (select auth.uid()));
drop policy if exists plantilla_registrar_propia on public.plantillas_faciales;
create policy plantilla_registrar_propia on public.plantillas_faciales
  for insert to authenticated with check (empleado_id = (select auth.uid()));

insert into public.roly_schema_version(version) values (7) on conflict do nothing;
notify pgrst, 'reload schema';
commit;
