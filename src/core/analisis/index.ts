/**
 * Análisis cruzado punto × promotor × producto, medido por evento (fecha
 * real de feria en un punto) — distinto de `core/analitica`, que solo agrega
 * ventas dentro de un rango. Aquí se compara entre apariciones distintas
 * para detectar qué se repite y hacia dónde va la tendencia.
 */

export interface LineaVentaConContexto {
  /** "AAAA-MM-DD" en Bogotá — una fecha distinta en un punto es una "aparición" (evento). */
  eventoFecha: string;
  puntoId: string;
  puntoNombre: string;
  promotorId: string;
  promotorNombre: string;
  productoId: string;
  productoNombre: string;
  cantidad: number;
  totalLinea: number;
}

/** Mínimo de apariciones (fechas distintas) antes de calificar algo como "repetible". Con menos, la muestra es ruido. */
export const UMBRAL_MINIMO_EVENTOS = 3;

/** Tamaño del top por unidades que cuenta como "destacado" dentro de una aparición. */
const TOP_N_POR_APARICION = 5;

/** Diferencia mínima (%) contra el promedio general para que un producto se reporte como parte del mix de un promotor. */
const UMBRAL_DESVIACION_PCT = 20;

export type Tendencia = 'SUBIENDO' | 'ESTABLE' | 'BAJANDO';

export interface ProductoRepetible {
  productoId: string;
  productoNombre: string;
  apariciones: number;
  vecesEnTopN: number;
  tasaRepeticion: number;
  tendencia: Tendencia | null;
}

export interface RepetibilidadPunto {
  puntoId: string;
  puntoNombre: string;
  totalApariciones: number;
  datosInsuficientes: boolean;
  productos: ProductoRepetible[];
}

function agruparPorClave<T>(items: T[], clave: (item: T) => string): Map<string, T[]> {
  const mapa = new Map<string, T[]>();
  for (const item of items) {
    const k = clave(item);
    const actual = mapa.get(k) ?? [];
    actual.push(item);
    mapa.set(k, actual);
  }
  return mapa;
}

function calcularTendencia(tasasOrdenadasPorFecha: number[]): Tendencia | null {
  if (tasasOrdenadasPorFecha.length < UMBRAL_MINIMO_EVENTOS) return null;

  const mitad = Math.floor(tasasOrdenadasPorFecha.length / 2);
  const antigua = tasasOrdenadasPorFecha.slice(0, mitad);
  const reciente = tasasOrdenadasPorFecha.slice(mitad);

  const promedio = (valores: number[]): number => valores.reduce((a, b) => a + b, 0) / valores.length;
  const promedioAntiguo = promedio(antigua);
  const promedioReciente = promedio(reciente);

  const diferencia = promedioReciente - promedioAntiguo;
  if (Math.abs(diferencia) < 0.05) return 'ESTABLE';
  return diferencia > 0 ? 'SUBIENDO' : 'BAJANDO';
}

/**
 * Por punto: qué productos se repiten como top-N evento tras evento, y si
 * esa repetición viene subiendo o bajando. Pensado para responder "qué
 * cargue armar la próxima vez que se vaya a este punto".
 */
