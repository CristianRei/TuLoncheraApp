-- Segunda rebanada de la sincronización de BAJADA (Supabase → celular) — ver
-- CLAUDE.md sección 11. Catálogo de productos y categorías creado/editado
-- desde el dispositivo de admin sube aquí para que Promotor/Bodega lo
-- descarguen: un producto nuevo o una categoría nueva no le llegaba al
-- celular del promotor/bodega hasta ahora.
--
-- Sin FK entre `productos.categoria_id` y `categorias.id` a propósito: cada
-- tabla tiene su propia tarea en la cola de sync local (`_sync_pendiente`) y
-- se sube de forma independiente — si la tarea de una categoría fallara
-- momentáneamente mientras la del producto que la usa sí llega a subir, una
-- FK real dejaría esa fila de producto bloqueada hasta el próximo reintento
-- exitoso de la categoría. La integridad real (que la categoría exista antes
-- que el producto) ya la garantiza SQLite local (PRAGMA foreign_keys=ON)
-- del lado de admin, que es el único que escribe.
--
-- Sin `foto_uri`: es una URI local del dispositivo que la tomó, no sirve en
-- otro — queda fuera de esta rebanada (ver CLAUDE.md sección 11, tema
-- pendiente de tratar aparte).

create table categorias (
  id uuid primary key,                    -- mismo UUID generado en el dispositivo de admin (R3)
  nombre text not null,
  nombre_normalizado text not null,
  activo boolean not null,
  ts_cliente timestamptz not null,
  dispositivo_id uuid not null,
  subido_ts timestamptz not null default now()
);

create table productos (
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

alter table categorias enable row level security;
alter table productos enable row level security;

-- Mismo modelo de confianza que el resto de esta rebanada (CLAUDE.md sección
-- 4): cualquier sesión autenticada puede leer (todo dispositivo necesita
-- poder descargar el catálogo) e insertar/actualizar (solo el dispositivo de
-- admin lo hace en la práctica). Sin policy de DELETE en ninguna de las dos
-- — igual que productos/categorías en local, "eliminar" es activo=0.
create policy "categorias_select_auth" on categorias
  for select to authenticated using (true);
create policy "categorias_insert_auth" on categorias
  for insert to authenticated with check (true);
create policy "categorias_update_auth" on categorias
  for update to authenticated using (true) with check (true);

create policy "productos_select_auth" on productos
  for select to authenticated using (true);
create policy "productos_insert_auth" on productos
  for insert to authenticated with check (true);
create policy "productos_update_auth" on productos
  for update to authenticated using (true) with check (true);
