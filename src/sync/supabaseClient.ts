import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { SUPABASE_ANON_KEY, SUPABASE_URL } from './config';

let clientePromise: Promise<SupabaseClient> | null = null;

/**
 * Cliente Supabase singleton, mismo patrón que `getDb()` en src/db/client.ts.
 * Garantiza una sesión de Auth anónima activa (una por dispositivo,
 * persistida en AsyncStorage) antes de devolver el cliente — ninguna
 * pantalla ni el motor de sync necesitan pensar en autenticación por su
 * cuenta. Ver docs/03-decisiones/0006-sincronizacion-turnos-comprobantes.md
 * para el porqué de Auth anónimo en vez de cuentas reales o service_role key.
 */
export async function getSupabaseClient(): Promise<SupabaseClient> {
  if (!clientePromise) {
    clientePromise = (async () => {
      const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: {
          storage: AsyncStorage,
          autoRefreshToken: true,
          persistSession: true,
          detectSessionInUrl: false,
        },
      });

      const { data } = await supabase.auth.getSession();
      if (!data.session) {
        const { error } = await supabase.auth.signInAnonymously();
        if (error) throw error;
      }

      return supabase;
    })();
  }

  try {
    return await clientePromise;
  } catch (error) {
    // No cachear un intento fallido (ej. sin red al arrancar, R5) — el
    // siguiente llamado debe poder reintentar en vez de quedar envenenado.
    clientePromise = null;
    throw error;
  }
}
