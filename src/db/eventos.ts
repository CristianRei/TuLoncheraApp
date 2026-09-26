import * as Crypto from 'expo-crypto';
import type { SQLiteDatabase } from 'expo-sqlite';

import { fechaHoyBogota } from '@/core/analitica';
import { mensajeDeError } from '@/core/errores';
import { calcularOcurrencias } from '@/core/eventos';
import { elegirHorarioVigente, formatearRangoHoras, horaActualBogota, horariosSeCruzan } from '@/core/horas';
import type { Evento, EstadoEvento, Frecuencia, Pesos } from '@/core/tipos';
import { getSupabaseClient } from '@/sync/supabaseClient';

import { registrarAccionAuditoria } from './auditoria';
import { getDispositivoId } from './dispositivo';
import { resolverUsuarioLocalId } from './mapeoRemoto';
import { asegurarPuntosLocales } from './puntos';
import { encolarSync } from './syncCola';
import { guardarCursor, leerCursor } from './syncEstado';
import { listarPromotores } from './usuarios';

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
  hora_inicio: string | null;
  hora_fin: string | null;
  meta_diaria: number | null;
}

const COLUMNAS_EVENTO = `ev.id, ev.empresa_id, e.nombre as empresa_nombre, ev.punto_id, p.nombre as punto_nombre,
   ev.fecha, ev.estado, ev.motivo_cancelacion, ev.serie_id, ev.hora_inicio, ev.hora_fin, ev.meta_diaria`;

interface PromotoresDeEvento {
  ids: string[];
  nombres: string[];
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
  }>(
    `SELECT ep.evento_id, ep.promotor_id, u.nombre as promotor_nombre
     FROM evento_promotores ep
     JOIN usuarios u ON u.id = ep.promotor_id
     WHERE ep.evento_id IN (${marcadores})
     ORDER BY u.nombre ASC`,
    eventoIds
  );
  for (const fila of filas) {
    const actual = mapa.get(fila.evento_id) ?? { ids: [], nombres: [] };
    actual.ids.push(fila.promotor_id);
    actual.nombres.push(fila.promotor_nombre);
    mapa.set(fila.evento_id, actual);
  }
  return mapa;
}

