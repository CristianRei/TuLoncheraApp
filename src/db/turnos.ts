import * as Crypto from 'expo-crypto';
import type { SQLiteDatabase } from 'expo-sqlite';

import { fechaHoyBogota } from '@/core/analitica';
import type { Turno } from '@/core/tipos';

interface FilaTurno {
  id: string;
  promotor_id: string;
  promotor_nombre: string;
  selfie_uri: string;
  latitud: number | null;
  longitud: number | null;
  hora_inicio: string;
  hora_fin: string | null;
}

const COLUMNAS_TURNO = `t.id, t.promotor_id, u.nombre as promotor_nombre, t.selfie_uri,
   t.latitud, t.longitud, t.hora_inicio, t.hora_fin`;

function aTurno(fila: FilaTurno): Turno {
  return {
    id: fila.id,
    promotorId: fila.promotor_id,
    promotorNombre: fila.promotor_nombre,
    selfieUri: fila.selfie_uri,
    latitud: fila.latitud,
    longitud: fila.longitud,
    horaInicio: fila.hora_inicio,
    horaFin: fila.hora_fin,
  };
}

/**
 * El turno abierto de hoy de un promotor (si existe). Un turno de un día
 * anterior que quedó sin `hora_fin` no cuenta — cada día exige un check-in
 * nuevo. "Hoy" usa el mismo corte de fecha Bogotá que el calendario de
 * eventos (`fechaHoyBogota`, `src/core/analitica`).
 */
export async function obtenerTurnoAbiertoHoy(
  db: SQLiteDatabase,
  promotorId: string
): Promise<Turno | null> {
  const hoy = fechaHoyBogota();
  const fila = await db.getFirstAsync<FilaTurno>(
    `SELECT ${COLUMNAS_TURNO}
     FROM turnos t
     JOIN usuarios u ON u.id = t.promotor_id
     WHERE t.promotor_id = ? AND t.hora_fin IS NULL AND date(t.hora_inicio) = date(?)
     ORDER BY t.hora_inicio DESC
     LIMIT 1`,
    [promotorId, hoy]
  );
  return fila ? aTurno(fila) : null;
}

/** Abre un turno nuevo: selfie + ubicación (nullable solo por si falla el GPS tras dar permiso) son el hecho de apertura, nunca se editan. */
export async function iniciarTurno(
  db: SQLiteDatabase,
  datos: { promotorId: string; selfieUri: string; latitud: number | null; longitud: number | null },
  dispositivoId: string
): Promise<Turno> {
  const id = Crypto.randomUUID();
  const ahora = new Date().toISOString();

  await db.runAsync(
    `INSERT INTO turnos (id, promotor_id, selfie_uri, latitud, longitud, hora_inicio, hora_fin, ts_cliente, dispositivo_id)
     VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?)`,
    [id, datos.promotorId, datos.selfieUri, datos.latitud, datos.longitud, ahora, ahora, dispositivoId]
  );

  const fila = await db.getFirstAsync<FilaTurno>(
    `SELECT ${COLUMNAS_TURNO} FROM turnos t JOIN usuarios u ON u.id = t.promotor_id WHERE t.id = ?`,
    [id]
  );
  if (!fila) throw new Error('No se pudo iniciar el turno');
  return aTurno(fila);
}

/** Cierra un turno abierto marcando `hora_fin` — no es un movimiento de inventario, R1/R2 no aplican. */
export async function finalizarTurno(db: SQLiteDatabase, datos: { turnoId: string }): Promise<void> {
  await db.runAsync('UPDATE turnos SET hora_fin = ? WHERE id = ? AND hora_fin IS NULL', [
    new Date().toISOString(),
    datos.turnoId,
  ]);
}

/** Todos los turnos, más reciente primero — para el panel de admin. */
export async function listarTurnos(
  db: SQLiteDatabase,
  opciones: { promotorId?: string } = {}
): Promise<Turno[]> {
  const condicion = opciones.promotorId ? 'WHERE t.promotor_id = ?' : '';
  const parametros = opciones.promotorId ? [opciones.promotorId] : [];
  const filas = await db.getAllAsync<FilaTurno>(
    `SELECT ${COLUMNAS_TURNO}
     FROM turnos t
     JOIN usuarios u ON u.id = t.promotor_id
     ${condicion}
     ORDER BY t.hora_inicio DESC`,
    parametros
  );
  return filas.map(aTurno);
}

export async function obtenerTurno(db: SQLiteDatabase, id: string): Promise<Turno | null> {
  const fila = await db.getFirstAsync<FilaTurno>(
    `SELECT ${COLUMNAS_TURNO} FROM turnos t JOIN usuarios u ON u.id = t.promotor_id WHERE t.id = ?`,
    [id]
  );
  return fila ? aTurno(fila) : null;
}
