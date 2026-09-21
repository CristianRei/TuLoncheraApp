# Modelo de datos

> Resumido en `CLAUDE.md` sección 7. La fuente de verdad ejecutable son las
> migraciones en `src/db/migraciones/` (0001 a 0018 al momento de escribir
> esto) — este documento explica el razonamiento y el estado real, no
> reemplaza leer el SQL cuando haga falta precisión exacta.

## Principios que moldean cada tabla

- **Claves primarias UUID (`TEXT`), nunca `AUTOINCREMENT`** en tablas de
  dominio (R3). El UUID se genera en el dispositivo (`expo-crypto`,
  `Crypto.randomUUID()`), no en SQLite. Esto es lo que permite que una futura
  subida a servidor sea idempotente.
- **`movimientos` es append-only** (R2). No existe ningún camino de código que
  haga `UPDATE` o `DELETE` sobre esa tabla. Un error se corrige con un
  movimiento compensatorio (`AJUSTE_CONTEO` u otro), nunca borrando.
- **Ningún `stock` mutable** (R1). El saldo de cualquier ubicación —
  bodega o promotor — es siempre `SUM(movimientos)` agregado, calculado por
  `calcularSaldosPorProducto` (`src/core/inventario/index.ts`, TypeScript
  puro con property test). No hay columna `stock` en ninguna tabla.
- **`ts_cliente` + `dispositivo_id` en cada fila** (R6), para que la
  sincronización pueda ordenar y deduplicar sin depender del reloj del
  servidor ni del orden de inserción. Desde el ADR 0006 esto ya no es solo
  preparación teórica — `turnos` y los comprobantes de transferencia
  realmente sincronizan a Supabase usando este mismo `id` como clave de
  `upsert`.
- **`productos` y `usuarios` son mutables** (nombre, precio, foto, activo) —
  a diferencia de `movimientos`, no son un libro contable, son catálogo/
  maestro. R1/R2 no aplican ahí.
- **Tablas de "metadata de proceso" también son mutables** — `eventos.estado`,
  `turnos.hora_fin`, `cargues.estado`/`cargue_lineas.estado`,
  `notificaciones.leida`/`resuelta`. Ninguna de estas es un libro contable;
  R1/R2 solo rigen `movimientos`. El criterio para distinguir: si la fila
  describe un movimiento real de inventario, es inmutable; si describe el
  estado de un flujo de trabajo (planeado → entregado, pendiente → resuelto),
  puede mutar.

## Historial de migraciones

