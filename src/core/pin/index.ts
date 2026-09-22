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
