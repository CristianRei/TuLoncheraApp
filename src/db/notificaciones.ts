import * as Crypto from 'expo-crypto';
import type { SQLiteDatabase } from 'expo-sqlite';

import { calcularRangoHoyBogota } from '@/core/analitica';
import type { ModoLogin, NivelNotificacion, Notificacion, TipoNotificacion } from '@/core/tipos';

import { listarProductosVendidos } from './analitica';
import { listarLotesConVencimiento } from './lotes';
import { obtenerSaldosBodega, obtenerSaldosPorLote } from './inventario';

const DIAS_HISTORIA_VELOCIDAD = 30;
const MINIMO_VENTAS_PARA_ALERTAR = 3;
const DIAS_UMBRAL_STOCK_BAJO = 7;
const DIAS_UMBRAL_STOCK_CRITICO = 3;
const DIAS_UMBRAL_VENCIMIENTO = 15;
const DIAS_UMBRAL_VENCIMIENTO_CRITICO = 5;

interface NotificacionCandidata {
  tipo: TipoNotificacion;
  nivel: NivelNotificacion;
  titulo: string;
  detalle: string;
  productoId: string | null;
  loteId: string | null;
  claveDeduplicacion: string;
}

/**
 * Cada tipo de notificación es un detector independiente con esta misma
 * forma — agregar el próximo tipo que se pida después es sumar una función
 * nueva a `DETECTORES`, sin tocar el generador, la pantalla ni el modelo.
 */
interface DetectorNotificacion {
  detectar(db: SQLiteDatabase): Promise<NotificacionCandidata[]>;
}

const detectorStockBajo: DetectorNotificacion = {
  async detectar(db: SQLiteDatabase): Promise<NotificacionCandidata[]> {
    const rango = calcularRangoHoyBogota();
    rango.desde = new Date(
      new Date(rango.hasta).getTime() - DIAS_HISTORIA_VELOCIDAD * 24 * 60 * 60 * 1000
    ).toISOString();

    const [saldosBodega, productosVendidos] = await Promise.all([
      obtenerSaldosBodega(db),
      listarProductosVendidos(db, rango),
    ]);

    const candidatas: NotificacionCandidata[] = [];

    for (const producto of productosVendidos) {
      if (producto.unidadesVendidas < MINIMO_VENTAS_PARA_ALERTAR) continue;
      const saldoActual = saldosBodega.get(producto.productoId) ?? 0;
      const velocidadDiaria = producto.unidadesVendidas / DIAS_HISTORIA_VELOCIDAD;
      if (velocidadDiaria <= 0) continue;
      const diasParaAgotarse = saldoActual / velocidadDiaria;
      if (diasParaAgotarse >= DIAS_UMBRAL_STOCK_BAJO) continue;

      const nivel: NivelNotificacion = diasParaAgotarse < DIAS_UMBRAL_STOCK_CRITICO ? 'CRITICO' : 'ALERTA';
      const diasRedondeados = Math.max(0, Math.round(diasParaAgotarse));

      candidatas.push({
        tipo: 'STOCK_BAJO',
        nivel,
        titulo: `Stock bajo: ${producto.productoNombre}`,
        detalle: `Quedan ${saldoActual} unidades en bodega — al ritmo de venta actual se agotan en ≈${diasRedondeados} día${diasRedondeados === 1 ? '' : 's'}.`,
        productoId: producto.productoId,
        loteId: null,
        claveDeduplicacion: `STOCK_BAJO:${producto.productoId}`,
      });
    }

    return candidatas;
  },
};

const detectorLotePorVencer: DetectorNotificacion = {
  async detectar(db: SQLiteDatabase): Promise<NotificacionCandidata[]> {
    const [lotes, saldosPorLote] = await Promise.all([
      listarLotesConVencimiento(db),
      obtenerSaldosPorLote(db),
    ]);

    const ahora = Date.now();
    const candidatas: NotificacionCandidata[] = [];

    for (const lote of lotes) {
      const saldo = saldosPorLote.get(lote.id) ?? 0;
      if (saldo <= 0) continue;

      const diasParaVencer = Math.floor(
        (new Date(lote.fechaVencimiento).getTime() - ahora) / (24 * 60 * 60 * 1000)
      );
      if (diasParaVencer > DIAS_UMBRAL_VENCIMIENTO) continue;

      const nivel: NivelNotificacion =
        diasParaVencer < DIAS_UMBRAL_VENCIMIENTO_CRITICO ? 'CRITICO' : 'ALERTA';
      const descripcionTiempo =
        diasParaVencer < 0
          ? 'ya venció'
          : diasParaVencer === 0
            ? 'vence hoy'
            : `vence en ${diasParaVencer} día${diasParaVencer === 1 ? '' : 's'}`;

      candidatas.push({
        tipo: 'LOTE_POR_VENCER',
        nivel,
        titulo: `Lote por vencer: ${lote.productoNombre}`,
        detalle: `${saldo} unidades ${descripcionTiempo} (${lote.fechaVencimiento}).`,
        productoId: lote.productoId,
        loteId: lote.id,
        claveDeduplicacion: `LOTE_POR_VENCER:${lote.id}`,
      });
    }

    return candidatas;
  },
};

