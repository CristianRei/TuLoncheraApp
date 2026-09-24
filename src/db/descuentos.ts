import * as Crypto from 'expo-crypto';
import type { SQLiteDatabase } from 'expo-sqlite';

import { aplicarDescuento, elegirMayorDescuento, type DescuentoVigente } from '@/core/descuentos';
import { mensajeDeError } from '@/core/errores';
import type { Descuento, Pesos, TipoDescuento } from '@/core/tipos';
import { getSupabaseClient } from '@/sync/supabaseClient';

import { getDispositivoId } from './dispositivo';
import { obtenerPuntoVigentePromotor } from './eventos';
import { resolverProductoLocalId, resolverUsuarioLocalId } from './mapeoRemoto';
import { asegurarPuntosLocales } from './puntos';
import { encolarSync } from './syncCola';
import { guardarCursor, leerCursor } from './syncEstado';

export type { DescuentoVigente } from '@/core/descuentos';

interface FilaDescuento {
  id: string;
  producto_id: string | null;
  producto_nombre: string | null;
  punto_id: string | null;
  punto_nombre: string | null;
  promotor_id: string | null;
  promotor_nombre: string | null;
  tipo: TipoDescuento;
  valor: number;
  desde: string;
  hasta: string;
  activo: number;
}

const COLUMNAS_DESCUENTO = `d.id, d.producto_id, p.nombre as producto_nombre, d.punto_id, pt.nombre as punto_nombre,
   d.promotor_id, u.nombre as promotor_nombre, d.tipo, d.valor, d.desde, d.hasta, d.activo`;

function aDescuento(fila: FilaDescuento): Descuento {
  return {
    id: fila.id,
    productoId: fila.producto_id,
    productoNombre: fila.producto_nombre,
    puntoId: fila.punto_id,
    puntoNombre: fila.punto_nombre,
    promotorId: fila.promotor_id,
    promotorNombre: fila.promotor_nombre,
    tipo: fila.tipo,
    valor: fila.valor,
    desde: fila.desde,
    hasta: fila.hasta,
    activo: fila.activo === 1,
  };
}

export async function listarDescuentos(db: SQLiteDatabase): Promise<Descuento[]> {
  const filas = await db.getAllAsync<FilaDescuento>(
    `SELECT ${COLUMNAS_DESCUENTO}
     FROM descuentos d
     LEFT JOIN productos p ON p.id = d.producto_id
     LEFT JOIN puntos pt ON pt.id = d.punto_id
     LEFT JOIN usuarios u ON u.id = d.promotor_id
     ORDER BY d.desde DESC`
  );
  return filas.map(aDescuento);
}

function encolarDescuento(db: SQLiteDatabase, id: string): Promise<void> {
  return encolarSync(db, { tabla: 'descuentos', entidadId: id, tipoTarea: 'FILA' });
}

/**
 * Crea una regla de descuento. `productoId`/`puntoId`/`promotorId` NULL =
 * aplica a todos en esa dimensión. `desde`/`hasta` son instantes completos
 * (ISO): el horario es continuo, del primer día a la hora de inicio hasta el
 * último a la hora de fin. Sube a Supabase en la misma transacción (el
 * celular del promotor la necesita para cobrar con descuento);
 * `sincronizar: false` solo lo usa el seed de demo.
 */
export async function crearDescuento(
  db: SQLiteDatabase,
  datos: {
    productoId?: string | null;
    puntoId?: string | null;
    promotorId?: string | null;
    tipo: TipoDescuento;
    valor: number;
    desde: string;
    hasta: string;
    creadoPor: string;
  },
  dispositivoId: string,
  opciones: { sincronizar?: boolean } = {}
): Promise<string> {
  const id = Crypto.randomUUID();
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `INSERT INTO descuentos (id, producto_id, punto_id, promotor_id, tipo, valor, desde, hasta, activo, creado_por, ts_cliente, dispositivo_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)`,
      [
        id,
        datos.productoId ?? null,
        datos.puntoId ?? null,
        datos.promotorId ?? null,
        datos.tipo,
        datos.valor,
        datos.desde,
        datos.hasta,
        datos.creadoPor,
        new Date().toISOString(),
        dispositivoId,
      ]
    );
    if (opciones.sincronizar ?? true) await encolarDescuento(db, id);
  });
  return id;
}

