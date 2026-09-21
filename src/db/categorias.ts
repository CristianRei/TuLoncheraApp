import * as Crypto from 'expo-crypto';
import type { SQLiteDatabase } from 'expo-sqlite';

import type { Categoria } from '@/core/tipos';

interface FilaCategoria {
  id: string;
  nombre: string;
  activo: number;
}

function aCategoria(fila: FilaCategoria): Categoria {
  return { id: fila.id, nombre: fila.nombre, activo: fila.activo === 1 };
}

function normalizar(nombre: string): string {
  return nombre.trim().toLowerCase();
}

/** Activas por defecto — para el selector del catálogo. `incluirInactivas` para la pantalla de gestión. */
export async function listarCategorias(
  db: SQLiteDatabase,
  opciones: { incluirInactivas?: boolean } = {}
): Promise<Categoria[]> {
  const condicion = opciones.incluirInactivas ? '1=1' : 'activo = 1';
  const filas = await db.getAllAsync<FilaCategoria>(
    `SELECT id, nombre, activo FROM categorias WHERE ${condicion} ORDER BY nombre ASC`
  );
  return filas.map(aCategoria);
}

/**
 * Crear-o-reusar por nombre normalizado (trim + minúsculas): así "Galleta" y
 * "galleta" nunca terminan siendo dos filas distintas — pedido explícito del
 * negocio de que la lista de categorías sea elegible, sin duplicados. Si la
 * categoría existía pero estaba desactivada, se reactiva (el admin la está
 * pidiendo de nuevo).
 */
export async function crearCategoria(
  db: SQLiteDatabase,
  nombre: string,
  dispositivoId: string
): Promise<Categoria> {
  const nombreLimpio = nombre.trim();
  const normalizado = normalizar(nombreLimpio);

  const existente = await db.getFirstAsync<FilaCategoria>(
    'SELECT id, nombre, activo FROM categorias WHERE nombre_normalizado = ?',
    [normalizado]
  );
  if (existente) {
    if (existente.activo === 0) {
      await db.runAsync('UPDATE categorias SET activo = 1 WHERE id = ?', [existente.id]);
    }
    return aCategoria({ ...existente, activo: 1 });
  }

  const id = Crypto.randomUUID();
  await db.runAsync(
    `INSERT INTO categorias (id, nombre, nombre_normalizado, activo, ts_cliente, dispositivo_id)
     VALUES (?, ?, ?, 1, ?, ?)`,
    [id, nombreLimpio, normalizado, new Date().toISOString(), dispositivoId]
  );
  return { id, nombre: nombreLimpio, activo: true };
}

/** Nunca se borra (podría estar referenciada por productos ya etiquetados) — se desactiva, mismo criterio que productos.activo. */
export async function desactivarCategoria(db: SQLiteDatabase, id: string): Promise<void> {
  await db.runAsync('UPDATE categorias SET activo = 0 WHERE id = ?', [id]);
}

export async function reactivarCategoria(db: SQLiteDatabase, id: string): Promise<void> {
  await db.runAsync('UPDATE categorias SET activo = 1 WHERE id = ?', [id]);
}

/** Cuántos productos activos usan cada categoría — para que la pantalla de gestión avise antes de desactivar una en uso. */
export async function contarProductosPorCategoria(db: SQLiteDatabase): Promise<Map<string, number>> {
  const filas = await db.getAllAsync<{ categoria_id: string; total: number }>(
    `SELECT categoria_id, COUNT(*) as total FROM productos WHERE activo = 1 AND categoria_id IS NOT NULL GROUP BY categoria_id`
  );
  return new Map(filas.map((fila) => [fila.categoria_id, fila.total]));
}
