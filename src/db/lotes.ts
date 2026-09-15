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
