import type { SQLiteDatabase } from 'expo-sqlite';

import type { UsuarioSesion } from '@/core/tipos';
import {
  descargarCarguesNuevos,
  descargarMovimientosNuevos,
  descargarTrasladosNuevos,
  descargarVentasNuevas,
} from '@/db/bajadaOperativa';
import { descargarCategoriasNuevas } from '@/db/categorias';
import { descargarClientesNuevos } from '@/db/clientes';
import { descargarDescuentosNuevos } from '@/db/descuentos';
import { descargarEmpresasNuevas } from '@/db/empresas';
import { descargarEventosNuevos, obtenerPuntoVigentePromotor } from '@/db/eventos';
import { descargarProductosNuevos } from '@/db/productos';
import { descargarPuntosNuevos } from '@/db/puntos';
import { descargarUsuariosNuevos } from '@/db/usuarios';

import { notificarDatosActualizados } from './eventosDatos';

/**
 * Punto único para descargar todo lo que el admin haya creado/editado y que
 * un dispositivo de Promotor/Bodega necesita para operar — ver CLAUDE.md
 * sección 11. Cada función individual es best-effort (nunca lanza), así que
 * una tabla que falle no le impide a las demás descargar lo suyo.
 *
 * El orden importa: categorías antes que productos, porque
 * `productos.categoria_id` es una FK local real (PRAGMA foreign_keys=ON,
 * src/db/client.ts) y porque los productos necesitan el mapa "id remoto → id
 * local" de las categorías. Si las categorías no se pudieron descargar
 * (`null`, ej. sin red) los productos se omiten: sin ese mapa les borrarían
 * la categoría. Igual con empresas antes que puntos (`puntos.empresa_id` es
 * FK): si las empresas fallan, los puntos se omiten; y los eventos del
 * calendario y los descuentos van al final (referencian personal, producto,
 * empresa y punto). Devuelve cuántos eventos y descuentos cambiaron, para que
 * el calendario y los precios abiertos se refresquen.
 *
 * Nunca se llama desde el dispositivo de admin: esa base local ya es la
 * fuente de verdad de todas estas tablas (él es quien las crea), y
 * descargarlas ahí podría pisar una edición propia recién hecha que todavía
 * no subió — ver la nota en cada función individual.
 */
export async function descargarDatosDeAdmin(db: SQLiteDatabase): Promise<number> {
  await descargarUsuariosNuevos(db);
  const categorias = await descargarCategoriasNuevas(db);
  if (categorias) await descargarProductosNuevos(db, categorias);
  // Empresas/puntos son solo una descarga adelantada (más rápida que
  // resolverlos uno por uno) — nunca una dependencia dura: eventos y
  // descuentos resuelven su propio punto/empresa con `asegurarPuntosLocales`
  // si hiciera falta. Un fallo aquí (ej. un error transitorio de Postgres, no
  // necesariamente "sin red") NO debe cortar la bajada de eventos/descuentos:
  // eso los dejaba sin llegar nunca al celular, aunque Realtime avisara bien.
  await descargarEmpresasNuevas(db);
  await descargarPuntosNuevos(db);
  const eventos = await descargarEventosNuevos(db);
  const descuentos = await descargarDescuentosNuevos(db);
  // Lista compartida sin dueño (cualquier promotor ve/asigna cualquier
  // cliente): admin descarga la de otros dispositivos en
  // `descargarDatosOperativos`, y aquí Promotor/Bodega descargan la que
  // admin (o cualquier otro promotor) haya creado o eliminado.
  const clientes = await descargarClientesNuevos(db);
  return eventos + descuentos + clientes;
}

async function descargarDatosOperativos(db: SQLiteDatabase, sesion: UsuarioSesion): Promise<number> {
  let cambios = 0;
  if (sesion.rol === 'ADMIN') {
    // Lo que otros dispositivos generan y el admin necesita ver: ventas de los
    // promotores, cargues/traslados (y su estado de entrega) y movimientos de
    // la bodega. Los movimientos TRASLADO (promotor↔promotor) no matchean el
    // filtro BODEGA de abajo — admin los ve completos vía la tabla `traslados`,
    // igual que ya pasa con cargues (nunca lee `movimientos` crudo para eso).
    cambios += await descargarVentasNuevas(db);
    cambios += await descargarCarguesNuevos(db);
    cambios += await descargarTrasladosNuevos(db);
    cambios += await descargarMovimientosNuevos(db, { tipo: 'BODEGA' });
    cambios += await descargarClientesNuevos(db);
  } else if (sesion.rol === 'BODEGA') {
    cambios += await descargarCarguesNuevos(db);
    cambios += await descargarTrasladosNuevos(db);
    cambios += await descargarMovimientosNuevos(db, { tipo: 'BODEGA' });
  } else if (sesion.rol === 'PROMOTOR') {
    cambios += await descargarMovimientosNuevos(db, { tipo: 'PROMOTOR', usuarioId: sesion.id });
    // Si hoy comparte evento con otros promotores, baja las ventas de todo el
    // equipo en ese punto: la meta del día es compartida (src/db/metasDiarias.ts)
    // y cada uno ve lo que venden sus compañeros en "Ventas del turno".
    const evento = await obtenerPuntoVigentePromotor(db, sesion.id);
    if (evento && evento.promotorIds.length > 1) {
      cambios += await descargarVentasNuevas(db, { tipo: 'EQUIPO', puntoId: evento.puntoId, fecha: evento.fecha });
    }
  }
  return cambios;
}

let sincronizacionEnCurso: Promise<void> | null = null;
let repetirSincronizacion = false;

/**
 * Una vuelta completa de bajada para la persona con sesión: primero personal y
 * catálogo (solo Promotor/Bodega — ver `descargarDatosDeAdmin`), luego los
 * datos operativos que le corresponden a su rol. Si algo cambió localmente,
 * avisa a las pantallas abiertas para que se refresquen
 * (`notificarDatosActualizados`). Si ya hay una vuelta corriendo no se lanza
 * otra en paralelo: se pide una más al terminar, así un cambio que llega a
 * mitad de camino no se pierde.
 */
export function sincronizarDatosRemotos(db: SQLiteDatabase, sesion: UsuarioSesion): Promise<void> {
  if (sincronizacionEnCurso) {
    repetirSincronizacion = true;
    return sincronizacionEnCurso;
  }
  sincronizacionEnCurso = (async () => {
    try {
      do {
        repetirSincronizacion = false;
        let cambios = 0;
        if (sesion.rol !== 'ADMIN') cambios += await descargarDatosDeAdmin(db);
        cambios += await descargarDatosOperativos(db, sesion);
        if (cambios > 0) notificarDatosActualizados();
      } while (repetirSincronizacion);
    } finally {
      sincronizacionEnCurso = null;
    }
  })();
  return sincronizacionEnCurso;
}

/**
 * Igual que `descargarDatosDeAdmin` pero se rinde a los `limiteMs` — para el
 * login (app/index.tsx): un PIN equivocado con mala señal no puede dejar la
 * pantalla esperando red (R5). La descarga sigue en segundo plano después de
 * rendirse; las escrituras locales que ya haga son seguras.
 */
export async function descargarDatosDeAdminConLimite(db: SQLiteDatabase, limiteMs: number): Promise<void> {
  let temporizador: ReturnType<typeof setTimeout> | undefined;
  const limite = new Promise<void>((resolver) => {
    temporizador = setTimeout(resolver, limiteMs);
  });
  try {
    await Promise.race([descargarDatosDeAdmin(db).then(() => undefined), limite]);
  } finally {
    if (temporizador) clearTimeout(temporizador);
  }
}