| # | Nombre | Qué hizo |
|---|---|---|
| 0001 | `esquema_inicial` | Crea todas las tablas base, con las columnas originales del diseño. |
| 0002 | `identidad_dispositivo` | Tabla `_dispositivo` (una fila): UUID del dispositivo, generado una vez y reutilizado — lo usa todo lo que necesita `dispositivo_id`. |
| 0003 | `pin_unico` | Índice `UNIQUE` sobre `usuarios.pin` — ver ADR 0001. |
| 0004 | `catalogo_editable` | Recrea `productos`: agrega `activo` y `foto_uri`; `categoria` y `costo` pasan a opcionales (la hoja de cálculo del cliente no los traía). |
| 0005 | `carga_catalogo_inicial` | Inserta los 123 productos reales del cliente (nombre + precio; `es_licor=true` solo en los 2 vinos y la cerveza). |
| 0006 | `ventas_sin_evento` | Recrea `ventas`: `evento_id` pasa a opcional; el `CHECK` de `metodo_pago` cambia a `EFECTIVO`/`TRANSFERENCIA`/`LIBRANZA` (ver ADR 0002). |
| 0007 | `codigo_barras_unico` | Índice `UNIQUE` sobre `productos.codigo_barras` (los `NULL` no chocan entre sí en SQLite). |
| 0008 | `anulacion_ventas` | `ventas` gana `anulada`/`motivo_anulacion`. Recrea `movimientos` para agregar `ANULACION_VENTA` al `CHECK` de `tipo` (ver ADR 0004). |
| 0009 | `seguridad_pin` | Tres tablas nuevas para el bloqueo por intentos fallidos de PIN: `intentos_pin_fallidos`, `desbloqueos_pin`, `logins_exitosos_pin`. |
| 0010 | `conteo_cierre` | Recrea `conteos`: `evento_id` pasa a opcional y se agrega `promotor_id` (mismo motivo que ADR 0002). Activa `conteos`/`conteo_lineas`. |
| 0011 | `puntos_y_marca` | Tabla nueva `puntos` (sede de una `empresa`). Recrea `eventos` con `punto_id` y lo activa como asignación vigente de promotor→punto. `productos` gana `marca`, `ventas` gana `punto_id` (ver ADR 0005). |
| 0012 | `descuentos` | Tabla nueva `descuentos`: reglas por producto y/o punto, con vigencia (ver ADR 0005). |
| 0013 | `notificaciones` | Tabla nueva `notificaciones`: alertas del admin (stock bajo, lote por vencer), generadas por detectores plug-in. `clave_deduplicacion` con índice único parcial evita duplicar la misma alerta mientras siga activa. |
| 0014 | `calendario_eventos` | `eventos` cambia de significado: de "asignación vigente sin fecha" a jornada real con fecha planeada. Se recrea sin migrar filas (la tabla no tenía datos reales, mismo criterio que la 0010 con `conteos`). Tabla nueva `evento_promotores` (N-a-N, reemplaza la columna `promotor_id` directa — un evento puede tener varios promotores). Tabla nueva `series_recurrencia` (solo trazabilidad de eventos generados en serie, nunca se edita en cascada). |
| 0015 | `comprobantes_y_turnos` | `ventas` gana `comprobante_uri` (`ALTER TABLE`, columna nullable) — foto del comprobante de transferencia. Tabla nueva `turnos`: check-in físico del promotor (selfie + hora + ubicación), independiente de `eventos` (que es planeación, no un hecho físico). |
| 0016 | `cola_sync` | Tabla nueva `_sync_pendiente`: cola de subida a Supabase, una fila por sub-tarea (`FILA` o `FOTO` de un turno/comprobante) para poder representar un fallo parcial. Esta migración también hace *backfill*: encola cada turno y venta-con-comprobante que ya exista localmente, para que el histórico se suba solo (ver ADR 0006). |
| 0017 | `cargues_pendientes` | Tablas nuevas `cargues` (cabecera) y `cargue_lineas`: cargue en dos pasos — admin planea sin tocar `movimientos`, bodega confirma línea por línea y ahí nace el `RECARGA` real (ver ADR 0007). |
| 0018 | `notificacion_cargue_revisar` | Agrega `CARGUE_REVISAR` al `CHECK` de `notificaciones.tipo` — recrea la tabla (SQLite no permite `ALTER` sobre un `CHECK`, mismo patrón que la 0008 con `movimientos`). |

## Tablas (estado real, no el diseño original)

