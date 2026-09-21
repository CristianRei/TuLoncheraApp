/**
 * Credenciales de Supabase para esta rebanada de sincronización (turnos +
 * comprobantes de transferencia). Ambas variables son seguras de exponer en
 * el cliente — son la Project URL y la publishable/anon key (contraparte de
 * RLS), nunca la service_role key. Ver supabase/README.md.
 */
function requerido(nombre: string, valor: string | undefined): string {
  if (!valor) {
    throw new Error(
      `Falta la variable de entorno ${nombre}. Copia .env.example a .env.local y llénala con los valores de Settings → API en el dashboard de Supabase.`
    );
  }
  return valor;
}

export const SUPABASE_URL = requerido('EXPO_PUBLIC_SUPABASE_URL', process.env.EXPO_PUBLIC_SUPABASE_URL);
export const SUPABASE_ANON_KEY = requerido(
  'EXPO_PUBLIC_SUPABASE_ANON_KEY',
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY
);
