import type { SQLiteDatabase } from 'expo-sqlite';

import { mensajeDeError } from '@/core/errores';
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
  credencial_version: number;
  ts_cliente: string;
  dispositivo_id: string;
}

/**
 * Trae de Supabase el personal (id, nombre, rol, activo) creado/editado desde
 * el dispositivo de admin y lo guarda en la base local. Solo desde
 * Promotor/Bodega — nunca en el dispositivo de admin, que ya es la fuente de
 * verdad de esta tabla.
 *
 * El PIN y los datos personales NO viajan (supabase/migraciones/0018): este
 * celular conoce el PIN de alguien solo si esa persona ya entró aquí y el
 * servidor lo verificó (`verificarPinEnServidor`). Si admin le cambió el PIN
 * (sube `credencial_version`), aquí se olvida el viejo y la próxima entrada
 * vuelve a verificarse en el servidor. Dar de baja (`activo = 0`) también
 * libera el PIN local.
 */
export async function descargarUsuariosNuevos(db: SQLiteDatabase): Promise<void> {
  try {
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase
      .from('usuarios')
      .select('id, nombre, rol, activo, credencial_version, ts_cliente, dispositivo_id')
      .returns<FilaUsuarioRemoto[]>();
    if (error) throw error;

    for (const fila of data) {
      try {
        await db.runAsync(
          `INSERT INTO usuarios (id, nombre, rol, activo, pin, credencial_version, ts_cliente, dispositivo_id)
           VALUES (?, ?, ?, ?, NULL, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET
             nombre = excluded.nombre,
             rol = excluded.rol,
             activo = excluded.activo,
             pin = CASE
               WHEN excluded.activo = 0 THEN NULL
               WHEN usuarios.credencial_version IS NOT NULL
                    AND usuarios.credencial_version <> excluded.credencial_version THEN NULL
               ELSE usuarios.pin
             END,
             credencial_version = excluded.credencial_version,
             ts_cliente = excluded.ts_cliente,
             dispositivo_id = excluded.dispositivo_id`,
          [fila.id, fila.nombre, fila.rol, fila.activo ? 1 : 0, fila.credencial_version, fila.ts_cliente, fila.dispositivo_id]
        );
      } catch (errorFila) {
        console.log(`[usuarios] no se pudo aplicar "${fila.nombre}":`, mensajeDeError(errorFila));
      }
    }
  } catch (error) {
    console.log('[usuarios] no se pudo descargar personal nuevo:', mensajeDeError(error));
  }
}

export type ResultadoVerificacionPin =
  | { tipo: 'OK'; usuario: UsuarioSesion }
  | { tipo: 'NO_ENCONTRADO' }
  | { tipo: 'DEMASIADOS_INTENTOS' }
  | { tipo: 'SIN_CONEXION' };


/**
 * Login con un PIN que este celular no conoce: se lo pregunta a Supabase
 * (`verificar_pin`, con límite de intentos en el servidor). Si el servidor lo
 * reconoce, la persona queda guardada aquí CON ese PIN — desde ahí puede
 * entrar sin conexión en este celular (R5). Si otra fila local tenía ese
 * mismo PIN (ej. un usuario de prueba de `__DEV__`), pierde el PIN: el
 * servidor manda.
 */
export async function verificarPinEnServidor(
  db: SQLiteDatabase,
  pin: string,
  rolesPermitidos: Rol[],
  limiteMs = 8000
): Promise<ResultadoVerificacionPin> {
  let respuesta: { data: FilaUsuarioRemoto[] | null; error: { message?: string } | null };
  try {
    const supabase = await getSupabaseClient();
    const consulta = supabase.rpc('verificar_pin', { p_pin: pin, p_roles: rolesPermitidos });
    const tiempo = new Promise<never>((_, rechazar) =>
      setTimeout(() => rechazar(new Error('tiempo de espera agotado')), limiteMs)
    );
    respuesta = (await Promise.race([consulta, tiempo])) as typeof respuesta;
  } catch (error) {
    console.log('[usuarios] no se pudo verificar el PIN en el servidor:', mensajeDeError(error));
    return { tipo: 'SIN_CONEXION' };
  }
  if (respuesta.error) {
    if (/DEMASIADOS_INTENTOS/.test(respuesta.error.message ?? '')) return { tipo: 'DEMASIADOS_INTENTOS' };
    console.log('[usuarios] verificar_pin falló:', mensajeDeError(respuesta.error));
    return { tipo: 'SIN_CONEXION' };
  }
  const fila = respuesta.data?.[0];
  if (!fila) return { tipo: 'NO_ENCONTRADO' };

  await db.withTransactionAsync(async () => {
    await db.runAsync('UPDATE usuarios SET pin = NULL WHERE pin = ? AND id <> ?', [pin, fila.id]);
    await db.runAsync(
      `INSERT INTO usuarios (id, nombre, rol, activo, pin, credencial_version, ts_cliente, dispositivo_id)
       VALUES (?, ?, ?, 1, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         nombre = excluded.nombre,
         rol = excluded.rol,
         activo = 1,
         pin = excluded.pin,
         credencial_version = excluded.credencial_version`,
      [fila.id, fila.nombre, fila.rol, pin, fila.credencial_version, fila.ts_cliente, fila.dispositivo_id]
    );
  });
  return { tipo: 'OK', usuario: { id: fila.id, nombre: fila.nombre, rol: fila.rol } };
}

/** Promotores activos — para elegir a quién asignarle cargue. */
export async function listarPromotores(db: SQLiteDatabase): Promise<UsuarioSesion[]> {
  return db.getAllAsync<UsuarioSesion>(
    "SELECT id, nombre, rol FROM usuarios WHERE rol = 'PROMOTOR' AND activo = 1 ORDER BY nombre ASC"
  );
}
