# ADR 0002 — Ventas y recargas sin `evento` (por ahora)

**Estado:** Aceptado, parcialmente superado por
[ADR 0003](0003-stock-de-bodega.md) — el punto sobre el origen `NULL` de
`RECARGA` ya no aplica: el cargue ahora sale de un stock de bodega real. El
resto de este documento (ventas y recargas sin `evento_id`) sigue vigente.

## Contexto

El esquema original (`CLAUDE.md` sección 7) ata `ventas.evento_id` como
`NOT NULL`: una venta ocurre siempre dentro de un evento (empresa + fecha +
promotor + conductor + camión). Al pedir el escáner, el ticket del promotor
y el registro de ventas del admin, el cliente no mencionó en ningún momento
la gestión de empresas o eventos — solo quería que un promotor pudiera
recibir cargue y vender.

Construir la gestión completa de eventos (crear evento, elegir empresa,
asignar conductor y camión) antes de tener siquiera una venta funcionando es
exactamente lo que `CLAUDE.md` sección 9 pide evitar ("rebanadas verticales,
no capas").

## Decisión

- `ventas.evento_id` pasa a ser opcional (migración
  `0006_ventas_sin_evento`). `movimientos.evento_id` ya era opcional desde
  el esquema original — no requirió cambio.
- Las recargas (cargue que el admin le asigna a un promotor) y las ventas no
  se asocian a ningún evento por ahora. El saldo de cada promotor vive
  directamente contra su propia fila en `ubicaciones` (tipo `PROMOTOR`),
  consistente con R4: el saldo es del promotor, no de un evento puntual.
- ~~El origen de una `RECARGA` queda en `NULL`, no en una ubicación de
  bodega: hoy no se contabiliza el stock propio de la bodega (eso es Fase 4,
  "alistamiento por escáner"). El cargue de un admin a un promotor es, por
  ahora, una inyección administrativa al saldo del promotor.~~ **Corregido
  en ADR 0003:** el cliente aclaró que el cargue sí debe depender de stock
  de bodega real. Ver ese ADR.

## Consecuencias

- Una venta o una recarga no queda ligada a "en qué feria/empresa pasó
  esto". Los reportes que necesiten esa dimensión (Fase 6) no van a poder
  reconstruirla para lo que se venda mientras esta decisión siga vigente.
- Cuando se construya la gestión de eventos, hay que decidir si se vuelve a
  exigir `evento_id` (y migrar los datos históricos con un evento "genérico"
  o dejarlos sin asociar) o si se queda opcional para siempre y los reportes
  simplemente toleran ventas sin evento.
- ~~El stock de la bodega sigue sin rastrearse...~~ **Ya no aplica** — ver
  ADR 0003.
