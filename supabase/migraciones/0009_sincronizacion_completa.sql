-- SINCRONIZACIÓN COMPLETA — script único e IDEMPOTENTE (se puede correr las
-- veces que haga falta, con cualquier subconjunto de 0003-0008 ya aplicado).
-- Reúne todo lo de 0003 a 0008 y agrega lo nuevo:
--   * columnas de "clave natural" (producto_sku, responsables de ubicación)
--     para que cada dispositivo pueda traducir los ids de otro dispositivo,
--   * triggers que actualizan `subido_ts` en cada cambio (cursor de descarga),
--   * protección para que una línea de cargue ENTREGADA no retroceda,
--   * Realtime (ventas, cargues, movimientos, conteos) para verlos al instante.
--
-- Requiere haber corrido ANTES, una sola vez: 0001 (turnos y comprobantes) y
-- 0002 (políticas de Storage). Después, para todo lo demás, basta este archivo.
-- Se aplica a mano en el SQL Editor del dashboard de Supabase.

-- ---------------------------------------------------------------------------
-- Ayudante: políticas RLS abiertas a cualquier sesión autenticada (incluida
-- anónima) — mismo modelo de confianza que el resto de la app (CLAUDE.md
-- sección 4). Se borra al final.
-- ---------------------------------------------------------------------------
create or replace function _politicas_abiertas(tabla text, con_update boolean, con_delete boolean)
returns void language plpgsql as $$
begin
  execute format('alter table %I enable row level security', tabla);
  execute format('drop policy if exists %I on %I', tabla || '_select_auth', tabla);
  execute format('create policy %I on %I for select to authenticated using (true)', tabla || '_select_auth', tabla);
  execute format('drop policy if exists %I on %I', tabla || '_insert_auth', tabla);
  execute format('create policy %I on %I for insert to authenticated with check (true)', tabla || '_insert_auth', tabla);
  if con_update then
    execute format('drop policy if exists %I on %I', tabla || '_update_auth', tabla);
    execute format('create policy %I on %I for update to authenticated using (true) with check (true)', tabla || '_update_auth', tabla);
  end if;
  if con_delete then
    execute format('drop policy if exists %I on %I', tabla || '_delete_auth', tabla);
    execute format('create policy %I on %I for delete to authenticated using (true)', tabla || '_delete_auth', tabla);
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Personal / catálogo (bajada) — antes 0006 y 0007
-- ---------------------------------------------------------------------------
create table if not exists usuarios (
  id uuid primary key,
  nombre text not null,
  rol text not null,
  activo boolean not null,
  cedula text,
  celular text,
  direccion text,
  pin text,                      -- NULL salvo ADMIN o colisión: el PIN derivado de cédula nunca viaja
  ts_cliente timestamptz not null,
  dispositivo_id uuid not null,
  subido_ts timestamptz not null default now()
);

create table if not exists categorias (
  id uuid primary key,
  nombre text not null,
  nombre_normalizado text not null,
  activo boolean not null,
  ts_cliente timestamptz not null,
  dispositivo_id uuid not null,
  subido_ts timestamptz not null default now()
);

create table if not exists productos (
  id uuid primary key,
  sku text not null,
  codigo_barras text,
  nombre text not null,
  categoria_id uuid,
  marca text,
  es_licor boolean not null,
  es_perecedero boolean not null,
  precio bigint not null,
  costo bigint,
  unidad_empaque integer not null,
  activo boolean not null,
  ts_cliente timestamptz not null,
  dispositivo_id uuid not null,
  subido_ts timestamptz not null default now()
);

select _politicas_abiertas('usuarios', true, true);
select _politicas_abiertas('categorias', true, false);
select _politicas_abiertas('productos', true, false);

-- ---------------------------------------------------------------------------
-- Mensajes / notificaciones push — antes 0003
-- ---------------------------------------------------------------------------
create table if not exists push_tokens (
  usuario_id uuid primary key,
  dispositivo_id uuid not null,
  expo_push_token text not null,
  rol text not null,
  activo boolean not null default true,
  actualizado_ts timestamptz not null default now()
);

create table if not exists mensajes (
  id uuid primary key,
  cuerpo text not null,
  tipo text not null,
  creado_por uuid not null,
  creado_por_nombre text not null,
  ts_cliente timestamptz not null
);

create table if not exists mensaje_destinatarios (
  mensaje_id uuid not null references mensajes (id),
  destinatario_id uuid not null,
  leida boolean not null default false,
  primary key (mensaje_id, destinatario_id)
);

select _politicas_abiertas('push_tokens', true, false);
select _politicas_abiertas('mensajes', false, false);
select _politicas_abiertas('mensaje_destinatarios', true, false);

