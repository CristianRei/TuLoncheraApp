import * as Crypto from 'expo-crypto';
import type { SQLiteDatabase } from 'expo-sqlite';

import type { Promotor } from '@/core/tipos';

interface FilaPromotor {
  id: string;
  nombre: string;
  cedula: string | null;
  celular: string | null;
  direccion: string | null;
  pin: string | null;
  activo: number;
}

const COLUMNAS = 'id, nombre, cedula, celular, direccion, pin, activo';

function aPromotor(fila: FilaPromotor): Promotor {
  return {
    id: fila.id,
    nombre: fila.nombre,
    cedula: fila.cedula,
    celular: fila.celular,
    direccion: fila.direccion,
    pin: fila.pin,
    activo: fila.activo === 1,
  };
}

/** Los últimos 4 dígitos de la cédula (solo dígitos, se ignora cualquier espacio/guion escrito por error). */
export function pinDesdeCedula(cedula: string): string {
  return cedula.replace(/\D/g, '').slice(-4);
}

export class PinDuplicadoError extends Error {
  readonly pin: string;
  constructor(pin: string) {
    super(`El PIN ${pin} ya está en uso por otra persona. Escribe un PIN distinto para este promotor.`);
    this.name = 'PinDuplicadoError';
    this.pin = pin;
  }
}

async function pinEnUso(db: SQLiteDatabase, pin: string, excluirId?: string): Promise<boolean> {
  const fila = excluirId
    ? await db.getFirstAsync<{ id: string }>('SELECT id FROM usuarios WHERE pin = ? AND id != ?', [pin, excluirId])
    : await db.getFirstAsync<{ id: string }>('SELECT id FROM usuarios WHERE pin = ?', [pin]);
  return !!fila;
}

export async function listarPromotoresCompletos(
  db: SQLiteDatabase,
  opciones: { incluirInactivos?: boolean } = {}
): Promise<Promotor[]> {
  const condicion = opciones.incluirInactivos ? 'activo = 0' : 'activo = 1';
  const filas = await db.getAllAsync<FilaPromotor>(
    `SELECT ${COLUMNAS} FROM usuarios WHERE rol = 'PROMOTOR' AND ${condicion} ORDER BY nombre ASC`
  );
  return filas.map(aPromotor);
}

export async function obtenerPromotor(db: SQLiteDatabase, id: string): Promise<Promotor | null> {
  const fila = await db.getFirstAsync<FilaPromotor>(
    `SELECT ${COLUMNAS} FROM usuarios WHERE id = ? AND rol = 'PROMOTOR'`,
    [id]
  );
  return fila ? aPromotor(fila) : null;
}

export interface DatosPromotor {
  nombre: string;
  cedula: string;
  celular?: string | null;
  direccion?: string | null;
  /** Solo cuando el PIN autogenerado (últimos 4 de la cédula) ya está en uso — ver PinDuplicadoError. */
  pinManual?: string | null;
}

/**
 * El PIN nunca se pide directamente: se deriva de la cédula (últimos 4
 * dígitos), salvo que ese PIN ya esté en uso por alguien más (índice único
 * de PIN, migración 0003) — ahí sí se necesita `pinManual`.
 */
