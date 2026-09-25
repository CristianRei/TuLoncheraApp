import * as Crypto from 'expo-crypto';
import type { SQLiteDatabase } from 'expo-sqlite';

import { fechaHoyBogota } from '@/core/analitica';
import type { MetodoPago } from '@/core/tipos';

import { crearCategoria } from './categorias';
import { crearEvento } from './eventos';
import { crearEmpresa } from './empresas';
import { crearDescuento } from './descuentos';
import { crearLote } from './lotes';
import { registrarMovimiento } from './movimientos';
import { listarProductos } from './productos';
import { crearPunto } from './puntos';
import { obtenerOCrearUbicacionBodega, obtenerOCrearUbicacionPromotor } from './ubicaciones';

/** SKU al que el seed deja poco stock a propósito, para poder ver la notificación STOCK_BAJO funcionando. */
const SKU_STOCK_BAJO = 'TL001';
/** SKU al que el seed le crea un lote por vencer, para poder ver LOTE_POR_VENCER funcionando. */
const SKU_LOTE_POR_VENCER = 'TL002';
const DIAS_PARA_VENCER_DEMO = 4;

const MOTIVO_SEED = 'seed-demo';

interface PromotorSemilla {
  nombre: string;
  rol: 'PROMOTOR';
  pin: string;
}

/** Promotores extra para que el dashboard tenga varios nombres que comparar — Cristian ya existe en seed.ts. */
const PROMOTORES_DEMO: PromotorSemilla[] = [
  { nombre: 'Laura Gómez', rol: 'PROMOTOR', pin: '2201' },
  { nombre: 'Andrés Pérez', rol: 'PROMOTOR', pin: '2202' },
];

interface EmpresaSemilla {
  nombre: string;
  puntos: string[];
}

const EMPRESAS_DEMO: EmpresaSemilla[] = [
  { nombre: 'Falabella', puntos: ['Norte', 'Sur'] },
  { nombre: 'Éxito', puntos: ['Centro'] },
];

/** Categoría/marca real para un subconjunto del catálogo, para que "Por categoría" del dashboard tenga datos. */
const CATEGORIAS_DEMO: { sku: string; categoria: string; marca: string }[] = [
  { sku: 'TL001', categoria: 'Snacks', marca: 'Ramo' },
  { sku: 'TL002', categoria: 'Snacks', marca: 'Ramo' },
  { sku: 'TL003', categoria: 'Dulces', marca: 'Trululu' },
  { sku: 'TL005', categoria: 'Dulces', marca: 'Colágeno' },
  { sku: 'TL006', categoria: 'Dulces', marca: 'Grisly' },
  { sku: 'TL008', categoria: 'Snacks', marca: 'Pringles' },
  { sku: 'TL010', categoria: 'Dulces', marca: 'Bombombun' },
  { sku: 'TL012', categoria: 'Ponqués', marca: 'Ramo' },
  { sku: 'TL013', categoria: 'Ponqués', marca: 'Selecta' },
  { sku: 'TL014', categoria: 'Ponqués', marca: 'Ramo' },
  { sku: 'TL015', categoria: 'Ponqués', marca: 'Ramo' },
  { sku: 'TL017', categoria: 'Ponqués', marca: 'Bimbo' },
  { sku: 'TL018', categoria: 'Ponqués', marca: 'Ramo' },
  { sku: 'TL020', categoria: 'Ponqués', marca: 'Ramo' },
  { sku: 'TL104', categoria: 'Licores', marca: 'Monserrate' },
  { sku: 'TL105', categoria: 'Licores', marca: 'La Merced' },
  { sku: 'TL111', categoria: 'Licores', marca: 'Sixpack' },
];

const SKUS_VENTA = CATEGORIAS_DEMO.map((c) => c.sku);
const METODOS_PAGO: MetodoPago[] = ['EFECTIVO', 'TRANSFERENCIA', 'LIBRANZA'];
const PESOS_METODO_PAGO = [0.55, 0.35, 0.1]; // más efectivo, algo de transferencia, poca libranza

const DIAS_HISTORIA = 30;
const VENTAS_POR_DIA_PROMEDIO = 6;