const detectorCargueRevisar: DetectorNotificacion = {
  async detectar(db: SQLiteDatabase): Promise<NotificacionCandidata[]> {
    const filas = await db.getAllAsync<{
      id: string;
      promotor_nombre: string;
      producto_nombre: string;
      cantidad_planeada: number;
      cantidad_entregada: number;
      motivo_revision: string | null;
    }>(
      `SELECT cl.id, u.nombre as promotor_nombre, p.nombre as producto_nombre,
              cl.cantidad_planeada, cl.cantidad_entregada, cl.motivo_revision
       FROM cargue_lineas cl
       JOIN cargues c ON c.id = cl.cargue_id
       JOIN usuarios u ON u.id = c.promotor_id
       JOIN productos p ON p.id = cl.producto_id
       WHERE cl.estado = 'REVISAR'`
    );

    return filas.map((fila) => ({
      tipo: 'CARGUE_REVISAR',
      nivel: 'ALERTA',
      titulo: `Cargue a revisar: ${fila.producto_nombre}`,
      detalle: `${fila.promotor_nombre} — entregado ${fila.cantidad_entregada} de ${fila.cantidad_planeada} planeados.${fila.motivo_revision ? ` Motivo: ${fila.motivo_revision}` : ''}`,
      productoId: null,
      loteId: null,
      claveDeduplicacion: `CARGUE_REVISAR:${fila.id}`,
    }));
  },
};

const DETECTORES: DetectorNotificacion[] = [detectorStockBajo, detectorLotePorVencer, detectorCargueRevisar];

/**
 * Prefijos de clave de deduplicación que NO pasan por los detectores — son
 * eventos puntuales (algo que ocurrió una vez, ej. un desbloqueo de PIN),
 * no condiciones de negocio recalculables como stock bajo o un lote por
 * vencer. `generarNotificaciones` nunca las marca `resuelta` (no hay
 * "condición" que dejar de cumplirse): se insertan directo donde ocurre el
 * evento (ver `registrarNotificacionDesbloqueo`) y solo se apagan cuando el
 * admin las marca leídas.
 */
const PREFIJOS_EVENTO_PUNTUAL = ['DESBLOQUEO_PIN:'];

function esEventoPuntual(claveDeduplicacion: string): boolean {
  return PREFIJOS_EVENTO_PUNTUAL.some((prefijo) => claveDeduplicacion.startsWith(prefijo));
}

/**
 * Corre todos los detectores y sincroniza la tabla: las claves de
 * deduplicación que siguen activas no se duplican (upsert), las que ya no
 * aparecen entre las candidatas se marcan `resuelta=1` (la condición que
 * las generó ya no aplica — stock repuesto, lote vencido y retirado, etc.).
 * Las notificaciones de evento puntual (ver `esEventoPuntual`) se saltan
 * por completo aquí — nunca fueron candidatas de ningún detector, así que
 * "no están entre las candidatas" no significa que ya no apliquen.
 * Se llama al entrar a /admin/notificaciones y al entrar al menú admin
 * (para el contador), igual patrón que ya usan los indicadores del menú.
 */
export async function generarNotificaciones(db: SQLiteDatabase, dispositivoId: string): Promise<void> {
  const candidatas = (await Promise.all(DETECTORES.map((d) => d.detectar(db)))).flat();
  const clavesActivas = new Set(candidatas.map((c) => c.claveDeduplicacion));

  const existentes = await db.getAllAsync<{ id: string; clave_deduplicacion: string }>(
    'SELECT id, clave_deduplicacion FROM notificaciones WHERE resuelta = 0'
  );
  const clavesExistentes = new Set(existentes.map((fila) => fila.clave_deduplicacion));

  await db.withTransactionAsync(async () => {
    // Resolver las que ya no aplican (nunca las de evento puntual)
    for (const fila of existentes) {
      if (esEventoPuntual(fila.clave_deduplicacion)) continue;
      if (!clavesActivas.has(fila.clave_deduplicacion)) {
        await db.runAsync('UPDATE notificaciones SET resuelta = 1 WHERE id = ?', [fila.id]);
      }
    }

    // Insertar las candidatas nuevas que todavía no existen activas
    const ahora = new Date().toISOString();
    for (const candidata of candidatas) {
      if (clavesExistentes.has(candidata.claveDeduplicacion)) continue;
      await db.runAsync(
        `INSERT INTO notificaciones (id, tipo, nivel, titulo, detalle, producto_id, lote_id, clave_deduplicacion, leida, resuelta, ts_cliente, dispositivo_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 0, ?, ?)`,
        [
          Crypto.randomUUID(),
          candidata.tipo,
          candidata.nivel,
          candidata.titulo,
          candidata.detalle,
          candidata.productoId,
          candidata.loteId,
          candidata.claveDeduplicacion,
          ahora,
          dispositivoId,
        ]
      );
    }
  });
}

