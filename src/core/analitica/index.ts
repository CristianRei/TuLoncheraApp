/**
 * Agregaciones de analítica de ventas. TypeScript puro, sin Expo — ver
 * CLAUDE.md sección 6.
 */

export interface VentaParaAgrupar {
  /** ISO 8601, normalmente en UTC (con o sin offset explícito). */
  tsCliente: string;
  total: number;
}

export interface VentasPorHora {
  /** 0-23, hora local de Bogotá. */
  hora: number;
  cantidadVentas: number;
  totalVendido: number;
}

/**
 * Colombia usa UTC-5 fijo todo el año (sin horario de verano desde 1994) —
 * se resta el offset a mano en vez de traer una librería de timezone. Si
 * eso cambiara seria un evento raro y visible, no algo a manejar aquí.
 */
const OFFSET_BOGOTA_HORAS = 5;

function horaBogota(tsCliente: string): number {
  const horaUtc = new Date(tsCliente).getUTCHours();
  return (horaUtc - OFFSET_BOGOTA_HORAS + 24) % 24;
}

/**
 * Agrupa ventas por hora del día en horario de Bogotá. Solo devuelve horas
 * con al menos una venta; la UI rellena las horas faltantes con cero.
 */
export function agruparVentasPorHora(ventas: VentaParaAgrupar[]): VentasPorHora[] {
  const acumulado = new Map<number, { cantidadVentas: number; totalVendido: number }>();

  for (const venta of ventas) {
    const hora = horaBogota(venta.tsCliente);
    const actual = acumulado.get(hora) ?? { cantidadVentas: 0, totalVendido: 0 };
    acumulado.set(hora, {
      cantidadVentas: actual.cantidadVentas + 1,
      totalVendido: actual.totalVendido + venta.total,
    });
  }

  return [...acumulado.entries()]
    .map(([hora, datos]) => ({ hora, ...datos }))
    .sort((a, b) => a.hora - b.hora);
}
