-- El stock de pollos/presas corresponde a una caja (turno), no a la sucursal.
-- Ejecutar después de database/26_stock_presas.sql.
begin;

create table if not exists public.stock_presas_turno (
  turno_id uuid primary key references public.turnos_caja(id) on delete cascade,
  sucursal_id uuid not null references public.sucursales(id) on delete cascade,
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

-- Conserva el saldo de la caja que está abierta al instalar la migración.
-- Las cajas nuevas no tienen fila hasta que se registren pollos y por eso arrancan en cero.
with turnos_actuales as (
  select t.id,t.sucursal_id,row_number() over(partition by t.sucursal_id order by t.apertura,t.id) as orden
    from public.turnos_caja t where t.cierre is null
)
insert into public.stock_presas_turno(
  turno_id,sucursal_id,broaster_alas,broaster_pechugas,broaster_contras,broaster_piernas,
  espiedo_alas,espiedo_pechugas,espiedo_contras,espiedo_piernas
)
select t.id,t.sucursal_id,s.broaster_alas,s.broaster_pechugas,s.broaster_contras,s.broaster_piernas,
       s.espiedo_alas,s.espiedo_pechugas,s.espiedo_contras,s.espiedo_piernas
  from turnos_actuales t
  join public.stock_presas s on s.sucursal_id=t.sucursal_id
 where t.orden=1
on conflict(turno_id) do nothing;

alter table public.stock_presas_turno enable row level security;
revoke all on public.stock_presas_turno from anon,authenticated;
grant select on public.stock_presas_turno to authenticated;
drop policy if exists stock_presas_turno_cajero_select on public.stock_presas_turno;
create policy stock_presas_turno_cajero_select on public.stock_presas_turno for select to authenticated
  using (
    exists(select 1 from public.turnos_caja t
      where t.id=turno_id and t.cajero_id=(select auth.uid()) and t.cierre is null)
  );

drop function if exists public.agregar_pollos_stock(uuid,integer,integer);
create or replace function public.agregar_pollos_stock(p_turno uuid,p_broaster integer,p_espiedo integer)
returns void
language plpgsql security definer set search_path = '' as $$
declare v_sucursal uuid;
begin
  if p_broaster is null or p_espiedo is null or p_broaster<0 or p_espiedo<0
     or p_broaster+p_espiedo<1 or p_broaster+p_espiedo>10000 then
    raise exception 'Indica una cantidad válida para Broaster o Espiedo.' using errcode='22023';
  end if;
  select t.sucursal_id into v_sucursal
    from public.turnos_caja t
    join public.perfiles p on p.id=t.cajero_id
   where t.id=p_turno and t.cajero_id=(select auth.uid()) and t.cierre is null
     and p.activo and p.rol='Cajero' and p.sucursal_id=t.sucursal_id
   for update of t;
  if not found then raise exception 'Abre una caja para registrar pollos en este turno.' using errcode='42501'; end if;

  insert into public.stock_presas_turno as s(
    turno_id,sucursal_id,broaster_alas,broaster_pechugas,broaster_contras,broaster_piernas,
    espiedo_alas,espiedo_pechugas,espiedo_contras,espiedo_piernas
  ) values(p_turno,v_sucursal,p_broaster*2,p_broaster*2,p_broaster*2,p_broaster*2,p_espiedo*2,p_espiedo*2,p_espiedo*2,p_espiedo*2)
  on conflict(turno_id) do update set
    broaster_alas=s.broaster_alas+excluded.broaster_alas,
    broaster_pechugas=s.broaster_pechugas+excluded.broaster_pechugas,
    broaster_contras=s.broaster_contras+excluded.broaster_contras,
    broaster_piernas=s.broaster_piernas+excluded.broaster_piernas,
    espiedo_alas=s.espiedo_alas+excluded.espiedo_alas,
    espiedo_pechugas=s.espiedo_pechugas+excluded.espiedo_pechugas,
    espiedo_contras=s.espiedo_contras+excluded.espiedo_contras,
    espiedo_piernas=s.espiedo_piernas+excluded.espiedo_piernas,
    actualizado_en=now();
end $$;
revoke all on function public.agregar_pollos_stock(uuid,integer,integer) from public,anon;
grant execute on function public.agregar_pollos_stock(uuid,integer,integer) to authenticated;

create or replace function roly_private.descontar_stock_presas()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_turno uuid; v_choice jsonb; v_piece text; v_prep text; v_column text; v_filas bigint;
begin
  if tg_op='UPDATE' and coalesce(old.personalizacion,'[]'::jsonb)=coalesce(new.personalizacion,'[]'::jsonb) then return new; end if;
  select p.turno_id into v_turno from public.pedidos p where p.id=new.pedido_id;
  if v_turno is null then return new; end if;

  if tg_op='UPDATE' then
    for v_choice in select x from jsonb_array_elements(coalesce(old.personalizacion,'[]'::jsonb)) x loop
      v_piece:=v_choice->>'piece';
      v_prep:=case v_choice->>'preparation' when 'Broaster' then 'broaster' when 'Espiedo' then 'espiedo' else null end;
      if v_prep is null then raise exception 'La preparación anterior de la presa no es válida.'; end if;
      v_column:=v_prep||'_'||case v_piece when 'Ala' then 'alas' when 'Pechuga' then 'pechugas' when 'Contra' then 'contras' when 'Pierna' then 'piernas' else null end;
      if v_column is null then raise exception 'La presa anterior no es válida.'; end if;
      execute format('update public.stock_presas_turno set %I=%I+1, actualizado_en=now() where turno_id=$1',v_column,v_column) using v_turno;
    end loop;
  end if;

  for v_choice in select x from jsonb_array_elements(coalesce(new.personalizacion,'[]'::jsonb)) x loop
    v_piece:=v_choice->>'piece';
    v_prep:=case v_choice->>'preparation' when 'Broaster' then 'broaster' when 'Espiedo' then 'espiedo' else null end;
    if v_prep is null then raise exception 'La preparación seleccionada no es válida.'; end if;
    v_column:=v_prep||'_'||case v_piece when 'Ala' then 'alas' when 'Pechuga' then 'pechugas' when 'Contra' then 'contras' when 'Pierna' then 'piernas' else null end;
    if v_column is null then raise exception 'La presa seleccionada no es válida.'; end if;
    execute format('update public.stock_presas_turno set %I=%I-1, actualizado_en=now() where turno_id=$1 and %I>0',v_column,v_column,v_column) using v_turno;
    get diagnostics v_filas = row_count;
    if v_filas=0 then raise exception 'No hay suficiente stock % de la presa % en esta caja.',v_prep,v_piece; end if;
  end loop;
  return new;
end $$;
revoke all on function roly_private.descontar_stock_presas() from public,anon,authenticated;

insert into public.roly_schema_version(version) values(32) on conflict do nothing;
notify pgrst,'reload schema';
commit;
