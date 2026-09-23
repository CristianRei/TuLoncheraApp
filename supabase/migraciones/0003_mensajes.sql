-- Mensajes/notificaciones push del admin hacia Promotor/Bodega. Se aplica a
-- mano en el SQL editor del dashboard de Supabase, igual que 0001 y 0002.
--
-- Por qué esto vive en Supabase y no solo en SQLite local: un mensaje tiene
-- que viajar del dispositivo del admin al de otra persona, algo que R5/R6 no
-- resuelven por sí solos (mismo motivo por el que turnos/comprobantes ya
-- sincronizan, ver ADR 0006). El envío real (push a través del servicio de
-- Expo) lo dispara directo el dispositivo del admin — src/sync/push.ts — sin
-- Edge Functions ni servidor propio, mismo patrón que el resto de esta
-- rebanada.

create table push_tokens (
  usuario_id uuid primary key,           -- una persona, un token vigente (el último login gana)
  dispositivo_id uuid not null,
  expo_push_token text not null,
  rol text not null,
  activo boolean not null default true,
  actualizado_ts timestamptz not null default now()
);

create table mensajes (
  id uuid primary key,                   -- mismo UUID generado en el dispositivo del admin (R3)
  cuerpo text not null,
  tipo text not null,                    -- 'MANUAL' | 'META_PROGRESO', ver src/core/tipos TipoMensaje
  creado_por uuid not null,
  creado_por_nombre text not null,       -- desnormalizado: no hay `usuarios` sincronizada
  ts_cliente timestamptz not null
);

create table mensaje_destinatarios (
  mensaje_id uuid not null references mensajes (id),
  destinatario_id uuid not null,
  leida boolean not null default false,
  primary key (mensaje_id, destinatario_id)
);

alter table push_tokens enable row level security;
alter table mensajes enable row level security;
alter table mensaje_destinatarios enable row level security;

-- Mismo modelo de confianza que turnos/comprobantes (CLAUDE.md sección 4:
-- "los permisos son de interfaz, no de seguridad" mientras el equipo es
-- pequeño y conocido): cualquier sesión autenticada (incluida anónima) puede
-- leer y escribir. El admin necesita leer push_tokens para poder enviar; el
-- destinatario necesita poder marcar sus propios mensajes como leídos.
create policy "push_tokens_select_auth" on push_tokens for select to authenticated using (true);
create policy "push_tokens_upsert_auth" on push_tokens for insert to authenticated with check (true);
create policy "push_tokens_update_auth" on push_tokens for update to authenticated using (true) with check (true);

create policy "mensajes_select_auth" on mensajes for select to authenticated using (true);
create policy "mensajes_insert_auth" on mensajes for insert to authenticated with check (true);

create policy "mensaje_destinatarios_select_auth" on mensaje_destinatarios for select to authenticated using (true);
create policy "mensaje_destinatarios_insert_auth" on mensaje_destinatarios for insert to authenticated with check (true);
create policy "mensaje_destinatarios_update_auth" on mensaje_destinatarios for update to authenticated using (true) with check (true);

-- Sin policy de DELETE en ninguna de las tres: nadie puede borrar, mismo
-- criterio que turnos/comprobantes.
