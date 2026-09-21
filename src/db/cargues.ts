import * as Crypto from 'expo-crypto';
import type { SQLiteDatabase } from 'expo-sqlite';

import type { Cargue, CargueLinea } from '@/core/tipos';

import { registrarCargue, StockInsuficienteError } from './cargue';
import { obtenerSaldosBodega } from './inventario';
import { obtenerTurnoAbiertoHoy } from './turnos';

export { StockInsuficienteError };

/**
 * Bodega no puede confirmar una línea de cargue a un promotor sin turno
 * abierto hoy — nadie puede confirmar que esa persona está trabajando ese
 * día. Mismo espíritu que `SinTurnoAbiertoError` de `src/db/ventas.ts`, en
 * su propio archivo para no crear una dependencia cruzada entre cargues y
 * ventas por un solo tipo de error.
 */
export class SinTurnoParaCargueError extends Error {
  constructor() {
    super('Este promotor no ha iniciado turno hoy — no se puede entregar hasta que lo haga.');
    this.name = 'SinTurnoParaCargueError';
  }
}

interface ItemPlaneado {
  productoId: string;
  cantidad: number;
}

interface FilaCargue {
  id: string;
  promotor_id: string;
  promotor_nombre: string;
  estado: Cargue['estado'];
  ts_cliente: string;
}

const COLUMNAS_CARGUE = `c.id, c.promotor_id, u.nombre as promotor_nombre, c.estado, c.ts_cliente`;

function aCargue(fila: FilaCargue): Cargue {
  return {
    id: fila.id,
    promotorId: fila.promotor_id,
    promotorNombre: fila.promotor_nombre,
    estado: fila.estado,
    tsCliente: fila.ts_cliente,
  };
}

/**
 * Admin planea un cargue: valida contra el stock de bodega (mismo chequeo
 * que ya hace `registrarCargue`) pero NO toca `movimientos` — solo la
 * cabecera y las líneas quedan PLANEADO/PENDIENTE. El RECARGA real nace
 * después, cuando bodega confirma cada línea (`confirmarLineaCargue`).
 */
export async function crearCargue(
  db: SQLiteDatabase,
  datos: {
    promotorId: string;
    promotorNombre: string;
    items: ItemPlaneado[];
    creadoPor: string;
  },
  dispositivoId: string
): Promise<Cargue> {
  const itemsConCantidad = datos.items.filter((item) => item.cantidad > 0);
  if (itemsConCantidad.length === 0) {
    throw new Error('El cargue necesita al menos un producto con cantidad.');
  }

  const saldosBodega = await obtenerSaldosBodega(db);
  for (const item of itemsConCantidad) {
    if (item.cantidad > (saldosBodega.get(item.productoId) ?? 0)) {
      throw new StockInsuficienteError();
    }
  }

  const id = Crypto.randomUUID();
  const ahora = new Date().toISOString();

  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `INSERT INTO cargues (id, promotor_id, estado, creado_por, ts_cliente, dispositivo_id)
       VALUES (?, ?, 'PLANEADO', ?, ?, ?)`,
      [id, datos.promotorId, datos.creadoPor, ahora, dispositivoId]
    );
    for (const item of itemsConCantidad) {
      await db.runAsync(
        `INSERT INTO cargue_lineas (id, cargue_id, producto_id, cantidad_planeada, cantidad_entregada, estado, ts_cliente, dispositivo_id)
         VALUES (?, ?, ?, ?, 0, 'PENDIENTE', ?, ?)`,
        [Crypto.randomUUID(), id, item.productoId, item.cantidad, ahora, dispositivoId]
      );
    }
  });

  const creado = await obtenerCargue(db, id);
  if (!creado) throw new Error('No se pudo planear el cargue');
  return creado.cargue;
}

