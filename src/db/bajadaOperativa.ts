import type { SQLiteDatabase } from 'expo-sqlite';

import { mensajeDeError } from '@/core/errores';
import { getSupabaseClient } from '@/sync/supabaseClient';

import { getDispositivoId } from './dispositivo';
import { resolverProductoLocalId, resolverUbicacionLocalId, resolverUsuarioLocalId } from './mapeoRemoto';
import { guardarCursor, leerCursor } from './syncEstado';

/**
 * Descarga de datos OPERATIVOS desde Supabase hacia la base local — lo que
 * otro dispositivo generó y este necesita ver: el admin ve las ventas de los
 * promotores, bodega ve los cargues que admin planeó, y cada uno ve los
 * movimientos de inventario que le corresponden (una RECARGA hecha en bodega
 * tiene que llegar al saldo del promotor). Todas devuelven cuántas filas
 * cambiaron localmente (0 = nada nuevo) para que quien las llama sepa si
 * vale la pena refrescar pantallas. Best-effort: nunca lanzan.
 *
 * A diferencia de la bajada de personal/catálogo (`descargarDatosDeAdmin`,
 * solo Promotor/Bodega), esto SÍ corre en el dispositivo de admin: estos datos
 * no los crea admin, así que no hay edición local que pisar.
 *
 * Cursor por `subido_ts` (hora del SERVIDOR, la fija un trigger en Supabase)
 * con 5 s de solape: dos filas con casi el mismo instante pueden confirmarse
 * fuera de orden, y todo lo que se aplica es idempotente. Los ids de producto,
 * persona y ubicación se traducen por clave natural — ver `mapeoRemoto.ts`.
 */

const SOLAPE_MS = 5000;
const TAMANO_PAGINA = 500;

function conSolape(cursor: string | null): string | null {
  if (!cursor) return null;
  const t = new Date(cursor).getTime();
  return Number.isNaN(t) ? null : new Date(t - SOLAPE_MS).toISOString();
}

/**
 * `.in('col', ids)` viaja en la URL: con cientos de ids se pasa del límite de
 * longitud de Supabase — se parte en lotes.
 */
function enLotes<T>(elementos: T[], tamano = 40): T[][] {
  const lotes: T[][] = [];
  for (let i = 0; i < elementos.length; i += tamano) lotes.push(elementos.slice(i, i + tamano));
  return lotes;
}

function mayor(a: string | null, b: string): string {
  return a && new Date(a).getTime() >= new Date(b).getTime() ? a : b;
}

// ---------------------------------------------------------------------------
// Ventas (para admin)
// ---------------------------------------------------------------------------

interface FilaVentaRemota {
  id: string;
  numero_recibo: string;
  promotor_id: string;
  promotor_nombre: string;
  punto_id: string | null;
  ts_cliente: string;
  metodo_pago: string;
  total: number;
  anulada: boolean;
  motivo_anulacion: string | null;
  dispositivo_id: string;
  subido_ts: string;
}

interface FilaVentaItemRemota {
  venta_id: string;
  producto_id: string;
  producto_sku: string | null;
  producto_nombre: string;
  cantidad: number;
  precio_unitario: number;
  ts_cliente: string;
  dispositivo_id: string;
}

