-- Pollos Roly: ingreso de pollos enteros y descuento de presas al vender.
-- Ejecutar en Supabase después de database/14_personalizacion_pollo.sql.
begin;

create table if not exists public.stock_presas (
  sucursal_id uuid primary key references public.sucursales(id) on delete cascade,
  broaster_alas integer not null default 0 check (broaster_alas >= 0),
  broaster_pechugas integer not null default 0 check (broaster_pechugas >= 0),
  broaster_contras integer not null default 0 check (broaster_contras >= 0),
  broaster_piernas integer not null default 0 check (broaster_piernas >= 0),
  espiedo_alas integer not null default 0 check (espiedo_alas >= 0),
  espiedo_pechugas integer not null default 0 check (espiedo_pechugas >= 0),
  espiedo_contras integer not null default 0 check (espiedo_contras >= 0),
  espiedo_piernas integer not null default 0 check (espiedo_piernas >= 0),
  actualizado_en timestamptz not null default now()
);
-- También actualiza la tabla si ya existía con los cuatro contadores genéricos anteriores.
alter table public.stock_presas add column if not exists broaster_alas integer not null default 0 check (broaster_alas >= 0);
alter table public.stock_presas add column if not exists broaster_pechugas integer not null default 0 check (broaster_pechugas >= 0);
alter table public.stock_presas add column if not exists broaster_contras integer not null default 0 check (broaster_contras >= 0);
alter table public.stock_presas add column if not exists broaster_piernas integer not null default 0 check (broaster_piernas >= 0);
alter table public.stock_presas add column if not exists espiedo_alas integer not null default 0 check (espiedo_alas >= 0);
alter table public.stock_presas add column if not exists espiedo_pechugas integer not null default 0 check (espiedo_pechugas >= 0);
alter table public.stock_presas add column if not exists espiedo_contras integer not null default 0 check (espiedo_contras >= 0);
alter table public.stock_presas add column if not exists espiedo_piernas integer not null default 0 check (espiedo_piernas >= 0);
alter table public.stock_presas add column if not exists actualizado_en timestamptz not null default now();
alter table public.stock_presas add column if not exists preparacion_stock_migrada boolean not null default false;

-- La versión anterior no distinguía preparación. Conserva sus piezas como stock Espiedo una sola vez.
do $$ begin
  if exists(select 1 from information_schema.columns where table_schema='public' and table_name='stock_presas' and column_name='alas')
     and exists(select 1 from information_schema.columns where table_schema='public' and table_name='stock_presas' and column_name='pechugas')
     and exists(select 1 from information_schema.columns where table_schema='public' and table_name='stock_presas' and column_name='contras')
     and exists(select 1 from information_schema.columns where table_schema='public' and table_name='stock_presas' and column_name='piernas') then
    execute 'update public.stock_presas set espiedo_alas=espiedo_alas+coalesce(alas,0), espiedo_pechugas=espiedo_pechugas+coalesce(pechugas,0), espiedo_contras=espiedo_contras+coalesce(contras,0), espiedo_piernas=espiedo_piernas+coalesce(piernas,0), preparacion_stock_migrada=true where not preparacion_stock_migrada';
  else
    update public.stock_presas set preparacion_stock_migrada=true where not preparacion_stock_migrada;
  end if;
end $$;
alter table public.stock_presas enable row level security;
revoke all on public.stock_presas from anon;
grant select on public.stock_presas to authenticated;
drop policy if exists stock_presas_cajero_select on public.stock_presas;
create policy stock_presas_cajero_select on public.stock_presas for select to authenticated
  using (sucursal_id=(select roly_private.cajero_sucursal()));

