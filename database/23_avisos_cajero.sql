-- Permite al cajero activo leer avisos publicados para su sucursal o para todas.
-- No concede permisos de escritura; la política roly_admin conserva la gestión administrativa.
begin;

alter table public.comunicados enable row level security;
grant select on public.comunicados to authenticated;

drop policy if exists roly_cajero_avisos on public.comunicados;
create policy roly_cajero_avisos on public.comunicados
  for select to authenticated
  using (
    publicado is true
    and (select roly_private.es_cajero())
    and (sucursal_id is null or sucursal_id = (select roly_private.cajero_sucursal()))
  );

commit;