async function aplicarVentaRemota(
  db: SQLiteDatabase,
  venta: FilaVentaRemota,
  items: FilaVentaItemRemota[],
  dispositivoId: string
): Promise<boolean> {
  const promotorId = await resolverUsuarioLocalId(
    db,
    { id: venta.promotor_id, nombre: venta.promotor_nombre, rol: 'PROMOTOR' },
    dispositivoId
  );

  const itemsLocales: { productoId: string; item: FilaVentaItemRemota }[] = [];
  for (const item of items) {
    const productoId = await resolverProductoLocalId(db, { id: item.producto_id, sku: item.producto_sku, nombre: item.producto_nombre });
    if (!productoId) throw new Error(`producto "${item.producto_nombre}" no existe en este dispositivo`);
    itemsLocales.push({ productoId, item });
  }

  // Los puntos los crea admin, así que existen con el mismo id en su
  // dispositivo y en el de los promotores; si aun así no está (un punto que
  // nunca subió), la venta se guarda sin punto en vez de romper la llave
  // foránea.
  const punto = venta.punto_id
    ? await db.getFirstAsync<{ id: string }>('SELECT id FROM puntos WHERE id = ?', [venta.punto_id])
    : null;

  const previa = await db.getFirstAsync<{ anulada: number }>('SELECT anulada FROM ventas WHERE id = ?', [venta.id]);

  const seAnula = !!previa && previa.anulada === 0 && venta.anulada;
  let itemsNuevos = 0;
  await db.withTransactionAsync(async () => {
    if (!previa) {
      await db.runAsync(
        `INSERT INTO ventas (id, numero_recibo, evento_id, promotor_id, punto_id, ts_cliente, metodo_pago, total, dispositivo_id, anulada, motivo_anulacion)
         VALUES (?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          venta.id,
          venta.numero_recibo,
          promotorId,
          punto?.id ?? null,
          venta.ts_cliente,
          venta.metodo_pago,
          venta.total,
          venta.dispositivo_id,
          venta.anulada ? 1 : 0,
          venta.motivo_anulacion,
        ]
      );
    } else if (seAnula) {
      // Una anulación nunca se deshace: si aquí ya está anulada (admin la
      // anuló en este dispositivo y esa subida todavía está pendiente), se
      // conserva aunque Supabase aún diga que no. Una venta que ya está (ej.
      // la propia, que vuelve al bajar las del equipo) no se reinserta: el
      // índice único de `numero_recibo` rechazaría el intento.
      await db.runAsync(
        'UPDATE ventas SET anulada = 1, motivo_anulacion = COALESCE(motivo_anulacion, ?) WHERE id = ?',
        [venta.motivo_anulacion, venta.id]
      );
    }
    // Las líneas pueden llegar una vuelta después que su cabecera.
    for (const { productoId, item } of itemsLocales) {
      const resultado = await db.runAsync(
        `INSERT OR IGNORE INTO venta_items (venta_id, producto_id, cantidad, precio_unitario, ts_cliente, dispositivo_id)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [venta.id, productoId, item.cantidad, item.precio_unitario, item.ts_cliente, item.dispositivo_id]
      );
      itemsNuevos += resultado.changes;
    }
  });

  return !previa || seAnula || itemsNuevos > 0;
}

/**
 * Qué ventas bajar: TODAS (admin, para ver lo que venden los promotores), o
 * las de HOY en el punto del evento de un promotor (EQUIPO) — así cada
 * promotor ve las ventas de sus compañeros de evento y el progreso de la
 * meta compartida (src/db/metasDiarias.ts). Por punto y no por persona: el
 * punto tiene el mismo id en todos los dispositivos (lo crea el admin),
 * mientras que los usuarios de prueba de `__DEV__` no.
 */
export type AmbitoVentas = { tipo: 'TODAS' } | { tipo: 'EQUIPO'; puntoId: string; fecha: string };

/** Trae de Supabase las ventas nuevas o modificadas (anuladas) del ámbito pedido. */
export async function descargarVentasNuevas(
  db: SQLiteDatabase,
  ambito: AmbitoVentas = { tipo: 'TODAS' }
): Promise<number> {
  let cambios = 0;
  const clave = ambito.tipo === 'TODAS' ? 'ventas' : `ventas:PUNTO:${ambito.puntoId}:${ambito.fecha}`;
  try {
    const supabase = await getSupabaseClient();
    const dispositivoId = await getDispositivoId(db);
    let cursorGuardado = await leerCursor(db, clave);
    let desde = conSolape(cursorGuardado);

    for (;;) {
      let consulta = supabase.from('ventas').select('*');
      if (ambito.tipo === 'EQUIPO') {
        // Desde la medianoche de ese día en Colombia (UTC-5 fijo).
        const inicioDia = new Date(`${ambito.fecha}T00:00:00-05:00`).toISOString();
        consulta = consulta.eq('punto_id', ambito.puntoId).gte('ts_cliente', inicioDia);
      }
      if (desde) consulta = consulta.gt('subido_ts', desde);
      const { data: ventas, error } = await consulta
        .order('subido_ts', { ascending: true })
        .limit(TAMANO_PAGINA)
        .returns<FilaVentaRemota[]>();
      if (error) throw error;
      if (!ventas || ventas.length === 0) break;

      const items: FilaVentaItemRemota[] = [];
      for (const lote of enLotes(ventas.map((v) => v.id))) {
        const { data, error: errorItems } = await supabase
          .from('venta_items')
          .select('*')
          .in('venta_id', lote)
          .returns<FilaVentaItemRemota[]>();
        if (errorItems) throw errorItems;
        items.push(...(data ?? []));
      }

      for (const venta of ventas) {
        try {
          const cambio = await aplicarVentaRemota(
            db,
            venta,
            items.filter((i) => i.venta_id === venta.id),
            dispositivoId
          );
          if (cambio) cambios++;
        } catch (errorVenta) {
          console.log(`[ventas] no se pudo aplicar ${venta.numero_recibo}:`, mensajeDeError(errorVenta));
        }
        cursorGuardado = mayor(cursorGuardado, venta.subido_ts);
      }
      if (cursorGuardado) await guardarCursor(db, clave, cursorGuardado);
      desde = ventas[ventas.length - 1].subido_ts;
      if (ventas.length < TAMANO_PAGINA) break;
    }
  } catch (error) {
    console.log('[ventas] no se pudieron descargar ventas nuevas:', mensajeDeError(error));
  }
  return cambios;
}

