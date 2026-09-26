import * as Crypto from 'expo-crypto';
import type { SQLiteDatabase } from 'expo-sqlite';

import type { MetodoPago, Pesos, Venta, VentaItem } from '@/core/tipos';

import { obtenerPuntoVigentePromotor } from './eventos';
import { registrarMovimiento } from './movimientos';
import { encolarSync } from './syncCola';
import { obtenerTurnoAbiertoHoy } from './turnos';
import { obtenerOCrearUbicacionPromotor } from './ubicaciones';

interface ItemVenta {
  productoId: string;
  productoNombre: string;
  cantidad: number;
  /**
   * Precio que se COBRA por unidad, ya con el descuento aplicado — el mismo
   * que el promotor vio en su ticket (`resolverPreciosConDescuento`,
   * src/db/descuentos.ts). Aquí se guarda tal cual, sin volver a aplicar nada.
   */
  precioUnitario: Pesos;
}

interface DatosVenta {
  /** Id pre-generado en el cliente (R3) — necesario cuando ya se guardó una foto de comprobante con ese id antes de insertar la venta. Si se omite, se genera aquí. */
  id?: string;
  promotorId: string;
  promotorNombre: string;
  items: ItemVenta[];
  metodoPago: MetodoPago;
  comprobanteUri?: string | null;
  /** Cliente final al que se le asigna esta factura (opcional, ver migración 0019). */
  clienteId?: string | null;
}

interface FilaVenta {
  id: string;
  numero_recibo: string;
  promotor_id: string;
  promotor_nombre: string;
  punto_id: string | null;
  punto_nombre: string | null;
  ts_cliente: string;
  metodo_pago: MetodoPago;
  total: number;
  anulada: number;
  motivo_anulacion: string | null;
  comprobante_uri: string | null;
  cliente_id: string | null;
  cliente_nombre: string | null;
}

const COLUMNAS_VENTA = `v.id, v.numero_recibo, v.promotor_id, u.nombre as promotor_nombre,
   v.punto_id, pt.nombre as punto_nombre,
   v.ts_cliente, v.metodo_pago, v.total, v.anulada, v.motivo_anulacion, v.comprobante_uri,
   v.cliente_id, c.nombre_completo as cliente_nombre`;

const JOIN_VENTA = `FROM ventas v
     JOIN usuarios u ON u.id = v.promotor_id
     LEFT JOIN puntos pt ON pt.id = v.punto_id
     LEFT JOIN clientes c ON c.id = v.cliente_id`;

function aVenta(fila: FilaVenta): Venta {
  return {
    id: fila.id,
    numeroRecibo: fila.numero_recibo,
    promotorId: fila.promotor_id,
    promotorNombre: fila.promotor_nombre,
    puntoId: fila.punto_id,
    puntoNombre: fila.punto_nombre,
    tsCliente: fila.ts_cliente,
    metodoPago: fila.metodo_pago,
    total: fila.total,
    anulada: fila.anulada === 1,
    motivoAnulacion: fila.motivo_anulacion,
    comprobanteUri: fila.comprobante_uri,
    clienteId: fila.cliente_id,
    clienteNombre: fila.cliente_nombre,
  };
}

export class VentaYaAnuladaError extends Error {
  constructor() {
    super('Esta venta ya está anulada.');
    this.name = 'VentaYaAnuladaError';
  }
}

/**
 * Sin evento de hoy no se vende (decisión del negocio, 2026-09-25): así el
 * admin le quita la venta a un promotor retirándolo del evento o cancelando
 * el evento, y cada venta queda siempre en la empresa y el punto donde se hizo.
 */
export class SinEventoHoyError extends Error {
  constructor() {
    super('No tienes un evento asignado hoy. Pídele al administrador que te asigne uno para poder vender.');
    this.name = 'SinEventoHoyError';
  }
}

export class SinTurnoAbiertoError extends Error {
  constructor() {
    super('No tienes un turno abierto hoy. Inicia turno antes de vender.');
    this.name = 'SinTurnoAbiertoError';
  }
}

async function generarNumeroRecibo(db: SQLiteDatabase, dispositivoId: string): Promise<string> {
  const prefijo = dispositivoId.slice(0, 4).toUpperCase();
  const fila = await db.getFirstAsync<{ total: number }>(
    'SELECT COUNT(*) as total FROM ventas WHERE dispositivo_id = ?',
    [dispositivoId]
  );
  const consecutivo = (fila?.total ?? 0) + 1;
  return `${prefijo}-${consecutivo.toString().padStart(6, '0')}`;
}

