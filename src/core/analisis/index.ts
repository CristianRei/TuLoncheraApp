/**
 * Análisis cruzado punto × promotor × producto, medido por evento (fecha
 * real de feria en un punto) — distinto de `core/analitica`, que solo agrega
 * ventas dentro de un rango. Aquí se compara entre apariciones distintas
 * para detectar qué se repite y hacia dónde va la tendencia.
 */

import type { MetodoPago } from '../tipos';

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
  metodoPago: MetodoPago;
  /** Id de la venta que originó esta línea — para no contar dos veces el mismo método al agrupar por venta (una venta puede tener varias líneas de producto). */
  ventaId: string;
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
  /** Tasa de repetición acumulada tras cada aparición del producto, en orden cronológico — para graficar la tendencia real, no solo el resultado final. */
  tasaAcumuladaPorAparicion: number[];
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
          tasaAcumuladaPorAparicion: tasasAcumuladas,
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

/**
 * Coeficiente de correlación de Pearson entre dos variables. `null` si hay
 * menos de 3 pares o si alguna de las dos variables no varía (desviación
 * cero) — la correlación queda indefinida en ese caso, nunca se inventa un
 * número (CLAUDE.md §8).
 */
export function calcularCorrelacionPearson(pares: [number, number][]): number | null {
  if (pares.length < 3) return null;

  const n = pares.length;
  const xs = pares.map((p) => p[0]);
  const ys = pares.map((p) => p[1]);
  const mediaX = xs.reduce((a, b) => a + b, 0) / n;
  const mediaY = ys.reduce((a, b) => a + b, 0) / n;

  let covarianza = 0;
  let varianzaX = 0;
  let varianzaY = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - mediaX;
    const dy = ys[i] - mediaY;
    covarianza += dx * dy;
    varianzaX += dx * dx;
    varianzaY += dy * dy;
  }

  if (varianzaX === 0 || varianzaY === 0) return null;

  return covarianza / Math.sqrt(varianzaX * varianzaY);
}

/** Umbral de |r| para calificar la fuerza de una correlación — mismo texto se reutiliza en toda la UI. */
export function interpretarFuerzaPearson(r: number): 'débil o nula' | 'moderada' | 'fuerte' {
  const absR = Math.abs(r);
  if (absR > 0.6) return 'fuerte';
  if (absR >= 0.3) return 'moderada';
  return 'débil o nula';
}

export interface PuntoDispersionPromotor {
  promotorId: string;
  promotorNombre: string;
  eventosTrabajados: number;
  ticketPromedioPorEvento: number;
}

export interface DispersionPromotores {
  puntos: PuntoDispersionPromotor[];
  /** Pearson entre eventosTrabajados y ticketPromedioPorEvento — null si no hay muestra suficiente. */
  correlacion: number | null;
}

/** Un punto por promotor (eventos trabajados vs. ticket promedio por evento) + su correlación de Pearson. */
export function calcularDispersionPromotor(lineas: LineaVentaConContexto[]): DispersionPromotores {
  const porPromotor = agruparPorClave(lineas, (l) => l.promotorId);

  const puntos: PuntoDispersionPromotor[] = [...porPromotor.entries()].map(([promotorId, lineasPromotor]) => {
    const promotorNombre = lineasPromotor[0].promotorNombre;
    const eventosTrabajados = new Set(lineasPromotor.map((l) => l.eventoFecha)).size;
    const totalVendido = lineasPromotor.reduce((suma, l) => suma + l.totalLinea, 0);
    return {
      promotorId,
      promotorNombre,
      eventosTrabajados,
      ticketPromedioPorEvento: eventosTrabajados === 0 ? 0 : Math.round(totalVendido / eventosTrabajados),
    };
  });

  puntos.sort((a, b) => a.promotorId.localeCompare(b.promotorId));

  const correlacion = calcularCorrelacionPearson(
    puntos.map((p) => [p.eventosTrabajados, p.ticketPromedioPorEvento])
  );

  return { puntos, correlacion };
}

