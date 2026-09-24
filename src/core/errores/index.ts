/**
 * Extrae un mensaje legible de cualquier error atrapado. Necesario porque no
 * todo lo que se lanza es un `Error` de JS: lo que devuelve supabase-js en
 * `{ error }` es un objeto plano `{ message, details, hint, code }`
 * (PostgrestError) — no pasa `error instanceof Error`. Cubrir ambos casos es
 * lo que le permite a la UI (ej. app/admin/notificaciones/, pestaña Mensajes)
 * mostrar la razón real
 * de una falla (ej. "relation mensajes does not exist" si falta correr una
 * migración de Supabase) en vez de un genérico "Error inesperado".
 */
export function mensajeDeError(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string') {
    return error.message;
  }
  return 'Error inesperado.';
}
