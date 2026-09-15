# Tu Lonchera

App móvil (Expo + React Native + TypeScript) para **Tu Lonchera**, distribuidora
colombiana de ponqués y licor. Reemplaza Loyverse y los Excel administrativos
con una única fuente de verdad del inventario, segmentada por promotor.
Detalle completo del dominio y las reglas de negocio en [`CLAUDE.md`](CLAUDE.md).

**Estado actual:** app local, sin servidor. Todo vive en SQLite en el
dispositivo — la sincronización en la nube es Fase 5.

## Qué está hecho y qué falta

### Fase 1 — Base local ✅ Completa
- [x] SQLite + sistema de migraciones versionado
- [x] Catálogo de productos (alta, edición, baja lógica) — 123 productos reales cargados
- [x] Usuarios y roles (promotor, bodega, admin) con login por PIN
- [x] Escáner de código de barras funcionando (`expo-camera`)

### Fase 2 — Motor de inventario 🔄 En curso
- [x] Movimientos como libro contable inmutable (nunca un `stock` editable)
- [x] Saldos por promotor calculados desde movimientos
- [x] Recarga (bodega → promotor)
- [ ] Conteo de cierre (teórico vs. contado)
- [ ] Aprobación de descuadres sobre el umbral

### Fase 3 — Ventas 🔄 En curso
- [x] Carrito por escáner o grilla, topado al saldo real del promotor
- [x] 3 medios de pago (efectivo, transferencia, libranza)
- [x] Recibo interno con numeración por dispositivo
- [x] Anulación de venta (movimiento compensatorio, nunca borrado — [ADR 0004](docs/03-decisiones/0004-anulacion-de-ventas.md))
- [ ] Arqueo de caja

### Fase 4 — Bodega 🔄 Empezada
- [x] Stock de bodega (vista de solo lectura)
- [x] Entrada de inventario por escáner (`COMPRA_PROVEEDOR`)
- [x] Cargue: admin asigna stock de bodega a un promotor, sin exceder lo disponible
- [ ] Alistamiento de cargue por escáner
- [ ] Niveles objetivo de recarga
- [ ] Alertas de vencimiento
- [ ] Pantalla propia del rol Bodega (hoy es una sola pantalla, no un menú)

### Fase 5 — Sincronización ⬜ Sin empezar
- [ ] Servidor y sincronización multi-dispositivo
- [ ] Panel web
- [ ] Visibilidad en tiempo real entre promotor, bodega y administración

### Fase 6 — Reportes ⬜ Sin empezar
- [ ] Reportes administrativos
- [ ] Recomendador de recarga por nivel objetivo

Detalle línea por línea de cada pantalla existente en
[CLAUDE.md §10](CLAUDE.md#10-roadmap).

## Documentación

- [`docs/README.md`](docs/README.md) — índice de documentación técnica y comercial
- [`docs/03-decisiones/`](docs/03-decisiones/README.md) — decisiones de arquitectura (ADRs)
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
