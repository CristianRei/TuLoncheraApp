# ADR 0004 — Anulación de ventas (movimiento compensatorio, no borrado)

**Estado:** Aceptado

## Contexto

El cliente dejó una venta de prueba registrada y pidió poder quitarla desde
la app. `CLAUDE.md` regla R2 ya decía, en abstracto, que un error en
`movimientos` "se corrige con un movimiento compensatorio... nunca
borrando" — pero hasta ahora ningún camino de código implementaba ese
mecanismo. Esta es la primera vez que se necesita de verdad.

Un `DELETE` sobre `ventas`/`venta_items` no sirve por sí solo: el saldo del
promotor se calcula sumando `movimientos` (R1), y la venta ya generó un
`VENTA` que le restó producto a su inventario. Borrar la fila de `ventas`
no tocaría ese movimiento — el promotor seguiría viendo el descuento en su
saldo aunque la venta "desapareciera" de la lista del admin.

## Decisión

- Anular una venta **nunca la borra**. Se marca (`ventas.anulada = 1`,
  `motivo_anulacion`) — mismo patrón que `productos.activo`.
- Se revierte el efecto en el inventario con un movimiento nuevo por cada
  línea: tipo `ANULACION_VENTA`, origen `NULL`, destino la ubicación del
  promotor (el producto le vuelve). Es simétrico al `VENTA` original
  (origen promotor, destino `NULL`) que se lo había quitado.
- Se agregó `ANULACION_VENTA` al `CHECK` de `movimientos.tipo` (migración
  `0008`, recrea la tabla) en vez de reutilizar `RECARGA`: decir que el
  producto "volvió a cargarse desde bodega" sería falso — no salió de
  bodega, se le está devolviendo lo que ya era suyo.
- El motivo es obligatorio, mismo criterio que `RETIRO_ADMIN` (R4): anular
  mueve inventario real y toca un registro financiero, no es un toggle sin
  consecuencias.
- La lista de ventas del admin gana pestañas Activas/Anuladas — mismo
  patrón que Activos/Eliminados en el catálogo.

## Consecuencias

- El historial de ventas nunca tiene huecos: una venta anulada sigue siendo
  visible (en su pestaña), con quién la anuló y por qué.
- El mecanismo (marcar + movimiento compensatorio, nunca borrar ni editar)
  queda establecido en código real, no solo en la regla R2 en abstracto.
  Sirve de referencia directa para lo próximo que necesite lo mismo — por
  ejemplo, anular un cargue mal hecho.
- No hay una noción de "quién debe aprobar una anulación" — hoy cualquier
  admin puede anularla sola. Si eso resulta ser un problema real (más de un
  admin, o el mismo tipo de control que ya existe para descuadres en R7),
  habría que revisitar esto.
