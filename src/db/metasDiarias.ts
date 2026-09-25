import type { SQLiteDatabase } from 'expo-sqlite';

import { calcularRangoDiaBogota, fechaHoyBogota } from '@/core/analitica';
import type { Evento, Pesos } from '@/core/tipos';

import { obtenerVentasPorPunto } from './analitica';
import { listarEventosPorRango, obtenerPuntoVigentePromotor } from './eventos';

/**
 * Progreso de la meta DIARIA de un evento. La meta es del EQUIPO (migración
 * 0032): si es de $ 1.000.000 y entre los dos promotores venden $ 500.000,
 * los dos van en 50 % — decisión del negocio, 2026-09-24. Distinta de la
 * meta mensual (src/db/metas.ts, ver CLAUDE.md glosario "Meta").
 */
export interface ProgresoMetaDiaria {
  eventoId: string;
  /** "Empresa · Punto". */
  puntoNombre: string;
  promotorIds: string[];
  promotorNombres: string[];
  metaDiaria: Pesos;
  /**
   * Lo que se vendió ese día en el PUNTO del evento, entre todo el equipo
   * (sin anuladas). Por punto y no por persona: si a un promotor lo mueven de
   * evento a mediodía, lo que vendió en la mañana en el otro punto no se suma
   * aquí, y lo que vendió aquí antes de irse sigue contando.
   */
  totalVendidoHoy: Pesos;
  progresoPct: number;
}

async function calcularProgreso(
  db: SQLiteDatabase,
  eventos: Evento[],
  fecha: string
): Promise<ProgresoMetaDiaria[]> {
  const conMeta = eventos.filter((e) => e.estado !== 'CANCELADO' && e.metaDiaria !== null);
  if (conMeta.length === 0) return [];

  const ventasPorPunto = await obtenerVentasPorPunto(db, calcularRangoDiaBogota(fecha));
  const totalPorPunto = new Map(ventasPorPunto.map((v) => [v.puntoId, v.totalVendido]));

  return conMeta.map((evento) => {
    const metaDiaria = evento.metaDiaria ?? 0;
    const totalVendidoHoy = totalPorPunto.get(evento.puntoId) ?? 0;
    return {
      eventoId: evento.id,
      puntoNombre: `${evento.empresaNombre} · ${evento.puntoNombre}`,
      promotorIds: evento.promotorIds,
      promotorNombres: evento.promotorNombres,
      metaDiaria,
      totalVendidoHoy,
      progresoPct: metaDiaria === 0 ? 0 : Math.round((totalVendidoHoy / metaDiaria) * 100),
    };
  });
}

/**
 * Progreso de cada evento con meta diaria en `fecha` (por defecto hoy) — uno
 * por evento, no por promotor. Eventos cancelados o sin meta no cuentan. En
 * el celular de un promotor, las ventas de sus compañeros de evento llegan
 * de Supabase (`descargarVentasNuevas` con ámbito de punto, src/sync/bajada.ts).
 */
export async function obtenerProgresoMetasDiarias(
  db: SQLiteDatabase,
  fecha: string = fechaHoyBogota()
): Promise<ProgresoMetaDiaria[]> {
  return calcularProgreso(db, await listarEventosPorRango(db, { desde: fecha, hasta: fecha }), fecha);
}

/** El progreso del evento de HOY de este promotor (el mismo para todo su equipo), o `null` si no tiene meta. */
export async function obtenerProgresoMetaDelPromotor(
  db: SQLiteDatabase,
  promotorId: string
): Promise<ProgresoMetaDiaria | null> {
  const evento = await obtenerPuntoVigentePromotor(db, promotorId);
  if (!evento) return null;
  const [progreso] = await calcularProgreso(db, [evento], evento.fecha);
  return progreso ?? null;
}
