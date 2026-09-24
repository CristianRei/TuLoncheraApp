import * as Crypto from 'expo-crypto';
import type { SQLiteDatabase } from 'expo-sqlite';

import { fechaHoyBogota } from '@/core/analitica';
import { mensajeDeError } from '@/core/errores';
import { calcularOcurrencias } from '@/core/eventos';
import type { Evento, EstadoEvento, Frecuencia, Pesos } from '@/core/tipos';
import { getSupabaseClient } from '@/sync/supabaseClient';

import { registrarAccionAuditoria } from './auditoria';
import { getDispositivoId } from './dispositivo';
import { resolverUsuarioLocalId } from './mapeoRemoto';
import { asegurarPuntosLocales } from './puntos';
import { encolarSync } from './syncCola';
import { guardarCursor, leerCursor } from './syncEstado';

interface FilaEvento {
  id: string;
  empresa_id: string;
  empresa_nombre: string;
  punto_id: string;
  punto_nombre: string;
  fecha: string;
  estado: EstadoEvento;
  motivo_cancelacion: string | null;
  serie_id: string | null;
}

const COLUMNAS_EVENTO = `ev.id, ev.empresa_id, e.nombre as empresa_nombre, ev.punto_id, p.nombre as punto_nombre,
   ev.fecha, ev.estado, ev.motivo_cancelacion, ev.serie_id`;

interface PromotoresDeEvento {
  ids: string[];
  nombres: string[];
  metas: Record<string, number | null>;
}

async function resolverPromotores(
  db: SQLiteDatabase,
  eventoIds: string[]
): Promise<Map<string, PromotoresDeEvento>> {
  const mapa = new Map<string, PromotoresDeEvento>();
  if (eventoIds.length === 0) return mapa;

  const marcadores = eventoIds.map(() => '?').join(', ');
  const filas = await db.getAllAsync<{
    evento_id: string;
    promotor_id: string;
    promotor_nombre: string;
    meta_diaria: number | null;
  }>(
    `SELECT ep.evento_id, ep.promotor_id, u.nombre as promotor_nombre, ep.meta_diaria
     FROM evento_promotores ep
     JOIN usuarios u ON u.id = ep.promotor_id
     WHERE ep.evento_id IN (${marcadores})
     ORDER BY u.nombre ASC`,
    eventoIds
  );
  for (const fila of filas) {
    const actual = mapa.get(fila.evento_id) ?? { ids: [], nombres: [], metas: {} };
    actual.ids.push(fila.promotor_id);
    actual.nombres.push(fila.promotor_nombre);
    actual.metas[fila.promotor_id] = fila.meta_diaria;
    mapa.set(fila.evento_id, actual);
  }
  return mapa;
}

function vacioPromotoresDeEvento(): PromotoresDeEvento {
  return { ids: [], nombres: [], metas: {} };
}

async function aEvento(db: SQLiteDatabase, fila: FilaEvento): Promise<Evento> {
  const promotores = await resolverPromotores(db, [fila.id]);
  const propios = promotores.get(fila.id) ?? vacioPromotoresDeEvento();
  return {
    id: fila.id,
    empresaId: fila.empresa_id,
    empresaNombre: fila.empresa_nombre,
    puntoId: fila.punto_id,
    puntoNombre: fila.punto_nombre,
    fecha: fila.fecha,
    promotorIds: propios.ids,
    promotorNombres: propios.nombres,
    metaDiariaPorPromotor: propios.metas,
    estado: fila.estado,
    motivoCancelacion: fila.motivo_cancelacion,
    serieId: fila.serie_id,
  };
}

