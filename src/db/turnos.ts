import * as Crypto from 'expo-crypto';
import type { SQLiteDatabase } from 'expo-sqlite';

import { fechaBogota, fechaHoyBogota } from '@/core/analitica';
import type { Evento, Turno } from '@/core/tipos';

import { obtenerPuntoVigentePromotor } from './eventos';
import { encolarSync } from './syncCola';
import { obtenerTurnoAbiertoHoyRemoto } from './turnosRemotos';

/**
 * El evento del calendario asignado a un promotor hoy (si existe) — solo
 * informativo, nunca bloquea iniciar turno (decisión explícita: el
 * calendario y el turno son sistemas independientes que se cruzan, no se
 * exigen entre sí). Delega directo a `obtenerPuntoVigentePromotor`
 * (src/db/eventos.ts), que ya resuelve "evento de hoy, sin cancelar" por
 * fecha — no se duplica esa lógica aquí.
 */
export async function obtenerEventoDeHoyPromotor(
  db: SQLiteDatabase,
  promotorId: string
): Promise<Evento | null> {
  return obtenerPuntoVigentePromotor(db, promotorId);
}

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
  // `hora_inicio` se guarda en UTC — comparar con SQLite date() compararía
  // contra el día UTC, no el día Bogotá, y da falsos negativos entre las
  // 7pm y medianoche Bogotá (UTC ya es el día siguiente). Se filtra en JS
  // con el mismo corte de fecha que usa el calendario de eventos.
  const hoy = fechaHoyBogota();
  const filas = await db.getAllAsync<FilaTurno>(
    `SELECT ${COLUMNAS_TURNO}
     FROM turnos t
     JOIN usuarios u ON u.id = t.promotor_id
     WHERE t.promotor_id = ? AND t.hora_fin IS NULL
     ORDER BY t.hora_inicio DESC`,
    [promotorId]
  );
  const deHoy = filas.find((fila) => fechaBogota(fila.hora_inicio) === hoy);
  return deHoy ? aTurno(deHoy) : null;
}

/**
 * Abre un turno nuevo: selfie + ubicación (nullable solo por si falla el GPS
 * tras dar permiso) son el hecho de apertura, nunca se editan.
 *
 * Nunca abre un SEGUNDO turno el mismo día para el mismo promotor — no
 * tiene sentido tener dos turnos en curso a la vez. Como `turnos` solo
 * sincroniza en dirección de subida (nunca se descarga hacia el propio
 * promotor, ver CLAUDE.md), un promotor que hace check-in desde OTRO
 * dispositivo el mismo día no tiene forma de saber localmente que ya abrió
 * turno — hay que preguntarle a Supabase. Si ya existe uno (local o
 * remoto), se reutiliza tal cual: la selfie/GPS recién tomados en este
 * intento se descartan en silencio, SIN ningún mensaje de error o bloqueo
 * (decisión explícita: el promotor nunca debe verse frenado por esto,
 * simplemente sigue directo a vender). Si el turno existente es remoto, se
 * inserta localmente con el MISMO id (nunca uno nuevo, evita duplicar
 * también en Supabase) para que el resto del flujo del promotor (que
 * siempre relee `obtenerTurnoAbiertoHoy` LOCAL como gate — ver
 * app/promotor/index.tsx, ventas.ts, cargues.ts) encuentre una fila.
 */
export async function iniciarTurno(
  db: SQLiteDatabase,
  datos: { promotorId: string; selfieUri: string; latitud: number | null; longitud: number | null },
  dispositivoId: string
): Promise<Turno> {
  const local = await obtenerTurnoAbiertoHoy(db, datos.promotorId);
  if (local) return local;

  const remoto = await obtenerTurnoAbiertoHoyRemoto(datos.promotorId);
  if (remoto) {
    await db.runAsync(
      `INSERT INTO turnos (id, promotor_id, selfie_uri, latitud, longitud, hora_inicio, hora_fin, ts_cliente, dispositivo_id)
       VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?)
       ON CONFLICT(id) DO NOTHING`,
      [
        remoto.id,
        datos.promotorId,
        remoto.selfieUri,
        remoto.latitud,
        remoto.longitud,
        remoto.horaInicio,
        remoto.horaInicio,
        dispositivoId,
      ]
    );
    const filaRemota = await db.getFirstAsync<FilaTurno>(
      `SELECT ${COLUMNAS_TURNO} FROM turnos t JOIN usuarios u ON u.id = t.promotor_id WHERE t.id = ?`,
      [remoto.id]
    );
    if (filaRemota) return aTurno(filaRemota);
    // No debería pasar (se acaba de insertar), pero si el INSERT chocó con
    // algo raro, se sigue al camino normal en vez de fallar el check-in.
  }

  const id = Crypto.randomUUID();
  const ahora = new Date().toISOString();

  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `INSERT INTO turnos (id, promotor_id, selfie_uri, latitud, longitud, hora_inicio, hora_fin, ts_cliente, dispositivo_id)
       VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?)`,
      [id, datos.promotorId, datos.selfieUri, datos.latitud, datos.longitud, ahora, ahora, dispositivoId]
    );
    await encolarSync(db, { tabla: 'turnos', entidadId: id, tipoTarea: 'FILA' });
    await encolarSync(db, { tabla: 'turnos', entidadId: id, tipoTarea: 'FOTO' });
  });

  const fila = await db.getFirstAsync<FilaTurno>(
    `SELECT ${COLUMNAS_TURNO} FROM turnos t JOIN usuarios u ON u.id = t.promotor_id WHERE t.id = ?`,
    [id]
  );
  if (!fila) throw new Error('No se pudo iniciar el turno');
  return aTurno(fila);
}

/** Cierra un turno abierto marcando `hora_fin` — no es un movimiento de inventario, R1/R2 no aplican. */
export async function finalizarTurno(db: SQLiteDatabase, datos: { turnoId: string }): Promise<void> {
  await db.withTransactionAsync(async () => {
    await db.runAsync('UPDATE turnos SET hora_fin = ? WHERE id = ? AND hora_fin IS NULL', [
      new Date().toISOString(),
      datos.turnoId,
    ]);
    // El motor de sync hace upsert de la fila completa por cada tarea FILA
    // pendiente — una nueva tarea aquí sube el hora_fin actualizado. La
    // política RLS remota solo permite tocar esa columna en un UPDATE.
    await encolarSync(db, { tabla: 'turnos', entidadId: datos.turnoId, tipoTarea: 'FILA' });
  });
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
