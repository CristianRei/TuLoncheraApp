import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';

import { mensajeDeError } from '@/core/errores';
import type { UsuarioSesion } from '@/core/tipos';

import { getSupabaseClient } from './supabaseClient';

/**
 * Hace que una notificación push saltee de verdad (banner + sonido) aunque
 * la app esté abierta en primer plano — el comportamiento por defecto de
 * expo-notifications la muestra solo en segundo plano/cerrada. Se llama una
 * sola vez, en app/_layout.tsx, antes de que cualquier pantalla la necesite.
 */
export function configurarManejoNotificaciones(): void {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}

/**
 * Pide permiso de notificaciones (una vez por dispositivo, el SO recuerda la
 * respuesta) y registra/actualiza el push token de este usuario en Supabase.
 * Se llama justo después del login (app/index.tsx) — nunca bloquea el login
 * si falla (sin conexión, permiso negado, o Expo Go sin soporte de push
 * remoto desde el SDK 53): el resto de la app sigue funcionando igual, la
 * persona simplemente no va a recibir notificaciones hasta que esto se
 * pueda reintentar (próximo login).
 */
export async function registrarPushToken(usuario: UsuarioSesion, dispositivoId: string): Promise<void> {
  try {
    if (!Device.isDevice) return; // emuladores no reciben push reales

    const permisoActual = await Notifications.getPermissionsAsync();
    let estado = permisoActual.status;
    if (estado !== 'granted') {
      const solicitado = await Notifications.requestPermissionsAsync();
      estado = solicitado.status;
    }
    if (estado !== 'granted') return;

    const projectId = Constants.expoConfig?.extra?.eas?.projectId;
    if (!projectId) return;

    const { data } = await Notifications.getExpoPushTokenAsync({ projectId });

    const supabase = await getSupabaseClient();
    const { error } = await supabase.from('push_tokens').upsert({
      usuario_id: usuario.id,
      dispositivo_id: dispositivoId,
      expo_push_token: data,
      rol: usuario.rol,
      activo: true,
      actualizado_ts: new Date().toISOString(),
    });
    if (error) throw error;
  } catch (error) {
    console.log('[push] no se pudo registrar el token:', mensajeDeError(error));
  }
}

interface MensajePush {
  to: string;
  title: string;
  body: string;
}

const TAMANO_LOTE_PUSH = 100; // límite recomendado por Expo por request

/**
 * Envía notificaciones push llamando DIRECTO al servicio de Expo desde el
 * dispositivo del admin (sin servidor propio, mismo espíritu que el resto de
 * la sincronización — ver ADR 0006 y CLAUDE.md sección 5). Best-effort: si
 * un lote falla, no revienta el envío completo de los demás. No confirma
 * entrega real (eso lo maneja el SO del destinatario) — ver src/db/mensajes.ts
 * para dónde queda el registro de que el mensaje se envió.
 */
export async function enviarNotificacionesPush(mensajes: MensajePush[]): Promise<void> {
  for (let i = 0; i < mensajes.length; i += TAMANO_LOTE_PUSH) {
    const lote = mensajes.slice(i, i + TAMANO_LOTE_PUSH);
    try {
      await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(lote),
      });
    } catch (error) {
      console.log('[push] no se pudo enviar un lote de notificaciones:', mensajeDeError(error));
    }
  }
}
