-- POLLOS ROLY · Esquema inicial de asistencia (06 deja de requerir fotos al ejecutar 07).
-- Ejecutar en Supabase SQL Editor después de 01 y 05.
begin;
create table if not exists public.asistencias (
 id uuid primary key default gen_random_uuid(), empleado_id uuid not null references auth.users(id),
 fecha date not null default (now() at time zone 'America/La_Paz')::date,
 registrada_en timestamptz not null default now(), foto_path text not null,
 unique(empleado_id,fecha),
 constraint asistencias_foto_path check(foto_path ~ ('^' || empleado_id::text || '/[0-9a-f-]{36}\.jpg$'))
);
alter table public.asistencias enable row level security;
revoke all on public.asistencias from anon,authenticated;
grant select,insert on public.asistencias to authenticated;
drop policy if exists asistencia_ver_propia on public.asistencias;
create policy asistencia_ver_propia on public.asistencias for select to authenticated using(empleado_id=(select auth.uid()) or (select roly_private.es_admin()));
drop policy if exists asistencia_marcar_propia on public.asistencias;
create policy asistencia_marcar_propia on public.asistencias for insert to authenticated with check(empleado_id=(select auth.uid()) and fecha=(now() at time zone 'America/La_Paz')::date);
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('asistencias','asistencias',false,5242880,array['image/jpeg'])
on conflict(id) do update set public=false,file_size_limit=5242880,allowed_mime_types=array['image/jpeg'];
drop policy if exists asistencia_foto_subir on storage.objects;
create policy asistencia_foto_subir on storage.objects for insert to authenticated
with check(bucket_id='asistencias' and (storage.foldername(name))[1]=(select auth.uid())::text and name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.jpg$');
drop policy if exists asistencia_foto_ver on storage.objects;
create policy asistencia_foto_ver on storage.objects for select to authenticated
using(bucket_id='asistencias' and ((storage.foldername(name))[1]=(select auth.uid())::text or (select roly_private.es_admin())));
drop policy if exists asistencia_foto_borrar_propia on storage.objects;
create policy asistencia_foto_borrar_propia on storage.objects for delete to authenticated
using(bucket_id='asistencias' and (storage.foldername(name))[1]=(select auth.uid())::text);
insert into public.roly_schema_version(version) values(6) on conflict do nothing;
notify pgrst,'reload schema';
commit;