/**
 * Registra una venta: cabecera + líneas + un movimiento VENTA por producto
 * (sale del saldo del promotor), todo en una sola transacción.
 *
 * Exige turno abierto hoy y un evento de hoy (`SinEventoHoyError`). El
 * evento vigente del promotor A ESTA HORA (`obtenerPuntoVigentePromotor`,
 * src/db/eventos.ts) se resuelve una sola vez y su punto queda grabado en
 * `ventas.punto_id` — si después lo mueven de evento, lo ya vendido sigue en
 * el punto donde se vendió (ver ADR 0005).
 *
 * El descuento NO se aplica aquí: cada línea llega con el precio que el
 * promotor ya vio en su ticket y le cobró al cliente (resuelto al agregar el
 * producto con `resolverPreciosConDescuento`). Antes se aplicaba aquí, a
 * escondidas: el ticket mostraba el precio lleno, el cliente pagaba eso y la
 * venta quedaba registrada con descuento — el arqueo de caja no cuadraba.
 * El recibo y el total reflejan lo que realmente se cobró, sin necesitar
 * columnas extra en `venta_items`.
 */
export async function registrarVenta(
  db: SQLiteDatabase,
  datos: DatosVenta,
  dispositivoId: string
): Promise<Venta> {
  const turnoAbierto = await obtenerTurnoAbiertoHoy(db, datos.promotorId);
  if (!turnoAbierto) throw new SinTurnoAbiertoError();

  const puntoVigente = await obtenerPuntoVigentePromotor(db, datos.promotorId);
  if (!puntoVigente) throw new SinEventoHoyError();

  const id = datos.id ?? Crypto.randomUUID();
  const ahora = new Date().toISOString();
  const puntoId = puntoVigente.puntoId;

  const total = datos.items.reduce((suma, item) => suma + item.cantidad * item.precioUnitario, 0);

  await db.withTransactionAsync(async () => {
    const numeroRecibo = await generarNumeroRecibo(db, dispositivoId);

    await db.runAsync(
      `INSERT INTO ventas (id, numero_recibo, promotor_id, punto_id, ts_cliente, metodo_pago, total, dispositivo_id, comprobante_uri, cliente_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        numeroRecibo,
        datos.promotorId,
        puntoId,
        ahora,
        datos.metodoPago,
        total,
        dispositivoId,
        datos.comprobanteUri ?? null,
        datos.clienteId ?? null,
      ]
    );

    if (datos.comprobanteUri) {
      await encolarSync(db, { tabla: 'comprobantes_venta', entidadId: id, tipoTarea: 'FILA' });
      await encolarSync(db, { tabla: 'comprobantes_venta', entidadId: id, tipoTarea: 'FOTO' });
    }

    const ubicacionPromotor = await obtenerOCrearUbicacionPromotor(
      db,
      datos.promotorId,
      datos.promotorNombre,
      dispositivoId
    );

    for (const item of datos.items) {
      await db.runAsync(
        `INSERT INTO venta_items (venta_id, producto_id, cantidad, precio_unitario, ts_cliente, dispositivo_id)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [id, item.productoId, item.cantidad, item.precioUnitario, ahora, dispositivoId]
      );
      const movimientoId = await registrarMovimiento(
        db,
        {
          tipo: 'VENTA',
          productoId: item.productoId,
          cantidad: item.cantidad,
          ubicacionOrigenId: ubicacionPromotor,
          ubicacionDestinoId: null,
          usuarioId: datos.promotorId,
        },
        dispositivoId
      );
      await encolarSync(db, { tabla: 'movimientos', entidadId: movimientoId, tipoTarea: 'FILA' });
    }

    await encolarSync(db, { tabla: 'ventas', entidadId: id, tipoTarea: 'FILA' });
  });

  const creada = await obtenerVenta(db, id);
  if (!creada) throw new Error('No se pudo registrar la venta');
  return creada.venta;
}