// ---------------------------------------------------------------------------
// Movimientos de inventario (bodega, admin y promotor)
// ---------------------------------------------------------------------------

export type AmbitoMovimientos = { tipo: 'BODEGA' } | { tipo: 'PROMOTOR'; usuarioId: string };

interface FilaMovimientoRemota {
  id: string;
  tipo: string;
  producto_id: string;
  producto_sku: string | null;
  producto_nombre: string;
  cantidad: number;
  ubicacion_origen_tipo: string | null;
  ubicacion_origen_nombre: string | null;
  ubicacion_origen_responsable_id: string | null;
  ubicacion_destino_tipo: string | null;
  ubicacion_destino_nombre: string | null;
  ubicacion_destino_responsable_id: string | null;
  usuario_id: string;
  usuario_nombre: string;
  motivo: string | null;
  ts_cliente: string;
  dispositivo_id: string;
  subido_ts: string;
}

/**
 * Trae los movimientos que tocan la bodega (bodega y admin) o el saldo de un
 * promotor (ese promotor) — cada dispositivo solo tenía los suyos, así que una
 * RECARGA hecha en el celular de bodega nunca llegaba al inventario del
 * promotor. Solo INSERT (R2, nunca se modifica un movimiento): el id lo
 * genera el dispositivo de origen (R3) y `INSERT OR IGNORE` hace idempotente
 * volver a recibir uno que ya está (incluidos los propios). El lote no viaja
 * todavía: el movimiento llega sin `lote_id`.
 */
