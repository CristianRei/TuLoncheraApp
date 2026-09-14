# Tu Lonchera — Contexto del proyecto

> Este archivo entra en el contexto de cada sesión. Mantenerlo denso y corto.
> Los detalles largos viven en `docs/` y se leen bajo demanda.

---

## 1. Qué es esto

App móvil para **Tu Lonchera**, distribuidora colombiana de productos consumibles
(ponqués y licor). La empresa tiene **una bodega** y **dos camiones**. Cada día
realiza eventos tipo *feria* dentro de empresas cliente, donde promotores venden
producto directamente al consumidor.

El objetivo es **eliminar el papel y los Excel**, y tener una única fuente de verdad
del inventario segmentada por promotor.

Reemplaza a: Loyverse (POS + inventario) y hojas de Excel administrativas.

**Estado actual: app local, sin servidor.** Todo vive en SQLite en el dispositivo.
La sincronización en la nube es una fase posterior, pero el diseño la anticipa (ver R6).

---

## 2. Glosario del dominio

Términos del negocio. Úsalos tal cual en código, tablas, variables y UI.
**No los traduzcas al inglés ni los reinterpretes.**

| Término | Significado |
|---|---|
| **Evento** | Jornada de venta en una empresa cliente. Tiene fecha, empresa, promotor y conductor. |
| **Cargue** | Inventario que un promotor lleva a un evento. |
| **Recarga** | Reposición de producto al inventario de un promotor, hecha en bodega. |
| **Saldo** | Producto que le queda a un promotor. **El saldo NO regresa a bodega**; sigue asignado al promotor. |
| **Conteo de cierre** | Recuento físico que hace el promotor al terminar el evento. |
| **Teórico** | Saldo que el sistema calcula. Se compara contra lo contado. |
| **Descuadre** | Diferencia entre teórico y contado. |
| **Recibo** | Comprobante **interno** de una venta. Existe para que el promotor no sume a mano y para dejar registro. No tiene valor fiscal ni se reporta a ninguna entidad. |
| **Promotor** | Persona que vende en el evento. |
| **Conductor** | Transporta producto y promotores. Hay 2 camiones. |
| **Bodega** | Rol operativo que alista recargas y recibe devoluciones. |

---

## 3. Reglas de dominio inviolables

Estas reglas son la razón de ser de la arquitectura. Romperlas invalida el sistema.

### R1 — El inventario es un libro de movimientos, nunca un número editable

No existe ninguna columna `stock` mutable. El saldo de cualquier ubicación es una
**consulta agregada sobre `movimientos`**. Ningún código escribe un saldo
directamente. Todo cambio de inventario inserta una fila en `movimientos`.

Si aparece la tentación de hacer `UPDATE productos SET stock = ...`, la solución
correcta es insertar un movimiento.

### R2 — Los movimientos son inmutables

Nunca `UPDATE` ni `DELETE` sobre `movimientos`. Un error se corrige con un
movimiento compensatorio (`AJUSTE_CONTEO` o reverso), nunca borrando.

### R3 — Todo movimiento nace con un UUID generado en el dispositivo

El UUID lo genera el cliente, no la base de datos. Nada de `AUTOINCREMENT` como
clave primaria en tablas de dominio. Esto hace que la futura sincronización sea
idempotente: reintentar una subida nunca duplica.

### R4 — El saldo pertenece al promotor hasta que se venda o lo retire un admin

Desde que se le hace la recarga, el producto está en el inventario del promotor sin
importar dónde duerma físicamente (bodega, camión o su casa). Solo hay dos salidas:

- `VENTA` — la ejecuta el promotor
- `RETIRO_ADMIN` — solo administración, con motivo obligatorio

`RETIRO_ADMIN` es la única puerta por la que se podría encubrir un faltante. Debe
quedar siempre registrada con usuario, motivo y timestamp.

### R5 — La app debe funcionar sin conexión, siempre

Los eventos ocurren dentro de edificios de oficinas sin señal. Vender, contar y
recibir recargas funcionan **contra SQLite local**. La UI nunca bloquea esperando
red. Hoy esto es trivial porque no hay servidor; la regla existe para que siga
siendo cierta cuando lo haya.

### R6 — Diseñar para sincronizar después, no sincronizar ahora

No construyas capa de sincronización todavía. Pero respeta estas restricciones para
que agregarla después no obligue a rehacer nada:

- Claves primarias UUID generadas en el cliente (R3)
- Movimientos inmutables y append-only (R2)
- Cada fila lleva `ts_cliente` y un `dispositivo_id`
- Los consecutivos visibles al usuario (número de recibo) llevan **prefijo de
  dispositivo**: `P01-000142`. Sin prefijo, dos promotores generarán el mismo
  número y colisionarán al sincronizar.
- Ninguna lógica depende del reloj del servidor ni del orden de inserción

### R7 — Los descuadres por encima de un umbral requieren aprobación

Un promotor no puede autoaprobar sus propios ajustes por encima del umbral
configurado. Un descuadre pendiente **bloquea la siguiente recarga** hasta que
administración lo resuelva.

