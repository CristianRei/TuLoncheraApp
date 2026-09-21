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

**Estado actual: app local-first, con un servidor parcial.** SQLite en el
dispositivo sigue siendo la fuente de verdad para todo — solo turnos y
comprobantes de transferencia sincronizan a Supabase en background (ver
ADR 0006). El resto del inventario/ventas sigue 100% local; el diseño ya
anticipaba esto (ver R6) antes de construirse.

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
| Datos | `expo-sqlite` (fuente de verdad local, siempre) |
| Backend | **Supabase, parcial** (solo turnos + comprobantes de transferencia sincronizan — ver ADR 0006). El resto del inventario/ventas sigue 100% local; no asumir que hay backend para nada más. |
| Panel admin | **No existe todavía.** Por ahora, pantallas de admin dentro de la misma app móvil. |
| Build/distribución | EAS Build (`eas.json`) — perfil `preview` genera un `.apk` Android de distribución interna (compartir directo, sin Play Store); `production` genera el `.aab` para Play Store. Requiere cuenta de Expo (`npx eas-cli login`), proyecto vinculado en `@ooojulians-team/tulonchera`. Publicar en Play Store exige además cuenta de Google Play Developer (~$25 USD pago único); iOS no está configurado en `eas.json` todavía — para probar en iPhone sin pagar, usar Expo Go con el dev server (`npx expo start`), igual que en Android. |

`expo-barcode-scanner` está deprecado desde SDK 51; el escaneo está integrado en
`expo-camera`. No lo instales.

**Calidad:** `eslint-config-expo` (`npm run lint`) — corre limpio, tratar
cualquier error nuevo como bloqueante, no solo advertencia. **Excel:** `xlsx`
+ `expo-sharing` para exportar reportes (`src/db/exportarExcel.ts`). **Web:**
`npx expo start` → abrir en navegador funciona bien, incluyendo `expo-sqlite`
(headers COOP/COEP configurados en `metro.config.js` y `app.json`). Lo que
**no funciona es `expo export --platform web`** (el build estático de
producción): ahí `expo-sqlite` se cuelga sin error, verificado 2026-09-20.
No es el objetivo del stack (el destino real es móvil), así que no vale la
pena perseguir el build estático — pero el dev server en navegador sí sirve
para probar rápido sin sacar el celular. No reintentar el build de
producción sin revisar si ya lo arreglaron upstream.

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
    README.md                  ← índice de toda la documentación
    01-proceso-actual.md      ← todavía no existe: falta mapeo AS-IS real del negocio
    02-modelo-datos.md        ← esquema completo y razonamiento
    03-decisiones/            ← ADRs numerados, índice en README.md (también sección 10 aquí)
    comercial/propuesta/     ← propuesta técnico-comercial (negocio, no arquitectura)
  app/
    index.tsx                  ← login: un solo PIN, sin contraseña
    promotor/
      index.tsx                  ← venta + check-in de turno + menú (calendario, conteo, finalizar turno)
      calendario.tsx               ← calendario propio: qué empresa/punto le toca cada día
      conteo-cierre.tsx             ← conteo de cierre: teórico vs. contado por producto
    admin/
      index.tsx                  ← menú de módulos (orden sigue el flujo operativo del día)
      calendario/                 ← admin planea eventos: empresa + punto + fecha + promotor(es)
      cargue/                      ← admin planea cargue (sin tocar inventario); [id] para reducir/quitar líneas
      turnos/                       ← selfie/hora/ubicación de check-in de cada promotor
      ventas/                        ← listado + detalle de ventas registradas
      conteos/                        ← listado + detalle de conteos de cierre (solo lectura)
      inventario/                      ← stock de bodega + registrar entradas
      catalogo/                         ← alta / edición / baja de productos
      empresas/                          ← empresas cliente y sus puntos (sedes)
      descuentos/                         ← crear / ver descuentos por producto y/o punto
      dashboard/                           ← KPIs, filtros, desgloses por promotor/punto/categoría
      notificaciones/                       ← stock bajo, lote por vencer, cargue a revisar
      intentos-pin/                          ← dispositivos bloqueados e intentos fallidos de PIN
      sync/                                   ← diagnóstico de la cola de sincronización (sin entrada en el menú)
    bodega/
      index.tsx                  ← menú: ingresar pedido, entregar cargues
      pedido.tsx                  ← ingresar pedido (mismo componente que antes vivía en index)
      cargues/                     ← lista de cargues planeados + [id] para ejecutar línea por línea
    _layout.tsx                 ← migra la DB al arrancar, arranca el motor de sync, envuelve en SesionProvider
  src/
    core/                       ← lógica de dominio, SIN dependencias de React ni Expo
      auth/                       ← modo de login (promotor/admin/bodega) → roles permitidos
      analitica/                   ← agruparVentasPorHora (zona horaria Bogotá), fechaHoyBogota
      descuentos/                   ← aplicarDescuento + su test
      dinero/                        ← formatearPesos / parsearPesos
      eventos/                        ← calcularOcurrencias (series recurrentes del calendario) + property test
      inventario/                      ← calcularSaldosPorProducto + su property test
      seguridadPin/                     ← backoff/bloqueo de PIN
      tipos/                              ← tipos de dominio compartidos
    db/                         ← SQLite: cliente, migraciones, una query file por tabla/tema
      migraciones/                ← 0001 a 0018, versionadas, nunca se editan una vez aplicadas
      cargues.ts                   ← planear/reducir/entregar cargue (cabecera + líneas)
      cargue.ts                     ← RECARGA real bodega→promotor, usado por cargues.ts
      conteos.ts                     ← conteo de cierre
      descuentos.ts                   ← reglas de descuento + resolución del vigente
      empresas.ts / puntos.ts          ← empresas cliente y sus puntos
      eventos.ts                        ← calendario de eventos + punto vigente del promotor (por fecha)
      turnos.ts                          ← check-in/check-out, evento del día del promotor
      exportarCierreTurno.ts              ← PDF de cierre de turno (expo-print)
      turnosRemotos.ts / comprobantesRemotos.ts ← lecturas desde Supabase para admin
      syncCola.ts                          ← encola tareas para el motor de sync
    sync/                       ← cliente Supabase, motor de sync en background (ver ADR 0006)
    ui/                         ← componentes y hooks compartidos (sí usan React/Expo)
      ContenedorAncho.tsx         ← centra contenido con ancho máximo en tablet/pantalla ancha
      useEsPantallaAncha.ts        ← breakpoint 768px, lo usan Admin y Bodega
      tema.ts                       ← paleta + tipografía del rediseño (Stitch) de menú admin/dashboard
      colores.ts                     ← paleta + tipografía propia de promotor (COLORES, TIPOGRAFIA_PROMOTOR)
      TarjetaModulo.tsx               ← tarjeta de módulo del menú admin, usa tema.ts
      CalendarioRango.tsx              ← calendario de mes para "Rango personalizado" del dashboard
      calendarioGrilla.ts               ← grilla de mes compartida por CalendarioRango/calendario de eventos
  supabase/                    ← SQL de Supabase (tablas, RLS, Storage) — se aplica a mano, ver supabase/README.md
  assets/
  eas.json                    ← perfiles de EAS Build: "preview" (.apk interno), "production" (.aab)
  eslint.config.js            ← eslint-config-expo, `npm run lint`
  metro.config.js             ← headers COOP/COEP para expo-sqlite en web — funciona en dev server, no en `expo export --platform web` (ver sección 5)
