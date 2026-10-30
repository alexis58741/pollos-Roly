-- Primero crea tu usuario en Supabase > Authentication > Users > Add user.
-- Correo configurado. Crea ese mismo usuario en Authentication antes de ejecutar.
-- La contraseña se introduce en Authentication, nunca en este archivo.
-- Ejecuta este archivo después de 01_pollos_roly.sql.
begin;
do $$
declare
  v_correo text := 'poncetorricoalexis@gmail.com';
  v_usuario uuid;
begin
  if v_correo='CAMBIA_ESTO_POR_TU_CORREO' or length(trim(v_correo))=0 then raise exception 'Configura tu correo de Authentication.'; end if;
  select id into strict v_usuario from auth.users where lower(email)=lower(trim(v_correo));
  if exists(select 1 from public.perfiles where activo and rol='Administrador' and id<>v_usuario) then
    raise exception 'Ya existe otro administrador. Gestiona nuevos administradores desde la aplicación conectada.';
  end if;
  insert into public.perfiles(id,nombre,correo_contacto,rol,activo)
  values(v_usuario,'Administrador',v_correo,'Administrador',true)
  on conflict(id) do update set rol='Administrador',activo=true;
end $$;
commit;
