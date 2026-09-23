import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js';

import { mensajeDeError } from '@/core/errores';

import { getSupabaseClient } from './supabaseClient';

/**
 * Suscripción a cambios de tablas de Supabase (Realtime, `postgres_changes`)
 * — así una venta hecha en un celular llega al admin al instante, sin esperar
 * ningún temporizador. Solo AVISA que algo cambió (`alCambiar`); quien llama
 * decide qué descargar. Best-effort: si no hay red o Realtime no está
 * habilitado para la tabla (ver supabase/migraciones/0009), no pasa nada — la
 * descarga periódica de respaldo sigue funcionando. Devuelve la función que
 * cancela la suscripción.
 */
export function suscribirCambiosRemotos(tablas: string[], alCambiar: () => void): () => void {
  let cancelado = false;
  let canal: RealtimeChannel | null = null;
  let cliente: SupabaseClient | null = null;

  (async () => {
    try {
      const supabase = await getSupabaseClient();
      if (cancelado) return;
      const nuevoCanal = supabase.channel(`cambios-${Math.random().toString(36).slice(2)}`);
      for (const tabla of tablas) {
        nuevoCanal.on('postgres_changes', { event: '*', schema: 'public', table: tabla }, () => alCambiar());
      }
      nuevoCanal.subscribe((estado, error) => {
        if (estado === 'SUBSCRIBED') console.log(`[realtime] escuchando ${tablas.join(', ')}`);
        else if (estado !== 'CLOSED') console.log(`[realtime] ${estado}`, error ? mensajeDeError(error) : '');
      });
      canal = nuevoCanal;
      cliente = supabase;
    } catch (error) {
      console.log('[realtime] no se pudo suscribir:', mensajeDeError(error));
    }
  })();

  return () => {
    cancelado = true;
    if (canal && cliente) cliente.removeChannel(canal);
  };
}
