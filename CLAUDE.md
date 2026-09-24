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
dispositivo sigue siendo la fuente de verdad para todo, pero casi todo ya
sincroniza a Supabase en background: turnos, comprobantes de transferencia,
mensajes/notificaciones push, y el motor completo de inventario/ventas
(ventas, movimientos, lotes, cargues, conteos, arqueos de caja — ver ADR 0006
y sección 10). Eso es todo en dirección de SUBIDA (celular → Supabase). La
dirección contraria (BAJADA, Supabase → celular) ya cubre personal/PINs,
catálogo (productos/categorías) y los datos OPERATIVOS: el admin ve las
ventas de los promotores, bodega ve los cargues que admin planea, y una
RECARGA hecha en bodega llega al inventario del promotor — con Realtime, casi
al instante (ver sección 10 y 11). Empresas/puntos, eventos (calendario,
meta diaria) y descuentos siguen sin bajar todavía. Todo esto está probado
con SQLite y Postgres reales de laboratorio (`npm run test:db`, `npm run
test:sql`) pero NO con un Supabase real ni con celulares reales: hay que
correr `supabase/migraciones/0009_sincronizacion_completa.sql` (sección 11).

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
| **Arqueo de caja** | Conteo manual de efectivo que el promotor hace al cerrar turno, comparado contra el efectivo que el sistema calcula que debería tener (solo ventas en EFECTIVO del turno). Es sobre dinero, no sobre inventario — no genera ningún movimiento ni bloquea nada; cuadre o no, queda solo como registro para que admin lo revise. |
| **Recibo** | Comprobante **interno** de una venta. Existe para que el promotor no sume a mano y para dejar registro. No tiene valor fiscal ni se reporta a ninguna entidad. |
| **Promotor** | Persona que vende en el evento. |
| **Conductor** | Transporta producto y promotores. Hay 2 camiones. |
| **Bodega** | Rol operativo que alista recargas y recibe devoluciones. |
| **Cliente** | Persona natural que un promotor registra en campo (nombre, teléfono, dirección, ciudad, empresa, nota). No es un actor del sistema, no inicia sesión — solo se le puede asignar la factura de una venta. |
| **Categoría** | Clasificación de producto (ej. Galletas, Lácteos). Lista cerrada y administrable por admin, nunca texto libre — para que el filtro del dashboard no se rompa en variantes ("Galleta" vs "galleta"). |
| **Meta** | Objetivo de venta que un admin le asigna a un promotor o a un punto. Hay dos escalas independientes: **meta diaria** (por promotor, en cada evento/jornada — ej. $1.800.000 o $2.500.000 para hoy) y **meta mensual** (por promotor o por punto, contra el mes calendario). Ambas se comparan contra las ventas reales del período correspondiente, nunca contra un número inventado. |

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
importar dónde duerma físicamente (bodega, camión o su casa). Solo hay tres salidas:

- `VENTA` — la ejecuta el promotor
- `RETIRO_ADMIN` — solo administración, con motivo obligatorio
- `TRASLADO` — inventario que pasa directo a OTRO promotor (sin pasar por
  bodega), solo administración: admin planea, bodega confirma línea por
  línea (mismo patrón de dos pasos que `RECARGA`, ver sección 10 "Traslado
  de inventario entre promotores")

`RETIRO_ADMIN` y `TRASLADO` son las únicas puertas por las que se podría encubrir
un faltante. Deben quedar siempre registradas con usuario, motivo/destino y
timestamp.

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
| Backend | **Supabase, parcial** — de celular a Supabase (subida) sincronizan turnos, comprobantes de transferencia, mensajes/push (sección 10 "Mensajes") y el motor completo de inventario/ventas (ventas, movimientos, lotes, cargues, conteos, arqueos de caja). De Supabase a celular (bajada) sincronizan personal/PINs y catálogo (productos/categorías, sin fotos — sección 11) y los datos operativos (ventas → admin; cargues → bodega y admin; movimientos de inventario → bodega, admin y el promotor dueño), orquestado por `src/sync/bajada.ts`, con **Realtime** de Supabase (`src/sync/realtime.ts`) para que el cambio llegue al instante. Empresas/puntos, eventos y descuentos no sincronizan en ninguna dirección todavía. |
| Notificaciones push | `expo-notifications` + `expo-device`, llamando directo al servicio de Expo Push desde el dispositivo del admin (`src/sync/push.ts`) — sin servidor propio. Ver sección 10 "Mensajes" para el porqué y el modelo de datos. |
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

**Excepción importante: push notifications remotas NO funcionan en Expo Go**
desde el SDK 53 de Expo (limitación de Expo Go, no del código) — hace falta el
`.apk` de `eas build --profile preview` (o un development build) para
probarlas de verdad. Notificaciones locales seguirían funcionando en Expo Go,
pero remotas no. Ver sección 10 "Mensajes" antes de dar por rota esta
funcionalidad si la prueba fue en Expo Go.

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
    index.tsx                  ← login: un solo PIN, sin contraseña (Admin: 6 dígitos manual; resto: 4 de la cédula)
    promotor/
      _layout.tsx                 ← envuelve la pila de promotor en VentaEnCursoProvider (qué cliente factura la venta en curso)
      index.tsx                  ← venta + check-in de turno + menú (calendario, ventas del turno, clientes, conteo, notificaciones, cierre de jornada)
      calendario.tsx               ← calendario propio: qué empresa/punto le toca cada día
      conteo-cierre.tsx             ← conteo de cierre: teórico vs. contado por producto
      cierre-jornada.tsx             ← resumen del día + meta diaria + arqueo de caja; el botón "Cerrar turno" vive aquí, se puede abrir/cerrar en cualquier momento
      notificaciones.tsx             ← mensajes que el admin le envió como notificación push (solo lectura, marca leído al abrir)
      ventas-turno/                    ← listado + detalle de las ventas del turno abierto (con cliente asignado)
      clientes/                         ← alta y listado de clientes finales; también funciona en "modo selección" (?paraVentaId=) para asignar cliente a una venta ya cerrada
    admin/
      _layout.tsx                 ← en pantalla ancha monta BarraSuperiorAdmin + SidebarAdmin fijo; en celular no monta nada (cada pantalla sigue con su propio encabezado)
      index.tsx                  ← menú de módulos (orden sigue el flujo operativo del día; "Mensajes" siempre al final)
      calendario/                 ← admin planea eventos: empresa + punto + fecha + promotor(es) + meta de venta diaria por promotor
      cargue/                      ← admin planea cargue (sin tocar inventario); [id] para reducir/quitar líneas
      turnos/                       ← selfie/hora/ubicación de check-in de cada promotor
      ventas/                        ← listado (Activas/Anuladas + filtro Todos los días/Hoy/fecha específica) + detalle de ventas
      conteos/                        ← listado + detalle de conteos de cierre (solo lectura)
      inventario/                      ← stock de bodega + registrar entradas
      catalogo/                         ← alta / edición / baja de productos; categorias.tsx gestiona la lista de categorías
      empresas/                          ← empresas cliente y sus puntos (sedes)
      clientes/                           ← admin ve/busca/elimina clientes finales registrados por los promotores
      descuentos/                          ← crear / ver descuentos por producto y/o punto
      dashboard/                            ← KPIs, gráfico circular, ranking de productos, exportar informe, metas del mes + proyección
      analisis/                              ← repetibilidad por punto, rendimiento por promotor, cruces punto×promotor×producto
      notificaciones/                        ← alertas de negocio: stock bajo, lote por vencer, cargue a revisar (NO son los mensajes push — ver "mensajes/" abajo)
      intentos-pin/                           ← dispositivos bloqueados e intentos fallidos de PIN
      personal/                                ← admin contrata (rol + PIN autogenerado o manual para Admin), edita, cambia de rol y da de baja/elimina personal (los 4 roles)
      mensajes/                                 ← admin envía notificaciones push a Promotor/Bodega (manual o "progreso de meta del día"); ver sección 10 "Mensajes"
      sync/                                      ← diagnóstico de la cola de sincronización (sin entrada en el menú)
    bodega/
      _layout.tsx                ← mantiene la base local al día con Supabase mientras hay sesión de bodega (cargues, movimientos) — ver src/ui/useSincronizacionEnVivo.ts
      index.tsx                  ← menú: ingresar pedido, entregar cargues, notificaciones
      pedido.tsx                  ← ingresar pedido (mismo componente que antes vivía en index)
      cargues/                     ← lista de cargues planeados + [id] para ejecutar línea por línea
      notificaciones.tsx            ← mensajes que el admin le envió como notificación push (mismo concepto que promotor/notificaciones.tsx)
    _layout.tsx                 ← migra la DB al arrancar, arranca el motor de sync, configura el manejador de notificaciones push, envuelve en SesionProvider
  src/
    core/                       ← lógica de dominio, SIN dependencias de React ni Expo
      auth/                       ← modo de login (promotor/admin/bodega) → roles permitidos
      analitica/                   ← agruparVentasPorHora (zona horaria Bogotá), fechaHoyBogota
      analisis/                     ← repetibilidad/rendimiento/cruce/Pearson/día-semana/temporada + property tests
      calendario/                    ← TEMPORADAS_2026 (Navidad, Semana Santa, vacaciones, fechas especiales)
      descuentos/                   ← aplicarDescuento + su test
      dinero/                        ← formatearPesos / parsearPesos
      errores/                        ← mensajeDeError: extrae un mensaje legible de un Error de JS o de un PostgrestError de supabase-js (objeto plano, no `instanceof Error`)
      eventos/                        ← calcularOcurrencias (series recurrentes del calendario) + property test
      inventario/                      ← calcularSaldosPorProducto + su property test
      pin/                              ← modoPinParaRol (Admin: manual 6 dígitos; resto: derivado de cédula), pinDesdeCedula, pinManualValido — única fuente de verdad de la regla de PIN por rol
      seguridadPin/                      ← backoff/bloqueo de PIN
      tipos/                                ← tipos de dominio compartidos
    db/                         ← SQLite: cliente, migraciones, una query file por tabla/tema
      migraciones/                ← 0001 a 0026, versionadas, nunca se editan una vez aplicadas (la 0025 rehace `_sync_pendiente` sin el CHECK viejo de `tabla`; la 0026 crea `_sync_estado`)
      arqueos.ts                   ← registra y lee el arqueo de caja de un turno (una fila por turno)
      arqueosRemotos.ts             ← lectura desde Supabase, para cuando el turno no se abrió en este dispositivo
      cargues.ts                   ← planear/reducir/entregar cargue (cabecera + líneas)
      cargue.ts                     ← RECARGA real bodega→promotor, usado por cargues.ts
      analisis.ts                    ← trae líneas de venta con contexto, envuelve core/analisis
      categorias.ts                   ← categorías de producto: crear-o-reusar por nombre normalizado, desactivar
      clientes.ts                      ← alta/listado/eliminación (DELETE real) de clientes finales
      conteos.ts                        ← conteo de cierre
      descuentos.ts                      ← reglas de descuento + resolución del vigente
      empresas.ts / puntos.ts             ← empresas cliente y sus puntos
      eventos.ts                           ← calendario de eventos + punto vigente del promotor (por fecha) + meta diaria por (evento, promotor)
      mensajes.ts                           ← enviarMensajes/descargarMensajesNuevos/listarMensajesRecibidos/marcarMensajeLeido — mensajes push, ver sección 10 "Mensajes"
      metas.ts                               ← metas de venta MENSUALES por promotor/punto + progreso real
      metasDiarias.ts                         ← progreso de la meta DIARIA por promotor con evento asignado (distinta escala que metas.ts)
      personal.ts                              ← alta/edición/cambio de rol/baja (activo=0)/eliminación real (protegida por FK) de personal (los 4 roles)
      turnos.ts                                 ← check-in/check-out, evento del día del promotor
      exportarCierreTurno.ts                     ← PDF de cierre de turno (expo-print)
      turnosRemotos.ts / comprobantesRemotos.ts   ← lecturas desde Supabase para admin
      syncCola.ts                                  ← encola tareas para el motor de sync y pide una subida inmediata (~700 ms) tras cada una
      syncEstado.ts                                 ← cursores de descarga (`_sync_estado`): último `subido_ts` ya bajado por tipo de dato
      bajadaOperativa.ts                             ← descarga ventas / movimientos / cargues desde Supabase a la base local (cursor + traducción de ids)
      mapeoRemoto.ts                                  ← traduce ids entre dispositivos por clave natural: producto por sku, persona por id/nombre, ubicación por (tipo, responsable)
    sync/                       ← cliente Supabase, motor de sync en background (ver ADR 0006); credenciales se validan perezosamente (`requerirCredenciales`), nunca al importar el módulo
      push.ts                     ← registrarPushToken (permiso + token de Expo Push, tras login) y enviarNotificacionesPush (POST directo al servicio de Expo)
      bajada.ts                   ← `descargarDatosDeAdmin` (personal → categorías → productos, en el orden que exigen las FK locales; solo Promotor/Bodega, nunca admin) y `sincronizarDatosRemotos` (una vuelta completa según el rol: además los datos operativos, sin solaparse, y avisa a las pantallas)
      realtime.ts                 ← `suscribirCambiosRemotos`: canal Realtime de Supabase (postgres_changes) que solo AVISA que una tabla cambió
      eventosDatos.ts             ← bus interno "llegaron datos nuevos a la base local" (sin React; el hook está en src/ui/useVersionDatos.ts)
    ui/                         ← componentes y hooks compartidos (sí usan React/Expo)
      ContenedorAncho.tsx         ← centra contenido con ancho máximo en tablet/pantalla ancha
      useEsPantallaAncha.ts        ← breakpoint 768px, lo usan Admin y Bodega
      tema.ts                       ← paleta + tipografía del rediseño (Stitch) de menú admin/dashboard/calendario
      colores.ts                     ← paleta + tipografía propia de promotor (COLORES, TIPOGRAFIA_PROMOTOR)
      TarjetaModulo.tsx               ← tarjeta de módulo del menú admin, usa tema.ts
      BarraSuperiorAdmin.tsx           ← barra fija superior de admin en pantalla ancha (logo + cerrar sesión)
      SidebarAdmin.tsx                  ← sidebar fijo de admin en pantalla ancha, generado desde modulosAdmin.ts
      modulosAdmin.ts                    ← los módulos reales de administración — única fuente de verdad, usada por el menú principal y por SidebarAdmin
      useSincronizacionEnVivo.ts           ← hook de layout: descarga al entrar, al recibir un aviso Realtime, y cada 45 s de respaldo
      useVersionDatos.ts                    ← `useRecargarConDatosNuevos(fn)`: una pantalla se recarga sola cuando llegan datos nuevos de Supabase
      ModalConfirmacion.tsx               ← reemplaza Alert.alert para confirmaciones de 2 botones (Alert.alert no tiene UI en React Native Web)
      CalendarioRango.tsx                  ← calendario de mes, reusado para "Rango personalizado" (dashboard), fecha específica (Ventas) y un solo día
      calendarioGrilla.ts                   ← grilla de mes compartida por CalendarioRango/calendario de eventos
      FormularioProducto.tsx                 ← nombre/precio/código + selector de categoría ("+ Nueva" inline) + marca con autocompletado
      FormularioPersona.tsx                   ← nombre/rol/cédula (PIN en vivo según el rol)/celular/dirección, revela PIN manual si hay choque
      VentaEnCursoContext.tsx                  ← qué cliente factura el carrito que el promotor está armando ahora mismo
      graficas/                                  ← GraficoLinea/GraficoBarrasHorizontales/GraficoDispersion/GraficoCircular/MapaCalor (react-native-svg, sin librería de charts), usados en Análisis y Dashboard
  supabase/                    ← SQL de Supabase (tablas, RLS, Storage) — se aplica a mano, ver supabase/README.md
  scripts/prueba-db/           ← `npm run test:db`: migraciones + flujos de src/db contra SQLite real y un Supabase falso, incluido el escenario de 3 dispositivos admin/bodega/promotor (ver sección 9, punto 7)
  scripts/prueba-sql/          ← `npm run test:sql`: corre supabase/migraciones/0001 y 0009 contra un Postgres real en memoria (PGlite) — nuevo y con 0003-0008 ya aplicadas; comprueba idempotencia, triggers, RLS y Realtime
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

Estado real después de las migraciones 0001-0022. Detalle completo y
razonamiento de cada tabla, incluida la sincronización y las conexiones
entre calendario/turno/cargue/conteo, en `docs/02-modelo-datos.md` (nota:
ese documento todavía narra solo hasta la migración 0018 — 0019 a 0022
están descritas aquí y en `src/db/migraciones/`, pendiente trasladarlas
allá con el mismo nivel de detalle).

```
usuarios          (id, nombre, rol, activo, pin, cedula[opcional],
                   celular[opcional], direccion[opcional])
                  ← cedula/celular/direccion desde la 0022, gestión en
                    app/admin/personal/ para los 4 roles (Promotor, Conductor,
                    Bodega, Admin). El PIN sigue una regla POR ROL
                    (src/core/pin/index.ts, `modoPinParaRol`): Promotor/
                    Conductor/Bodega derivan el PIN de los últimos 4 dígitos
                    de su cédula (nunca se pide a mano, salvo choque con otro
                    PIN ya en uso); Admin usa un PIN manual de 6 dígitos, sin
                    relación con la cédula. El índice único de PIN (migración
                    0003) es global entre todos los roles, sin importar el
                    modo. "Dar de baja" = activo=0 + pin=NULL (libera el
                    PIN). Solo una persona sin ninguna venta/turno/cargue/
                    conteo/evento asociado admite además un DELETE real
                    ("Eliminar definitivamente"), protegido de verdad por
                    PRAGMA foreign_keys=ON (src/db/client.ts) — nunca asumir
                    que ese mismo DELETE es seguro para otra tabla sin la
                    misma protección real. Nota: Conductor todavía NO tiene
                    ninguna pantalla propia en la app (`ModoLogin` solo
                    admite PROMOTOR/ADMIN/BODEGA, src/core/auth/) — se puede
                    contratar y asignarle rol, pero no puede iniciar sesión
                    todavía; eso es un hueco pendiente, no un bug de esta
                    sesión. Sincroniza en las DOS direcciones desde la
                    migración de Supabase 0006 (única tabla de esta lista con
                    bajada construida, ver sección 11): cada alta/edición/
                    cambio de rol/baja en app/admin/personal/ sube a Supabase
                    (src/db/personal.ts, encolarSync), y Promotor/Bodega
                    descargan ese personal al fallar un login o al abrir su
                    pantalla de inicio (src/db/usuarios.ts,
                    `descargarUsuariosNuevos`) — nunca el dispositivo de
                    admin, que ya es la fuente de verdad local de esta tabla.
                    El PIN casi nunca viaja por la red: para roles
                    DESDE_CEDULA se recalcula en cada dispositivo a partir de
                    `cedula` (`src/core/pin`, `pinParaSincronizar`/
                    `pinDesdeDescarga`) — solo viaja de verdad para ADMIN o
                    un override manual por colisión, riesgo aceptado y
                    documentado ahí mismo. "Eliminar definitivamente" hace
                    también un DELETE remoto best-effort (fuera de la cola de
                    sync, ver `eliminarPersonaPermanente`).
ubicaciones       (id, tipo[BODEGA|CAMION|PROMOTOR], nombre, responsable_id)
                  ← BODEGA es una sola fila (singleton); cada promotor tiene
                    la suya. Ambas se crean perezosamente, no por migración.
productos         (id, sku, codigo_barras, nombre, categoria[MUERTA, ver
                   categoria_id], categoria_id[opcional], marca[opcional],
                   es_licor, es_perecedero, precio, costo[opcional],
                   unidad_empaque, foto_uri[opcional], activo)
                  ← categoria (TEXT libre, desde la 0001) nunca se llegó a
                    exponer en ninguna pantalla — la migración 0020 la
                    reemplaza por categoria_id (FK a categorias, abajo) sin
                    intentar migrar datos que nunca existieron; la columna
                    vieja queda sin uso, siempre NULL. costo/marca opcionales:
                    no vinieron en la carga inicial. "Eliminar" = activo=0,
                    nunca DELETE.
categorias        (id, nombre, nombre_normalizado[único], activo, ts_cliente,
                   dispositivo_id)
                  ← en uso desde la 0020 (ver ADR pendiente / CLAUDE.md
                    sección 10). Lista cerrada y administrable: el catálogo
                    solo permite *elegir* entre estas, nunca texto libre.
                    `nombre_normalizado` (trim + minúsculas) tiene índice
                    único — crear una categoría es "crear o reusar" por ese
                    campo, así "Galleta" y "galleta" nunca terminan siendo
                    dos filas distintas. Nunca se borra (podría estar en uso
                    en productos ya etiquetados) — se desactiva.
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
evento_promotores (evento_id, promotor_id, meta_diaria[opcional])  ← N-a-N, en uso
                  desde la 0014. Reemplaza la columna promotor_id directa — un
                  evento puede tener varios promotores (lo usual es uno solo).
                  `meta_diaria` (Pesos, desde la 0023) es la meta de venta de
                  ESE día para ESE promotor en ESE evento — ver glosario
                  "Meta" y app/admin/mensajes/. Independiente de la meta
                  MENSUAL (tabla `metas`, más abajo): un promotor puede tener
                  las dos al mismo tiempo, un promotor puede cumplir la del
                  día y no la del mes o viceversa.
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
arqueos_caja      (id UUID PK, turno_id[único], promotor_id, efectivo_teorico,
                   efectivo_contado, diferencia, total_transferencia,
                   total_libranza, ts_cliente, dispositivo_id)
                  ← en uso desde la 0024. Una sola fila por turno (índice
                    único en turno_id) — se crea junto con `finalizarTurno`,
                    ver app/promotor/cierre-jornada.tsx. `diferencia` es
                    `efectivo_contado - efectivo_teorico`, calculada al
                    guardar, nunca recibida del cliente. Es sobre dinero, no
                    inventario — R1/R2 no aplican, no genera ningún
                    `movimiento`. Sincroniza a Supabase (subida, mismo motor
                    que ventas/movimientos — ver sección "Sincronización del
                    motor de inventario/ventas" más abajo) para que admin lo
                    vea desde `app/admin/turnos/[id].tsx` sin importar en qué
                    dispositivo se cerró el turno.
movimientos       (id UUID PK, tipo, producto_id, lote_id, cantidad,
                   ubicacion_origen_id, ubicacion_destino_id, evento_id[opcional],
                   usuario_id, motivo, ts_cliente, dispositivo_id)
                  ← el libro contable real. Ver ADR 0002/0003 para el porqué
                    de evento_id opcional y de que RECARGA tenga origen real.
ventas            (id UUID PK, numero_recibo, evento_id[opcional], promotor_id,
                   punto_id[opcional], ts_cliente,
                   metodo_pago[EFECTIVO|TRANSFERENCIA|LIBRANZA],
                   total, dispositivo_id, anulada, motivo_anulacion[opcional],
                   comprobante_uri[opcional], cliente_id[opcional])
                  ← anulada nunca se borra la fila (ver ADR 0004). punto_id
                    se resuelve una sola vez al vender, desde el punto
                    vigente del promotor en ese momento (ver ADR 0005).
                    comprobante_uri (desde la 0015): foto del comprobante,
                    obligatoria en la UI solo cuando metodo_pago=TRANSFERENCIA.
                    cliente_id (desde la 0019): a qué cliente final se le
                    factura esta venta, resuelto por el promotor antes de
                    cobrar (ver VentaEnCursoContext) o después desde "Ventas
                    del turno" — nunca obligatorio.
venta_items       (venta_id, producto_id, cantidad, precio_unitario,
                   ts_cliente, dispositivo_id)
                  ← precio_unitario ya trae aplicado cualquier descuento
                    vigente resuelto al momento de la venta.
clientes          (id UUID PK, nombre_completo, telefono[opcional],
                   direccion[opcional], ciudad[opcional], empresa[opcional],
                   nota[opcional], creado_por, ts_cliente, dispositivo_id)
                  ← en uso desde la 0019. Cliente final que un promotor
                    registra en campo — no es un actor del sistema (no
                    inicia sesión, no tiene rol). No es parte del libro de
                    inventario: R1/R2 no aplican, así que a diferencia de
                    productos/categorías sí admite un DELETE real
                    (`eliminarCliente`) — antes de borrar, desvincula
                    (`cliente_id = NULL`) cualquier venta que lo tuviera
                    asignado, para no perder esas ventas del historial.
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
traslados         (id UUID PK, promotor_origen_id, promotor_destino_id,
                   estado[PLANEADO|ENTREGADO|CANCELADO], creado_por,
                   ts_cliente, dispositivo_id)
traslado_lineas   (id UUID PK, traslado_id, producto_id, cantidad_planeada,
                   cantidad_entregada, estado[PENDIENTE|ENTREGADA|REVISAR],
                   motivo_revision[opcional], ts_cliente, dispositivo_id)
                  ← en uso desde la 0029. Mismo patrón de dos pasos que
                    cargues/cargue_lineas (admin planea, bodega confirma
                    línea por línea, ahí nace el TRASLADO real — ver R4), con
                    `promotor_id` dividido en origen y destino porque el
                    producto va directo de un promotor a otro sin pasar por
                    bodega físicamente. A diferencia del cargue normal, NO
                    exige turno abierto de ningún promotor para confirmar
                    (es una operación administrativa, mismo espíritu que
                    RETIRO_ADMIN). Tope de validación: el saldo real del
                    promotor ORIGEN (`obtenerSaldosPromotor`), nunca el de
                    bodega.
_sync_pendiente   (id UUID PK, tabla[turnos|comprobantes_venta|ventas|
                   movimientos|lotes|cargues|traslados|conteos|arqueos_caja|
                   usuarios|productos|categorias|intentos_pin_fallidos|
                   desbloqueos_pin|logins_exitosos_pin], entidad_id,
                   tipo_tarea[FILA|FOTO], intentos,
                   ultimo_error[opcional], creado_ts, completado_ts[opcional])
                  ← en uso desde la 0016 (ver ADR 0006). Cola de subida a
                    Supabase, drenada en background por src/sync/motor.ts —
                    nunca bloquea ninguna pantalla. completado_ts IS NULL es
                    lo pendiente real; una tarea completada nunca se borra.
metas             (id UUID PK, tipo[PROMOTOR|PUNTO], entidad_id, mes["AAAA-MM"],
                   monto_objetivo, creado_por, ts_cliente, dispositivo_id)
                  ← en uso desde la 0021. Meta de venta MENSUAL por promotor o
                    por punto, ver app/admin/dashboard/ ("Metas del mes") —
                    distinta de la meta DIARIA (`evento_promotores.meta_diaria`,
                    más arriba, ver también src/db/metasDiarias.ts). Una sola
                    fila por (tipo, entidad_id, mes) — índice único;
                    `establecerMeta` es upsert, "editar una meta" es volver a
                    guardarla. `entidad_id` es polimórfico (usuarios o
                    puntos según tipo), por eso NO tiene FK — al eliminar un
                    promotor de verdad, sus metas se borran a mano primero
                    (si no, quedarían huérfanas sin que ninguna restricción
                    lo evite).
mensajes_recibidos (id UUID PK, destinatario_id, cuerpo, tipo[MANUAL|META_PROGRESO],
                   remitente_nombre, ts_cliente, leida)
                  ← en uso desde la 0023. Espejo LOCAL de solo lectura de los
                    mensajes push que un admin envió (ver app/admin/mensajes/,
                    src/db/mensajes.ts) — el mensaje real vive en Supabase
                    (`mensajes` + `mensaje_destinatarios`, tiene que viajar
                    entre dispositivos, R5/R6 no alcanzan) y se descarga acá
                    para que la pantalla de Notificaciones de Promotor/Bodega
                    funcione sin conexión después del primer sync.
                    `destinatario_id` existe también en local (no solo en
                    Supabase) porque en `__DEV__` varios roles pueden
                    convivir en la misma base de un solo dispositivo.
_sync_estado      (clave PK, valor)
                  ← en uso desde la 0026. Cursores de la bajada de datos
                    operativos: `ventas`, `cargues`, `movimientos:BODEGA`,
                    `movimientos:PROMOTOR:<id>` → último `subido_ts` (hora del
                    servidor, la fija un trigger en Supabase) ya descargado.
niveles_objetivo  (promotor_id, producto_id, cantidad, actualizado_ts)        ← sin usar todavía
intentos_pin_fallidos (id UUID PK, dispositivo_id, modo, ts_cliente)          ← en uso
desbloqueos_pin       (id UUID PK, dispositivo_id, modo, admin_id, ts_cliente) ← en uso
logins_exitosos_pin   (id UUID PK, dispositivo_id, modo, ts_cliente)          ← en uso
                  ← backoff/bloqueo de PIN (ver sección 10). El conteo de
                    fallos consecutivos nunca es una columna: se deriva
                    contando filas de intentos_pin_fallidos posteriores al
                    evento más reciente entre las otras dos tablas — mismo
                    espíritu de R1. Sincronizan a Supabase (subida, ver
                    `supabase/migraciones/0010_seguridad_pin.sql`) desde que
                    admin necesitó ver/desbloquear un dispositivo bloqueado
                    desde OTRO dispositivo — antes eran 100% locales y admin
                    no tenía forma de saber que un promotor se había
                    bloqueado en su propio celular. `app/index.tsx` además
                    consulta Supabase (best-effort, cada 5s mientras el
                    estado es BLOQUEADO) para autodesbloquearse si un admin ya
                    lo desbloqueó desde otro dispositivo — ver
                    `huboDesbloqueoRemotoReciente` en
                    `src/db/intentosPinRemotos.ts`.
```

**Tipos de movimiento:**
`COMPRA_PROVEEDOR`, `RECARGA`, `VENTA`, `TRASLADO`, `RETIRO_ADMIN`,
`AJUSTE_CONTEO`, `AVERIA`, `DEGUSTACION`, `OBSEQUIO`, `DEVOLUCION_VENCIMIENTO`,
`ANULACION_VENTA`.
Hoy en uso: `COMPRA_PROVEEDOR` (entrada a bodega), `RECARGA` (bodega →
promotor), `VENTA` (promotor → afuera), `ANULACION_VENTA` (revierte una
venta: afuera → promotor, ver ADR 0004), `AJUSTE_CONTEO` (conteo de cierre:
bodega→promotor si sobra, promotor→afuera si falta) y `TRASLADO` (promotor
→ otro promotor directo, sin pasar por bodega — ver R4, sección 10
"Traslado de inventario entre promotores"). El resto sigue sin
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
- **"Eliminar" casi siempre es `activo=0`, nunca DELETE.** Productos y
  categorías siguen ese patrón porque pueden estar en uso en filas ya
  guardadas. Las únicas dos excepciones son clientes (no son parte del libro
  de inventario, R1/R2 no aplican) y una persona de personal **sin ningún
  historial real** (ver sección 10, "Gestionar personal") — en ese segundo caso la
  seguridad la da `PRAGMA foreign_keys = ON` (activado en `src/db/client.ts`,
  real de verdad, no solo documentación): el DELETE falla solo si todavía
  hay una fila que lo referencia. No asumas esa misma protección para una
  tabla nueva sin verificar que de verdad tiene la FK declarada.

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
7. **Antes de dar una tarea por terminada**, corre las verificaciones:
   `npx tsc --noEmit`, `npm test` (property tests de `src/core`, `node --test`),
   `npm run lint` (ESLint, `eslint-config-expo` — configurado desde
   `86957cf`), `npx expo export --platform android` como smoke test de
   bundling, y — si tocaste `src/db/`, migraciones o la cola de sync —
   **`npm run test:db`** (`scripts/prueba-db/`): corre las migraciones y los
   flujos de negocio (vender, contar, cargar, arqueo, bajada del catálogo y
   personal) contra SQLite REAL (`node:sqlite`, Node ≥ 22.5) con un Supabase
   falso, y compara lo que se sube contra las columnas de
   `supabase/migraciones/*.sql`; y — si tocaste `supabase/migraciones/` —
   **`npm run test:sql`** (el SQL contra un Postgres real en memoria).
   `tsc`/lint/bundle NO detectan errores de
   esquema: un `CHECK` viejo en `_sync_pendiente` (0016) hizo fallar toda
   venta en el celular sin que ninguna de las otras verificaciones avisara —
   corregido en la migración 0025. Al agregar una tabla a la cola, una
   restricción o una función de `src/db`, agrega el caso a
   `scripts/prueba-db/prueba.mjs`. Nada de esto reemplaza probar en
   dispositivo físico contra un Supabase real.
8. **`git push` requiere pedir confirmación cada vez**, aunque se haya
   aprobado antes en la misma conversación — no es un permiso permanente.

---

## 10. Roadmap

**Estado: Fase 1 y 3 completas, Fase 2 y 4 en curso (Fase 2 bloqueada solo
por R7, ver sección 11), Fase 5 con tres rebanadas de SUBIDA construidas
(turnos/comprobantes, mensajes push, y el motor de inventario/ventas
completo) y la BAJADA ya construida para personal/PINs, catálogo y datos
operativos (ventas, cargues, movimientos) con Realtime — ver más abajo;
faltan empresas/puntos, eventos y descuentos —, Fase 6 bastante avanzada
(dashboard, análisis, categorías, metas de venta diaria y mensual).**

| Fase | Alcance | Estado |
|---|---|---|
| 1 | Base local: SQLite, migraciones, catálogo de productos, usuarios y roles, escáner funcionando | ✅ |
| 2 | Motor de inventario: movimientos, saldos por promotor, recarga, conteo de cierre con teórico vs contado | ✅ Recarga, saldos y conteo de cierre listos. Falta solo la aprobación de descuadres de R7 (bloqueada por el umbral sin definir, ver sección 11) |
| 3 | Ventas: carrito por escáner, medios de pago, recibo interno, arqueo | ✅ Venta, recibo interno, comprobante de transferencia, clientes finales, asignación de factura a cliente, y arqueo de caja al cerrar turno — completa |
| 4 | Bodega: cargue por escáner en dos pasos, niveles objetivo, alertas de vencimiento | 🔄 Stock de bodega, entrada de inventario, y cargue en dos pasos (admin planea/bodega entrega por escáner) listos; falta niveles objetivo y alertas de vencimiento por producto próximo a vencer (sí existe notificación de cargue a revisar) |
| 5 | Sincronización y servidor. Panel web. Visibilidad en tiempo real | 🔄 SUBIDA (celular → Supabase) completa para turnos, comprobantes de transferencia, mensajes push y todo el motor de inventario/ventas (ventas/venta_items/movimientos/lotes/cargues/conteos/arqueos_caja). BAJADA (Supabase → celular) construida para personal/PINs, catálogo (productos/categorías, sin fotos) y datos operativos (ventas → admin, cargues → bodega/admin, movimientos → bodega/admin/promotor) — falta empresas/puntos, eventos (con meta diaria), descuentos y conteos hacia admin. **Realtime** construido (ventas, cargues, movimientos): el admin ve una venta nueva sin refrescar, bodega ve un cargue apenas se planea. Sin panel web todavía. Nada probado contra un Supabase real ni dispositivos reales |
| 6 | Reportes administrativos. Recomendador de recarga afinado | 🔄 Dashboard extendido (filtros, puntos, descuentos, categorías, gráfico circular, ranking de productos, exportar informe, metas de venta mensual con proyección de cierre) + meta de venta DIARIA por evento, y sección Análisis (repetibilidad/rendimiento/cruces) listos; recomendador de recarga sigue sin construir |

### Qué existe hoy, concretamente

- **Login** (`app/index.tsx`): un PIN sin contraseña en ningún rol — 4 dígitos
  para Promotor/Bodega, 6 para Admin (`LARGO_PIN`, ver `src/core/pin/`); modo
  promotor por defecto, botones para entrar como administrador o bodega.
  Usuarios de prueba solo en `__DEV__` (`src/db/seed.ts`): Admin `000000`,
  Cristian/promotor `8509`, Bodega `1234`. El arranque de la app
  (`app/_layout.tsx`) busca al admin de prueba por ese mismo PIN para decidir
  si siembra los datos de demo (empresas, ventas) — si ese PIN queda
  desactualizado ahí, la demo deja de aparecer sin ningún error visible; ya
  pasó una vez (quedó en `'0000'` tras el cambio a 6 dígitos) y se corrigió.
- **Seguridad de PIN, con sincronización remota** (`src/core/seguridadPin/`,
  `src/db/intentosPin.ts`, `src/db/intentosPinRemotos.ts`,
  `supabase/migraciones/0010_seguridad_pin.sql`): backoff progresivo (3, 8,
  20, 45, 90s) tras 3 fallos consecutivos y bloqueo duro a los 8, por
  dispositivo+modo. Un admin puede desbloquear tecleando su propio PIN EN EL
  MISMO dispositivo bloqueado (`src/ui/ModalDesbloqueoPin.tsx`, siempre
  disponible, no depende de red) — o, desde `app/admin/intentos-pin/`, ver
  y desbloquear CUALQUIER dispositivo (`intentos_pin_fallidos`/
  `desbloqueos_pin`/`logins_exitosos_pin` ahora sincronizan a Supabase,
  subida únicamente; antes eran 100% locales y admin no podía saber que un
  promotor se había bloqueado en su propio celular, ni desbloquearlo desde
  otro). Un desbloqueo hecho por admin desde OTRO dispositivo llega solo con
  red: `app/index.tsx` pregunta a Supabase cada 5s mientras el estado es
  BLOQUEADO (`huboDesbloqueoRemotoReciente`) y se auto-destraba sin que la
  persona tenga que teclear nada — best-effort (R5), sin red sigue
  funcionando el link local de siempre. `registrarDesbloqueo` también
  intenta un insert directo a Supabase (fuera de la cola normal de sync,
  además de encolarla) para no depender del drenado diferido de ~700ms
  cuando lo urgente es que la otra persona pueda reintentar ya. Nunca se
  guarda el PIN tecleado.
- **Dashboard de ventas** (`app/admin/dashboard/`, `src/db/analitica.ts`,
  `src/core/analitica/`): KPIs (total vendido, cantidad de ventas, ticket
  promedio, saldo en bodega), desglose por método de pago, por promotor,
  por punto, por categoría, ventas por hora del día en Bogotá (offset fijo
  UTC-5) y top de productos. Filtra por hoy / 7 días / 30 días / rango
  personalizado, y por promotor, punto, categoría, marca, producto y método
  de pago (combinables). **No tiene temporizador de refresco** (hubo uno
  cada 15 s, se quitó) pero **sí se actualiza solo cuando llega una venta
  nueva de otro dispositivo** (Realtime, `useRecargarConDatosNuevos`) — pedido
  explícito del usuario: las ventas deben verse "de forma instantánea". El
  botón "Actualizar" y el contador "hace cuántos minutos" siguen. Enlace directo
  a Ventas para ver recibos. Solo pantalla ancha,
  como el resto de Admin. El valor estimado de bodega solo cuenta productos
  con `costo` capturado — la UI muestra la cobertura (ej. "12 de 123
  productos") cuando es parcial, para no leerse como un total cuando no lo
  es. El filtro de categoría ya usa la tabla `categorias` real (ver más
  abajo); sus opciones dependen de que el catálogo esté etiquetado, todavía
  en progreso para los 123 productos reales. Marca sigue siendo texto libre
  con autocompletado. Las 4 tarjetas KPI son tocables: Total vendido/Ventas emitidas/Ticket
  promedio abren `detalle-ventas.tsx` (parametrizada por `metrica`, mismo
  componente para las tres), Saldo en bodega abre `detalle-bodega.tsx` —
  ambas fuera del modal existente (`ModalDetalleSeccion`, que sigue
  sirviendo solo a las secciones Por método/promotor/punto/categoría).
  Cada detalle trae desglose por promotor/punto, serie temporal por día
  (`agruparVentasPorDia` para ventas; movimientos de bodega agregados por
  día para el saldo, `obtenerMovimientosBodegaDetallados` en
  `src/db/inventario.ts`) y el listado de filas crudas.
- **Análisis** (`app/admin/analisis/`, `src/db/analisis.ts`,
  `src/core/analisis/`): distinto del Dashboard — no agrega dentro de un
  rango, compara entre **eventos** (fechas de feria distintas en un mismo
  punto) para detectar qué se repite. Tres bloques: (1) por punto, qué
  productos aparecen en el top-5 de unidades evento tras evento, con
  tendencia (subiendo/estable/bajando) calculada comparando la mitad más
  reciente de apariciones contra la más antigua; (2) por promotor, ticket
  promedio por evento y qué productos vende muy por encima/debajo
  (≥20%) del promedio de **los demás promotores** (nunca se compara un
  promotor contra un promedio que lo incluye a él mismo — diluye la
  desviación); (3) hallazgos cruzados punto×promotor×producto, mismo
  cálculo de desviación pero acotado a un punto específico, como lista de
  insights ordenada por magnitud, no una matriz completa. Umbral mínimo de
  3 apariciones antes de calificar algo como "repetible" o generar un
  hallazgo — con menos, se marca `datosInsuficientes` en vez de inventar
  una tendencia (CLAUDE.md sección 8). Períodos: 30/90 días o todo el
  historial — no comparte los filtros combinables del dashboard porque el
  cálculo necesita ver *todas* las apariciones de un punto/promotor para
  que la tasa de repetición sea correcta. Solo pantalla ancha.
  Gráficas con `react-native-svg` dibujadas a mano (`src/ui/graficas/`:
  `GraficoLinea`, `GraficoBarrasHorizontales`, `GraficoDispersion`,
  `MapaCalor` — sin librería de charts, mismo espíritu que el gráfico de
  horas del dashboard) para: tendencia real de repetición de cada punto,
  ranking de promotores, mapa de calor punto×producto (top-8 puntos ×
  top-10 productos por unidades, con aviso de cuántos quedaron fuera).
  Bloque nuevo "Relación entre variables": dispersión de eventos
  trabajados vs. ticket promedio por promotor, con coeficiente de
  correlación de Pearson real (`calcularCorrelacionPearson`,
  `src/core/analisis/index.ts`) — `null` si hay menos de 3 promotores o
  si una variable no varía, nunca un número inventado; el texto aclara
  que describe qué tan juntas se mueven las variables, no causalidad.
  Bloque "Día de la semana y temporada": total por día ISO (lunes-domingo,
  se calcula 100% de `eventoFecha`, sin tabla nueva) y comparación contra
  temporadas de negocio fijas de Colombia (`src/core/calendario/
  temporadas.ts`, `TEMPORADAS_2026`: Navidad, Semana Santa, vacaciones de
  mitad de año/octubre/fin de año, Día de la madre, Amor y Amistad) —
  festivos móviles recalculados a mano cada año (comentario en el archivo
  explica cómo), no una librería de cálculo de festivos. Bloque "Método de
  pago por lugar y por promotor": % de ventas en Efectivo/Transferencia/
  Libranza por punto y por promotor (`calcularMetodoPagoPorPunto`/
  `calcularMetodoPagoPorPromotor`) — cuenta ventas distintas por
  `ventaId`, nunca líneas de producto, para no inflar el % cuando una
  venta tiene varias líneas.
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
  **Importante para no confundirse entre dispositivos:** este seed corre
  una sola vez, la primera vez que la app arranca en `__DEV__`, en **cada
  dispositivo por separado** — el celular, el computador (navegador) y
  cualquier otro emulador generan cada uno su propio lote aleatorio de
  ventas de demo, independiente entre sí. Que el celular y el computador
  muestren ventas distintas (o que uno no muestre ninguna) **no es un
  bug** — es la consecuencia directa de R5/R6 (SQLite local es la fuente
  de verdad de cada dispositivo) más el hecho de que solo turnos y
  comprobantes sincronizan (ADR 0006). Si el celular corre un `.apk` real
  (no Expo Go), `__DEV__` es `false` ahí y este seed nunca corre — cero
  ventas de demo es el comportamiento correcto en ese caso, no una falla.
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
- **Traslado de inventario entre promotores** (`app/admin/cargue/`, pestaña
  "Traslado entre promotores", `app/admin/cargue/traslado/[id].tsx`,
  `app/bodega/cargues/traslado/[id].tsx`, `src/db/traslados.ts`,
  `src/db/traslado.ts`, migración 0029): tercera salida del inventario de
  un promotor junto a VENTA y RETIRO_ADMIN (R4) — el admin traslada
  producto directo del inventario de un promotor al de otro, sin pasar
  físicamente por bodega. Vive dentro del mismo módulo Cargue, mismo
  patrón de dos pasos: admin elige promotor origen → promotor destino →
  productos (topados al saldo REAL del origen, `obtenerSaldosPromotor`,
  nunca al de bodega) y planea; bodega confirma línea por línea igual que
  un cargue normal (mismo componente de escaneo, misma lista combinada de
  "Cargues por entregar" en `app/bodega/cargues/`, con una insignia
  "Traslado" para distinguir la fila) — ahí nace el movimiento `TRASLADO`
  real. **A diferencia del cargue normal, NO exige turno abierto de ningún
  promotor para confirmar** (decisión explícita del usuario: es una
  operación administrativa, no depende de que nadie esté en jornada
  activa). Sincroniza igual que cargues (subida y bajada, `traslados`/
  `traslado_lineas`, `supabase/migraciones/0011_traslados.sql`) — el
  movimiento `TRASLADO` resultante llega a los celulares de AMBOS
  promotores (origen ve la salida, destino ve la entrada) por el mismo
  pipeline genérico de movimientos; admin ve el traslado completo a través
  de la tabla `traslados` (no lee `movimientos` crudo para esto, mismo
  criterio que ya usa para cargues).
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
  turno abierto hoy, la grilla de venta no se muestra. Botón "Cierre de
  jornada" en el menú del promotor abre esa pantalla (ver bullet de
  Arqueo de caja abajo) — ahí, no en un Alert, vive el cierre real del
  turno. El turno se cruza informativamente con el evento del calendario
  del día (chip visible, nunca bloquea). Ver ADR 0006 (sincronización) y
  0008 (conexión con calendario/cargue/conteo).
- **Arqueo de caja** (`app/promotor/cierre-jornada.tsx`, `src/db/arqueos.ts`,
  `src/db/arqueosRemotos.ts`, migración 0024): pantalla que el promotor
  puede abrir y cerrar en cualquier momento del día (no solo al terminar)
  — muestra el resumen del turno (total en transferencia, en libranza, y
  el efectivo que el sistema calcula que debería tener, reutilizando
  `obtenerResumenVentas`), el progreso de la meta DIARIA de hoy si tiene
  una asignada (`obtenerProgresoMetasDiarias`, ver "Meta de venta diaria y
  Mensajes" más abajo), y un campo para que el promotor escriba el
  efectivo que contó a mano. El botón "Cerrar turno" al final de la
  pantalla queda deshabilitado hasta que ese campo tenga un valor —
  cuadre o no contra el teórico, `diferencia` es solo informativa, nunca
  bloquea (no es inventario, R1/R2 no aplican). Al cerrar, guarda el
  arqueo (una sola vez por turno, índice único) y sigue ofreciendo el PDF
  de cierre como antes. Sincroniza a Supabase (misma cola que ventas/
  movimientos) para que admin lo vea en `app/admin/turnos/[id].tsx` sin
  importar en qué dispositivo se cerró el turno — con fallback a lectura
  remota si el turno no es de ese dispositivo, mismo patrón que ya usaba
  esa pantalla para el turno mismo.
- **Comprobante de transferencia** (`src/ui/CobrarModal.tsx`,
  `src/db/ventas.ts`, migración 0015): al cobrar por transferencia, la
  app pide foto del comprobante antes de registrar la venta —
  obligatoria solo para ese medio de pago. Admin la ve en el detalle de
  cada venta.
- **Sincronización con Supabase** (`src/sync/`, `src/db/turnosRemotos.ts`,
  `src/db/comprobantesRemotos.ts`, migración 0016, ADR 0006): primera
  rebanada de Fase 5 — turnos y comprobantes de transferencia. Cola local
  (`_sync_pendiente`) que sube en background cada ~2 min o al recuperar red,
  nunca bloquea la UI. Auth anónima por dispositivo, RLS en Supabase (solo
  INSERT + el único UPDATE permitido es `hora_fin` de turno). Credenciales
  en `.env.local` (nunca commiteado, ver `.env.example`); esquema y
  políticas de Supabase documentados en `supabase/README.md` y
  `supabase/migraciones/` (se aplican a mano en el dashboard, no hay CLI de
  Supabase en el repo).
- **Sincronización del motor de inventario/ventas** (`src/sync/motor.ts`,
  `src/db/syncCola.ts`, `src/db/movimientos.ts` — `obtenerMovimientoParaSync`
  —, `src/db/lotes.ts` — `obtenerLoteParaSync` —, `supabase/migraciones/
  0004_ventas_movimientos_cargues_conteos.sql`): segunda rebanada de Fase 5,
  mismo motor y misma cola que turnos/comprobantes (`_sync_pendiente`,
  `TablaSync` ahora también admite `'ventas' | 'movimientos' | 'lotes' |
  'cargues' | 'conteos' | 'arqueos_caja'`). Cada venta, movimiento de inventario (incluye
  `COMPRA_PROVEEDOR` cuando bodega ingresa un pedido, `RECARGA`,
  `AJUSTE_CONTEO`, `ANULACION_VENTA`), lote con vencimiento, cargue (con sus
  líneas) y conteo de cierre (con sus líneas) sube a Supabase al crearse o
  al cambiar de estado — el admin ya no depende de que las ventas/
  movimientos de otro dispositivo lleguen algún día a SU base local, puede
  consultarlas directo en Supabase. **Solo dirección de subida** (celular →
  Supabase, igual que antes): la dirección contraria — que el celular del
  promotor/bodega reciba lo que el admin crea (usuarios/PINs, catálogo,
  categorías, empresas/puntos, eventos, descuentos) — sigue sin construir,
  ver sección 11 "Preguntas abiertas" y la nota en la tabla de Fase 5 más
  arriba; es un mecanismo distinto (bajada, no subida) y ya hay un primer
  ejemplo de cómo se vería (`descargarMensajesNuevos`, `src/db/mensajes.ts`).
  `ubicaciones` tampoco sincroniza (`usuarios`, `productos` y `categorias`
  sí, en la dirección de bajada — ver el bullet de "Sincronización de
  bajada" más abajo; las tablas remotas de ventas/movimientos NO se
  reescribieron para hacer JOIN contra ellas), así que las tablas
  remotas (`ventas`, `movimientos`, etc.) siguen desnormalizando los
  nombres legibles (`producto_nombre`, `promotor_nombre`,
  `ubicacion_origen_tipo`/`nombre`, etc.) en vez de depender de un JOIN que
  del otro lado no se puede hacer — mismo criterio que ya usaban
  `turnos`/`comprobantes_venta`. `venta_items` y `conteo_lineas` no tienen
  tarea propia en la cola: suben junto con su cabecera (`ventas`/`conteos`)
  en la misma llamada, porque siempre se crean todos a la vez. Para no subir
  datos falsos, `registrarMovimiento` (el punto común de todo el libro
  contable) NO encola nada por sí solo — lo hace cada llamador real
  (`ventas.ts`, `entradasBodega.ts`, `cargue.ts`, `conteos.ts`); los seeds de
  `__DEV__` (`seedDemo.ts`, `seedInventario.ts`) llaman las mismas funciones
  pero nunca encolan, así que sus datos de prueba nunca ensucian Supabase.
  Diagnóstico (qué está pendiente, qué falló y por qué) en `app/admin/sync/`,
  ya existente, ahora con etiquetas para las tablas nuevas.
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
- **Categorías de producto** (`src/db/categorias.ts`,
  `app/admin/catalogo/categorias.tsx`, migración 0020): reemplaza el
  `productos.categoria` de texto libre (nunca se llegó a exponer en ninguna
  pantalla) por una tabla `categorias` administrable — el catálogo solo
  permite *elegir* entre las que ya existen, nunca escribir texto libre, para
  que "Galleta" y "galleta" nunca sean dos categorías distintas
  (`crearCategoria` es crear-o-reusar por nombre normalizado). Admin puede
  crear categorías en cualquier momento (desde el formulario de producto con
  "+ Nueva", o desde la pantalla de gestión) y desactivarlas — nunca se
  borran, podrían estar en uso. El formulario de producto
  (`src/ui/FormularioProducto.tsx`) ahora también captura `marca` (texto
  libre con autocompletado de marcas ya usadas) — antes existía en el
  esquema pero ninguna pantalla lo exponía. Etiquetado en bloque
  (`app/admin/catalogo/index.tsx`, botón "Etiquetar en bloque"): selecciona
  varios productos y les asigna categoría de una sola vez — necesario
  porque los 123 productos reales seguían sin categoría. Sembrada con 7
  categorías iniciales (Galletas, Cereales, Ponqués, Jugos, Dulces, Lácteos,
  Paquetes de fritos) que el admin puede editar o ampliar libremente.
- **Clientes finales** (`src/db/clientes.ts`, `app/promotor/clientes/`,
  `app/admin/clientes/`, migración 0019): el promotor registra clientes en
  campo (nombre completo, teléfono, dirección, ciudad, empresa, nota) desde
  el menú de su pantalla de venta, y puede asignarle la factura de la venta
  que está armando a cualquier cliente ya registrado — un cliente no es un
  actor del sistema, no inicia sesión. `ventas.cliente_id` es opcional. La
  asignación ocurre *antes* de cobrar (desde el Ticket, "Asignar a un
  cliente") vía `VentaEnCursoContext` (`src/ui/VentaEnCursoContext.tsx`,
  provisto en `app/promotor/_layout.tsx` para toda la pila de rutas de
  promotor) — el carrito vive como estado local de `app/promotor/index.tsx`,
  pero la elección del cliente pasa por una pantalla distinta, así que
  necesitan un punto en común. También se puede asignar o cambiar el
  cliente de una venta ya cerrada desde "Ventas del turno" (ver abajo).
  Admin ve/busca todos los clientes y puede eliminarlos de verdad (DELETE
  real, no `activo=0`: un cliente no es parte del libro de inventario,
  R1/R2 no aplican) — al eliminar uno, sus ventas pasadas se desvinculan
  (`cliente_id = NULL`) en vez de perderse.
- **Ventas del turno** (`app/promotor/ventas-turno/`, `listarVentasTurno`
  en `src/db/ventas.ts`): el promotor ve, desde el menú de su pantalla de
  venta, el listado de sus propias ventas del turno abierto (con total y
  cantidad) y el detalle de cada una (productos, cantidades, método de
  pago, comprobante si fue transferencia, y el cliente asignado).
- **Dashboard: gráfico circular, ranking de productos, exportar informe y
  metas de venta** (`app/admin/dashboard/`, `src/ui/graficas/GraficoCircular.tsx`,
  `src/db/metas.ts`, migración 0021): "Por método de pago" ahora es una
  dona SVG (mismo patrón sin librería de charts que el resto de
  `src/ui/graficas/`) con la lista de siempre debajo; "Por categoría" tiene
  un selector barras/circular. "Productos más vendidos" y "Margen
  (cobertura parcial)" se fusionaron en una sola sección "Ranking de
  productos" con dos selectores independientes — Ingresos/Margen y
  Mejores/Peores — para ver de una vez qué producto da más plata y cuál
  menos, en cualquiera de las dos métricas. Botón "Exportar informe" junto
  al de actualizar: genera un `.xlsx` con una hoja por sección (resumen,
  por método de pago, por promotor, por punto, por categoría, ranking de
  productos, ventas detalladas) del período que se está viendo
  (`exportarVariasHojasAExcel`, `src/db/exportarExcel.ts`). Nueva sección
  "Metas del mes", independiente del selector de período de arriba
  (siempre es el mes calendario en curso en Bogotá, nunca "últimos 30
  días"): admin le asigna una meta mensual de ventas a un promotor o a un
  punto (`metas`, una sola meta por entidad+mes, `establecerMeta` es
  upsert), con barra de progreso contra las ventas reales de ese mes; más
  una "Proyección de cierre" que extrapola linealmente el total del mes
  según el ritmo de los días ya transcurridos (`calcularProyeccionMes`,
  `src/core/analitica/index.ts`) — `null` si el mes ya cerró, nunca se
  proyecta un mes pasado.
- **Filtro de fecha en Ventas** (`app/admin/ventas/`, `calcularRangoDiaBogota`
  en `src/core/analitica/index.ts`): además de Activas/Anuladas, el admin
  puede ver solo las ventas de hoy o de cualquier día específico (mismo
  `CalendarioRango` del dashboard, en modo un solo día). `calcularRangoDiaBogota`
  topa `hasta` a la hora actual cuando el día elegido es hoy — mismo
  criterio que `calcularRangoHoyBogota` — para que elegir "hoy" por el
  atajo o por el calendario dé siempre el mismo resultado (antes no
  coincidían: el calendario iba hasta medianoche del día siguiente sin
  importar la hora real, así que un dato con hora más tardía en el día
  podía aparecer en uno y no en el otro).
- **Gestionar personal** (`app/admin/personal/`, `src/db/personal.ts`,
  `src/core/pin/`, migración 0022): contrata, edita, cambia de rol y da de
  baja/elimina a los 4 roles (Promotor, Conductor, Bodega, Admin) — ya no es
  solo "promotores", el módulo se generalizó. Contratar = elegir rol +
  llenar nombre completo, cédula, celular y dirección. El PIN sigue la regla
  de `modoPinParaRol` (`src/core/pin/index.ts`): Promotor/Conductor/Bodega
  derivan el PIN de los últimos 4 dígitos de la cédula (`pinDesdeCedula`),
  nunca se pide a mano salvo choque con otro PIN ya en uso (el índice único
  de PIN, migración 0003, es global entre todos los roles); Admin usa un PIN
  manual de 6 dígitos, sin relación con la cédula. Editar cédula recalcula
  el PIN junto con ella (solo en roles derivados de cédula). Cambiar de rol
  recalcula el PIN según la regla del rol nuevo (`cambiarRolPersona`) — pasar
  a un rol derivado de cédula sin tener cédula guardada pide capturarla
  primero (`CedulaRequeridaError`). "Dar de baja" es el mismo patrón
  `activo=0` de productos y además libera el PIN (`pin = NULL`) para que una
  futura persona con la misma cédula no choque con el índice único. Solo una
  vez dado de baja aparece "Eliminar definitivamente" (DELETE real) —
  protegido de verdad por `PRAGMA foreign_keys = ON` (`src/db/client.ts`):
  si la persona tiene cualquier venta, turno, cargue, conteo o evento
  asociado, el DELETE falla solo por la restricción de llave foránea y se
  traduce a un mensaje claro (`PersonaConHistorialError`) — nunca deja datos
  huérfanos. Solo sirve para un registro de prueba o un error de captura que
  nunca tuvo actividad real; para cualquiera que ya trabajó, dar de baja es
  la única opción. **Nota:** aunque se le puede asignar el rol Conductor a
  alguien aquí, Conductor todavía no tiene ninguna pantalla propia en la app
  (`src/core/auth/`, `ModoLogin` solo admite PROMOTOR/ADMIN/BODEGA) — no
  puede iniciar sesión ni recibir mensajes push todavía.
- **Rediseño de Calendario de eventos y sidebar fijo de admin**
  (`app/admin/_layout.tsx`, `src/ui/SidebarAdmin.tsx`,
  `src/ui/BarraSuperiorAdmin.tsx`, `src/ui/modulosAdmin.ts`,
  `app/admin/calendario/`, `app/promotor/calendario.tsx`): en pantalla ancha,
  admin ahora tiene una barra superior fija (logo + cerrar sesión) y un
  sidebar fijo a la izquierda con los módulos (`modulosAdmin.ts`, única
  fuente de verdad compartida con el menú principal) — en celular no cambia
  nada, cada pantalla sigue con su propio encabezado. El Dashboard pasó a
  ser la pantalla de entrada de admin en pantalla ancha. Calendario (admin y
  promotor) se rediseñó y bloquea la edición de eventos en fechas pasadas.
  `Alert.alert` no tiene UI en React Native Web (limitación conocida, ver
  sección 5) — Personal, Descuentos y Clientes reemplazaron sus
  confirmaciones de 2 botones por `src/ui/ModalConfirmacion.tsx`, que sí se
  puede probar en el navegador.
- **Meta de venta diaria y Mensajes/notificaciones push**
  (`app/admin/calendario/`, `app/admin/mensajes/`, `app/promotor/notificaciones.tsx`,
  `app/bodega/notificaciones.tsx`, `src/db/eventos.ts`, `src/db/metasDiarias.ts`,
  `src/db/mensajes.ts`, `src/sync/push.ts`, `src/core/errores/`, migración
  0023, `supabase/migraciones/0003_mensajes.sql`): al planear o editar un
  evento en el Calendario, admin puede fijar una meta de venta DIARIA por
  promotor asignado (`evento_promotores.meta_diaria`) — distinta de la meta
  MENSUAL (`metas`, más arriba). Nuevo módulo admin "Mensajes": envía una
  notificación push a Promotor o Bodega (texto libre, selección individual
  dentro del rol) o, con un botón, el progreso de la meta del día de cada
  promotor que tenga una asignada hoy (`"Ánimo, vas en un X% de tu meta de
  hoy..."`, `src/db/metasDiarias.ts`). El envío llama DIRECTO al servicio de
  Expo Push desde el dispositivo del admin (`src/sync/push.ts`) — sin
  servidor propio, mismo espíritu que el resto de la sincronización (ADR
  0006). El mensaje se guarda en Supabase (`mensajes` + `mensaje_destinatarios`,
  fan-out uno por destinatario) porque tiene que viajar entre dispositivos;
  cada destinatario descarga un espejo local (`mensajes_recibidos`) para
  poder revisar sus notificaciones sin conexión, en una pantalla nueva
  "Notificaciones" agregada al menú de Promotor y Bodega. **Conductor queda
  fuera por ahora** (no tiene pantalla propia, ver nota de "Gestionar
  personal" arriba). **Limitación importante de plataforma:** las push
  notifications remotas NO funcionan en Expo Go desde el SDK 53 de Expo —
  hace falta el `.apk` de `eas build --profile preview` (o un development
  build) para probarlas de verdad; ver sección 5. Antes de que esto sirva de
  verdad hay que correr `supabase/migraciones/0003_mensajes.sql` a mano en
  el dashboard de Supabase (igual que 0001) — sin eso, el envío falla con un
  error visible ("no se encontró la tabla…") pero no rompe el resto de la
  app.
- **Validación de credenciales de Supabase, perezosa en vez de al
  arrancar** (`src/sync/config.ts`, `src/sync/supabaseClient.ts`): antes,
  si faltaba `EXPO_PUBLIC_SUPABASE_URL`/`EXPO_PUBLIC_SUPABASE_ANON_KEY` en
  `.env.local`, toda la app tumbaba al abrir (no solo la sincronización)
  porque el módulo validaba al importarse. Ahora `requerirCredenciales()`
  valida solo cuando de verdad se necesita el cliente de Supabase (dentro
  del intento de sincronizar), así que la app entera funciona sin
  `.env.local` — la sincronización de turnos/comprobantes simplemente
  queda pendiente, visible en `app/admin/sync/` (diagnóstico ya existente).
- **Sincronización de bajada — personal/PINs** (`src/db/personal.ts`,
  `src/db/usuarios.ts` — `descargarUsuariosNuevos` —, `src/core/pin`,
  `app/index.tsx`, `app/promotor/index.tsx`, `app/bodega/index.tsx`,
  `supabase/migraciones/0006_usuarios.sql`): primera rebanada de la
  dirección de BAJADA (Supabase → celular, ver sección 11) — hasta ahora todo
  lo sincronizado subía nada más. Cada alta/edición/cambio de rol/baja de
  personal (`app/admin/personal/`) sube a Supabase igual que las demás
  tablas (misma cola `_sync_pendiente`); el DELETE real de "eliminar
  definitivamente" no pasa por la cola (esa asume que la fila local sigue
  ahí) — hace un DELETE remoto best-effort aparte. Promotor y Bodega
  descargan ese personal: si un PIN no se encuentra al loguear, se intenta
  una descarga fresca antes de rendirse (resuelve el caso "lo contraté hoy y
  no puede entrar"), y también cada vez que abren su pantalla de inicio (para
  que una baja o un cambio de rol les llegue sin tener que fallar un login
  primero). El dispositivo de admin NUNCA descarga esta tabla — su base local
  ya es la fuente de verdad, descargarla ahí podría pisar una edición propia
  recién hecha que todavía no subió; por eso mismo esta rebanada no necesita
  resolver conflictos de escritura concurrente. El PIN real casi nunca viaja
  por la red: para Promotor/Conductor/Bodega (PIN derivado de cédula) cada
  dispositivo lo recalcula localmente a partir de `cedula` en vez de leerlo
  de Supabase — importante porque la anon key es pública dentro del `.apk`,
  así que sin esto cualquiera que la extrajera podría leer el PIN de cada
  empleado sin tocar ningún celular. Solo viaja de verdad para ADMIN (PIN
  manual, no derivable) o un override manual por colisión — riesgo aceptado,
  ver `pinParaSincronizar`/`pinDesdeDescarga` en `src/core/pin`.
- **Sincronización de bajada — catálogo** (`src/db/productos.ts`,
  `src/db/categorias.ts`, `src/sync/bajada.ts`,
  `supabase/migraciones/0007_catalogo.sql`): segunda rebanada de bajada,
  mismo patrón que personal/PINs. Cada alta/edición/baja/restauración de un
  producto y cada alta/desactivación de una categoría sube a Supabase (misma
  cola `_sync_pendiente`, dentro de la misma transacción que el cambio
  local, incluido "etiquetar en bloque"). Promotor y Bodega descargan
  categorías y luego productos con `descargarDatosDeAdmin`
  (`src/sync/bajada.ts`) — orquestador único, también descarga personal; el
  orden importa porque `productos.categoria_id` es una FK local real
  (PRAGMA foreign_keys=ON) y un producto que llegara antes que su categoría
  fallaría al insertarse. Se dispara en los mismos tres puntos que
  personal: login fallido (solo modo no-admin), pantalla de inicio de
  Promotor y de Bodega. **Las fotos de producto (`foto_uri`) NO viajan**: es
  una URI local del dispositivo que la tomó, sin sentido en otro — un
  producto descargado llega sin foto, igual que uno al que nunca se la
  tomaron. Cómo/dónde almacenarlas (bucket de Storage, como selfies y
  comprobantes) se decidió tratar aparte, en detalle. Sin FK remota entre
  `productos.categoria_id` y `categorias.id` a propósito (cada una tiene su
  propia tarea en la cola y una FK real bloquearía un producto si la tarea de
  su categoría falla un momento) — la integridad real la garantiza SQLite
  local del lado de admin, que es el único que escribe. **Los ids de los 123
  productos y 7 categorías iniciales son DISTINTOS en cada dispositivo**
  (migraciones 0005 y 0020 usan `randomUUID()` por dispositivo, con `sku` y
  `nombre_normalizado` UNIQUE): por eso la bajada NO hace upsert por id sino
  que reconcilia por clave natural — productos por `sku`, categorías por
  `nombre_normalizado` (`aplicarProductosRemotos`/`aplicarCategoriasRemotas`)
  — conservando siempre el id LOCAL (ya lo referencian movimientos,
  venta_items, etc. con FK real) y traduciendo el `categoria_id` del admin al
  de cada dispositivo. Consecuencia conocida: `producto_id` en las tablas
  remotas `ventas`/`movimientos`/etc. es el id local del dispositivo que
  vendió, no el del admin, para esos 123 productos (los remotos siempre
  llevan también `producto_nombre`). La solución de fondo sería ids
  deterministas para los datos iniciales — migración riesgosa sobre
  dispositivos que ya tienen ventas, no se hizo. Solo se sube un producto/
  categoría cuando el admin lo crea o edita (los iniciales no se encolan;
  subir un producto sube antes su categoría). Cada fila se aplica en su
  propio try/catch: un `sku`/`codigo_barras`/PIN repetido no frena el resto.
  El login espera como máximo 8 s a esta descarga (R5).

- **Sincronización de bajada — datos operativos y Realtime**
  (`src/db/bajadaOperativa.ts`, `src/db/mapeoRemoto.ts`, `src/db/syncEstado.ts`,
  `src/sync/bajada.ts`, `src/sync/realtime.ts`, `src/sync/eventosDatos.ts`,
  `src/ui/useSincronizacionEnVivo.ts`, `src/ui/useVersionDatos.ts`,
  `app/admin/_layout.tsx`, `app/bodega/_layout.tsx`, `app/promotor/_layout.tsx`,
  `supabase/migraciones/0009_sincronizacion_completa.sql`, migraciones
  locales 0025 y 0026). Antes cada dispositivo solo veía SU propia base:
  una venta del celular nunca aparecía en el admin del computador, un cargue
  planeado por admin nunca llegaba a bodega, y una RECARGA hecha en bodega
  nunca llegaba al inventario del promotor. Ahora, además de subir, cada
  rol DESCARGA lo que le corresponde: **admin** ventas (con sus ítems),
  cargues y movimientos de bodega; **bodega** cargues y movimientos de
  bodega; **promotor** los movimientos de SU ubicación (lo que le entregan).
  Cursor por `subido_ts` (hora del SERVIDOR, lo fija un trigger; 5 s de
  solape, todo idempotente) en `_sync_estado`. **Traducción de ids por clave
  natural** (`mapeoRemoto.ts`) porque los ids de productos iniciales, categorías
  y ubicaciones difieren por dispositivo: producto por `sku` (las filas
  remotas ahora llevan `producto_sku`; las viejas sin sku se resuelven por
  nombre), persona por id y si no por (rol, nombre) y si no un usuario
  "fantasma" inactivo sin PIN, ubicación por (tipo, responsable). Los
  movimientos solo se INSERTAN (R2, `INSERT OR IGNORE`), sin lote todavía. Un
  cargue con cambios propios aún sin subir NO se pisa con la copia remota, y
  una línea ENTREGADA nunca retrocede (también lo impide un trigger en
  Supabase). Una anulación de venta nunca se deshace al descargar. **Realtime**
  (`suscribirCambiosRemotos`, canal `postgres_changes` sobre ventas/cargues/
  movimientos): solo avisa; la descarga agrupa avisos seguidos (400 ms) y
  hay una vuelta de respaldo cada 45 s por si Realtime se cae. Al llegar algo,
  `notificarDatosActualizados` hace que las pantallas abiertas (ventas y
  dashboard del admin, cargues y stock, cargues de bodega, inventario del
  promotor) se recarguen solas (`useRecargarConDatosNuevos`). **Subida
  inmediata:** `encolarSync` pide un drenado ~700 ms después (agrupando
  tareas), ya no se espera hasta 2 minutos; el temporizador queda de respaldo.
  Para entregar un cargue, bodega verifica el turno del promotor en Supabase
  (`hayTurnoAbiertoHoyRemoto`) porque el turno vive en el celular del
  promotor; sin conexión no puede confirmar. **Antes de que sirva hay que
  correr `supabase/migraciones/0009_sincronizacion_completa.sql`** (ver
  sección 11) — script único e idempotente que además crea las tablas de
  mensajes (su ausencia daba "Could not find the table 'public.mensajes'").

Lo que falta de cada fase (aprobación de descuadres R7, niveles objetivo,
alertas de vencimiento, bajada de empresas/puntos/eventos/descuentos, panel
web, recomendador de recarga) sigue sin construirse — no asumir que existe.

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

- [x] ~~Falta la sincronización en dirección de BAJADA para personal/PINs~~
      — **resuelta el 2026-09-23**: contratar a alguien en "Gestionar
      personal" y que pueda iniciar sesión en su propio celular ya funciona
      en producción (ver sección 10, bullet "Sincronización de bajada —
      personal/PINs", y `supabase/migraciones/0006_usuarios.sql`).
- [x] ~~BAJADA del catálogo (productos/categorías)~~ — **construida el
      2026-09-23** (sección 10, bullet "Sincronización de bajada —
      catálogo", `supabase/migraciones/0007_catalogo.sql`), sin fotos.
- [x] ~~Realtime y bajada de datos operativos (ventas → admin, cargues →
      bodega, movimientos → promotor/bodega/admin)~~ — **construidos el
      2026-09-23** tras probar el usuario con celular + computador (sección
      10, bullet "Sincronización de bajada — datos operativos y Realtime").
- [ ] **Sigue faltando la BAJADA para el resto de lo que crea admin**:
      empresas/puntos, eventos del calendario (incluida la meta diaria) y
      descuentos — un punto nuevo o un evento planeado por admin no le llega
      al celular del promotor. Sin eventos, el promotor no ve su calendario
      ni se resuelve su punto vigente (y por tanto tampoco descuentos ni meta
      diaria) desde SU celular; y una venta llega al admin SIN punto (el
      punto no existe allá). Mismo patrón: se agrega cada tabla a
      `descargarDatosDeAdmin` (`src/sync/bajada.ts`) en orden de dependencia
      (empresas → puntos → eventos/descuentos). También pendiente: conteos
      de cierre hacia admin (hoy el admin no ve los conteos hechos en el
      celular; las líneas ya suben con `producto_sku`), lotes en movimientos,
      y fotos de comprobante/selfie de ventas descargadas.
- [ ] **Fotos de producto**: qué se almacena y dónde (probablemente un bucket
      privado de Storage, como `selfies-turnos`/`comprobantes-venta`), cómo
      se suben desde admin y cómo las descargan Promotor/Bodega. El usuario
      pidió tratarlo aparte, en detalle, después de terminar la bajada de
      las tablas — hoy `foto_uri` es local y no viaja.
- [ ] **Correr `supabase/migraciones/0009_sincronizacion_completa.sql`** en
      el SQL Editor de Supabase (después de 0001 y 0002, una sola vez; es
      idempotente, se puede repetir). Reúne 0003-0008 y agrega columnas de
      clave natural, triggers de `subido_ts`, protección de cargues y
      Realtime. Sin esto: "Could not find the table 'public.mensajes'", las
      ventas no suben y Realtime no avisa.
- [ ] **Correr `supabase/migraciones/0010_seguridad_pin.sql`** en el SQL
      Editor de Supabase, después de `0009` (no usa su helper
      `_politicas_abiertas` porque esa migración lo borra al final — políticas
      escritas explícitas). Crea `intentos_pin_fallidos`/`desbloqueos_pin`/
      `logins_exitosos_pin` remotas. Sin esto: sincronizar seguridad de PIN
      falla silenciosamente (queda en la cola, ver `app/admin/sync/`) y
      "Seguridad de acceso" solo ve el propio dispositivo de admin.
- [ ] **Correr `supabase/migraciones/0011_traslados.sql`** en el SQL Editor
      de Supabase, después de `0010`. Crea `traslados`/`traslado_lineas`
      remotas (tampoco usa `_politicas_abiertas`, mismo motivo que 0010).
      Sin esto: un traslado planeado en un dispositivo no le llega a
      bodega en otro, y admin no ve traslados hechos en otro dispositivo.
- [ ] **Nada de la sincronización se ha probado contra un Supabase real con
      dos dispositivos.** Todo verificado hasta ahora es `tsc`/tests/lint/
      bundle (y lectura del código). Antes de darla por buena: correr en
      `0009` en el SQL editor, y probar a mano el flujo completo (admin
      crea → otro dispositivo lo recibe).
      Sí está probado con SQLite real (`npm run test:db`): migraciones,
      flujos de negocio, y que cada fila subida coincida con las columnas de
      los `.sql` — lo que NO cubre es Supabase real, RLS, ni red.
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
- [ ] ¿El promotor debería poder ver/editar sus propios datos de contacto
      (celular, dirección), o eso queda exclusivamente en manos de admin
      como está hoy (`app/admin/personal/`)? Hoy el promotor no tiene
      ninguna pantalla para verse a sí mismo en el sistema.
- [ ] ¿Cuándo se le construye a Conductor su propia pantalla/login? Ya se le
      puede asignar el rol y contratarlo desde "Gestionar personal", pero
      `ModoLogin` (`src/core/auth/`) todavía no lo admite — no puede iniciar
      sesión, ni recibir mensajes push (sección 10, "Mensajes").
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
- No asumir que TODO sincroniza: empresas/puntos, eventos, descuentos y
  `ubicaciones` siguen 100% locales, y las fotos de producto tampoco viajan
  (ver sección 10 y 11 para qué sí sincroniza y en qué dirección). No
  extender la sincronización a otras tablas sin decidirlo explícitamente
  primero. Nunca correr la bajada de personal/catálogo
  (`descargarDatosDeAdmin`, `src/sync/bajada.ts`) en el dispositivo de admin
  — pisaría ediciones propias que todavía no subieron. Los datos operativos
  (ventas, cargues, movimientos) SÍ bajan al admin: no los crea él, y donde
  hay escritura compartida (cargues) no se pisan cambios propios pendientes.
- No usar `AsyncStorage` para datos de inventario. Va en SQLite.
- No dispersar checks de permisos por la UI. Ver sección 4.
- No instalar `expo-barcode-scanner`. Está deprecado.
- No añadir dependencias pesadas sin justificarlo. Cada librería es peso en el APK
  y riesgo de incompatibilidad con el SDK de Expo.
- No hacer `DELETE` real sobre productos o categorías — desactivar
  (`activo=0`). Ver sección 8 para las únicas dos excepciones (clientes,
  y promotores sin historial) y por qué esas sí son seguras.

---

## 13. Marca

| Color | Hex | Uso |
|---|---|---|
| Primario | `#F3A712` | Dorado/mostaza. Pantallas de promotor. |
| Oscuro | `#541212` | Vinotinto. Pantallas de administración y bodega. |