export async function desactivarDescuento(db: SQLiteDatabase, id: string): Promise<void> {
  await db.withTransactionAsync(async () => {
    await db.runAsync('UPDATE descuentos SET activo = 0 WHERE id = ?', [id]);
    await encolarDescuento(db, id);
  });
}

export interface PrecioConDescuento {
  /** Precio del catálogo, sin descuento. */
  precioLista: Pesos;
  /** Lo que se cobra: el precio de lista con el mayor descuento vigente aplicado. */
  precioFinal: Pesos;
  descuento: DescuentoVigente | null;
}

/**
 * Precio que el promotor le cobra HOY, ahora mismo, por cada producto: el
 * de lista con el MAYOR descuento vigente que le aplique — por producto, por
 * el punto donde está hoy (su evento del calendario), por promotor, o
 * general. Nunca se suman (ver `elegirMayorDescuento`). Se usa al agregar al
 * ticket (lo que el promotor ve es lo que cobra) y se vuelve a calcular al
 * abrir el ticket y antes de cobrar, por si un horario terminó o empezó con
 * el ticket abierto. Una sola consulta para todos los productos.
 */
export async function resolverPreciosConDescuento(
  db: SQLiteDatabase,
  datos: { promotorId: string; productos: { id: string; precio: Pesos }[]; ahora?: string }
): Promise<Map<string, PrecioConDescuento>> {
  const ahora = datos.ahora ?? new Date().toISOString();
  const puntoVigente = await obtenerPuntoVigentePromotor(db, datos.promotorId);
  const reglas = await db.getAllAsync<{ producto_id: string | null; tipo: TipoDescuento; valor: number }>(
    `SELECT producto_id, tipo, valor
     FROM descuentos
     WHERE activo = 1
       AND desde <= ? AND hasta >= ?
       AND (punto_id IS NULL OR punto_id = ?)
       AND (promotor_id IS NULL OR promotor_id = ?)
     ORDER BY ts_cliente DESC`,
    [ahora, ahora, puntoVigente?.puntoId ?? null, datos.promotorId]
  );

  const precios = new Map<string, PrecioConDescuento>();
  for (const producto of datos.productos) {
    const candidatas = reglas.filter((r) => r.producto_id === null || r.producto_id === producto.id);
    const mejor = elegirMayorDescuento(producto.precio, candidatas);
    const descuento = mejor ? { tipo: mejor.tipo, valor: mejor.valor } : null;
    precios.set(producto.id, {
      precioLista: producto.precio,
      precioFinal: aplicarDescuento(producto.precio, descuento),
      descuento,
    });
  }
  return precios;
}

// ---------------------------------------------------------------------------
// Sincronización: admin sube, Promotor/Bodega descargan (Bloque 5)
// ---------------------------------------------------------------------------

export interface DescuentoParaSync {
  id: string;
  productoId: string | null;
  productoSku: string | null;
  productoNombre: string | null;
  puntoId: string | null;
  promotorId: string | null;
  promotorNombre: string | null;
  tipo: TipoDescuento;
  valor: number;
  desde: string;
  hasta: string;
  activo: boolean;
  creadoPor: string;
  creadoPorNombre: string | null;
  tsCliente: string;
}

/**
 * Una regla con lo que el otro dispositivo necesita para traducirla: el
 * `sku` del producto (los 123 productos iniciales tienen id distinto en cada
 * dispositivo) y los nombres de las personas (ver mapeoRemoto.ts).
 */
