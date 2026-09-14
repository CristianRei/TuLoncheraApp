import { openDatabaseAsync, type SQLiteDatabase } from 'expo-sqlite';

const NOMBRE_DB = 'tulonchera.db';

let dbPromise: Promise<SQLiteDatabase> | null = null;

/**
 * Conexión SQLite compartida por toda la app. Siempre local — ver CLAUDE.md
 * regla R5 (la app debe funcionar sin conexión).
 */
export function getDb(): Promise<SQLiteDatabase> {
  if (!dbPromise) {
    dbPromise = openDatabaseAsync(NOMBRE_DB).then(async (db) => {
      await db.execAsync('PRAGMA journal_mode = WAL;');
      await db.execAsync('PRAGMA foreign_keys = ON;');
      return db;
    });
  }
  return dbPromise;
}