```

**`src/core` no importa React ni nada de Expo.** Es TypeScript puro. Se puede
testear sin emulador (`npm test`, corre con `node --test`) y reutilizar en el
panel web el día que exista.

---

## 7. Modelo de datos (resumen)

Estado real después de las migraciones 0001-0018. Detalle completo y
razonamiento de cada tabla, incluida la sincronización y las conexiones
entre calendario/turno/cargue/conteo, en `docs/02-modelo-datos.md`.

```
usuarios          (id, nombre, rol, activo, pin)
ubicaciones       (id, tipo[BODEGA|CAMION|PROMOTOR], nombre, responsable_id)
                  ← BODEGA es una sola fila (singleton); cada promotor tiene
                    la suya. Ambas se crean perezosamente, no por migración.
productos         (id, sku, codigo_barras, nombre, categoria[opcional],
                   marca[opcional], es_licor, es_perecedero, precio,
                   costo[opcional], unidad_empaque, foto_uri[opcional], activo)
                  ← categoria/costo/marca opcionales: no vinieron en la carga
                    inicial. "Eliminar" = activo=0, nunca DELETE.
lotes             (id, producto_id, fecha_vencimiento)         ← en uso, opcional: se crea
                  al "ingresar pedido" solo si se teclea fecha de vencimiento
empresas          (id, nombre, direccion, sector, contacto)
                  ← en uso desde la 0011 (ver ADR 0005). Cliente donde
                    ocurre un evento/feria (ej. Falabella).
puntos            (id, empresa_id, nombre, direccion[opcional], activo)
                  ← en uso desde la 0011. Sede de una empresa (ej. Norte,
                    Sur). Gestión en app/admin/empresas/.
