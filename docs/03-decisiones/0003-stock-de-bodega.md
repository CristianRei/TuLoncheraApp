# ADR 0003 — Stock de bodega real

**Estado:** Aceptado. Corrige parcialmente
[ADR 0002](0002-ventas-sin-evento.md).

## Contexto

En la rebanada de escáner/venta/cargue, el cargue que el admin le asigna a
un promotor se modeló como una `RECARGA` con `ubicacion_origen_id = NULL`:
una "inyección administrativa" al saldo del promotor, sin salir de ningún
lado. La razón fue no construir todavía el rastreo del stock de bodega
(anotado como parte de Fase 4).

El cliente corrigió esto: el cargue **sí** debe depender de lo que hay en
bodega. No se le puede asignar a un promotor un producto que no está en
stock, y asignárselo debe descontarlo del stock general.

## Decisión

- La bodega es una `ubicacion` más, de tipo `BODEGA` — el mismo mecanismo
  que ya existía para cada promotor (`ubicaciones.tipo = 'PROMOTOR'`). Es
  una sola fila (R1 del negocio: "una bodega"), creada perezosamente la
  primera vez que entra inventario.
- Nueva forma de que entre stock a la bodega: **entrada de inventario**
  (`app/admin/inventario/entrada.tsx`), que genera un `COMPRA_PROVEEDOR` por
  producto (tipo de movimiento que ya estaba en el esquema, sin usar). No
  captura costo todavía — no hay de dónde sacarlo.
- El cargue (`RECARGA`) ahora tiene origen real: la ubicación de bodega. El
  saldo de bodega baja con la misma resta que ya hacía
  `calcularSaldosPorProducto` — no hizo falta tocar `src/core/inventario`.
- Se valida en dos capas: la UI del cargue tope cada contador al disponible
  en bodega, y `registrarCargue` (`src/db/cargue.ts`) valida otra vez antes
  de escribir nada (`StockInsuficienteError` si no alcanza) — es una regla
  de negocio dura, no solo comodidad de interfaz.
- La pantalla "Inventario" del admin (antes vacía a propósito) ahora
  muestra el saldo de bodega por producto y el acceso a registrar una
  entrada.

## Consecuencias

- El cargue ya no puede exceder lo que realmente hay en bodega — resuelve
  el problema que reportó el cliente.
- Sigue sin capturarse el costo de cada entrada (`productos.costo` sigue
  vacío) — cuando se necesite margen/costos (sección 4: "ver costos y
  márgenes"), la entrada de inventario va a necesitar un campo de costo por
  unidad.
- El rol `BODEGA` sigue sin pantalla propia — hoy solo el admin registra
  entradas y cargue. Repartir esto entre bodega y admin, y el resto de Fase
  4 ("alistamiento por escáner", niveles objetivo, alertas de vencimiento),
  sigue pendiente.
