# ADR 0008 — Conectar calendario, cargue, turno y conteo (huecos del flujo diario)

**Estado:** Aceptado

## Contexto

Una auditoría del flujo de negocio completo (planear cargue → entregar →
turno → vender → conteo → cerrar) encontró que calendario, cargue, turno y
conteo se construyeron como sistemas independientes, cada uno correcto por
separado, pero sin cruzarse entre sí:

1. El calendario de eventos (`app/admin/calendario/`) no tenía ninguna
   relación de código con cargue ni turno.
2. Bodega podía confirmar una línea de cargue (mover inventario real) a un
   promotor sin turno abierto hoy — nadie podía confirmar que esa persona
   estaba trabajando.
3. Una línea de cargue `REVISAR` (descuadre físico de bodega) no generaba
   ninguna notificación — admin solo la veía si entraba manualmente al
   detalle de ese cargue.
4. Turno y conteo de cierre eran completamente independientes — un
   promotor podía finalizar turno sin haber contado nunca ese día.

## Decisión

Para cada hueco, el nivel de rigidez exacto que pidió el cliente:

- **Cargue exige turno (bloqueante)**: `confirmarLineaCargue`
  (`src/db/cargues.ts`) valida `obtenerTurnoAbiertoHoy` antes de generar el
  `RECARGA` — lanza `SinTurnoParaCargueError` si el promotor no tiene turno
  hoy. Mismo criterio que ya existía para vender
  (`SinTurnoAbiertoError`, `src/db/ventas.ts`), en su propia clase para no
  crear una dependencia cruzada entre `cargues.ts` y `ventas.ts`.
- **Notificación de cargue a revisar**: nuevo detector
  (`detectorCargueRevisar`, `src/db/notificaciones.ts`), mismo patrón
  plug-in que `STOCK_BAJO`/`LOTE_POR_VENCER`. Nuevo tipo `CARGUE_REVISAR`
  (migración `0018`, recrea `notificaciones` — SQLite no permite `ALTER`
  sobre un `CHECK`, mismo patrón que la migración `0008` con
  `movimientos`). Se resuelve sola cuando `resolverLineaEnRevision` marca
  la línea `ENTREGADA` — el generador de notificaciones ya maneja eso.
- **Turno↔calendario (informativo, nunca bloquea)**: nueva función
  `obtenerEventoDeHoyPromotor` (`src/db/turnos.ts`) que delega directo a
  `obtenerPuntoVigentePromotor` (`src/db/eventos.ts`, ya resuelve "evento
  de hoy sin cancelar" por fecha) — sin lógica nueva de fecha. La grilla de
  venta del promotor y el detalle de turno en admin muestran un chip con
  empresa+punto si hay evento asignado ese día. Iniciar turno sigue
  funcionando exactamente igual sin evento asignado — el calendario y el
  turno siguen siendo independientes, solo se cruzan para mostrar
  información.
  - No se agregó ninguna columna nueva a `turnos`: esa tabla ya sincroniza
    a Supabase con un trigger que rechaza cambios a cualquier columna que
    no sea `hora_fin` (ver ADR 0006) — cualquier columna nueva ahí habría
    exigido tocar también el esquema remoto y el trigger. Resolver la
    vinculación en consulta, por promotor+fecha, evita ese acoplamiento.
  - En el detalle de un turno de admin, el cruce con el calendario solo se
    resuelve si el turno es de **hoy** — no existe (ni se construyó) una
    función de "evento de una fecha arbitraria pasada", fuera de alcance
    de esta rebanada informativa.
- **Conteo pendiente al finalizar turno (solo advertencia)**: nueva
  función `existeConteoHoy` (`src/db/conteos.ts`). Si el promotor no ha
  contado hoy, el texto del `Alert.alert` de "Finalizar turno"
  (`app/promotor/index.tsx`) cambia para advertirlo explícitamente, pero
  las dos opciones (Cancelar/Finalizar) siguen igual — nunca bloquea.
- **Orden del menú admin**: `MODULOS` en `app/admin/index.tsx` se
  reordenó para seguir el flujo operativo real del día (Calendario →
  Cargue → Turnos → Ventas → Conteos → Inventario → Catálogo → Empresas →
  Descuentos → Dashboard → Notificaciones → Seguridad) — cambio cosmético,
  sin tocar ninguna ruta ni lógica.

## Consecuencias

- Bodega ya no puede entregar inventario real a un promotor que el sistema
  no puede confirmar que está trabajando ese día — cierra parcialmente el
  hueco de R4 (cadena de responsabilidad del saldo).
- Un descuadre de bodega ya no queda invisible — aparece en el mismo lugar
  donde admin ya revisa stock bajo y vencimientos.
- El calendario deja de ser un sistema de papel digitalizado aislado — sin
  forzar nada, ya se ve reflejado en el día a día del promotor y del
  admin.
- El ciclo diario (turno → venta → conteo → cierre) sigue sin ser
  obligatorio de principio a fin — sigue dependiendo en parte de la
  disciplina del promotor (decisión explícita del cliente: solo advertir,
  no bloquear finalizar turno sin conteo). Si eso resulta insuficiente en
  la práctica, es la próxima decisión a revisitar, no antes.
