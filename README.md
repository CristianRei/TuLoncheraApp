# Tu Lonchera

App móvil (Expo + React Native + TypeScript) para **Tu Lonchera**, distribuidora
colombiana de ponqués y licor. Reemplaza Loyverse y los Excel administrativos
con una única fuente de verdad del inventario, segmentada por promotor.
Detalle completo del dominio y las reglas de negocio en [`CLAUDE.md`](CLAUDE.md).

**Estado actual:** app local-first, con un servidor parcial. SQLite en el
dispositivo sigue siendo la fuente de verdad para todo, pero ya casi todo
sincroniza a Supabase en background: turnos, comprobantes de transferencia,
mensajes/notificaciones push, y el motor completo de inventario/ventas
(ventas, movimientos, lotes, cargues, conteos de cierre, arqueos de caja —
ver [ADR 0006](docs/03-decisiones/0006-sincronizacion-turnos-comprobantes.md)
y CLAUDE.md sección 10). Todo eso sube (celular → Supabase). La dirección
contraria (Supabase → celular) cubre **personal/PINs**, **catálogo**
(productos/categorías, sin fotos) y los **datos operativos** — el admin ve las
ventas de los promotores, bodega ve los cargues que admin planea, y lo que
bodega entrega llega al inventario del promotor — con **Realtime** de Supabase
para que se vea al instante. Falta bajar empresas/puntos, eventos y descuentos
(ver CLAUDE.md sección 11), y todo esto está pendiente de probarse con
dispositivos reales contra un Supabase real (hay que correr
`supabase/migraciones/0009_sincronizacion_completa.sql`). Las pantallas abiertas se actualizan solas cuando llega algo nuevo.

## Qué está hecho y qué falta

### Fase 1 — Base local ✅ Completa
- [x] SQLite + sistema de migraciones versionado (0001 a 0026)
- [x] Catálogo de productos (alta, edición, baja lógica) — 123 productos reales cargados
- [x] Categorías de producto administrables (lista cerrada, sin duplicados por mayúsculas/espacios) y marca con autocompletado
- [x] Usuarios y roles (promotor, conductor, bodega, admin) con login por PIN (4 dígitos derivados de cédula, 6 manuales para admin)
- [x] Gestión completa de personal (los 4 roles): alta, edición, cambio de rol, baja, y eliminación real solo si nunca tuvo actividad
- [x] Escáner de código de barras funcionando (`expo-camera`)

### Fase 2 — Motor de inventario 🔄 En curso
- [x] Movimientos como libro contable inmutable (nunca un `stock` editable)
- [x] Saldos por promotor calculados desde movimientos
- [x] Recarga (bodega → promotor), en dos pasos: admin planea, bodega entrega
  por escáner ([ADR 0007](docs/03-decisiones/0007-cargues-pendientes.md))
- [x] Conteo de cierre (teórico vs. contado)
- [ ] Aprobación de descuadres sobre el umbral (R7, umbral sin definir)

### Fase 3 — Ventas ✅ Completa
- [x] Carrito por escáner o grilla, topado al saldo real del promotor
- [x] 3 medios de pago (efectivo, transferencia, libranza); transferencia
  exige foto del comprobante antes de registrar la venta
- [x] Recibo interno con numeración por dispositivo
- [x] Anulación de venta (movimiento compensatorio, nunca borrado — [ADR 0004](docs/03-decisiones/0004-anulacion-de-ventas.md))
- [x] Clientes finales (registro en campo por el promotor) y asignación de la factura a un cliente antes de cobrar
- [x] El promotor ve sus propias ventas del turno actual, con detalle
- [x] Arqueo de caja al cerrar turno (efectivo esperado vs. contado, admin lo ve en el detalle del turno)

### Fase 4 — Bodega 🔄 En curso
- [x] Stock de bodega (vista de solo lectura)
- [x] Entrada de inventario por escáner (`COMPRA_PROVEEDOR`)
- [x] Cargue en dos pasos: admin planea (sin tocar inventario) y puede
  reducirlo antes de entregar; bodega ejecuta línea por línea por escáner
- [x] Pantalla propia del rol Bodega (menú con dos accesos)
- [x] Descuadre de cargue ("a revisar") genera notificación para admin
- [ ] Niveles objetivo de recarga
- [ ] Alertas de vencimiento por lote próximo a vencer

