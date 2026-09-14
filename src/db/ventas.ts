import * as Crypto from 'expo-crypto';
import type { SQLiteDatabase } from 'expo-sqlite';

import type { MetodoPago, Pesos, Venta, VentaItem } from '@/core/tipos';

import { registrarMovimiento } from './movimientos';
import { obtenerOCrearUbicacionPromotor } from './ubicaciones';

interface ItemVenta {
  productoId: string;
  productoNombre: string;
  cantidad: number;
  precioUnitario: Pesos;
}

interface DatosVenta {
  promotorId: string;
  promotorNombre: string;
  items: ItemVenta[];
  metodoPago: MetodoPago;
}

async function generarNumeroRecibo(db: SQLiteDatabase, dispositivoId: string): Promise<string> {
  const prefijo = dispositivoId.slice(0, 4).toUpperCase();
  const fila = await db.getFirstAsync<{ total: number }>(
    'SELECT COUNT(*) as total FROM ventas WHERE dispositivo_id = ?',
    [dispositivoId]
  );
  const consecutivo = (fila?.total ?? 0) + 1;
  return `${prefijo}-${consecutivo.toString().padStart(6, '0')}`;
}

/**
 * Registra una venta: cabecera + líneas + un movimiento VENTA por producto
 * (sale del saldo del promotor), todo en una sola transacción.
 */
export async function registrarVenta(
  db: SQLiteDatabase,
  datos: DatosVenta,
  dispositivoId: string
): Promise<Venta> {
  const id = Crypto.randomUUID();
  const ahora = new Date().toISOString();
  const total = datos.items.reduce((suma, item) => suma + item.cantidad * item.precioUnitario, 0);

  await db.withTransactionAsync(async () => {
    const numeroRecibo = await generarNumeroRecibo(db, dispositivoId);

    await db.runAsync(
      `INSERT INTO ventas (id, numero_recibo, promotor_id, ts_cliente, metodo_pago, total, dispositivo_id)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [id, numeroRecibo, datos.promotorId, ahora, datos.metodoPago, total, dispositivoId]
    );

    const ubicacionPromotor = await obtenerOCrearUbicacionPromotor(
      db,
      datos.promotorId,
      datos.promotorNombre,
      dispositivoId
    );

    for (const item of datos.items) {
      await db.runAsync(
        `INSERT INTO venta_items (venta_id, producto_id, cantidad, precio_unitario, ts_cliente, dispositivo_id)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [id, item.productoId, item.cantidad, item.precioUnitario, ahora, dispositivoId]
      );
      await registrarMovimiento(
        db,
        {
          tipo: 'VENTA',
          productoId: item.productoId,
          cantidad: item.cantidad,
          ubicacionOrigenId: ubicacionPromotor,
          ubicacionDestinoId: null,
          usuarioId: datos.promotorId,
        },
        dispositivoId
      );
    }
  });

  const creada = await obtenerVenta(db, id);
  if (!creada) throw new Error('No se pudo registrar la venta');
  return creada.venta;
}

export async function listarVentas(db: SQLiteDatabase): Promise<Venta[]> {
  const filas = await db.getAllAsync<{
    id: string;
    numero_recibo: string;
    promotor_id: string;
    promotor_nombre: string;
    ts_cliente: string;
    metodo_pago: MetodoPago;
    total: number;
  }>(
    `SELECT v.id, v.numero_recibo, v.promotor_id, u.nombre as promotor_nombre,
            v.ts_cliente, v.metodo_pago, v.total
     FROM ventas v
     JOIN usuarios u ON u.id = v.promotor_id
     ORDER BY v.ts_cliente DESC`
  );
  return filas.map((fila) => ({
    id: fila.id,
    numeroRecibo: fila.numero_recibo,
    promotorId: fila.promotor_id,
    promotorNombre: fila.promotor_nombre,
    tsCliente: fila.ts_cliente,
    metodoPago: fila.metodo_pago,
    total: fila.total,
  }));
}

export async function obtenerVenta(
  db: SQLiteDatabase,
  id: string
): Promise<{ venta: Venta; items: VentaItem[] } | null> {
  const fila = await db.getFirstAsync<{
    id: string;
    numero_recibo: string;
    promotor_id: string;
    promotor_nombre: string;
    ts_cliente: string;
    metodo_pago: MetodoPago;
    total: number;
  }>(
    `SELECT v.id, v.numero_recibo, v.promotor_id, u.nombre as promotor_nombre,
            v.ts_cliente, v.metodo_pago, v.total
     FROM ventas v
     JOIN usuarios u ON u.id = v.promotor_id
     WHERE v.id = ?`,
    [id]
  );
  if (!fila) return null;

  const lineas = await db.getAllAsync<{
    producto_id: string;
    producto_nombre: string;
    cantidad: number;
    precio_unitario: number;
  }>(
    `SELECT vi.producto_id, p.nombre as producto_nombre, vi.cantidad, vi.precio_unitario
     FROM venta_items vi
     JOIN productos p ON p.id = vi.producto_id
     WHERE vi.venta_id = ?`,
    [id]
  );

  return {
    venta: {
      id: fila.id,
      numeroRecibo: fila.numero_recibo,
      promotorId: fila.promotor_id,
      promotorNombre: fila.promotor_nombre,
      tsCliente: fila.ts_cliente,
      metodoPago: fila.metodo_pago,
      total: fila.total,
    },
    items: lineas.map((linea) => ({
      productoId: linea.producto_id,
      productoNombre: linea.producto_nombre,
      cantidad: linea.cantidad,
      precioUnitario: linea.precio_unitario,
    })),
  };
}
