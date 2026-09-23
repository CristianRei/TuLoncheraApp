import * as Crypto from 'expo-crypto';
import type { SQLiteDatabase } from 'expo-sqlite';

import type { Cliente } from '@/core/tipos';
import { registrarAccionAuditoria } from './auditoria';

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
}