create or replace function public.agregar_pollos_stock(p_sucursal uuid,p_broaster integer,p_espiedo integer)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  if p_broaster is null or p_espiedo is null or p_broaster<0 or p_espiedo<0 or p_broaster+p_espiedo<1 or p_broaster+p_espiedo>10000 then raise exception 'Indica una cantidad válida para Broaster o Espiedo.'; end if;
  if not exists(select 1 from public.perfiles p where p.id=(select auth.uid()) and p.activo and p.rol='Cajero' and p.sucursal_id=p_sucursal) then
    raise exception 'Solo el cajero asignado puede registrar pollos para su sucursal.' using errcode='42501';
  end if;
  insert into public.stock_presas as s(sucursal_id,broaster_alas,broaster_pechugas,broaster_contras,broaster_piernas,espiedo_alas,espiedo_pechugas,espiedo_contras,espiedo_piernas)
    values(p_sucursal,p_broaster*2,p_broaster*2,p_broaster*2,p_broaster*2,p_espiedo*2,p_espiedo*2,p_espiedo*2,p_espiedo*2)
    on conflict(sucursal_id) do update set broaster_alas=s.broaster_alas+excluded.broaster_alas,broaster_pechugas=s.broaster_pechugas+excluded.broaster_pechugas,
      broaster_contras=s.broaster_contras+excluded.broaster_contras,broaster_piernas=s.broaster_piernas+excluded.broaster_piernas,
      espiedo_alas=s.espiedo_alas+excluded.espiedo_alas,espiedo_pechugas=s.espiedo_pechugas+excluded.espiedo_pechugas,
      espiedo_contras=s.espiedo_contras+excluded.espiedo_contras,espiedo_piernas=s.espiedo_piernas+excluded.espiedo_piernas,actualizado_en=now();
end $$;
revoke all on function public.agregar_pollos_stock(uuid,integer,integer) from public,anon;
grant execute on function public.agregar_pollos_stock(uuid,integer,integer) to authenticated;

create or replace function roly_private.descontar_stock_presas()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_sucursal uuid; v_choice jsonb; v_piece text; v_prep text; v_column text;
begin
  if tg_op='UPDATE' and coalesce(old.personalizacion,'[]'::jsonb)=coalesce(new.personalizacion,'[]'::jsonb) then return new; end if;
  select t.sucursal_id into v_sucursal from public.pedidos p join public.turnos_caja t on t.id=p.turno_id where p.id=new.pedido_id;
  if v_sucursal is null then return new; end if;
  if tg_op='UPDATE' then
    for v_choice in select x from jsonb_array_elements(coalesce(old.personalizacion,'[]'::jsonb)) x loop
      v_piece:=v_choice->>'piece'; v_prep:=case when v_choice->>'preparation'='Broaster' then 'broaster' else 'espiedo' end;
      v_column:=v_prep||'_'||case v_piece when 'Ala' then 'alas' when 'Pechuga' then 'pechugas' when 'Contra' then 'contras' when 'Pierna' then 'piernas' else null end;
      if v_column is not null then execute format('update public.stock_presas set %I=%I+1, actualizado_en=now() where sucursal_id=$1',v_column,v_column) using v_sucursal; end if;
    end loop;
  end if;
  for v_choice in select x from jsonb_array_elements(coalesce(new.personalizacion,'[]'::jsonb)) x loop
    v_piece:=v_choice->>'piece'; v_prep:=case when v_choice->>'preparation'='Broaster' then 'broaster' else 'espiedo' end;
    v_column:=v_prep||'_'||case v_piece when 'Ala' then 'alas' when 'Pechuga' then 'pechugas' when 'Contra' then 'contras' when 'Pierna' then 'piernas' else null end;
    if v_column is not null then
      execute format('update public.stock_presas set %I=%I-1, actualizado_en=now() where sucursal_id=$1 and %I>0',v_column,v_column,v_column) using v_sucursal;
      if not found then raise exception 'No hay suficiente stock % de la presa %.',v_prep,v_piece; end if;
    end if;
  end loop;
  return new;
end $$;
drop trigger if exists detalle_pedido_stock_presas on public.detalle_pedido;
create trigger detalle_pedido_stock_presas after update of personalizacion on public.detalle_pedido
for each row execute function roly_private.descontar_stock_presas();
revoke all on function roly_private.descontar_stock_presas() from public,anon,authenticated;

insert into public.roly_schema_version(version) values(26) on conflict do nothing;
notify pgrst,'reload schema';
commit;
