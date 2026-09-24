import * as Crypto from 'expo-crypto';
import type { SQLiteDatabase } from 'expo-sqlite';

import { calcularEstadoIntentos, calcularResumenIntentosPin } from '@/core/seguridadPin';
import type { EstadoIntentosPin, ModoLogin, ResumenIntentosPin } from '@/core/tipos';
import { mensajeDeError } from '@/core/errores';
import { getSupabaseClient } from '@/sync/supabaseClient';

import { registrarNotificacionDesbloqueo } from './notificaciones';
import { encolarSync } from './syncCola';

const CORTE_SIN_EVENTOS = '0000-00-00';

/**
 * Fallos consecutivos de una combinación dispositivo+modo: cuenta filas de
 * `intentos_pin_fallidos` posteriores al evento más reciente entre
 * `desbloqueos_pin` y `logins_exitosos_pin`. Es una cuenta derivada (R1),
 * nunca una columna mutable.
 */
export async function contarFallosConsecutivos(
  db: SQLiteDatabase,
  dispositivoId: string,
  modo: ModoLogin
): Promise<{ fallos: number; ultimoIntentoTs: string | null }> {
  const fila = await db.getFirstAsync<{ fallos: number; ultimo: string | null }>(
    `SELECT COUNT(*) as fallos, MAX(ts_cliente) as ultimo
     FROM intentos_pin_fallidos
     WHERE dispositivo_id = ? AND modo = ?
       AND ts_cliente > COALESCE(
         (SELECT MAX(ts_cliente) FROM (
           SELECT ts_cliente FROM desbloqueos_pin WHERE dispositivo_id = ? AND modo = ?
           UNION ALL
           SELECT ts_cliente FROM logins_exitosos_pin WHERE dispositivo_id = ? AND modo = ?
         )),
         ?
       )`,
    [dispositivoId, modo, dispositivoId, modo, dispositivoId, modo, CORTE_SIN_EVENTOS]
  );
  return { fallos: fila?.fallos ?? 0, ultimoIntentoTs: fila?.ultimo ?? null };
}

/** Registra un intento fallido. Nunca guarda el PIN tecleado. Sincroniza a Supabase (subida, ver src/sync/motor.ts). */
export async function registrarIntentoFallido(
  db: SQLiteDatabase,
  dispositivoId: string,
  modo: ModoLogin
): Promise<void> {
  const id = Crypto.randomUUID();
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      'INSERT INTO intentos_pin_fallidos (id, dispositivo_id, modo, ts_cliente) VALUES (?, ?, ?, ?)',
      [id, dispositivoId, modo, new Date().toISOString()]
    );
    await encolarSync(db, { tabla: 'intentos_pin_fallidos', entidadId: id, tipoTarea: 'FILA' });
  });
}

/** Un login correcto resetea el contador de fallos consecutivos. Sincroniza a Supabase. */
export async function registrarLoginExitoso(
  db: SQLiteDatabase,
  dispositivoId: string,
  modo: ModoLogin
): Promise<void> {
  const id = Crypto.randomUUID();
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      'INSERT INTO logins_exitosos_pin (id, dispositivo_id, modo, ts_cliente) VALUES (?, ?, ?, ?)',
      [id, dispositivoId, modo, new Date().toISOString()]
    );
    await encolarSync(db, { tabla: 'logins_exitosos_pin', entidadId: id, tipoTarea: 'FILA' });
  });
}

/**
 * Un admin desbloquea una combinación dispositivo+modo, reseteando el
 * contador. Sincroniza a Supabase por la cola normal (para que quede
 * registrado incluso sin red), pero ADEMÁS intenta un insert directo a
 * Supabase best-effort: si el dispositivo bloqueado es OTRO (ej. admin
 * desbloqueando desde su panel a un promotor), ese dispositivo nunca lee
 * este SQLite local — solo puede enterarse consultando Supabase (ver
 * `app/index.tsx`, chequeo de desbloqueo remoto mientras está BLOQUEADO).
 * Esperar el drenado diferido de la cola (~700ms) igual funcionaría, pero
 * el insert directo evita depender de que ese drenado tenga éxito ya mismo.
 */
