import type { SQLiteDatabase } from 'expo-sqlite';

import type { Migracion } from './index';

/**
 * Arqueo de caja: al cerrar turno, el promotor ve cuánto debería tener en
 * efectivo (teórico, calculado de sus ventas EFECTIVO) y cuenta a mano lo
 * que tiene — ver app/promotor/cierre-jornada.tsx. Una sola fila por turno
 * (índice único en turno_id, nunca se re-cuenta un turno ya cerrado).
 * `diferencia` es solo informativa — no es un movimiento de inventario,
 * R1/R2 no aplican al efectivo.
 */
export const migracion0024ArqueosCaja: Migracion = {
  version: 24,
  nombre: 'arqueos_caja',
  async up(db: SQLiteDatabase) {
    await db.execAsync(`
      CREATE TABLE arqueos_caja (
        id TEXT PRIMARY KEY NOT NULL,
        turno_id TEXT NOT NULL UNIQUE REFERENCES turnos(id),
        promotor_id TEXT NOT NULL REFERENCES usuarios(id),
        efectivo_teorico INTEGER NOT NULL,
        efectivo_contado INTEGER NOT NULL,
        diferencia INTEGER NOT NULL,
        total_transferencia INTEGER NOT NULL,
        total_libranza INTEGER NOT NULL,
        ts_cliente TEXT NOT NULL,
        dispositivo_id TEXT NOT NULL
      );
    `);
  },
};
