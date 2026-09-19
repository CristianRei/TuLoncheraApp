import type { SQLiteDatabase } from 'expo-sqlite';

import { agruparVentasPorHora, type VentasPorHora } from '@/core/analitica';
import type { MetodoPago, Pesos } from '@/core/tipos';

import { listarInventarioBodega } from './inventario';

export interface TotalPorMetodoPago {
  metodoPago: MetodoPago;
  total: Pesos;
  cantidadVentas: number;
}

export interface ProductoMasVendido {
  productoId: string;
  productoNombre: string;
  unidadesVendidas: number;
  totalVendido: Pesos;
}

export interface ResumenVentasPeriodo {
  totalVendido: Pesos;
  cantidadVentas: number;
  porMetodoPago: TotalPorMetodoPago[];
  topProductos: ProductoMasVendido[];
  porHora: VentasPorHora[];
}

export interface RangoFechas {
  /** ISO 8601 en UTC, límite inferior inclusive. */
  desde: string;
  /** ISO 8601 en UTC, límite superior inclusive. */
  hasta: string;
}

/**
 * Resumen agregado de ventas activas (no anuladas) en un rango de fechas.
 * `porMetodoPago` y `topProductos` se agregan en SQL (no dependen de zona
 * horaria); `porHora` se agrega en TypeScript puro porque SQLite no
 * convierte zonas horarias (ver src/core/analitica).
 */
export async function obtenerResumenVentas(
  db: SQLiteDatabase,
  rango: RangoFechas
): Promise<ResumenVentasPeriodo> {
  const filtro = 'v.anulada = 0 AND v.ts_cliente BETWEEN ? AND ?';
  const parametros = [rango.desde, rango.hasta];

  const totales = await db.getFirstAsync<{ total: number | null; cantidad: number }>(
    `SELECT SUM(v.total) as total, COUNT(*) as cantidad
     FROM ventas v
     WHERE ${filtro}`,
    parametros
  );

  const porMetodoPagoFilas = await db.getAllAsync<{
    metodo_pago: MetodoPago;
    total: number;
    cantidad: number;
  }>(
    `SELECT v.metodo_pago, SUM(v.total) as total, COUNT(*) as cantidad
     FROM ventas v
     WHERE ${filtro}
     GROUP BY v.metodo_pago`,
    parametros
  );

  const topProductosFilas = await db.getAllAsync<{
    producto_id: string;
    nombre: string;
    unidades: number;
    total: number;
  }>(
    `SELECT vi.producto_id, p.nombre, SUM(vi.cantidad) as unidades,
            SUM(vi.cantidad * vi.precio_unitario) as total
     FROM venta_items vi
     JOIN ventas v ON v.id = vi.venta_id
     JOIN productos p ON p.id = vi.producto_id
     WHERE ${filtro}
     GROUP BY vi.producto_id
     ORDER BY unidades DESC
     LIMIT 10`,
    parametros
  );

  const ventasCrudas = await db.getAllAsync<{ ts_cliente: string; total: number }>(
    `SELECT v.ts_cliente, v.total
     FROM ventas v
     WHERE ${filtro}`,
    parametros
  );

  return {
    totalVendido: totales?.total ?? 0,
    cantidadVentas: totales?.cantidad ?? 0,
    porMetodoPago: porMetodoPagoFilas.map((fila) => ({
      metodoPago: fila.metodo_pago,
      total: fila.total,
      cantidadVentas: fila.cantidad,
    })),
    topProductos: topProductosFilas.map((fila) => ({
      productoId: fila.producto_id,
      productoNombre: fila.nombre,
      unidadesVendidas: fila.unidades,
      totalVendido: fila.total,
    })),
    porHora: agruparVentasPorHora(
      ventasCrudas.map((fila) => ({ tsCliente: fila.ts_cliente, total: fila.total }))
    ),
  };
}

export interface SaldoTotalBodega {
  totalUnidades: number;
  /** null si ningún producto en bodega tiene costo capturado todavía. */
  valorEstimado: Pesos | null;
}

/**
 * Reutiliza `listarInventarioBodega` (ya respeta R1: saldo agregado sobre
 * movimientos) — no reimplementa el cálculo de saldos.
 */
export async function obtenerSaldoTotalBodega(db: SQLiteDatabase): Promise<SaldoTotalBodega> {
  const items = await listarInventarioBodega(db);

  const totalUnidades = items.reduce((suma, item) => suma + item.saldo, 0);

  const itemsConCosto = items.filter((item) => item.producto.costo !== null);
  const valorEstimado =
    itemsConCosto.length === 0
      ? null
      : itemsConCosto.reduce((suma, item) => suma + item.saldo * (item.producto.costo ?? 0), 0);

  return { totalUnidades, valorEstimado };
}