export async function listarVentas(
  db: SQLiteDatabase,
  opciones: { incluirAnuladas?: boolean; rango?: { desde: string; hasta: string } } = {}
): Promise<Venta[]> {
  const condiciones = [opciones.incluirAnuladas ? 'v.anulada = 1' : 'v.anulada = 0'];
  const parametros: string[] = [];
  if (opciones.rango) {
    condiciones.push('v.ts_cliente BETWEEN ? AND ?');
    parametros.push(opciones.rango.desde, opciones.rango.hasta);
  }

  const filas = await db.getAllAsync<FilaVenta>(
    `SELECT ${COLUMNAS_VENTA}
     ${JOIN_VENTA}
     WHERE ${condiciones.join(' AND ')}
     ORDER BY v.ts_cliente DESC`,
    parametros
  );
  return filas.map(aVenta);
}

/**
 * Ventas del promotor dentro del turno actual (desde `horaInicio` hasta
 * `horaFin` o ahora si sigue abierto) — para "Ventas del turno" en
 * app/promotor/. Incluye anuladas (marcadas en la UI) para que el listado
 * coincida con lo que el promotor recuerda haber hecho ese turno.
 */
export async function listarVentasTurno(
  db: SQLiteDatabase,
  promotorId: string,
  turno: { horaInicio: string; horaFin: string | null }
): Promise<Venta[]> {
  const hasta = turno.horaFin ?? new Date().toISOString();
  const filas = await db.getAllAsync<FilaVenta>(
    `SELECT ${COLUMNAS_VENTA}
     ${JOIN_VENTA}
     WHERE v.promotor_id = ? AND v.ts_cliente BETWEEN ? AND ?
     ORDER BY v.ts_cliente DESC`,
    [promotorId, turno.horaInicio, hasta]
  );
  return filas.map(aVenta);
}

/**
 * Ventas de HOY en el punto del evento (de todo el equipo, incluido quien
 * consulta) — el equipo comparte la meta del día, que se mide igual
 * (src/db/metasDiarias.ts). Por punto y no por persona: si a alguien lo
 * movieron de evento, lo que vendió aquí sigue siendo de aquí, y lo que vendió
 * en otro punto no se cuela. En el celular de un promotor, las de sus
 * compañeros llegan de Supabase (`descargarVentasNuevas` con ámbito EQUIPO).
 * Más reciente primero; incluye anuladas (se muestran marcadas, igual que en
 * "Mis ventas").
 */
export async function listarVentasEquipoHoy(
  db: SQLiteDatabase,
  puntoId: string,
  rango: { desde: string; hasta: string }
): Promise<Venta[]> {
  const filas = await db.getAllAsync<FilaVenta>(
    `SELECT ${COLUMNAS_VENTA}
     ${JOIN_VENTA}
     WHERE v.punto_id = ? AND v.ts_cliente BETWEEN ? AND ?
     ORDER BY v.ts_cliente DESC`,
    [puntoId, rango.desde, rango.hasta]
  );
  return filas.map(aVenta);
}

/**
 * Todas las facturas (ventas, de cualquier método de pago) de un promotor en
 * un rango — la hora más reciente primero, incluidas las anuladas — con sus
 * productos. Para que el admin compare lo cobrado contra lo vendido
 * (app/admin/calendario/facturas.tsx); la foto de las transferencias hechas
 * en otro dispositivo se completa desde Supabase (`obtenerComprobanteRemoto`).
 */
export async function listarFacturasPromotor(
  db: SQLiteDatabase,
  promotorId: string,
  rango: { desde: string; hasta: string }
): Promise<{ venta: Venta; items: VentaItem[] }[]> {
  const filas = await db.getAllAsync<FilaVenta>(
    `SELECT ${COLUMNAS_VENTA}
     ${JOIN_VENTA}
     WHERE v.promotor_id = ? AND v.ts_cliente BETWEEN ? AND ?
     ORDER BY v.ts_cliente DESC`,
    [promotorId, rango.desde, rango.hasta]
  );
  if (filas.length === 0) return [];
  const lineas = await db.getAllAsync<{
    venta_id: string;
    producto_id: string;
    producto_nombre: string;
    cantidad: number;
    precio_unitario: number;
  }>(
    `SELECT vi.venta_id, vi.producto_id, p.nombre as producto_nombre, vi.cantidad, vi.precio_unitario
     FROM venta_items vi
     JOIN productos p ON p.id = vi.producto_id
     WHERE vi.venta_id IN (${filas.map(() => '?').join(', ')})
     ORDER BY p.nombre`,
    filas.map((f) => f.id)
  );
  return filas.map((fila) => ({
    venta: aVenta(fila),
    items: lineas
      .filter((l) => l.venta_id === fila.id)
      .map((l) => ({
        productoId: l.producto_id,
        productoNombre: l.producto_nombre,
        cantidad: l.cantidad,
        precioUnitario: l.precio_unitario,
      })),
  }));
}

