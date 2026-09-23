import type { SQLiteDatabase } from 'expo-sqlite';

import { mensajeDeError } from '@/core/errores';
import { pinDesdeDescarga } from '@/core/pin';
import type { Rol, UsuarioSesion } from '@/core/tipos';
import { getSupabaseClient } from '@/sync/supabaseClient';

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

interface FilaUsuarioRemoto {
  id: string;
  nombre: string;
  rol: Rol;
  activo: boolean;
  cedula: string | null;
  celular: string | null;
  direccion: string | null;
  pin: string | null;
  ts_cliente: string;
  dispositivo_id: string;
}

/**
 * Trae de Supabase el personal creado/editado desde el dispositivo de admin
 * (contratar, cambiar de rol, dar de baja) y lo guarda en la base local —
 * ver CLAUDE.md sección 11 ("bloquea contratar personal nuevo en
 * producción"). Solo debe llamarse desde dispositivos de Promotor/Bodega
 * (nunca desde el de admin: ese ya es la fuente de verdad de esta tabla,
 * descargarla ahí podría pisar una edición local recién hecha que todavía no
 * subió). Pull completo (tabla chica, un puñado de empleados) con upsert por
 * id — nunca bloquea nada más si falla (sin red, por ejemplo).
 */
export async function descargarUsuariosNuevos(db: SQLiteDatabase): Promise<void> {
  try {
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase
      .from('usuarios')
      .select('id, nombre, rol, activo, cedula, celular, direccion, pin, ts_cliente, dispositivo_id')
      .returns<FilaUsuarioRemoto[]>();
    if (error) throw error;

    for (const fila of data) {
      // Cada fila en su propio try/catch: el índice único de PIN puede chocar
      // (ej. usuarios de prueba de `__DEV__`, creados por separado con ids
      // distintos en cada dispositivo) y una fila así no debe impedir que el
      // resto del personal se aplique.
      try {
        const pinLocal = pinDesdeDescarga(fila.rol, fila.cedula, fila.pin);
        await db.runAsync(
          `INSERT INTO usuarios (id, nombre, rol, activo, pin, cedula, celular, direccion, ts_cliente, dispositivo_id)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET
             nombre = excluded.nombre,
             rol = excluded.rol,
             activo = excluded.activo,
             pin = excluded.pin,
             cedula = excluded.cedula,
             celular = excluded.celular,
             direccion = excluded.direccion,
             ts_cliente = excluded.ts_cliente,
             dispositivo_id = excluded.dispositivo_id`,
          [
            fila.id,
            fila.nombre,
            fila.rol,
            fila.activo ? 1 : 0,
            pinLocal,
            fila.cedula,
            fila.celular,
            fila.direccion,
            fila.ts_cliente,
            fila.dispositivo_id,
          ]
        );
      } catch (errorFila) {
        console.log(`[usuarios] no se pudo aplicar "${fila.nombre}":`, mensajeDeError(errorFila));
      }
    }
  } catch (error) {
    console.log('[usuarios] no se pudo descargar personal nuevo:', mensajeDeError(error));
  }
}

/** Promotores activos — para elegir a quién asignarle cargue. */
export async function listarPromotores(db: SQLiteDatabase): Promise<UsuarioSesion[]> {
  return db.getAllAsync<UsuarioSesion>(
    "SELECT id, nombre, rol FROM usuarios WHERE rol = 'PROMOTOR' AND activo = 1 ORDER BY nombre ASC"
  );
}
