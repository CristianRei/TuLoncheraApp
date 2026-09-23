import type { SQLiteDatabase } from 'expo-sqlite';

/** Último `subido_ts` ya descargado para `clave` (ej. 'ventas'), o `null` si nunca se ha descargado. */
export async function leerCursor(db: SQLiteDatabase, clave: string): Promise<string | null> {
  const fila = await db.getFirstAsync<{ valor: string }>('SELECT valor FROM _sync_estado WHERE clave = ?', [clave]);
  return fila?.valor ?? null;
}

export async function guardarCursor(db: SQLiteDatabase, clave: string, valor: string): Promise<void> {
  await db.runAsync(
    `INSERT INTO _sync_estado (clave, valor) VALUES (?, ?)
     ON CONFLICT(clave) DO UPDATE SET valor = excluded.valor`,
    [clave, valor]
  );
}