eventos           (id, empresa_id, punto_id, fecha, estado[PLANEADO|EN_CURSO|
                   CERRADO|CANCELADO], motivo_cancelacion[opcional],
                   serie_id[opcional], creado_por, ts_cliente, dispositivo_id)
                  ← desde la 0014, jornada real con fecha planeada (antes era
                    solo "asignación vigente sin fecha" — ver ADR 0005, luego
                    corregido por la 0014). El punto vigente del promotor se
                    resuelve por fecha (evento de hoy), no por estado manual.
                    Calendario: app/admin/calendario/, app/promotor/calendario.tsx.
evento_promotores (evento_id, promotor_id)                    ← N-a-N, en uso desde la 0014.
                  Reemplaza la columna promotor_id directa — un evento puede
                  tener varios promotores (lo usual es uno solo).
series_recurrencia (id, frecuencia[DIAS|SEMANAS|MESES|ANIOS], intervalo,
                   fecha_desde, fecha_hasta, ts_cliente, dispositivo_id)
                  ← en uso desde la 0014. Solo trazabilidad de una serie
                    generada de una vez; cada evento generado es
                    independiente, nunca se edita en cascada.
turnos            (id UUID PK, promotor_id, selfie_uri, latitud[opcional],
                   longitud[opcional], hora_inicio, hora_fin[opcional],
                   ts_cliente, dispositivo_id)
                  ← en uso desde la 0015. Check-in/check-out físico diario
                    (independiente de eventos, que es planeación). Sin turno
                    abierto hoy, el promotor no puede vender ni bodega puede
                    entregarle cargue (ver ADR 0008). Sincroniza a Supabase
                    (ADR 0006) — el trigger remoto solo permite tocar hora_fin.
movimientos       (id UUID PK, tipo, producto_id, lote_id, cantidad,
                   ubicacion_origen_id, ubicacion_destino_id, evento_id[opcional],
                   usuario_id, motivo, ts_cliente, dispositivo_id)
                  ← el libro contable real. Ver ADR 0002/0003 para el porqué
                    de evento_id opcional y de que RECARGA tenga origen real.
ventas            (id UUID PK, numero_recibo, evento_id[opcional], promotor_id,
                   punto_id[opcional], ts_cliente,
                   metodo_pago[EFECTIVO|TRANSFERENCIA|LIBRANZA],
                   total, dispositivo_id, anulada, motivo_anulacion[opcional],
                   comprobante_uri[opcional])
                  ← anulada nunca se borra la fila (ver ADR 0004). punto_id
                    se resuelve una sola vez al vender, desde el punto
                    vigente del promotor en ese momento (ver ADR 0005).
                    comprobante_uri (desde la 0015): foto del comprobante,
                    obligatoria en la UI solo cuando metodo_pago=TRANSFERENCIA.
venta_items       (venta_id, producto_id, cantidad, precio_unitario,
                   ts_cliente, dispositivo_id)
                  ← precio_unitario ya trae aplicado cualquier descuento
                    vigente resuelto al momento de la venta.
conteos           (id UUID PK, evento_id[opcional], promotor_id, ts_cliente,
                   estado, firmado_por)
                  ← evento_id opcional y promotor_id agregado en la
                    migración 0010, mismo motivo que ADR 0002 (ventas).
                    estado hoy siempre CERRADO al crear: no hay aprobación
                    todavía (ver R7, sección 11). Si el promotor finaliza
                    turno sin conteo de hoy, la app solo advierte, nunca
                    bloquea (ver ADR 0008).
conteo_lineas     (conteo_id, producto_id, teorico, contado,
                   diferencia, motivo, aprobado_por)
                  ← en uso desde la 0010. Una diferencia ≠ 0 genera un
                    AJUSTE_CONTEO (bodega→promotor si sobra, promotor→afuera
                    si falta) para que el saldo real converja a lo contado.
descuentos        (id UUID PK, producto_id[opcional], punto_id[opcional],
                   tipo[PORCENTAJE|MONTO_FIJO], valor, desde, hasta, activo,
                   creado_por, ts_cliente, dispositivo_id)
                  ← en uso desde la 0012 (ver ADR 0005). producto_id/punto_id
                    NULL = "aplica a todos" en esa dimensión. Prioridad al
                    resolver: producto+punto > solo producto > solo punto.
                    activo se puede apagar antes de tiempo; el valor/vigencia
                    nunca se edita — se crea una regla nueva.
notificaciones    (id UUID PK, tipo[STOCK_BAJO|LOTE_POR_VENCER|CARGUE_REVISAR],
                   nivel[INFO|ALERTA|CRITICO], titulo, detalle,
                   producto_id[opcional], lote_id[opcional],
                   clave_deduplicacion, leida, resuelta, ts_cliente, dispositivo_id)
                  ← en uso desde la 0013 (CARGUE_REVISAR agregado en la 0018).
                    Generador con detectores plug-in (src/db/notificaciones.ts);
                    clave_deduplicacion con índice único parcial evita
                    duplicar la misma alerta mientras siga activa.
