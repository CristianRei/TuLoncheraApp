import type { SQLiteDatabase } from 'expo-sqlite';

import { migracion0001EsquemaInicial } from './0001_esquema_inicial';
import { migracion0002IdentidadDispositivo } from './0002_identidad_dispositivo';
import { migracion0003PinUnico } from './0003_pin_unico';
import { migracion0004CatalogoEditable } from './0004_catalogo_editable';
import { migracion0005CargaCatalogoInicial } from './0005_carga_catalogo_inicial';

export interface Migracion {
  version: number;
  nombre: string;
  up: (db: SQLiteDatabase) => Promise<void>;
}

// Nuevas migraciones se agregan aquí, en orden. Nunca editar una ya aplicada
// en producción — ver CLAUDE.md sección 8 ("toda evolución pasa por archivos
// de migración versionados").
const migraciones: Migracion[] = [
  migracion0001EsquemaInicial,
  migracion0002IdentidadDispositivo,
  migracion0003PinUnico,
  migracion0004CatalogoEditable,
  migracion0005CargaCatalogoInicial,
];

/**
 * Aplica las migraciones pendientes, en orden, dentro de una transacción cada
 * una. Se corre al arrancar la app (CLAUDE.md sección 8).
 */
export async function aplicarMigracionesPendientes(db: SQLiteDatabase): Promise<void> {
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS _migraciones (
      version INTEGER PRIMARY KEY NOT NULL,
      nombre TEXT NOT NULL,
      aplicado_ts TEXT NOT NULL
    );
  `);

  const aplicadas = await db.getAllAsync<{ version: number }>(
    'SELECT version FROM _migraciones'
  );
  const versionesAplicadas = new Set(aplicadas.map((fila) => fila.version));

  const pendientes = migraciones
    .filter((m) => !versionesAplicadas.has(m.version))
    .sort((a, b) => a.version - b.version);

  for (const migracion of pendientes) {
    await db.withTransactionAsync(async () => {
      await migracion.up(db);
      await db.runAsync(
        'INSERT INTO _migraciones (version, nombre, aplicado_ts) VALUES (?, ?, ?)',
        [migracion.version, migracion.nombre, new Date().toISOString()]
      );
    });
  }
}