function elegirConPeso<T>(opciones: T[], pesos: number[]): T {
  const total = pesos.reduce((suma, p) => suma + p, 0);
  let punto = Math.random() * total;
  for (let i = 0; i < opciones.length; i++) {
    punto -= pesos[i];
    if (punto <= 0) return opciones[i];
  }
  return opciones[opciones.length - 1];
}

function elegirAlAzar<T>(opciones: T[]): T {
  return opciones[Math.floor(Math.random() * opciones.length)];
}

/** Hora del día con más probabilidad en horario laboral/almuerzo, poca de madrugada. */
function elegirHoraVenta(): number {
  const pesosHora = [
    0, 0, 0, 0, 0, 0, // 0-5
    1, 2, 4, 6, 7, 8, // 6-11
    10, 9, 7, 6, 6, 7, // 12-17
    8, 6, 3, 2, 1, 1, // 18-23
  ];
  return elegirConPeso(
    Array.from({ length: 24 }, (_, h) => h),
    pesosHora
  );
}

/**
 * Solo para desarrollo (ver app/_layout.tsx, se llama bajo __DEV__).
 * Puebla empresas/puntos, promotores extra, un descuento vigente, y ~30
 * días de ventas distribuidas en el tiempo — para que el dashboard admin
 * (filtros, desgloses, gráfico de horas, rango personalizado) tenga datos
 * reales que mostrar en vez de estados vacíos.
 *
 * Las ventas se insertan directamente en las tablas (no vía
 * `registrarVenta`, que siempre usa `new Date()`) porque necesitan
 * timestamps pasados para simular un histórico — es la única razón para
 * saltarse la función real de negocio aquí. Idempotente: revisa si ya
 * existe un movimiento marcado con MOTIVO_SEED antes de insertar de nuevo.
 */
