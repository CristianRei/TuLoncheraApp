import * as Crypto from 'expo-crypto';
import type { SQLiteDatabase } from 'expo-sqlite';

import type { Punto } from '@/core/tipos';

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
  dispositivoId: string
): Promise<Punto> {
  const id = Crypto.randomUUID();
  await db.runAsync(
    `INSERT INTO puntos (id, empresa_id, nombre, direccion, activo, ts_cliente, dispositivo_id)
     VALUES (?, ?, ?, ?, 1, ?, ?)`,
    [id, datos.empresaId, datos.nombre, datos.direccion ?? null, new Date().toISOString(), dispositivoId]
  );
  const creado = await obtenerPunto(db, id);
  if (!creado) throw new Error('No se pudo crear el punto');
  return creado;
}
