/**
 * Agregaciones de analítica de ventas. TypeScript puro, sin Expo — ver
 * CLAUDE.md sección 6.
 */

export interface VentaParaAgrupar {
  /** ISO 8601, normalmente en UTC (con o sin offset explícito). */
  tsCliente: string;
  total: number;
  promotorId: string;
  promotorNombre: string;
}

export interface VentaPorPromotorEnHora {
  promotorId: string;
  promotorNombre: string;
  cantidadVentas: number;
  totalVendido: number;
}

export interface VentasPorHora {
  /** 0-23, hora local de Bogotá. */
  hora: number;
  cantidadVentas: number;
  totalVendido: number;
  /** Desglose de esta hora por promotor, ordenado de mayor a menor total — para el detalle al tocar la barra. */
  porPromotor: VentaPorPromotorEnHora[];
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

/** "AAAA-MM-DD" del día en Bogotá al que corresponde ese instante. */
function fechaBogota(tsCliente: string): string {
  const offsetMs = OFFSET_BOGOTA_HORAS * 60 * 60 * 1000;
  const fechaBogotaMs = new Date(tsCliente).getTime() - offsetMs;
  return new Date(fechaBogotaMs).toISOString().slice(0, 10);
}

/** "AAAA-MM-DD" de hoy en Bogotá — para resolver el evento vigente de un promotor. */
export function fechaHoyBogota(ahora: Date = new Date()): string {
  return fechaBogota(ahora.toISOString());
}

export interface RangoIso {
  /** ISO 8601 en UTC, límite inferior inclusive. */
  desde: string;
  /** ISO 8601 en UTC, límite superior inclusive. */
  hasta: string;
}

/** Medianoche de hoy en Bogotá hasta ahora, en ISO UTC — para filtrar "hoy". */
export function calcularRangoHoyBogota(ahora: Date = new Date()): RangoIso {
  const offsetMs = OFFSET_BOGOTA_HORAS * 60 * 60 * 1000;
  const ahoraBogota = new Date(ahora.getTime() - offsetMs);
  const medianocheBogota = new Date(
    Date.UTC(ahoraBogota.getUTCFullYear(), ahoraBogota.getUTCMonth(), ahoraBogota.getUTCDate())
  );
  return {
    desde: new Date(medianocheBogota.getTime() + offsetMs).toISOString(),
    hasta: ahora.toISOString(),
  };
}

/**
 * Agrupa ventas por hora del día en horario de Bogotá, con desglose por
 * promotor dentro de cada hora (para el detalle al tocar una barra del
 * gráfico). Solo devuelve horas con al menos una venta; la UI rellena las
 * horas faltantes con cero.
 */
export function agruparVentasPorHora(ventas: VentaParaAgrupar[]): VentasPorHora[] {
  const acumulado = new Map<
    number,
    { cantidadVentas: number; totalVendido: number; porPromotor: Map<string, VentaPorPromotorEnHora> }
  >();

  for (const venta of ventas) {
    const hora = horaBogota(venta.tsCliente);
    const actual = acumulado.get(hora) ?? {
      cantidadVentas: 0,
      totalVendido: 0,
      porPromotor: new Map<string, VentaPorPromotorEnHora>(),
    };
    actual.cantidadVentas += 1;
    actual.totalVendido += venta.total;

    const promotorActual = actual.porPromotor.get(venta.promotorId) ?? {
      promotorId: venta.promotorId,
      promotorNombre: venta.promotorNombre,
      cantidadVentas: 0,
      totalVendido: 0,
    };
    promotorActual.cantidadVentas += 1;
    promotorActual.totalVendido += venta.total;
    actual.porPromotor.set(venta.promotorId, promotorActual);

    acumulado.set(hora, actual);
  }

  return [...acumulado.entries()]
    .map(([hora, datos]) => ({
      hora,
      cantidadVentas: datos.cantidadVentas,
      totalVendido: datos.totalVendido,
      porPromotor: [...datos.porPromotor.values()].sort((a, b) => b.totalVendido - a.totalVendido),
    }))
    .sort((a, b) => a.hora - b.hora);
}

export interface VentasPorDia {
  /** "AAAA-MM-DD" en horario de Bogotá. */
  fecha: string;
  cantidadVentas: number;
  totalVendido: number;
}

/**
 * Agrupa ventas por día en horario de Bogotá — para el gráfico dentro del
 * detalle de "Por método de pago" cuando el rango cubre varios días. Solo
 * devuelve días con al menos una venta; la UI rellena los días faltantes.
 */
export function agruparVentasPorDia(ventas: { tsCliente: string; total: number }[]): VentasPorDia[] {
  const acumulado = new Map<string, { cantidadVentas: number; totalVendido: number }>();

  for (const venta of ventas) {
    const fecha = fechaBogota(venta.tsCliente);
    const actual = acumulado.get(fecha) ?? { cantidadVentas: 0, totalVendido: 0 };
    acumulado.set(fecha, {
      cantidadVentas: actual.cantidadVentas + 1,
      totalVendido: actual.totalVendido + venta.total,
    });
  }

  return [...acumulado.entries()]
    .map(([fecha, datos]) => ({ fecha, ...datos }))
    .sort((a, b) => a.fecha.localeCompare(b.fecha));
}
