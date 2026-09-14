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

`app/` sigue expo-router: cada archivo es una pantalla, cada carpeta un
segmento de ruta. Este árbol es el real (no un sketch) — revisar con
`find app src -type f` si vuelve a quedar desactualizado.

```
tulonchera/
  CLAUDE.md
  docs/
    01-proceso-actual.md      ← todavía no existe: falta mapeo AS-IS real del negocio
    02-modelo-datos.md        ← esquema completo y razonamiento
    03-decisiones/            ← ADRs numerados (índice en sección 10)
  app/
    index.tsx                  ← login: un solo PIN, sin contraseña
    promotor/index.tsx          ← venta: grilla de inventario + ticket + escáner + cobrar
    admin/
      index.tsx                  ← menú de módulos
      catalogo/                   ← alta / edición / baja de productos
      inventario/                  ← stock de bodega + registrar entradas
      cargue/                       ← asignar cargue a un promotor (sale de bodega)
      ventas/                        ← listado + detalle de ventas registradas
    bodega/index.tsx             ← placeholder: el rol Bodega no tiene pantallas propias todavía
    _layout.tsx                 ← migra la DB al arrancar, envuelve todo en SesionProvider
  src/
    core/                       ← lógica de dominio, SIN dependencias de React ni Expo
      auth/                       ← modo de login (promotor/admin/bodega) → roles permitidos
      dinero/                      ← formatearPesos / parsearPesos
      inventario/                   ← calcularSaldosPorProducto + su property test
      tipos/                         ← tipos de dominio compartidos
    db/                         ← SQLite: cliente, migraciones, una query file por tabla/tema
      migraciones/                ← 0001 a 0007, versionadas, nunca se editan una vez aplicadas
    ui/                         ← componentes y hooks compartidos (sí usan React/Expo)
  assets/
```

**`src/core` no importa React ni nada de Expo.** Es TypeScript puro. Se puede
testear sin emulador (`npm test`, corre con `node --test`) y reutilizar en el
panel web el día que exista.

---

## 7. Modelo de datos (resumen)

Estado real después de las migraciones 0001-0007. Detalle completo y
razonamiento en `docs/02-modelo-datos.md`.

```
usuarios          (id, nombre, rol, activo, pin)
ubicaciones       (id, tipo[BODEGA|CAMION|PROMOTOR], nombre, responsable_id)
                  ← BODEGA es una sola fila (singleton); cada promotor tiene
                    la suya. Ambas se crean perezosamente, no por migración.
productos         (id, sku, codigo_barras, nombre, categoria[opcional],
                   es_licor, es_perecedero, precio, costo[opcional],
                   unidad_empaque, foto_uri[opcional], activo)
                  ← categoria/costo opcionales: no vinieron en la carga
                    inicial. "Eliminar" = activo=0, nunca DELETE.
lotes             (id, producto_id, fecha_vencimiento)         ← sin usar todavía
empresas          (id, nombre, direccion, sector, contacto)     ← sin usar todavía
eventos           (id, empresa_id, fecha, promotor_id, conductor_id,
                   camion_id, estado)                             ← sin usar todavía
movimientos       (id UUID PK, tipo, producto_id, lote_id, cantidad,
                   ubicacion_origen_id, ubicacion_destino_id, evento_id[opcional],
                   usuario_id, motivo, ts_cliente, dispositivo_id)
                  ← el libro contable real. Ver ADR 0002/0003 para el porqué
                    de evento_id opcional y de que RECARGA tenga origen real.
ventas            (id UUID PK, numero_recibo, evento_id[opcional], promotor_id,
                   ts_cliente, metodo_pago[EFECTIVO|TRANSFERENCIA|LIBRANZA],
                   total, dispositivo_id)
venta_items       (venta_id, producto_id, cantidad, precio_unitario,
                   ts_cliente, dispositivo_id)
conteos           (id UUID PK, evento_id, ts_cliente, estado, firmado_por)  ← sin usar todavía
conteo_lineas     (conteo_id, producto_id, teorico, contado,
                   diferencia, motivo, aprobado_por)                         ← sin usar todavía
niveles_objetivo  (promotor_id, producto_id, cantidad, actualizado_ts)        ← sin usar todavía
```

**Tipos de movimiento:**
`COMPRA_PROVEEDOR`, `RECARGA`, `VENTA`, `TRASLADO`, `RETIRO_ADMIN`,
`AJUSTE_CONTEO`, `AVERIA`, `DEGUSTACION`, `OBSEQUIO`, `DEVOLUCION_VENCIMIENTO`,
`ANULACION_VENTA`.
Hoy en uso: `COMPRA_PROVEEDOR` (entrada a bodega), `RECARGA` (bodega →
promotor), `VENTA` (promotor → afuera) y `ANULACION_VENTA` (revierte una
venta: afuera → promotor, ver ADR 0004). El resto sigue sin implementarse.

**Reposición por nivel objetivo** (Fase 6, sin construir):
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

