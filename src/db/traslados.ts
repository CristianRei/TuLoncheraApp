import * as Crypto from 'expo-crypto';
import type { SQLiteDatabase } from 'expo-sqlite';

import type { Traslado, TrasladoLinea } from '@/core/tipos';

import { registrarTraslado, StockInsuficienteError } from './traslado';
import { obtenerSaldosPromotor } from './inventario';
import { encolarSync } from './syncCola';

export { StockInsuficienteError };

interface ItemPlaneado {
  productoId: string;
  cantidad: number;
}

interface FilaTraslado {
  id: string;
  promotor_origen_id: string;
  promotor_origen_nombre: string;
  promotor_destino_id: string;
  promotor_destino_nombre: string;
  estado: Traslado['estado'];
  ts_cliente: string;
}

const COLUMNAS_TRASLADO = `t.id, t.promotor_origen_id, uo.nombre as promotor_origen_nombre,
       t.promotor_destino_id, ud.nombre as promotor_destino_nombre, t.estado, t.ts_cliente`;

function aTraslado(fila: FilaTraslado): Traslado {
  return {
    id: fila.id,
    promotorOrigenId: fila.promotor_origen_id,
    promotorOrigenNombre: fila.promotor_origen_nombre,
    promotorDestinoId: fila.promotor_destino_id,
    promotorDestinoNombre: fila.promotor_destino_nombre,
    estado: fila.estado,
    tsCliente: fila.ts_cliente,
  };
}

/**
 * Admin planea un traslado: valida contra el inventario del promotor
 * ORIGEN (mismo chequeo que `registrarTraslado`) pero NO toca `movimientos`
 * — solo la cabecera y las líneas quedan PLANEADO/PENDIENTE. El TRASLADO
 * real nace después, cuando bodega confirma cada línea
 * (`confirmarLineaTraslado`) — mismo espíritu que el cargue normal.
 */
export async function crearTraslado(
  db: SQLiteDatabase,
  datos: {
    promotorOrigenId: string;
    promotorOrigenNombre: string;
    promotorDestinoId: string;
    promotorDestinoNombre: string;
    items: ItemPlaneado[];
    creadoPor: string;
  },
  dispositivoId: string
): Promise<Traslado> {
  if (datos.promotorOrigenId === datos.promotorDestinoId) {
    throw new Error('El promotor de origen y el de destino deben ser distintos.');
  }

  const itemsConCantidad = datos.items.filter((item) => item.cantidad > 0);
  if (itemsConCantidad.length === 0) {
    throw new Error('El traslado necesita al menos un producto con cantidad.');
  }

  const saldosOrigen = await obtenerSaldosPromotor(db, datos.promotorOrigenId);
  for (const item of itemsConCantidad) {
    if (item.cantidad > (saldosOrigen.get(item.productoId) ?? 0)) {
      throw new StockInsuficienteError();
    }
  }

  const id = Crypto.randomUUID();
  const ahora = new Date().toISOString();

  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `INSERT INTO traslados (id, promotor_origen_id, promotor_destino_id, estado, creado_por, ts_cliente, dispositivo_id)
       VALUES (?, ?, ?, 'PLANEADO', ?, ?, ?)`,
      [id, datos.promotorOrigenId, datos.promotorDestinoId, datos.creadoPor, ahora, dispositivoId]
    );
    for (const item of itemsConCantidad) {
      await db.runAsync(
        `INSERT INTO traslado_lineas (id, traslado_id, producto_id, cantidad_planeada, cantidad_entregada, estado, ts_cliente, dispositivo_id)
         VALUES (?, ?, ?, ?, 0, 'PENDIENTE', ?, ?)`,
        [Crypto.randomUUID(), id, item.productoId, item.cantidad, ahora, dispositivoId]
      );
    }

    await encolarSync(db, { tabla: 'traslados', entidadId: id, tipoTarea: 'FILA' });
  });

  const creado = await obtenerTraslado(db, id);
  if (!creado) throw new Error('No se pudo planear el traslado');
  return creado.traslado;
}

async function lineasDeTraslado(db: SQLiteDatabase, trasladoId: string): Promise<TrasladoLinea[]> {
  const filas = await db.getAllAsync<{
    id: string;
    producto_id: string;
    producto_nombre: string;
    cantidad_planeada: number;
    cantidad_entregada: number;
    estado: TrasladoLinea['estado'];
    motivo_revision: string | null;
  }>(
    `SELECT tl.id, tl.producto_id, p.nombre as producto_nombre, tl.cantidad_planeada,
            tl.cantidad_entregada, tl.estado, tl.motivo_revision
     FROM traslado_lineas tl
     JOIN productos p ON p.id = tl.producto_id
     WHERE tl.traslado_id = ?
     ORDER BY p.nombre ASC`,
    [trasladoId]
  );
  return filas.map((fila) => ({
    id: fila.id,
    productoId: fila.producto_id,
    productoNombre: fila.producto_nombre,
    cantidadPlaneada: fila.cantidad_planeada,
    cantidadEntregada: fila.cantidad_entregada,
    estado: fila.estado,
    motivoRevision: fila.motivo_revision,
  }));
}

