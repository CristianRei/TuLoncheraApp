-- Primera rebanada de la sincronización de BAJADA (Supabase → celular) — ver
-- CLAUDE.md sección 11. Personal creado/editado desde el dispositivo de admin
-- (contratar, cambiar de rol, dar de baja) sube aquí para que el celular de
-- Promotor/Bodega lo pueda descargar y así alguien contratado después de
-- instalar la app pueda iniciar sesión en su propio celular.
--
-- Importante — el PIN casi nunca viaja: para Promotor/Conductor/Bodega el
-- PIN es siempre los últimos 4 dígitos de la cédula (src/core/pin.ts), así
-- que el dispositivo que descarga esta tabla lo recalcula localmente a
-- partir de `cedula` — la columna `pin` de abajo llega NULL en ese caso. Solo
-- viaja de verdad para ADMIN (PIN manual, no derivable de nada) o en el caso
-- raro de colisión (override manual distinto del derivado). Esto es
-- deliberado: con RLS "cualquier sesión autenticada puede leer" (mismo
-- modelo que el resto de esta rebanada), la anon key es pública dentro del
-- .apk — sin esto, cualquiera que la extraiga podría leer el PIN real de
-- cada empleado directo de esta tabla sin tocar ningún celular.

create table usuarios (
  id uuid primary key,                    -- mismo UUID generado en el dispositivo de admin (R3)
  nombre text not null,
  rol text not null,                      -- PROMOTOR | CONDUCTOR | BODEGA | ADMIN
  activo boolean not null,
  cedula text,
  celular text,
  direccion text,
  pin text,                               -- ver nota arriba: NULL salvo ADMIN o colisión
  ts_cliente timestamptz not null,
  dispositivo_id uuid not null,
  subido_ts timestamptz not null default now()
);

alter table usuarios enable row level security;

-- Mismo modelo de confianza que el resto de esta rebanada (CLAUDE.md sección
-- 4: "los permisos son de interfaz, no de seguridad" mientras el equipo es
-- pequeño y conocido): cualquier sesión autenticada puede leer (todo
-- dispositivo necesita poder descargar el personal) e insertar/actualizar
-- (solo el dispositivo de admin lo hace en la práctica, pero RLS no puede
-- distinguir "dispositivo de admin" de "dispositivo de promotor" con Auth
-- anónimo — la distinción hoy es de la app, no del servidor).
create policy "usuarios_select_auth" on usuarios
  for select to authenticated using (true);
create policy "usuarios_insert_auth" on usuarios
  for insert to authenticated with check (true);
create policy "usuarios_update_auth" on usuarios
  for update to authenticated using (true) with check (true);

-- Única tabla de esta rebanada con policy de DELETE: "eliminar
-- definitivamente" en Gestionar personal (src/db/personal.ts,
-- `eliminarPersonaPermanente`) es un DELETE real que también debe reflejarse
-- acá — solo aplica a una persona sin ningún historial real, protegido en
-- local por PRAGMA foreign_keys=ON antes de llegar aquí.
create policy "usuarios_delete_auth" on usuarios
  for delete to authenticated using (true);