-- ---------------------------------------------------------------------------
-- Motor de inventario / ventas — antes 0004 y 0005
-- ---------------------------------------------------------------------------
create table if not exists ventas (
  id uuid primary key,
  numero_recibo text not null,
  promotor_id uuid not null,
  promotor_nombre text not null,
  punto_id uuid,
  punto_nombre text,
  cliente_nombre text,
  ts_cliente timestamptz not null,
  metodo_pago text not null,
  total bigint not null,
  anulada boolean not null default false,
  motivo_anulacion text,
  dispositivo_id uuid not null,
  subido_ts timestamptz not null default now()
);

create table if not exists venta_items (
  venta_id uuid not null references ventas (id),
  producto_id uuid not null,
  producto_nombre text not null,
  cantidad integer not null,
  precio_unitario bigint not null,
  ts_cliente timestamptz not null,
  dispositivo_id uuid not null,
  primary key (venta_id, producto_id)
);
alter table venta_items add column if not exists producto_sku text;

create table if not exists movimientos (
  id uuid primary key,
  tipo text not null,
  producto_id uuid not null,
  producto_nombre text not null,
  cantidad integer not null,
  ubicacion_origen_tipo text,
  ubicacion_origen_nombre text,
  ubicacion_destino_tipo text,
  ubicacion_destino_nombre text,
  usuario_id uuid not null,
  usuario_nombre text not null,
  motivo text,
  ts_cliente timestamptz not null,
  dispositivo_id uuid not null,
  subido_ts timestamptz not null default now()
);
alter table movimientos add column if not exists producto_sku text;
alter table movimientos add column if not exists ubicacion_origen_responsable_id uuid;
alter table movimientos add column if not exists ubicacion_destino_responsable_id uuid;

create table if not exists lotes (
  id uuid primary key,
  producto_id uuid not null,
  producto_nombre text not null,
  fecha_vencimiento date,
  ts_cliente timestamptz not null,
  dispositivo_id uuid not null
);

create table if not exists cargues (
  id uuid primary key,
  promotor_id uuid not null,
  promotor_nombre text not null,
  estado text not null,
  ts_cliente timestamptz not null,
  dispositivo_id uuid not null,
  subido_ts timestamptz not null default now()
);
alter table cargues add column if not exists creado_por uuid;

create table if not exists cargue_lineas (
  id uuid primary key,
  cargue_id uuid not null references cargues (id),
  producto_id uuid not null,
  producto_nombre text not null,
  cantidad_planeada integer not null,
  cantidad_entregada integer not null,
  estado text not null,
  motivo_revision text,
  ts_cliente timestamptz not null,
  dispositivo_id uuid not null
);
alter table cargue_lineas add column if not exists producto_sku text;

create table if not exists conteos (
  id uuid primary key,
  promotor_id uuid not null,
  promotor_nombre text not null,
  ts_cliente timestamptz not null,
  estado text not null,
  dispositivo_id uuid not null,
  subido_ts timestamptz not null default now()
);

create table if not exists conteo_lineas (
  conteo_id uuid not null references conteos (id),
  producto_id uuid not null,
  producto_nombre text not null,
  teorico integer not null,
  contado integer not null,
  diferencia integer not null,
  motivo text,
  ts_cliente timestamptz not null,
  dispositivo_id uuid not null,
  primary key (conteo_id, producto_id)
);
alter table conteo_lineas add column if not exists producto_sku text;

create table if not exists arqueos_caja (
  id uuid primary key,
  turno_id uuid not null unique,
  promotor_id uuid not null,
  promotor_nombre text not null,
  efectivo_teorico bigint not null,
  efectivo_contado bigint not null,
  diferencia bigint not null,
  total_transferencia bigint not null,
  total_libranza bigint not null,
  ts_cliente timestamptz not null,
  dispositivo_id uuid not null,
  subido_ts timestamptz not null default now()
);

select _politicas_abiertas('ventas', true, false);
select _politicas_abiertas('venta_items', true, false);
select _politicas_abiertas('movimientos', true, false);
select _politicas_abiertas('lotes', true, false);
select _politicas_abiertas('cargues', true, false);
select _politicas_abiertas('cargue_lineas', true, false);
select _politicas_abiertas('conteos', true, false);
select _politicas_abiertas('conteo_lineas', true, false);
-- arqueos_caja y comprobantes_venta necesitan UPDATE para que un reintento
-- de `upsert` tras una subida ya exitosa no falle para siempre (antes 0008).
select _politicas_abiertas('arqueos_caja', true, false);
drop policy if exists "comprobantes_update_auth" on comprobantes_venta;
create policy "comprobantes_update_auth" on comprobantes_venta
  for update to authenticated using (true) with check (true);