| Tabla | Rol en el negocio | Estado |
|---|---|---|
| `usuarios` | Personas: promotores, conductores, bodega, admin. `rol` fija el actor. `pin` es el único mecanismo de login (ADR 0001). | En uso |
| `ubicaciones` | Bodega (una sola fila, singleton) y el inventario "virtual" de cada promotor. Todo saldo vive contra una ubicación. Se crean perezosamente (`src/db/ubicaciones.ts`), no por migración ni seed. | En uso (solo tipos `BODEGA` y `PROMOTOR`; `CAMION` sin usar) |
| `productos` | Catálogo: ponqués y licor. `precio` en pesos enteros; `categoria`/`costo` opcionales, sin dato todavía. `foto_uri` apunta a un archivo local (no un blob en SQLite). `activo=0` = "eliminado" (nunca `DELETE`). | En uso |
| `lotes` | Agrupar unidades por fecha de vencimiento. | En uso (opcional) — `crearLote` (`src/db/lotes.ts`) se llama solo si "ingresar pedido" trae fecha de vencimiento |
| `empresas` | Cliente donde ocurre un evento/feria (ej. Falabella). | En uso — gestión propia en `app/admin/empresas/` |
| `puntos` | Sede de una empresa (ej. Falabella Norte, Falabella Sur). `empresa_id` FK. | En uso desde la 0011 — ver ADR 0005 |
| `eventos` | Desde la 0014, representa una jornada real con fecha planeada (empresa + punto + fecha), no solo una asignación vigente. `estado` (`PLANEADO`/`EN_CURSO`/`CERRADO`/`CANCELADO`) es informativo — ya no determina el punto vigente del promotor, eso se resuelve por fecha (`obtenerPuntoVigentePromotor`, busca el evento de hoy). `motivo_cancelacion` obligatorio al cancelar, nunca se borra un evento. `serie_id` es solo trazabilidad de una serie recurrente. | En uso desde la 0014 (admin: `app/admin/calendario/`; promotor: `app/promotor/calendario.tsx`) |
| `evento_promotores` | Tabla N-a-N: qué promotor(es) están asignados a un evento — la mayoría de eventos tienen uno solo, pero puede haber varios. Reasignar (`reasignarEvento`) borra e inserta de nuevo — no es un historial, es la asignación vigente de ese evento puntual. | En uso desde la 0014 |
| `series_recurrencia` | Metadata de una serie de eventos generados de una vez (ej. "cada 15 días hasta fin de mes"). Cada evento generado queda independiente — esta tabla nunca se usa para editar en cascada. | En uso desde la 0014 |
| `turnos` | Check-in/check-out físico diario del promotor: selfie + hora + ubicación GPS al iniciar, `hora_fin` al finalizar. Independiente de `eventos` (planeación) — un turno es un hecho físico. `selfie_uri`/ubicación/`hora_inicio` nunca se editan; `hora_fin` sí recibe un `UPDATE` al cerrar (no viola R1/R2, no es un movimiento de inventario). Sincroniza a Supabase (ver ADR 0006) — el trigger remoto solo permite tocar `hora_fin`. | En uso desde la 0015 (`app/promotor/index.tsx` → `PantallaIniciarTurno`; admin: `app/admin/turnos/`) |
| `movimientos` | El libro contable del inventario. Cada fila es un hecho inmutable. Tipos en uso hoy: `COMPRA_PROVEEDOR` (entrada a bodega), `RECARGA` (bodega → promotor, generado ahora por `confirmarLineaCargue` al ejecutar una línea de cargue), `VENTA` (promotor → afuera), `ANULACION_VENTA` (afuera → promotor, revierte una venta anulada — ADR 0004), `AJUSTE_CONTEO` (conteo de cierre). | En uso (parcial) |
| `ventas` | Cabecera de una venta (recibo interno, sin valor fiscal). `numero_recibo` = primeros 4 caracteres del UUID de dispositivo + consecutivo (`src/db/ventas.ts`). `evento_id` opcional (ADR 0002). `punto_id` opcional, resuelto una sola vez al vender desde el punto vigente del promotor (ADR 0005). `anulada`/`motivo_anulacion`: nunca se borra una venta, se anula (ADR 0004). `comprobante_uri` (desde la 0015): foto del comprobante, solo con valor cuando `metodo_pago = 'TRANSFERENCIA'` — obligatoria en la UI para ese medio de pago, no forzada por el esquema. | En uso |
| `venta_items` | Líneas de una venta. El `precio_unitario` ya trae aplicado cualquier descuento vigente (ADR 0005). | En uso |
| `conteos` / `conteo_lineas` | Conteo de cierre: teórico vs. contado. `promotor_id` (0010) y `evento_id` opcional (mismo motivo que ADR 0002). La aprobación de descuadres por encima de un umbral (R7) sigue sin implementar — el umbral en pesos no está definido. Desde el ADR 0008, si el promotor finaliza turno sin haber contado ese día, la app solo advierte (nunca bloquea) — no hay ninguna columna nueva para esto, se resuelve en consulta (`existeConteoHoy`, filtra por fecha Bogotá). | En uso desde la 0010 (sin la aprobación de R7) |
| `descuentos` | Reglas de descuento por producto y/o punto, con vigencia. `producto_id`/`punto_id` opcionales de forma independiente; `NULL` = aplica a todos en esa dimensión. Prioridad al resolver: producto+punto > solo producto > solo punto (ver ADR 0005). | En uso desde la 0012 |
| `notificaciones` | Alertas del admin, generadas por un generador con detectores plug-in (`src/db/notificaciones.ts`) — cada tipo es una función independiente que corre y produce candidatas; el generador sincroniza contra la tabla (upsert por `clave_deduplicacion`, resuelve las que ya no aplican). Tipos: `STOCK_BAJO`, `LOTE_POR_VENCER` (desde la 0013), `CARGUE_REVISAR` (desde la 0018 — una línea de cargue con descuadre físico de bodega). `leida`/`resuelta` son las únicas columnas mutables. | En uso desde la 0013 |
| `cargues` / `cargue_lineas` | Cargue en dos pasos (ADR 0007): `cargues` es la cabecera (promotor, quién lo planeó, estado agregado); `cargue_lineas` es una fila por producto, con `cantidad_planeada` y `cantidad_entregada` separadas. Al *planear* (`crearCargue`), solo se escribe aquí — ningún `RECARGA` nace todavía. Al *entregar* una línea (`confirmarLineaCargue`, bodega escanea y teclea cantidad), recién ahí se genera el `RECARGA` real en `movimientos`, y la línea pasa a `ENTREGADA` o, si la cantidad real no alcanza lo planeado, a `REVISAR` con `motivo_revision` obligatorio (sin bloquear las demás líneas del mismo cargue). Reducir o quitar una línea (`reducirLineaCargue`) solo es posible mientras sigue `PENDIENTE` — nunca generó movimiento, no hay nada que revertir. | En uso desde la 0017 |
| `_sync_pendiente` | Cola de subida a Supabase (ADR 0006) — una fila por sub-tarea (`FILA` o `FOTO` de un turno o comprobante de venta), para poder representar que una entidad subió el dato pero falló la foto (o viceversa) sin un solo booleano insuficiente. `completado_ts IS NULL` es lo pendiente real; una tarea completada nunca se borra, queda como rastro. El motor de sync (`src/sync/motor.ts`) la drena en background, disparado por conectividad y un intervalo — nunca bloquea ninguna pantalla. | En uso desde la 0016 |
| `niveles_objetivo` | Insumo para la recarga sugerida. | Sin usar — Fase 6 |
| `intentos_pin_fallidos` | Un intento de PIN fallido, por dispositivo+modo. Nunca guarda el PIN tecleado. | En uso |
| `desbloqueos_pin` | Un admin desbloqueando un dispositivo+modo bloqueado, tecleando su propio PIN. `admin_id` obligatorio. | En uso |
| `logins_exitosos_pin` | Un login correcto, por dispositivo+modo — resetea el conteo de fallos consecutivos. | En uso |

