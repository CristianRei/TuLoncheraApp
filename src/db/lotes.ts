import * as Crypto from 'expo-crypto';
import type { SQLiteDatabase } from 'expo-sqlite';

/**
 * Un lote agrupa unidades de un mismo producto con la misma fecha de
 * vencimiento. Opcional: solo se crea cuando la entrada de bodega trae
 * fecha de vencimiento (ver src/ui/PantallaIngresarPedido.tsx). Un
 * movimiento sin lote es un producto sin fecha de vencimiento conocida.
 */
export async function crearLote(
  db: SQLiteDatabase,
  productoId: string,
  fechaVencimiento: string,
  dispositivoId: string
): Promise<string> {
  const id = Crypto.randomUUID();
  await db.runAsync(
    `INSERT INTO lotes (id, producto_id, fecha_vencimiento, ts_cliente, dispositivo_id)
     VALUES (?, ?, ?, ?, ?)`,
    [id, productoId, fechaVencimiento, new Date().toISOString(), dispositivoId]
  );
  return id;
}

export interface LoteConVencimiento {
  id: string;
  productoId: string;
  productoNombre: string;
  fechaVencimiento: string;
}

/** Lotes con fecha de vencimiento — para cruzar contra su saldo y detectar los próximos a vencer. */
export async function listarLotesConVencimiento(db: SQLiteDatabase): Promise<LoteConVencimiento[]> {
  const filas = await db.getAllAsync<{
    id: string;
    producto_id: string;
    producto_nombre: string;
    fecha_vencimiento: string;
  }>(
    `SELECT l.id, l.producto_id, p.nombre as producto_nombre, l.fecha_vencimiento
     FROM lotes l
     JOIN productos p ON p.id = l.producto_id
     WHERE l.fecha_vencimiento IS NOT NULL`
  );
  return filas.map((fila) => ({
    id: fila.id,
    productoId: fila.producto_id,
    productoNombre: fila.producto_nombre,
    fechaVencimiento: fila.fecha_vencimiento,
  }));
}
