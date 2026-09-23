// Reglas de PIN por rol. TypeScript puro — sin imports de React/Expo/SQLite,
// ver CLAUDE.md sección 6. Única fuente de verdad de qué regla de PIN
// aplica a cada rol (CLAUDE.md sección 4: toda verificación de permiso pasa
// por una única función, nunca `if (rol === ...)` disperso por la UI).

import type { Rol } from '../tipos';

export type ModoPin = 'DESDE_CEDULA' | 'MANUAL_6_DIGITOS';

/**
 * Promotor, Conductor y Bodega: el PIN son los últimos 4 dígitos de la
 * cédula, siempre — no es opcional. Admin: PIN de 6 dígitos elegido a mano
 * al crear la cuenta, sin relación con la cédula.
 */
export function modoPinParaRol(rol: Rol): ModoPin {
  return rol === 'ADMIN' ? 'MANUAL_6_DIGITOS' : 'DESDE_CEDULA';
}

/** Los últimos 4 dígitos de la cédula (solo dígitos, ignora espacios/guiones). */
export function pinDesdeCedula(cedula: string): string {
  return cedula.replace(/\D/g, '').slice(-4);
}

/** PIN de administrador: exactamente 6 dígitos. */
export function pinManualValido(pin: string): boolean {
  return /^\d{6}$/.test(pin);
}

/**
 * Qué PIN (si alguno) debe viajar a Supabase al sincronizar `usuarios`. Nunca
 * el PIN de un rol DESDE_CEDULA cuando coincide con lo que ya se puede
 * recalcular a partir de la cédula (que sí sincroniza) — así ningún
 * dispositivo con la anon key pública puede leer el PIN real de un
 * Promotor/Conductor/Bodega directo de la tabla remota, solo derivarlo si
 * conoce la cédula, igual que ya hace el dispositivo de admin. Solo viaja de
 * verdad para ADMIN (PIN manual, no derivable) o para el caso raro de
 * colisión (override manual distinto del derivado) — riesgo aceptado en esos
 * dos casos, documentado en CLAUDE.md sección 11.
 */
export function pinParaSincronizar(rol: Rol, cedula: string | null, pin: string | null): string | null {
  if (!pin) return null;
  if (modoPinParaRol(rol) === 'MANUAL_6_DIGITOS') return pin;
  if (!cedula) return pin;
  return pin === pinDesdeCedula(cedula) ? null : pin;
}

/**
 * Reconstruye el PIN local a partir de una fila descargada de Supabase — la
 * contraparte de `pinParaSincronizar`. Si el PIN no viajó (porque se podía
 * derivar), se deriva aquí con la misma regla; si viajó (ADMIN o colisión),
 * se usa tal cual.
 */
export function pinDesdeDescarga(rol: Rol, cedula: string | null, pinRemoto: string | null): string | null {
  if (pinRemoto) return pinRemoto;
  if (modoPinParaRol(rol) === 'DESDE_CEDULA' && cedula) return pinDesdeCedula(cedula);
  return null;
}
