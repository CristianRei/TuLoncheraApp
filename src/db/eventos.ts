import * as Crypto from 'expo-crypto';
import type { SQLiteDatabase } from 'expo-sqlite';

import type { Evento } from '@/core/tipos';

interface FilaEvento {
  id: string;
  empresa_id: string;
  punto_id: string;
  punto_nombre: string;
  fecha: string;
  promotor_id: string | null;
  estado: Evento['estado'];
}

const COLUMNAS_EVENTO = `ev.id, ev.empresa_id, ev.punto_id, p.nombre as punto_nombre, ev.fecha, ev.promotor_id, ev.estado`;

function aEvento(fila: FilaEvento): Evento {
  return {
    id: fila.id,
    empresaId: fila.empresa_id,
    puntoId: fila.punto_id,
    puntoNombre: fila.punto_nombre,
    fecha: fila.fecha,
    promotorId: fila.promotor_id,
    estado: fila.estado,
  };
}

/**
 * El punto vigente de un promotor: el evento EN_CURSO más reciente para su
 * `promotor_id`. `eventos` no representa todavía una jornada con calendario
 * (eso es una fase futura, ver ADR 0005) — aquí es simplemente "asignación
 * activa": el admin la crea, y sigue vigente hasta que el admin reasigne.
 */
export async function obtenerPuntoVigentePromotor(
  db: SQLiteDatabase,
  promotorId: string
): Promise<Evento | null> {
  const fila = await db.getFirstAsync<FilaEvento>(
    `SELECT ${COLUMNAS_EVENTO}
     FROM eventos ev
     JOIN puntos p ON p.id = ev.punto_id
     WHERE ev.promotor_id = ? AND ev.estado = 'EN_CURSO'
     ORDER BY ev.ts_cliente DESC
     LIMIT 1`,
    [promotorId]
  );
  return fila ? aEvento(fila) : null;
}

/**
 * El admin asigna un promotor a un punto: cierra la asignación vigente
 * anterior (si existe) y crea una nueva EN_CURSO. `estado` es la única
 * columna que se muta aquí (como `ventas.anulada`, ADR 0004) — `eventos` no
 * es un libro de movimientos, R1/R2 no aplican.
 */
export async function asignarPromotorAPunto(
  db: SQLiteDatabase,
  datos: { promotorId: string; puntoId: string; empresaId: string },
  dispositivoId: string
): Promise<Evento> {
  const id = Crypto.randomUUID();
  const ahora = new Date().toISOString();

  await db.withTransactionAsync(async () => {
    await db.runAsync(
      "UPDATE eventos SET estado = 'CERRADO' WHERE promotor_id = ? AND estado = 'EN_CURSO'",
      [datos.promotorId]
    );
    await db.runAsync(
      `INSERT INTO eventos (id, empresa_id, punto_id, fecha, promotor_id, estado, ts_cliente, dispositivo_id)
       VALUES (?, ?, ?, ?, ?, 'EN_CURSO', ?, ?)`,
      [id, datos.empresaId, datos.puntoId, ahora, datos.promotorId, ahora, dispositivoId]
    );
  });

  const fila = await db.getFirstAsync<FilaEvento>(
    `SELECT ${COLUMNAS_EVENTO} FROM eventos ev JOIN puntos p ON p.id = ev.punto_id WHERE ev.id = ?`,
    [id]
  );
  if (!fila) throw new Error('No se pudo asignar el punto');
  return aEvento(fila);
}
