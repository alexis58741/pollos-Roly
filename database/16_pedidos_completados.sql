-- Marca como completados los pedidos nuevos del punto de venta.
begin;

do $$
begin
  if to_regclass('public.pedidos') is null then
    raise exception 'Falta la tabla public.pedidos. Ejecuta primero las migraciones base de Pollos Roly.';
  end if;
end $$;

create or replace function roly_private.completar_pedido_al_crear()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  new.estado := 'Entregado';
  return new;
end $$;

revoke all on function roly_private.completar_pedido_al_crear()
  from public, anon, authenticated;

drop trigger if exists pedidos_completar_al_crear on public.pedidos;
create trigger pedidos_completar_al_crear
before insert on public.pedidos
for each row execute function roly_private.completar_pedido_al_crear();

insert into public.roly_schema_version(version) values (16)
on conflict do nothing;

notify pgrst, 'reload schema';
commit;