export async function sembrarDatosDemo(
  db: SQLiteDatabase,
  adminId: string,
  dispositivoId: string
): Promise<void> {
  const yaSembrado = await db.getFirstAsync<{ id: string }>(
    'SELECT id FROM movimientos WHERE motivo = ? LIMIT 1',
    [MOTIVO_SEED]
  );
  if (yaSembrado) return;

  // Categoría/marca en el catálogo real. `crearCategoria` es crear-o-reusar
  // por nombre normalizado, así que llamarla varias veces con el mismo
  // nombre (ej. "Ponqués" aparece en 7 filas de CATEGORIAS_DEMO) nunca
  // duplica la categoría.
  const productos = await listarProductos(db);
  const productoPorSku = new Map(productos.map((p) => [p.sku, p]));
  const categoriaIdPorNombre = new Map<string, string>();
  for (const { sku, categoria, marca } of CATEGORIAS_DEMO) {
    const producto = productoPorSku.get(sku);
    if (!producto) continue;
    let categoriaId = categoriaIdPorNombre.get(categoria);
    if (!categoriaId) {
      categoriaId = (await crearCategoria(db, categoria, dispositivoId, { sincronizar: false })).id;
      categoriaIdPorNombre.set(categoria, categoriaId);
    }
    await db.runAsync('UPDATE productos SET categoria_id = ?, marca = ? WHERE id = ?', [
      categoriaId,
      marca,
      producto.id,
    ]);
  }

  // Promotores extra
  const ahoraIso = new Date().toISOString();
  const existentes = await db.getAllAsync<{ pin: string }>('SELECT pin FROM usuarios');
  const pinsExistentes = new Set(existentes.map((f) => f.pin));
  for (const promotor of PROMOTORES_DEMO) {
    if (pinsExistentes.has(promotor.pin)) continue;
    await db.runAsync(
      `INSERT INTO usuarios (id, nombre, rol, activo, pin, ts_cliente, dispositivo_id)
       VALUES (?, ?, 'PROMOTOR', 1, ?, ?, ?)`,
      [Crypto.randomUUID(), promotor.nombre, promotor.pin, ahoraIso, dispositivoId]
    );
  }
  const promotores = await db.getAllAsync<{ id: string; nombre: string }>(
    "SELECT id, nombre FROM usuarios WHERE rol = 'PROMOTOR' AND activo = 1"
  );
  if (promotores.length === 0) return;

  // Empresas y puntos
  const puntosCreados: { id: string; empresaId: string }[] = [];
  for (const { nombre, puntos } of EMPRESAS_DEMO) {
    const empresa = await crearEmpresa(db, { nombre }, dispositivoId, { sincronizar: false });
    for (const nombrePunto of puntos) {
      const punto = await crearPunto(db, { empresaId: empresa.id, nombre: nombrePunto }, dispositivoId, {
        sincronizar: false,
      });
      puntosCreados.push({ id: punto.id, empresaId: empresa.id });
    }
  }
  if (puntosCreados.length === 0) return;

  // Cada promotor queda con un evento de hoy en un punto distinto (rotando si hay más promotores que puntos).
  // Hoy en Bogotá — con la fecha UTC, después de las 7 pm el evento de demo caía en mañana.
  const hoy = fechaHoyBogota();
  for (let i = 0; i < promotores.length; i++) {
    const punto = puntosCreados[i % puntosCreados.length];
    await crearEvento(
      db,
      {
        empresaId: punto.empresaId,
        puntoId: punto.id,
        fecha: hoy,
        promotorIds: [promotores[i].id],
        creadoPor: adminId,
        horaInicio: '08:00',
        horaFin: '16:00',
      },
      dispositivoId,
      { sincronizar: false }
    );
  }

  // Un descuento vigente sobre un producto en un punto, para que "descuento
  // aplicado" también se vea reflejado en algunas ventas de la demo.
  await crearDescuento(
    db,
    {
      productoId: productoPorSku.get('TL012')?.id ?? null,
      puntoId: puntosCreados[0].id,
      tipo: 'PORCENTAJE',
      valor: 10,
      desde: new Date(Date.now() - DIAS_HISTORIA * 24 * 60 * 60 * 1000).toISOString(),
      hasta: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      creadoPor: adminId,
    },
    dispositivoId,
    { sincronizar: false }
  );

  // Stock de bodega suficiente para que cada promotor tenga saldo a vender.
  // SKU_STOCK_BAJO recibe muy poco a propósito, para que la notificación
  // STOCK_BAJO tenga algo real que detectar contra sus ventas del período.
  const ubicacionBodega = await obtenerOCrearUbicacionBodega(db, dispositivoId);
  for (const sku of SKUS_VENTA) {
    const producto = productoPorSku.get(sku);
    if (!producto) continue;
    await registrarMovimiento(
      db,
      {
        tipo: 'COMPRA_PROVEEDOR',
        productoId: producto.id,
        cantidad: sku === SKU_STOCK_BAJO ? 5 : 400,
        ubicacionOrigenId: null,
        ubicacionDestinoId: ubicacionBodega,
        usuarioId: adminId,
        motivo: MOTIVO_SEED,
      },
      dispositivoId
    );
  }

  // Un lote por vencer en los próximos días, para que la notificación
  // LOTE_POR_VENCER tenga algo real que detectar.
  const productoLotePorVencer = productoPorSku.get(SKU_LOTE_POR_VENCER);
  if (productoLotePorVencer) {
    const fechaVencimiento = new Date(Date.now() + DIAS_PARA_VENCER_DEMO * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);
    const loteId = await crearLote(db, productoLotePorVencer.id, fechaVencimiento, dispositivoId);
    await registrarMovimiento(
      db,
      {
        tipo: 'COMPRA_PROVEEDOR',
        productoId: productoLotePorVencer.id,
        loteId,
        cantidad: 20,
        ubicacionOrigenId: null,
        ubicacionDestinoId: ubicacionBodega,
        usuarioId: adminId,
        motivo: MOTIVO_SEED,
      },
      dispositivoId
    );
  }

  const ubicacionPorPromotor = new Map<string, string>();
  for (const promotor of promotores) {
    const ubicacionPromotor = await obtenerOCrearUbicacionPromotor(
      db,
      promotor.id,
      promotor.nombre,
      dispositivoId
    );
    ubicacionPorPromotor.set(promotor.id, ubicacionPromotor);
    for (const sku of SKUS_VENTA) {
      const producto = productoPorSku.get(sku);
      if (!producto) continue;
      if (sku === SKU_STOCK_BAJO) continue; // se queda casi todo en bodega, con poco stock a propósito
      await registrarMovimiento(
        db,
        {
          tipo: 'RECARGA',
          productoId: producto.id,
          cantidad: 30,
          ubicacionOrigenId: ubicacionBodega,
          ubicacionDestinoId: ubicacionPromotor,
          usuarioId: adminId,
          motivo: MOTIVO_SEED,
        },
        dispositivoId
      );
    }
  }

  // Punto vigente por promotor, para grabarlo en cada venta simulada (igual que hace registrarVenta real)
  const puntoVigentePorPromotor = new Map<string, string>();
  for (let i = 0; i < promotores.length; i++) {
    puntoVigentePorPromotor.set(promotores[i].id, puntosCreados[i % puntosCreados.length].id);
  }

  // Ventas distribuidas en los últimos DIAS_HISTORIA días
  const prefijoRecibo = dispositivoId.slice(0, 4).toUpperCase();
  let consecutivo = 1;

  for (let diaAtras = 0; diaAtras < DIAS_HISTORIA; diaAtras++) {
    const cantidadVentasDelDia = Math.max(
      0,
      Math.round(VENTAS_POR_DIA_PROMEDIO + (Math.random() * 6 - 3))
    );

    for (let v = 0; v < cantidadVentasDelDia; v++) {
      const promotor = elegirAlAzar(promotores);
      const ubicacionPromotor = ubicacionPorPromotor.get(promotor.id);
      if (!ubicacionPromotor) continue;

      const hora = elegirHoraVenta();
      const minuto = Math.floor(Math.random() * 60);
      const fecha = new Date();
      fecha.setUTCDate(fecha.getUTCDate() - diaAtras);
      // Hora local de Bogotá (UTC-5) → UTC sumando 5 horas
      fecha.setUTCHours(hora + 5, minuto, 0, 0);
      const tsCliente = fecha.toISOString();

      const cantidadItems = 1 + Math.floor(Math.random() * 3);
      const skusVenta = new Set<string>();
      while (skusVenta.size < cantidadItems) {
        skusVenta.add(elegirAlAzar(SKUS_VENTA));
      }

      const ventaId = Crypto.randomUUID();
      const numeroRecibo = `${prefijoRecibo}-${String(consecutivo).padStart(6, '0')}`;
      consecutivo++;
      const metodoPago = elegirConPeso(METODOS_PAGO, PESOS_METODO_PAGO);
      const puntoId = puntoVigentePorPromotor.get(promotor.id) ?? null;

      let total = 0;
      const lineas: { productoId: string; cantidad: number; precioUnitario: number }[] = [];
      for (const sku of skusVenta) {
        const producto = productoPorSku.get(sku);
        if (!producto) continue;
        const cantidad = 1 + Math.floor(Math.random() * 3);
        lineas.push({ productoId: producto.id, cantidad, precioUnitario: producto.precio });
        total += cantidad * producto.precio;
      }
      if (lineas.length === 0) continue;

      await db.runAsync(
        `INSERT INTO ventas (id, numero_recibo, promotor_id, punto_id, ts_cliente, metodo_pago, total, dispositivo_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [ventaId, numeroRecibo, promotor.id, puntoId, tsCliente, metodoPago, total, dispositivoId]
      );

      for (const linea of lineas) {
        await db.runAsync(
          `INSERT INTO venta_items (venta_id, producto_id, cantidad, precio_unitario, ts_cliente, dispositivo_id)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [ventaId, linea.productoId, linea.cantidad, linea.precioUnitario, tsCliente, dispositivoId]
        );
        await db.runAsync(
          `INSERT INTO movimientos (id, tipo, producto_id, lote_id, cantidad, ubicacion_origen_id, ubicacion_destino_id, evento_id, usuario_id, motivo, ts_cliente, dispositivo_id)
           VALUES (?, 'VENTA', ?, NULL, ?, ?, NULL, NULL, ?, ?, ?, ?)`,
          [
            Crypto.randomUUID(),
            linea.productoId,
            linea.cantidad,
            ubicacionPromotor,
            promotor.id,
            MOTIVO_SEED,
            tsCliente,
            dispositivoId,
          ]
        );
      }
    }
  }
}