function vacioPromotoresDeEvento(): PromotoresDeEvento {
  return { ids: [], nombres: [] };
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
    horaInicio: fila.hora_inicio,
    horaFin: fila.hora_fin,
    metaDiaria: fila.meta_diaria,
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
      horaInicio: fila.hora_inicio,
      horaFin: fila.hora_fin,
      metaDiaria: fila.meta_diaria,
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

/**
 * Un promotor está en UN evento a la vez: no puede quedar en dos eventos del
 * mismo día cuyos horarios se crucen (sí en Falabella de 8 a 12 y en Éxito de
 * 14 a 18). Si su evento se cancela o lo cambian, se mueve o se retira
 * (`moverPromotorDeEvento` / `retirarPromotorDeEvento`).
 */
export class PromotorOcupadoError extends Error {
  constructor(promotorNombre: string, evento: Evento) {
    const horario = formatearRangoHoras(evento.horaInicio, evento.horaFin) ?? 'todo el día';
    super(
      `${promotorNombre} ya está en ${evento.empresaNombre} · ${evento.puntoNombre} el ${evento.fecha} ` +
        `(${horario}) y el horario se cruza. Muévelo o retíralo de ese evento primero.`
    );
    this.name = 'PromotorOcupadoError';
  }
}

interface HorarioBuscado {
  promotorIds: string[];
  fecha: string;
  horaInicio?: string | null;
  horaFin?: string | null;
  /** Eventos que no cuentan (el mismo que se edita, o del que se mueve al promotor). */
  excluirEventoIds?: string[];
}

/** El primer cruce de horario de alguno de `promotorIds` entre `eventos` (ya cargados), o `null`. */
function buscarCruce(eventos: Evento[], datos: HorarioBuscado): { promotorNombre: string; evento: Evento } | null {
  const horario = { horaInicio: datos.horaInicio ?? null, horaFin: datos.horaFin ?? null };
  for (const evento of eventos) {
    if (evento.fecha !== datos.fecha || evento.estado === 'CANCELADO') continue;
    if (datos.excluirEventoIds?.includes(evento.id)) continue;
    if (!horariosSeCruzan(evento, horario)) continue;
    const indice = evento.promotorIds.findIndex((id) => datos.promotorIds.includes(id));
    if (indice >= 0) return { promotorNombre: evento.promotorNombres[indice], evento };
  }
  return null;
}

async function verificarDisponibilidad(db: SQLiteDatabase, datos: HorarioBuscado): Promise<void> {
  if (datos.promotorIds.length === 0) return;
  const delDia = await listarEventosPorRango(db, { desde: datos.fecha, hasta: datos.fecha });
  const cruce = buscarCruce(delDia, datos);
  if (cruce) throw new PromotorOcupadoError(cruce.promotorNombre, cruce.evento);
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
  } & DetallesEvento,
  dispositivoId: string,
  sincronizar: boolean
): Promise<string> {
  const id = Crypto.randomUUID();
  const ahora = new Date().toISOString();

  await db.runAsync(
    `INSERT INTO eventos (id, empresa_id, punto_id, fecha, estado, motivo_cancelacion, serie_id, creado_por, ts_cliente, dispositivo_id,
                          hora_inicio, hora_fin, meta_diaria)
     VALUES (?, ?, ?, ?, 'PLANEADO', NULL, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      datos.empresaId,
      datos.puntoId,
      datos.fecha,
      datos.serieId ?? null,
      datos.creadoPor,
      ahora,
      dispositivoId,
      datos.horaInicio ?? null,
      datos.horaFin ?? null,
      datos.metaDiaria ?? null,
    ]
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
 * Horario y meta de un evento. El calendario exige horario al crear
 * (`horaInicio` < `horaFin`, "HH:MM"); la meta es opcional y es del EVENTO:
 * la comparten todos sus promotores (ver `Evento.metaDiaria`).
 */
export interface DetallesEvento {
  horaInicio?: string | null;
  horaFin?: string | null;
  metaDiaria?: Pesos | null;
}

/**
 * Crea un evento puntual (empresa + punto + fecha + horario) con uno o
 * varios promotores asignados y, opcionalmente, su meta del día.
 * `sincronizar: false` solo lo usa el seed de demo (src/db/seedDemo.ts),
 * para que sus eventos de prueba nunca suban.
 */
export async function crearEvento(
  db: SQLiteDatabase,
  datos: { empresaId: string; puntoId: string; fecha: string; promotorIds: string[]; creadoPor: string } & DetallesEvento,
  dispositivoId: string,
  opciones: { sincronizar?: boolean } = {}
): Promise<Evento> {
  verificarFechaNoPasada(datos.fecha);
  await verificarDisponibilidad(db, datos);
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
  } & DetallesEvento,
  dispositivoId: string
): Promise<Evento[]> {
  verificarFechaNoPasada(datos.fechaDesde);
  const ocurrencias = calcularOcurrencias(datos.frecuencia, datos.intervalo, datos.fechaDesde, datos.fechaHasta);
  // Una sola consulta para todo el rango; si alguna fecha se cruza, no se crea ninguna.
  const existentes = await listarEventosPorRango(db, { desde: datos.fechaDesde, hasta: datos.fechaHasta });
  for (const fecha of ocurrencias) {
    const cruce = buscarCruce(existentes, { ...datos, fecha });
    if (cruce) throw new PromotorOcupadoError(cruce.promotorNombre, cruce.evento);
  }
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
          horaInicio: datos.horaInicio,
          horaFin: datos.horaFin,
          metaDiaria: datos.metaDiaria,
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
  // Solo se revisan los que entran: quitar a alguien nunca se bloquea.
  await verificarDisponibilidad(db, {
    ...actual,
    promotorIds: datos.promotorIds.filter((id) => !actual.promotorIds.includes(id)),
    excluirEventoIds: [actual.id],
  });

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

function verificarEventoEditable(evento: Evento): void {
  verificarFechaNoPasada(evento.fecha);
  if (evento.estado === 'CANCELADO') throw new Error('Este evento está cancelado.');
}

/**
 * Agrega un promotor a un evento que ya existe — ej. su evento se canceló a
 * última hora y pasa a acompañar a otro promotor. Respeta la regla de un
 * evento a la vez (`PromotorOcupadoError`).
 */
export async function asignarPromotorAEvento(
  db: SQLiteDatabase,
  datos: { eventoId: string; promotorId: string },
  dispositivoId: string,
  adminId: string
): Promise<Evento> {
  const evento = await obtenerEvento(db, datos.eventoId);
  if (!evento) throw new Error('Este evento ya no existe.');
  verificarEventoEditable(evento);
  if (evento.promotorIds.includes(datos.promotorId)) return evento;
  await verificarDisponibilidad(db, { ...evento, promotorIds: [datos.promotorId], excluirEventoIds: [evento.id] });

  await db.withTransactionAsync(async () => {
    await db.runAsync('INSERT INTO evento_promotores (evento_id, promotor_id) VALUES (?, ?)', [
      evento.id,
      datos.promotorId,
    ]);
    await encolarEvento(db, evento.id);
    await registrarAccionAuditoria(
      db,
      {
        usuarioId: adminId,
        entidad: 'EVENTO',
        entidadId: evento.id,
        accion: 'ACTUALIZAR',
        detalles: { cambio: 'ASIGNAR_PROMOTOR', promotorId: datos.promotorId, fecha: evento.fecha },
      },
      dispositivoId
    );
  });
  return (await obtenerEvento(db, evento.id)) ?? evento;
}

/**
 * Retira a un promotor de un evento, con motivo obligatorio (queda en la
 * bitácora). Si era su único evento de hoy, desde ese momento NO puede vender
 * (`registrarVenta` exige evento): así el admin le quita la venta a alguien en
 * cualquier momento. Su celular se entera al sincronizar (Realtime, con red).
 */
export async function retirarPromotorDeEvento(
  db: SQLiteDatabase,
  datos: { eventoId: string; promotorId: string; motivo: string },
  dispositivoId: string,
  adminId: string
): Promise<void> {
  const motivo = datos.motivo.trim();
  if (!motivo) throw new Error('El motivo es obligatorio.');
  const evento = await obtenerEvento(db, datos.eventoId);
  if (!evento) throw new Error('Este evento ya no existe.');
  verificarEventoEditable(evento);

  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM evento_promotores WHERE evento_id = ? AND promotor_id = ?', [
      evento.id,
      datos.promotorId,
    ]);
    await encolarEvento(db, evento.id);
    await registrarAccionAuditoria(
      db,
      {
        usuarioId: adminId,
        entidad: 'EVENTO',
        entidadId: evento.id,
        accion: 'ACTUALIZAR',
        detalles: { cambio: 'RETIRAR_PROMOTOR', promotorId: datos.promotorId, motivo, fecha: evento.fecha },
      },
      dispositivoId
    );
  });
}

/**
 * Pasa a un promotor de un evento a otro que ya existe (con o sin otros
 * promotores), en una sola operación. Si el evento de origen está CANCELADO
 * se deja como estaba (es historia: quién iba a estar ahí); si no, sale de
 * él. Las ventas que ya hizo siguen en el punto donde las hizo.
 */
export async function moverPromotorDeEvento(
  db: SQLiteDatabase,
  datos: { promotorId: string; desdeEventoId: string; haciaEventoId: string },
  dispositivoId: string,
  adminId: string
): Promise<void> {
  if (datos.desdeEventoId === datos.haciaEventoId) return;
  const [desde, hacia] = await Promise.all([
    obtenerEvento(db, datos.desdeEventoId),
    obtenerEvento(db, datos.haciaEventoId),
  ]);
  if (!desde || !hacia) throw new Error('Este evento ya no existe.');
  verificarEventoEditable(hacia);
  await verificarDisponibilidad(db, {
    ...hacia,
    promotorIds: [datos.promotorId],
    excluirEventoIds: [desde.id, hacia.id],
  });

  await db.withTransactionAsync(async () => {
    if (desde.estado !== 'CANCELADO') {
      await db.runAsync('DELETE FROM evento_promotores WHERE evento_id = ? AND promotor_id = ?', [
        desde.id,
        datos.promotorId,
      ]);
      await encolarEvento(db, desde.id);
    }
    await db.runAsync('INSERT OR IGNORE INTO evento_promotores (evento_id, promotor_id) VALUES (?, ?)', [
      hacia.id,
      datos.promotorId,
    ]);
    await encolarEvento(db, hacia.id);
    await registrarAccionAuditoria(
      db,
      {
        usuarioId: adminId,
        entidad: 'EVENTO',
        entidadId: hacia.id,
        accion: 'ACTUALIZAR',
        detalles: {
          cambio: 'MOVER_PROMOTOR',
          promotorId: datos.promotorId,
          desde: `${desde.empresaNombre} · ${desde.puntoNombre}`,
          hacia: `${hacia.empresaNombre} · ${hacia.puntoNombre}`,
          fecha: hacia.fecha,
        },
      },
      dispositivoId
    );
  });
}

/** Un promotor y sus eventos de un día — "Promotores del día" en el calendario del admin. */
export interface PromotorDelDia {
  promotorId: string;
  promotorNombre: string;
  /** Sus eventos no cancelados de ese día, por hora de inicio. Vacío = ese día no puede vender. */
  eventos: Evento[];
  /** Quedó en dos eventos que se cruzan (datos de antes de la regla, o cambios desde dos dispositivos). */
  horariosCruzados: boolean;
}

/** Todos los promotores activos (y cualquiera asignado ese día) con sus eventos de `fecha`. */
export async function listarPromotoresDelDia(db: SQLiteDatabase, fecha: string): Promise<PromotorDelDia[]> {
  const [promotores, delDia] = await Promise.all([
    listarPromotores(db),
    listarEventosPorRango(db, { desde: fecha, hasta: fecha }),
  ]);
  const activos = delDia
    .filter((e) => e.estado !== 'CANCELADO')
    .sort((a, b) => (a.horaInicio ?? '').localeCompare(b.horaInicio ?? ''));

  const nombres = new Map(promotores.map((p) => [p.id, p.nombre]));
  for (const evento of activos) {
    evento.promotorIds.forEach((id, i) => {
      if (!nombres.has(id)) nombres.set(id, evento.promotorNombres[i]);
    });
  }

  return [...nombres.entries()]
    .map(([promotorId, promotorNombre]) => {
      const eventos = activos.filter((e) => e.promotorIds.includes(promotorId));
      const horariosCruzados = eventos.some((a, i) => eventos.slice(i + 1).some((b) => horariosSeCruzan(a, b)));
      return { promotorId, promotorNombre, eventos, horariosCruzados };
    })
    .sort((a, b) => a.promotorNombre.localeCompare(b.promotorNombre, 'es'));
}

/**
 * El evento vigente de un promotor: de sus eventos de HOY (Bogotá) sin
 * cancelar, el que está en curso a esta hora; si ninguno, el último que ya
 * empezó; si ninguno ha empezado, el primero (`elegirHorarioVigente`). Ahí
 * queda cada venta: lo vendido en Falabella de 8 a 12 es de Falabella, y lo
 * vendido después en Éxito, de Éxito. `null` = hoy no tiene evento y no
 * puede vender (`registrarVenta`).
 */
export async function obtenerPuntoVigentePromotor(
  db: SQLiteDatabase,
  promotorId: string,
  ahora: Date = new Date()
): Promise<Evento | null> {
  const filas = await db.getAllAsync<FilaEvento>(
    `SELECT ${COLUMNAS_EVENTO}
     FROM eventos ev
     JOIN empresas e ON e.id = ev.empresa_id
     JOIN puntos p ON p.id = ev.punto_id
     WHERE ev.fecha = ? AND ev.estado != 'CANCELADO'
       AND ev.id IN (SELECT evento_id FROM evento_promotores WHERE promotor_id = ?)
     ORDER BY ev.ts_cliente ASC`,
    [fechaHoyBogota(ahora), promotorId]
  );
  const vigente = elegirHorarioVigente(
    filas.map((fila) => ({ fila, horaInicio: fila.hora_inicio, horaFin: fila.hora_fin })),
    horaActualBogota(ahora)
  );
  return vigente ? aEvento(db, vigente.fila) : null;
}

/**
 * Fija (o borra, con `null`) la meta de venta del día del EVENTO — la
 * comparten todos sus promotores; independiente de la meta mensual
 * (src/db/metas.ts). "Editar" es volver a llamar esto, no hay historial de
 * cambios (mismo criterio que `establecerMeta`).
 */
export async function establecerMetaDiaria(
  db: SQLiteDatabase,
  datos: { eventoId: string; montoObjetivo: number | null }
): Promise<void> {
  await db.withTransactionAsync(async () => {
    await db.runAsync('UPDATE eventos SET meta_diaria = ? WHERE id = ?', [datos.montoObjetivo, datos.eventoId]);
    await encolarEvento(db, datos.eventoId);
  });
}

/** Corrige el horario de un evento que todavía no pasó ("HH:MM", inicio antes que fin). */
export async function actualizarHorarioEvento(
  db: SQLiteDatabase,
  datos: { eventoId: string; horaInicio: string; horaFin: string }
): Promise<void> {
  const actual = await obtenerEvento(db, datos.eventoId);
  if (!actual) throw new Error('Este evento ya no existe.');
  verificarFechaNoPasada(actual.fecha);
  if (datos.horaInicio >= datos.horaFin) throw new Error('La hora de fin debe ser después de la de inicio.');
  await verificarDisponibilidad(db, {
    promotorIds: actual.promotorIds,
    fecha: actual.fecha,
    horaInicio: datos.horaInicio,
    horaFin: datos.horaFin,
    excluirEventoIds: [actual.id],
  });
  await db.withTransactionAsync(async () => {
    await db.runAsync('UPDATE eventos SET hora_inicio = ?, hora_fin = ? WHERE id = ?', [
      datos.horaInicio,
      datos.horaFin,
      datos.eventoId,
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
  horaInicio: string | null;
  horaFin: string | null;
  metaDiaria: Pesos | null;
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
    hora_inicio: string | null;
    hora_fin: string | null;
    meta_diaria: number | null;
    ts_cliente: string;
  }>(
    `SELECT ev.id, ev.empresa_id, ev.punto_id, ev.fecha, ev.estado, ev.motivo_cancelacion, ev.serie_id,
            ev.creado_por, u.nombre as creado_por_nombre, ev.hora_inicio, ev.hora_fin, ev.meta_diaria, ev.ts_cliente
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
    })),
    horaInicio: fila.hora_inicio,
    horaFin: fila.hora_fin,
    metaDiaria: fila.meta_diaria,
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
  hora_inicio: string | null;
  hora_fin: string | null;
  meta_diaria: number | null;
  ts_cliente: string;
  dispositivo_id: string;
  subido_ts: string;
}

