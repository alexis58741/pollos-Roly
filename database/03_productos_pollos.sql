-- POLLOS ROLY · Formulario completo de productos y categoría Pollos.
-- Ejecutar COMPLETO en SQL Editor de Supabase, después de 01 y 02.
-- Conserva los productos, precios y pedidos existentes. Se puede repetir.
begin;
alter table public.productos
  add column if not exists descripcion text not null default '',
  add column if not exists precio_oferta numeric(12,2),
  add column if not exists en_oferta boolean not null default false,
  add column if not exists foto_path text not null default '',
  add column if not exists orden integer not null default 1,
  add column if not exists requiere_seleccion boolean not null default false,
  add column if not exists tipo_presas text not null default 'all';
alter table public.productos drop constraint if exists productos_descripcion_valida;
alter table public.productos add constraint productos_descripcion_valida check(length(descripcion)<=2000);
alter table public.productos drop constraint if exists productos_oferta_valida;
alter table public.productos add constraint productos_oferta_valida check(
  (precio_oferta is null or (precio_oferta>0 and precio_oferta<precio)) and
  (not en_oferta or precio_oferta is not null)
);
alter table public.productos drop constraint if exists productos_orden_valido;
alter table public.productos add constraint productos_orden_valido check(orden between 1 and 9999);
alter table public.productos drop constraint if exists productos_presas_validas;
alter table public.productos add constraint productos_presas_validas check(tipo_presas in ('leg_thigh','breast_wing','all'));
alter table public.productos drop constraint if exists productos_foto_valida;
alter table public.productos add constraint productos_foto_valida check(foto_path='' or foto_path ~ ('^' || id::text || '/[0-9a-f-]{36}\.(jpg|png|webp)$'));
create index if not exists productos_orden_idx on public.productos(orden,nombre);

-- El servidor del pedido también respeta la oferta; el historial no se recalcula.
create or replace function public.registrar_pedido(p_turno uuid,p_cliente text,p_items jsonb,p_pagos jsonb) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_turno public.turnos_caja; v_producto record; v_item record; v_id uuid; v_total numeric:=0; v_suma numeric; v_stock integer; v_snack boolean;
begin
  perform roly_private.exigir_admin();
  select * into v_turno from public.turnos_caja where id=p_turno for update;
  if not found or v_turno.cierre is not null then raise exception 'Abre un turno para registrar pedidos.'; end if;
  if p_items is null or jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)=0 then raise exception 'El pedido necesita productos.'; end if;
  if p_pagos is null or jsonb_typeof(p_pagos)<>'array' or jsonb_array_length(p_pagos)=0 then raise exception 'El pedido necesita pagos.'; end if;
  if exists(select 1 from jsonb_to_recordset(p_items) as x(producto_id uuid,cantidad numeric) where producto_id is null or cantidad is null or cantidad<=0 or cantidad<>trunc(cantidad) or cantidad>100000) then raise exception 'Cantidad de producto inválida.'; end if;
  if (select count(*) from jsonb_to_recordset(p_items) as x(producto_id uuid))<>(select count(distinct producto_id) from jsonb_to_recordset(p_items) as x(producto_id uuid)) then raise exception 'Agrupa los productos repetidos en una sola línea.'; end if;
  for v_item in select * from jsonb_to_recordset(p_items) as x(producto_id uuid,cantidad integer) order by producto_id loop
    select (case when p.en_oferta then p.precio_oferta else p.precio end) as precio,p.activo,c.activa into v_producto from public.productos p join public.categorias c on c.id=p.categoria_id where p.id=v_item.producto_id for share of p,c;
    if not found or not v_producto.activo or not v_producto.activa then raise exception 'Producto o categoría no disponible.'; end if;
    v_total:=v_total+v_producto.precio*v_item.cantidad;
  end loop;
  if exists(select 1 from jsonb_to_recordset(p_pagos) as x(metodo text,monto numeric) where metodo is null or metodo not in ('Efectivo','QR','Tarjeta') or monto is null or monto<=0 or monto<>round(monto,2)) then raise exception 'Método o monto de pago inválido.'; end if;
  select sum(monto) into v_suma from jsonb_to_recordset(p_pagos) as x(metodo text,monto numeric);
  if v_suma<>v_total then raise exception 'Los pagos deben sumar exactamente el total del pedido.'; end if;
  insert into public.pedidos(sucursal_id,turno_id,cliente,total,creado_por) values(v_turno.sucursal_id,p_turno,coalesce(nullif(trim(p_cliente),''),'Cliente de mostrador'),v_total,auth.uid()) returning id into v_id;
  for v_item in select * from jsonb_to_recordset(p_items) as x(producto_id uuid,cantidad integer) order by producto_id loop
    select p.nombre,(case when p.en_oferta then p.precio_oferta else p.precio end) as precio,lower(trim(c.nombre))='snacks' as snack into v_producto from public.productos p join public.categorias c on c.id=p.categoria_id where p.id=v_item.producto_id;
    v_snack:=v_producto.snack;
    if v_snack then
      select cantidad into v_stock from public.stock_snacks where producto_id=v_item.producto_id and sucursal_id=v_turno.sucursal_id for update;
      if not found or v_stock<v_item.cantidad then raise exception 'Stock insuficiente para %.',v_producto.nombre; end if;
      update public.stock_snacks set cantidad=cantidad-v_item.cantidad where producto_id=v_item.producto_id and sucursal_id=v_turno.sucursal_id;
    end if;
    insert into public.detalle_pedido(pedido_id,producto_id,nombre_producto,cantidad,precio_unitario,descuenta_stock) values(v_id,v_item.producto_id,v_producto.nombre,v_item.cantidad,v_producto.precio,v_snack);
  end loop;
  insert into public.pagos_pedido(pedido_id,metodo,monto) select v_id,metodo,sum(monto) from jsonb_to_recordset(p_pagos) as x(metodo text,monto numeric) group by metodo;
  return v_id;
end $$;

-- Fotos públicas del menú. Solo administradores activos pueden subir/listar/eliminar.
-- Los archivos se reemplazan con nombres nuevos; no se permiten sobreescrituras.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('productos','productos',true,5242880,array['image/jpeg','image/png','image/webp'])
on conflict(id) do update set public=excluded.public,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
drop policy if exists roly_productos_fotos_leer on storage.objects;
create policy roly_productos_fotos_leer on storage.objects for select to authenticated
using(bucket_id='productos' and (select roly_private.es_admin()));
drop policy if exists roly_productos_fotos_subir on storage.objects;
create policy roly_productos_fotos_subir on storage.objects for insert to authenticated
with check(bucket_id='productos' and (select roly_private.es_admin()) and name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.(jpg|png|webp)$');
drop policy if exists roly_productos_fotos_borrar on storage.objects;
create policy roly_productos_fotos_borrar on storage.objects for delete to authenticated
using(bucket_id='productos' and (select roly_private.es_admin()));
insert into public.roly_schema_version(version) values(3) on conflict do nothing;
notify pgrst, 'reload schema';
commit;
