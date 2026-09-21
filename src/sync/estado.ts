/**
 * Estado del último ciclo del motor de sync, en memoria — para que la
 * pantalla de diagnóstico (app/admin/sync/) muestre errores que ocurren
 * ANTES de tocar cualquier tarea de la cola (ej. no se pudo establecer
 * sesión con Supabase), que de otro modo solo se ven en consola y nadie
 * en campo tiene acceso a eso.
 */
export interface EstadoUltimoCiclo {
  ts: string;
  ok: boolean;
  mensaje: string;
}

let ultimoCiclo: EstadoUltimoCiclo | null = null;

export function registrarUltimoCiclo(ok: boolean, mensaje: string): void {
  ultimoCiclo = { ts: new Date().toISOString(), ok, mensaje };
}

export function obtenerUltimoCiclo(): EstadoUltimoCiclo | null {
  return ultimoCiclo;
}