async function lineasDeCargue(db: SQLiteDatabase, cargueId: string): Promise<CargueLinea[]> {
  const filas = await db.getAllAsync<{
    id: string;
    producto_id: string;
    producto_nombre: string;
    cantidad_planeada: number;
    cantidad_entregada: number;
    estado: CargueLinea['estado'];
    motivo_revision: string | null;
  }>(
    `SELECT cl.id, cl.producto_id, p.nombre as producto_nombre, cl.cantidad_planeada,
            cl.cantidad_entregada, cl.estado, cl.motivo_revision
     FROM cargue_lineas cl
     JOIN productos p ON p.id = cl.producto_id
     WHERE cl.cargue_id = ?
     ORDER BY p.nombre ASC`,
    [cargueId]
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

export async function obtenerCargue(
  db: SQLiteDatabase,
  id: string
): Promise<{ cargue: Cargue; lineas: CargueLinea[] } | null> {
  const fila = await db.getFirstAsync<FilaCargue>(
    `SELECT ${COLUMNAS_CARGUE} FROM cargues c JOIN usuarios u ON u.id = c.promotor_id WHERE c.id = ?`,
    [id]
  );
  if (!fila) return null;
  return { cargue: aCargue(fila), lineas: await lineasDeCargue(db, id) };
}

/** Cargues con al menos una línea PENDIENTE — lo que bodega todavía tiene por entregar. */
export async function listarCarguesPendientes(db: SQLiteDatabase): Promise<Cargue[]> {
  const filas = await db.getAllAsync<FilaCargue>(
    `SELECT DISTINCT ${COLUMNAS_CARGUE}
     FROM cargues c
     JOIN usuarios u ON u.id = c.promotor_id
     JOIN cargue_lineas cl ON cl.cargue_id = c.id
     WHERE cl.estado = 'PENDIENTE'
     ORDER BY c.ts_cliente ASC`
  );
  return filas.map(aCargue);
}

/** Todos los cargues (cualquier estado), para el listado de admin. */
export async function listarCargues(db: SQLiteDatabase): Promise<Cargue[]> {
  const filas = await db.getAllAsync<FilaCargue>(
    `SELECT ${COLUMNAS_CARGUE} FROM cargues c JOIN usuarios u ON u.id = c.promotor_id ORDER BY c.ts_cliente DESC`
  );
  return filas.map(aCargue);
}

/**
 * Admin reduce lo planeado mientras la línea sigue PENDIENTE — nunca
 * generó movimiento, así que no hay nada que revertir (R2 no aplica).
 * `nuevaCantidad <= 0` elimina la línea en vez de dejarla en 0.
 */
export async function reducirLineaCargue(
  db: SQLiteDatabase,
  datos: { lineaId: string; nuevaCantidad: number }
): Promise<void> {
  const fila = await db.getFirstAsync<{ estado: CargueLinea['estado'] }>(
    'SELECT estado FROM cargue_lineas WHERE id = ?',
    [datos.lineaId]
  );
  if (!fila) throw new Error('Esta línea de cargue ya no existe.');
  if (fila.estado !== 'PENDIENTE') {
    throw new Error('Solo se puede reducir una línea que todavía no se ha entregado.');
  }

  if (datos.nuevaCantidad <= 0) {
    await db.runAsync('DELETE FROM cargue_lineas WHERE id = ?', [datos.lineaId]);
    return;
  }
  await db.runAsync('UPDATE cargue_lineas SET cantidad_planeada = ? WHERE id = ?', [
    datos.nuevaCantidad,
    datos.lineaId,
  ]);
}

async function actualizarEstadoCargueSiCompleto(db: SQLiteDatabase, cargueId: string): Promise<void> {
  const fila = await db.getFirstAsync<{ pendientes: number }>(
    "SELECT COUNT(*) as pendientes FROM cargue_lineas WHERE cargue_id = ? AND estado = 'PENDIENTE'",
    [cargueId]
  );
  if ((fila?.pendientes ?? 0) === 0) {
    await db.runAsync("UPDATE cargues SET estado = 'ENTREGADO' WHERE id = ?", [cargueId]);
  }
}

/**
 * Bodega confirma cuánto entregó realmente de una línea. Si alcanza lo
 * planeado, genera el RECARGA completo y la línea queda ENTREGADA. Si no
 * alcanza (el inventario del sistema decía que había, pero físicamente no
 * — dañado, robado, mal contado antes), genera el RECARGA por lo que sí
 * hay (si algo) y la línea queda REVISAR con motivo obligatorio, para que
 * admin la resuelva después — sin bloquear las demás líneas del cargue.
 */
export async function confirmarLineaCargue(
  db: SQLiteDatabase,
  datos: { lineaId: string; cantidadEntregada: number; motivoRevision?: string; ejecutorId: string },
  dispositivoId: string
): Promise<void> {
  const linea = await db.getFirstAsync<{
    cargue_id: string;
    producto_id: string;
    cantidad_planeada: number;
    estado: CargueLinea['estado'];
  }>(
    'SELECT cargue_id, producto_id, cantidad_planeada, estado FROM cargue_lineas WHERE id = ?',
    [datos.lineaId]
  );
  if (!linea) throw new Error('Esta línea de cargue ya no existe.');
  if (linea.estado !== 'PENDIENTE') {
    throw new Error('Esta línea ya fue confirmada.');
  }

  const entregada = Math.max(0, Math.min(datos.cantidadEntregada, linea.cantidad_planeada));
  const completa = entregada >= linea.cantidad_planeada;

  if (!completa && !datos.motivoRevision?.trim()) {
    throw new Error('Explica qué pasó con el faltante antes de confirmar.');
  }

  const cargue = await db.getFirstAsync<{ promotor_id: string; promotor_nombre: string }>(
    `SELECT c.promotor_id, u.nombre as promotor_nombre
     FROM cargues c JOIN usuarios u ON u.id = c.promotor_id WHERE c.id = ?`,
    [linea.cargue_id]
  );
  if (!cargue) throw new Error('El cargue de esta línea ya no existe.');

  const turnoAbierto = await obtenerTurnoAbiertoHoy(db, cargue.promotor_id);
  if (!turnoAbierto) throw new SinTurnoParaCargueError();

  if (entregada > 0) {
    await registrarCargue(
      db,
      {
        promotorId: cargue.promotor_id,
        promotorNombre: cargue.promotor_nombre,
        adminId: datos.ejecutorId,
        items: [{ productoId: linea.producto_id, cantidad: entregada }],
      },
      dispositivoId
    );
  }

  await db.runAsync(
    `UPDATE cargue_lineas SET cantidad_entregada = ?, estado = ?, motivo_revision = ? WHERE id = ?`,
    [entregada, completa ? 'ENTREGADA' : 'REVISAR', completa ? null : (datos.motivoRevision ?? null), datos.lineaId]
  );

  await actualizarEstadoCargueSiCompleto(db, linea.cargue_id);
}

/** Admin resuelve una línea REVISAR (ej. apareció el producto) generando el RECARGA restante. */
export async function resolverLineaEnRevision(
  db: SQLiteDatabase,
  datos: { lineaId: string; cantidadAdicional: number; ejecutorId: string },
  dispositivoId: string
): Promise<void> {
  const linea = await db.getFirstAsync<{
    cargue_id: string;
    producto_id: string;
    cantidad_planeada: number;
    cantidad_entregada: number;
    estado: CargueLinea['estado'];
  }>(
    'SELECT cargue_id, producto_id, cantidad_planeada, cantidad_entregada, estado FROM cargue_lineas WHERE id = ?',
    [datos.lineaId]
  );
  if (!linea) throw new Error('Esta línea de cargue ya no existe.');
  if (linea.estado !== 'REVISAR') {
    throw new Error('Esta línea no está pendiente de revisión.');
  }

  const restante = linea.cantidad_planeada - linea.cantidad_entregada;
  const aEntregar = Math.max(0, Math.min(datos.cantidadAdicional, restante));

  const cargue = await db.getFirstAsync<{ promotor_id: string; promotor_nombre: string }>(
    `SELECT c.promotor_id, u.nombre as promotor_nombre
     FROM cargues c JOIN usuarios u ON u.id = c.promotor_id WHERE c.id = ?`,
    [linea.cargue_id]
  );
  if (!cargue) throw new Error('El cargue de esta línea ya no existe.');

  if (aEntregar > 0) {
    await registrarCargue(
      db,
      {
        promotorId: cargue.promotor_id,
        promotorNombre: cargue.promotor_nombre,
        adminId: datos.ejecutorId,
        items: [{ productoId: linea.producto_id, cantidad: aEntregar }],
      },
      dispositivoId
    );
  }

  const nuevaEntregada = linea.cantidad_entregada + aEntregar;
  const completa = nuevaEntregada >= linea.cantidad_planeada;
  await db.runAsync(
    `UPDATE cargue_lineas SET cantidad_entregada = ?, estado = ?, motivo_revision = ? WHERE id = ?`,
    [nuevaEntregada, completa ? 'ENTREGADA' : 'REVISAR', completa ? null : 'Resuelto parcialmente', datos.lineaId]
  );

  await actualizarEstadoCargueSiCompleto(db, linea.cargue_id);
}