-- ---------------------------------------------------------------------------
-- Cursor de descarga: `subido_ts` = hora del SERVIDOR en cada insert/update
-- (nunca el reloj del celular). Las líneas hijas "tocan" a su cabecera, así
-- una cabecera nunca se descarga antes de que lleguen sus líneas: quien
-- descarga la vuelve a traer cuando sus líneas la actualizan.
-- ---------------------------------------------------------------------------
create or replace function fn_tocar_subido_ts() returns trigger language plpgsql as $$
begin
  new.subido_ts := now();
  return new;
end $$;

create or replace function fn_venta_items_tocan_venta() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update ventas set subido_ts = now() where id = new.venta_id;
  return null;
end $$;

create or replace function fn_cargue_lineas_tocan_cargue() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update cargues set subido_ts = now() where id = new.cargue_id;
  return null;
end $$;

create or replace function fn_conteo_lineas_tocan_conteo() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update conteos set subido_ts = now() where id = new.conteo_id;
  return null;
end $$;

-- Una línea ENTREGADA ya generó su RECARGA en bodega: si admin re-sube su copia
-- (que puede estar desactualizada) no debe deshacerla.
create or replace function fn_cargue_lineas_no_retroceder() returns trigger language plpgsql as $$
begin
  if old.estado = 'ENTREGADA' and new.estado <> 'ENTREGADA' then
    new.estado := old.estado;
    new.cantidad_entregada := old.cantidad_entregada;
    new.motivo_revision := old.motivo_revision;
  end if;
  return new;
end $$;

create or replace function fn_cargues_no_retroceder() returns trigger language plpgsql as $$
begin
  if old.estado = 'ENTREGADO' and new.estado <> 'ENTREGADO' then
    new.estado := old.estado;
  end if;
  return new;
end $$;

drop trigger if exists trg_ventas_subido on ventas;
create trigger trg_ventas_subido before insert or update on ventas
  for each row execute function fn_tocar_subido_ts();
drop trigger if exists trg_movimientos_subido on movimientos;
create trigger trg_movimientos_subido before insert or update on movimientos
  for each row execute function fn_tocar_subido_ts();
drop trigger if exists trg_cargues_subido on cargues;
create trigger trg_cargues_subido before insert or update on cargues
  for each row execute function fn_tocar_subido_ts();
drop trigger if exists trg_conteos_subido on conteos;
create trigger trg_conteos_subido before insert or update on conteos
  for each row execute function fn_tocar_subido_ts();

drop trigger if exists trg_venta_items_tocan on venta_items;
create trigger trg_venta_items_tocan after insert or update on venta_items
  for each row execute function fn_venta_items_tocan_venta();
drop trigger if exists trg_cargue_lineas_tocan on cargue_lineas;
create trigger trg_cargue_lineas_tocan after insert or update on cargue_lineas
  for each row execute function fn_cargue_lineas_tocan_cargue();
drop trigger if exists trg_conteo_lineas_tocan on conteo_lineas;
create trigger trg_conteo_lineas_tocan after insert or update on conteo_lineas
  for each row execute function fn_conteo_lineas_tocan_conteo();

drop trigger if exists trg_cargue_lineas_no_retroceder on cargue_lineas;
create trigger trg_cargue_lineas_no_retroceder before update on cargue_lineas
  for each row execute function fn_cargue_lineas_no_retroceder();
drop trigger if exists trg_cargues_no_retroceder on cargues;
create trigger trg_cargues_no_retroceder before update on cargues
  for each row execute function fn_cargues_no_retroceder();

create index if not exists idx_ventas_subido on ventas (subido_ts);
create index if not exists idx_movimientos_subido on movimientos (subido_ts);
create index if not exists idx_cargues_subido on cargues (subido_ts);
create index if not exists idx_conteos_subido on conteos (subido_ts);
create index if not exists idx_movimientos_origen_resp on movimientos (ubicacion_origen_responsable_id);
create index if not exists idx_movimientos_destino_resp on movimientos (ubicacion_destino_responsable_id);

-- ---------------------------------------------------------------------------
-- Realtime: el admin/bodega/promotor se enteran al instante de un cambio.
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['ventas', 'cargues', 'movimientos', 'conteos'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

drop function if exists _politicas_abiertas(text, boolean, boolean);

-- Que la API (PostgREST) vea de inmediato las tablas y columnas nuevas — sin
-- esto puede seguir respondiendo "Could not find the table ... in the schema
-- cache" unos minutos.
notify pgrst, 'reload schema';
