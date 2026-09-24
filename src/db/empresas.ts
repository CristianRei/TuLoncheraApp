import * as Crypto from 'expo-crypto';
import type { SQLiteDatabase } from 'expo-sqlite';

import { mensajeDeError } from '@/core/errores';
import type { Empresa } from '@/core/tipos';
import { getSupabaseClient } from '@/sync/supabaseClient';

import { encolarSync } from './syncCola';

interface FilaEmpresa {
  id: string;
  nombre: string;
  direccion: string | null;
  sector: string | null;
  contacto: string | null;
}

function aEmpresa(fila: FilaEmpresa): Empresa {
  return {
    id: fila.id,
    nombre: fila.nombre,
    direccion: fila.direccion,
    sector: fila.sector,
    contacto: fila.contacto,
  };
}

export async function listarEmpresas(db: SQLiteDatabase): Promise<Empresa[]> {
  const filas = await db.getAllAsync<FilaEmpresa>(
    'SELECT id, nombre, direccion, sector, contacto FROM empresas ORDER BY nombre ASC'
  );
  return filas.map(aEmpresa);
}

export async function crearEmpresa(
  db: SQLiteDatabase,
  datos: { nombre: string; direccion?: string | null; sector?: string | null; contacto?: string | null },
  dispositivoId: string,
  opciones: { sincronizar?: boolean } = {}
): Promise<Empresa> {
  // `sincronizar: false` solo lo usa el seed de demo (src/db/seedDemo.ts), para
  // que sus empresas de prueba nunca se suban a Supabase.
  const sincronizar = opciones.sincronizar ?? true;
  const id = Crypto.randomUUID();
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `INSERT INTO empresas (id, nombre, direccion, sector, contacto, ts_cliente, dispositivo_id)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        datos.nombre,
        datos.direccion ?? null,
        datos.sector ?? null,
        datos.contacto ?? null,
        new Date().toISOString(),
        dispositivoId,
      ]
    );
    if (sincronizar) await encolarSync(db, { tabla: 'empresas', entidadId: id, tipoTarea: 'FILA' });
  });
  return { id, nombre: datos.nombre, direccion: datos.direccion ?? null, sector: datos.sector ?? null, contacto: datos.contacto ?? null };
}

export interface EmpresaParaSync extends Empresa {
  tsCliente: string;
}

/** Una empresa con su `ts_cliente`, para subirla a Supabase (src/sync/motor.ts). */
export async function obtenerEmpresaParaSync(db: SQLiteDatabase, id: string): Promise<EmpresaParaSync | null> {
  const fila = await db.getFirstAsync<FilaEmpresa & { ts_cliente: string }>(
    'SELECT id, nombre, direccion, sector, contacto, ts_cliente FROM empresas WHERE id = ?',
    [id]
  );
  return fila ? { ...aEmpresa(fila), tsCliente: fila.ts_cliente } : null;
}

interface FilaEmpresaRemota {
  id: string;
  nombre: string;
  direccion: string | null;
  sector: string | null;
  contacto: string | null;
  ts_cliente: string;
  dispositivo_id: string;
}

/**
 * Trae de Supabase las empresas que el admin haya creado — ver CLAUDE.md
 * sección 11. Debe correr ANTES de `descargarPuntosNuevos` (src/db/puntos.ts):
 * `puntos.empresa_id` es una FK local real. A diferencia de productos/
 * categorías, aquí el upsert es por id: las empresas no vienen de ninguna
 * migración inicial (siempre las crea el admin, con el mismo id que viaja a
 * todos los dispositivos), así que no hay ids distintos que reconciliar.
 * Nunca se llama desde el dispositivo de admin (ya es la fuente de verdad
 * local de esta tabla). Pull completo (tabla chica), best-effort: devuelve
 * `false` si no se pudo descargar (sin red, etc.) — el llamador NO debe
 * descargar puntos en ese caso (fallarían por la FK).
 */
export async function descargarEmpresasNuevas(db: SQLiteDatabase): Promise<boolean> {
  try {
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase
      .from('empresas')
      .select('id, nombre, direccion, sector, contacto, ts_cliente, dispositivo_id')
      .returns<FilaEmpresaRemota[]>();
    if (error) throw error;

    for (const fila of data) {
      try {
        await db.runAsync(
          `INSERT INTO empresas (id, nombre, direccion, sector, contacto, ts_cliente, dispositivo_id)
           VALUES (?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET
             nombre = excluded.nombre,
             direccion = excluded.direccion,
             sector = excluded.sector,
             contacto = excluded.contacto`,
          [fila.id, fila.nombre, fila.direccion, fila.sector, fila.contacto, fila.ts_cliente, fila.dispositivo_id]
        );
      } catch (errorFila) {
        console.log(`[empresas] no se pudo aplicar "${fila.nombre}":`, mensajeDeError(errorFila));
      }
    }
    return true;
  } catch (error) {
    console.log('[empresas] no se pudieron descargar empresas nuevas:', mensajeDeError(error));
    return false;
  }
}
