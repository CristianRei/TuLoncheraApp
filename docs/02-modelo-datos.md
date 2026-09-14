# Modelo de datos

> Detalle completo del esquema resumido en `CLAUDE.md` sección 7. La fuente de
> verdad ejecutable es la migración `src/db/migraciones/0001_esquema_inicial.ts`;
> este documento explica el razonamiento, no lo duplica en detalle exhaustivo.

## Principios que moldean cada tabla

- **Claves primarias UUID (`TEXT`), nunca `AUTOINCREMENT`** en tablas de
  dominio (R3). El UUID se genera en el dispositivo (`expo-crypto`,
  `Crypto.randomUUID()`), no en SQLite. Esto es lo que permite que una futura
  subida a servidor sea idempotente.
- **`movimientos` es append-only** (R2). No existe ningún camino de código que
  haga `UPDATE` o `DELETE` sobre esa tabla. Un error se corrige con un
  movimiento compensatorio (`AJUSTE_CONTEO` u otro), nunca borrando.
- **Ningún `stock` mutable** (R1). El saldo de cualquier ubicación —
  bodega, camión o promotor — es siempre `SUM(movimientos)` agregado, calculado
  en `src/core/inventario` (Fase 2). No hay columna `stock` en ninguna tabla.
- **`ts_cliente` + `dispositivo_id` en cada fila** (R6), para que la
  sincronización futura pueda ordenar y deduplicar sin depender del reloj del
  servidor ni del orden de inserción.

## Tablas

| Tabla | Rol en el negocio |
|---|---|
| `usuarios` | Personas: promotores, conductores, bodega, admin. `rol` fija el actor (sección 4 de `CLAUDE.md`). |
| `ubicaciones` | Bodega, cada camión, y el inventario "virtual" de cada promotor. Todo saldo vive contra una ubicación. |
| `productos` | Catálogo: ponqués y licor. `precio`/`costo` en pesos enteros. |
| `lotes` | Agrupa unidades de un producto por fecha de vencimiento (relevante para perecederos). |
| `empresas` | Cliente donde ocurre un evento/feria. |
| `eventos` | Una jornada de venta: empresa + fecha + promotor + conductor + camión. |
| `movimientos` | El libro contable del inventario. Cada fila es un hecho inmutable: qué producto, cuánto, de dónde a dónde, por qué tipo de movimiento. |
| `ventas` | Cabecera de una venta (recibo interno, sin valor fiscal). |
| `venta_items` | Líneas de una venta. |
| `conteos` / `conteo_lineas` | Conteo de cierre: teórico vs. contado, con motivo y aprobación cuando hay descuadre (R7). |
| `niveles_objetivo` | Insumo para la recarga sugerida (ver fórmula en `CLAUDE.md` sección 7). Es configuración, no un movimiento — sí se actualiza in place. |

## Tipos de movimiento

`COMPRA_PROVEEDOR`, `RECARGA`, `VENTA`, `TRASLADO`, `RETIRO_ADMIN`,
`AJUSTE_CONTEO`, `AVERIA`, `DEGUSTACION`, `OBSEQUIO`, `DEVOLUCION_VENCIMIENTO`.

`RETIRO_ADMIN` es la única salida que no es una venta, y solo la ejecuta un
admin con motivo obligatorio (R4) — es el punto de auditoría más sensible del
sistema.

## Pendiente para cuando se construya cada feature

Estas decisiones no se tomaron en el esquema inicial porque dependen de
respuestas de negocio que siguen abiertas (`CLAUDE.md` sección 11):

- Umbral en pesos para aprobación de descuadres (R7) — probablemente una fila
  de configuración, no una constante hardcodeada.
- Si el nivel objetivo se calcula por promotor o por empresa, según si los
  promotores rotan de empresa.
- Medios de pago exactos a aceptar (la columna `metodo_pago` ya tiene un
  `CHECK` con las 4 opciones mencionadas en la sección 11, pero podría cambiar).
- Formato exacto del número de recibo con prefijo de dispositivo
  (`P01-000142`, R6) — el esquema ya reserva `numero_recibo TEXT UNIQUE`, pero
  la lógica de generación del consecutivo vive en `src/core`, no en la DB.