---

## 4. Actores y permisos

| Acción | Promotor | Conductor | Bodega | Admin |
|---|:--:|:--:|:--:|:--:|
| Vender | ✅ | — | — | ✅ |
| Ver su propio inventario | ✅ | — | — | ✅ |
| Ver inventario de todos | — | — | ✅ | ✅ |
| Conteo de cierre | ✅ | — | — | ✅ |
| Recibir recarga (escanear) | ✅ | ✅ | — | — |
| Alistar recarga en bodega | — | — | ✅ | — |
| Crear orden de recarga | — | — | ✅ | ✅ |
| `RETIRO_ADMIN` | — | — | — | ✅ |
| Aprobar descuadres | — | — | — | ✅ |
| Ver costos y márgenes | — | — | — | ✅ |
| Gestionar usuarios | — | — | — | ✅ |

**Nota honesta sobre el alcance actual:** mientras la app sea local, los permisos
son de interfaz, no de seguridad. Alguien con acceso al dispositivo puede
manipular el SQLite. Eso es aceptable para esta etapa; cada dispositivo pertenece a
una persona conocida. Cuando exista servidor, la autoridad se mueve allá y los
permisos del cliente pasan a ser solo UX. Estructura el código para que ese cambio
sea reemplazar una capa, no reescribir pantallas: **toda verificación de permiso
pasa por una única función**, nunca `if (rol === 'admin')` disperso por la UI.

---

## 5. Stack

| Capa | Tecnología |
|---|---|
| Móvil | React Native + Expo, TypeScript, `expo-router` |
| Escáner | `expo-camera` (`CameraView` + `onBarcodeScanned`) |
| Datos | `expo-sqlite` |
| Backend | **Ninguno por ahora** (fase posterior) |
| Panel admin | **No existe todavía.** Por ahora, pantallas de admin dentro de la misma app móvil. |

`expo-barcode-scanner` está deprecado desde SDK 51; el escaneo está integrado en
`expo-camera`. No lo instales.

Todo lo del SDK de Expo funciona en **Expo Go**. Solo hace falta un development
build si se agrega un módulo nativo fuera del SDK (por ejemplo impresora térmica
Bluetooth o lector láser Bluetooth). Probar siempre en dispositivo físico: los
emuladores no tienen cámara real.

---

## 6. Estructura del proyecto

```
tulonchera/
  CLAUDE.md
  docs/
    01-proceso-actual.md      ← mapeo AS-IS
    02-modelo-datos.md        ← esquema completo y razonamiento
    03-decisiones/            ← ADRs numerados
  app/                        ← expo-router (pantallas)
  src/
    core/                     ← lógica de dominio, SIN dependencias de React
      inventario/             ← cálculo de saldos, validación de movimientos
      tipos/
    db/                       ← SQLite: esquema, migraciones, queries
    ui/                       ← componentes compartidos
  assets/
```

**`src/core` no importa React ni nada de Expo.** Es TypeScript puro. Así se puede
testear sin emulador y reutilizar en el panel web el día que exista.

---

## 7. Modelo de datos (resumen)

Detalle completo en `docs/02-modelo-datos.md`.

```
usuarios          (id, nombre, rol, activo, pin)
ubicaciones       (id, tipo[BODEGA|CAMION|PROMOTOR], nombre, responsable_id)
productos         (id, sku, codigo_barras, nombre, categoria,
                   es_licor, es_perecedero, precio, costo, unidad_empaque)
lotes             (id, producto_id, fecha_vencimiento)
empresas          (id, nombre, direccion, sector, contacto)
eventos           (id, empresa_id, fecha, promotor_id, conductor_id,
                   camion_id, estado)
movimientos       (id UUID PK, tipo, producto_id, lote_id, cantidad,
                   ubicacion_origen, ubicacion_destino, evento_id,
                   usuario_id, motivo, ts_cliente, dispositivo_id)
ventas            (id UUID PK, numero_recibo, evento_id, promotor_id,
                   ts_cliente, metodo_pago, total, dispositivo_id)
venta_items       (venta_id, producto_id, cantidad, precio_unitario)
conteos           (id UUID PK, evento_id, ts_cliente, estado, firmado_por)
conteo_lineas     (conteo_id, producto_id, teorico, contado,
                   diferencia, motivo, aprobado_por)
niveles_objetivo  (promotor_id, producto_id, cantidad, actualizado_ts)
```

**Tipos de movimiento:**
`COMPRA_PROVEEDOR`, `RECARGA`, `VENTA`, `TRASLADO`, `RETIRO_ADMIN`,
`AJUSTE_CONTEO`, `AVERIA`, `DEGUSTACION`, `OBSEQUIO`, `DEVOLUCION_VENCIMIENTO`

**Reposición por nivel objetivo:**
```
recarga_sugerida = nivel_objetivo − saldo_actual
nivel_objetivo   = demanda_diaria_esperada × dias_cobertura × (1 + factor_servicio)
```

---

## 8. Convenciones de código

