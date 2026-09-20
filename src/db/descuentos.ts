import * as Crypto from 'expo-crypto';
import type { SQLiteDatabase } from 'expo-sqlite';

import type { Descuento, TipoDescuento } from '@/core/tipos';

interface FilaDescuento {
  id: string;
  producto_id: string | null;
  producto_nombre: string | null;
  punto_id: string | null;
  punto_nombre: string | null;
  tipo: TipoDescuento;
  valor: number;
  desde: string;
  hasta: string;
  activo: number;
}

const COLUMNAS_DESCUENTO = `d.id, d.producto_id, p.nombre as producto_nombre, d.punto_id, pt.nombre as punto_nombre,
   d.tipo, d.valor, d.desde, d.hasta, d.activo`;

function aDescuento(fila: FilaDescuento): Descuento {
  return {
    id: fila.id,
    productoId: fila.producto_id,
    productoNombre: fila.producto_nombre,
    puntoId: fila.punto_id,
    puntoNombre: fila.punto_nombre,
    tipo: fila.tipo,
    valor: fila.valor,
    desde: fila.desde,
    hasta: fila.hasta,
    activo: fila.activo === 1,
  };
}

export async function listarDescuentos(db: SQLiteDatabase): Promise<Descuento[]> {
  const filas = await db.getAllAsync<FilaDescuento>(
    `SELECT ${COLUMNAS_DESCUENTO}
     FROM descuentos d
     LEFT JOIN productos p ON p.id = d.producto_id
     LEFT JOIN puntos pt ON pt.id = d.punto_id
     ORDER BY d.desde DESC`
  );
  return filas.map(aDescuento);
}

export async function crearDescuento(
  db: SQLiteDatabase,
  datos: {
    productoId?: string | null;
    puntoId?: string | null;
    tipo: TipoDescuento;
    valor: number;
    desde: string;
    hasta: string;
    creadoPor: string;
  },
  dispositivoId: string
): Promise<void> {
  await db.runAsync(
    `INSERT INTO descuentos (id, producto_id, punto_id, tipo, valor, desde, hasta, activo, creado_por, ts_cliente, dispositivo_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)`,
    [
      Crypto.randomUUID(),
      datos.productoId ?? null,
      datos.puntoId ?? null,
      datos.tipo,
      datos.valor,
      datos.desde,
      datos.hasta,
      datos.creadoPor,
      new Date().toISOString(),
      dispositivoId,
    ]
  );
}

export async function desactivarDescuento(db: SQLiteDatabase, id: string): Promise<void> {
  await db.runAsync('UPDATE descuentos SET activo = 0 WHERE id = ?', [id]);
}

export interface DescuentoVigente {
  tipo: TipoDescuento;
  valor: number;
}

/**
 * Resuelve qué descuento aplica para un producto en un punto, en un
 * instante dado. Prioridad cuando hay varias reglas vigentes: la más
 * específica gana — producto+punto, luego solo producto, luego solo punto.
 * Nunca hay más de una regla PRODUCTO+PUNTO idéntica vigente a la vez en la
 * práctica, pero si la hubiera, se toma la creada más recientemente.
 */
export async function obtenerDescuentoVigente(
  db: SQLiteDatabase,
  datos: { productoId: string; puntoId: string | null; ahora: string }
): Promise<DescuentoVigente | null> {
  const candidatos = await db.getAllAsync<{
    producto_id: string | null;
    punto_id: string | null;
    tipo: TipoDescuento;
    valor: number;
    ts_cliente: string;
  }>(
    `SELECT producto_id, punto_id, tipo, valor, ts_cliente
     FROM descuentos
     WHERE activo = 1
       AND desde <= ? AND hasta >= ?
       AND (producto_id IS NULL OR producto_id = ?)
       AND (punto_id IS NULL OR punto_id = ?)
     ORDER BY ts_cliente DESC`,
    [datos.ahora, datos.ahora, datos.productoId, datos.puntoId]
  );

  if (candidatos.length === 0) return null;

  function puntuar(c: { producto_id: string | null; punto_id: string | null }): number {
    if (c.producto_id !== null && c.punto_id !== null) return 3;
    if (c.producto_id !== null) return 2;
    if (c.punto_id !== null) return 1;
    return 0;
  }

  const mejor = candidatos.reduce((actual, c) => (puntuar(c) > puntuar(actual) ? c : actual));
  return { tipo: mejor.tipo, valor: mejor.valor };
}
