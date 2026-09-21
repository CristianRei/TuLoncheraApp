import type { SQLiteDatabase } from 'expo-sqlite';

import type { Migracion } from './index';

/**
 * Dos controles operativos que el cliente ya hacía por fuera de la app:
 *
 * `ventas.comprobante_uri` (ALTER TABLE, mismo patrón que
 * `productos.marca`/`ventas.punto_id` en la 0011 — columna nullable, no
 * hace falta recrear la tabla): foto del comprobante de transferencia,
 * tomada al cobrar. Solo tiene valor cuando `metodo_pago = 'TRANSFERENCIA'`
 * — se valida en la UI/dominio, no en el esquema.
 *
 * `turnos`: check-in físico del promotor (selfie + hora + ubicación) al
 * empezar el día, independiente de `eventos` (que es planeación, no un
 * hecho físico). `hora_inicio`/`selfie_uri`/ubicación nunca se editan una
 * vez creadas — son el hecho de apertura. `hora_fin` sí recibe un UPDATE
 * al cerrar el turno (no es un movimiento de inventario, R1/R2 no
 * aplican, mismo criterio que `eventos.estado`).
 */
export const migracion0015ComprobantesYTurnos: Migracion = {
  version: 15,
  nombre: 'comprobantes_y_turnos',
  async up(db: SQLiteDatabase) {
    await db.execAsync(`
      ALTER TABLE ventas ADD COLUMN comprobante_uri TEXT;

      CREATE TABLE turnos (
        id TEXT PRIMARY KEY NOT NULL,
        promotor_id TEXT NOT NULL REFERENCES usuarios(id),
        selfie_uri TEXT NOT NULL,
        latitud REAL,
        longitud REAL,
        hora_inicio TEXT NOT NULL,
        hora_fin TEXT,
        ts_cliente TEXT NOT NULL,
        dispositivo_id TEXT NOT NULL
      );
      CREATE INDEX idx_turnos_promotor_hora ON turnos(promotor_id, hora_inicio);
    `);
  },
};
