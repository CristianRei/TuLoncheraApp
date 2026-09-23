import * as Crypto from 'expo-crypto';
import type { SQLiteDatabase } from 'expo-sqlite';

import { mensajeDeError } from '@/core/errores';
import type { Categoria } from '@/core/tipos';
import { encolarSync } from '@/db/syncCola';
import { getSupabaseClient } from '@/sync/supabaseClient';

import { registrarAccionAuditoria } from './auditoria';

interface FilaCategoria {
  id: string;
  nombre: string;
  activo: number;
  ts_cliente: string;
}

const COLUMNAS = 'id, nombre, activo, ts_cliente';

function aCategoria(fila: FilaCategoria): Categoria {
  return { id: fila.id, nombre: fila.nombre, activo: fila.activo === 1, tsCliente: fila.ts_cliente };
}

/** Trim + minúsculas — misma normalización que el índice único local, para poder recalcularla al subir a Supabase sin duplicar la regla. */
export function normalizar(nombre: string): string {
  return nombre.trim().toLowerCase();
}

/** Activas por defecto — para el selector del catálogo. `incluirInactivas` para la pantalla de gestión. */
export async function listarCategorias(
  db: SQLiteDatabase,
  opciones: { incluirInactivas?: boolean } = {}
): Promise<Categoria[]> {
  const condicion = opciones.incluirInactivas ? '1=1' : 'activo = 1';
  const filas = await db.getAllAsync<FilaCategoria>(
    `SELECT ${COLUMNAS} FROM categorias WHERE ${condicion} ORDER BY nombre ASC`
  );
  return filas.map(aCategoria);
}

export async function obtenerCategoria(db: SQLiteDatabase, id: string): Promise<Categoria | null> {
  const fila = await db.getFirstAsync<FilaCategoria>(`SELECT ${COLUMNAS} FROM categorias WHERE id = ?`, [id]);
  return fila ? aCategoria(fila) : null;
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
  dispositivoId: string,
  opciones: { sincronizar?: boolean; creadoPorId?: string } = {}
): Promise<Categoria> {
  // `sincronizar: false` solo lo usa el seed de demo (src/db/seedDemo.ts), para
  // que sus categorías de prueba nunca se suban a Supabase.
  const sincronizar = opciones.sincronizar ?? true;
  const nombreLimpio = nombre.trim();
  const normalizado = normalizar(nombreLimpio);

  const existente = await db.getFirstAsync<FilaCategoria>(
    `SELECT ${COLUMNAS} FROM categorias WHERE nombre_normalizado = ?`,
    [normalizado]
  );
  if (existente) {
    if (existente.activo === 0) {
      await db.withTransactionAsync(async () => {
        await db.runAsync('UPDATE categorias SET activo = 1 WHERE id = ?', [existente.id]);
        if (sincronizar) await encolarSync(db, { tabla: 'categorias', entidadId: existente.id, tipoTarea: 'FILA' });
      });
    }
    return aCategoria({ ...existente, activo: 1 });
  }

  const id = Crypto.randomUUID();
  const ahora = new Date().toISOString();
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `INSERT INTO categorias (id, nombre, nombre_normalizado, activo, ts_cliente, dispositivo_id)
       VALUES (?, ?, ?, 1, ?, ?)`,
      [id, nombreLimpio, normalizado, ahora, dispositivoId]
    );
    if (sincronizar) await encolarSync(db, { tabla: 'categorias', entidadId: id, tipoTarea: 'FILA' });
    // Solo se audita la creación real (esta rama) — nunca el reuso de arriba.
    // creadoPorId es opcional porque el seed de desarrollo (__DEV__) crea
    // categorías sin admin real detrás, ver src/db/seedDemo.ts.
    if (opciones.creadoPorId) {
      await registrarAccionAuditoria(
        db,
        {
          usuarioId: opciones.creadoPorId,
          entidad: 'CATEGORIA',
          entidadId: id,
          accion: 'CREAR',
          detalles: { nombre: nombreLimpio },
        },
        dispositivoId
      );
    }
  });
  return { id, nombre: nombreLimpio, activo: true, tsCliente: ahora };
}

/** Nunca se borra (podría estar referenciada por productos ya etiquetados) — se desactiva, mismo criterio que productos.activo. */
export async function desactivarCategoria(db: SQLiteDatabase, id: string): Promise<void> {
  await db.withTransactionAsync(async () => {
    await db.runAsync('UPDATE categorias SET activo = 0 WHERE id = ?', [id]);
    await encolarSync(db, { tabla: 'categorias', entidadId: id, tipoTarea: 'FILA' });
  });
}

