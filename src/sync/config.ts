/**
 * Credenciales de Supabase para esta rebanada de sincronización (turnos +
 * comprobantes de transferencia). Ambas variables son seguras de exponer en
 * el cliente — son la Project URL y la publishable/anon key (contraparte de
 * RLS), nunca la service_role key. Ver supabase/README.md.
 *
 * A propósito NO se valida aquí: este módulo se importa de forma transitiva
 * desde app/_layout.tsx (vía sync/motor.ts) en el arranque de TODA la app.
 * Lanzar en el import tumbaría la app entera si faltan las credenciales,
 * violando R5 ("la app debe funcionar siempre") — el inventario/ventas
 * siguen 100% local y no dependen de esto. La validación real vive en
 * `requerirCredenciales()`, que solo se llama desde `getSupabaseClient()`
 * dentro del try/catch que ya existe en `drenarColaSync()`.
 */
export const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
export const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

export function requerirCredenciales(): { url: string; anonKey: string } {
  const faltante = !SUPABASE_URL
    ? 'EXPO_PUBLIC_SUPABASE_URL'
    : !SUPABASE_ANON_KEY
      ? 'EXPO_PUBLIC_SUPABASE_ANON_KEY'
      : null;
  if (faltante) {
    throw new Error(
      `Falta la variable de entorno ${faltante}. Copia .env.example a .env.local y llénala con los valores de Settings → API en el dashboard de Supabase.`
    );
  }
  return { url: SUPABASE_URL as string, anonKey: SUPABASE_ANON_KEY as string };
}
