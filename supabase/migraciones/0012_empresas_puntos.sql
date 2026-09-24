-- Empresas cliente y sus puntos (sedes) — tercera rebanada de la
-- sincronización de BAJADA (Supabase → celular), ver CLAUDE.md sección 11.
-- Admin crea empresas/puntos en su dispositivo; aquí suben para que el
-- celular del promotor/bodega los reciba. Es la base de la siguiente rebanada
-- (eventos del calendario, que referencian empresa y punto) y de descuentos
-- por punto.
--
-- Se aplica a mano en el SQL Editor del dashboard de Supabase, después de
-- 0009. IDEMPOTENTE: se puede correr las veces que haga falta.
--
-- Sin FK entre `puntos.empresa_id` y `empresas.id` a propósito, mismo
-- criterio que productos/categorías (0007): cada tabla tiene su propia tarea
-- en la cola de subida y una FK real bloquearía un punto si la subida de su
-- empresa falla un momento. De todas formas, al subir un punto la app sube
-- también su empresa (src/sync/motor.ts), y la integridad real la garantiza
-- SQLite en el dispositivo de admin, que es el único que escribe.

create table if not exists empresas (
  id uuid primary key,                    -- mismo UUID generado en el dispositivo de admin (R3)
  nombre text not null,
  direccion text,
  sector text,
  contacto text,
  ts_cliente timestamptz not null,
  dispositivo_id uuid not null,
  subido_ts timestamptz not null default now()
);

create table if not exists puntos (
  id uuid primary key,
  empresa_id uuid not null,
  nombre text not null,
  direccion text,
  activo boolean not null,
  ts_cliente timestamptz not null,
  dispositivo_id uuid not null,
  subido_ts timestamptz not null default now()
);

alter table empresas enable row level security;
alter table puntos enable row level security;

-- Mismo modelo de confianza que el resto (CLAUDE.md sección 4): cualquier
-- sesión autenticada (incluida anónima) puede leer e insertar/actualizar. Sin
-- DELETE: un punto se desactiva (activo = false), nunca se borra — puede
-- estar referenciado por ventas y eventos ya guardados.
drop policy if exists "empresas_select_auth" on empresas;
create policy "empresas_select_auth" on empresas for select to authenticated using (true);
drop policy if exists "empresas_insert_auth" on empresas;
create policy "empresas_insert_auth" on empresas for insert to authenticated with check (true);
drop policy if exists "empresas_update_auth" on empresas;
create policy "empresas_update_auth" on empresas for update to authenticated using (true) with check (true);

drop policy if exists "puntos_select_auth" on puntos;
create policy "puntos_select_auth" on puntos for select to authenticated using (true);
drop policy if exists "puntos_insert_auth" on puntos;
create policy "puntos_insert_auth" on puntos for insert to authenticated with check (true);
drop policy if exists "puntos_update_auth" on puntos;
create policy "puntos_update_auth" on puntos for update to authenticated using (true) with check (true);

-- Que la API vea las tablas nuevas de inmediato (evita "Could not find the
-- table ... in the schema cache").
notify pgrst, 'reload schema';
