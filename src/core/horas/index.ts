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
