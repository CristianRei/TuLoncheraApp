import type { SQLiteDatabase } from 'expo-sqlite';

/**
 * Qué admin tiene la sesión abierta en este dispositivo. Supabase solo acepta
 * cambios de personal y desbloqueos remotos firmados con el PIN de un admin
 * activo (migración remota 0018) — la cola de sync corre en segundo plano, sin
 * acceso a la sesión de React, así que la sesión deja aquí el id del admin y
 * la cola lee su PIN de la base local cuando lo necesita. Nunca se guarda el
 * PIN en memoria ni fuera de SQLite.
 */
let adminIdSesion: string | null = null;

export function establecerAdminDeSesion(adminId: string | null): void {
  adminIdSesion = adminId;
}

/** PIN (local) del admin con sesión abierta, o null si no hay admin en sesión. */
export async function obtenerPinAdminDeSesion(db: SQLiteDatabase): Promise<string | null> {
  if (!adminIdSesion) return null;
  const fila = await db.getFirstAsync<{ pin: string | null }>(
    "SELECT pin FROM usuarios WHERE id = ? AND rol = 'ADMIN' AND activo = 1",
    [adminIdSesion]
  );
  return fila?.pin ?? null;
}

export class SinAdminEnSesionError extends Error {
  constructor() {
    super('Hace falta que un administrador inicie sesión en este dispositivo para subir el cambio.');
    this.name = 'SinAdminEnSesionError';
  }
}

export class PinAdminNoRegistradoError extends Error {
  constructor() {
    super(
      'Supabase no reconoce el PIN de este administrador. Regístralo con registrar_admin en el SQL Editor (ver supabase/README.md).'
    );
    this.name = 'PinAdminNoRegistradoError';
  }
}
