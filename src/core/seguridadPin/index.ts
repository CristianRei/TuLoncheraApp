import type { EstadoIntentosPin, ModoLogin, ResumenIntentosPin } from '../tipos';

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

interface EventoPin {
  dispositivoId: string;
  modo: ModoLogin;
  tsCliente: string;
}

/**
 * Agrupa en memoria intentos fallidos + desbloqueos + logins exitosos de
 * CUALQUIER origen (local o remoto — ver src/db/intentosPin.ts y
 * src/db/intentosPinRemotos.ts, que llaman esto con sus propias filas) en un
 * resumen por dispositivo+modo, mismo cálculo que `contarFallosConsecutivos`
 * (fallos posteriores al evento más reciente entre desbloqueos/logins) pero
 * puro — sin tocar SQLite ni Supabase — para poder aplicarlo igual sin
 * importar de dónde vinieron las filas.
 */
export function calcularResumenIntentosPin(
  fallos: EventoPin[],
  desbloqueos: EventoPin[],
  logins: EventoPin[]
): ResumenIntentosPin[] {
  const claves = new Set(fallos.map((f) => `${f.dispositivoId}|${f.modo}`));
  const resumen: ResumenIntentosPin[] = [];

  for (const clave of claves) {
    const [dispositivoId, modo] = clave.split('|') as [string, ModoLogin];
    const corteEventos = [...desbloqueos, ...logins]
      .filter((e) => e.dispositivoId === dispositivoId && e.modo === modo)
      .map((e) => e.tsCliente)
      .sort()
      .at(-1);

    const fallosPosterioresAlCorte = fallos
      .filter((f) => f.dispositivoId === dispositivoId && f.modo === modo)
      .filter((f) => !corteEventos || f.tsCliente > corteEventos)
      .sort((a, b) => a.tsCliente.localeCompare(b.tsCliente));

    if (fallosPosterioresAlCorte.length === 0) continue;
    resumen.push({
      dispositivoId,
      modo,
      fallosConsecutivos: fallosPosterioresAlCorte.length,
      bloqueado: fallosPosterioresAlCorte.length >= UMBRAL_BLOQUEO,
      ultimoIntentoTs: fallosPosterioresAlCorte.at(-1)?.tsCliente ?? null,
    });
  }

  return resumen.sort((a, b) => (b.ultimoIntentoTs ?? '').localeCompare(a.ultimoIntentoTs ?? ''));
}