/** 1=lunes .. 7=domingo, ISO — evita el 0=domingo de `Date.getDay()` que confunde en contexto de negocio. */
function diaIsoDeFecha(fecha: string): number {
  const diaJs = new Date(`${fecha}T12:00:00-05:00`).getDay();
  return diaJs === 0 ? 7 : diaJs;
}

export const NOMBRES_DIA_ISO: Record<number, string> = {
  1: 'Lunes',
  2: 'Martes',
  3: 'Miércoles',
  4: 'Jueves',
  5: 'Viernes',
  6: 'Sábado',
  7: 'Domingo',
};

export interface VentaPorDiaSemana {
  diaIso: number;
  totalVendido: number;
  apariciones: number;
}

/** Total vendido y cantidad de apariciones (fechas distintas) agrupado por día ISO de la semana. */
export function calcularVentasPorDiaSemana(lineas: LineaVentaConContexto[]): VentaPorDiaSemana[] {
  const acumulado = new Map<number, { totalVendido: number; fechas: Set<string> }>();

  for (const linea of lineas) {
    const diaIso = diaIsoDeFecha(linea.eventoFecha);
    const actual = acumulado.get(diaIso) ?? { totalVendido: 0, fechas: new Set<string>() };
    actual.totalVendido += linea.totalLinea;
    actual.fechas.add(linea.eventoFecha);
    acumulado.set(diaIso, actual);
  }

  return [1, 2, 3, 4, 5, 6, 7].map((diaIso) => {
    const datos = acumulado.get(diaIso);
    return {
      diaIso,
      totalVendido: datos?.totalVendido ?? 0,
      apariciones: datos?.fechas.size ?? 0,
    };
  });
}

export interface VentaPorTemporada {
  nombre: string;
  totalVendido: number;
  apariciones: number;
  /** totalVendido / apariciones — 0 si no hubo apariciones. */
  promedioPorEvento: number;
}

/**
 * Agrupa el total vendido por temporada (según `temporadaDe`) y por
 * "Temporada normal" (todo lo que no cae en ninguna temporada dada) — para
 * comparar el promedio por evento de cada temporada contra el resto del año.
 */
export function calcularVentasPorTemporada(
  lineas: LineaVentaConContexto[],
  temporadas: { nombre: string; desde: string; hasta: string }[]
): VentaPorTemporada[] {
  const NORMAL = 'Temporada normal';
  const acumulado = new Map<string, { totalVendido: number; fechas: Set<string> }>();

  for (const linea of lineas) {
    const nombre = temporadas.find((t) => linea.eventoFecha >= t.desde && linea.eventoFecha <= t.hasta)?.nombre ?? NORMAL;
    const actual = acumulado.get(nombre) ?? { totalVendido: 0, fechas: new Set<string>() };
    actual.totalVendido += linea.totalLinea;
    actual.fechas.add(linea.eventoFecha);
    acumulado.set(nombre, actual);
  }

  return [...acumulado.entries()]
    .map(([nombre, datos]) => ({
      nombre,
      totalVendido: datos.totalVendido,
      apariciones: datos.fechas.size,
      promedioPorEvento: datos.fechas.size === 0 ? 0 : Math.round(datos.totalVendido / datos.fechas.size),
    }))
    .sort((a, b) => (a.nombre === NORMAL ? 1 : b.nombre === NORMAL ? -1 : b.promedioPorEvento - a.promedioPorEvento));
}

const TOP_PUNTOS_MAPA_CALOR = 8;
const TOP_PRODUCTOS_MAPA_CALOR = 10;

export interface CeldaMapaCalor {
  puntoId: string;
  productoId: string;
  unidades: number;
}