export async function obtenerTraslado(
  db: SQLiteDatabase,
  id: string
): Promise<{ traslado: Traslado; lineas: TrasladoLinea[] } | null> {
  const fila = await db.getFirstAsync<FilaTraslado>(
    `SELECT ${COLUMNAS_TRASLADO}
     FROM traslados t
     JOIN usuarios uo ON uo.id = t.promotor_origen_id
     JOIN usuarios ud ON ud.id = t.promotor_destino_id
     WHERE t.id = ?`,
    [id]
  );
  if (!fila) return null;
  return { traslado: aTraslado(fila), lineas: await lineasDeTraslado(db, id) };
}

/** Traslados con al menos una línea PENDIENTE — lo que bodega todavía tiene por confirmar. */
export async function listarTrasladosPendientes(db: SQLiteDatabase): Promise<Traslado[]> {
  const filas = await db.getAllAsync<FilaTraslado>(
    `SELECT DISTINCT ${COLUMNAS_TRASLADO}
     FROM traslados t
     JOIN usuarios uo ON uo.id = t.promotor_origen_id
     JOIN usuarios ud ON ud.id = t.promotor_destino_id
     JOIN traslado_lineas tl ON tl.traslado_id = t.id
     WHERE tl.estado = 'PENDIENTE'
     ORDER BY t.ts_cliente ASC`
  );
  return filas.map(aTraslado);
}

/** Todos los traslados (cualquier estado), para el listado de admin. */
export async function listarTraslados(db: SQLiteDatabase): Promise<Traslado[]> {
  const filas = await db.getAllAsync<FilaTraslado>(
    `SELECT ${COLUMNAS_TRASLADO}
     FROM traslados t
     JOIN usuarios uo ON uo.id = t.promotor_origen_id
     JOIN usuarios ud ON ud.id = t.promotor_destino_id
     ORDER BY t.ts_cliente DESC`
  );
  return filas.map(aTraslado);
}

/**
 * Admin reduce lo planeado mientras la línea sigue PENDIENTE — nunca
 * generó movimiento, así que no hay nada que revertir (R2 no aplica).
 * `nuevaCantidad <= 0` elimina la línea en vez de dejarla en 0.
 */
export async function reducirLineaTraslado(
  db: SQLiteDatabase,
  datos: { lineaId: string; nuevaCantidad: number }
): Promise<void> {
  const fila = await db.getFirstAsync<{ estado: TrasladoLinea['estado']; traslado_id: string }>(
    'SELECT estado, traslado_id FROM traslado_lineas WHERE id = ?',
    [datos.lineaId]
  );
  if (!fila) throw new Error('Esta línea de traslado ya no existe.');
  if (fila.estado !== 'PENDIENTE') {
    throw new Error('Solo se puede reducir una línea que todavía no se ha confirmado.');
  }

  if (datos.nuevaCantidad <= 0) {
    await db.runAsync('DELETE FROM traslado_lineas WHERE id = ?', [datos.lineaId]);
  } else {
    await db.runAsync('UPDATE traslado_lineas SET cantidad_planeada = ? WHERE id = ?', [
      datos.nuevaCantidad,
      datos.lineaId,
    ]);
  }
  await encolarSync(db, { tabla: 'traslados', entidadId: fila.traslado_id, tipoTarea: 'FILA' });
}

async function actualizarEstadoTrasladoSiCompleto(db: SQLiteDatabase, trasladoId: string): Promise<void> {
  const fila = await db.getFirstAsync<{ pendientes: number }>(
    "SELECT COUNT(*) as pendientes FROM traslado_lineas WHERE traslado_id = ? AND estado = 'PENDIENTE'",
    [trasladoId]
  );
  if ((fila?.pendientes ?? 0) === 0) {
    await db.runAsync("UPDATE traslados SET estado = 'ENTREGADO' WHERE id = ?", [trasladoId]);
  }
}

/**
 * Bodega confirma cuánto se trasladó realmente de una línea. Si alcanza lo
 * planeado, genera el TRASLADO completo y la línea queda ENTREGADA. Si no
 * alcanza, genera el TRASLADO por lo que sí hay (si algo) y la línea queda
 * REVISAR con motivo obligatorio, para que admin la resuelva después — sin
 * bloquear las demás líneas. A diferencia de un cargue normal, NO exige
 * turno abierto de ningún promotor: es una operación administrativa, mismo
 * espíritu que RETIRO_ADMIN (R4, CLAUDE.md sección 3).
 */
