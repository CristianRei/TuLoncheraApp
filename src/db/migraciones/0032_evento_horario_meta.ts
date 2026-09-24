import type { SQLiteDatabase } from 'expo-sqlite';

import type { Migracion } from './index';

/**
 * Horario del evento y meta diaria POR EVENTO.
 *
 * - `hora_inicio`/`hora_fin` ("HH:MM", hora de Colombia): a qué hora le toca
 *   al promotor. Obligatorio al crear un evento desde el calendario; NULL en
 *   los eventos creados antes de esta migración.
 * - `meta_diaria` pasa de `evento_promotores` (una por promotor, migración
 *   0023) a `eventos`: la meta es del EQUIPO del evento — si es de
 *   $ 1.000.000 y entre los dos promotores venden $ 500.000, los dos van en
 *   50 % (decisión del negocio, 2026-09-24). Se toma la mayor de las metas
 *   que ya existían en el evento: quien puso una meta a cada promotor puso
 *   la misma. `evento_promotores.meta_diaria` queda sin uso (siempre se
 *   ignora), igual que `productos.categoria` tras la 0020.
 */
export const migracion0032EventoHorarioMeta: Migracion = {
  version: 32,
  nombre: 'evento_horario_meta',
  async up(db: SQLiteDatabase) {
    await db.execAsync(`
      ALTER TABLE eventos ADD COLUMN hora_inicio TEXT;
      ALTER TABLE eventos ADD COLUMN hora_fin TEXT;
      ALTER TABLE eventos ADD COLUMN meta_diaria INTEGER;
      UPDATE eventos SET meta_diaria = (
        SELECT MAX(ep.meta_diaria) FROM evento_promotores ep WHERE ep.evento_id = eventos.id
      );
    `);
  },
};