export async function obtenerDescuentoParaSync(db: SQLiteDatabase, id: string): Promise<DescuentoParaSync | null> {
  const fila = await db.getFirstAsync<{
    id: string;
    producto_id: string | null;
    producto_sku: string | null;
    producto_nombre: string | null;
    punto_id: string | null;
    promotor_id: string | null;
    promotor_nombre: string | null;
    tipo: TipoDescuento;
    valor: number;
    desde: string;
    hasta: string;
    activo: number;
    creado_por: string;
    creado_por_nombre: string | null;
    ts_cliente: string;
  }>(
    `SELECT d.id, d.producto_id, p.sku as producto_sku, p.nombre as producto_nombre, d.punto_id,
            d.promotor_id, u.nombre as promotor_nombre, d.tipo, d.valor, d.desde, d.hasta, d.activo,
            d.creado_por, c.nombre as creado_por_nombre, d.ts_cliente
     FROM descuentos d
     LEFT JOIN productos p ON p.id = d.producto_id
     LEFT JOIN usuarios u ON u.id = d.promotor_id
     LEFT JOIN usuarios c ON c.id = d.creado_por
     WHERE d.id = ?`,
    [id]
  );
  if (!fila) return null;
  return {
    id: fila.id,
    productoId: fila.producto_id,
    productoSku: fila.producto_sku,
    productoNombre: fila.producto_nombre,
    puntoId: fila.punto_id,
    promotorId: fila.promotor_id,
    promotorNombre: fila.promotor_nombre,
    tipo: fila.tipo,
    valor: fila.valor,
    desde: fila.desde,
    hasta: fila.hasta,
    activo: fila.activo === 1,
    creadoPor: fila.creado_por,
    creadoPorNombre: fila.creado_por_nombre,
    tsCliente: fila.ts_cliente,
  };
}

/**
 * Encola una sola vez los descuentos que existían antes de que sincronizaran
 * — se llama al entrar el admin (app/index.tsx, solo fuera de `__DEV__`),
 * igual que `encolarEventosSinSubir`.
 */
export async function encolarDescuentosSinSubir(db: SQLiteDatabase): Promise<void> {
  const pendientes = await db.getAllAsync<{ id: string }>(
    `SELECT d.id FROM descuentos d
     WHERE NOT EXISTS (SELECT 1 FROM _sync_pendiente s WHERE s.tabla = 'descuentos' AND s.entidad_id = d.id)`
  );
  if (pendientes.length === 0) return;
  await db.withTransactionAsync(async () => {
    for (const { id } of pendientes) await encolarDescuento(db, id);
  });
}

interface FilaDescuentoRemota {
  id: string;
  producto_id: string | null;
  producto_sku: string | null;
  producto_nombre: string | null;
  punto_id: string | null;
  promotor_id: string | null;
  promotor_nombre: string | null;
  tipo: TipoDescuento;
  valor: number;
  desde: string;
  hasta: string;
  activo: boolean;
  creado_por: string;
  creado_por_nombre: string | null;
  ts_cliente: string;
  dispositivo_id: string;
  subido_ts: string;
}

const SOLAPE_CURSOR_MS = 5000;
const TAMANO_PAGINA_DESCUENTOS = 500;

