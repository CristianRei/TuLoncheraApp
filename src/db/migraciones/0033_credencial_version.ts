import type { SQLiteDatabase } from 'expo-sqlite';

import type { Migracion } from './index';

/**
 * `usuarios.credencial_version`: la versión del PIN de cada persona según
 * Supabase (migración remota 0018). El PIN ya no viaja por la red — un
 * celular solo lo conoce porque alguien lo tecleó ahí y el servidor lo
 * verificó. Si admin cambia el PIN de alguien, la versión remota sube y este
 * celular olvida el PIN viejo (ver `descargarUsuariosNuevos`). NULL = nunca
 * se ha visto la versión remota de esa persona.
 */
export const migracion0033CredencialVersion: Migracion = {
  version: 33,
  nombre: 'credencial_version',
  async up(db: SQLiteDatabase) {
    await db.execAsync('ALTER TABLE usuarios ADD COLUMN credencial_version INTEGER;');
  },
};
