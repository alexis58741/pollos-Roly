-- Elimina una cuenta de Auth solo si no tiene actividad que deba conservarse.
-- Las llaves foráneas protegen asistencias, pedidos, turnos, compras y otros historiales.
begin;

create or replace function public.eliminar_usuario_sistema(p_usuario uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform roly_private.exigir_admin();

  if p_usuario is null then
    raise exception 'Selecciona un usuario válido.' using errcode = '22023';
  end if;

  if p_usuario = (select auth.uid()) then
    raise exception 'usuario_propio' using errcode = '42501';
  end if;

  if not exists (select 1 from auth.users where id = p_usuario) then
    raise exception 'El usuario ya no existe. Actualiza la pantalla.' using errcode = 'P0002';
  end if;

  -- El directorio de nómina no tiene FK a perfiles; retirar también su fila espejo.
  -- Si hay pagos, la FK de pagos_personal aborta toda la operación y conserva ambas filas.
  delete from public.personal_operativo where id = p_usuario;
  delete from auth.users where id = p_usuario;
exception
  when foreign_key_violation then
    raise exception 'usuario_con_historial' using errcode = '23503';
end;
$$;

revoke all on function public.eliminar_usuario_sistema(uuid) from public, anon, authenticated;
grant execute on function public.eliminar_usuario_sistema(uuid) to authenticated;

commit;
