import * as Crypto from 'expo-crypto';
import type { SQLiteDatabase } from 'expo-sqlite';

import { aplicarDescuento } from '@/core/descuentos';
import type { MetodoPago, Pesos, Venta, VentaItem } from '@/core/tipos';

import { obtenerDescuentoVigente } from './descuentos';
import { obtenerPuntoVigentePromotor } from './eventos';
import { registrarMovimiento } from './movimientos';
import { encolarSync } from './syncCola';
import { obtenerTurnoAbiertoHoy } from './turnos';
import { obtenerOCrearUbicacionPromotor } from './ubicaciones';

interface ItemVenta {
  productoId: string;
  productoNombre: string;
  cantidad: number;
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
 * El punto vigente del promotor (ver src/db/eventos.ts) se resuelve una
 * sola vez y queda grabado en `ventas.punto_id` — no basta con el evento
 * EN_CURSO actual, porque si el admin reasigna al promotor después, una
 * consulta futura perdería en qué punto ocurrió esta venta (ver ADR 0005).
 * Ese mismo punto se usa para resolver el descuento vigente de cada línea:
 * el precio unitario que se guarda ya es el precio con descuento aplicado
 * — el recibo y el total reflejan lo que realmente se cobró, sin necesitar
 * columnas extra en `venta_items`.
 */
export async function registrarVenta(
  db: SQLiteDatabase,
  datos: DatosVenta,
  dispositivoId: string
): Promise<Venta> {
  const turnoAbierto = await obtenerTurnoAbiertoHoy(db, datos.promotorId);
  if (!turnoAbierto) throw new SinTurnoAbiertoError();

  const id = datos.id ?? Crypto.randomUUID();
  const ahora = new Date().toISOString();
  const puntoVigente = await obtenerPuntoVigentePromotor(db, datos.promotorId);
  const puntoId = puntoVigente?.puntoId ?? null;

  const itemsConDescuento = await Promise.all(
    datos.items.map(async (item) => {
      const descuento = await obtenerDescuentoVigente(db, {
        productoId: item.productoId,
        puntoId,
        ahora,
      });
      return { ...item, precioUnitario: aplicarDescuento(item.precioUnitario, descuento) };
    })
  );
  const total = itemsConDescuento.reduce((suma, item) => suma + item.cantidad * item.precioUnitario, 0);

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

    for (const item of itemsConDescuento) {
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
