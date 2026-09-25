# Supabase — configuración manual

Este directorio documenta lo que vive en Supabase (Postgres + Storage), fuera
del control de las migraciones locales de `src/db/migraciones/`. No hay CLI
de Supabase en este repo — todo se aplica a mano en el dashboard.

## 1. Tablas + RLS + trigger

**Camino corto (recomendado):** correr en **SQL Editor** del dashboard de
Supabase, en este orden:

1. `migraciones/0001_turnos_y_comprobantes.sql` (una sola vez)
2. `migraciones/0009_sincronizacion_completa.sql` — script **idempotente** que
   reúne TODO lo de 0003 a 0008 (personal, catálogo, mensajes, ventas,
   movimientos, cargues, conteos, arqueos), agrega las columnas de clave
   natural (`producto_sku`, responsables de ubicación), los triggers de
   `subido_ts`, la protección de cargues y habilita **Realtime**. Se puede
   correr las veces que haga falta y sobre un proyecto con cualquier
   subconjunto de 0003-0008 ya aplicado (probado contra un Postgres real,
   `npm run test:sql`). Termina con `notify pgrst, 'reload schema'` para que
   la API vea las tablas nuevas enseguida.

Después de 0009, cada funcionalidad nueva trae su propio archivo, que se
corre una vez en orden:

3. `migraciones/0010_seguridad_pin.sql` — intentos/desbloqueos/logins de PIN
   remotos (ya aplicada en el proyecto real).
4. `migraciones/0011_traslados.sql` — traslados entre promotores (no es
   idempotente: correrla una sola vez).
5. `migraciones/0012_empresas_puntos.sql` — empresas y puntos (sedes) para
   la bajada al celular del promotor/bodega. Idempotente.
6. `migraciones/0013_push_desde_servidor.sql` — activa `pg_net` y crea el
   trigger que envía las notificaciones push desde Supabase (la app ya no
   llama a Expo). Idempotente. Si `create extension` falla por permisos,
   activar **pg_net** en Database → Extensions y volver a correrlo. Para ver
   qué respondió Expo: `select created, status_code, content from
   net._http_response order by created desc limit 10;`
7. `migraciones/0014_eventos.sql` — eventos del calendario (con promotores y
   meta diaria) para el celular del promotor, con Realtime. Idempotente;
   después de 0012.
8. `migraciones/0015_descuentos.sql` — descuentos (por producto, punto y/o
   promotor, con fecha y hora) para que el celular del promotor cobre con
   ellos, con Realtime. Idempotente; después de 0012.
9. `migraciones/0016_realtime_turnos_arqueos.sql` — agrega `turnos` y
   `arqueos_caja` a Realtime (0009 solo cubrió ventas/cargues/movimientos/
   conteos) y un índice único parcial: un promotor no puede tener más de un
   turno abierto (`hora_fin is null`) a la vez — evita el bug real de
   turnos duplicados por una carrera entre dos dispositivos. Idempotente.
10. `migraciones/0017_evidencia_sin_sobrescritura.sql` — quita el UPDATE de
    los buckets `selfies-turnos` y `comprobantes-venta`: una foto subida ya
    no se puede reemplazar. Idempotente.
11. `migraciones/0018_credenciales_privadas.sql` — **seguridad de PIN y datos
    personales** (auditoría 2026-09-25). Idempotente. Ver "Credenciales"
    abajo antes de correrla.

Todo se valida contra un Postgres real en memoria con `npm run test:sql`.

**Ojo:** volver a correr `0009` después de `0018` reabre la escritura en
`usuarios` (0009 aplica políticas abiertas). Si alguna vez se repite 0009,
correr 0018 otra vez justo después.

### Credenciales (0018)

Después de 0018, el PIN, la cédula, el celular y la dirección viven en
`usuarios_credenciales`, que la app no puede leer ni escribir. `usuarios`
queda solo con id, nombre, rol y activo, y solo se lee. Lo que antes subía
directo pasa por funciones que verifica el servidor:

