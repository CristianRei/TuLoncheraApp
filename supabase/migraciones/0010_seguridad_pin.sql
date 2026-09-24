-- Sincronización de las 3 tablas de seguridad de PIN (backoff/bloqueo por
-- dispositivo+modo, ver src/core/seguridadPin y src/db/intentosPin.ts). Se
-- aplica a mano en el SQL editor del dashboard de Supabase, después de 0009.
--
-- Por qué esto vive en Supabase y no solo en SQLite local: hoy si un
-- promotor se bloquea en su celular, el admin no puede verlo ni desbloquearlo
-- desde otro dispositivo — cada uno tiene su propio SQLite (R5/R6) y estas 3
-- tablas nunca sincronizaron aunque ya tenían dispositivo_id/ts_cliente desde
-- su creación (migración local 0009_seguridad_pin.ts). Con esto, admin ve el
-- estado de cualquier dispositivo (app/admin/intentos-pin/) y, al desbloquear
-- desde ahí, el dispositivo bloqueado se destraba solo con red (ver
-- app/index.tsx, chequeo de desbloqueo remoto mientras el estado es
-- BLOQUEADO) — sin que la persona tenga que teclear el PIN de un admin ella
-- misma. `_politicas_abiertas` (helper de 0009) no sirve aquí: esa migración
-- la borra al final (`drop function if exists _politicas_abiertas...`) por
-- ser de uso interno solo para ella misma — las políticas de abajo se
-- escriben explícitas, mismo patrón que `mensajes` (0003).

create table intentos_pin_fallidos (
  id uuid primary key,
  dispositivo_id uuid not null,
  modo text not null,
  ts_cliente timestamptz not null,
  subido_ts timestamptz not null default now()
);

create table desbloqueos_pin (
  id uuid primary key,
  dispositivo_id uuid not null,
  modo text not null,
  admin_id uuid not null,
  ts_cliente timestamptz not null,
  subido_ts timestamptz not null default now()
);

create table logins_exitosos_pin (
  id uuid primary key,
  dispositivo_id uuid not null,
  modo text not null,
  ts_cliente timestamptz not null,
  subido_ts timestamptz not null default now()
);

alter table intentos_pin_fallidos enable row level security;
alter table desbloqueos_pin enable row level security;
alter table logins_exitosos_pin enable row level security;

-- Append-only, igual criterio que turnos/comprobantes/mensajes: sin UPDATE ni
-- DELETE, nadie corrige ni borra un intento o un desbloqueo ya subido.
create policy "intentos_pin_fallidos_select_auth" on intentos_pin_fallidos for select to authenticated using (true);
create policy "intentos_pin_fallidos_insert_auth" on intentos_pin_fallidos for insert to authenticated with check (true);

create policy "desbloqueos_pin_select_auth" on desbloqueos_pin for select to authenticated using (true);
create policy "desbloqueos_pin_insert_auth" on desbloqueos_pin for insert to authenticated with check (true);

create policy "logins_exitosos_pin_select_auth" on logins_exitosos_pin for select to authenticated using (true);
create policy "logins_exitosos_pin_insert_auth" on logins_exitosos_pin for insert to authenticated with check (true);
