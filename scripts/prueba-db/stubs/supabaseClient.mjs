export async function getSupabaseClient() {
  if (!globalThis.__supabase) throw new Error('sin cliente falso configurado');
  return globalThis.__supabase;
}
