import type { SQLiteDatabase } from 'expo-sqlite';

import type { Rol } from '@/core/tipos';

import { obtenerOCrearUbicacionBodega, obtenerOCrearUbicacionPromotor } from './ubicaciones';

/**
 * Traducción de identidades entre dispositivos. Los ids de algunas entidades
 * NO coinciden de un dispositivo a otro — los productos y categorías
 * iniciales los crea cada celular con `randomUUID()` propio, y las
 * `ubicaciones` (bodega, una por promotor) se crean perezosamente en cada
 * dispositivo con id propio — así que lo que baja de Supabase se traduce por
 * "clave natural": producto por `sku`, ubicación por (tipo, responsable),
 * persona por id (la crea el admin y viaja igual a todos) y, si no está, por
 * nombre. Ver CLAUDE.md sección 10 ("Sincronización de bajada — catálogo").
 */

/** sku de cada producto, para subirlo junto a las filas que lo referencian (venta_items, movimientos, ...). */
export async function skuPorProductoId(db: SQLiteDatabase, ids: string[]): Promise<Map<string, string>> {
  const unicos = [...new Set(ids)];
  if (unicos.length === 0) return new Map();
  const filas = await db.getAllAsync<{ id: string; sku: string }>(
    `SELECT id, sku FROM productos WHERE id IN (${unicos.map(() => '?').join(', ')})`,
    unicos
  );
  return new Map(filas.map((f) => [f.id, f.sku]));
}

/**
 * Id LOCAL del producto: por id si coincide, si no por `sku`, y como último
 * recurso por nombre exacto (solo si es único) — filas subidas antes de que
 * se enviara el `sku` no lo traen. `null` si este dispositivo no lo conoce.
 */
export async function resolverProductoLocalId(
  db: SQLiteDatabase,
  producto: { id: string; sku?: string | null; nombre?: string | null }
): Promise<string | null> {
  const porId = await db.getFirstAsync<{ id: string }>('SELECT id FROM productos WHERE id = ?', [producto.id]);
  if (porId) return porId.id;
  if (producto.sku) {
    const porSku = await db.getFirstAsync<{ id: string }>('SELECT id FROM productos WHERE sku = ?', [producto.sku]);
    if (porSku) return porSku.id;
  }
  if (producto.nombre) {
    const porNombre = await db.getAllAsync<{ id: string }>('SELECT id FROM productos WHERE nombre = ? LIMIT 2', [
      producto.nombre,
    ]);
    if (porNombre.length === 1) return porNombre[0].id;
  }
  return null;
}

/**
 * Id LOCAL de una persona: por id; si no, por (rol, nombre); si tampoco, se
 * crea una fila "fantasma" (`activo = 0`, sin PIN — nadie puede iniciar
 * sesión con ella) para que la venta/movimiento no pierda a quién se
 * atribuye ni rompa la FK. Ocurre con usuarios de prueba de `__DEV__` (ids
 * distintos por dispositivo) o con un admin que nunca subió su fila.
 */
export async function resolverUsuarioLocalId(
  db: SQLiteDatabase,
  persona: { id: string; nombre: string | null; rol: Rol },
  dispositivoId: string
): Promise<string> {
  const porId = await db.getFirstAsync<{ id: string }>('SELECT id FROM usuarios WHERE id = ?', [persona.id]);
  if (porId) return porId.id;

  if (persona.nombre) {
    const porNombre = await db.getFirstAsync<{ id: string }>(
      'SELECT id FROM usuarios WHERE rol = ? AND nombre = ? ORDER BY activo DESC LIMIT 1',
      [persona.rol, persona.nombre]
    );
    if (porNombre) return porNombre.id;
  }

  await db.runAsync(
    `INSERT INTO usuarios (id, nombre, rol, activo, pin, ts_cliente, dispositivo_id)
     VALUES (?, ?, ?, 0, NULL, ?, ?)`,
    [persona.id, persona.nombre ?? 'Sin nombre', persona.rol, new Date().toISOString(), dispositivoId]
  );
  return persona.id;
}

/**
 * Id LOCAL de una ubicación a partir de su clave natural: la bodega es una
 * sola; la de un promotor se identifica por a quién pertenece. `null` para
 * "afuera" (sin ubicación) y para tipos que hoy no se usan (CAMION).
 */
export async function resolverUbicacionLocalId(
  db: SQLiteDatabase,
  ubicacion: { tipo: string | null; responsableId: string | null; nombre: string | null },
  dispositivoId: string
): Promise<string | null> {
  if (ubicacion.tipo === 'BODEGA') return obtenerOCrearUbicacionBodega(db, dispositivoId);
  if (ubicacion.tipo === 'PROMOTOR' && ubicacion.responsableId) {
    const usuarioId = await resolverUsuarioLocalId(
      db,
      { id: ubicacion.responsableId, nombre: ubicacion.nombre, rol: 'PROMOTOR' },
      dispositivoId
    );
    return obtenerOCrearUbicacionPromotor(db, usuarioId, ubicacion.nombre ?? 'Promotor', dispositivoId);
  }
  return null;
}