- **Idioma:** términos del dominio en español (`recarga`, `saldo`, `movimiento`).
  Infraestructura técnica en inglés (`useScanner`, `formatCurrency`, `DbClient`).
  No inventar traducciones de los términos del glosario.
- **TypeScript estricto.** `strict: true`. Sin `any` salvo excepción justificada.
- **Dinero:** enteros. Nunca `float`. Definir la unidad una sola vez en
  `src/core/tipos` y no mezclarla.
- **Fechas:** timestamps ISO 8601 con zona. Presentación en `America/Bogota`.
- **Esquema:** toda evolución pasa por archivos de migración versionados en
  `src/db/migraciones/`. La app aplica las pendientes al arrancar. Nunca editar el
  esquema a mano.
- **Nada de datos ficticios en la UI.** Si un dato no está disponible, estado vacío
  o de carga, no un placeholder inventado.

---

## 9. Cómo trabajar en este repo

1. **Planifica antes de escribir código.** Para cualquier tarea no trivial, explica
   el enfoque y espera confirmación antes de generar archivos.
2. **Rebanadas verticales, no capas.** Una funcionalidad completa de migración a
   pantalla. No "toda la base de datos" y luego "toda la UI".
3. **Un branch y un PR por funcionalidad.**
4. **Tests donde duele.** `src/core/inventario` necesita tests de propiedad: sin
   importar el orden de los movimientos, la suma de todas las ubicaciones debe
   cuadrar. Si eso se rompe, nada más importa. Como `core` es TypeScript puro, esos
   tests corren en Node sin emulador.
5. **Seeds realistas.** Probar con el catálogo real, no con `producto_1`.

---

## 10. Roadmap

**Estado: Fase 2-3 en curso (Fase 1 completa).**

| Fase | Alcance | Estado |
|---|---|---|
| 1 | Base local: SQLite, migraciones, catálogo de productos, usuarios y roles, escáner funcionando | ✅ |
| 2 | Motor de inventario: movimientos, saldos por promotor, recarga, conteo de cierre con teórico vs contado | 🔄 Recarga y saldos listos; falta conteo de cierre |
| 3 | Ventas: carrito por escáner, medios de pago, recibo interno, arqueo | 🔄 Venta y recibo interno listos; falta arqueo |
| 4 | Bodega: alistamiento por escáner, niveles objetivo, alertas de vencimiento | 🔄 Stock de bodega y entrada de inventario listos (ver ADR 0003); falta alistamiento por escáner, niveles objetivo, alertas de vencimiento, y pantalla propia del rol Bodega |
| 5 | Sincronización y servidor. Panel web. Visibilidad en tiempo real | ⬜ |
| 6 | Reportes administrativos. Recomendador de recarga afinado | ⬜ |

**Regla de despliegue:** ningún promotor deja de usar su método actual sin dos
semanas de operación en paralelo. Si la app falla en un evento, ese día no se vende.

---

## 11. Preguntas abiertas

No asumas respuestas. Si una tarea depende de alguna, pregunta primero.

- [ ] ¿Cuál es el umbral en pesos para aprobación de descuadres?
- [ ] ¿Los promotores rotan entre empresas o cada uno tiene ruta fija?
      Determina si el nivel objetivo se calcula por promotor o por empresa.
- [ ] ¿El recibo se imprime, se muestra en pantalla, o se envía por WhatsApp?
      Si se imprime, hace falta impresora Bluetooth y development build. Hoy
      el recibo interno solo existe como registro en la base de datos,
      visible para el admin.
- [ ] Para una venta por libranza, ¿hace falta capturar nombre/cédula del
      comprador para poder procesar el descuento de nómina más adelante? Por
      ahora no se captura (decisión explícita del cliente, ver
      `docs/03-decisiones/0002-ventas-sin-evento.md`).

**Resuelto:** autenticación por PIN de 4 dígitos, sin contraseña en ningún
rol. Ver `docs/03-decisiones/0001-metodo-autenticacion.md`.

**Resuelto:** medios de pago = Efectivo, Transferencia, Libranza.

**Resuelto (parcial):** no todos los productos tienen código de barras
legible todavía — el catálogo permite escribirlo a mano si escanear la
etiqueta no funciona.

---

## 12. Qué NO hacer

- No escribir columnas de stock. Ver R1.
- No usar `AUTOINCREMENT` como clave primaria de tablas de dominio. Ver R3.
- No construir capa de sincronización todavía. Ver R6.
- No usar `AsyncStorage` para datos de inventario. Va en SQLite.
- No dispersar checks de permisos por la UI. Ver sección 4.
- No instalar `expo-barcode-scanner`. Está deprecado.
- No añadir dependencias pesadas sin justificarlo. Cada librería es peso en el APK
  y riesgo de incompatibilidad con el SDK de Expo.

---

## 13. Marca

| Color | Hex | Uso |
|---|---|---|
| Primario | `#F3A712` | Dorado/mostaza. Pantallas de promotor. |
| Oscuro | `#541212` | Vinotinto. Pantallas de administración y bodega. |
