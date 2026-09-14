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

function generarSku(): string {
  return `TL-${Crypto.randomUUID().slice(0, 8).toUpperCase()}`;
}

export async function crearProducto(
  db: SQLiteDatabase,
  datos: { nombre: string; precio: Pesos; fotoUri?: string | null },
  dispositivoId: string,
  idPredefinido?: string
): Promise<Producto> {
  // Permite generar el id antes de guardar (ver app/admin/catalogo/nuevo.tsx):
  // la foto se copia a un archivo nombrado con el id del producto incluso
  // antes de que exista la fila, así que necesitamos poder fijarlo.
  const id = idPredefinido ?? Crypto.randomUUID();
  const ahora = new Date().toISOString();
  await db.runAsync(
    `INSERT INTO productos (id, sku, nombre, precio, foto_uri, activo, ts_cliente, dispositivo_id)
     VALUES (?, ?, ?, ?, ?, 1, ?, ?)`,
    [id, generarSku(), datos.nombre, datos.precio, datos.fotoUri ?? null, ahora, dispositivoId]
  );
  const creado = await obtenerProducto(db, id);
  if (!creado) throw new Error('No se pudo crear el producto');
  return creado;
}

export async function actualizarProducto(
  db: SQLiteDatabase,
  id: string,
  cambios: { nombre?: string; precio?: Pesos; fotoUri?: string | null }
): Promise<void> {
  if (cambios.nombre !== undefined) {
    await db.runAsync('UPDATE productos SET nombre = ? WHERE id = ?', [cambios.nombre, id]);
  }
  if (cambios.precio !== undefined) {
    await db.runAsync('UPDATE productos SET precio = ? WHERE id = ?', [cambios.precio, id]);
  }
  if (cambios.fotoUri !== undefined) {
    await db.runAsync('UPDATE productos SET foto_uri = ? WHERE id = ?', [cambios.fotoUri, id]);
  }
}

export async function eliminarProducto(db: SQLiteDatabase, id: string): Promise<void> {
  await db.runAsync('UPDATE productos SET activo = 0 WHERE id = ?', [id]);
}

export async function restaurarProducto(db: SQLiteDatabase, id: string): Promise<void> {
  await db.runAsync('UPDATE productos SET activo = 1 WHERE id = ?', [id]);
}
