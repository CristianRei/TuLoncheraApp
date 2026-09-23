import type { SQLiteDatabase } from 'expo-sqlite';

import { calcularRangoDiaBogota, fechaHoyBogota } from '@/core/analitica';
import type { Pesos } from '@/core/tipos';

import { obtenerVentasPorPromotor } from './analitica';
import { listarEventosPorRango } from './eventos';

export interface ProgresoMetaDiaria {
  eventoId: string;
  promotorId: string;
  promotorNombre: string;
  puntoNombre: string;
  metaDiaria: Pesos;
  totalVendidoHoy: Pesos;
  progresoPct: number;
}

/**
 * Progreso de la meta DIARIA de cada promotor con evento asignado en `fecha`
 * (por defecto hoy) — independiente de la meta mensual (src/db/metas.ts, la
 * otra escala, ver CLAUDE.md glosario "Meta"). Solo incluye promotores con
 * `meta_diaria` asignada ese evento (migración 0023) — sin meta, no hay nada
 * que medir. Eventos cancelados no cuentan.
 */
export async function obtenerProgresoMetasDiarias(
  db: SQLiteDatabase,
  fecha: string = fechaHoyBogota()
): Promise<ProgresoMetaDiaria[]> {
  const eventos = await listarEventosPorRango(db, { desde: fecha, hasta: fecha });

  const pendientes: Omit<ProgresoMetaDiaria, 'totalVendidoHoy' | 'progresoPct'>[] = [];
  for (const evento of eventos) {
    if (evento.estado === 'CANCELADO') continue;
    evento.promotorIds.forEach((promotorId, indice) => {
      const meta = evento.metaDiariaPorPromotor[promotorId];
      if (meta === null || meta === undefined) return;
      pendientes.push({
        eventoId: evento.id,
        promotorId,
        promotorNombre: evento.promotorNombres[indice],
        puntoNombre: `${evento.empresaNombre} · ${evento.puntoNombre}`,
        metaDiaria: meta,
      });
    });
  }
  if (pendientes.length === 0) return [];

  const rango = calcularRangoDiaBogota(fecha);
  const ventasPorPromotor = await obtenerVentasPorPromotor(db, rango);
  const totalPorPromotor = new Map(ventasPorPromotor.map((v) => [v.promotorId, v.totalVendido]));

  return pendientes.map((fila) => {
    const totalVendidoHoy = totalPorPromotor.get(fila.promotorId) ?? 0;
    return {
      ...fila,
      totalVendidoHoy,
      progresoPct: fila.metaDiaria === 0 ? 0 : Math.round((totalVendidoHoy / fila.metaDiaria) * 100),
    };
  });
}