export async function descargarMovimientosNuevos(db: SQLiteDatabase, ambito: AmbitoMovimientos): Promise<number> {
  let cambios = 0;
  const clave = ambito.tipo === 'BODEGA' ? 'movimientos:BODEGA' : `movimientos:PROMOTOR:${ambito.usuarioId}`;
  const filtro =
    ambito.tipo === 'BODEGA'
      ? 'ubicacion_origen_tipo.eq.BODEGA,ubicacion_destino_tipo.eq.BODEGA'
      : `ubicacion_origen_responsable_id.eq.${ambito.usuarioId},ubicacion_destino_responsable_id.eq.${ambito.usuarioId}`;

  try {
    const supabase = await getSupabaseClient();
    const dispositivoId = await getDispositivoId(db);
    let cursorGuardado = await leerCursor(db, clave);
    let desde = conSolape(cursorGuardado);

    for (;;) {
      let consulta = supabase.from('movimientos').select('*').or(filtro);
      if (desde) consulta = consulta.gt('subido_ts', desde);
      const { data: movimientos, error } = await consulta
        .order('subido_ts', { ascending: true })
        .limit(TAMANO_PAGINA)
        .returns<FilaMovimientoRemota[]>();
      if (error) throw error;
      if (!movimientos || movimientos.length === 0) break;

      for (const m of movimientos) {
        try {
          const productoId = await resolverProductoLocalId(db, { id: m.producto_id, sku: m.producto_sku, nombre: m.producto_nombre });
          if (!productoId) throw new Error(`producto "${m.producto_nombre}" no existe en este dispositivo`);
          const usuarioId = await resolverUsuarioLocalId(
            db,
            { id: m.usuario_id, nombre: m.usuario_nombre, rol: 'BODEGA' },
            dispositivoId
          );
          const origenId = await resolverUbicacionLocalId(
            db,
            { tipo: m.ubicacion_origen_tipo, responsableId: m.ubicacion_origen_responsable_id, nombre: m.ubicacion_origen_nombre },
            dispositivoId
          );
          const destinoId = await resolverUbicacionLocalId(
            db,
            { tipo: m.ubicacion_destino_tipo, responsableId: m.ubicacion_destino_responsable_id, nombre: m.ubicacion_destino_nombre },
            dispositivoId
          );
          const resultado = await db.runAsync(
            `INSERT OR IGNORE INTO movimientos (
               id, tipo, producto_id, lote_id, cantidad, ubicacion_origen_id, ubicacion_destino_id,
               evento_id, usuario_id, motivo, ts_cliente, dispositivo_id
             ) VALUES (?, ?, ?, NULL, ?, ?, ?, NULL, ?, ?, ?, ?)`,
            [m.id, m.tipo, productoId, m.cantidad, origenId, destinoId, usuarioId, m.motivo, m.ts_cliente, m.dispositivo_id]
          );
          cambios += resultado.changes;
        } catch (errorMovimiento) {
          console.log(`[movimientos] no se pudo aplicar ${m.tipo} de "${m.producto_nombre}":`, mensajeDeError(errorMovimiento));
        }
        cursorGuardado = mayor(cursorGuardado, m.subido_ts);
      }
      if (cursorGuardado) await guardarCursor(db, clave, cursorGuardado);
      desde = movimientos[movimientos.length - 1].subido_ts;
      if (movimientos.length < TAMANO_PAGINA) break;
    }
  } catch (error) {
    console.log('[movimientos] no se pudieron descargar movimientos nuevos:', mensajeDeError(error));
  }
  return cambios;
}

// ---------------------------------------------------------------------------
// Cargues (bodega y admin)
// ---------------------------------------------------------------------------

interface FilaCargueRemota {
  id: string;
  promotor_id: string;
  promotor_nombre: string;
  estado: string;
  creado_por: string | null;
  ts_cliente: string;
  dispositivo_id: string;
  subido_ts: string;
}

interface FilaCargueLineaRemota {
  id: string;
  cargue_id: string;
  producto_id: string;
  producto_sku: string | null;
  producto_nombre: string;
  cantidad_planeada: number;
  cantidad_entregada: number;
  estado: string;
  motivo_revision: string | null;
  ts_cliente: string;
  dispositivo_id: string;
}

async function firmaCargue(db: SQLiteDatabase, cargueId: string): Promise<string> {
  const cabecera = await db.getFirstAsync<{ estado: string }>('SELECT estado FROM cargues WHERE id = ?', [cargueId]);
  const lineas = await db.getAllAsync<{ id: string; estado: string; cantidad_planeada: number; cantidad_entregada: number }>(
    'SELECT id, estado, cantidad_planeada, cantidad_entregada FROM cargue_lineas WHERE cargue_id = ? ORDER BY id',
    [cargueId]
  );
  return JSON.stringify([cabecera?.estado ?? null, lineas]);
}

