# ADR 0005 — Puntos, asignación de promotor y descuentos

**Estado:** Aceptado.

## Contexto

El cliente pidió un dashboard administrativo con rastreo de ventas por
hora, artículo, promotor, categoría y marca, con ticket promedio, histórico
y desglose por método de pago. Al detallar el pedido, aclaró dos cosas más:

- Un cliente como Falabella tiene varios puntos de venta (Norte, Sur,
  Centro) y necesita poder verlos y filtrarlos por separado — no basta con
  la empresa.
- Los descuentos deben poder configurarse por producto específico (en todos
  los puntos), por punto específico (en todos los productos), o por la
  combinación de ambos, con vigencia limitada, y aplicarse automáticamente
  al cobrar.

`empresas` y `eventos` existen en el esquema desde la migración inicial
pero estaban sin usar — el ADR 0002 documentó por qué (el cliente nunca
pidió gestión de eventos) y advirtió explícitamente que "los reportes que
necesiten esa dimensión no van a poder reconstruirla mientras esta decisión
siga vigente". Este ADR es exactamente ese momento.

También se aclaró el alcance de "tiempo real": el dashboard se actualiza
solo con datos del mismo dispositivo admin, sin sincronización entre
dispositivos — eso es la Fase 5 (servidor), que sigue sin construirse (R6).
Y se aclaró que el calendario de eventos con reasignación en caliente
(mover a un promotor a otro evento si el suyo se cancela a media mañana) es
una fase futura del módulo de eventos, no parte de esta rebanada.

## Decisión

- **`puntos`** es una tabla nueva: sede de una `empresa` (`empresa_id` FK).
  Falabella es una empresa; Norte/Sur/Centro son sus puntos.
- **`eventos`** se recrea con `punto_id` y se activa, pero **no representa
  todavía una jornada con fecha y calendario**. En esta rebanada es
  exactamente "la asignación vigente de un promotor a un punto": el admin
  la crea (`estado = 'EN_CURSO'`), y si reasigna al promotor a otro punto,
  el evento anterior se cierra (`estado = 'CERRADO'`) y se crea uno nuevo.
  El promotor no elige nada — entra a la app y ya tiene su punto asignado.
  Reutilizar `eventos` en vez de crear una tabla de "asignación" paralela
  evita que cuando se construya el calendario real haya dos conceptos
  compitiendo por el mismo rol.
- **`ventas` gana `punto_id`** (opcional). Se resuelve una sola vez, al
  momento de `registrarVenta`, a partir del punto vigente del promotor en
  ese instante, y queda grabado en la fila — no se recalcula después. Esto
  es necesario para que el dashboard pueda filtrar/agrupar ventas
  históricas por punto: si solo mirara el evento `EN_CURSO` actual del
  promotor, una reasignación posterior haría perder la ubicación real de
  las ventas pasadas (el problema que el ADR 0002 ya había anticipado).
- **`descuentos`** es una tabla nueva: `producto_id` y `punto_id` opcionales
  de forma independiente. `NULL` en uno significa "aplica a todos" en esa
  dimensión. Cuando varias reglas vigentes podrían aplicar a la misma
  venta, gana la más específica: producto+punto > solo producto > solo
  punto. La vigencia es `desde`/`hasta`; un admin puede desactivar un
  descuento antes de tiempo (`activo = 0`), pero nunca se edita el valor o
  las fechas de una regla ya creada — para cambiarla se desactiva y se crea
  una nueva.
- El descuento se resuelve y se aplica **dentro de `registrarVenta`**,
  sobre el precio unitario que efectivamente se guarda en `venta_items`. El
  recibo y el total ya reflejan el precio con descuento — no hace falta
  ninguna columna extra ni recalcular nada después.
- `productos` gana `marca` (opcional, igual que `categoria`). Ninguna de
  las dos se carga con datos reales todavía — el catálogo de 123 productos
  sigue sin esa información (ver ADR previo de carga de catálogo).
- El dashboard (`app/admin/dashboard/`) se refresca automáticamente cada
  15 segundos mientras la pantalla está enfocada — es "tiempo real" dentro
  del mismo dispositivo, no push desde el dispositivo de un promotor.

## Consecuencias

- Una venta hecha por un promotor sin punto asignado sigue funcionando
  igual que antes: `punto_id` queda `NULL`, no se aplica ningún descuento
  que dependa de punto, y no bloquea la venta.
- El calendario de eventos con fecha real, reasignación en caliente durante
  el día, y visibilidad de eventos en el perfil del promotor, sigue sin
  construirse. Cuando se construya, hay que decidir cómo convive con el uso
  actual de `eventos` como "asignación vigente" — probablemente esta
  asignación pase a ser el evento del día en curso, en vez de un concepto
  separado.
- La sincronización entre dispositivos (para ver en vivo lo que vende un
  promotor en otro celular) sigue sin construirse — es la Fase 5 completa
  (servidor, autenticación real, protocolo de sync), no parte de esta
  rebanada.
- Los filtros de categoría y marca en el dashboard no tendrán opciones
  reales hasta que se cargue esa información en el catálogo existente.
