# ADR 0007 — Cargue en dos pasos: admin planea, bodega entrega

**Estado:** Aceptado

## Contexto

Hasta ahora `registrarCargue` (`src/db/cargue.ts`) generaba el `RECARGA`
de inmediato al confirmar la pantalla — sin ningún paso intermedio, y solo
Admin tenía acceso a esa pantalla (`app/admin/cargue/`). Bodega no tenía
forma de ejecutar ningún cargue, solo de ingresar stock nuevo.

El cliente pidió separar dos responsabilidades: **admin organiza y
decide** qué le toca a cada promotor (y puede reducirlo si cambia de
opinión antes de que salga), **bodega ejecuta** — escanea físicamente
cada producto y confirma cuánto entrega. Si lo que el sistema dice que hay
en bodega no coincide con la realidad física (producto dañado, robado, o
mal contado antes — nunca reflejado como una salida real), esa línea
puntual debe quedar señalada para que admin la revise, sin bloquear el
resto del cargue.

## Decisión

- Dos tablas nuevas (migración `0017_cargues_pendientes.ts`): `cargues`
  (cabecera: promotor, estado, quién lo planeó) y `cargue_lineas`
  (producto, cantidad planeada, cantidad entregada, estado por línea).
  Mismo espíritu que `conteos`/`conteo_lineas` — cabecera + líneas con
  `estado` como columna mutable de proceso, no un movimiento de
  inventario (R1/R2 no aplican aquí).
- **Planear** (`crearCargue`, `src/db/cargues.ts`) valida contra el stock
  de bodega igual que antes, pero **no toca `movimientos`** — solo inserta
  la cabecera PLANEADO y las líneas PENDIENTE.
- **Reducir** un cargue planeado es editar o borrar una línea mientras
  sigue PENDIENTE (`reducirLineaCargue`) — nunca generó ningún movimiento,
  así que no hay nada que revertir.
- **Entregar** (`confirmarLineaCargue`) es lo único que llama a
  `registrarCargue` (`src/db/cargue.ts`, sin cambios de firma) y genera el
  `RECARGA` real, línea por línea, cuando bodega confirma. Si la cantidad
  confirmada es menor a la planeada, la línea queda `REVISAR` con motivo
  obligatorio (mismo criterio que motivo obligatorio en `RETIRO_ADMIN`/
  anulación de venta) — se genera el `RECARGA` por lo que sí se entregó,
  nunca se inventa ni se fuerza el resto.
- Una línea `REVISAR` no bloquea las demás líneas del mismo cargue
  (decisión explícita del cliente) — cada línea es independiente.
- Bodega gana navegación (`app/bodega/`): antes iba directo a "ingresar
  pedido" sin menú; ahora tiene dos accesos — "Ingresar pedido" (sin
  cambios) y "Entregar cargues" (`app/bodega/cargues/`), con el mismo
  patrón de escanear + teclear cantidad que ya usaba
  `PantallaIngresarPedido`.

## Consecuencias

- Admin puede corregir un cargue antes de que salga físicamente, sin dejar
  rastro de un error de planeación en `movimientos` (porque nunca llegó a
  escribirse).
- Un cargue puede quedar parcialmente entregado durante varios días si
  bodega no tiene todo de una vez — el estado de cabecera (`ENTREGADO`)
  solo se marca cuando ninguna línea sigue `PENDIENTE`.
- Las líneas `REVISAR` quedan como un registro explícito de descuadre
  físico de bodega, resolubles después (`resolverLineaEnRevision`) sin
  perder de vista que hubo un problema — mismo espíritu que el descuadre
  de un conteo de cierre.
- `registrarCargue` sigue siendo la única función que escribe `RECARGA` en
  `movimientos` — este cambio es una capa de planeación por encima, no un
  reemplazo del mecanismo de bajo nivel.
