# Tu Lonchera

App móvil (Expo + React Native + TypeScript) para **Tu Lonchera**, distribuidora
colombiana de ponqués y licor. Reemplaza Loyverse y los Excel administrativos
con una única fuente de verdad del inventario, segmentada por promotor.
Detalle completo del dominio y las reglas de negocio en [`CLAUDE.md`](CLAUDE.md).

**Estado actual:** app local-first, con un servidor parcial. SQLite en el
dispositivo sigue siendo la fuente de verdad para todo — solo turnos y
comprobantes de transferencia sincronizan a Supabase en background (ver
[ADR 0006](docs/03-decisiones/0006-sincronizacion-turnos-comprobantes.md)).
El resto del inventario/ventas sigue 100% local.

## Qué está hecho y qué falta

### Fase 1 — Base local ✅ Completa
- [x] SQLite + sistema de migraciones versionado (0001 a 0018)
- [x] Catálogo de productos (alta, edición, baja lógica) — 123 productos reales cargados
- [x] Usuarios y roles (promotor, bodega, admin) con login por PIN
- [x] Escáner de código de barras funcionando (`expo-camera`)

### Fase 2 — Motor de inventario 🔄 En curso
- [x] Movimientos como libro contable inmutable (nunca un `stock` editable)
- [x] Saldos por promotor calculados desde movimientos
- [x] Recarga (bodega → promotor), en dos pasos: admin planea, bodega entrega
  por escáner ([ADR 0007](docs/03-decisiones/0007-cargues-pendientes.md))
- [x] Conteo de cierre (teórico vs. contado)
- [ ] Aprobación de descuadres sobre el umbral (R7, umbral sin definir)

### Fase 3 — Ventas 🔄 En curso
- [x] Carrito por escáner o grilla, topado al saldo real del promotor
- [x] 3 medios de pago (efectivo, transferencia, libranza); transferencia
  exige foto del comprobante antes de registrar la venta
- [x] Recibo interno con numeración por dispositivo
- [x] Anulación de venta (movimiento compensatorio, nunca borrado — [ADR 0004](docs/03-decisiones/0004-anulacion-de-ventas.md))
- [ ] Arqueo de caja

### Fase 4 — Bodega 🔄 En curso
- [x] Stock de bodega (vista de solo lectura)
- [x] Entrada de inventario por escáner (`COMPRA_PROVEEDOR`)
- [x] Cargue en dos pasos: admin planea (sin tocar inventario) y puede
  reducirlo antes de entregar; bodega ejecuta línea por línea por escáner
- [x] Pantalla propia del rol Bodega (menú con dos accesos)
- [x] Descuadre de cargue ("a revisar") genera notificación para admin
- [ ] Niveles objetivo de recarga
- [ ] Alertas de vencimiento por lote próximo a vencer

### Fase 5 — Sincronización 🔄 Primera rebanada
- [x] Turnos (selfie + hora + ubicación GPS) y comprobantes de
  transferencia sincronizan a Supabase en background, sin bloquear la app
  sin conexión
- [x] Calendario de eventos: admin planea empresa/punto/fecha por
  promotor, con series recurrentes y cancelación en caliente
- [x] PDF de cierre de turno (inventario final + ventas + datos del turno)
- [ ] Sincronización del resto del inventario/ventas
- [ ] Panel web
- [ ] Visibilidad en tiempo real entre promotor, bodega y administración

### Fase 6 — Reportes 🔄 Empezada
- [x] Dashboard con KPIs, filtros y desgloses (promotor/punto/categoría/hora)
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
