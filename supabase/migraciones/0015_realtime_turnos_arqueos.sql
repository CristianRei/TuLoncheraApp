-- Dos cambios, aplicados a mano en el SQL editor del dashboard, en cualquier
-- momento después de 0009 (idempotente, se puede repetir):
--
-- 1. Agrega `turnos` y `arqueos_caja` a la publicación de Realtime — 0009 ya
--    lo hizo para ventas/cargues/movimientos/conteos, pero estas dos
--    quedaron fuera: el admin solo veía un check-in, un cierre de turno o un
--    arqueo de caja de otro celular tocando "Actualizar" o al volver a
--    entrar a la pantalla (ver app/admin/turnos/index.tsx,
--    app/admin/turnos/[id].tsx). Con esto, el mismo mecanismo que ya usan
--    ventas/cargues (src/sync/realtime.ts, suscribirCambiosRemotos) también
--    avisa para estas dos tablas.
--
-- 2. Índice único parcial: un promotor no puede tener más de un turno con
--    `hora_fin is null` (abierto) A LA VEZ en Supabase. La app ya intentaba
--    evitar esto en el cliente (`iniciarTurno`, src/db/turnos.ts, consulta
--    si ya hay un turno local o remoto abierto antes de crear uno) pero esa
--    consulta es best-effort — sin red, o si dos dispositivos abren turno
--    casi al mismo tiempo (carrera), cada uno no ve todavía el turno del
--    otro y ambos terminan creando el suyo. Solo una restricción real del
--    lado del servidor (compartido entre TODOS los dispositivos, a
--    diferencia de cada SQLite local) puede impedirlo de verdad. El upsert
--    que falle por este índice se maneja en src/sync/motor.ts: en vez de
--    reintentar para siempre, adopta el turno remoto que sí ganó la carrera.

do $$
declare t text;
begin
  foreach t in array array['turnos', 'arqueos_caja'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

create unique index if not exists idx_turnos_un_abierto_por_promotor
  on turnos (promotor_id)
  where hora_fin is null;