export async function crearPromotor(
  db: SQLiteDatabase,
  datos: DatosPromotor,
  dispositivoId: string
): Promise<Promotor> {
  const pin = datos.pinManual?.trim() || pinDesdeCedula(datos.cedula);
  if (await pinEnUso(db, pin)) throw new PinDuplicadoError(pin);

  const id = Crypto.randomUUID();
  await db.runAsync(
    `INSERT INTO usuarios (id, nombre, rol, activo, pin, cedula, celular, direccion, ts_cliente, dispositivo_id)
     VALUES (?, ?, 'PROMOTOR', 1, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      datos.nombre,
      pin,
      datos.cedula,
      datos.celular ?? null,
      datos.direccion ?? null,
      new Date().toISOString(),
      dispositivoId,
    ]
  );
  const creado = await obtenerPromotor(db, id);
  if (!creado) throw new Error('No se pudo crear el promotor');
  return creado;
}

export async function actualizarPromotor(
  db: SQLiteDatabase,
  id: string,
  cambios: {
    nombre?: string;
    cedula?: string;
    celular?: string | null;
    direccion?: string | null;
    pinManual?: string | null;
  }
): Promise<void> {
  const columnas: string[] = [];
  const valores: (string | null)[] = [];

  if (cambios.nombre !== undefined) {
    columnas.push('nombre = ?');
    valores.push(cambios.nombre);
  }
  if (cambios.celular !== undefined) {
    columnas.push('celular = ?');
    valores.push(cambios.celular);
  }
  if (cambios.direccion !== undefined) {
    columnas.push('direccion = ?');
    valores.push(cambios.direccion);
  }
  // La cédula y el PIN cambian juntos — nunca por separado, para que el PIN
  // mostrado en la ficha siempre coincida con la cédula real.
  if (cambios.cedula !== undefined) {
    const nuevoPin = cambios.pinManual?.trim() || pinDesdeCedula(cambios.cedula);
    if (await pinEnUso(db, nuevoPin, id)) throw new PinDuplicadoError(nuevoPin);
    columnas.push('cedula = ?', 'pin = ?');
    valores.push(cambios.cedula, nuevoPin);
  }

  if (columnas.length === 0) return;
  await db.runAsync(`UPDATE usuarios SET ${columnas.join(', ')} WHERE id = ?`, [...valores, id]);
}

/**
 * "Eliminar" un promotor nunca borra la fila: ya tiene ventas, movimientos,
 * turnos, cargues y conteos guardados con su ID — borrarlo de verdad dejaría
 * ese historial sin promotor. Se desactiva (mismo criterio que
 * productos.activo) y se libera el PIN (queda NULL) para que un futuro
 * empleado con la misma cédula al final no choque con el índice único de PIN.
 */
export async function eliminarPromotor(db: SQLiteDatabase, id: string): Promise<void> {
  await db.runAsync("UPDATE usuarios SET activo = 0, pin = NULL WHERE id = ? AND rol = 'PROMOTOR'", [id]);
}

export class PromotorConHistorialError extends Error {
  constructor() {
    super(
      'Este promotor ya tiene ventas, turnos, cargues u otro movimiento guardado — no se puede eliminar por completo sin perder ese historial. Solo se puede dejar dado de baja.'
    );
    this.name = 'PromotorConHistorialError';
  }
}

/**
 * Borra al promotor de verdad de la base — no `activo = 0`, un DELETE real.
 * Solo para un registro de prueba o un error de captura que nunca tuvo
 * actividad real; jamás para alguien que ya trabajó (usar `eliminarPromotor`
 * para ese caso). `PRAGMA foreign_keys = ON` (src/db/client.ts) es la red de
 * seguridad real: si el promotor tiene ventas, turnos, cargues, conteos,
 * eventos asignados o cualquier otra referencia real, el DELETE de
 * `usuarios` falla solo por la restricción de llave foránea, y ese fallo se
 * traduce aquí a un error claro en vez de dejar datos huérfanos.
 *
 * `metas` no tiene llave foránea hacia `usuarios` (es polimórfica: puede
 * apuntar a un promotor o a un punto) — por eso si el promotor tenía una
 * meta asignada, se borra a mano antes; si no se hiciera, quedaría una meta
 * huérfana apuntando a un id que ya no existe.
 */
export async function eliminarPromotorPermanente(db: SQLiteDatabase, id: string): Promise<void> {
  try {
    await db.withTransactionAsync(async () => {
      await db.runAsync("DELETE FROM metas WHERE tipo = 'PROMOTOR' AND entidad_id = ?", [id]);
      await db.runAsync("DELETE FROM ubicaciones WHERE tipo = 'PROMOTOR' AND responsable_id = ?", [id]);
      await db.runAsync("DELETE FROM usuarios WHERE id = ? AND rol = 'PROMOTOR'", [id]);
    });
  } catch (error) {
    if (error instanceof Error && /foreign\s*key|constraint/i.test(error.message)) {
      throw new PromotorConHistorialError();
    }
    throw error;
  }
}
