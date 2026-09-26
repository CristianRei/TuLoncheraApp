/**
 * Horas del día como texto "HH:MM" (hora de Colombia) — el horario de un
 * evento del calendario y el de un descuento. Sin fecha ni zona: quien las
 * usa sabe a qué día pertenecen.
 */

/** "8", "8:00", "08:00", "16:30" → "HH:MM"; `null` si no es una hora válida. */
export function parsearHora(texto: string): string | null {
  const m = texto.trim().match(/^(\d{1,2})(?::(\d{2}))?$/);
  if (!m) return null;
  const horas = Number(m[1]);
  const minutos = m[2] === undefined ? 0 : Number(m[2]);
  if (horas > 23 || minutos > 59) return null;
  return `${String(horas).padStart(2, '0')}:${String(minutos).padStart(2, '0')}`;
}

/** "08:00" → "8:00 a. m."; "16:30" → "4:30 p. m."; "12:00" → "12:00 p. m.". */
export function formatearHora(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number);
  const sufijo = h < 12 ? 'a. m.' : 'p. m.';
  const hora12 = h % 12 === 0 ? 12 : h % 12;
  return `${hora12}:${String(m).padStart(2, '0')} ${sufijo}`;
}

/** "8:00 a. m. – 4:00 p. m."; `null` si falta alguna de las dos. */
export function formatearRangoHoras(inicio: string | null, fin: string | null): string | null {
  if (!inicio || !fin) return null;
  return `${formatearHora(inicio)} – ${formatearHora(fin)}`;
}

/** La hora actual en Colombia ("HH:MM"), UTC-5 fijo — Colombia no tiene horario de verano. */
export function horaActualBogota(ahora: Date = new Date()): string {
  const bogota = new Date(ahora.getTime() - 5 * 60 * 60 * 1000);
  return `${String(bogota.getUTCHours()).padStart(2, '0')}:${String(bogota.getUTCMinutes()).padStart(2, '0')}`;
}

/** Horario de un evento del mismo día. Sin horario (eventos viejos) = todo el día. */
export interface Horario {
  horaInicio: string | null;
  horaFin: string | null;
}

function limites(horario: Horario): [string, string] {
  return horario.horaInicio && horario.horaFin ? [horario.horaInicio, horario.horaFin] : ['00:00', '24:00'];
}

/**
 * Si dos horarios del mismo día se cruzan. El fin no cuenta como parte del
 * horario: 8–12 y 12–16 NO se cruzan (un promotor puede terminar en un
 * evento a las 12 y empezar en otro a las 12). Sin horario = todo el día, así
 * que se cruza con cualquiera.
 */
export function horariosSeCruzan(a: Horario, b: Horario): boolean {
  const [inicioA, finA] = limites(a);
  const [inicioB, finB] = limites(b);
  return inicioA < finB && inicioB < finA;
}

/**
 * De los eventos de HOY de un promotor, en cuál está a esta `hora` — ahí
 * queda registrada cada venta (su punto). El que está en curso; si ninguno,
 * el último que ya empezó (una venta a las 12:30 cuando su evento terminó a
 * las 12 sigue siendo de ese evento, no del siguiente de las 14); si ninguno
 * ha empezado, el primero del día.
 */
export function elegirHorarioVigente<T extends Horario>(horarios: T[], hora: string): T | null {
  if (horarios.length === 0) return null;
  const ordenados = [...horarios].sort((a, b) => limites(a)[0].localeCompare(limites(b)[0]));
  const yaEmpezaron = ordenados.filter((h) => limites(h)[0] <= hora);
  const enCurso = yaEmpezaron.filter((h) => hora < limites(h)[1]);
  return enCurso.at(-1) ?? yaEmpezaron.at(-1) ?? ordenados[0];
}