async function aplicarCargueRemoto(
  db: SQLiteDatabase,
  cargue: FilaCargueRemota,
  lineas: FilaCargueLineaRemota[],
  dispositivoId: string
): Promise<boolean> {
  // Si aquí hay cambios propios todavía sin subir, NO se pisan con la copia
  // remota (que aún no los tiene) — se aplican en la próxima descarga, ya
  // subidos. Evita que una edición de admin o una entrega de bodega en curso
  // se deshaga.
  const pendiente = await db.getFirstAsync<{ id: string }>(
    "SELECT id FROM _sync_pendiente WHERE tabla = 'cargues' AND entidad_id = ? AND completado_ts IS NULL LIMIT 1",
    [cargue.id]
  );
  if (pendiente) return false;

  const promotorId = await resolverUsuarioLocalId(
    db,
    { id: cargue.promotor_id, nombre: cargue.promotor_nombre, rol: 'PROMOTOR' },
    dispositivoId
  );
  const creadoPor = cargue.creado_por
    ? await resolverUsuarioLocalId(db, { id: cargue.creado_por, nombre: null, rol: 'ADMIN' }, dispositivoId)
    : promotorId;

  const lineasLocales: { productoId: string; linea: FilaCargueLineaRemota }[] = [];
  for (const linea of lineas) {
    const productoId = await resolverProductoLocalId(db, { id: linea.producto_id, sku: linea.producto_sku, nombre: linea.producto_nombre });
    if (!productoId) {
      console.log(`[cargues] línea omitida: producto "${linea.producto_nombre}" no existe en este dispositivo`);
      continue;
    }
    lineasLocales.push({ productoId, linea });
  }

  const antes = await firmaCargue(db, cargue.id);
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `INSERT INTO cargues (id, promotor_id, estado, creado_por, ts_cliente, dispositivo_id)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         estado = CASE WHEN cargues.estado = 'ENTREGADO' THEN cargues.estado ELSE excluded.estado END`,
      [cargue.id, promotorId, cargue.estado, creadoPor, cargue.ts_cliente, cargue.dispositivo_id]
    );
    for (const { productoId, linea } of lineasLocales) {
      // Una línea ya ENTREGADA aquí (su RECARGA ya se generó) no retrocede.
      await db.runAsync(
        `INSERT INTO cargue_lineas (id, cargue_id, producto_id, cantidad_planeada, cantidad_entregada, estado, motivo_revision, ts_cliente, dispositivo_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           cantidad_planeada = excluded.cantidad_planeada,
           cantidad_entregada = CASE WHEN cargue_lineas.estado = 'ENTREGADA' THEN cargue_lineas.cantidad_entregada ELSE excluded.cantidad_entregada END,
           estado = CASE WHEN cargue_lineas.estado = 'ENTREGADA' THEN cargue_lineas.estado ELSE excluded.estado END,
           motivo_revision = CASE WHEN cargue_lineas.estado = 'ENTREGADA' THEN cargue_lineas.motivo_revision ELSE excluded.motivo_revision END`,
        [
          linea.id,
          cargue.id,
          productoId,
          linea.cantidad_planeada,
          linea.cantidad_entregada,
          linea.estado,
          linea.motivo_revision,
          linea.ts_cliente,
          linea.dispositivo_id,
        ]
      );
    }
    // Admin quitó una línea que aún estaba pendiente. Solo si Supabase ya
    // tiene las líneas de este cargue (si la cabecera llegó antes que ellas,
    // no se borra nada).
    if (lineas.length > 0) {
      const idsRemotos = lineas.map((l) => l.id);
      await db.runAsync(
        `DELETE FROM cargue_lineas WHERE cargue_id = ? AND estado = 'PENDIENTE'
           AND id NOT IN (${idsRemotos.map(() => '?').join(', ')})`,
        [cargue.id, ...idsRemotos]
      );
    }
  });
  return antes !== (await firmaCargue(db, cargue.id));
}

/** Trae de Supabase los cargues (y su estado de entrega) — para que bodega vea lo que admin planeó, y admin vea lo que bodega entregó. */
export async function descargarCarguesNuevos(db: SQLiteDatabase): Promise<number> {
  let cambios = 0;
  try {
    const supabase = await getSupabaseClient();
    const dispositivoId = await getDispositivoId(db);
    let cursorGuardado = await leerCursor(db, 'cargues');
    let desde = conSolape(cursorGuardado);

    for (;;) {
      let consulta = supabase.from('cargues').select('*');
      if (desde) consulta = consulta.gt('subido_ts', desde);
      const { data: cargues, error } = await consulta
        .order('subido_ts', { ascending: true })
        .limit(TAMANO_PAGINA)
        .returns<FilaCargueRemota[]>();
      if (error) throw error;
      if (!cargues || cargues.length === 0) break;

      const lineas: FilaCargueLineaRemota[] = [];
      for (const lote of enLotes(cargues.map((c) => c.id))) {
        const { data, error: errorLineas } = await supabase
          .from('cargue_lineas')
          .select('*')
          .in('cargue_id', lote)
          .returns<FilaCargueLineaRemota[]>();
        if (errorLineas) throw errorLineas;
        lineas.push(...(data ?? []));
      }

      for (const cargue of cargues) {
        try {
          const cambio = await aplicarCargueRemoto(
            db,
            cargue,
            lineas.filter((l) => l.cargue_id === cargue.id),
            dispositivoId
          );
          if (cambio) cambios++;
        } catch (errorCargue) {
          console.log('[cargues] no se pudo aplicar un cargue:', mensajeDeError(errorCargue));
        }
        cursorGuardado = mayor(cursorGuardado, cargue.subido_ts);
      }
      if (cursorGuardado) await guardarCursor(db, 'cargues', cursorGuardado);
      desde = cargues[cargues.length - 1].subido_ts;
      if (cargues.length < TAMANO_PAGINA) break;
    }
  } catch (error) {
    console.log('[cargues] no se pudieron descargar cargues nuevos:', mensajeDeError(error));
  }
  return cambios;
}