export function calcularRepetibilidadPorPunto(lineas: LineaVentaConContexto[]): RepetibilidadPunto[] {
  const porPunto = agruparPorClave(lineas, (l) => l.puntoId);

  const resultado: RepetibilidadPunto[] = [];

  for (const [puntoId, lineasPunto] of porPunto) {
    const puntoNombre = lineasPunto[0].puntoNombre;
    const porFecha = agruparPorClave(lineasPunto, (l) => l.eventoFecha);
    const fechasOrdenadas = [...porFecha.keys()].sort();
    const totalApariciones = fechasOrdenadas.length;

    // top-N por unidades de cada aparición
    const topNPorFecha = new Map<string, Set<string>>();
    for (const fecha of fechasOrdenadas) {
      const porProductoEnFecha = agruparPorClave(porFecha.get(fecha)!, (l) => l.productoId);
      const rankeados = [...porProductoEnFecha.entries()]
        .map(([productoId, lineasProducto]) => ({
          productoId,
          unidades: lineasProducto.reduce((suma, l) => suma + l.cantidad, 0),
        }))
        .sort((a, b) => b.unidades - a.unidades)
        .slice(0, TOP_N_POR_APARICION);
      topNPorFecha.set(fecha, new Set(rankeados.map((r) => r.productoId)));
    }

    const porProductoTotal = agruparPorClave(lineasPunto, (l) => l.productoId);
    const productos: ProductoRepetible[] = [...porProductoTotal.entries()].map(
      ([productoId, lineasProducto]) => {
        const productoNombre = lineasProducto[0].productoNombre;
        const fechasDelProducto = new Set(lineasProducto.map((l) => l.eventoFecha));
        const apariciones = fechasDelProducto.size;

        const enTopNPorFecha: number[] = fechasOrdenadas
          .filter((fecha) => fechasDelProducto.has(fecha))
          .map((fecha) => (topNPorFecha.get(fecha)!.has(productoId) ? 1 : 0));

        const vecesEnTopN = enTopNPorFecha.reduce((a, b) => a + b, 0);
        const tasaRepeticion = apariciones === 0 ? 0 : vecesEnTopN / apariciones;

        // tasa acumulada hasta cada aparición del producto, para medir tendencia sin depender del orden de entrada
        const tasasAcumuladas: number[] = [];
        let acumulado = 0;
        enTopNPorFecha.forEach((valor, i) => {
          acumulado += valor;
          tasasAcumuladas.push(acumulado / (i + 1));
        });

        return {
          productoId,
          productoNombre,
          apariciones,
          vecesEnTopN,
          tasaRepeticion,
          tendencia: calcularTendencia(tasasAcumuladas),
        };
      }
    );

    productos.sort((a, b) => b.tasaRepeticion - a.tasaRepeticion || b.apariciones - a.apariciones);

    resultado.push({
      puntoId,
      puntoNombre,
      totalApariciones,
      datosInsuficientes: totalApariciones < UMBRAL_MINIMO_EVENTOS,
      productos,
    });
  }

  return resultado.sort((a, b) => b.totalApariciones - a.totalApariciones);
}

export interface DesviacionProducto {
  productoId: string;
  productoNombre: string;
  unidadesPromotorPorEvento: number;
  unidadesPromedioGeneralPorEvento: number;
  desviacionPct: number;
}

export interface RendimientoPromotor {
  promotorId: string;
  promotorNombre: string;
  eventosTrabajados: number;
  totalVendido: number;
  ticketPromedioPorEvento: number;
  mixDestacado: DesviacionProducto[];
}

function unidadesPorEventoPorProducto(
  lineas: LineaVentaConContexto[]
): Map<string, { unidades: number; eventos: Set<string> }> {
  const mapa = new Map<string, { unidades: number; eventos: Set<string> }>();
  for (const linea of lineas) {
    const actual = mapa.get(linea.productoId) ?? { unidades: 0, eventos: new Set<string>() };
    actual.unidades += linea.cantidad;
    actual.eventos.add(linea.eventoFecha);
    mapa.set(linea.productoId, actual);
  }
  return mapa;
}

/**
 * Por promotor: ticket promedio por evento, y qué productos vende por
 * encima/debajo del promedio de los DEMÁS promotores que también vendieron
 * ese producto (nunca se compara un promotor contra un promedio que lo
 * incluye a él mismo, o la desviación se diluye) — solo se reportan
 * desviaciones ≥ UMBRAL_DESVIACION_PCT.
 */