cargues           (id UUID PK, promotor_id, estado[PLANEADO|ENTREGADO|
                   CANCELADO], creado_por, ts_cliente, dispositivo_id)
cargue_lineas     (id UUID PK, cargue_id, producto_id, cantidad_planeada,
                   cantidad_entregada, estado[PENDIENTE|ENTREGADA|REVISAR],
                   motivo_revision[opcional], ts_cliente, dispositivo_id)
                  ← en uso desde la 0017 (ver ADR 0007). Cargue en dos pasos:
                    admin planea (sin tocar movimientos), bodega confirma
                    línea por línea — ahí nace el RECARGA real. REVISAR si la
                    cantidad física no alcanza lo planeado, con motivo
                    obligatorio, sin bloquear las demás líneas del cargue.
_sync_pendiente   (id UUID PK, tabla[turnos|comprobantes_venta], entidad_id,
                   tipo_tarea[FILA|FOTO], intentos, ultimo_error[opcional],
                   creado_ts, completado_ts[opcional])
                  ← en uso desde la 0016 (ver ADR 0006). Cola de subida a
                    Supabase, drenada en background por src/sync/motor.ts —
                    nunca bloquea ninguna pantalla. completado_ts IS NULL es
                    lo pendiente real; una tarea completada nunca se borra.
niveles_objetivo  (promotor_id, producto_id, cantidad, actualizado_ts)        ← sin usar todavía
intentos_pin_fallidos (id UUID PK, dispositivo_id, modo, ts_cliente)          ← en uso
desbloqueos_pin       (id UUID PK, dispositivo_id, modo, admin_id, ts_cliente) ← en uso
logins_exitosos_pin   (id UUID PK, dispositivo_id, modo, ts_cliente)          ← en uso
                  ← backoff/bloqueo de PIN (ver sección 10). El conteo de
                    fallos consecutivos nunca es una columna: se deriva
                    contando filas de intentos_pin_fallidos posteriores al
                    evento más reciente entre las otras dos tablas — mismo
                    espíritu de R1.
