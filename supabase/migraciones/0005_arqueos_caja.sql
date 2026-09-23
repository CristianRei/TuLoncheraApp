-- Arqueo de caja al cerrar turno (ver app/promotor/cierre-jornada.tsx,
-- migración local 0024). Se aplica a mano en el SQL editor del dashboard de
-- Supabase, igual que las anteriores.
--
-- Mismo criterio de tabla angosta y desnormalizada que 0004: `usuarios` no
-- sincroniza todavía, así que se guarda `promotor_nombre` en vez de un JOIN
-- que del otro lado no se puede hacer.

create table arqueos_caja (
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

alter table arqueos_caja enable row level security;

-- Mismo modelo de confianza que el resto (CLAUDE.md sección 4).
create policy "arqueos_caja_select_auth" on arqueos_caja for select to authenticated using (true);
create policy "arqueos_caja_insert_auth" on arqueos_caja for insert to authenticated with check (true);

-- Sin política de UPDATE ni DELETE: un arqueo, una vez registrado, nunca
-- cambia (mismo espíritu que conteos/conteo_lineas) ni se borra.