export async function confirmarLineaTraslado(
  db: SQLiteDatabase,
  datos: { lineaId: string; cantidadEntregada: number; motivoRevision?: string; ejecutorId: string },
  dispositivoId: string
): Promise<void> {
  const linea = await db.getFirstAsync<{
    traslado_id: string;
    producto_id: string;
    cantidad_planeada: number;
    estado: TrasladoLinea['estado'];
  }>(
    'SELECT traslado_id, producto_id, cantidad_planeada, estado FROM traslado_lineas WHERE id = ?',
    [datos.lineaId]
  );
  if (!linea) throw new Error('Esta línea de traslado ya no existe.');
  if (linea.estado !== 'PENDIENTE') {
    throw new Error('Esta línea ya fue confirmada.');
  }

  const entregada = Math.max(0, Math.min(datos.cantidadEntregada, linea.cantidad_planeada));
  const completa = entregada >= linea.cantidad_planeada;

  if (!completa && !datos.motivoRevision?.trim()) {
    throw new Error('Explica qué pasó con el faltante antes de confirmar.');
  }

  const traslado = await db.getFirstAsync<{
    promotor_origen_id: string;
    promotor_origen_nombre: string;
    promotor_destino_id: string;
    promotor_destino_nombre: string;
  }>(
    `SELECT t.promotor_origen_id, uo.nombre as promotor_origen_nombre,
            t.promotor_destino_id, ud.nombre as promotor_destino_nombre
     FROM traslados t
     JOIN usuarios uo ON uo.id = t.promotor_origen_id
     JOIN usuarios ud ON ud.id = t.promotor_destino_id
     WHERE t.id = ?`,
    [linea.traslado_id]
  );
  if (!traslado) throw new Error('El traslado de esta línea ya no existe.');

  if (entregada > 0) {
    await registrarTraslado(
      db,
      {
        promotorOrigenId: traslado.promotor_origen_id,
        promotorOrigenNombre: traslado.promotor_origen_nombre,
        promotorDestinoId: traslado.promotor_destino_id,
        promotorDestinoNombre: traslado.promotor_destino_nombre,
        adminId: datos.ejecutorId,
        items: [{ productoId: linea.producto_id, cantidad: entregada }],
      },
      dispositivoId
    );
  }

  await db.runAsync(
    `UPDATE traslado_lineas SET cantidad_entregada = ?, estado = ?, motivo_revision = ? WHERE id = ?`,
    [entregada, completa ? 'ENTREGADA' : 'REVISAR', completa ? null : (datos.motivoRevision ?? null), datos.lineaId]
  );

  await actualizarEstadoTrasladoSiCompleto(db, linea.traslado_id);
  await encolarSync(db, { tabla: 'traslados', entidadId: linea.traslado_id, tipoTarea: 'FILA' });
}

/** Admin resuelve una línea REVISAR (ej. apareció el producto) generando el TRASLADO restante. */
export async function resolverLineaEnRevisionTraslado(
  db: SQLiteDatabase,
  datos: { lineaId: string; cantidadAdicional: number; ejecutorId: string },
  dispositivoId: string
): Promise<void> {
  const linea = await db.getFirstAsync<{
    traslado_id: string;
    producto_id: string;
    cantidad_planeada: number;
    cantidad_entregada: number;
    estado: TrasladoLinea['estado'];
  }>(
    'SELECT traslado_id, producto_id, cantidad_planeada, cantidad_entregada, estado FROM traslado_lineas WHERE id = ?',
    [datos.lineaId]
  );
  if (!linea) throw new Error('Esta línea de traslado ya no existe.');
  if (linea.estado !== 'REVISAR') {
    throw new Error('Esta línea no está pendiente de revisión.');
  }

  const restante = linea.cantidad_planeada - linea.cantidad_entregada;
  const aEntregar = Math.max(0, Math.min(datos.cantidadAdicional, restante));

  const traslado = await db.getFirstAsync<{
    promotor_origen_id: string;
    promotor_origen_nombre: string;
    promotor_destino_id: string;
    promotor_destino_nombre: string;
  }>(
    `SELECT t.promotor_origen_id, uo.nombre as promotor_origen_nombre,
            t.promotor_destino_id, ud.nombre as promotor_destino_nombre
     FROM traslados t
     JOIN usuarios uo ON uo.id = t.promotor_origen_id
     JOIN usuarios ud ON ud.id = t.promotor_destino_id
     WHERE t.id = ?`,
    [linea.traslado_id]
  );
  if (!traslado) throw new Error('El traslado de esta línea ya no existe.');

  if (aEntregar > 0) {
    await registrarTraslado(
      db,
      {
        promotorOrigenId: traslado.promotor_origen_id,
        promotorOrigenNombre: traslado.promotor_origen_nombre,
        promotorDestinoId: traslado.promotor_destino_id,
        promotorDestinoNombre: traslado.promotor_destino_nombre,
        adminId: datos.ejecutorId,
        items: [{ productoId: linea.producto_id, cantidad: aEntregar }],
      },
      dispositivoId
    );
  }

  const nuevaEntregada = linea.cantidad_entregada + aEntregar;
  const completa = nuevaEntregada >= linea.cantidad_planeada;
  await db.runAsync(
    `UPDATE traslado_lineas SET cantidad_entregada = ?, estado = ?, motivo_revision = ? WHERE id = ?`,
    [nuevaEntregada, completa ? 'ENTREGADA' : 'REVISAR', completa ? null : 'Resuelto parcialmente', datos.lineaId]
  );

  await actualizarEstadoTrasladoSiCompleto(db, linea.traslado_id);
  await encolarSync(db, { tabla: 'traslados', entidadId: linea.traslado_id, tipoTarea: 'FILA' });
}
