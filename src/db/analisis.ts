import type { SQLiteDatabase } from 'expo-sqlite';

import {
  calcularCrucePuntoPromotorProducto,
  calcularRendimientoPorPromotor,
  calcularRepetibilidadPorPunto,
  type HallazgoCruzado,
  type LineaVentaConContexto,
  type RendimientoPromotor,
  type RepetibilidadPunto,
} from '@/core/analisis';
import { fechaBogota } from '@/core/analitica';

import { resolverVentaIdsFiltradas, clausulaIn, type FiltrosVentas, type RangoFechas } from './analitica';

/**
 * Trae cada línea de venta (activa, no anulada) del rango con su punto,
 * promotor y producto ya resueltos — la fecha de evento se deriva en
 * TypeScript con `fechaBogota` (no en SQL, mismo motivo que `porHora` en
 * `obtenerResumenVentas`: SQLite no convierte zonas horarias). Solo ventas
 * con `punto_id` conocido entran aquí — sin punto no hay "aparición" que
 * comparar (ver ADR 0005, `punto_id` es opcional en `ventas`).
 */
async function obtenerLineasVentaConContexto(
  db: SQLiteDatabase,
  rango: RangoFechas,
  filtros: FiltrosVentas = {}
): Promise<LineaVentaConContexto[]> {
  const ids = await resolverVentaIdsFiltradas(db, rango, filtros);
  if (ids.length === 0) return [];

  const filas = await db.getAllAsync<{
    ts_cliente: string;
    punto_id: string | null;
    punto_nombre: string | null;
    promotor_id: string;
    promotor_nombre: string;
    producto_id: string;
    producto_nombre: string;
    cantidad: number;
    total_linea: number;
  }>(
    `SELECT v.ts_cliente, v.punto_id, pt.nombre as punto_nombre,
            v.promotor_id, u.nombre as promotor_nombre,
            vi.producto_id, p.nombre as producto_nombre,
            vi.cantidad, vi.cantidad * vi.precio_unitario as total_linea
     FROM venta_items vi
     JOIN ventas v ON v.id = vi.venta_id
     JOIN usuarios u ON u.id = v.promotor_id
     JOIN productos p ON p.id = vi.producto_id
     LEFT JOIN puntos pt ON pt.id = v.punto_id
     WHERE vi.venta_id IN (${clausulaIn(ids)})`,
    ids
  );

  return filas
    .filter((fila) => fila.punto_id !== null && fila.punto_nombre !== null)
    .map((fila) => ({
      eventoFecha: fechaBogota(fila.ts_cliente),
      puntoId: fila.punto_id as string,
      puntoNombre: fila.punto_nombre as string,
      promotorId: fila.promotor_id,
      promotorNombre: fila.promotor_nombre,
      productoId: fila.producto_id,
      productoNombre: fila.producto_nombre,
      cantidad: fila.cantidad,
      totalLinea: fila.total_linea,
    }));
}

/** Por punto: qué productos se repiten como top-vendidos evento tras evento, y su tendencia. */
export async function obtenerRepetibilidadPorPunto(
  db: SQLiteDatabase,
  rango: RangoFechas,
  filtros: FiltrosVentas = {}
): Promise<RepetibilidadPunto[]> {
  const lineas = await obtenerLineasVentaConContexto(db, rango, filtros);
  return calcularRepetibilidadPorPunto(lineas);
}

/** Por promotor: ticket promedio por evento y mix de producto destacado frente al resto. */
export async function obtenerRendimientoPorPromotor(
  db: SQLiteDatabase,
  rango: RangoFechas,
  filtros: FiltrosVentas = {}
): Promise<RendimientoPromotor[]> {
  const lineas = await obtenerLineasVentaConContexto(db, rango, filtros);
  return calcularRendimientoPorPromotor(lineas);
}

/** Hallazgos cruzados punto × promotor × producto, ordenados por magnitud de desviación. */
export async function obtenerCrucePuntoPromotorProducto(
  db: SQLiteDatabase,
  rango: RangoFechas,
  filtros: FiltrosVentas = {}
): Promise<HallazgoCruzado[]> {
  const lineas = await obtenerLineasVentaConContexto(db, rango, filtros);
  return calcularCrucePuntoPromotorProducto(lineas);
}
