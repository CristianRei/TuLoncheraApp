import * as Crypto from 'expo-crypto';
import type { SQLiteDatabase } from 'expo-sqlite';

import { calcularRangoMesBogota } from '@/core/analitica';
import type { Meta, Pesos, TipoMeta } from '@/core/tipos';

import { obtenerVentasPorPromotor, obtenerVentasPorPunto } from './analitica';
import { listarPuntos } from './puntos';
import { listarPromotores } from './usuarios';

interface FilaMeta {
  id: string;
  tipo: TipoMeta;
  entidad_id: string;
  mes: string;
  monto_objetivo: number;
}

function aMeta(fila: FilaMeta): Meta {
  return {
    id: fila.id,
    tipo: fila.tipo,
    entidadId: fila.entidad_id,
    mes: fila.mes,
    montoObjetivo: fila.monto_objetivo,
  };
}

export async function listarMetasDelMes(db: SQLiteDatabase, mes: string): Promise<Meta[]> {
  const filas = await db.getAllAsync<FilaMeta>(
    'SELECT id, tipo, entidad_id, mes, monto_objetivo FROM metas WHERE mes = ?',
    [mes]
  );
  return filas.map(aMeta);
}

/**
 * Una sola meta por (tipo, entidad, mes) — ver el índice único de la
 * migración 0021. Si ya existía, se actualiza el monto en vez de duplicar:
 * el admin "edita la meta" simplemente volviendo a guardarla.
 */
export async function establecerMeta(
  db: SQLiteDatabase,
  datos: { tipo: TipoMeta; entidadId: string; mes: string; montoObjetivo: Pesos },
  creadoPor: string,
  dispositivoId: string
): Promise<Meta> {
  const existente = await db.getFirstAsync<{ id: string }>(
    'SELECT id FROM metas WHERE tipo = ? AND entidad_id = ? AND mes = ?',
    [datos.tipo, datos.entidadId, datos.mes]
  );
  if (existente) {
    await db.runAsync('UPDATE metas SET monto_objetivo = ? WHERE id = ?', [
      datos.montoObjetivo,
      existente.id,
    ]);
    return { id: existente.id, ...datos };
  }

  const id = Crypto.randomUUID();
  await db.runAsync(
    `INSERT INTO metas (id, tipo, entidad_id, mes, monto_objetivo, creado_por, ts_cliente, dispositivo_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      datos.tipo,
      datos.entidadId,
      datos.mes,
      datos.montoObjetivo,
      creadoPor,
      new Date().toISOString(),
      dispositivoId,
    ]
  );
  return { id, ...datos };
}

export async function eliminarMeta(db: SQLiteDatabase, id: string): Promise<void> {
  await db.runAsync('DELETE FROM metas WHERE id = ?', [id]);
}

export interface ProgresoMeta {
  metaId: string;
  tipo: TipoMeta;
  entidadId: string;
  entidadNombre: string;
  montoObjetivo: Pesos;
  totalVendido: Pesos;
  progresoPct: number;
}

/**
 * Progreso de cada meta del mes contra las ventas reales de ese mismo mes
 * calendario (ver `calcularRangoMesBogota`, tope a "ahora" si es el mes en
 * curso). Una entidad con meta pero sin ventas todavía aparece con
 * `totalVendido: 0` — nunca desaparece del listado solo por no tener ventas.
 */
export async function obtenerProgresoMetas(db: SQLiteDatabase, mes: string): Promise<ProgresoMeta[]> {
  const metas = await listarMetasDelMes(db, mes);
  if (metas.length === 0) return [];

  const rango = calcularRangoMesBogota(mes);
  const [promotores, puntos, ventasPorPromotor, ventasPorPunto] = await Promise.all([
    listarPromotores(db),
    listarPuntos(db),
    obtenerVentasPorPromotor(db, rango),
    obtenerVentasPorPunto(db, rango),
  ]);

  const nombrePromotor = new Map(promotores.map((p) => [p.id, p.nombre]));
  const nombrePunto = new Map(puntos.map((p) => [p.id, `${p.empresaNombre} · ${p.nombre}`]));
  const totalPromotor = new Map(ventasPorPromotor.map((v) => [v.promotorId, v.totalVendido]));
  const totalPunto = new Map(ventasPorPunto.map((v) => [v.puntoId, v.totalVendido]));

  return metas.map((meta) => {
    const entidadNombre =
      (meta.tipo === 'PROMOTOR' ? nombrePromotor.get(meta.entidadId) : nombrePunto.get(meta.entidadId)) ??
      'Desconocido';
    const totalVendido =
      (meta.tipo === 'PROMOTOR' ? totalPromotor.get(meta.entidadId) : totalPunto.get(meta.entidadId)) ?? 0;
    return {
      metaId: meta.id,
      tipo: meta.tipo,
      entidadId: meta.entidadId,
      entidadNombre,
      montoObjetivo: meta.montoObjetivo,
      totalVendido,
      progresoPct: meta.montoObjetivo === 0 ? 0 : Math.round((totalVendido / meta.montoObjetivo) * 100),
    };
  });
}