const SOLAPE_CURSOR_MS = 5000;
const TAMANO_PAGINA_EVENTOS = 500;

/** Estado local de un evento en una sola cadena, para saber si una descarga cambió algo. */
async function firmaEvento(db: SQLiteDatabase, eventoId: string): Promise<string> {
  const evento = await db.getFirstAsync<Record<string, unknown>>(
    'SELECT empresa_id, punto_id, fecha, estado, motivo_cancelacion, hora_inicio, hora_fin, meta_diaria FROM eventos WHERE id = ?',
    [eventoId]
  );
  const promotores = await db.getAllAsync<Record<string, unknown>>(
    'SELECT promotor_id FROM evento_promotores WHERE evento_id = ? ORDER BY promotor_id',
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
  const promotorIds = new Set<string>();
  for (const p of ev.promotores ?? []) {
    promotorIds.add(
      await resolverUsuarioLocalId(db, { id: p.promotor_id, nombre: p.promotor_nombre, rol: 'PROMOTOR' }, dispositivoId)
    );
  }
  // La serie es solo trazabilidad para el admin: no viaja, el evento baja sin ella.
  const serie = ev.serie_id
    ? await db.getFirstAsync<{ id: string }>('SELECT id FROM series_recurrencia WHERE id = ?', [ev.serie_id])
    : null;

  const antes = await firmaEvento(db, ev.id);
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `INSERT INTO eventos (id, empresa_id, punto_id, fecha, estado, motivo_cancelacion, serie_id, creado_por, ts_cliente, dispositivo_id,
                            hora_inicio, hora_fin, meta_diaria)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         empresa_id = excluded.empresa_id,
         punto_id = excluded.punto_id,
         fecha = excluded.fecha,
         estado = excluded.estado,
         motivo_cancelacion = excluded.motivo_cancelacion,
         hora_inicio = excluded.hora_inicio,
         hora_fin = excluded.hora_fin,
         meta_diaria = excluded.meta_diaria`,
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
        ev.hora_inicio,
        ev.hora_fin,
        ev.meta_diaria,
      ]
    );
    await db.runAsync('DELETE FROM evento_promotores WHERE evento_id = ?', [ev.id]);
    for (const promotorId of promotorIds) {
      await db.runAsync('INSERT INTO evento_promotores (evento_id, promotor_id) VALUES (?, ?)', [ev.id, promotorId]);
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