async function aEventos(db: SQLiteDatabase, filas: FilaEvento[]): Promise<Evento[]> {
  const promotores = await resolverPromotores(
    db,
    filas.map((f) => f.id)
  );
  return filas.map((fila) => {
    const propios = promotores.get(fila.id) ?? vacioPromotoresDeEvento();
    return {
      id: fila.id,
      empresaId: fila.empresa_id,
      empresaNombre: fila.empresa_nombre,
      puntoId: fila.punto_id,
      puntoNombre: fila.punto_nombre,
      fecha: fila.fecha,
      promotorIds: propios.ids,
      promotorNombres: propios.nombres,
      metaDiariaPorPromotor: propios.metas,
      estado: fila.estado,
      motivoCancelacion: fila.motivo_cancelacion,
      serieId: fila.serie_id,
    };
  });
}

/** Un evento en fecha anterior a hoy (Bogotá) ya ocurrió — no se crea ni se edita, solo se consulta. */
export class EventoEnFechaPasadaError extends Error {
  constructor() {
    super('No se pueden crear ni editar eventos en una fecha anterior a hoy.');
    this.name = 'EventoEnFechaPasadaError';
  }
}

function verificarFechaNoPasada(fecha: string): void {
  if (fecha < fechaHoyBogota()) throw new EventoEnFechaPasadaError();
}

async function insertarEvento(
  db: SQLiteDatabase,
  datos: {
    empresaId: string;
    puntoId: string;
    fecha: string;
    promotorIds: string[];
    creadoPor: string;
    serieId?: string | null;
  },
  dispositivoId: string,
  sincronizar: boolean
): Promise<string> {
  const id = Crypto.randomUUID();
  const ahora = new Date().toISOString();

  await db.runAsync(
    `INSERT INTO eventos (id, empresa_id, punto_id, fecha, estado, motivo_cancelacion, serie_id, creado_por, ts_cliente, dispositivo_id)
     VALUES (?, ?, ?, ?, 'PLANEADO', NULL, ?, ?, ?, ?)`,
    [id, datos.empresaId, datos.puntoId, datos.fecha, datos.serieId ?? null, datos.creadoPor, ahora, dispositivoId]
  );
  for (const promotorId of datos.promotorIds) {
    await db.runAsync('INSERT INTO evento_promotores (evento_id, promotor_id) VALUES (?, ?)', [
      id,
      promotorId,
    ]);
  }
  if (sincronizar) await encolarEvento(db, id);
  return id;
}

/**
 * Encola la subida del evento a Supabase (src/sync/motor.ts) — siempre dentro
 * de la misma transacción que el cambio local. Se sube el evento COMPLETO
 * (con sus promotores y metas), así que cualquier cambio encola lo mismo.
 */
function encolarEvento(db: SQLiteDatabase, eventoId: string): Promise<void> {
  return encolarSync(db, { tabla: 'eventos', entidadId: eventoId, tipoTarea: 'FILA' });
}

/**
 * Crea un evento puntual (empresa + punto + fecha) con uno o varios promotores
 * asignados. `sincronizar: false` solo lo usa el seed de demo
 * (src/db/seedDemo.ts), para que sus eventos de prueba nunca suban.
 */
export async function crearEvento(
  db: SQLiteDatabase,
  datos: { empresaId: string; puntoId: string; fecha: string; promotorIds: string[]; creadoPor: string },
  dispositivoId: string,
  opciones: { sincronizar?: boolean } = {}
): Promise<Evento> {
  verificarFechaNoPasada(datos.fecha);
  let id = '';
  await db.withTransactionAsync(async () => {
    id = await insertarEvento(db, datos, dispositivoId, opciones.sincronizar ?? true);
    await registrarAccionAuditoria(
      db,
      {
        usuarioId: datos.creadoPor,
        entidad: 'EVENTO',
        entidadId: id,
        accion: 'CREAR',
        detalles: { empresaId: datos.empresaId, puntoId: datos.puntoId, fecha: datos.fecha },
      },
      dispositivoId
    );
  });
  const creado = await obtenerEvento(db, id);
  if (!creado) throw new Error('No se pudo crear el evento');
  return creado;
}

