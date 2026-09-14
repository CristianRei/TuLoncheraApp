import type { SQLiteDatabase } from 'expo-sqlite';

import type { Rol, UsuarioSesion } from '@/core/tipos';

/**
 * Busca un usuario activo por PIN, acotado a los roles permitidos por el
 * modo de login activo (ver src/core/auth).
 */
export async function buscarUsuarioPorPin(
  db: SQLiteDatabase,
  pin: string,
  rolesPermitidos: Rol[]
): Promise<UsuarioSesion | null> {
  const placeholders = rolesPermitidos.map(() => '?').join(', ');
  const fila = await db.getFirstAsync<UsuarioSesion>(
    `SELECT id, nombre, rol FROM usuarios WHERE pin = ? AND activo = 1 AND rol IN (${placeholders})`,
    [pin, ...rolesPermitidos]
  );
  return fila ?? null;
}

/** Promotores activos — para elegir a quién asignarle cargue. */
export async function listarPromotores(db: SQLiteDatabase): Promise<UsuarioSesion[]> {
  return db.getAllAsync<UsuarioSesion>(
    "SELECT id, nombre, rol FROM usuarios WHERE rol = 'PROMOTOR' AND activo = 1 ORDER BY nombre ASC"
  );
}
