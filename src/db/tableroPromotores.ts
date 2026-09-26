import type { SQLiteDatabase } from 'expo-sqlite';

import { calcularRangoDiaBogota } from '@/core/analitica';
import { mensajeDeError } from '@/core/errores';
import type { Evento, MetodoPago, Pesos } from '@/core/tipos';
import { getSupabaseClient } from '@/sync/supabaseClient';

/**
 * Lo que el admin ve de cada promotor en "Promotores del día" (calendario):
 * cuánto lleva facturado y en qué medio de pago, y si ya cerró (arqueo de
 * caja y conteo de cierre). Una factura es cualquier venta; las de
 * transferencia además llevan foto del comprobante.
 */
export interface CifrasVentas {
  totalVendido: Pesos;
  /** Facturas activas (sin anuladas). */
  facturas: number;
  anuladas: number;
  porMetodo: Record<MetodoPago, Pesos>;
}

function cifrasVacias(): CifrasVentas {
  return { totalVendido: 0, facturas: 0, anuladas: 0, porMetodo: { EFECTIVO: 0, TRANSFERENCIA: 0, LIBRANZA: 0 } };
}

interface FilaAgrupada {
  clave: string;
  metodo_pago: MetodoPago;
  anulada: number;
  total: number;
  cantidad: number;
}

function acumular(mapa: Map<string, CifrasVentas>, fila: FilaAgrupada): void {
  const cifras = mapa.get(fila.clave) ?? cifrasVacias();
  if (fila.anulada) {
    cifras.anuladas += fila.cantidad;
  } else {
    cifras.facturas += fila.cantidad;
    cifras.totalVendido += fila.total;
    cifras.porMetodo[fila.metodo_pago] += fila.total;
  }
  mapa.set(fila.clave, cifras);
}

/**
 * Cifras de cada promotor en `fecha` (día en Bogotá), de TODO su día —
 * aunque haya estado en dos eventos. En el dispositivo del admin las ventas
 * de los celulares llegan de Supabase (`descargarVentasNuevas`, con Realtime).
 */
export async function obtenerCifrasPromotoresDelDia(
  db: SQLiteDatabase,
  fecha: string
): Promise<Map<string, CifrasVentas>> {
  const { desde, hasta } = calcularRangoDiaBogota(fecha);
  const filas = await db.getAllAsync<FilaAgrupada>(
    `SELECT promotor_id as clave, metodo_pago, anulada, SUM(total) as total, COUNT(*) as cantidad
     FROM ventas
     WHERE ts_cliente BETWEEN ? AND ?
     GROUP BY promotor_id, metodo_pago, anulada`,
    [desde, hasta]
  );
  const mapa = new Map<string, CifrasVentas>();
  for (const fila of filas) acumular(mapa, fila);
  return mapa;
}

/** Lo vendido en un evento: en su punto, ese día — el total y por integrante (incluido quien ya se fue). */
export interface ResumenVentasEvento extends CifrasVentas {
  porPromotor: { promotorId: string; promotorNombre: string; cifras: CifrasVentas }[];
}

export async function obtenerResumenVentasEvento(db: SQLiteDatabase, evento: Evento): Promise<ResumenVentasEvento> {
  const { desde, hasta } = calcularRangoDiaBogota(evento.fecha);
  const filas = await db.getAllAsync<FilaAgrupada & { promotor_nombre: string }>(
    `SELECT v.promotor_id as clave, u.nombre as promotor_nombre, v.metodo_pago, v.anulada,
            SUM(v.total) as total, COUNT(*) as cantidad
     FROM ventas v
     JOIN usuarios u ON u.id = v.promotor_id
     WHERE v.punto_id = ? AND v.ts_cliente BETWEEN ? AND ?
     GROUP BY v.promotor_id, v.metodo_pago, v.anulada`,
    [evento.puntoId, desde, hasta]
  );
  const porPromotor = new Map<string, CifrasVentas>();
  const nombres = new Map(evento.promotorIds.map((id, i) => [id, evento.promotorNombres[i]]));
  for (const id of evento.promotorIds) porPromotor.set(id, cifrasVacias());
  const total = new Map<string, CifrasVentas>();
  for (const fila of filas) {
    nombres.set(fila.clave, nombres.get(fila.clave) ?? fila.promotor_nombre);
    acumular(porPromotor, fila);
    acumular(total, { ...fila, clave: 'total' });
  }
  return {
    ...(total.get('total') ?? cifrasVacias()),
    porPromotor: [...porPromotor.entries()]
      .map(([promotorId, cifras]) => ({ promotorId, promotorNombre: nombres.get(promotorId) ?? '', cifras }))
      .sort((a, b) => b.cifras.totalVendido - a.cifras.totalVendido),
  };
}