export interface MapaCalorPuntoProducto {
  puntos: { id: string; etiqueta: string }[];
  productos: { id: string; etiqueta: string }[];
  celdas: CeldaMapaCalor[];
  /** Cuántos puntos/productos quedaron fuera del top mostrado — para que la UI avise, nunca oculte en silencio (CLAUDE.md §8). */
  puntosOmitidos: number;
  productosOmitidos: number;
}

/**
 * Unidades vendidas por combinación punto×producto, acotado a los puntos y
 * productos más activos (top por unidades totales) para que la grilla no
 * crezca sin control con catálogos grandes.
 */
export function calcularMapaCalorPuntoProducto(lineas: LineaVentaConContexto[]): MapaCalorPuntoProducto {
  const unidadesPorPunto = new Map<string, { etiqueta: string; unidades: number }>();
  const unidadesPorProducto = new Map<string, { etiqueta: string; unidades: number }>();
  const unidadesPorCelda = new Map<string, number>();

  for (const linea of lineas) {
    const punto = unidadesPorPunto.get(linea.puntoId) ?? { etiqueta: linea.puntoNombre, unidades: 0 };
    punto.unidades += linea.cantidad;
    unidadesPorPunto.set(linea.puntoId, punto);

    const producto = unidadesPorProducto.get(linea.productoId) ?? { etiqueta: linea.productoNombre, unidades: 0 };
    producto.unidades += linea.cantidad;
    unidadesPorProducto.set(linea.productoId, producto);

    const claveCelda = `${linea.puntoId}|${linea.productoId}`;
    unidadesPorCelda.set(claveCelda, (unidadesPorCelda.get(claveCelda) ?? 0) + linea.cantidad);
  }

  const puntosOrdenados = [...unidadesPorPunto.entries()].sort((a, b) => b[1].unidades - a[1].unidades);
  const productosOrdenados = [...unidadesPorProducto.entries()].sort((a, b) => b[1].unidades - a[1].unidades);

  const puntosTop = puntosOrdenados.slice(0, TOP_PUNTOS_MAPA_CALOR);
  const productosTop = productosOrdenados.slice(0, TOP_PRODUCTOS_MAPA_CALOR);
  const puntosTopIds = new Set(puntosTop.map(([id]) => id));
  const productosTopIds = new Set(productosTop.map(([id]) => id));

  const celdas: CeldaMapaCalor[] = [];
  for (const [clave, unidades] of unidadesPorCelda) {
    const [puntoId, productoId] = clave.split('|');
    if (puntosTopIds.has(puntoId) && productosTopIds.has(productoId)) {
      celdas.push({ puntoId, productoId, unidades });
    }
  }

  return {
    puntos: puntosTop.map(([id, datos]) => ({ id, etiqueta: datos.etiqueta })),
    productos: productosTop.map(([id, datos]) => ({ id, etiqueta: datos.etiqueta })),
    celdas,
    puntosOmitidos: Math.max(0, puntosOrdenados.length - TOP_PUNTOS_MAPA_CALOR),
    productosOmitidos: Math.max(0, productosOrdenados.length - TOP_PRODUCTOS_MAPA_CALOR),
  };
}

export interface MetodoPagoConteo {
  metodoPago: MetodoPago;
  cantidad: number;
  pct: number;
}

export interface EntidadMetodoPago {
  id: string;
  nombre: string;
  totalVentas: number;
  porMetodo: MetodoPagoConteo[];
}

/** Ventas distintas (por `ventaId`, para no contar dos veces una venta con varias líneas de producto) agrupadas por una clave arbitraria, con su método de pago. */
function ventasUnicasPorClave(
  lineas: LineaVentaConContexto[],
  clave: (l: LineaVentaConContexto) => string,
  nombre: (l: LineaVentaConContexto) => string
): Map<string, { nombre: string; ventas: Map<string, MetodoPago> }> {
  const mapa = new Map<string, { nombre: string; ventas: Map<string, MetodoPago> }>();
  for (const linea of lineas) {
    const k = clave(linea);
    const actual = mapa.get(k) ?? { nombre: nombre(linea), ventas: new Map<string, MetodoPago>() };
    actual.ventas.set(linea.ventaId, linea.metodoPago);
    mapa.set(k, actual);
  }
  return mapa;
}