export function calcularRendimientoPorPromotor(lineas: LineaVentaConContexto[]): RendimientoPromotor[] {
  const porPromotor = agruparPorClave(lineas, (l) => l.promotorId);

  const resultado: RendimientoPromotor[] = [];

  for (const [promotorId, lineasPromotor] of porPromotor) {
    const promotorNombre = lineasPromotor[0].promotorNombre;
    const eventos = new Set(lineasPromotor.map((l) => l.eventoFecha));
    const eventosTrabajados = eventos.size;
    const totalVendido = lineasPromotor.reduce((suma, l) => suma + l.totalLinea, 0);

    const porProductoPromotor = unidadesPorEventoPorProducto(lineasPromotor);
    const lineasOtrosPromotores = lineas.filter((l) => l.promotorId !== promotorId);
    const promedioOtrosPorProducto = unidadesPorEventoPorProducto(lineasOtrosPromotores);

    const mixDestacado: DesviacionProducto[] = [];
    for (const [productoId, datosPromotor] of porProductoPromotor) {
      const datosGeneral = promedioOtrosPorProducto.get(productoId);
      if (!datosGeneral) continue;
      const unidadesPromotorPorEvento = datosPromotor.unidades / datosPromotor.eventos.size;
      const unidadesPromedioGeneralPorEvento = datosGeneral.unidades / datosGeneral.eventos.size;

      if (unidadesPromedioGeneralPorEvento === 0) continue;

      const desviacionPct = Math.round(
        ((unidadesPromotorPorEvento - unidadesPromedioGeneralPorEvento) / unidadesPromedioGeneralPorEvento) * 100
      );

      if (Math.abs(desviacionPct) >= UMBRAL_DESVIACION_PCT) {
        const lineaProducto = lineasPromotor.find((l) => l.productoId === productoId)!;
        mixDestacado.push({
          productoId,
          productoNombre: lineaProducto.productoNombre,
          unidadesPromotorPorEvento,
          unidadesPromedioGeneralPorEvento,
          desviacionPct,
        });
      }
    }

    mixDestacado.sort((a, b) => Math.abs(b.desviacionPct) - Math.abs(a.desviacionPct));

    resultado.push({
      promotorId,
      promotorNombre,
      eventosTrabajados,
      totalVendido,
      ticketPromedioPorEvento: eventosTrabajados === 0 ? 0 : Math.round(totalVendido / eventosTrabajados),
      mixDestacado,
    });
  }

  return resultado.sort((a, b) => b.totalVendido - a.totalVendido);
}

export interface HallazgoCruzado {
  puntoId: string;
  puntoNombre: string;
  promotorId: string;
  promotorNombre: string;
  productoId: string;
  productoNombre: string;
  aparicionesEnPunto: number;
  desviacionPct: number;
}

/**
 * Cruce punto × promotor × producto: para cada combinación punto+promotor
 * con muestra suficiente, el producto donde ese promotor más se desvía del
 * promedio general *en ese punto* — ej. "vende X% más de un producto en
 * este punto específico que el resto de promotores ahí". Lista plana de
 * hallazgos ordenada por magnitud, no una matriz completa (la mayoría de
 * celdas punto×promotor×producto no tienen señal).
 */
export function calcularCrucePuntoPromotorProducto(lineas: LineaVentaConContexto[]): HallazgoCruzado[] {
  const porPunto = agruparPorClave(lineas, (l) => l.puntoId);
  const hallazgos: HallazgoCruzado[] = [];

  for (const [puntoId, lineasPunto] of porPunto) {
    const puntoNombre = lineasPunto[0].puntoNombre;
    const porPromotorEnPunto = agruparPorClave(lineasPunto, (l) => l.promotorId);

    for (const [promotorId, lineasPromotorEnPunto] of porPromotorEnPunto) {
      const promotorNombre = lineasPromotorEnPunto[0].promotorNombre;
      const aparicionesEnPunto = new Set(lineasPromotorEnPunto.map((l) => l.eventoFecha)).size;
      if (aparicionesEnPunto < UMBRAL_MINIMO_EVENTOS) continue;

      const porProductoPromotor = unidadesPorEventoPorProducto(lineasPromotorEnPunto);
      const lineasOtrosPromotoresEnPunto = lineasPunto.filter((l) => l.promotorId !== promotorId);
      const promedioOtrosEnPunto = unidadesPorEventoPorProducto(lineasOtrosPromotoresEnPunto);

      for (const [productoId, datosPromotor] of porProductoPromotor) {
        const datosGeneral = promedioOtrosEnPunto.get(productoId);
        if (!datosGeneral) continue;
        const unidadesPromotorPorEvento = datosPromotor.unidades / datosPromotor.eventos.size;
        const unidadesPromedioGeneralPorEvento = datosGeneral.unidades / datosGeneral.eventos.size;

        if (unidadesPromedioGeneralPorEvento === 0) continue;

        const desviacionPct = Math.round(
          ((unidadesPromotorPorEvento - unidadesPromedioGeneralPorEvento) / unidadesPromedioGeneralPorEvento) * 100
        );

        if (Math.abs(desviacionPct) >= UMBRAL_DESVIACION_PCT) {
          const lineaProducto = lineasPromotorEnPunto.find((l) => l.productoId === productoId)!;
          hallazgos.push({
            puntoId,
            puntoNombre,
            promotorId,
            promotorNombre,
            productoId,
            productoNombre: lineaProducto.productoNombre,
            aparicionesEnPunto,
            desviacionPct,
          });
        }
      }
    }
  }

  return hallazgos.sort((a, b) => Math.abs(b.desviacionPct) - Math.abs(a.desviacionPct));
}
