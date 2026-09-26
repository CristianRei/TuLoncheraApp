import * as Crypto from 'expo-crypto';
import type { SQLiteDatabase } from 'expo-sqlite';

import { mensajeDeError } from '@/core/errores';
import type { Cliente } from '@/core/tipos';
import { encolarSync } from '@/db/syncCola';
import { getSupabaseClient } from '@/sync/supabaseClient';

import { registrarAccionAuditoria } from './auditoria';
import { getDispositivoId } from './dispositivo';
import { resolverUsuarioLocalId } from './mapeoRemoto';

interface FilaCliente {
  id: string;
  nombre_completo: string;
  telefono: string | null;
  direccion: string | null;
  ciudad: string | null;
  empresa: string | null;
  nota: string | null;
  ts_cliente: string;
}

const COLUMNAS_CLIENTE = 'id, nombre_completo, telefono, direccion, ciudad, empresa, nota, ts_cliente';

function aCliente(fila: FilaCliente): Cliente {
  return {
    id: fila.id,
    nombreCompleto: fila.nombre_completo,
    telefono: fila.telefono,
    direccion: fila.direccion,
    ciudad: fila.ciudad,
    empresa: fila.empresa,
    nota: fila.nota,
    tsCliente: fila.ts_cliente,
  };
}

/** Lista de clientes, opcionalmente filtrada por nombre/teléfono/empresa — usada tanto por el buscador de admin como por el del promotor. */
export async function listarClientes(db: SQLiteDatabase, busqueda?: string): Promise<Cliente[]> {
  const termino = busqueda?.trim();
  if (!termino) {
    const filas = await db.getAllAsync<FilaCliente>(
      `SELECT ${COLUMNAS_CLIENTE} FROM clientes ORDER BY nombre_completo ASC`
    );
    return filas.map(aCliente);
  }

  const patron = `%${termino}%`;
  const filas = await db.getAllAsync<FilaCliente>(
    `SELECT ${COLUMNAS_CLIENTE} FROM clientes
     WHERE nombre_completo LIKE ? OR telefono LIKE ? OR empresa LIKE ?
     ORDER BY nombre_completo ASC`,
    [patron, patron, patron]
  );
  return filas.map(aCliente);
}

export async function obtenerCliente(db: SQLiteDatabase, id: string): Promise<Cliente | null> {
  const fila = await db.getFirstAsync<FilaCliente>(
    `SELECT ${COLUMNAS_CLIENTE} FROM clientes WHERE id = ?`,
    [id]
  );
  return fila ? aCliente(fila) : null;
}

export interface ClienteParaSync {
  id: string;
  nombreCompleto: string;
  telefono: string | null;
  direccion: string | null;
  ciudad: string | null;
  empresa: string | null;
  nota: string | null;
  creadoPor: string;
  creadoPorNombre: string | null;
  tsCliente: string;
}

/** Un cliente con el nombre de quien lo creó, tal como sube a Supabase (src/sync/motor.ts). */
export async function obtenerClienteParaSync(db: SQLiteDatabase, id: string): Promise<ClienteParaSync | null> {
  const fila = await db.getFirstAsync<{
    id: string;
    nombre_completo: string;
    telefono: string | null;
    direccion: string | null;
    ciudad: string | null;
    empresa: string | null;
    nota: string | null;
    creado_por: string;
    creado_por_nombre: string | null;
    ts_cliente: string;
  }>(
    `SELECT c.id, c.nombre_completo, c.telefono, c.direccion, c.ciudad, c.empresa, c.nota,
            c.creado_por, u.nombre as creado_por_nombre, c.ts_cliente
     FROM clientes c
     LEFT JOIN usuarios u ON u.id = c.creado_por
     WHERE c.id = ?`,
    [id]
  );
  if (!fila) return null;
  return {
    id: fila.id,
    nombreCompleto: fila.nombre_completo,
    telefono: fila.telefono,
    direccion: fila.direccion,
    ciudad: fila.ciudad,
    empresa: fila.empresa,
    nota: fila.nota,
    creadoPor: fila.creado_por,
    creadoPorNombre: fila.creado_por_nombre,
    tsCliente: fila.ts_cliente,
  };
}

interface FilaClienteRemoto {
  id: string;
  nombre_completo: string;
  telefono: string | null;
  direccion: string | null;
  ciudad: string | null;
  empresa: string | null;
  nota: string | null;
  creado_por: string;
  creado_por_nombre: string;
  ts_cliente: string;
  dispositivo_id: string;
}

/**
 * Descarga los clientes que los promotores registraron en campo — solo el
 * dispositivo de admin la llama (`sync/bajada.ts`): un promotor/bodega ya es
 * la fuente de la fila que él mismo crea. Upsert directo por id: el celular
 * es quien genera el UUID del CLIENTE (R3), sin ids duplicados que
 * reconciliar ahí.
 *
 * `creado_por` sí necesita traducirse: es el id de la PERSONA en el celular
 * que creó el cliente, y ese id puede ser distinto en el dispositivo de
 * admin (mismo problema que ventas/movimientos, ver `resolverUsuarioLocalId`
 * en mapeoRemoto.ts) — la FK local `clientes.creado_por → usuarios(id)`
 * hacía fallar el INSERT en silencio (capturado por el catch por fila) si no
 * se traducía, y el cliente nunca llegaba a verse en admin (bug real,
 * 2026-09-26). Se asume rol PROMOTOR para la búsqueda por nombre — en la
 * práctica es quien siempre crea clientes en campo.
 */