function calcularPorMetodo(ventas: Map<string, MetodoPago>): MetodoPagoConteo[] {
  const conteo = new Map<MetodoPago, number>();
  for (const metodo of ventas.values()) {
    conteo.set(metodo, (conteo.get(metodo) ?? 0) + 1);
  }
  const total = ventas.size;
  return (['EFECTIVO', 'TRANSFERENCIA', 'LIBRANZA'] as MetodoPago[])
    .map((metodoPago) => {
      const cantidad = conteo.get(metodoPago) ?? 0;
      return { metodoPago, cantidad, pct: total === 0 ? 0 : Math.round((cantidad / total) * 100) };
    })
    .filter((m) => m.cantidad > 0);
}

/** Por punto: qué % de sus ventas (no líneas) usa cada método de pago. */
export function calcularMetodoPagoPorPunto(lineas: LineaVentaConContexto[]): EntidadMetodoPago[] {
  const agrupado = ventasUnicasPorClave(
    lineas,
    (l) => l.puntoId,
    (l) => l.puntoNombre
  );
  return [...agrupado.entries()]
    .map(([id, datos]) => ({
      id,
      nombre: datos.nombre,
      totalVentas: datos.ventas.size,
      porMetodo: calcularPorMetodo(datos.ventas),
    }))
    .sort((a, b) => b.totalVentas - a.totalVentas);
}

/** Por promotor: qué % de sus ventas usa cada método de pago. */
export function calcularMetodoPagoPorPromotor(lineas: LineaVentaConContexto[]): EntidadMetodoPago[] {
  const agrupado = ventasUnicasPorClave(
    lineas,
    (l) => l.promotorId,
    (l) => l.promotorNombre
  );
  return [...agrupado.entries()]
    .map(([id, datos]) => ({
      id,
      nombre: datos.nombre,
      totalVentas: datos.ventas.size,
      porMetodo: calcularPorMetodo(datos.ventas),
    }))
    .sort((a, b) => b.totalVentas - a.totalVentas);
}

/**
 * Recomendaciones — la capa final de Análisis: las gráficas y tablas de
 * arriba EXISTEN para justificar estas frases, nunca al revés. Cada
 * recomendación nace de una señal que las funciones de este archivo ya
 * calcularon (nunca un número nuevo inventado aquí) y apunta, vía
 * `seccion`, a la parte de la pantalla que la respalda — para que la UI
 * pueda saltar directo a la gráfica correspondiente.
 */
export type PrioridadRecomendacion = 'ALTA' | 'MEDIA' | 'BAJA';

export type SeccionAnalisis =
  | 'REPETIBILIDAD'
  | 'RENDIMIENTO'
  | 'DISPERSION'
  | 'METODO_PAGO'
  | 'HALLAZGOS';

export interface Recomendacion {
  id: string;
  prioridad: PrioridadRecomendacion;
  seccion: SeccionAnalisis;
  titulo: string;
  detalle: string;
}

/** A partir de qué |desviación %| una recomendación de mix de promotor se considera prioridad ALTA en vez de MEDIA. */
const UMBRAL_DESVIACION_ALTA_PCT = 50;
/** A partir de qué |desviación %| un hallazgo cruzado se considera prioridad ALTA. */
const UMBRAL_HALLAZGO_ALTA_PCT = 60;
/** Máximo de recomendaciones por categoría, para no saturar la pantalla con la cola larga de señales débiles. */
const TOPE_POR_CATEGORIA = 5;
/** Un método de pago por encima de este % en un punto se considera "dominante" y amerita una nota operativa. */
const UMBRAL_METODO_DOMINANTE_PCT = 80;
/** Mínimo de ventas para que valga la pena reportar el método de pago dominante de un punto (evita ruido con 1-2 ventas). */
const MINIMO_VENTAS_METODO_DOMINANTE = 5;