/** El cierre de un promotor ese día: su arqueo de caja (si ya lo hizo) y si ya hizo el conteo de cierre. */
export interface CierreDelDia {
  arqueo: { efectivoTeorico: Pesos; efectivoContado: Pesos; diferencia: Pesos } | null;
  conteoHecho: boolean;
}

export interface CierresDelDia {
  porPromotor: Map<string, CierreDelDia>;
  /** No se pudo consultar Supabase: solo se ve lo que se cerró en este mismo dispositivo. */
  sinConexion: boolean;
}

interface ArqueoLeido {
  promotor_id: string;
  promotor_nombre?: string | null;
  efectivo_teorico: number;
  efectivo_contado: number;
  diferencia: number;
  ts_cliente: string;
}

interface ConteoLeido {
  promotor_id: string;
  promotor_nombre?: string | null;
}

const normalizar = (nombre: string | null | undefined) => (nombre ?? '').trim().toLowerCase();

/**
 * Arqueos y conteos de `fecha` de estos promotores. El arqueo y el conteo se
 * hacen en el celular de cada promotor y solo SUBEN (no bajan al admin), así
 * que se leen de Supabase — best-effort: sin conexión, `sinConexion` y solo
 * lo local. Se reconoce a cada promotor por id y, si no, por nombre (en
 * `__DEV__` los usuarios de prueba tienen un id distinto en cada dispositivo).
 */
export async function obtenerCierresDelDia(
  db: SQLiteDatabase,
  fecha: string,
  promotores: { promotorId: string; promotorNombre: string }[]
): Promise<CierresDelDia> {
  const { desde, hasta } = calcularRangoDiaBogota(fecha);
  const arqueos: ArqueoLeido[] = await db.getAllAsync<ArqueoLeido>(
    `SELECT promotor_id, efectivo_teorico, efectivo_contado, diferencia, ts_cliente
     FROM arqueos_caja WHERE ts_cliente BETWEEN ? AND ?`,
    [desde, hasta]
  );
  const conteos: ConteoLeido[] = await db.getAllAsync<ConteoLeido>(
    'SELECT promotor_id FROM conteos WHERE ts_cliente BETWEEN ? AND ?',
    [desde, hasta]
  );

  let sinConexion = false;
  try {
    const supabase = await getSupabaseClient();
    const [remotosArqueo, remotosConteo] = await Promise.all([
      supabase
        .from('arqueos_caja')
        .select('promotor_id, promotor_nombre, efectivo_teorico, efectivo_contado, diferencia, ts_cliente')
        .gte('ts_cliente', desde)
        .lte('ts_cliente', hasta)
        .returns<ArqueoLeido[]>(),
      supabase
        .from('conteos')
        .select('promotor_id, promotor_nombre')
        .gte('ts_cliente', desde)
        .lte('ts_cliente', hasta)
        .returns<ConteoLeido[]>(),
    ]);
    if (remotosArqueo.error) throw remotosArqueo.error;
    if (remotosConteo.error) throw remotosConteo.error;
    arqueos.push(...(remotosArqueo.data ?? []));
    conteos.push(...(remotosConteo.data ?? []));
  } catch (error) {
    sinConexion = true;
    console.log('[tablero] no se pudieron leer arqueos/conteos de Supabase:', mensajeDeError(error));
  }

  const esDe = (p: { promotorId: string; promotorNombre: string }, fila: { promotor_id: string; promotor_nombre?: string | null }) =>
    fila.promotor_id === p.promotorId || (!!fila.promotor_nombre && normalizar(fila.promotor_nombre) === normalizar(p.promotorNombre));

  const porPromotor = new Map<string, CierreDelDia>();
  for (const p of promotores) {
    // Si cerró más de un turno ese día, cuenta el último arqueo.
    const suyo = arqueos
      .filter((a) => esDe(p, a))
      .sort((a, b) => new Date(b.ts_cliente).getTime() - new Date(a.ts_cliente).getTime())[0];
    porPromotor.set(p.promotorId, {
      arqueo: suyo
        ? { efectivoTeorico: suyo.efectivo_teorico, efectivoContado: suyo.efectivo_contado, diferencia: suyo.diferencia }
        : null,
      conteoHecho: conteos.some((c) => esDe(p, c)),
    });
  }
  return { porPromotor, sinConexion };
}
