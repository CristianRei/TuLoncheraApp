import { calcularResumenIntentosPin } from '@/core/seguridadPin';
import type { ModoLogin, ResumenIntentosPin } from '@/core/tipos';
import { getSupabaseClient } from '@/sync/supabaseClient';

interface FilaEventoPinRemoto {
  dispositivo_id: string;
  modo: ModoLogin;
  ts_cliente: string;
}

/**
 * Resumen de fallos/bloqueos por dispositivo+modo de TODOS los dispositivos
 * (a diferencia de `listarResumenIntentosPin`, que solo ve el propio SQLite
 * local) — para que `app/admin/auditoria/index.tsx` (filtro "Accesos")
 * pueda mostrar y desbloquear un celular ajeno. Son pocas filas (eventos de
 * seguridad, no ventas), sin
 * paginación. Lanza si no hay red/credenciales — el llamador decide si se
 * degrada a mostrar solo lo local (ver esa pantalla).
 */
export async function listarResumenIntentosPinRemoto(): Promise<ResumenIntentosPin[]> {
  const supabase = await getSupabaseClient();
  const [fallos, desbloqueos, logins] = await Promise.all([
    supabase
      .from('intentos_pin_fallidos')
      .select('dispositivo_id, modo, ts_cliente')
      .returns<FilaEventoPinRemoto[]>(),
    supabase
      .from('desbloqueos_pin')
      .select('dispositivo_id, modo, ts_cliente')
      .returns<FilaEventoPinRemoto[]>(),
    supabase
      .from('logins_exitosos_pin')
      .select('dispositivo_id, modo, ts_cliente')
      .returns<FilaEventoPinRemoto[]>(),
  ]);
  if (fallos.error) throw fallos.error;
  if (desbloqueos.error) throw desbloqueos.error;
  if (logins.error) throw logins.error;

  const aEvento = (fila: FilaEventoPinRemoto) => ({
    dispositivoId: fila.dispositivo_id,
    modo: fila.modo,
    tsCliente: fila.ts_cliente,
  });

  return calcularResumenIntentosPin(
    (fallos.data ?? []).map(aEvento),
    (desbloqueos.data ?? []).map(aEvento),
    (logins.data ?? []).map(aEvento)
  );
}

interface FilaIntentoFallidoRemoto {
  id: string;
  dispositivo_id: string;
  modo: ModoLogin;
  ts_cliente: string;
}

/**
 * Intentos fallidos de PIN de TODOS los dispositivos, en el rango dado —
 * filas individuales (no el resumen agregado de `listarResumenIntentosPinRemoto`),
 * para fusionar con los locales en la línea de tiempo de Bitácora y auditoría
 * (ver `src/db/auditoria.ts`, `obtenerLineaDeTiempoAuditoria`). Lanza si no
 * hay red/credenciales — el llamador decide si se degrada a mostrar solo lo
 * local.
 */
export async function listarIntentosFallidosRemotos(
  desde: string,
  hasta: string
): Promise<{ id: string; dispositivoId: string; modo: ModoLogin; tsCliente: string }[]> {
  const supabase = await getSupabaseClient();
  const { data, error } = await supabase
    .from('intentos_pin_fallidos')
    .select('id, dispositivo_id, modo, ts_cliente')
    .gte('ts_cliente', desde)
    .lte('ts_cliente', hasta)
    .returns<FilaIntentoFallidoRemoto[]>();
  if (error) throw error;
  return (data ?? []).map((fila) => ({
    id: fila.id,
    dispositivoId: fila.dispositivo_id,
    modo: fila.modo,
    tsCliente: fila.ts_cliente,
  }));
}

/**
 * ¿Ya hubo un desbloqueo remoto de esta combinación dispositivo+modo,
 * posterior a `desdeTs` (el timestamp del último fallo local)? La pantalla de
 * login (`app/index.tsx`) la consulta mientras el estado es BLOQUEADO, para
 * que un desbloqueo hecho por admin desde OTRO dispositivo destrabe este sin
 * que la persona tenga que teclear el PIN de un admin aquí mismo. Best-effort
 * por diseño: sin red simplemente no encuentra nada (R5), el link local
 * "Desbloquear con PIN de administrador" sigue funcionando igual.
 */
export async function huboDesbloqueoRemotoReciente(
  dispositivoId: string,
  modo: ModoLogin,
  desdeTs: string
): Promise<{ id: string; adminId: string; tsCliente: string } | null> {
  const supabase = await getSupabaseClient();
  const { data, error } = await supabase
    .from('desbloqueos_pin')
    .select('id, admin_id, ts_cliente')
    .eq('dispositivo_id', dispositivoId)
    .eq('modo', modo)
    .gt('ts_cliente', desdeTs)
    .order('ts_cliente', { ascending: false })
    .limit(1)
    .returns<{ id: string; admin_id: string; ts_cliente: string }[]>();
  if (error) throw error;
  const fila = data?.[0];
  if (!fila) return null;
  return { id: fila.id, adminId: fila.admin_id, tsCliente: fila.ts_cliente };
}