/**
 * Producto con tendencia de repetición SUBIENDO en un punto → sugiere llevar
 * más. BAJANDO mientras sigue en el top → sugiere reconsiderar cuánto llevar
 * (nunca "dejar de llevar": con datos insuficientes para eso, ver
 * `datosInsuficientes` de `RepetibilidadPunto`).
 */
function recomendacionesRepetibilidad(porPunto: RepetibilidadPunto[]): Recomendacion[] {
  const candidatas: Recomendacion[] = [];

  for (const punto of porPunto) {
    if (punto.datosInsuficientes) continue;

    for (const producto of punto.productos) {
      if (producto.tendencia === 'SUBIENDO' && producto.tasaRepeticion >= 0.5) {
        candidatas.push({
          id: `repetibilidad-sube-${punto.puntoId}-${producto.productoId}`,
          prioridad: producto.tasaRepeticion === 1 ? 'ALTA' : 'MEDIA',
          seccion: 'REPETIBILIDAD',
          titulo: `Llevar más ${producto.productoNombre} a ${punto.puntoNombre}`,
          detalle: `Viene en el top de ventas ${producto.vecesEnTopN} de ${producto.apariciones} eventos, con tendencia al alza.`,
        });
      } else if (producto.tendencia === 'BAJANDO' && producto.tasaRepeticion >= 0.5) {
        candidatas.push({
          id: `repetibilidad-baja-${punto.puntoId}-${producto.productoId}`,
          prioridad: 'BAJA',
          seccion: 'REPETIBILIDAD',
          titulo: `Reconsiderar cuánto ${producto.productoNombre} llevar a ${punto.puntoNombre}`,
          detalle: `Sigue en el top de ventas (${producto.vecesEnTopN} de ${producto.apariciones} eventos), pero la tendencia va a la baja.`,
        });
      }
    }
  }

  return candidatas;
}

/**
 * Promotor que vende un producto muy por encima del resto → aprovechar ese
 * mix en vez de tratarlo igual que a los demás (ej. priorizarlo en la
 * recarga de ese producto, o replicar su enfoque con otros promotores).
 */
function recomendacionesRendimiento(porPromotor: RendimientoPromotor[]): Recomendacion[] {
  const candidatas: Recomendacion[] = [];

  for (const promotor of porPromotor) {
    for (const desviacion of promotor.mixDestacado) {
      if (desviacion.desviacionPct <= 0) continue; // solo "vende más" es accionable como recomendación positiva
      candidatas.push({
        id: `rendimiento-${promotor.promotorId}-${desviacion.productoId}`,
        prioridad: desviacion.desviacionPct >= UMBRAL_DESVIACION_ALTA_PCT ? 'ALTA' : 'MEDIA',
        seccion: 'RENDIMIENTO',
        titulo: `Aprovechar que ${promotor.promotorNombre} vende bien ${desviacion.productoNombre}`,
        detalle: `Vende ${desviacion.desviacionPct}% más que el resto de promotores en este producto — priorizarlo en su próxima recarga.`,
      });
    }
  }

  return candidatas;
}

/** Combinación punto+promotor+producto con desviación fuerte → señal muy específica de dónde reforzar el cargue. */
function recomendacionesHallazgos(hallazgos: HallazgoCruzado[]): Recomendacion[] {
  return hallazgos
    .filter((h) => h.desviacionPct > 0)
    .map((h) => ({
      id: `hallazgo-${h.puntoId}-${h.promotorId}-${h.productoId}`,
      prioridad: (h.desviacionPct >= UMBRAL_HALLAZGO_ALTA_PCT ? 'ALTA' : 'MEDIA') as PrioridadRecomendacion,
      seccion: 'HALLAZGOS' as const,
      titulo: `Reforzar ${h.productoNombre} para ${h.promotorNombre} en ${h.puntoNombre}`,
      detalle: `${h.desviacionPct}% más que el resto de promotores en ese mismo punto (${h.aparicionesEnPunto} eventos).`,
    }));
}