## Cómo se mueve el inventario, en la práctica

No hay stock de "todo lo que hay". Hay saldos por ubicación, calculados al
vuelo:

1. **Entra a bodega:** "ingresar pedido" — escanear el producto y teclear la
   cantidad (`src/ui/PantallaIngresarPedido.tsx`, compartido entre Bodega
   `app/bodega/pedido.tsx` y Admin `app/admin/inventario/pedido.tsx` →
   `registrarEntradaBodega`) → un `COMPRA_PROVEEDOR` por producto,
   `ubicacion_origen_id = NULL`, `ubicacion_destino_id` = la ubicación de
   bodega (se crea sola la primera vez). Si se tecleó fecha de vencimiento,
   crea también un `lote` (opcional). Es la única forma de que entre
   stock — la pantalla de Inventario en sí es de solo lectura.
2. **Bodega → promotor, en dos pasos (ADR 0007):**
   - **Planear:** admin arma un cargue (`app/admin/cargue/` →
     `crearCargue`, `src/db/cargues.ts`) — se valida que ninguna cantidad
     supere el saldo de bodega (`StockInsuficienteError` si no alcanza),
     pero **no se escribe ningún movimiento todavía** — solo la cabecera
     `cargues` (`PLANEADO`) y sus `cargue_lineas` (`PENDIENTE`). Admin
     puede reducir o quitar una línea mientras siga pendiente
     (`reducirLineaCargue`).
   - **Entregar:** bodega ve el cargue (`app/bodega/cargues/`), escanea
     cada producto y teclea la cantidad que realmente entrega
     (`confirmarLineaCargue`) — exige que el promotor tenga turno abierto
     hoy (`SinTurnoParaCargueError` si no, ver ADR 0008). Recién aquí se
     genera un `RECARGA` por producto (vía `registrarCargue`,
     `src/db/cargue.ts`, sin cambios respecto al modelo original), origen
     = bodega, destino = la ubicación de ese promotor. Si la cantidad real
     no alcanza lo planeado, la línea queda `REVISAR` con motivo
     obligatorio y genera una notificación `CARGUE_REVISAR` para admin —
     las demás líneas del cargue no se bloquean.