async function aplicarDescuentoRemoto(
  db: SQLiteDatabase,
  d: FilaDescuentoRemota,
  dispositivoId: string
): Promise<boolean> {
  // Edición propia aún sin subir (en `__DEV__` admin y promotor comparten
  // base): no se pisa con la copia remota — mismo criterio que eventos.
  const pendiente = await db.getFirstAsync<{ id: string }>(
    "SELECT id FROM _sync_pendiente WHERE tabla = 'descuentos' AND entidad_id = ? AND completado_ts IS NULL LIMIT 1",
    [d.id]
  );
  if (pendiente) return false;

  // Un producto o punto que este dispositivo no conoce NO se reemplaza por
  // NULL: eso convertiría "10 % en este producto" en "10 % en todo".
  let productoId: string | null = null;
  if (d.producto_id) {
    productoId = await resolverProductoLocalId(db, { id: d.producto_id, sku: d.producto_sku, nombre: d.producto_nombre });
    if (!productoId) throw new Error(`producto "${d.producto_nombre}" no existe en este dispositivo`);
  }
  if (d.punto_id) {
    const punto = await db.getFirstAsync<{ id: string }>('SELECT id FROM puntos WHERE id = ?', [d.punto_id]);
    if (!punto) throw new Error('el punto del descuento no existe en este dispositivo');
  }
  const promotorId = d.promotor_id
    ? await resolverUsuarioLocalId(db, { id: d.promotor_id, nombre: d.promotor_nombre, rol: 'PROMOTOR' }, dispositivoId)
    : null;
  const creadoPor = await resolverUsuarioLocalId(
    db,
    { id: d.creado_por, nombre: d.creado_por_nombre, rol: 'ADMIN' },
    dispositivoId
  );

  const previa = await db.getFirstAsync<{ activo: number }>('SELECT activo FROM descuentos WHERE id = ?', [d.id]);
  // El valor y la vigencia de una regla nunca se editan (se desactiva y se
  // crea otra, ver migración 0012): lo único que cambia al volver a recibirla
  // es `activo`. Las fechas se normalizan al formato local ("...Z") porque se
  // comparan como texto contra `new Date().toISOString()`.
  await db.runAsync(
    `INSERT INTO descuentos (id, producto_id, punto_id, promotor_id, tipo, valor, desde, hasta, activo, creado_por, ts_cliente, dispositivo_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET activo = excluded.activo`,
    [
      d.id,
      productoId,
      d.punto_id,
      promotorId,
      d.tipo,
      d.valor,
      new Date(d.desde).toISOString(),
      new Date(d.hasta).toISOString(),
      d.activo ? 1 : 0,
      creadoPor,
      new Date(d.ts_cliente).toISOString(),
      d.dispositivo_id,
    ]
  );
  return !previa || previa.activo !== (d.activo ? 1 : 0);
}

/**
 * Trae de Supabase los descuentos que el admin haya creado o desactivado —
 * así el celular del promotor cobra con el descuento que le asignaron. Debe
 * correr DESPUÉS de personal, catálogo y puntos (`descargarDatosDeAdmin`,
 * src/sync/bajada.ts). Cursor por `subido_ts`, igual que eventos. Nunca se
 * llama desde el dispositivo de admin. Devuelve cuántos cambiaron
 * localmente; best-effort, nunca lanza.
 */
export async function descargarDescuentosNuevos(db: SQLiteDatabase): Promise<number> {
  let cambios = 0;
  try {
    const supabase = await getSupabaseClient();
    const dispositivoId = await getDispositivoId(db);
    let cursor = await leerCursor(db, 'descuentos');
    let desde = cursor ? new Date(new Date(cursor).getTime() - SOLAPE_CURSOR_MS).toISOString() : null;

    for (;;) {
      let consulta = supabase.from('descuentos').select('*');
      if (desde) consulta = consulta.gt('subido_ts', desde);
      const { data: descuentos, error } = await consulta
        .order('subido_ts', { ascending: true })
        .limit(TAMANO_PAGINA_DESCUENTOS)
        .returns<FilaDescuentoRemota[]>();
      if (error) throw error;
      if (!descuentos || descuentos.length === 0) break;

      await asegurarPuntosLocales(db, descuentos.map((d) => d.punto_id));

      for (const d of descuentos) {
        try {
          if (await aplicarDescuentoRemoto(db, d, dispositivoId)) cambios++;
        } catch (errorDescuento) {
          console.log('[descuentos] no se pudo aplicar un descuento:', mensajeDeError(errorDescuento));
        }
        if (!cursor || new Date(d.subido_ts).getTime() > new Date(cursor).getTime()) cursor = d.subido_ts;
      }
      if (cursor) await guardarCursor(db, 'descuentos', cursor);
      desde = descuentos[descuentos.length - 1].subido_ts;
      if (descuentos.length < TAMANO_PAGINA_DESCUENTOS) break;
    }
  } catch (error) {
    console.log('[descuentos] no se pudieron descargar descuentos nuevos:', mensajeDeError(error));
  }
  return cambios;
}
