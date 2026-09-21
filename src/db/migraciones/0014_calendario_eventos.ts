import type { SQLiteDatabase } from 'expo-sqlite';

import type { Migracion } from './index';

/**
 * `eventos` cambia de significado: de "asignación vigente sin fecha" (0011)
 * a jornada real con fecha planeada — el calendario que el admin arma y el
 * promotor consulta. Se recrea sin migrar filas: la tabla solo tenía
 * asignaciones "vigentes" sin fecha real, sin equivalente sensato en el
 * modelo nuevo (mismo criterio que `conteos` en la 0010, la app no ha
 * salido de desarrollo).
 *
 * `evento_promotores` reemplaza la columna `promotor_id` directa — un
 * evento puede tener varios promotores. `series_recurrencia` es solo
 * trazabilidad (`eventos.serie_id`): generar una serie crea N eventos
 * independientes de una vez, nunca se edita en cascada.
 */
export const migracion0014CalendarioEventos: Migracion = {
  version: 14,
  nombre: 'calendario_eventos',
  async up(db: SQLiteDatabase) {
    await db.execAsync(`
      CREATE TABLE series_recurrencia (
        id TEXT PRIMARY KEY NOT NULL,
        frecuencia TEXT NOT NULL CHECK (frecuencia IN ('DIAS', 'SEMANAS', 'MESES', 'ANIOS')),
        intervalo INTEGER NOT NULL,
        fecha_desde TEXT NOT NULL,
        fecha_hasta TEXT NOT NULL,
        ts_cliente TEXT NOT NULL,
        dispositivo_id TEXT NOT NULL
      );

      DROP TABLE eventos;

      CREATE TABLE eventos (
        id TEXT PRIMARY KEY NOT NULL,
        empresa_id TEXT NOT NULL REFERENCES empresas(id),
        punto_id TEXT NOT NULL REFERENCES puntos(id),
        fecha TEXT NOT NULL,
        estado TEXT NOT NULL CHECK (estado IN ('PLANEADO', 'EN_CURSO', 'CERRADO', 'CANCELADO')),
        motivo_cancelacion TEXT,
        serie_id TEXT REFERENCES series_recurrencia(id),
        creado_por TEXT NOT NULL REFERENCES usuarios(id),
        ts_cliente TEXT NOT NULL,
        dispositivo_id TEXT NOT NULL
      );
      CREATE INDEX idx_eventos_fecha ON eventos(fecha);

      CREATE TABLE evento_promotores (
        evento_id TEXT NOT NULL REFERENCES eventos(id),
        promotor_id TEXT NOT NULL REFERENCES usuarios(id),
        PRIMARY KEY (evento_id, promotor_id)
      );
      CREATE INDEX idx_evento_promotores_promotor ON evento_promotores(promotor_id);
    `);
  },
};