3. **Promotor → afuera:** al cobrar una venta
   (`app/promotor/index.tsx` → `registrarVenta`) → un `VENTA` por producto,
   origen = la ubicación del promotor, destino `NULL`. Exige que el
   promotor tenga turno abierto hoy (`SinTurnoAbiertoError` si no). Antes
   de escribir nada, se resuelve el punto vigente del promotor
   (`obtenerPuntoVigentePromotor`, `src/db/eventos.ts` — desde la 0014,
   busca el evento de *hoy* asignado a ese promotor, no un estado manual)
   y, para cada línea, el descuento vigente para ese producto+punto
   (`obtenerDescuentoVigente`, `src/db/descuentos.ts`); el precio que se
   guarda en `venta_items` ya trae ese descuento aplicado, y
   `ventas.punto_id` queda grabado con el punto resuelto (ver ADR 0005).
   Si el promotor no tiene punto asignado, la venta sigue funcionando sin
   descuento y `punto_id` queda `NULL`. Si el método de pago es
   `TRANSFERENCIA`, la app pide foto del comprobante antes de registrar la
   venta — se guarda en `comprobante_uri`.
4. **Afuera → promotor (anulación):** al anular una venta
   (`app/admin/ventas/[id].tsx` → `anularVenta`) → un `ANULACION_VENTA` por
   producto, origen `NULL`, destino = la ubicación del promotor — revierte
   exactamente el `VENTA` original. La venta se marca `anulada`, nunca se
   borra (ver ADR 0004).
5. **Conteo de cierre:** el promotor cuenta físicamente su inventario
   (`app/promotor/conteo-cierre.tsx` → `registrarConteo`,
   `src/db/conteos.ts`); por cada producto con diferencia entre teórico y
   contado, un `AJUSTE_CONTEO` hace converger el saldo real a lo contado
   (bodega→promotor si sobra, promotor→afuera si falta). Si el promotor
   finaliza turno sin haber contado ese día, la app solo advierte, nunca
   bloquea (ver ADR 0008).

`calcularSaldosPorProducto(movimientos, ubicacionId)` sirve para cualquier
ubicación (bodega o promotor) — es la misma función, sin distinguir tipos.

## Calendario, turno, cargue y conteo: cómo se cruzan (ADR 0008)

Cuatro piezas construidas por separado que se conectaron después, cada una
con el nivel de rigidez que pidió el cliente — ninguna quedó fusionada en
una sola tabla, se cruzan en consulta:

- **Calendario ↔ turno**: informativo, nunca bloquea. El turno de hoy
  muestra el evento de hoy si existe (`obtenerEventoDeHoyPromotor`,
  `src/db/turnos.ts`, delega a `obtenerPuntoVigentePromotor`) — iniciar
  turno funciona igual sin evento asignado. No hay `evento_id` en
  `turnos`: agregar una columna ahí habría exigido tocar también el
  trigger de Supabase que protege esa tabla (solo permite `UPDATE` de
  `hora_fin`).