// ---------------------------------------------------------------------------
// Traslados entre promotores (para bodega, que confirma, y admin)
// ---------------------------------------------------------------------------

interface FilaTrasladoRemota {
  id: string;
  promotor_origen_id: string;
  promotor_origen_nombre: string;
  promotor_destino_id: string;
  promotor_destino_nombre: string;
  estado: string;
  creado_por: string | null;
  ts_cliente: string;
  dispositivo_id: string;
  subido_ts: string;
}

interface FilaTrasladoLineaRemota {
  id: string;
  traslado_id: string;
  producto_id: string;
  producto_sku: string | null;
  producto_nombre: string;
  cantidad_planeada: number;
  cantidad_entregada: number;
  estado: string;
  motivo_revision: string | null;
  ts_cliente: string;
  dispositivo_id: string;
}

async function firmaTraslado(db: SQLiteDatabase, trasladoId: string): Promise<string> {
  const cabecera = await db.getFirstAsync<{ estado: string }>('SELECT estado FROM traslados WHERE id = ?', [trasladoId]);
  const lineas = await db.getAllAsync<{ id: string; estado: string; cantidad_planeada: number; cantidad_entregada: number }>(
    'SELECT id, estado, cantidad_planeada, cantidad_entregada FROM traslado_lineas WHERE traslado_id = ? ORDER BY id',
    [trasladoId]
  );
  return JSON.stringify([cabecera?.estado ?? null, lineas]);
}

