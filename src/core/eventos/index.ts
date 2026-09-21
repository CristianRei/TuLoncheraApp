import type { Frecuencia } from '../tipos';

/** Tope duro de ocurrencias generadas por una serie — evita miles de filas si el admin pone una fecha límite muy lejana. */
export const MAX_OCURRENCIAS_SERIE = 200;

export class DemasiadasOcurrenciasError extends Error {
  constructor(total: number) {
    super(`Esta serie generaría ${total} eventos — el máximo permitido es ${MAX_OCURRENCIAS_SERIE}.`);
    this.name = 'DemasiadasOcurrenciasError';
  }
}

function sumarIntervalo(fecha: Date, frecuencia: Frecuencia, intervalo: number): Date {
  const resultado = new Date(fecha);
  switch (frecuencia) {
    case 'DIAS':
      resultado.setUTCDate(resultado.getUTCDate() + intervalo);
      break;
    case 'SEMANAS':
      resultado.setUTCDate(resultado.getUTCDate() + intervalo * 7);
      break;
    case 'MESES':
      resultado.setUTCMonth(resultado.getUTCMonth() + intervalo);
      break;
    case 'ANIOS':
      resultado.setUTCFullYear(resultado.getUTCFullYear() + intervalo);
      break;
  }
  return resultado;
}

/**
 * Fechas "AAAA-MM-DD" de cada ocurrencia entre `fechaDesde` y `fechaHasta`
 * (ambas inclusive), cada `intervalo` unidades de `frecuencia`. Lanza
 * `DemasiadasOcurrenciasError` si excede el tope — el admin debe acortar el
 * rango o ampliar el intervalo.
 */
export function calcularOcurrencias(
  frecuencia: Frecuencia,
  intervalo: number,
  fechaDesde: string,
  fechaHasta: string
): string[] {
  if (!Number.isInteger(intervalo) || intervalo <= 0) {
    throw new Error('El intervalo debe ser un entero positivo.');
  }
  if (fechaHasta < fechaDesde) {
    throw new Error('La fecha límite no puede ser anterior a la fecha de inicio.');
  }

  const ocurrencias: string[] = [];
  let actual = new Date(`${fechaDesde}T00:00:00.000Z`);
  const limite = new Date(`${fechaHasta}T00:00:00.000Z`);

  while (actual.getTime() <= limite.getTime()) {
    ocurrencias.push(actual.toISOString().slice(0, 10));
    if (ocurrencias.length > MAX_OCURRENCIAS_SERIE) {
      throw new DemasiadasOcurrenciasError(ocurrencias.length);
    }
    actual = sumarIntervalo(actual, frecuencia, intervalo);
  }

  return ocurrencias;
}
