import * as Crypto from 'expo-crypto';
import type { SQLiteDatabase } from 'expo-sqlite';

import type { Empresa } from '@/core/tipos';

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
  dispositivoId: string
): Promise<Empresa> {
  const id = Crypto.randomUUID();
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
  return { id, nombre: datos.nombre, direccion: datos.direccion ?? null, sector: datos.sector ?? null, contacto: datos.contacto ?? null };
}