/**
 * Genera una serie recurrente: calcula las fechas de ocurrencia
 * (`calcularOcurrencias`, `src/core/eventos`) y crea un evento independiente
 * por cada una, todas con el mismo `serie_id` — solo trazabilidad, nunca se
 * editan en cascada.
 */
export async function crearSerieRecurrente(
  db: SQLiteDatabase,
  datos: {
    empresaId: string;
    puntoId: string;
    promotorIds: string[];
    frecuencia: Frecuencia;
    intervalo: number;
    fechaDesde: string;
    fechaHasta: string;
    creadoPor: string;
  },
  dispositivoId: string
): Promise<Evento[]> {
  verificarFechaNoPasada(datos.fechaDesde);
  const ocurrencias = calcularOcurrencias(datos.frecuencia, datos.intervalo, datos.fechaDesde, datos.fechaHasta);
  const serieId = Crypto.randomUUID();
  const ahora = new Date().toISOString();
  const idsCreados: string[] = [];

  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `INSERT INTO series_recurrencia (id, frecuencia, intervalo, fecha_desde, fecha_hasta, ts_cliente, dispositivo_id)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [serieId, datos.frecuencia, datos.intervalo, datos.fechaDesde, datos.fechaHasta, ahora, dispositivoId]
    );
    for (const fecha of ocurrencias) {
      const id = await insertarEvento(
        db,
        {
          empresaId: datos.empresaId,
          puntoId: datos.puntoId,
          fecha,
          promotorIds: datos.promotorIds,
          creadoPor: datos.creadoPor,
          serieId,
        },
        dispositivoId,
        true
      );
      idsCreados.push(id);
    }
    await registrarAccionAuditoria(
      db,
      {
        usuarioId: datos.creadoPor,
        entidad: 'EVENTO',
        entidadId: serieId,
        accion: 'CREAR',
        detalles: {
          empresaId: datos.empresaId,
          puntoId: datos.puntoId,
          ocurrencias: idsCreados.length,
          fechaDesde: datos.fechaDesde,
          fechaHasta: datos.fechaHasta,
        },
      },
      dispositivoId
    );
  });

  const filas = await db.getAllAsync<FilaEvento>(
    `SELECT ${COLUMNAS_EVENTO}
     FROM eventos ev
     JOIN empresas e ON e.id = ev.empresa_id
     JOIN puntos p ON p.id = ev.punto_id
     WHERE ev.serie_id = ?
     ORDER BY ev.fecha ASC`,
    [serieId]
  );
  return aEventos(db, filas);
}

export async function obtenerEvento(db: SQLiteDatabase, id: string): Promise<Evento | null> {
  const fila = await db.getFirstAsync<FilaEvento>(
    `SELECT ${COLUMNAS_EVENTO}
     FROM eventos ev
     JOIN empresas e ON e.id = ev.empresa_id
     JOIN puntos p ON p.id = ev.punto_id
     WHERE ev.id = ?`,
    [id]
  );
  return fila ? aEvento(db, fila) : null;
}

/** Todos los eventos entre dos fechas (inclusive), para el calendario admin. */
export async function listarEventosPorRango(
  db: SQLiteDatabase,
  rango: { desde: string; hasta: string },
  filtros: { promotorId?: string } = {}
): Promise<Evento[]> {
  const condicionPromotor = filtros.promotorId
    ? 'AND ev.id IN (SELECT evento_id FROM evento_promotores WHERE promotor_id = ?)'
    : '';
  const parametros = filtros.promotorId
    ? [rango.desde, rango.hasta, filtros.promotorId]
    : [rango.desde, rango.hasta];

  const filas = await db.getAllAsync<FilaEvento>(
    `SELECT ${COLUMNAS_EVENTO}
     FROM eventos ev
     JOIN empresas e ON e.id = ev.empresa_id
     JOIN puntos p ON p.id = ev.punto_id
     WHERE ev.fecha >= ? AND ev.fecha <= ? ${condicionPromotor}
     ORDER BY ev.fecha ASC`,
    parametros
  );
  return aEventos(db, filas);
}

/** Los eventos de un promotor entre dos fechas, para su propio calendario. */
export async function listarEventosPromotor(
  db: SQLiteDatabase,
  promotorId: string,
  rango: { desde: string; hasta: string }
): Promise<Evento[]> {
  return listarEventosPorRango(db, rango, { promotorId });
}

/** Reemplaza los promotores asignados a un evento existente (no es historial, es la asignación vigente de ese evento). */
export async function reasignarEvento(
  db: SQLiteDatabase,
  datos: { eventoId: string; promotorIds: string[] }
): Promise<Evento> {
  const actual = await obtenerEvento(db, datos.eventoId);
  if (!actual) throw new Error('Este evento ya no existe.');
  verificarFechaNoPasada(actual.fecha);

  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM evento_promotores WHERE evento_id = ?', [datos.eventoId]);
    for (const promotorId of datos.promotorIds) {
      await db.runAsync('INSERT INTO evento_promotores (evento_id, promotor_id) VALUES (?, ?)', [
        datos.eventoId,
        promotorId,
      ]);
    }
    await encolarEvento(db, datos.eventoId);
  });
  const actualizado = await obtenerEvento(db, datos.eventoId);
  if (!actualizado) throw new Error('Este evento ya no existe.');
  return actualizado;
}

/** Cancela un evento con motivo obligatorio — nunca se borra (mismo patrón que `ventas.anulada`, ADR 0004). */
export async function cancelarEvento(
  db: SQLiteDatabase,
  datos: { eventoId: string; motivo: string },
  dispositivoId: string,
  canceladoPorId: string
): Promise<void> {
  const actual = await obtenerEvento(db, datos.eventoId);
  if (!actual) throw new Error('Este evento ya no existe.');
  verificarFechaNoPasada(actual.fecha);

  await db.withTransactionAsync(async () => {
    await db.runAsync("UPDATE eventos SET estado = 'CANCELADO', motivo_cancelacion = ? WHERE id = ?", [
      datos.motivo,
      datos.eventoId,
    ]);
    await encolarEvento(db, datos.eventoId);
    await registrarAccionAuditoria(
      db,
      {
        usuarioId: canceladoPorId,
        entidad: 'EVENTO',
        entidadId: datos.eventoId,
        accion: 'CANCELAR',
        detalles: { motivo: datos.motivo, empresaId: actual.empresaId, puntoId: actual.puntoId, fecha: actual.fecha },
      },
      dispositivoId
    );
  });
}

/** Cambia el estado informativo de un evento (PLANEADO/EN_CURSO/CERRADO) — ya no determina el punto vigente para ventas. */
export async function cambiarEstadoEvento(
  db: SQLiteDatabase,
  datos: { eventoId: string; estado: Exclude<EstadoEvento, 'CANCELADO'> }
): Promise<void> {
  const actual = await obtenerEvento(db, datos.eventoId);
  if (!actual) throw new Error('Este evento ya no existe.');
  verificarFechaNoPasada(actual.fecha);

  await db.withTransactionAsync(async () => {
    await db.runAsync('UPDATE eventos SET estado = ? WHERE id = ?', [datos.estado, datos.eventoId]);
    await encolarEvento(db, datos.eventoId);
  });
}

/**
 * El punto vigente de un promotor: el evento de HOY (Bogotá) en el que está
 * asignado, sin cancelar. Ya no depende de un estado manual (`EN_CURSO`)
 * como antes de la migración 0014 — se resuelve por fecha real, el mismo
 * criterio que el calendario que ve el promotor.
 */
export async function obtenerPuntoVigentePromotor(
  db: SQLiteDatabase,
  promotorId: string
): Promise<Evento | null> {
  const hoy = fechaHoyBogota();
  const fila = await db.getFirstAsync<FilaEvento>(
    `SELECT ${COLUMNAS_EVENTO}
     FROM eventos ev
     JOIN empresas e ON e.id = ev.empresa_id
     JOIN puntos p ON p.id = ev.punto_id
     WHERE ev.fecha = ? AND ev.estado != 'CANCELADO'
       AND ev.id IN (SELECT evento_id FROM evento_promotores WHERE promotor_id = ?)
     ORDER BY ev.ts_cliente DESC
     LIMIT 1`,
    [hoy, promotorId]
  );
  return fila ? aEvento(db, fila) : null;
}

/**
 * Fija (o borra, con `null`) la meta de venta del día para un promotor en un
 * evento puntual — independiente de la meta mensual (src/db/metas.ts).
 * "Editar" es volver a llamar esto, no hay historial de cambios (mismo
 * criterio que `establecerMeta`).
 */
export async function establecerMetaDiaria(
  db: SQLiteDatabase,
  datos: { eventoId: string; promotorId: string; montoObjetivo: number | null }
): Promise<void> {
  await db.withTransactionAsync(async () => {
    await db.runAsync('UPDATE evento_promotores SET meta_diaria = ? WHERE evento_id = ? AND promotor_id = ?', [
      datos.montoObjetivo,
      datos.eventoId,
      datos.promotorId,
    ]);
    await encolarEvento(db, datos.eventoId);
  });
}

/** Cuántos promotores distintos tienen un evento de hoy asignado. */
export async function contarPromotoresConPuntoVigente(db: SQLiteDatabase): Promise<number> {
  const hoy = fechaHoyBogota();
  const fila = await db.getFirstAsync<{ total: number }>(
    `SELECT COUNT(DISTINCT ep.promotor_id) as total
     FROM evento_promotores ep
     JOIN eventos ev ON ev.id = ep.evento_id
     WHERE ev.fecha = ? AND ev.estado != 'CANCELADO'`,
    [hoy]
  );
  return fila?.total ?? 0;
}

// ---------------------------------------------------------------------------
// Sincronización: admin sube, Promotor/Bodega descargan
// ---------------------------------------------------------------------------

export interface PromotorDeEventoParaSync {
  promotorId: string;
  promotorNombre: string;
  metaDiaria: Pesos | null;
}

export interface EventoParaSync {
  id: string;
  empresaId: string;
  puntoId: string;
  fecha: string;
  estado: EstadoEvento;
  motivoCancelacion: string | null;
  serieId: string | null;
  creadoPor: string;
  creadoPorNombre: string | null;
  promotores: PromotorDeEventoParaSync[];
  tsCliente: string;
}

/** Un evento con sus promotores y metas, tal como sube a Supabase (src/sync/motor.ts). */
export async function obtenerEventoParaSync(db: SQLiteDatabase, id: string): Promise<EventoParaSync | null> {
  const fila = await db.getFirstAsync<{
    id: string;
    empresa_id: string;
    punto_id: string;
    fecha: string;
    estado: EstadoEvento;
    motivo_cancelacion: string | null;
    serie_id: string | null;
    creado_por: string;
    creado_por_nombre: string | null;
    ts_cliente: string;
  }>(
    `SELECT ev.id, ev.empresa_id, ev.punto_id, ev.fecha, ev.estado, ev.motivo_cancelacion, ev.serie_id,
            ev.creado_por, u.nombre as creado_por_nombre, ev.ts_cliente
     FROM eventos ev
     LEFT JOIN usuarios u ON u.id = ev.creado_por
     WHERE ev.id = ?`,
    [id]
  );
  if (!fila) return null;
  const propios = (await resolverPromotores(db, [id])).get(id) ?? vacioPromotoresDeEvento();
  return {
    id: fila.id,
    empresaId: fila.empresa_id,
    puntoId: fila.punto_id,
    fecha: fila.fecha,
    estado: fila.estado,
    motivoCancelacion: fila.motivo_cancelacion,
    serieId: fila.serie_id,
    creadoPor: fila.creado_por,
    creadoPorNombre: fila.creado_por_nombre,
    promotores: propios.ids.map((promotorId, i) => ({
      promotorId,
      promotorNombre: propios.nombres[i],
      metaDiaria: propios.metas[promotorId] ?? null,
    })),
    tsCliente: fila.ts_cliente,
  };
}

/**
 * Encola una sola vez los eventos que existían antes de que sincronizaran —
 * se llama al entrar el admin (app/index.tsx, solo fuera de `__DEV__`), igual
 * que `encolarEmpresasYPuntosSinSubir`.
 */
export async function encolarEventosSinSubir(db: SQLiteDatabase): Promise<void> {
  const pendientes = await db.getAllAsync<{ id: string }>(
    `SELECT ev.id FROM eventos ev
     WHERE NOT EXISTS (SELECT 1 FROM _sync_pendiente s WHERE s.tabla = 'eventos' AND s.entidad_id = ev.id)`
  );
  if (pendientes.length === 0) return;
  await db.withTransactionAsync(async () => {
    for (const { id } of pendientes) await encolarEvento(db, id);
  });
}

interface PromotorDeEventoRemoto {
  promotor_id: string;
  promotor_nombre: string | null;
  meta_diaria: number | null;
}

interface FilaEventoRemota {
  id: string;
  empresa_id: string;
  punto_id: string;
  fecha: string;
  estado: EstadoEvento;
  motivo_cancelacion: string | null;
  serie_id: string | null;
  creado_por: string;
  creado_por_nombre: string | null;
  promotores: PromotorDeEventoRemoto[] | null;
  ts_cliente: string;
  dispositivo_id: string;
  subido_ts: string;
}

const SOLAPE_CURSOR_MS = 5000;
const TAMANO_PAGINA_EVENTOS = 500;

/** Estado local de un evento en una sola cadena, para saber si una descarga cambió algo. */
async function firmaEvento(db: SQLiteDatabase, eventoId: string): Promise<string> {
  const evento = await db.getFirstAsync<Record<string, unknown>>(
    'SELECT empresa_id, punto_id, fecha, estado, motivo_cancelacion FROM eventos WHERE id = ?',
    [eventoId]
  );
  const promotores = await db.getAllAsync<Record<string, unknown>>(
    'SELECT promotor_id, meta_diaria FROM evento_promotores WHERE evento_id = ? ORDER BY promotor_id',
    [eventoId]
  );
  return JSON.stringify([evento, promotores]);
}

async function aplicarEventoRemoto(db: SQLiteDatabase, ev: FilaEventoRemota, dispositivoId: string): Promise<boolean> {
  // Si este mismo dispositivo tiene una edición propia del evento aún sin
  // subir (en `__DEV__` admin y promotor comparten base), no se pisa con la
  // copia remota, que es más vieja — mismo criterio que cargues.
  const pendiente = await db.getFirstAsync<{ id: string }>(
    "SELECT id FROM _sync_pendiente WHERE tabla = 'eventos' AND entidad_id = ? AND completado_ts IS NULL LIMIT 1",
    [ev.id]
  );
  if (pendiente) return false;

  // Las personas se traducen por id y, si no, por (rol, nombre) — ver
  // mapeoRemoto.ts. Dos ids remotos que caen en la misma persona local
  // cuentan una sola vez.
  const creadoPor = await resolverUsuarioLocalId(
    db,
    { id: ev.creado_por, nombre: ev.creado_por_nombre, rol: 'ADMIN' },
    dispositivoId
  );
  const metaPorPromotor = new Map<string, number | null>();
  for (const p of ev.promotores ?? []) {
    const promotorId = await resolverUsuarioLocalId(
      db,
      { id: p.promotor_id, nombre: p.promotor_nombre, rol: 'PROMOTOR' },
      dispositivoId
    );
    metaPorPromotor.set(promotorId, p.meta_diaria ?? null);
  }
  // La serie es solo trazabilidad para el admin: no viaja, el evento baja sin ella.
  const serie = ev.serie_id
    ? await db.getFirstAsync<{ id: string }>('SELECT id FROM series_recurrencia WHERE id = ?', [ev.serie_id])
    : null;

  const antes = await firmaEvento(db, ev.id);
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `INSERT INTO eventos (id, empresa_id, punto_id, fecha, estado, motivo_cancelacion, serie_id, creado_por, ts_cliente, dispositivo_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         empresa_id = excluded.empresa_id,
         punto_id = excluded.punto_id,
         fecha = excluded.fecha,
         estado = excluded.estado,
         motivo_cancelacion = excluded.motivo_cancelacion`,
      [
        ev.id,
        ev.empresa_id,
        ev.punto_id,
        ev.fecha,
        ev.estado,
        ev.motivo_cancelacion,
        serie?.id ?? null,
        creadoPor,
        new Date(ev.ts_cliente).toISOString(),
        ev.dispositivo_id,
      ]
    );
    await db.runAsync('DELETE FROM evento_promotores WHERE evento_id = ?', [ev.id]);
    for (const [promotorId, meta] of metaPorPromotor) {
      await db.runAsync('INSERT INTO evento_promotores (evento_id, promotor_id, meta_diaria) VALUES (?, ?, ?)', [
        ev.id,
        promotorId,
        meta,
      ]);
    }
  });
  return antes !== (await firmaEvento(db, ev.id));
}

/**
 * Trae de Supabase los eventos del calendario que el admin haya creado o
 * cambiado (reasignar, cancelar, meta diaria) — así el promotor ve su
 * calendario, su punto vigente (la venta queda con punto) y su meta del día
 * en SU celular. Debe correr DESPUÉS de personal, empresas y puntos
 * (`descargarDatosDeAdmin`, src/sync/bajada.ts): son FK locales. Upsert por
 * id (los crea siempre el admin, mismo id en todos los dispositivos); los
 * promotores asignados se reemplazan completos. Cursor por `subido_ts`, igual
 * que los datos operativos (src/db/bajadaOperativa.ts). Nunca se llama desde
 * el dispositivo de admin. Devuelve cuántos eventos cambiaron localmente;
 * best-effort, nunca lanza.
 */
export async function descargarEventosNuevos(db: SQLiteDatabase): Promise<number> {
  let cambios = 0;
  try {
    const supabase = await getSupabaseClient();
    const dispositivoId = await getDispositivoId(db);
    let cursor = await leerCursor(db, 'eventos');
    let desde = cursor ? new Date(new Date(cursor).getTime() - SOLAPE_CURSOR_MS).toISOString() : null;

    for (;;) {
      let consulta = supabase.from('eventos').select('*');
      if (desde) consulta = consulta.gt('subido_ts', desde);
      const { data: eventos, error } = await consulta
        .order('subido_ts', { ascending: true })
        .limit(TAMANO_PAGINA_EVENTOS)
        .returns<FilaEventoRemota[]>();
      if (error) throw error;
      if (!eventos || eventos.length === 0) break;

      await asegurarPuntosLocales(db, eventos.map((e) => e.punto_id));

      for (const ev of eventos) {
        try {
          if (await aplicarEventoRemoto(db, ev, dispositivoId)) cambios++;
        } catch (errorEvento) {
          console.log(`[eventos] no se pudo aplicar el evento del ${ev.fecha}:`, mensajeDeError(errorEvento));
        }
        if (!cursor || new Date(ev.subido_ts).getTime() > new Date(cursor).getTime()) cursor = ev.subido_ts;
      }
      if (cursor) await guardarCursor(db, 'eventos', cursor);
      desde = eventos[eventos.length - 1].subido_ts;
      if (eventos.length < TAMANO_PAGINA_EVENTOS) break;
    }
  } catch (error) {
    console.log('[eventos] no se pudieron descargar eventos nuevos:', mensajeDeError(error));
  }
  return cambios;
}