**Estado: Fase 2-3 en curso (Fase 1 completa, Fase 4 empezada).**

| Fase | Alcance | Estado |
|---|---|---|
| 1 | Base local: SQLite, migraciones, catálogo de productos, usuarios y roles, escáner funcionando | ✅ |
| 2 | Motor de inventario: movimientos, saldos por promotor, recarga, conteo de cierre con teórico vs contado | 🔄 Recarga y saldos listos; falta conteo de cierre |
| 3 | Ventas: carrito por escáner, medios de pago, recibo interno, arqueo | 🔄 Venta y recibo interno listos; falta arqueo |
| 4 | Bodega: alistamiento por escáner, niveles objetivo, alertas de vencimiento | 🔄 Stock de bodega y entrada de inventario listos; falta alistamiento por escáner, niveles objetivo, alertas de vencimiento, y pantalla propia del rol Bodega |
| 5 | Sincronización y servidor. Panel web. Visibilidad en tiempo real | ⬜ |
| 6 | Reportes administrativos. Recomendador de recarga afinado | ⬜ |

### Qué existe hoy, concretamente

- **Login** (`app/index.tsx`): un PIN de 4 dígitos, sin contraseña en ningún
  rol; modo promotor por defecto, botones para entrar como administrador o
  bodega. Usuarios de prueba solo en `__DEV__` (`src/db/seed.ts`): Admin
  `0000`, Cristian/promotor `8509`, Bodega `1234`.
- **Catálogo** (`app/admin/catalogo/`): alta, edición (nombre, precio, foto,
  código de barras) y baja lógica (`activo=0`) de productos. Solo admin.
  Catálogo real del cliente ya cargado (123 productos, migración 0005).
- **Stock de bodega** (`app/admin/inventario/`): vista de solo lectura del
  saldo por producto. La única forma de que entre stock es "Ingresar
  pedido" (`src/ui/PantallaIngresarPedido.tsx`, compartida con Bodega):
  escanear el producto y teclear la cantidad (suelen ser +60 unidades, por
  eso teclear y no un contador +/-) → `COMPRA_PROVEEDOR`. Sin captura de
  costo todavía.
- **Bodega** (`app/bodega/index.tsx`): su pantalla de inicio *es*
  "Ingresar pedido" directamente — hoy es su única función, así que no hay
  un menú intermedio como en Admin.
- **Cargue** (`app/admin/cargue/`): admin asigna productos del stock de
  bodega a un promotor (`RECARGA`, bodega → promotor); no deja asignar más
  de lo disponible.
- **Venta del promotor** (`app/promotor/index.tsx`): grilla de su propio
  inventario con buscador, escáner de código de barras, ticket (carrito) y
  cobro con los 3 medios de pago. No bloquea vender más de lo que el saldo
  calculado indica al tocar la grilla (sí al escanear algo que no tiene) —
  los descuadres reales se resuelven en el conteo de cierre, que todavía no
  existe.
- **Ventas del admin** (`app/admin/ventas/`): listado (promotor + total,
  pestañas Activas/Anuladas) y detalle (líneas) de cada venta. Se puede
  anular una venta con motivo obligatorio — nunca se borra, se marca y se
  revierte con un movimiento compensatorio (ver ADR 0004).

Lo que falta de cada fase (conteo de cierre, arqueo, alistamiento por
escáner, niveles objetivo, gestión de empresas/eventos, sincronización,
reportes) sigue sin construirse — no asumir que existe.

### Decisiones registradas (`docs/03-decisiones/`)

- **0001 — Método de autenticación.** PIN único, sin contraseña en ningún rol.
- **0002 — Ventas y recargas sin `evento`.** `evento_id` opcional; no se
  pidió gestión de empresas/eventos todavía. (El punto sobre el origen de
  `RECARGA` quedó superado por el ADR 0003.)
- **0003 — Stock de bodega real.** Corrige el 0002: el cargue depende de
  stock de bodega real y lo descuenta; nueva forma de entrada de inventario.
- **0004 — Anulación de ventas.** Nunca se borra: se marca y se revierte
  con un movimiento compensatorio (`ANULACION_VENTA`), motivo obligatorio.

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
- [ ] ¿Hace falta capturar el costo por unidad al registrar una entrada de
      inventario a bodega? Hoy `productos.costo` sigue vacío — sin eso no se
      puede calcular margen (sección 4: "ver costos y márgenes"). Ver ADR 0003.
- [ ] ¿Bodega va a necesitar más funciones (preparar cargue, alistamiento
      por escáner) o "ingresar pedido" es su única función por ahora? Si se
      agrega otra, `app/bodega/index.tsx` va a necesitar un menú como el de
      Admin en vez de ir directo a una sola pantalla.

**Resuelto:** Bodega ya tiene función propia — "ingresar pedido" (escanear
+ teclear cantidad). Ver `app/bodega/index.tsx` y
`src/ui/PantallaIngresarPedido.tsx`.

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