export async function obtenerVenta(
  db: SQLiteDatabase,
  id: string
): Promise<{ venta: Venta; items: VentaItem[] } | null> {
  const fila = await db.getFirstAsync<FilaVenta>(
    `SELECT ${COLUMNAS_VENTA}
     ${JOIN_VENTA}
     WHERE v.id = ?`,
    [id]
  );
  if (!fila) return null;

  const lineas = await db.getAllAsync<{
    producto_id: string;
    producto_nombre: string;
    cantidad: number;
    precio_unitario: number;
  }>(
    `SELECT vi.producto_id, p.nombre as producto_nombre, vi.cantidad, vi.precio_unitario
     FROM venta_items vi
     JOIN productos p ON p.id = vi.producto_id
     WHERE vi.venta_id = ?`,
    [id]
  );

  return {
    venta: aVenta(fila),
    items: lineas.map((linea) => ({
      productoId: linea.producto_id,
      productoNombre: linea.producto_nombre,
      cantidad: linea.cantidad,
      precioUnitario: linea.precio_unitario,
    })),
  };
}

/**
 * Anular una venta nunca la borra (R2): se marca y se revierte su efecto en
 * el inventario con un ANULACION_VENTA por línea, que le devuelve el
 * producto al promotor — ver docs/03-decisiones/0004-anulacion-de-ventas.md.
 */
export async function anularVenta(
  db: SQLiteDatabase,
  datos: { ventaId: string; adminId: string; motivo: string },
  dispositivoId: string
): Promise<void> {
  const encontrada = await obtenerVenta(db, datos.ventaId);
  if (!encontrada) throw new Error('Esta venta ya no existe.');
  if (encontrada.venta.anulada) throw new VentaYaAnuladaError();

  await db.withTransactionAsync(async () => {
    const resultado = await db.runAsync(
      'UPDATE ventas SET anulada = 1, motivo_anulacion = ? WHERE id = ? AND anulada = 0',
      [datos.motivo, datos.ventaId]
    );
    if (resultado.changes === 0) throw new VentaYaAnuladaError();

    const ubicacionPromotor = await obtenerOCrearUbicacionPromotor(
      db,
      encontrada.venta.promotorId,
      encontrada.venta.promotorNombre,
      dispositivoId
    );

    for (const item of encontrada.items) {
      const movimientoId = await registrarMovimiento(
        db,
        {
          tipo: 'ANULACION_VENTA',
          productoId: item.productoId,
          cantidad: item.cantidad,
          ubicacionOrigenId: null,
          ubicacionDestinoId: ubicacionPromotor,
          usuarioId: datos.adminId,
          motivo: datos.motivo,
        },
        dispositivoId
      );
      await encolarSync(db, { tabla: 'movimientos', entidadId: movimientoId, tipoTarea: 'FILA' });
    }

    // Re-sube la venta: `anulada`/`motivo_anulacion` cambiaron.
    await encolarSync(db, { tabla: 'ventas', entidadId: datos.ventaId, tipoTarea: 'FILA' });
  });
}

/**
 * Asigna (o quita, con `clienteId = null`) el cliente final de una venta ya
 * registrada — ej. cuando la persona pide la factura electrónica después de
 * pagar. No es un movimiento de inventario, así que un UPDATE directo sobre
 * `ventas` es correcto (mismo criterio que `anularVenta`/`comprobante_uri`).
 */
export async function asignarClienteAVenta(
  db: SQLiteDatabase,
  ventaId: string,
  clienteId: string | null
): Promise<void> {
  await db.runAsync('UPDATE ventas SET cliente_id = ? WHERE id = ?', [clienteId, ventaId]);
  // Re-sube la venta: `cliente_nombre` (desnormalizado en Supabase) cambió.
  await encolarSync(db, { tabla: 'ventas', entidadId: ventaId, tipoTarea: 'FILA' });
}
