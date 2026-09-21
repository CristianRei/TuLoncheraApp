# ADR 0006 — Sincronización: turnos y comprobantes de transferencia (Fase 5, primera rebanada)

**Estado:** Aceptado

## Contexto

La app es 100% local — cada instalación tiene su propio SQLite y su propio
almacenamiento de archivos. Esto se volvió visible cuando un promotor inició
turno desde su celular: la selfie y la fila en `turnos` quedaron en *su*
dispositivo, y el admin, entrando desde otro dispositivo (otro SQLite vacío),
no podía verlos. Lo mismo aplica al comprobante de una transferencia.

Se decidió construir la primera rebanada de sincronización real (Fase 5,
hasta ahora sin construir), acotada a solo estos dos casos — no todo el motor
de inventario/ventas todavía.

**Backend:** se comparó contra un VPS propio (Hostinger, ~$29-51 USD/mes)
antes de decidir Supabase (Postgres + Storage + Auth administrados). Con el
volumen estimado (10 promotores, ~130-500 MB/mes de fotos según calidad de
compresión), el free tier de Supabase dura entre 3 y 7 meses antes de
necesitar el plan Pro ($25/mes, 100GB storage). Es más barato que el VPS para
este tamaño de equipo y no exige que nadie opere un servidor. Al ser Postgres
estándar por debajo, los datos no quedan atrapados si se migra a VPS después
— solo el código cliente tendría que ajustarse a un backend distinto (o casi
nada, si la migración fuera a Supabase self-hosted, mismo software).

## Decisión

### Autenticación: sesión anónima por dispositivo, nunca `service_role key` en el cliente

Cada instalación llama `supabase.auth.signInAnonymously()` la primera vez que
hay red — sin email/password, sin UI. Genera un `auth.uid()` real que las
políticas RLS usan para exigir "alguna sesión válida" en las operaciones de
escritura. El PIN local (autentica la *persona*) y esta sesión anónima
(autentica el *dispositivo*) son capas independientes — el login no cambia.

**Se descartó explícitamente** empacar la `service_role key` en el bundle de
la app (la alternativa más simple): esa key salta todo RLS y da control total
sobre *toda* la base Supabase, no solo `turnos`/`comprobantes_venta`.
Cualquiera que decompile el APK la extrae — y a diferencia del riesgo local
ya aceptado en CLAUDE.md sección 4 (acceso físico a *un* dispositivo
conocido), una key filtrada compromete *todos* los dispositivos y *toda* la
base remota, incluida la data de inventario/ventas real que se sincronizará
en fases futuras.

**Se descartó** también un sistema de cuentas reales por usuario (email/
password) para esta rebanada — obligaría a inventar un concepto de "cuenta"
que hoy no existe y contradice ADR 0001 (PIN sin fricción). Queda como camino
natural cuando se sincronice escritura de inventario real y se necesite
atribuir autoría del lado servidor con más granularidad.

### Modelo de datos: tablas angostas, no espejo completo

`turnos` (Supabase) espeja la tabla local completa. `comprobantes_venta`
(Supabase) es angosta — solo `venta_id`, datos mínimos para que el admin
ubique la venta (promotor, número de recibo, total), y la ruta de la foto.
`ventas` completa sigue siendo 100% local en esta rebanada: no se sincroniza
el motor de ventas, solo lo necesario para verificar el comprobante.

### Escritura: solo INSERT, un UPDATE muy acotado, nunca DELETE

RLS permite `SELECT`/`INSERT` a cualquier sesión autenticada (mismo modelo de
confianza que CLAUDE.md sección 4 ya admite: equipo pequeño y conocido, los
permisos reales son de interfaz). El único `UPDATE` permitido es
`turnos.hora_fin` al cerrar turno, reforzado con un trigger de Postgres que
rechaza cambios a cualquier otra columna — mismo espíritu de inmutabilidad
que R1/R2 exigen en SQLite local. Sin política de `DELETE`: nadie puede
borrar una fila sincronizada, ni siquiera su dueño.

### Cola local, no un flag booleano

Una entidad puede fallar "a medias" (sube la fila de datos pero falla la
foto, o al revés) — un solo `sincronizado INTEGER` no representa ese estado
intermedio. La tabla `_sync_pendiente` (migración local `0016_cola_sync.ts`)
tiene una fila por sub-tarea (`FILA` / `FOTO`), cada una reintentable
independiente. `iniciarTurno`/`finalizarTurno` (`src/db/turnos.ts`) y
registrar una venta con comprobante (`src/db/ventas.ts`) encolan sus tareas
dentro de la misma transacción SQLite que ya crean/actualizan la fila — la
cola nunca queda inconsistente con el dato local.

### Nunca bloquea la UI (R5)

Ninguna de esas funciones gana un `await` de red: solo insertan en la cola
local. El motor (`src/sync/motor.ts`) corre en background, disparado por
conectividad (`@react-native-community/netinfo`) y un intervalo simple (~2
min, coherente con "sync periódica, no tiempo real") desde `app/_layout.tsx`
— nunca desde el flujo de negocio que originó el dato.

### Lectura remota: pull manual + automático, URL firmada

Las pantallas de admin (`app/admin/turnos/`, `app/admin/ventas/[id].tsx`)
combinan datos locales (`listarTurnos`) con remotos (`listarTurnosRemotos`),
prefiriendo la fila local si existe en ambas. Botón "Actualizar" además del
pull automático al enfocar la pantalla. Los buckets de Storage son privados
— la foto se resuelve a una URL firmada de 1 hora en el momento de la
lectura, nunca se guarda una URL permanente.

## Consecuencias

- El admin ya puede ver turnos y comprobantes originados en cualquier
  dispositivo, con retraso de minutos (no tiempo real) — resuelve el
  disparador original de esta tarea.
- El resto del inventario/ventas sigue siendo 100% local — una venta hecha
  en otro dispositivo no es visible en detalle para el admin, solo su
  comprobante si aplica. Sincronizar el motor completo es una rebanada
  futura y separada.
- Migrar de Supabase a un backend propio más adelante requeriría reescribir
  `src/sync/` (llamadas al SDK), pero no perder datos — es Postgres estándar
  y Storage tipo S3 por debajo.
- Cuando se sincronice escritura de inventario/ventas real, la autenticación
  anónima actual probablemente deje de ser suficiente (se necesitará
  atribuir autoría con más granularidad) — revisar esta decisión en ese
  momento, no antes.