export async function reactivarCategoria(db: SQLiteDatabase, id: string): Promise<void> {
  await db.withTransactionAsync(async () => {
    await db.runAsync('UPDATE categorias SET activo = 1 WHERE id = ?', [id]);
    await encolarSync(db, { tabla: 'categorias', entidadId: id, tipoTarea: 'FILA' });
  });
}

/** Cuántos productos activos usan cada categoría — para que la pantalla de gestión avise antes de desactivar una en uso. */
export async function contarProductosPorCategoria(db: SQLiteDatabase): Promise<Map<string, number>> {
  const filas = await db.getAllAsync<{ categoria_id: string; total: number }>(
    `SELECT categoria_id, COUNT(*) as total FROM productos WHERE activo = 1 AND categoria_id IS NOT NULL GROUP BY categoria_id`
  );
  return new Map(filas.map((fila) => [fila.categoria_id, fila.total]));
}

export interface FilaCategoriaRemota {
  id: string;
  nombre: string;
  nombre_normalizado: string;
  activo: boolean;
  ts_cliente: string;
  dispositivo_id: string;
}

/**
 * Aplica a la base local las categorías descargadas de Supabase. Devuelve el
 * mapa "id remoto → id local", que `aplicarProductosRemotos` necesita para
 * traducir `categoria_id`.
 *
 * Se reconcilia por `nombre_normalizado`, NO por id: las 7 categorías
 * iniciales las crea la migración 0020 con `randomUUID()` distinto en cada
 * dispositivo, así que "Galletas" tiene un id en el celular de admin y otro
 * en el del promotor — y `nombre_normalizado` es UNIQUE, así que insertar la
 * fila remota tal cual chocaría. Si ya existe una local con ese nombre se
 * actualiza esa (conservando su id local, que puede estar en uso por
 * productos); si no, se inserta con el id remoto. Cada fila va en su propio
 * try/catch: una que falle no impide que las demás se apliquen.
 */
export async function aplicarCategoriasRemotas(
  db: SQLiteDatabase,
  filas: FilaCategoriaRemota[]
): Promise<Map<string, string>> {
  const idLocalPorIdRemoto = new Map<string, string>();

  for (const fila of filas) {
    try {
      const local = await db.getFirstAsync<{ id: string }>(
        'SELECT id FROM categorias WHERE id = ? OR nombre_normalizado = ? ORDER BY (id = ?) DESC LIMIT 1',
        [fila.id, fila.nombre_normalizado, fila.id]
      );
      if (local) {
        await db.runAsync('UPDATE categorias SET nombre = ?, nombre_normalizado = ?, activo = ? WHERE id = ?', [
          fila.nombre,
          fila.nombre_normalizado,
          fila.activo ? 1 : 0,
          local.id,
        ]);
        idLocalPorIdRemoto.set(fila.id, local.id);
      } else {
        await db.runAsync(
          `INSERT INTO categorias (id, nombre, nombre_normalizado, activo, ts_cliente, dispositivo_id)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [fila.id, fila.nombre, fila.nombre_normalizado, fila.activo ? 1 : 0, fila.ts_cliente, fila.dispositivo_id]
        );
        idLocalPorIdRemoto.set(fila.id, fila.id);
      }
    } catch (error) {
      console.log(`[categorias] no se pudo aplicar "${fila.nombre}":`, mensajeDeError(error));
    }
  }
  return idLocalPorIdRemoto;
}

/**
 * Trae de Supabase las categorías que el admin haya creado/editado — ver
 * CLAUDE.md sección 11. Debe correr ANTES de `descargarProductosNuevos`
 * (src/db/productos.ts): `productos.categoria_id` tiene una FK local real
 * (PRAGMA foreign_keys=ON). Nunca se llama desde el dispositivo de admin (ya
 * es la fuente de verdad local de esta tabla). Pull completo (tabla chica),
 * best-effort: devuelve `null` si no se pudo descargar (sin red, etc.) — el
 * llamador NO debe aplicar productos en ese caso, porque sin el mapa de ids
 * les borraría la categoría.
 */
export async function descargarCategoriasNuevas(db: SQLiteDatabase): Promise<Map<string, string> | null> {
  try {
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase
      .from('categorias')
      .select('id, nombre, nombre_normalizado, activo, ts_cliente, dispositivo_id')
      .returns<FilaCategoriaRemota[]>();
    if (error) throw error;
    return await aplicarCategoriasRemotas(db, data);
  } catch (error) {
    console.log('[categorias] no se pudo descargar categorías nuevas:', mensajeDeError(error));
    return null;
  }
}