### Fase 5 — Sincronización 🔄 Subida completa, bajada empezando
- [x] Turnos (selfie + hora + ubicación GPS) y comprobantes de
  transferencia sincronizan a Supabase en background, sin bloquear la app
  sin conexión
- [x] Calendario de eventos: admin planea empresa/punto/fecha por
  promotor, con series recurrentes y cancelación en caliente
- [x] PDF de cierre de turno (inventario final + ventas + datos del turno)
- [x] Mensajes/notificaciones push del admin a Promotor y Bodega (manual o
  progreso de meta del día) — requiere el `.apk` de EAS, no funciona en
  Expo Go desde el SDK 53
- [x] Ventas, movimientos de inventario, lotes, cargues y conteos de cierre
  sincronizan a Supabase (misma cola/motor que turnos y comprobantes)
- [x] **Sincronización en dirección de bajada** (Supabase → celular):
  personal/PINs (contratar a alguien y que pueda iniciar sesión en su propio
  celular) y catálogo (productos/categorías, sin fotos)
- [x] Datos operativos: el admin ve las ventas de los promotores, bodega ve
  los cargues, y el promotor recibe en su inventario lo que bodega entrega
- [x] Visibilidad en tiempo real (Realtime de Supabase) para ventas, cargues
  y movimientos
- [ ] Bajar el resto de lo que crea admin (empresas/puntos, eventos con meta
  diaria, descuentos) — todavía no llega al celular del promotor/bodega. Ver
  CLAUDE.md sección 11
- [ ] Fotos de producto (dónde almacenarlas y cómo viajan)
- [ ] Probar toda la sincronización con dos dispositivos contra un Supabase
  real (hoy solo verificada con `tsc`/tests/lint/bundle)
- [ ] Panel web
- [ ] Conductor todavía no tiene pantalla propia ni puede iniciar sesión

### Fase 6 — Reportes 🔄 Empezada
- [x] Dashboard con KPIs, filtros y desgloses (promotor/punto/categoría/hora)
- [x] Gráfico circular (método de pago, categoría) y ranking de productos (mejor/peor, por ingresos o por margen)
- [x] Exportar el resumen del período a Excel (una hoja por sección)
- [x] Metas de venta mensuales por promotor/punto, con proyección de cierre de mes
- [x] Meta de venta diaria por promotor y evento, con progreso en tiempo real
- [x] Filtro por día específico en el listado de Ventas del admin (además de hoy/rango)
- [x] Sección Análisis: repetibilidad por punto, rendimiento por promotor, correlaciones y cruces
- [ ] Reportes administrativos adicionales
- [ ] Recomendador de recarga por nivel objetivo

Detalle línea por línea de cada pantalla existente en
[CLAUDE.md §10](CLAUDE.md#10-roadmap).

## Documentación

- [`docs/README.md`](docs/README.md) — índice de documentación técnica y comercial
- [`docs/03-decisiones/`](docs/03-decisiones/README.md) — decisiones de arquitectura (ADRs)
- [`supabase/README.md`](supabase/README.md) — setup manual de tablas/RLS/Storage en Supabase
- [`CLAUDE.md`](CLAUDE.md) — contexto de dominio, reglas de negocio y convenciones

## Desarrollo

```bash
npm install
npm start        # expo start — escanear el QR con Expo Go en un celular real
npm test          # tests de src/core (node --test, sin emulador)
npm run test:db   # migraciones + flujos de src/db contra SQLite real (Node >= 22.5)
npm run test:sql  # el SQL de supabase/migraciones contra un Postgres real en memoria
npm run lint
npx tsc --noEmit
```

Probar siempre en dispositivo físico: los emuladores no tienen cámara real
para el escáner de código de barras.

## Generar un instalable (APK / Play Store)

Usa [EAS Build](https://docs.expo.dev/build/introduction/) (`eas.json` ya
configurado en el repo):

```bash
npx eas-cli login                                          # una sola vez
npx eas-cli build --platform android --profile preview      # .apk de prueba, distribución directa
npx eas-cli build --platform android --profile production   # .aab para Play Store
```

El perfil `preview` no pasa por Play Store — el link de descarga del `.apk`
se comparte directo (WhatsApp, Drive, USB). Publicar en Play Store requiere
además una cuenta de Google Play Developer (~$25 USD, pago único). Para
probar en iPhone sin pagar nada, usa Expo Go con `npm start` — no hace
falta build ni cuenta de Apple Developer para eso.
