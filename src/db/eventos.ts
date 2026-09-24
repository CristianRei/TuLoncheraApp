import * as Crypto from 'expo-crypto';
import type { SQLiteDatabase } from 'expo-sqlite';

import { fechaHoyBogota } from '@/core/analitica';
import { calcularOcurrencias } from '@/core/eventos';
import type { Evento, EstadoEvento, Frecuencia } from '@/core/tipos';
import { registrarAccionAuditoria } from './auditoria';

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
  dispositivoId: string
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
  return id;
}

/** Crea un evento puntual (empresa + punto + fecha) con uno o varios promotores asignados. */
export async function crearEvento(
  db: SQLiteDatabase,
  datos: { empresaId: string; puntoId: string; fecha: string; promotorIds: string[]; creadoPor: string },
  dispositivoId: string
): Promise<Evento> {
  verificarFechaNoPasada(datos.fecha);
  let id = '';
  await db.withTransactionAsync(async () => {
    id = await insertarEvento(db, datos, dispositivoId);
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
        dispositivoId
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

  await db.runAsync('UPDATE eventos SET estado = ? WHERE id = ?', [datos.estado, datos.eventoId]);
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
  await db.runAsync('UPDATE evento_promotores SET meta_diaria = ? WHERE evento_id = ? AND promotor_id = ?', [
    datos.montoObjetivo,
    datos.eventoId,
    datos.promotorId,
  ]);
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