export async function descargarClientesNuevos(db: SQLiteDatabase): Promise<number> {
  let cambios = 0;
  try {
    const supabase = await getSupabaseClient();
    const dispositivoId = await getDispositivoId(db);
    const { data, error } = await supabase
      .from('clientes')
      .select('id, nombre_completo, telefono, direccion, ciudad, empresa, nota, creado_por, creado_por_nombre, ts_cliente, dispositivo_id')
      .returns<FilaClienteRemoto[]>();
    if (error) throw error;

    for (const fila of data) {
      try {
        const previo = await db.getFirstAsync<{ n: number }>('SELECT COUNT(*) as n FROM clientes WHERE id = ?', [
          fila.id,
        ]);
        const creadoPorId = await resolverUsuarioLocalId(
          db,
          { id: fila.creado_por, nombre: fila.creado_por_nombre, rol: 'PROMOTOR' },
          dispositivoId
        );
        await db.runAsync(
          `INSERT INTO clientes (id, nombre_completo, telefono, direccion, ciudad, empresa, nota, creado_por, ts_cliente, dispositivo_id)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET
             nombre_completo = excluded.nombre_completo,
             telefono = excluded.telefono,
             direccion = excluded.direccion,
             ciudad = excluded.ciudad,
             empresa = excluded.empresa,
             nota = excluded.nota`,
          [
            fila.id,
            fila.nombre_completo,
            fila.telefono,
            fila.direccion,
            fila.ciudad,
            fila.empresa,
            fila.nota,
            creadoPorId,
            fila.ts_cliente,
            fila.dispositivo_id,
          ]
        );
        if (!previo || previo.n === 0) cambios++;
      } catch (errorFila) {
        console.log(`[clientes] no se pudo aplicar "${fila.nombre_completo}":`, mensajeDeError(errorFila));
      }
    }
  } catch (error) {
    console.log('[clientes] no se pudo descargar clientes nuevos:', mensajeDeError(error));
  }
  return cambios;
}

export interface DatosCliente {
  nombreCompleto: string;
  telefono?: string | null;
  direccion?: string | null;
  ciudad?: string | null;
  empresa?: string | null;
  nota?: string | null;
}

export async function crearCliente(
  db: SQLiteDatabase,
  datos: DatosCliente,
  creadoPor: string,
  dispositivoId: string
): Promise<Cliente> {
  const id = Crypto.randomUUID();
  const tsCliente = new Date().toISOString();
  await db.runAsync(
    `INSERT INTO clientes (id, nombre_completo, telefono, direccion, ciudad, empresa, nota, creado_por, ts_cliente, dispositivo_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      datos.nombreCompleto,
      datos.telefono ?? null,
      datos.direccion ?? null,
      datos.ciudad ?? null,
      datos.empresa ?? null,
      datos.nota ?? null,
      creadoPor,
      tsCliente,
      dispositivoId,
    ]
  );
  await registrarAccionAuditoria(
    db,
    { usuarioId: creadoPor, entidad: 'CLIENTE', entidadId: id, accion: 'CREAR', detalles: { nombre: datos.nombreCompleto } },
    dispositivoId
  );
  await encolarSync(db, { tabla: 'clientes', entidadId: id, tipoTarea: 'FILA' });
  return {
    id,
    nombreCompleto: datos.nombreCompleto,
    telefono: datos.telefono ?? null,
    direccion: datos.direccion ?? null,
    ciudad: datos.ciudad ?? null,
    empresa: datos.empresa ?? null,
    nota: datos.nota ?? null,
    tsCliente,
  };
}

/**
 * Clientes no es parte del libro de inventario (R1/R2 no aplican) — a
 * diferencia de productos (`activo=0`), aquí sí se borra de verdad. Antes de
 * borrar, se desvincula de cualquier venta que lo tuviera asignado para no
 * dejar una referencia colgante ni perder esas ventas del historial.
 */
export async function eliminarCliente(
  db: SQLiteDatabase,
  id: string,
  dispositivoId: string,
  eliminadoPor: string
): Promise<void> {
  const cliente = await obtenerCliente(db, id);
  await db.withTransactionAsync(async () => {
    await db.runAsync('UPDATE ventas SET cliente_id = NULL WHERE cliente_id = ?', [id]);
    await db.runAsync('DELETE FROM clientes WHERE id = ?', [id]);
    await registrarAccionAuditoria(
      db,
      {
        usuarioId: eliminadoPor,
        entidad: 'CLIENTE',
        entidadId: id,
        accion: 'ELIMINAR',
        detalles: cliente ? { nombre: cliente.nombreCompleto } : undefined,
      },
      dispositivoId
    );
  });

  // El DELETE no pasa por la cola de sync (esa asume que la fila local sigue
  // ahí para poder leerla y subirla) — se intenta borrar en Supabase directo,
  // best-effort, mismo patrón que `eliminarPersonaPermanente`.
  try {
    const supabase = await getSupabaseClient();
    await supabase.from('clientes').delete().eq('id', id);
  } catch (error) {
    console.log('[clientes] no se pudo borrar en remoto:', mensajeDeError(error));
  }
}