/** Correlación fuerte entre eventos trabajados y ticket promedio → sugiere dónde enfocar la programación de turnos. */
function recomendacionesDispersion(dispersion: DispersionPromotores): Recomendacion[] {
  if (dispersion.correlacion === null) return [];
  if (interpretarFuerzaPearson(dispersion.correlacion) !== 'fuerte') return [];

  const positiva = dispersion.correlacion > 0;
  return [
    {
      id: 'dispersion-correlacion',
      prioridad: 'MEDIA',
      seccion: 'DISPERSION',
      titulo: positiva
        ? 'Priorizar más eventos para los promotores de mejor ticket'
        : 'Revisar la carga de eventos de los promotores con mejor ticket',
      detalle: `Correlación ${positiva ? 'positiva' : 'negativa'} fuerte (r = ${dispersion.correlacion.toFixed(2)}) entre eventos trabajados y ticket promedio.`,
    },
  ];
}

/** Punto con un método de pago muy dominante → nota operativa (ej. asegurar cambio en efectivo, o promover otro medio). */
function recomendacionesMetodoPago(metodoPorPunto: EntidadMetodoPago[]): Recomendacion[] {
  const candidatas: Recomendacion[] = [];

  for (const punto of metodoPorPunto) {
    if (punto.totalVentas < MINIMO_VENTAS_METODO_DOMINANTE) continue;
    const dominante = punto.porMetodo.find((m) => m.pct >= UMBRAL_METODO_DOMINANTE_PCT);
    if (!dominante || dominante.metodoPago !== 'EFECTIVO') continue;

    candidatas.push({
      id: `metodo-pago-${punto.id}`,
      prioridad: 'BAJA',
      seccion: 'METODO_PAGO',
      titulo: `Reforzar el manejo de efectivo en ${punto.nombre}`,
      detalle: `${dominante.pct}% de las ventas de este punto son en efectivo — asegurar cambio suficiente y el arqueo de caja al cierre.`,
    });
  }

  return candidatas;
}

/**
 * Junta y prioriza todas las recomendaciones — ALTA primero, y hasta
 * `TOPE_POR_CATEGORIA` por sección para que la lista no se llene de la cola
 * larga de señales débiles y quede ilegible. Nunca oculta en silencio: si
 * hay más candidatas que el tope, el llamador puede usar `total` (antes de
 * cortar) para avisarlo.
 */
export function generarRecomendaciones(datos: {
  porPunto: RepetibilidadPunto[];
  porPromotor: RendimientoPromotor[];
  hallazgos: HallazgoCruzado[];
  dispersion: DispersionPromotores;
  metodoPorPunto: EntidadMetodoPago[];
}): Recomendacion[] {
  const ORDEN_PRIORIDAD: Record<PrioridadRecomendacion, number> = { ALTA: 0, MEDIA: 1, BAJA: 2 };

  const porCategoria: Recomendacion[][] = [
    recomendacionesRepetibilidad(datos.porPunto),
    recomendacionesRendimiento(datos.porPromotor),
    recomendacionesHallazgos(datos.hallazgos),
    recomendacionesDispersion(datos.dispersion),
    recomendacionesMetodoPago(datos.metodoPorPunto),
  ];

  const recortadas = porCategoria.flatMap((categoria) =>
    [...categoria]
      .sort((a, b) => ORDEN_PRIORIDAD[a.prioridad] - ORDEN_PRIORIDAD[b.prioridad])
      .slice(0, TOPE_POR_CATEGORIA)
  );

  return recortadas.sort((a, b) => ORDEN_PRIORIDAD[a.prioridad] - ORDEN_PRIORIDAD[b.prioridad]);
}
