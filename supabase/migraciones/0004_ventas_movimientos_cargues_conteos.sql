-- Segunda rebanada de sincronización del motor de inventario/ventas (Fase 5,
-- extiende ADR 0006): ventas, movimientos, lotes, cargues y conteos de
-- cierre suben ahora a Supabase — antes solo turnos y comprobantes lo
-- hacían. Se aplica a mano en el SQL editor del dashboard de Supabase,
-- igual que 0001 y 0003.
--
-- Dirección: SOLO subida (celular → Supabase), mismo sentido que ya existía.
-- La dirección contraria (que el celular del promotor reciba lo que el admin
-- crea — usuarios/PINs, catálogo, categorías, empresas/puntos, eventos,
-- descuentos) sigue sin construir — ver CLAUDE.md sección 10, "Falta de
-- cada fase".
--
-- Tablas angostas y desnormalizadas (mismo criterio que turnos/
-- comprobantes_venta): usuarios, productos, ubicaciones NO están
-- sincronizados todavía, así que cada fila guarda también el nombre legible
-- (producto_nombre, promotor_nombre, etc.) en vez de depender de un JOIN que
-- no se puede hacer del otro lado. Los ids "crudos" (producto_id, usuario_id,
-- ubicacion_*_id) se guardan igual, mayormente para trazabilidad — no tienen
-- REFERENCES porque esas tablas no existen aquí.

create table ventas (
  id uuid primary key,                    -- mismo UUID generado en el dispositivo (R3)
  numero_recibo text not null,
  promotor_id uuid not null,
  promotor_nombre text not null,
  punto_id uuid,
  punto_nombre text,
  cliente_nombre text,                    -- desnormalizado; `clientes` no sincroniza todavía
  ts_cliente timestamptz not null,
  metodo_pago text not null,
  total bigint not null,
  anulada boolean not null default false,
  motivo_anulacion text,
  dispositivo_id uuid not null,
  subido_ts timestamptz not null default now()
);

create table venta_items (
  venta_id uuid not null references ventas (id),
  producto_id uuid not null,
  producto_nombre text not null,
  cantidad integer not null,
  precio_unitario bigint not null,
  ts_cliente timestamptz not null,
  dispositivo_id uuid not null,
  primary key (venta_id, producto_id)
);

create table movimientos (
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

create table lotes (
  id uuid primary key,
  producto_id uuid not null,
  producto_nombre text not null,
  fecha_vencimiento date,
  ts_cliente timestamptz not null,
  dispositivo_id uuid not null
);

create table cargues (
  id uuid primary key,
  promotor_id uuid not null,
  promotor_nombre text not null,
  estado text not null,
  ts_cliente timestamptz not null,
  dispositivo_id uuid not null,
  subido_ts timestamptz not null default now()
);

create table cargue_lineas (
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

create table conteos (
  id uuid primary key,
  promotor_id uuid not null,
  promotor_nombre text not null,
  ts_cliente timestamptz not null,
  estado text not null,
  dispositivo_id uuid not null,
  subido_ts timestamptz not null default now()
);

create table conteo_lineas (
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

alter table ventas enable row level security;
alter table venta_items enable row level security;
alter table movimientos enable row level security;
alter table lotes enable row level security;
alter table cargues enable row level security;
alter table cargue_lineas enable row level security;
alter table conteos enable row level security;
alter table conteo_lineas enable row level security;

-- Mismo modelo de confianza que el resto (CLAUDE.md sección 4): cualquier
-- sesión autenticada (incluida anónima) puede leer/escribir. `upsert` desde
-- el cliente necesita INSERT + UPDATE en las tablas que pueden reenviarse
-- (una venta anulada, una línea de cargue que cambia de estado); las que son
-- puramente append-only (venta_items, movimientos, lotes, conteos,
-- conteo_lineas) igual reciben UPDATE por si un reintento de red repite un
-- upsert — nunca hay política de DELETE en ninguna.
create policy "ventas_select_auth" on ventas for select to authenticated using (true);
create policy "ventas_insert_auth" on ventas for insert to authenticated with check (true);
create policy "ventas_update_auth" on ventas for update to authenticated using (true) with check (true);

create policy "venta_items_select_auth" on venta_items for select to authenticated using (true);
create policy "venta_items_insert_auth" on venta_items for insert to authenticated with check (true);
create policy "venta_items_update_auth" on venta_items for update to authenticated using (true) with check (true);

create policy "movimientos_select_auth" on movimientos for select to authenticated using (true);
create policy "movimientos_insert_auth" on movimientos for insert to authenticated with check (true);
create policy "movimientos_update_auth" on movimientos for update to authenticated using (true) with check (true);

create policy "lotes_select_auth" on lotes for select to authenticated using (true);
create policy "lotes_insert_auth" on lotes for insert to authenticated with check (true);
create policy "lotes_update_auth" on lotes for update to authenticated using (true) with check (true);

create policy "cargues_select_auth" on cargues for select to authenticated using (true);
create policy "cargues_insert_auth" on cargues for insert to authenticated with check (true);
create policy "cargues_update_auth" on cargues for update to authenticated using (true) with check (true);

create policy "cargue_lineas_select_auth" on cargue_lineas for select to authenticated using (true);
create policy "cargue_lineas_insert_auth" on cargue_lineas for insert to authenticated with check (true);
create policy "cargue_lineas_update_auth" on cargue_lineas for update to authenticated using (true) with check (true);

create policy "conteos_select_auth" on conteos for select to authenticated using (true);
create policy "conteos_insert_auth" on conteos for insert to authenticated with check (true);
create policy "conteos_update_auth" on conteos for update to authenticated using (true) with check (true);

create policy "conteo_lineas_select_auth" on conteo_lineas for select to authenticated using (true);
create policy "conteo_lineas_insert_auth" on conteo_lineas for insert to authenticated with check (true);
create policy "conteo_lineas_update_auth" on conteo_lineas for update to authenticated using (true) with check (true);