async function aplicarTrasladoRemoto(
  db: SQLiteDatabase,
  traslado: FilaTrasladoRemota,
  lineas: FilaTrasladoLineaRemota[],
  dispositivoId: string
): Promise<boolean> {
  // Mismo criterio que cargues: si hay cambios propios sin subir todavía,
  // no se pisan con la copia remota — se aplican en la próxima descarga.
  const pendiente = await db.getFirstAsync<{ id: string }>(
    "SELECT id FROM _sync_pendiente WHERE tabla = 'traslados' AND entidad_id = ? AND completado_ts IS NULL LIMIT 1",
    [traslado.id]
  );
  if (pendiente) return false;

  const promotorOrigenId = await resolverUsuarioLocalId(
    db,
    { id: traslado.promotor_origen_id, nombre: traslado.promotor_origen_nombre, rol: 'PROMOTOR' },
    dispositivoId
  );
  const promotorDestinoId = await resolverUsuarioLocalId(
    db,
    { id: traslado.promotor_destino_id, nombre: traslado.promotor_destino_nombre, rol: 'PROMOTOR' },
    dispositivoId
  );
  const creadoPor = traslado.creado_por
    ? await resolverUsuarioLocalId(db, { id: traslado.creado_por, nombre: null, rol: 'ADMIN' }, dispositivoId)
    : promotorOrigenId;

  const lineasLocales: { productoId: string; linea: FilaTrasladoLineaRemota }[] = [];
  for (const linea of lineas) {
    const productoId = await resolverProductoLocalId(db, { id: linea.producto_id, sku: linea.producto_sku, nombre: linea.producto_nombre });
    if (!productoId) {
      console.log(`[traslados] línea omitida: producto "${linea.producto_nombre}" no existe en este dispositivo`);
      continue;
    }
    lineasLocales.push({ productoId, linea });
  }

  const antes = await firmaTraslado(db, traslado.id);
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `INSERT INTO traslados (id, promotor_origen_id, promotor_destino_id, estado, creado_por, ts_cliente, dispositivo_id)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         estado = CASE WHEN traslados.estado = 'ENTREGADO' THEN traslados.estado ELSE excluded.estado END`,
      [traslado.id, promotorOrigenId, promotorDestinoId, traslado.estado, creadoPor, traslado.ts_cliente, traslado.dispositivo_id]
    );
    for (const { productoId, linea } of lineasLocales) {
      // Una línea ya ENTREGADA aquí (su TRASLADO ya se generó) no retrocede.
      await db.runAsync(
        `INSERT INTO traslado_lineas (id, traslado_id, producto_id, cantidad_planeada, cantidad_entregada, estado, motivo_revision, ts_cliente, dispositivo_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           cantidad_planeada = excluded.cantidad_planeada,
           cantidad_entregada = CASE WHEN traslado_lineas.estado = 'ENTREGADA' THEN traslado_lineas.cantidad_entregada ELSE excluded.cantidad_entregada END,
           estado = CASE WHEN traslado_lineas.estado = 'ENTREGADA' THEN traslado_lineas.estado ELSE excluded.estado END,
           motivo_revision = CASE WHEN traslado_lineas.estado = 'ENTREGADA' THEN traslado_lineas.motivo_revision ELSE excluded.motivo_revision END`,
        [
          linea.id,
          traslado.id,
          productoId,
          linea.cantidad_planeada,
          linea.cantidad_entregada,
          linea.estado,
          linea.motivo_revision,
          linea.ts_cliente,
          linea.dispositivo_id,
        ]
      );
    }
    // Admin quitó una línea que aún estaba pendiente. Solo si Supabase ya
    // tiene las líneas de este traslado (si la cabecera llegó antes que
    // ellas, no se borra nada).
    if (lineas.length > 0) {
      const idsRemotos = lineas.map((l) => l.id);
      await db.runAsync(
        `DELETE FROM traslado_lineas WHERE traslado_id = ? AND estado = 'PENDIENTE'
           AND id NOT IN (${idsRemotos.map(() => '?').join(', ')})`,
        [traslado.id, ...idsRemotos]
      );
    }
  });
  return antes !== (await firmaTraslado(db, traslado.id));
}

/** Trae de Supabase los traslados (y su estado de entrega) — para que bodega vea lo que admin planeó, y admin vea lo que bodega confirmó. */
export async function descargarTrasladosNuevos(db: SQLiteDatabase): Promise<number> {
  let cambios = 0;
  try {
    const supabase = await getSupabaseClient();
    const dispositivoId = await getDispositivoId(db);
    let cursorGuardado = await leerCursor(db, 'traslados');
    let desde = conSolape(cursorGuardado);

    for (;;) {
      let consulta = supabase.from('traslados').select('*');
      if (desde) consulta = consulta.gt('subido_ts', desde);
      const { data: traslados, error } = await consulta
        .order('subido_ts', { ascending: true })
        .limit(TAMANO_PAGINA)
        .returns<FilaTrasladoRemota[]>();
      if (error) throw error;
      if (!traslados || traslados.length === 0) break;

      const lineas: FilaTrasladoLineaRemota[] = [];
      for (const lote of enLotes(traslados.map((t) => t.id))) {
        const { data, error: errorLineas } = await supabase
          .from('traslado_lineas')
          .select('*')
          .in('traslado_id', lote)
          .returns<FilaTrasladoLineaRemota[]>();
        if (errorLineas) throw errorLineas;
        lineas.push(...(data ?? []));
      }

      for (const traslado of traslados) {
        try {
          const cambio = await aplicarTrasladoRemoto(
            db,
            traslado,
            lineas.filter((l) => l.traslado_id === traslado.id),
            dispositivoId
          );
          if (cambio) cambios++;
        } catch (errorTraslado) {
          console.log('[traslados] no se pudo aplicar un traslado:', mensajeDeError(errorTraslado));
        }
        cursorGuardado = mayor(cursorGuardado, traslado.subido_ts);
      }
      if (cursorGuardado) await guardarCursor(db, 'traslados', cursorGuardado);
      desde = traslados[traslados.length - 1].subido_ts;
      if (traslados.length < TAMANO_PAGINA) break;
    }
  } catch (error) {
    console.log('[traslados] no se pudieron descargar traslados nuevos:', mensajeDeError(error));
  }
  return cambios;
}
