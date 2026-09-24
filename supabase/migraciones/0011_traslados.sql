-- Traslado directo de inventario entre dos promotores, sin pasar por
-- bodega — admin planea, bodega confirma línea por línea (mismo patrón que
-- cargues/cargue_lineas). Se aplica a mano en el SQL editor del dashboard
-- de Supabase, después de 0009 y 0010.
--
-- Por qué esto vive en Supabase: bodega y admin necesitan ver, desde
-- cualquier dispositivo, un traslado planeado por admin en OTRO
-- dispositivo — mismo motivo que cargues sincroniza (R5/R6 no alcanzan
-- para eso). `_politicas_abiertas` (helper de 0009) no sirve aquí: esa
-- migración la borra al final — las políticas de abajo se escriben
-- explícitas, mismo patrón que `0010_seguridad_pin.sql`.

create table traslados (
  id uuid primary key,
  promotor_origen_id uuid not null,
  promotor_origen_nombre text not null,
  promotor_destino_id uuid not null,
  promotor_destino_nombre text not null,
  estado text not null,
  creado_por uuid,
  ts_cliente timestamptz not null,
  dispositivo_id uuid not null,
  subido_ts timestamptz not null default now()
);

create table traslado_lineas (
  id uuid primary key,
  traslado_id uuid not null references traslados (id),
  producto_id uuid not null,
  producto_sku text,
  producto_nombre text not null,
  cantidad_planeada integer not null,
  cantidad_entregada integer not null,
  estado text not null,
  motivo_revision text,
  ts_cliente timestamptz not null,
  dispositivo_id uuid not null
);

alter table traslados enable row level security;
alter table traslado_lineas enable row level security;

create policy "traslados_select_auth" on traslados for select to authenticated using (true);
create policy "traslados_insert_auth" on traslados for insert to authenticated with check (true);
create policy "traslados_update_auth" on traslados for update to authenticated using (true) with check (true);

create policy "traslado_lineas_select_auth" on traslado_lineas for select to authenticated using (true);
create policy "traslado_lineas_insert_auth" on traslado_lineas for insert to authenticated with check (true);
create policy "traslado_lineas_update_auth" on traslado_lineas for update to authenticated using (true) with check (true);

-- Cursor de descarga: `subido_ts` = hora del SERVIDOR en cada insert/update
-- (nunca el reloj del celular). Las líneas "tocan" a su cabecera, así una
-- cabecera nunca se descarga antes de que lleguen sus líneas — mismo
-- criterio que cargues (ver 0009).
create or replace function fn_tocar_subido_ts_traslados() returns trigger language plpgsql as $$
begin
  new.subido_ts := now();
  return new;
end $$;

create or replace function fn_traslado_lineas_tocan_traslado() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update traslados set subido_ts = now() where id = new.traslado_id;
  return null;
end $$;

-- Una línea ENTREGADA ya generó su TRASLADO real: si admin re-sube su copia
-- (que puede estar desactualizada) no debe deshacerla — mismo criterio que
-- cargue_lineas.
create or replace function fn_traslado_lineas_no_retroceder() returns trigger language plpgsql as $$
begin
  if old.estado = 'ENTREGADA' and new.estado <> 'ENTREGADA' then
    new.estado := old.estado;
    new.cantidad_entregada := old.cantidad_entregada;
    new.motivo_revision := old.motivo_revision;
  end if;
  return new;
end $$;

create or replace function fn_traslados_no_retroceder() returns trigger language plpgsql as $$
begin
  if old.estado = 'ENTREGADO' and new.estado <> 'ENTREGADO' then
    new.estado := old.estado;
  end if;
  return new;
end $$;

drop trigger if exists trg_traslados_subido on traslados;
create trigger trg_traslados_subido before insert or update on traslados
  for each row execute function fn_tocar_subido_ts_traslados();

drop trigger if exists trg_traslado_lineas_tocan on traslado_lineas;
create trigger trg_traslado_lineas_tocan after insert or update on traslado_lineas
  for each row execute function fn_traslado_lineas_tocan_traslado();

drop trigger if exists trg_traslado_lineas_no_retroceder on traslado_lineas;
create trigger trg_traslado_lineas_no_retroceder before update on traslado_lineas
  for each row execute function fn_traslado_lineas_no_retroceder();

drop trigger if exists trg_traslados_no_retroceder on traslados;
create trigger trg_traslados_no_retroceder before update on traslados
  for each row execute function fn_traslados_no_retroceder();

create index idx_traslados_subido on traslados (subido_ts);

-- Realtime: bodega/admin se enteran al instante de un traslado nuevo.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'traslados'
  ) then
    execute 'alter publication supabase_realtime add table public.traslados';
  end if;
end $$;

notify pgrst, 'reload schema';
