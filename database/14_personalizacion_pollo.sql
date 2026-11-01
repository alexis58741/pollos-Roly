-- Personalización por unidad para los pedidos del cajero.
-- Requiere 11_cajero.sql, 12_cajero_pedidos.sql y 13_cajero_pagos_mixtos.sql.
begin;

alter table public.detalle_pedido
  add column if not exists personalizacion jsonb not null default '[]'::jsonb;

do $$ begin
  if not exists (
    select 1 from pg_constraint
    where conrelid='public.detalle_pedido'::regclass and conname='detalle_pedido_personalizacion_array'
  ) then
    alter table public.detalle_pedido add constraint detalle_pedido_personalizacion_array
      check (jsonb_typeof(personalizacion)='array');
  end if;

  -- Conserva la lógica de venta y stock ya instalada; los nuevos RPC solo añaden
  -- la validación y escritura del JSON de personalización.
  if to_regprocedure('public.registrar_pedido_base(uuid,text,jsonb,jsonb)') is null then
    if to_regprocedure('public.registrar_pedido(uuid,text,jsonb,jsonb)') is null then
      raise exception 'Falta registrar_pedido. Ejecuta primero database/11_cajero.sql.';
    end if;
    alter function public.registrar_pedido(uuid,text,jsonb,jsonb) rename to registrar_pedido_base;
  end if;
  if to_regprocedure('public.actualizar_pedido_cajero_mixto_base(uuid,text,jsonb,jsonb)') is null then
    if to_regprocedure('public.actualizar_pedido_cajero_mixto(uuid,text,jsonb,jsonb)') is null then
      raise exception 'Falta actualizar_pedido_cajero_mixto. Ejecuta primero database/13_cajero_pagos_mixtos.sql.';
    end if;
    alter function public.actualizar_pedido_cajero_mixto(uuid,text,jsonb,jsonb) rename to actualizar_pedido_cajero_mixto_base;
  end if;
end $$;

create or replace function roly_private.validar_personalizacion_pollo(
  p_producto uuid, p_cantidad integer, p_personalizacion jsonb
) returns void language plpgsql security definer set search_path = '' as $$
declare
  v_producto record;
  v_eleccion jsonb;
  v_acompanamientos jsonb;
  v_presa text;
  v_preparacion text;
begin
  if p_personalizacion is null or jsonb_typeof(p_personalizacion)<>'array' then
    raise exception 'La personalización del producto debe ser una lista.';
  end if;
  select requiere_seleccion,tipo_presas into v_producto from public.productos where id=p_producto;
  if not found then raise exception 'El producto no existe.'; end if;
  if not v_producto.requiere_seleccion then
    if jsonb_array_length(p_personalizacion)>0 then raise exception 'Este producto no admite personalización de pollo.'; end if;
    return;
  end if;
  if jsonb_array_length(p_personalizacion)<>p_cantidad then
    raise exception 'Configura la presa, preparación y acompañamientos de cada porción.';
  end if;
  for v_eleccion in select value from jsonb_array_elements(p_personalizacion) as e(value) loop
    if jsonb_typeof(v_eleccion)<>'object' then raise exception 'Una personalización no es válida.'; end if;
    v_presa:=v_eleccion->>'piece';
    v_preparacion:=v_eleccion->>'preparation';
    v_acompanamientos:=v_eleccion->'accompaniments';
    if v_presa is null or v_presa not in ('Pechuga','Ala','Pierna','Contra') then raise exception 'Selecciona una presa válida.'; end if;
    if (v_producto.tipo_presas='breast_wing' and v_presa not in ('Pechuga','Ala')) or
       (v_producto.tipo_presas='leg_thigh' and v_presa not in ('Pierna','Contra')) then
      raise exception 'La presa elegida no está disponible para este producto.';
    end if;
    if v_preparacion is null or v_preparacion not in ('Brasa','Broaster') then raise exception 'Selecciona Brasa o Broaster.'; end if;
    if v_acompanamientos is null or jsonb_typeof(v_acompanamientos)<>'array' then raise exception 'Selecciona los acompañamientos de la porción.'; end if;
    if exists(select 1 from jsonb_array_elements_text(v_acompanamientos) a(value) where value not in ('Arroz','Fideo','Papa')) then
      raise exception 'Hay un acompañamiento no válido.';
    end if;
    if (select count(*) from jsonb_array_elements_text(v_acompanamientos)) <>
       (select count(distinct value) from jsonb_array_elements_text(v_acompanamientos)) then raise exception 'No repitas acompañamientos.'; end if;
  end loop;