- `verificar_pin` — login con un PIN que el celular no conoce (primera vez
  de esa persona en ese celular). Límite: 10 fallos cada 10 min por sesión,
  60 por minuto en total.
- `guardar_usuario` / `eliminar_usuario` — cambios de personal desde el
  dispositivo de admin, firmados con el PIN del admin que tiene la sesión.
- `desbloquear_dispositivo` — desbloqueo remoto; el celular bloqueado solo
  acepta los verificados.

**Pasos, en este orden:**

1. Actualizar la app en TODOS los dispositivos (la versión vieja pide el PIN
   y la cédula a `usuarios` y deja de poder descargar el personal).
2. Correr `0018` en el SQL Editor. Copia a `usuarios_credenciales` lo que
   ya estaba en Supabase y lo borra de `usuarios`.
3. Registrar a cada admin que use la app, con el PIN que usa para entrar:

   ```sql
   select registrar_admin('Nombre del admin', '123456');
   ```

   Solo se puede ejecutar desde el SQL Editor. Sin ningún admin registrado,
   el personal nuevo o editado queda pendiente en `app/admin/sync/` con el
   mensaje "Supabase no reconoce el PIN de este administrador". Si un admin
   cambia su PIN desde la app, hay que volver a correr `registrar_admin` con
   el PIN nuevo (el servidor todavía conoce el viejo y rechaza la firma).
4. Desde ese momento, la **primera vez** que alguien entra en un celular
   necesita internet (el servidor verifica su PIN). Después puede entrar en
   ese celular sin conexión, como siempre.

**Detalle histórico (ya incluido en 0009):** los archivos `0003` a `0008`
siguen aquí como referencia de cómo se fue construyendo. Si prefieres correrlos
uno por uno, en orden, cada uno una sola vez:

1. `migraciones/0001_turnos_y_comprobantes.sql`
2. `migraciones/0003_mensajes.sql` (mensajes/notificaciones push del admin —
   `push_tokens`, `mensajes`, `mensaje_destinatarios`)
3. `migraciones/0004_ventas_movimientos_cargues_conteos.sql` (segunda
   rebanada del motor de inventario/ventas — `ventas`, `venta_items`,
   `movimientos`, `lotes`, `cargues`, `cargue_lineas`, `conteos`,
   `conteo_lineas`)
4. `migraciones/0005_arqueos_caja.sql` (arqueo de caja al cerrar turno)
5. `migraciones/0006_usuarios.sql` (primera rebanada de sincronización de
   bajada — personal/PINs, ver CLAUDE.md sección 11)
6. `migraciones/0007_catalogo.sql` (segunda rebanada de bajada — productos y
   categorías, ver CLAUDE.md sección 11)
7. `migraciones/0008_politicas_update_reintentos.sql` (corrección: política de
   UPDATE para `comprobantes_venta` y `arqueos_caja`, sin la cual un
   reintento de subida tras una subida ya exitosa fallaba para siempre —
   correr después de 0005)

## 2. Buckets de Storage

En **Storage**, crear dos buckets **privados** (NO marcar "Public bucket"):

- `selfies-turnos`
- `comprobantes-venta`

Luego correr `migraciones/0002_storage_policies.sql` completo en **SQL
Editor** — RLS de `storage.objects` es independiente de las políticas de
tablas normales y necesita INSERT + UPDATE (no solo INSERT) porque las
subidas usan `upsert: true` desde el cliente.

## 3. Auth

**Authentication → Providers → Anonymous Sign-ins**: activar. Es el único
mecanismo de autenticación que usa esta rebanada (ver
`docs/03-decisiones/0006-sincronizacion-turnos-comprobantes.md`).

## 4. Credenciales para el cliente

De **Settings → API**, copiar a `.env.local` (nunca a un archivo versionado):

- `Project URL` → `EXPO_PUBLIC_SUPABASE_URL`
- `anon` / `publishable key` → `EXPO_PUBLIC_SUPABASE_ANON_KEY`

Nunca copiar la `service_role` / `secret key`, ni la contraseña de la base
de datos, a ningún archivo de este repo.
