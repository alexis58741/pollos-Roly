-- Permite que varios cajeros trabajen al mismo tiempo en una sucursal,
-- manteniendo como máximo un turno abierto por cajero y sucursal.
begin;

drop index if exists public.un_turno_abierto_por_sucursal;

create unique index if not exists un_turno_abierto_por_cajero_sucursal
  on public.turnos_caja (sucursal_id, cajero_id)
  where cierre is null;

commit;