interface FilaNotificacion {
  id: string;
  tipo: TipoNotificacion;
  nivel: NivelNotificacion;
  titulo: string;
  detalle: string;
  producto_id: string | null;
  lote_id: string | null;
  dispositivo_id: string | null;
  modo: ModoLogin | null;
  leida: number;
  ts_cliente: string;
}

function aNotificacion(fila: FilaNotificacion): Notificacion {
  return {
    id: fila.id,
    tipo: fila.tipo,
    nivel: fila.nivel,
    titulo: fila.titulo,
    detalle: fila.detalle,
    productoId: fila.producto_id,
    loteId: fila.lote_id,
    dispositivoId: fila.dispositivo_id,
    modo: fila.modo,
    leida: fila.leida === 1,
    tsCliente: fila.ts_cliente,
  };
}

export async function listarNotificaciones(
  db: SQLiteDatabase,
  opciones: { soloNoLeidas?: boolean } = {}
): Promise<Notificacion[]> {
  const condicion = opciones.soloNoLeidas ? 'resuelta = 0 AND leida = 0' : 'resuelta = 0';
  const filas = await db.getAllAsync<FilaNotificacion>(
    `SELECT id, tipo, nivel, titulo, detalle, producto_id, lote_id, dispositivo_id, modo, leida, ts_cliente
     FROM notificaciones
     WHERE ${condicion}
     ORDER BY
       CASE nivel WHEN 'CRITICO' THEN 0 WHEN 'ALERTA' THEN 1 ELSE 2 END,
       ts_cliente DESC`
  );
  return filas.map(aNotificacion);
}

/**
 * Notificación de evento puntual: un admin desbloqueó un dispositivo+modo
 * — ver `esEventoPuntual`/`PREFIJOS_EVENTO_PUNTUAL` arriba. Se llama desde
 * `registrarDesbloqueo` (src/db/intentosPin.ts) justo después de confirmar
 * el desbloqueo real; nunca pasa por `DETECTORES`/`generarNotificaciones`
 * y por eso nunca se auto-resuelve. `claveDeduplicacion` incluye el
 * `tsCliente` del desbloqueo para que cada desbloqueo real genere su
 * propia notificación, nunca colisione con uno anterior o futuro.
 */
export async function registrarNotificacionDesbloqueo(
  db: SQLiteDatabase,
  datos: { dispositivoId: string; modo: ModoLogin; adminNombre: string },
  tsCliente: string
): Promise<void> {
  const nombreDispositivo = `Dispositivo ${datos.dispositivoId.slice(0, 8)}`;
  await db.runAsync(
    `INSERT INTO notificaciones (id, tipo, nivel, titulo, detalle, producto_id, lote_id, modo, clave_deduplicacion, leida, resuelta, ts_cliente, dispositivo_id)
     VALUES (?, 'DESBLOQUEO_PIN', 'INFO', ?, ?, NULL, NULL, ?, ?, 0, 0, ?, ?)`,
    [
      Crypto.randomUUID(),
      `Desbloqueo de PIN: ${nombreDispositivo}`,
      `${datos.adminNombre} desbloqueó ${nombreDispositivo} (modo ${datos.modo}).`,
      datos.modo,
      `DESBLOQUEO_PIN:${datos.dispositivoId}:${datos.modo}:${tsCliente}`,
      tsCliente,
      datos.dispositivoId,
    ]
  );
}

export async function marcarNotificacionLeida(db: SQLiteDatabase, id: string): Promise<void> {
  await db.runAsync('UPDATE notificaciones SET leida = 1 WHERE id = ?', [id]);
}

export async function contarNotificacionesNoLeidas(db: SQLiteDatabase): Promise<number> {
  const fila = await db.getFirstAsync<{ total: number }>(
    'SELECT COUNT(*) as total FROM notificaciones WHERE resuelta = 0 AND leida = 0'
  );
  return fila?.total ?? 0;
}