```

**Tipos de movimiento:**
`COMPRA_PROVEEDOR`, `RECARGA`, `VENTA`, `TRASLADO`, `RETIRO_ADMIN`,
`AJUSTE_CONTEO`, `AVERIA`, `DEGUSTACION`, `OBSEQUIO`, `DEVOLUCION_VENCIMIENTO`,
`ANULACION_VENTA`.
Hoy en uso: `COMPRA_PROVEEDOR` (entrada a bodega), `RECARGA` (bodega →
promotor), `VENTA` (promotor → afuera), `ANULACION_VENTA` (revierte una
venta: afuera → promotor, ver ADR 0004) y `AJUSTE_CONTEO` (conteo de cierre:
bodega→promotor si sobra, promotor→afuera si falta). El resto sigue sin
implementarse.

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
6. **Este repo lo trabajan dos personas, cada quien con su propia sesión de
   Claude Code**, subiendo directo al mismo remoto de GitHub
   (`CristianRei/TuLoncheraApp`). Al empezar cualquier tarea: `git pull`
   primero y revisar `git log` por commits que no reconozcas antes de asumir
   que el estado local es el actual — puede haber cambiado por fuera de esta
   sesión.
7. **Antes de dar una tarea por terminada**, corre las cuatro verificaciones:
   `npx tsc --noEmit`, `npm test` (property tests de `src/core`, `node --test`),
   `npm run lint` (ESLint, `eslint-config-expo` — configurado desde
   `86957cf`), y `npx expo export --platform android` como smoke test de
   bundling (no hay emulador con cámara real, así que esto no reemplaza
   probar en dispositivo físico, pero sí detecta errores de compilación).
8. **`git push` requiere pedir confirmación cada vez**, aunque se haya
   aprobado antes en la misma conversación — no es un permiso permanente.

---

## 10. Roadmap

**Estado: Fase 2-4 en curso (Fase 1 completa), Fase 5 con primera rebanada
construida (solo turnos/comprobantes).**

| Fase | Alcance | Estado |
|---|---|---|
| 1 | Base local: SQLite, migraciones, catálogo de productos, usuarios y roles, escáner funcionando | ✅ |
| 2 | Motor de inventario: movimientos, saldos por promotor, recarga, conteo de cierre con teórico vs contado | ✅ Recarga, saldos y conteo de cierre listos. Falta solo la aprobación de descuadres de R7 (bloqueada por el umbral sin definir, ver sección 11) |
| 3 | Ventas: carrito por escáner, medios de pago, recibo interno, arqueo | 🔄 Venta, recibo interno y comprobante de transferencia listos; falta arqueo |
| 4 | Bodega: cargue por escáner en dos pasos, niveles objetivo, alertas de vencimiento | 🔄 Stock de bodega, entrada de inventario, y cargue en dos pasos (admin planea/bodega entrega por escáner) listos; falta niveles objetivo y alertas de vencimiento por producto próximo a vencer (sí existe notificación de cargue a revisar) |
| 5 | Sincronización y servidor. Panel web. Visibilidad en tiempo real | 🔄 Primera rebanada: turnos y comprobantes de transferencia sincronizan a Supabase (ADR 0006). El resto del motor de inventario/ventas sigue 100% local. Sin panel web todavía |
| 6 | Reportes administrativos. Recomendador de recarga afinado | 🔄 Dashboard extendido con filtros, puntos y descuentos listo (ver abajo); recomendador de recarga sigue sin construir |

### Qué existe hoy, concretamente

- **Login** (`app/index.tsx`): un PIN de 4 dígitos, sin contraseña en ningún
  rol; modo promotor por defecto, botones para entrar como administrador o
  bodega. Usuarios de prueba solo en `__DEV__` (`src/db/seed.ts`): Admin
  `0000`, Cristian/promotor `8509`, Bodega `1234`.
- **Seguridad de PIN** (`src/core/seguridadPin/`, `src/db/intentosPin.ts`):
  backoff progresivo (3, 8, 20, 45, 90s) tras 3 fallos consecutivos y bloqueo
  duro a los 8, por dispositivo+modo. Un admin desbloquea tecleando su propio
  PIN (`src/ui/ModalDesbloqueoPin.tsx`). Nunca se guarda el PIN tecleado.
  Panel de admin en `app/admin/intentos-pin/` para ver dispositivos
  bloqueados e intentos fallidos.
- **Dashboard de ventas** (`app/admin/dashboard/`, `src/db/analitica.ts`,
  `src/core/analitica/`): KPIs (total vendido, cantidad de ventas, ticket
  promedio, saldo en bodega), desglose por método de pago, por promotor,
  por punto, por categoría, ventas por hora del día en Bogotá (offset fijo
  UTC-5) y top de productos. Filtra por hoy / 7 días / 30 días / rango
  personalizado, y por promotor, punto, categoría, marca, producto y método
  de pago (combinables). Se refresca solo cada 15s mientras la pantalla
  está enfocada — "tiempo real" dentro de este dispositivo, sin
  sincronización con otros dispositivos (eso es Fase 5, sin construir; ver
  ADR 0005). Enlace directo a Ventas para ver recibos. Solo pantalla ancha,
  como el resto de Admin. El valor estimado de bodega solo cuenta productos
  con `costo` capturado — la UI muestra la cobertura (ej. "12 de 123
  productos") cuando es parcial, para no leerse como un total cuando no lo
  es. Los filtros de categoría/marca no tendrán opciones hasta que se cargue
  esa información en el catálogo (hoy vacía para los 123 productos reales).
- **Rediseño visual de menú admin y dashboard** (`app/admin/index.tsx`,
  `app/admin/dashboard/`, `src/ui/tema.ts`, `src/ui/TarjetaModulo.tsx`):
  generado a partir de mockups de Google Stitch y adaptado a datos y
  funcionalidad reales. Introduce un sistema de diseño propio para estas
  dos pantallas — tipografías Hanken Grotesk (texto) y JetBrains Mono
  (cualquier cifra: dinero, cantidades, porcentajes), cargadas vía
  `@expo-google-fonts` en `app/_layout.tsx` (`useFonts`, gateado junto con
  la migración de la DB). El banner del menú admin muestra 3 métricas
  reales (promotores con punto vigente, conteos con descuadre de hoy,
  ventas de hoy) — nunca datos ficticios (CLAUDE.md sección 8). **No** se
  extendió a las demás pantallas de admin (catálogo, inventario, cargue,
  ventas, conteos, empresas, puntos-asignados, descuentos, seguridad) —
  siguen con `COLORES`/`src/ui/colores.ts`. Si se rediseña otra pantalla,
  decidir explícitamente si se extiende `src/ui/tema.ts` o se define un
  sistema aparte. El "Rango personalizado" del dashboard abre un calendario
  propio (`src/ui/CalendarioRango.tsx`) en vez de inputs de texto — grilla
  de mes con navegación, toque para elegir desde/hasta, sin dependencias
  nuevas (usa `tema.ts`, no `@react-native-community/datetimepicker`, para
  poder mantener la paleta/tipografía del rediseño en ambas plataformas).
  El gráfico "Hora del día con más ventas" usa una sola barra sólida
  (dorado, vino cuando está seleccionada) — nunca el degradé de intensidad
  de la primera versión, se veía confuso. Tocar una barra abre un desglose
  por promotor de esa hora (barras de progreso + monto), calculado por
  `agruparVentasPorHora` (`src/core/analitica/index.ts`, ya traía
  `promotorId`/`promotorNombre` por venta para esto). Como es React Native
  (también corre en tablet/móvil), la interacción es tocar/clic, no hover
  — no hay hover real fuera de web.
- **Datos de demo** (`src/db/seedDemo.ts`, solo bajo `__DEV__`, idempotente
  igual que los demás seeds): puebla 2 promotores extra, 2 empresas con 3
  puntos, cada promotor asignado a un punto, un descuento vigente, y ~30
  días de ventas distribuidas de forma realista (más ventas en horario de
  almuerzo, mezcla de métodos de pago, categoría/marca asignada a un
  subconjunto del catálogo real) — para que el dashboard tenga contenido
  real que mostrar en vez de estados vacíos. Las ventas se insertan
  directo en las tablas (no vía `registrarVenta`, que siempre usa
  `new Date()`) porque necesitan timestamps pasados — única excepción
  documentada a "usar la función real", justificada porque es
  infraestructura de desarrollo, no un caso de uso del dominio.
- **Catálogo** (`app/admin/catalogo/`): alta, edición (nombre, precio, foto,
  código de barras) y baja lógica (`activo=0`) de productos. Solo admin.
  Catálogo real del cliente ya cargado (123 productos, migración 0005).
- **Stock de bodega** (`app/admin/inventario/`): vista de solo lectura del
  saldo por producto. La única forma de que entre stock es "Ingresar
  pedido" (`src/ui/PantallaIngresarPedido.tsx`, compartida con Bodega):
  escanear el producto y teclear la cantidad (suelen ser +60 unidades, por
  eso teclear y no un contador +/-) → `COMPRA_PROVEEDOR`, con fecha de
  vencimiento opcional (crea un `lote`). Sin captura de costo todavía.
- **Bodega** (`app/bodega/`): menú con dos accesos — "Ingresar pedido"
  (sin cambios) y "Entregar cargues" (`app/bodega/cargues/`), donde bodega
  ve los cargues que admin ya planeó y los ejecuta línea por línea
  (escanear + teclear cantidad entregada, mismo patrón que ingresar
  pedido). Ver ADR 0007.
- **Cargue** (`app/admin/cargue/`, `src/db/cargues.ts`, migración 0017):
  admin *planea* un cargue (tope al stock de bodega, igual que antes) sin
  tocar `movimientos` todavía — dos pestañas: "Nuevo cargue" y "Cargues
  planeados" (donde puede reducir o quitar líneas mientras sigan
  pendientes). El `RECARGA` real (bodega → promotor, `src/db/cargue.ts`,
  sin cambios) nace recién cuando bodega confirma cada línea. Si bodega no
  tiene físicamente lo que el sistema decía, la línea queda "a revisar"
  con motivo obligatorio, sin bloquear el resto del cargue — admin la
  resuelve después desde el detalle del cargue.
- **Empresas y puntos** (`app/admin/empresas/`, `src/db/empresas.ts`,
  `src/db/puntos.ts`, migración 0011): admin crea empresas cliente (ej.
  Falabella) y sus puntos/sedes (ej. Norte, Sur). Sin edición ni baja
  todavía — solo alta y listado.
- **Calendario de eventos** (`app/admin/calendario/`,
  `app/promotor/calendario.tsx`, `src/db/eventos.ts`, migración 0014):
  reemplazó por completo la pantalla vieja "Asignar punto a promotor"
  (eliminada). Admin planea eventos (empresa + punto + fecha, uno o varios
  promotores por evento, series recurrentes) en una vista de calendario
  mensual; el promotor ve en su propio calendario dónde le toca cada día.
  Cancelación en caliente con motivo obligatorio, nunca se borra un evento.
  El "punto vigente" del promotor (usado al vender y al resolver
  descuentos) se resuelve por fecha real —
  `obtenerPuntoVigentePromotor` busca el evento de hoy — ya no depende de
  un estado manual `EN_CURSO`.
- **Turnos** (`app/promotor/index.tsx` → `PantallaIniciarTurno`,
  `app/admin/turnos/`, `src/db/turnos.ts`, migración 0015): antes de poder
  vender, el promotor hace check-in diario (selfie + ubicación GPS,
  ambas obligatorias, con timeout de 15s si el GPS no resuelve) — sin
  turno abierto hoy, la grilla de venta no se muestra. Botón "Finalizar
  turno" en el menú del promotor, con aviso (no bloqueo) si no hizo
  conteo de cierre ese día. El turno se cruza informativamente con el
  evento del calendario del día (chip visible, nunca bloquea). Ver ADR
  0006 (sincronización) y 0008 (conexión con calendario/cargue/conteo).
- **Comprobante de transferencia** (`src/ui/CobrarModal.tsx`,
  `src/db/ventas.ts`, migración 0015): al cobrar por transferencia, la
  app pide foto del comprobante antes de registrar la venta —
  obligatoria solo para ese medio de pago. Admin la ve en el detalle de
  cada venta.
- **Sincronización con Supabase** (`src/sync/`, `src/db/turnosRemotos.ts`,
  `src/db/comprobantesRemotos.ts`, migración 0016, ADR 0006): primera
  rebanada de Fase 5 — solo turnos y comprobantes de transferencia (no el
  motor de inventario/ventas todavía). Cola local (`_sync_pendiente`) que
  sube en background cada ~2 min o al recuperar red, nunca bloquea la UI.
  Auth anónima por dispositivo, RLS en Supabase (solo INSERT + el único
  UPDATE permitido es `hora_fin` de turno). Credenciales en `.env.local`
  (nunca commiteado, ver `.env.example`); esquema y políticas de Supabase
  documentados en `supabase/README.md` y `supabase/migraciones/` (se
  aplican a mano en el dashboard, no hay CLI de Supabase en el repo).
- **Descuentos** (`app/admin/descuentos/`, `src/db/descuentos.ts`,
  `src/core/descuentos/`, migración 0012): admin crea reglas de descuento
  (porcentaje o monto fijo) por producto y/o punto, con vigencia. Se
  aplican automáticamente al cobrar (ver "Venta del promotor" abajo). Listar
  vigentes/vencidos, desactivar antes de tiempo — nunca se edita una regla
  ya creada.
- **Venta del promotor** (`app/promotor/index.tsx`): grilla de su propio
  inventario con buscador, escáner de código de barras, ticket (carrito) y
  cobro con los 3 medios de pago. Topa la cantidad vendible al saldo
  calculado tanto al tocar la grilla como al escanear. Al cobrar, resuelve
  el punto vigente del promotor y aplica automáticamente cualquier
  descuento vigente para cada producto en ese punto (ver ADR 0005) — el
  precio que queda en el recibo ya es el precio con descuento. Los
  descuadres reales se resuelven en el conteo de cierre.
- **Ventas del admin** (`app/admin/ventas/`): listado (promotor + total,
  pestañas Activas/Anuladas) y detalle (líneas) de cada venta. Se puede
  anular una venta con motivo obligatorio — nunca se borra, se marca y se
  revierte con un movimiento compensatorio (ver ADR 0004).
- **Conteo de cierre** (`app/promotor/conteo-cierre.tsx`, `app/admin/conteos/`,
  `src/db/conteos.ts`, migración 0010): el promotor cuenta físicamente cada
  producto de su inventario y lo compara contra el teórico calculado por el
  sistema; una diferencia ≠ 0 genera un `AJUSTE_CONTEO` que hace converger
  el saldo real a lo contado (nunca se pisa el saldo, R1). Admin puede ver
  el listado de conteos y su detalle (teórico/contado/diferencia por
  producto), pero **no hay aprobación de descuadres todavía**: todo conteo
  queda `CERRADO` de una vez y no bloquea la siguiente recarga — R7 sigue
  pendiente del umbral en pesos (sección 11).
- **Exportar a Excel** (`src/db/exportarExcel.ts`, `xlsx` + `expo-sharing`):
  botón "Exportar" en catálogo, ventas e inventario; genera un `.xlsx` y
  abre el diálogo nativo de compartir. Etiquetado como demo en el código —
  sin manejo de archivos grandes ni formato avanzado.
- **PDF de cierre de turno** (`src/db/exportarCierreTurno.ts`, `expo-print`
  + `expo-sharing`): al finalizar turno, el promotor puede descargar un
  comprobante en PDF con inventario final, resumen de ventas del turno por
  método de pago, y datos del check-in/check-out (sin la selfie) — evento
  del calendario si tenía uno asignado ese día.
- **Tablet / pantalla ancha** (`ContenedorAncho`, `useEsPantallaAncha`):
  Admin y Bodega se adaptan a partir de 768px de ancho (grilla de 2 columnas,
  contenido centrado con ancho máximo) — el celular no cambia.
- **Usuarios de prueba** (`src/db/seed.ts`) y **stock de prueba**
  (`src/db/seedInventario.ts`), ambos solo bajo `__DEV__`: bodega y el
  promotor de prueba arrancan con inventario real (del catálogo cargado),
  no vacíos.
- **ESLint** configurado (`eslint.config.js`, `eslint-config-expo`,
  `npm run lint`) — no existía en las primeras rebanadas de este proyecto.
- **Propuesta comercial** (`docs/comercial/propuesta/`): documento para el
  cliente, editado a pedido según feedback de reuniones — no es código de la
  app. `propuesta.tex` es la fuente; `propuesta.pdf` se regenera desde ahí;
  `propuesta_final.pdf` es el nombre de entrega al cliente. **No hay LaTeX
  instalado en las máquinas de desarrollo** — para recompilar, se descarga el
  binario portable `tectonic` (sin instalador, GitHub releases), se usa una
  vez, y se borra — nunca se instala nada permanente para esto.

Lo que falta de cada fase (conteo de cierre, arqueo, alistamiento por
escáner, niveles objetivo, gestión de empresas/eventos, sincronización,
reportes) sigue sin construirse — no asumir que existe.

### Decisiones registradas (`docs/03-decisiones/`, [índice completo](docs/03-decisiones/README.md))

- **0001 — Método de autenticación.** PIN único, sin contraseña en ningún rol.
- **0002 — Ventas y recargas sin `evento`.** `evento_id` opcional; no se
  pidió gestión de empresas/eventos todavía. (El punto sobre el origen de
  `RECARGA` quedó superado por el ADR 0003.)
- **0003 — Stock de bodega real.** Corrige el 0002: el cargue depende de
  stock de bodega real y lo descuenta; nueva forma de entrada de inventario.
- **0004 — Anulación de ventas.** Nunca se borra: se marca y se revierte
  con un movimiento compensatorio (`ANULACION_VENTA`), motivo obligatorio.
- **0005 — Puntos, asignación de promotor y descuentos.** Activa
  `empresas`/`eventos` (corrige parcialmente el 0002): `eventos` pasa a
  representar la asignación vigente de un promotor a un punto, no todavía
  una jornada con calendario. Descuentos por producto y/o punto con
  vigencia, resueltos y aplicados una sola vez al momento de la venta.
  Parcialmente superado por el calendario de eventos (migración 0014, sin
  ADR propio — documentado solo en CLAUDE.md aquí y en el mensaje de
  commit): `eventos` ya representa una jornada con fecha real, no solo
  una asignación vigente sin fecha.
- **0006 — Sincronización de turnos y comprobantes.** Primera rebanada de
  Fase 5. Supabase (Postgres + Storage + Auth anónima), cola local que
  sube en background, nunca bloquea la UI. Solo turnos y comprobantes de
  transferencia — el resto del inventario/ventas sigue 100% local.
- **0007 — Cargue en dos pasos.** Admin planea (sin tocar `movimientos`),
  bodega ejecuta línea por línea (ahí nace el `RECARGA` real). Líneas con
  descuadre físico quedan "a revisar" con motivo obligatorio, sin
  bloquear el resto del cargue.
- **0008 — Conexiones del flujo diario.** Cierra los huecos entre
  calendario, cargue, turno y conteo que antes eran sistemas
  independientes: cargue exige turno abierto (bloqueante), notificación
  de cargue a revisar, turno↔calendario informativo, aviso (no bloqueo)
  de conteo pendiente al finalizar turno.

**Regla de despliegue:** ningún promotor deja de usar su método actual sin dos
semanas de operación en paralelo. Si la app falla en un evento, ese día no se vende.

---

## 11. Preguntas abiertas

No asumas respuestas. Si una tarea depende de alguna, pregunta primero.

- [ ] ¿Cuál es el umbral en pesos para aprobación de descuadres? El conteo
      de cierre (sección 10) ya calcula y registra el descuadre por
      producto en cada conteo — falta esto para poder bloquear la siguiente
      recarga según R7.
- [ ] El nivel objetivo de recarga (Fase 6, sin construir) sigue sin
      definir si se calcula por promotor o por punto — el calendario de
      eventos ya existe (migración 0014, `app/admin/calendario/`,
      `app/promotor/calendario.tsx`) con fecha real, varios promotores por
      evento, series recurrentes y cancelación en caliente, así que esa
      parte de la pregunta original ya quedó resuelta.
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
**Resuelto:** Bodega ya tiene función propia — "ingresar pedido" (escanear
+ teclear cantidad). Ver `src/ui/PantallaIngresarPedido.tsx`.

**Resuelto:** Bodega sí necesitaba más funciones — ahora también entrega
los cargues que admin planea (alistamiento por escáner, línea por línea).
`app/bodega/` pasó a tener menú con dos accesos. Ver ADR 0007.

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
- No asumir que el inventario/ventas ya sincronizan — solo turnos y
  comprobantes de transferencia lo hacen (ver ADR 0006). No extender la
  sincronización a otras tablas sin decidirlo explícitamente primero.
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
