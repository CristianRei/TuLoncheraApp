import * as Crypto from 'expo-crypto';
import type { SQLiteDatabase } from 'expo-sqlite';

import { mensajeDeError } from '@/core/errores';
import type { Punto } from '@/core/tipos';
import { getSupabaseClient } from '@/sync/supabaseClient';

import { encolarSync } from './syncCola';

interface FilaPunto {
  id: string;
  empresa_id: string;
  empresa_nombre: string;
  nombre: string;
  direccion: string | null;
  activo: number;
}

const COLUMNAS_PUNTO = `p.id, p.empresa_id, e.nombre as empresa_nombre, p.nombre, p.direccion, p.activo`;

function aPunto(fila: FilaPunto): Punto {
  return {
    id: fila.id,
    empresaId: fila.empresa_id,
    empresaNombre: fila.empresa_nombre,
    nombre: fila.nombre,
    direccion: fila.direccion,
    activo: fila.activo === 1,
  };
}

/** Puntos activos, opcionalmente acotados a una empresa — para elegir dónde asignar a un promotor. */
export async function listarPuntos(
  db: SQLiteDatabase,
  opciones: { empresaId?: string } = {}
): Promise<Punto[]> {
  const condicion = opciones.empresaId ? 'p.activo = 1 AND p.empresa_id = ?' : 'p.activo = 1';
  const parametros = opciones.empresaId ? [opciones.empresaId] : [];
  const filas = await db.getAllAsync<FilaPunto>(
    `SELECT ${COLUMNAS_PUNTO}
     FROM puntos p
     JOIN empresas e ON e.id = p.empresa_id
     WHERE ${condicion}
     ORDER BY e.nombre ASC, p.nombre ASC`,
    parametros
  );
  return filas.map(aPunto);
}

export async function obtenerPunto(db: SQLiteDatabase, id: string): Promise<Punto | null> {
  const fila = await db.getFirstAsync<FilaPunto>(
    `SELECT ${COLUMNAS_PUNTO} FROM puntos p JOIN empresas e ON e.id = p.empresa_id WHERE p.id = ?`,
    [id]
  );
  return fila ? aPunto(fila) : null;
}

export async function crearPunto(
  db: SQLiteDatabase,
  datos: { empresaId: string; nombre: string; direccion?: string | null },
  dispositivoId: string,
  opciones: { sincronizar?: boolean } = {}
): Promise<Punto> {
  // `sincronizar: false` solo lo usa el seed de demo (src/db/seedDemo.ts), para
  // que sus puntos de prueba nunca se suban a Supabase.
  const sincronizar = opciones.sincronizar ?? true;
  const id = Crypto.randomUUID();
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `INSERT INTO puntos (id, empresa_id, nombre, direccion, activo, ts_cliente, dispositivo_id)
       VALUES (?, ?, ?, ?, 1, ?, ?)`,
      [id, datos.empresaId, datos.nombre, datos.direccion ?? null, new Date().toISOString(), dispositivoId]
    );
    if (sincronizar) await encolarSync(db, { tabla: 'puntos', entidadId: id, tipoTarea: 'FILA' });
  });
  const creado = await obtenerPunto(db, id);
  if (!creado) throw new Error('No se pudo crear el punto');
  return creado;
}

export interface PuntoParaSync {
  id: string;
  empresaId: string;
  nombre: string;
  direccion: string | null;
  activo: boolean;
  tsCliente: string;
}

/** Un punto con su `ts_cliente` (incluidos los inactivos), para subirlo a Supabase (src/sync/motor.ts). */
export async function obtenerPuntoParaSync(db: SQLiteDatabase, id: string): Promise<PuntoParaSync | null> {
  const fila = await db.getFirstAsync<{
    id: string;
    empresa_id: string;
    nombre: string;
    direccion: string | null;
    activo: number;
    ts_cliente: string;
  }>('SELECT id, empresa_id, nombre, direccion, activo, ts_cliente FROM puntos WHERE id = ?', [id]);
  if (!fila) return null;
  return {
    id: fila.id,
    empresaId: fila.empresa_id,
    nombre: fila.nombre,
    direccion: fila.direccion,
    activo: fila.activo === 1,
    tsCliente: fila.ts_cliente,
  };
}

/**
 * Encola para subir a Supabase las empresas y puntos que ya existían antes de
 * que sincronizaran (nadie los encoló nunca). Idempotente: solo encola lo que
 * no tenga ninguna tarea en la cola. Mismo criterio que
 * `encolarPersonalSinSubir` (src/db/personal.ts): se llama solo desde el
 * dispositivo de admin y solo fuera de `__DEV__` (app/index.tsx) — las
 * empresas/puntos del seed de demo nunca deben llegar a Supabase.
 */
export async function encolarEmpresasYPuntosSinSubir(db: SQLiteDatabase): Promise<void> {
  const empresas = await db.getAllAsync<{ id: string }>(
    `SELECT e.id FROM empresas e
     WHERE NOT EXISTS (SELECT 1 FROM _sync_pendiente s WHERE s.tabla = 'empresas' AND s.entidad_id = e.id)`
  );
  const puntos = await db.getAllAsync<{ id: string }>(
    `SELECT p.id FROM puntos p
     WHERE NOT EXISTS (SELECT 1 FROM _sync_pendiente s WHERE s.tabla = 'puntos' AND s.entidad_id = p.id)`
  );
  if (empresas.length === 0 && puntos.length === 0) return;
  await db.withTransactionAsync(async () => {
    for (const { id } of empresas) await encolarSync(db, { tabla: 'empresas', entidadId: id, tipoTarea: 'FILA' });
    for (const { id } of puntos) await encolarSync(db, { tabla: 'puntos', entidadId: id, tipoTarea: 'FILA' });
  });
}

interface FilaPuntoRemota {
  id: string;
  empresa_id: string;
  nombre: string;
  direccion: string | null;
  activo: boolean;
  ts_cliente: string;
  dispositivo_id: string;
}

/**
 * Trae de Supabase los puntos (sedes) que el admin haya creado — debe correr
 * DESPUÉS de `descargarEmpresasNuevas` (src/db/empresas.ts): `empresa_id` es
 * una FK local real. Upsert por id, igual que empresas (siempre los crea el
 * admin, mismo id en todos los dispositivos). Un punto cuya empresa no llegó
 * se omite (su propio try/catch) sin frenar a los demás. Nunca se llama desde
 * el dispositivo de admin. Pull completo, best-effort.
 */
export async function descargarPuntosNuevos(db: SQLiteDatabase): Promise<void> {
  try {
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase
      .from('puntos')
      .select('id, empresa_id, nombre, direccion, activo, ts_cliente, dispositivo_id')
      .returns<FilaPuntoRemota[]>();
    if (error) throw error;

    for (const fila of data) {
      try {
        await db.runAsync(
          `INSERT INTO puntos (id, empresa_id, nombre, direccion, activo, ts_cliente, dispositivo_id)
           VALUES (?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET
             empresa_id = excluded.empresa_id,
             nombre = excluded.nombre,
             direccion = excluded.direccion,
             activo = excluded.activo`,
          [fila.id, fila.empresa_id, fila.nombre, fila.direccion, fila.activo ? 1 : 0, fila.ts_cliente, fila.dispositivo_id]
        );
      } catch (errorFila) {
        console.log(`[puntos] no se pudo aplicar "${fila.nombre}":`, mensajeDeError(errorFila));
      }
    }
  } catch (error) {
    console.log('[puntos] no se pudieron descargar puntos nuevos:', mensajeDeError(error));
  }
}