end $$;

revoke all on function roly_private.validar_personalizacion_pollo(uuid,integer,jsonb) from public,anon,authenticated;
revoke all on function public.registrar_pedido_base(uuid,text,jsonb,jsonb) from public,anon,authenticated;
revoke all on function public.actualizar_pedido_cajero_mixto_base(uuid,text,jsonb,jsonb) from public,anon,authenticated;

create or replace function public.registrar_pedido(p_turno uuid,p_cliente text,p_items jsonb,p_pagos jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_item record; v_pedido uuid;
begin
  v_pedido:=public.registrar_pedido_base(p_turno,p_cliente,p_items,p_pagos);
  if p_items is null or jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)=0 or jsonb_array_length(p_items)>100 then
    raise exception 'El pedido necesita productos.';
  end if;
  for v_item in select * from jsonb_to_recordset(p_items) as x(producto_id uuid,cantidad integer,personalizacion jsonb) loop
    if v_item.producto_id is null or v_item.cantidad is null or v_item.cantidad<1 then raise exception 'Cantidad de producto inválida.'; end if;
    perform roly_private.validar_personalizacion_pollo(v_item.producto_id,v_item.cantidad,coalesce(v_item.personalizacion,'[]'::jsonb));
  end loop;
  update public.detalle_pedido d set personalizacion=coalesce(x.personalizacion,'[]'::jsonb)
    from jsonb_to_recordset(p_items) as x(producto_id uuid,personalizacion jsonb)
    where d.pedido_id=v_pedido and d.producto_id=x.producto_id;
  return v_pedido;
end $$;

create or replace function public.actualizar_pedido_cajero_mixto(
  p_pedido uuid,p_cliente text,p_items jsonb,p_pagos jsonb
) returns void language plpgsql security definer set search_path = '' as $$
declare v_item record;
begin
  perform public.actualizar_pedido_cajero_mixto_base(p_pedido,p_cliente,p_items,p_pagos);
  if p_items is null or jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)=0 or jsonb_array_length(p_items)>100 then
    raise exception 'El pedido necesita productos.';
  end if;
  for v_item in select * from jsonb_to_recordset(p_items) as x(producto_id uuid,cantidad integer,personalizacion jsonb) loop
    if v_item.producto_id is null or v_item.cantidad is null or v_item.cantidad<1 then raise exception 'Cantidad de producto inválida.'; end if;
    perform roly_private.validar_personalizacion_pollo(v_item.producto_id,v_item.cantidad,coalesce(v_item.personalizacion,'[]'::jsonb));
  end loop;
  update public.detalle_pedido d set personalizacion=coalesce(x.personalizacion,'[]'::jsonb)
    from jsonb_to_recordset(p_items) as x(producto_id uuid,personalizacion jsonb)
    where d.pedido_id=p_pedido and d.producto_id=x.producto_id;
end $$;

revoke all on function public.registrar_pedido(uuid,text,jsonb,jsonb) from public,anon;
revoke all on function public.actualizar_pedido_cajero_mixto(uuid,text,jsonb,jsonb) from public,anon;
grant execute on function public.registrar_pedido(uuid,text,jsonb,jsonb) to authenticated;
grant execute on function public.actualizar_pedido_cajero_mixto(uuid,text,jsonb,jsonb) to authenticated;

insert into public.roly_schema_version(version) values(14) on conflict do nothing;
notify pgrst,'reload schema';
commit;
