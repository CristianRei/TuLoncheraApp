import type { SQLiteDatabase } from 'expo-sqlite';

import type { Migracion } from './index';

/**
 * Corrige un bug crítico de las rebanadas de sincronización posteriores a la
 * 0016: `_sync_pendiente.tabla` nació con `CHECK (tabla IN ('turnos',
 * 'comprobantes_venta'))` y nunca se relajó cuando la cola empezó a aceptar
 * ventas, movimientos, lotes, cargues, conteos, arqueos, usuarios, productos
 * y categorías — cualquier `encolarSync` de esas tablas fallaba con "CHECK
 * constraint failed", y como se ejecuta dentro de la misma transacción que
 * crea la entidad, hacía fallar también la venta/conteo/cargue completo.
 *
 * SQLite no permite quitar un CHECK con ALTER TABLE, así que se recrea la
 * tabla (copiando las tareas que ya existan) sin esa restricción — la lista
 * de tablas válidas ya la controla el tipo `TablaSync` de TypeScript
 * (src/db/syncCola.ts), no vale la pena duplicarla en SQL y tener que
 * migrarla cada vez que se sincroniza una tabla nueva. `tipo_tarea` sí
 * conserva su CHECK: ese conjunto (FILA/FOTO) no crece.
 */
export const migracion0025ColaSyncTodasLasTablas: Migracion = {
  version: 25,
  nombre: 'cola_sync_todas_las_tablas',
  async up(db: SQLiteDatabase) {
    await db.execAsync(`
      CREATE TABLE _sync_pendiente_nueva (
        id TEXT PRIMARY KEY NOT NULL,
        tabla TEXT NOT NULL,
        entidad_id TEXT NOT NULL,
        tipo_tarea TEXT NOT NULL CHECK (tipo_tarea IN ('FILA', 'FOTO')),
        intentos INTEGER NOT NULL DEFAULT 0,
        ultimo_error TEXT,
        creado_ts TEXT NOT NULL,
        completado_ts TEXT
      );

      INSERT INTO _sync_pendiente_nueva
        (id, tabla, entidad_id, tipo_tarea, intentos, ultimo_error, creado_ts, completado_ts)
      SELECT id, tabla, entidad_id, tipo_tarea, intentos, ultimo_error, creado_ts, completado_ts
      FROM _sync_pendiente;

      DROP TABLE _sync_pendiente;
      ALTER TABLE _sync_pendiente_nueva RENAME TO _sync_pendiente;

      CREATE INDEX idx_sync_pendiente_estado
        ON _sync_pendiente(tabla, entidad_id, tipo_tarea) WHERE completado_ts IS NULL;
    `);
  },
};
