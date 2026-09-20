import * as Crypto from 'expo-crypto';
import type { SQLiteDatabase } from 'expo-sqlite';

import type { Conteo, ConteoLinea } from '@/core/tipos';

import { obtenerSaldosPromotor } from './inventario';
import { registrarMovimiento } from './movimientos';
import { obtenerProductosPorIds } from './productos';
import { obtenerOCrearUbicacionPromotor } from './ubicaciones';

interface LineaContada {
  productoId: string;
  contado: number;
  motivo?: string | null;
}

interface DatosConteo {
  promotorId: string;
  promotorNombre: string;
  lineas: LineaContada[];
}

interface FilaConteo {
  id: string;
  promotor_id: string;
  promotor_nombre: string;
  ts_cliente: string;
  estado: Conteo['estado'];
}

function aConteo(fila: FilaConteo): Conteo {
  return {
    id: fila.id,
    promotorId: fila.promotor_id,
    promotorNombre: fila.promotor_nombre,
    tsCliente: fila.ts_cliente,
    estado: fila.estado,
  };
}

/**
 * Teórico actual del promotor (todo lo que tiene saldo, incluye ceros) para
 * mostrar en la pantalla de conteo antes de que capture lo contado.
 */
export async function obtenerTeoricoParaConteo(
  db: SQLiteDatabase,
  promotorId: string
): Promise<{ productoId: string; productoNombre: string; teorico: number }[]> {
  const saldos = await obtenerSaldosPromotor(db, promotorId);
  const productos = await obtenerProductosPorIds(db, [...saldos.keys()]);

  const items = [...saldos.entries()]
    .map(([productoId, teorico]) => {
      const producto = productos.get(productoId);
      if (!producto) return null;
      return { productoId, productoNombre: producto.nombre, teorico };
    })
    .filter((item): item is { productoId: string; productoNombre: string; teorico: number } => item !== null);

  items.sort((a, b) => a.productoNombre.localeCompare(b.productoNombre));
  return items;
}

/**
 * Registra un conteo de cierre: cabecera + una línea por producto (teórico
 * vs. contado) + un AJUSTE_CONTEO por cada línea con diferencia, para que el
 * saldo real converja exactamente a lo contado (R1: nunca se pisa un saldo,
 * se inserta el movimiento que lo explica).
 *
 * R7 (aprobación de descuadres por encima de un umbral) todavía no está
 * implementado — el umbral en pesos sigue sin definir (CLAUDE.md sección
 * 11). Por ahora todo conteo queda CERRADO de una vez, sin bloquear la
 * siguiente recarga.
 */
export async function registrarConteo(
  db: SQLiteDatabase,
  datos: DatosConteo,
  dispositivoId: string
): Promise<Conteo> {
  const id = Crypto.randomUUID();
  const ahora = new Date().toISOString();
  const saldosActuales = await obtenerSaldosPromotor(db, datos.promotorId);

  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `INSERT INTO conteos (id, promotor_id, ts_cliente, estado, dispositivo_id)
       VALUES (?, ?, ?, 'CERRADO', ?)`,
      [id, datos.promotorId, ahora, dispositivoId]
    );

    const ubicacionPromotor = await obtenerOCrearUbicacionPromotor(
      db,
      datos.promotorId,
      datos.promotorNombre,
      dispositivoId
    );

    for (const linea of datos.lineas) {
      const teorico = saldosActuales.get(linea.productoId) ?? 0;
      const diferencia = linea.contado - teorico;

      await db.runAsync(
        `INSERT INTO conteo_lineas (conteo_id, producto_id, teorico, contado, diferencia, motivo, ts_cliente, dispositivo_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, linea.productoId, teorico, linea.contado, diferencia, linea.motivo ?? null, ahora, dispositivoId]
      );

      if (diferencia === 0) continue;

      await registrarMovimiento(
        db,
        {
          tipo: 'AJUSTE_CONTEO',
          productoId: linea.productoId,
          cantidad: Math.abs(diferencia),
          ubicacionOrigenId: diferencia < 0 ? ubicacionPromotor : null,
          ubicacionDestinoId: diferencia > 0 ? ubicacionPromotor : null,
          usuarioId: datos.promotorId,
          motivo: linea.motivo ?? null,
        },
        dispositivoId
      );
    }
  });

  const creado = await obtenerConteo(db, id);
  if (!creado) throw new Error('No se pudo registrar el conteo');
  return creado.conteo;
}

export async function listarConteos(db: SQLiteDatabase): Promise<Conteo[]> {
  const filas = await db.getAllAsync<FilaConteo>(
    `SELECT c.id, c.promotor_id, u.nombre as promotor_nombre, c.ts_cliente, c.estado
     FROM conteos c
     JOIN usuarios u ON u.id = c.promotor_id
     ORDER BY c.ts_cliente DESC`
  );
  return filas.map(aConteo);
}

export async function obtenerConteo(
  db: SQLiteDatabase,
  id: string
): Promise<{ conteo: Conteo; lineas: ConteoLinea[] } | null> {
  const fila = await db.getFirstAsync<FilaConteo>(
    `SELECT c.id, c.promotor_id, u.nombre as promotor_nombre, c.ts_cliente, c.estado
     FROM conteos c
     JOIN usuarios u ON u.id = c.promotor_id
     WHERE c.id = ?`,
    [id]
  );
  if (!fila) return null;

  const lineas = await db.getAllAsync<{
    producto_id: string;
    producto_nombre: string;
    teorico: number;
    contado: number;
    diferencia: number;
    motivo: string | null;
  }>(
    `SELECT cl.producto_id, p.nombre as producto_nombre, cl.teorico, cl.contado, cl.diferencia, cl.motivo
     FROM conteo_lineas cl
     JOIN productos p ON p.id = cl.producto_id
     WHERE cl.conteo_id = ?
     ORDER BY p.nombre ASC`,
    [id]
  );

  return {
    conteo: aConteo(fila),
    lineas: lineas.map((linea) => ({
      productoId: linea.producto_id,
      productoNombre: linea.producto_nombre,
      teorico: linea.teorico,
      contado: linea.contado,
      diferencia: linea.diferencia,
      motivo: linea.motivo,
    })),
  };
}
