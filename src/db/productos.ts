import * as Crypto from 'expo-crypto';
import type { SQLiteDatabase } from 'expo-sqlite';

import type { Pesos, Producto } from '@/core/tipos';

interface FilaProducto {
  id: string;
  sku: string;
  codigo_barras: string | null;
  nombre: string;
  categoria: string | null;
  es_licor: number;
  es_perecedero: number;
  precio: number;
  costo: number | null;
  unidad_empaque: number;
  foto_uri: string | null;
  activo: number;
}

function aProducto(fila: FilaProducto): Producto {
  return {
    id: fila.id,
    sku: fila.sku,
    codigoBarras: fila.codigo_barras,
    nombre: fila.nombre,
    categoria: fila.categoria,
    esLicor: fila.es_licor === 1,
    esPerecedero: fila.es_perecedero === 1,
    precio: fila.precio,
    costo: fila.costo,
    unidadEmpaque: fila.unidad_empaque,
    fotoUri: fila.foto_uri,
    activo: fila.activo === 1,
  };
}

const COLUMNAS =
  'id, sku, codigo_barras, nombre, categoria, es_licor, es_perecedero, precio, costo, unidad_empaque, foto_uri, activo';

export async function listarProductos(
  db: SQLiteDatabase,
  opciones: { incluirInactivos?: boolean } = {}
): Promise<Producto[]> {
  const condicion = opciones.incluirInactivos ? 'activo = 0' : 'activo = 1';
  const filas = await db.getAllAsync<FilaProducto>(
    `SELECT ${COLUMNAS} FROM productos WHERE ${condicion} ORDER BY nombre ASC`
  );
  return filas.map(aProducto);
}

export async function obtenerProducto(db: SQLiteDatabase, id: string): Promise<Producto | null> {
  const fila = await db.getFirstAsync<FilaProducto>(
    `SELECT ${COLUMNAS} FROM productos WHERE id = ?`,
    [id]
  );
  return fila ? aProducto(fila) : null;
}

export async function obtenerProductosPorIds(
  db: SQLiteDatabase,
  ids: string[]
): Promise<Map<string, Producto>> {
  if (ids.length === 0) return new Map();
  const marcadores = ids.map(() => '?').join(', ');
  const filas = await db.getAllAsync<FilaProducto>(
    `SELECT ${COLUMNAS} FROM productos WHERE id IN (${marcadores})`,
    ids
  );
  return new Map(filas.map((fila) => [fila.id, aProducto(fila)]));
}

function generarSku(): string {
  return `TL-${Crypto.randomUUID().slice(0, 8).toUpperCase()}`;
}

export async function crearProducto(
  db: SQLiteDatabase,
  datos: { nombre: string; precio: Pesos; fotoUri?: string | null; codigoBarras?: string | null },
  dispositivoId: string,
  idPredefinido?: string
): Promise<Producto> {
  // Permite generar el id antes de guardar (ver app/admin/catalogo/nuevo.tsx):
  // la foto se copia a un archivo nombrado con el id del producto incluso
  // antes de que exista la fila, así que necesitamos poder fijarlo.
  const id = idPredefinido ?? Crypto.randomUUID();
  const ahora = new Date().toISOString();
  await db.runAsync(
    `INSERT INTO productos (id, sku, nombre, precio, foto_uri, codigo_barras, activo, ts_cliente, dispositivo_id)
     VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)`,
    [
      id,
      generarSku(),
      datos.nombre,
      datos.precio,
      datos.fotoUri ?? null,
      datos.codigoBarras ?? null,
      ahora,
      dispositivoId,
    ]
  );
  const creado = await obtenerProducto(db, id);
  if (!creado) throw new Error('No se pudo crear el producto');
  return creado;
}

export async function actualizarProducto(
  db: SQLiteDatabase,
  id: string,
  cambios: {
    nombre?: string;
    precio?: Pesos;
    fotoUri?: string | null;
    codigoBarras?: string | null;
  }
): Promise<void> {
  const columnas: string[] = [];
  const valores: (string | number | null)[] = [];

  if (cambios.nombre !== undefined) {
    columnas.push('nombre = ?');
    valores.push(cambios.nombre);
  }
  if (cambios.precio !== undefined) {
    columnas.push('precio = ?');
    valores.push(cambios.precio);
  }
  if (cambios.fotoUri !== undefined) {
    columnas.push('foto_uri = ?');
    valores.push(cambios.fotoUri);
  }
  if (cambios.codigoBarras !== undefined) {
    columnas.push('codigo_barras = ?');
    valores.push(cambios.codigoBarras);
  }
  if (columnas.length === 0) return;

  await db.runAsync(`UPDATE productos SET ${columnas.join(', ')} WHERE id = ?`, [...valores, id]);
}

/**
 * Busca un producto por su código de barras (para el escáner). `null` si no
 * hay ninguno con ese código o el producto está desactivado.
 */
export async function buscarProductoPorCodigoBarras(
  db: SQLiteDatabase,
  codigoBarras: string
): Promise<Producto | null> {
  const fila = await db.getFirstAsync<FilaProducto>(
    `SELECT ${COLUMNAS} FROM productos WHERE codigo_barras = ? AND activo = 1`,
    [codigoBarras]
  );
  return fila ? aProducto(fila) : null;
}

export async function eliminarProducto(db: SQLiteDatabase, id: string): Promise<void> {
  await db.runAsync('UPDATE productos SET activo = 0 WHERE id = ?', [id]);
}

export async function restaurarProducto(db: SQLiteDatabase, id: string): Promise<void> {
  await db.runAsync('UPDATE productos SET activo = 1 WHERE id = ?', [id]);
}
