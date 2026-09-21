-- Primera rebanada de sincronización (Fase 5) — solo turnos y comprobantes
-- de transferencia. Se aplica a mano en el SQL editor del dashboard de
-- Supabase (no hay CLI de Supabase en este repo todavía). Ver el ADR
-- correspondiente en docs/03-decisiones/ para el razonamiento completo.
--
-- Tablas angostas: `ventas` sigue siendo 100% local en esta rebanada, aquí
-- solo se sincroniza lo mínimo para que el admin verifique un comprobante
-- sin tener que sincronizar todo el motor de ventas.

create table turnos (
  id uuid primary key,                    -- mismo UUID generado en el dispositivo (R3)
  promotor_id uuid not null,
  promotor_nombre text not null,          -- desnormalizado: no hay `usuarios` sincronizada aún
  selfie_path text not null,              -- ruta dentro del bucket, no URL firmada
  latitud double precision,
  longitud double precision,
  hora_inicio timestamptz not null,
  hora_fin timestamptz,
  ts_cliente timestamptz not null,
  dispositivo_id uuid not null,
  subido_ts timestamptz not null default now()
);

create table comprobantes_venta (
  venta_id uuid primary key,              -- mismo UUID de `ventas.id` local
  promotor_id uuid not null,
  promotor_nombre text not null,
  numero_recibo text not null,
  total bigint not null,
  comprobante_path text not null,
  ts_cliente timestamptz not null,
  dispositivo_id uuid not null,
  subido_ts timestamptz not null default now()
);

alter table turnos enable row level security;
alter table comprobantes_venta enable row level security;

-- Lectura: cualquier sesión autenticada (incluida anónima) — mismo modelo
-- de confianza que ya admite CLAUDE.md sección 4 ("los permisos son de
-- interfaz, no de seguridad" mientras el equipo es pequeño y conocido).
create policy "turnos_select_auth" on turnos
  for select to authenticated using (true);
create policy "comprobantes_select_auth" on comprobantes_venta
  for select to authenticated using (true);

-- Alta: cualquier sesión autenticada puede insertar su propio turno/comprobante.
create policy "turnos_insert_auth" on turnos
  for insert to authenticated with check (true);
create policy "comprobantes_insert_auth" on comprobantes_venta
  for insert to authenticated with check (true);

-- Único UPDATE permitido: cerrar el propio turno (hora_fin). RLS de Postgres
-- no puede restringir a nivel de columna por sí sola, así que el trigger de
-- abajo refuerza que ningún otro campo cambie — mismo espíritu de
-- inmutabilidad que R1/R2 exigen en SQLite local.
create policy "turnos_update_solo_cierre" on turnos
  for update to authenticated using (true) with check (true);

create or replace function fn_turnos_solo_hora_fin()
returns trigger as $$
begin
  if new.id is distinct from old.id
    or new.promotor_id is distinct from old.promotor_id
    or new.promotor_nombre is distinct from old.promotor_nombre
    or new.selfie_path is distinct from old.selfie_path
    or new.latitud is distinct from old.latitud
    or new.longitud is distinct from old.longitud
    or new.hora_inicio is distinct from old.hora_inicio
    or new.ts_cliente is distinct from old.ts_cliente
    or new.dispositivo_id is distinct from old.dispositivo_id
  then
    raise exception 'Solo se puede actualizar hora_fin en turnos.';
  end if;
  return new;
end;
$$ language plpgsql;

create trigger trg_turnos_solo_hora_fin
  before update on turnos
  for each row execute function fn_turnos_solo_hora_fin();

-- Sin policy de DELETE en ninguna de las dos tablas: nadie puede borrar,
-- ni siquiera el dueño de la fila.
