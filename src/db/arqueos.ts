import * as Crypto from 'expo-crypto';
import type { SQLiteDatabase } from 'expo-sqlite';

import type { ArqueoCaja, Pesos } from '@/core/tipos';

import { encolarSync } from './syncCola';

interface FilaArqueo {
  id: string;
  turno_id: string;
  promotor_id: string;
  promotor_nombre: string;
  efectivo_teorico: number;
  efectivo_contado: number;
  diferencia: number;
  total_transferencia: number;
  total_libranza: number;
  ts_cliente: string;
}

const COLUMNAS_ARQUEO = `a.id, a.turno_id, a.promotor_id, u.nombre as promotor_nombre,
   a.efectivo_teorico, a.efectivo_contado, a.diferencia,
   a.total_transferencia, a.total_libranza, a.ts_cliente`;

function aArqueo(fila: FilaArqueo): ArqueoCaja {
  return {
    id: fila.id,
    turnoId: fila.turno_id,
    promotorId: fila.promotor_id,
    promotorNombre: fila.promotor_nombre,
    efectivoTeorico: fila.efectivo_teorico,
    efectivoContado: fila.efectivo_contado,
    diferencia: fila.diferencia,
    totalTransferencia: fila.total_transferencia,
    totalLibranza: fila.total_libranza,
    tsCliente: fila.ts_cliente,
  };
}

/**
 * Registra el arqueo de caja al cerrar turno — una sola vez por turno
 * (índice único en `turno_id`, migración 0024). `diferencia` se calcula
 * aquí, no se recibe: es siempre `efectivoContado - efectivoTeorico`.
 */
export async function registrarArqueoCaja(
  db: SQLiteDatabase,
  datos: {
    turnoId: string;
    promotorId: string;
    efectivoTeorico: Pesos;
    efectivoContado: Pesos;
    totalTransferencia: Pesos;
    totalLibranza: Pesos;
  },
  dispositivoId: string
): Promise<ArqueoCaja> {
  const id = Crypto.randomUUID();
  const ahora = new Date().toISOString();
  const diferencia = datos.efectivoContado - datos.efectivoTeorico;

  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `INSERT INTO arqueos_caja (
         id, turno_id, promotor_id, efectivo_teorico, efectivo_contado, diferencia,
         total_transferencia, total_libranza, ts_cliente, dispositivo_id
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        datos.turnoId,
        datos.promotorId,
        datos.efectivoTeorico,
        datos.efectivoContado,
        diferencia,
        datos.totalTransferencia,
        datos.totalLibranza,
        ahora,
        dispositivoId,
      ]
    );
    await encolarSync(db, { tabla: 'arqueos_caja', entidadId: id, tipoTarea: 'FILA' });
  });

  const creado = await obtenerArqueoPorTurno(db, datos.turnoId);
  if (!creado) throw new Error('No se pudo registrar el arqueo de caja');
  return creado;
}

export async function obtenerArqueoPorTurno(db: SQLiteDatabase, turnoId: string): Promise<ArqueoCaja | null> {
  const fila = await db.getFirstAsync<FilaArqueo>(
    `SELECT ${COLUMNAS_ARQUEO} FROM arqueos_caja a JOIN usuarios u ON u.id = a.promotor_id WHERE a.turno_id = ?`,
    [turnoId]
  );
  return fila ? aArqueo(fila) : null;
}

/** Por id propio del arqueo (no el turno) — usado por el motor de sync (src/sync/motor.ts). */
export async function obtenerArqueoPorId(db: SQLiteDatabase, id: string): Promise<ArqueoCaja | null> {
  const fila = await db.getFirstAsync<FilaArqueo>(
    `SELECT ${COLUMNAS_ARQUEO} FROM arqueos_caja a JOIN usuarios u ON u.id = a.promotor_id WHERE a.id = ?`,
    [id]
  );
  return fila ? aArqueo(fila) : null;
}
