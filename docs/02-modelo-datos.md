# Modelo de datos

> Resumido en `CLAUDE.md` sección 7. La fuente de verdad ejecutable son las
> migraciones en `src/db/migraciones/` (0001 a 0009 al momento de escribir
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
  sincronización futura pueda ordenar y deduplicar sin depender del reloj del
  servidor ni del orden de inserción.
- **`productos` y `usuarios` son mutables** (nombre, precio, foto, activo) —
  a diferencia de `movimientos`, no son un libro contable, son catálogo/
  maestro. R1/R2 no aplican ahí.

## Historial de migraciones

| # | Nombre | Qué hizo |
|---|---|---|
| 0001 | `esquema_inicial` | Crea todas las tablas de la sección 7, con las columnas originales del diseño. |
| 0002 | `identidad_dispositivo` | Tabla `_dispositivo` (una fila): UUID del dispositivo, generado una vez y reutilizado — lo usa todo lo que necesita `dispositivo_id`. |
| 0003 | `pin_unico` | Índice `UNIQUE` sobre `usuarios.pin` — ver ADR 0001. |
| 0004 | `catalogo_editable` | Recrea `productos`: agrega `activo` y `foto_uri`; `categoria` y `costo` pasan a opcionales (la hoja de cálculo del cliente no los traía). |
| 0005 | `carga_catalogo_inicial` | Inserta los 123 productos reales del cliente (nombre + precio; `es_licor=true` solo en los 2 vinos y la cerveza). |
| 0006 | `ventas_sin_evento` | Recrea `ventas`: `evento_id` pasa a opcional; el `CHECK` de `metodo_pago` cambia a `EFECTIVO`/`TRANSFERENCIA`/`LIBRANZA` (ver ADR 0002). |
| 0007 | `codigo_barras_unico` | Índice `UNIQUE` sobre `productos.codigo_barras` (los `NULL` no chocan entre sí en SQLite). |
| 0008 | `anulacion_ventas` | `ventas` gana `anulada`/`motivo_anulacion`. Recrea `movimientos` para agregar `ANULACION_VENTA` al `CHECK` de `tipo` (ver ADR 0004). |
| 0009 | `seguridad_pin` | Tres tablas nuevas para el bloqueo por intentos fallidos de PIN: `intentos_pin_fallidos`, `desbloqueos_pin`, `logins_exitosos_pin`. |

## Tablas (estado real, no el diseño original)

| Tabla | Rol en el negocio | Estado |
|---|---|---|
| `usuarios` | Personas: promotores, conductores, bodega, admin. `rol` fija el actor. `pin` es el único mecanismo de login (ADR 0001). | En uso |
| `ubicaciones` | Bodega (una sola fila, singleton) y el inventario "virtual" de cada promotor. Todo saldo vive contra una ubicación. Se crean perezosamente (`src/db/ubicaciones.ts`), no por migración ni seed. | En uso (solo tipos `BODEGA` y `PROMOTOR`; `CAMION` sin usar) |
| `productos` | Catálogo: ponqués y licor. `precio` en pesos enteros; `categoria`/`costo` opcionales, sin dato todavía. `foto_uri` apunta a un archivo local (no un blob en SQLite). `activo=0` = "eliminado" (nunca `DELETE`). | En uso |
| `lotes` | Agrupar unidades por fecha de vencimiento. | En uso (opcional) — `crearLote` (`src/db/lotes.ts`) se llama solo si "ingresar pedido" trae fecha de vencimiento |
| `empresas` | Cliente donde ocurre un evento/feria. | Sin usar |
| `eventos` | Una jornada de venta: empresa + fecha + promotor + conductor + camión. | Sin usar — ver ADR 0002, no se pidió gestión de eventos |
| `movimientos` | El libro contable del inventario. Cada fila es un hecho inmutable. Tipos en uso hoy: `COMPRA_PROVEEDOR` (entrada a bodega), `RECARGA` (bodega → promotor), `VENTA` (promotor → afuera), `ANULACION_VENTA` (afuera → promotor, revierte una venta anulada — ADR 0004). | En uso (parcial) |
| `ventas` | Cabecera de una venta (recibo interno, sin valor fiscal). `numero_recibo` = primeros 4 caracteres del UUID de dispositivo + consecutivo (`src/db/ventas.ts`). `evento_id` opcional (ADR 0002). `anulada`/`motivo_anulacion`: nunca se borra una venta, se anula (ADR 0004). | En uso |
| `venta_items` | Líneas de una venta. | En uso |
| `conteos` / `conteo_lineas` | Conteo de cierre: teórico vs. contado, con motivo y aprobación cuando hay descuadre (R7). | Sin usar — Fase 2, no construido |
| `niveles_objetivo` | Insumo para la recarga sugerida. | Sin usar — Fase 6 |
| `intentos_pin_fallidos` | Un intento de PIN fallido, por dispositivo+modo. Nunca guarda el PIN tecleado. | En uso |
| `desbloqueos_pin` | Un admin desbloqueando un dispositivo+modo bloqueado, tecleando su propio PIN. `admin_id` obligatorio. | En uso |
| `logins_exitosos_pin` | Un login correcto, por dispositivo+modo — resetea el conteo de fallos consecutivos. | En uso |

## Cómo se mueve el inventario, en la práctica

No hay stock de "todo lo que hay". Hay saldos por ubicación, calculados al
vuelo:

1. **Entra a bodega:** "ingresar pedido" — escanear el producto y teclear la
   cantidad (`src/ui/PantallaIngresarPedido.tsx`, compartido entre Bodega
   `app/bodega/index.tsx` y Admin `app/admin/inventario/pedido.tsx` →
   `registrarEntradaBodega`) → un `COMPRA_PROVEEDOR` por producto,
   `ubicacion_origen_id = NULL`, `ubicacion_destino_id` = la ubicación de
   bodega (se crea sola la primera vez). Si se tecleó fecha de vencimiento,
   crea también un `lote` (opcional). Es la única forma de que entre
   stock — la pantalla de Inventario en sí es de solo lectura.
2. **Bodega → promotor:** admin arma un cargue
   (`app/admin/cargue/index.tsx` → `registrarCargue`) → un `RECARGA` por
   producto, origen = bodega, destino = la ubicación de ese promotor (se
   crea sola la primera vez). Se valida que la cantidad no supere el saldo
   de bodega — si no alcanza, `StockInsuficienteError` y no se escribe nada
   (ver ADR 0003).
3. **Promotor → afuera:** al cobrar una venta
   (`app/promotor/index.tsx` → `registrarVenta`) → un `VENTA` por producto,
   origen = la ubicación del promotor, destino `NULL`.
4. **Afuera → promotor (anulación):** al anular una venta
   (`app/admin/ventas/[id].tsx` → `anularVenta`) → un `ANULACION_VENTA` por
   producto, origen `NULL`, destino = la ubicación del promotor — revierte
   exactamente el `VENTA` original. La venta se marca `anulada`, nunca se
   borra (ver ADR 0004).

`calcularSaldosPorProducto(movimientos, ubicacionId)` sirve para cualquier
ubicación (bodega o promotor) — es la misma función, sin distinguir tipos.

## Seguridad de PIN: el mismo patrón de "libro de movimientos"

`obtenerEstadoIntentos` (`src/db/intentosPin.ts`) nunca lee un contador
guardado: cuenta filas de `intentos_pin_fallidos` posteriores al evento más
reciente entre `desbloqueos_pin` y `logins_exitosos_pin`, para esa combinación
`dispositivo_id` + `modo`. Tres tablas separadas en vez de una sola de
"eventos" porque `desbloqueos_pin` tiene una columna obligatoria
(`admin_id`) que no aplica a las otras dos. El backoff y el umbral de
bloqueo son puros (`src/core/seguridadPin/`, con tests de propiedad) —
reciben el conteo de fallos y deciden NORMAL / ESPERANDO / BLOQUEADO.

## Pendiente para cuando se resuelvan las preguntas abiertas

Ver `CLAUDE.md` sección 11 para la lista completa. Las que tocan
directamente el esquema:

- Umbral en pesos para aprobación de descuadres (R7) — probablemente una
  fila de configuración, no una constante hardcodeada. Bloqueado hasta que
  se construya conteo de cierre.
- Si el nivel objetivo se calcula por promotor o por empresa, según si los
  promotores rotan de empresa.
- Costo por unidad en la entrada de inventario — sin eso, `productos.costo`
  sigue vacío y no hay cómo calcular margen.
- Formato exacto del número de recibo: el prefijo de dispositivo ya está
  implementado (ver arriba), pero el ejemplo `P01-000142` de `CLAUDE.md`
  sección 3 (R6) es solo ilustrativo del patrón general, no el formato
  literal usado.
