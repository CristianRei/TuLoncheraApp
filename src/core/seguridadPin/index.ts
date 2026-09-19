import type { EstadoIntentosPin } from '../tipos';

/**
 * Backoff progresivo y bloqueo duro de PIN. TypeScript puro, sin Expo — ver
 * CLAUDE.md sección 6. Si esto tiene un off-by-one, bloquea gente en
 * producción sin recurso, por eso lleva tests de propiedad (ver
 * seguridadPin.test.ts).
 */

export const UMBRAL_BACKOFF = 3;
export const UMBRAL_BLOQUEO = 8;

const ESPERAS_SEGUNDOS = [3, 8, 20, 45, 90];

/**
 * Segundos de espera antes de aceptar el siguiente intento, dado el número
 * de fallos consecutivos ya ocurridos. Antes del umbral de backoff no hay
 * espera; de ahí en adelante sigue la escalera y se queda en el último
 * escalón (el bloqueo duro llega antes de agotarla).
 */
export function calcularEsperaSegundos(fallosConsecutivos: number): number {
  if (fallosConsecutivos < UMBRAL_BACKOFF) return 0;
  const indice = fallosConsecutivos - UMBRAL_BACKOFF;
  return ESPERAS_SEGUNDOS[Math.min(indice, ESPERAS_SEGUNDOS.length - 1)];
}

/**
 * Estado a mostrar en el teclado de login, dado el conteo de fallos
 * consecutivos y cuánto tiempo pasó desde el último. Pura función de
 * (fallos, tiempo transcurrido) — testeable sin reloj real.
 */
export function calcularEstadoIntentos(
  fallosConsecutivos: number,
  msDesdeUltimoIntento: number | null
): EstadoIntentosPin {
  if (fallosConsecutivos >= UMBRAL_BLOQUEO) return { estado: 'BLOQUEADO' };
  if (fallosConsecutivos < UMBRAL_BACKOFF) return { estado: 'NORMAL' };

  const esperaSegundos = calcularEsperaSegundos(fallosConsecutivos);
  const segundosTranscurridos = (msDesdeUltimoIntento ?? Infinity) / 1000;
  const restante = Math.ceil(esperaSegundos - segundosTranscurridos);
  if (restante <= 0) return { estado: 'NORMAL' };
  return { estado: 'ESPERANDO', segundosRestantes: restante };
}