export async function registrarDesbloqueo(
  db: SQLiteDatabase,
  dispositivoId: string,
  modo: ModoLogin,
  adminId: string
): Promise<void> {
  const id = Crypto.randomUUID();
  const tsCliente = new Date().toISOString();
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      'INSERT INTO desbloqueos_pin (id, dispositivo_id, modo, admin_id, ts_cliente) VALUES (?, ?, ?, ?, ?)',
      [id, dispositivoId, modo, adminId, tsCliente]
    );
    await encolarSync(db, { tabla: 'desbloqueos_pin', entidadId: id, tipoTarea: 'FILA' });
  });

  try {
    const supabase = await getSupabaseClient();
    const { error } = await supabase
      .from('desbloqueos_pin')
      .upsert({ id, dispositivo_id: dispositivoId, modo, admin_id: adminId, ts_cliente: tsCliente });
    if (error) throw error;
  } catch (error) {
    console.log('[intentosPin] desbloqueo remoto inmediato falló, queda en la cola:', mensajeDeError(error));
  }

  // Best-effort — un desbloqueo real ya ocurrió arriba, que la notificación
  // falle (ej. por el CHECK viejo antes de correr la migración 0030) nunca
  // debe deshacer ni bloquear el desbloqueo en sí.
  try {
    const admin = await db.getFirstAsync<{ nombre: string }>('SELECT nombre FROM usuarios WHERE id = ?', [
      adminId,
    ]);
    await registrarNotificacionDesbloqueo(
      db,
      { dispositivoId, modo, adminNombre: admin?.nombre ?? 'Un administrador' },
      tsCliente
    );
  } catch (error) {
    console.log('[intentosPin] no se pudo registrar la notificación de desbloqueo:', mensajeDeError(error));
  }
}

/**
 * Aplica LOCALMENTE un desbloqueo que ya existe en Supabase (ver
 * `src/db/intentosPinRemotos.ts`, `huboDesbloqueoRemotoReciente`, llamado
 * desde `app/index.tsx` mientras el estado es BLOQUEADO). Usa el MISMO id
 * que ya tiene la fila remota — nunca genera uno nuevo — para que sea un
 * no-op si el drenado normal de la cola de OTRO dispositivo también la trae
 * algún día (no debería pasar, pero R3 hace que sea inofensivo). No vuelve a
 * escribir a Supabase: esa fila ya vive allá, esto solo la refleja acá para
 * que `contarFallosConsecutivos` local vuelva a NORMAL sin duplicar lógica.
 */
export async function aplicarDesbloqueoRemoto(
  db: SQLiteDatabase,
  desbloqueo: { id: string; dispositivoId: string; modo: ModoLogin; adminId: string; tsCliente: string }
): Promise<void> {
  await db.runAsync(
    'INSERT OR IGNORE INTO desbloqueos_pin (id, dispositivo_id, modo, admin_id, ts_cliente) VALUES (?, ?, ?, ?, ?)',
    [desbloqueo.id, desbloqueo.dispositivoId, desbloqueo.modo, desbloqueo.adminId, desbloqueo.tsCliente]
  );
}

/** Combina el conteo persistido con el reloj actual para decidir qué mostrar en el login. */
export async function obtenerEstadoIntentos(
  db: SQLiteDatabase,
  dispositivoId: string,
  modo: ModoLogin
): Promise<EstadoIntentosPin> {
  const { fallos, ultimoIntentoTs } = await contarFallosConsecutivos(db, dispositivoId, modo);
  const msDesdeUltimoIntento = ultimoIntentoTs
    ? Date.now() - new Date(ultimoIntentoTs).getTime()
    : null;
  return calcularEstadoIntentos(fallos, msDesdeUltimoIntento);
}

/**
 * Para el panel de admin: una fila por cada dispositivo+modo con historial de
 * fallos, EN ESTE dispositivo únicamente (su propio SQLite local — solo
 * aporta algo si el propio admin generó fallos en su propio celular/PC). Ver
 * `src/db/intentosPinRemotos.ts` para la vista de TODOS los dispositivos vía
 * Supabase, que es la que de verdad importa en `app/admin/auditoria/index.tsx`
 * (filtro "Accesos" — fusionó lo que antes era el módulo separado
 * "Seguridad de acceso").
 */
export async function listarResumenIntentosPin(
  db: SQLiteDatabase
): Promise<ResumenIntentosPin[]> {
  const [fallos, desbloqueos, logins] = await Promise.all([
    db.getAllAsync<{ dispositivo_id: string; modo: ModoLogin; ts_cliente: string }>(
      'SELECT dispositivo_id, modo, ts_cliente FROM intentos_pin_fallidos'
    ),
    db.getAllAsync<{ dispositivo_id: string; modo: ModoLogin; ts_cliente: string }>(
      'SELECT dispositivo_id, modo, ts_cliente FROM desbloqueos_pin'
    ),
    db.getAllAsync<{ dispositivo_id: string; modo: ModoLogin; ts_cliente: string }>(
      'SELECT dispositivo_id, modo, ts_cliente FROM logins_exitosos_pin'
    ),
  ]);

  return calcularResumenIntentosPin(
    fallos.map((f) => ({ dispositivoId: f.dispositivo_id, modo: f.modo, tsCliente: f.ts_cliente })),
    desbloqueos.map((d) => ({ dispositivoId: d.dispositivo_id, modo: d.modo, tsCliente: d.ts_cliente })),
    logins.map((l) => ({ dispositivoId: l.dispositivo_id, modo: l.modo, tsCliente: l.ts_cliente }))
  );
}
