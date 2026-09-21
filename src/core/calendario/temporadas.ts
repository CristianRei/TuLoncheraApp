/**
 * Temporadas de negocio de Colombia — no un calendario litúrgico completo,
 * solo los períodos que interesan para comparar venta contra el resto del
 * año (ver CLAUDE.md, sección "Análisis"). TypeScript puro.
 *
 * Festivos móviles (Semana Santa) y fechas de "N-ésimo día de la semana de
 * tal mes" (Día de la madre, Amor y Amistad) cambian cada año — por eso
 * cada año tiene su propia constante `TEMPORADAS_AAAA` en vez de un cálculo
 * perpetuo. Para agregar el año siguiente: recalcular Semana Santa
 * (Domingo de Pascua con el algoritmo de Gauss), el segundo domingo de mayo
 * y el tercer sábado de septiembre, y copiar el resto de rangos fijos.
 */

export interface Temporada {
  nombre: string;
  /** "AAAA-MM-DD", con año explícito — nunca un rango "genérico" sin año. */
  desde: string;
  hasta: string;
}

/**
 * Orden intencional: una fecha entra en la PRIMERA temporada de la lista
 * que la contenga. Navidad va antes que "vacaciones fin/inicio de año
 * escolar" porque se solapan (dic 1 – ene 6) y Navidad es la más específica
 * de las dos para ese tramo.
 */
export const TEMPORADAS_2026: Temporada[] = [
  { nombre: 'Navidad', desde: '2026-12-01', hasta: '2027-01-06' },
  { nombre: 'Vacaciones fin/inicio de año escolar', desde: '2026-12-01', hasta: '2027-01-31' },
  { nombre: 'Semana Santa', desde: '2026-03-30', hasta: '2026-04-05' },
  { nombre: 'Vacaciones de mitad de año', desde: '2026-06-15', hasta: '2026-07-15' },
  { nombre: 'Vacaciones de octubre', desde: '2026-10-12', hasta: '2026-10-25' },
  { nombre: 'Día de la madre', desde: '2026-05-10', hasta: '2026-05-10' },
  { nombre: 'Amor y Amistad', desde: '2026-09-19', hasta: '2026-09-19' },
];

/** Nombre de la primera temporada de la lista que contiene `fecha` ("AAAA-MM-DD"), o null si cae en temporada normal. */
export function temporadaDe(fecha: string, temporadas: Temporada[]): string | null {
  const encontrada = temporadas.find((t) => fecha >= t.desde && fecha <= t.hasta);
  return encontrada?.nombre ?? null;
}