- **Cargue → turno**: bloqueante. `confirmarLineaCargue` exige turno
  abierto hoy antes de generar el `RECARGA`.
- **Cargue → notificaciones**: una línea `REVISAR` genera una
  `CARGUE_REVISAR` automáticamente (mismo generador de detectores que
  `STOCK_BAJO`/`LOTE_POR_VENCER`), se resuelve sola cuando
  `resolverLineaEnRevision` la marca `ENTREGADA`.
- **Turno → conteo**: solo advertencia. `existeConteoHoy`
  (`src/db/conteos.ts`) se consulta al confirmar "Finalizar turno" — si no
  hay conteo de hoy, cambia el texto de la alerta, pero deja continuar.

## Seguridad de PIN: el mismo patrón de "libro de movimientos"

`obtenerEstadoIntentos` (`src/db/intentosPin.ts`) nunca lee un contador
guardado: cuenta filas de `intentos_pin_fallidos` posteriores al evento más
reciente entre `desbloqueos_pin` y `logins_exitosos_pin`, para esa combinación
`dispositivo_id` + `modo`. Tres tablas separadas en vez de una sola de
"eventos" porque `desbloqueos_pin` tiene una columna obligatoria
(`admin_id`) que no aplica a las otras dos. El backoff y el umbral de
bloqueo son puros (`src/core/seguridadPin/`, con tests de propiedad) —
reciben el conteo de fallos y deciden NORMAL / ESPERANDO / BLOQUEADO.

## Sincronización: qué vive solo en el dispositivo y qué sube (ADR 0006)

Solo dos flujos suben a Supabase hoy — **todo lo demás de este documento
sigue siendo 100% local**, no asumir sincronización de nada más:

- `turnos`: se espeja completo en la tabla remota `turnos` de Supabase
  (mismo `id`), la selfie sube al bucket `selfies-turnos`.
- Comprobantes de transferencia: **no** se espeja `ventas` completa — solo
  una tabla angosta remota `comprobantes_venta` (venta_id, promotor,
  número de recibo, total, ruta de la foto), la foto sube al bucket
  `comprobantes-venta`.

El mecanismo: cada operación local que necesita subir algo inserta una
tarea en `_sync_pendiente` **dentro de la misma transacción** que ya
escribe el dato real (`iniciarTurno`, `finalizarTurno`, registrar una
venta con comprobante) — nunca hay una llamada de red en el camino
crítico de esas funciones. El motor de sync (`src/sync/motor.ts`) drena la
cola por separado, en background. RLS en Supabase: cualquier sesión
autenticada (anónima, una por dispositivo) puede `INSERT`/`SELECT`; el
único `UPDATE` permitido es `turnos.hora_fin`, reforzado con un trigger.
Nunca hay `DELETE`. Detalle completo del esquema remoto en
`supabase/README.md` y `supabase/migraciones/`.

## Pendiente para cuando se resuelvan las preguntas abiertas

Ver `CLAUDE.md` sección 11 para la lista completa. Las que tocan
directamente el esquema:

- Umbral en pesos para aprobación de descuadres (R7) — probablemente una
  fila de configuración, no una constante hardcodeada. El conteo de
  cierre ya existe y ya calcula el descuadre; falta solo el umbral y el
  bloqueo de la siguiente recarga.
- Si el nivel objetivo se calcula por promotor o por punto — el
  calendario de eventos ya existe (0014) con fecha real, así que esta
  pregunta ya se puede resolver con esos datos en la mano.
- Costo por unidad en la entrada de inventario — sin eso, `productos.costo`
  sigue vacío y no hay cómo calcular margen.
- Formato exacto del número de recibo: el prefijo de dispositivo ya está
  implementado (ver arriba), pero el ejemplo `P01-000142` de `CLAUDE.md`
  sección 3 (R6) es solo ilustrativo del patrón general, no el formato
  literal usado.
- Sincronizar el resto del inventario/ventas (más allá de turnos y
  comprobantes) — Fase 5 sigue sin definir cuándo ni con qué prioridad.
