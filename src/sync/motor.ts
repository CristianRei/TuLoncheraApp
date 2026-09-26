import { File } from 'expo-file-system';
import type { SQLiteDatabase } from 'expo-sqlite';

import { fechaBogota, fechaHoyBogota } from '@/core/analitica';
import { obtenerPinAdminDeSesion, PinAdminNoRegistradoError, SinAdminEnSesionError } from '@/db/adminSesion';
import { obtenerArqueoPorId } from '@/db/arqueos';
import { normalizar as normalizarNombreCategoria, obtenerCategoria } from '@/db/categorias';
import { getDb } from '@/db/client';
import { obtenerCargue } from '@/db/cargues';
import { obtenerClienteParaSync } from '@/db/clientes';
import { obtenerDescuentoParaSync } from '@/db/descuentos';
import { obtenerConteo } from '@/db/conteos';
import { getDispositivoId } from '@/db/dispositivo';
import { obtenerEmpresaParaSync } from '@/db/empresas';
import { obtenerEventoParaSync } from '@/db/eventos';
import { obtenerLoteParaSync } from '@/db/lotes';
import { skuPorProductoId } from '@/db/mapeoRemoto';
import { obtenerMovimientoParaSync } from '@/db/movimientos';
import { obtenerPersona } from '@/db/personal';
import { obtenerProducto } from '@/db/productos';
import { obtenerPuntoParaSync } from '@/db/puntos';
import { encolarSync } from '@/db/syncCola';
import type { TablaSync } from '@/db/syncCola';
import { obtenerTraslado } from '@/db/traslados';
import { obtenerTurno } from '@/db/turnos';
import { obtenerVenta } from '@/db/ventas';

import { registrarUltimoCiclo } from './estado';
import { getSupabaseClient } from './supabaseClient';

interface TareaPendiente {
  id: string;
  tabla: TablaSync;
  entidad_id: string;
  tipo_tarea: 'FILA' | 'FOTO';
  intentos: number;
}

let corriendo = false;

/**
 * Puntos ya subidos en esta sesión de la app por la vía de `eventos` o
 * `descuentos` — cada uno sube antes su punto (y la empresa), pero una serie
 * de 50 eventos en el mismo punto no necesita subirlo 50 veces. Se reinicia
 * al abrir la app: volver a subirlo una vez es idempotente.
 */
const puntosYaSubidos = new Set<string>();

/** Sube el punto (y su empresa) si en esta sesión todavía no se subió — ver `puntosYaSubidos`. */
async function subirPuntoUnaVez(db: SQLiteDatabase, supabase: ClienteSupabase, puntoId: string, dispositivoId: string) {
  if (puntosYaSubidos.has(puntoId)) return;
  await subirPunto(db, supabase, puntoId, dispositivoId);
  puntosYaSubidos.add(puntoId);
}

type ClienteSupabase = Awaited<ReturnType<typeof getSupabaseClient>>;

async function subirEmpresa(db: SQLiteDatabase, supabase: ClienteSupabase, empresaId: string, dispositivoId: string) {
  const empresa = await obtenerEmpresaParaSync(db, empresaId);
  if (!empresa) return;
  const { error } = await supabase.from('empresas').upsert({
    id: empresa.id,
    nombre: empresa.nombre,
    direccion: empresa.direccion,
    sector: empresa.sector,
    contacto: empresa.contacto,
    ts_cliente: empresa.tsCliente,
    dispositivo_id: dispositivoId,
  });
  if (error) throw error;
}

/**
 * Sube un punto con su empresa primero (idempotente): una empresa creada antes
 * de que sincronizaran nunca se encoló, y sin ella el otro dispositivo no
 * puede insertar el punto (FK local puntos.empresa_id).
 */
async function subirPunto(db: SQLiteDatabase, supabase: ClienteSupabase, puntoId: string, dispositivoId: string) {
  const punto = await obtenerPuntoParaSync(db, puntoId);
  if (!punto) return;
  await subirEmpresa(db, supabase, punto.empresaId, dispositivoId);
  const { error } = await supabase.from('puntos').upsert({
    id: punto.id,
    empresa_id: punto.empresaId,
    nombre: punto.nombre,
    direccion: punto.direccion,
    activo: punto.activo,
    ts_cliente: punto.tsCliente,
    dispositivo_id: dispositivoId,
  });
  if (error) throw error;
}

/**
 * Drena `_sync_pendiente` hacia Supabase: por cada tarea, sube la fila de
 * datos (`upsert`, idempotente por id — R3) o la foto correspondiente. Best
 * effort — una tarea que falla queda pendiente para el siguiente ciclo, sin
 * afectar a las demás. Nunca se llama desde el flujo de negocio (R5): solo
 * desde `app/_layout.tsx`, disparado por conectividad/timer/foco de app.
 */
export async function drenarColaSync(): Promise<void> {
  if (corriendo) {
    console.log('[sync] ya hay un ciclo corriendo, se omite este disparo');
    return;
  }
  corriendo = true;
  try {
    const db = await getDb();
    const pendientes = await db.getAllAsync<TareaPendiente>(
      `SELECT id, tabla, entidad_id, tipo_tarea, intentos
       FROM _sync_pendiente
       WHERE completado_ts IS NULL
       ORDER BY creado_ts ASC`
    );
    console.log(`[sync] ${pendientes.length} tarea(s) pendiente(s)`);
    if (pendientes.length === 0) {
      registrarUltimoCiclo(true, 'Sin tareas pendientes.');
      return;
    }

    let supabase;
    try {
      supabase = await getSupabaseClient();
    } catch (error) {
      const mensaje = error instanceof Error ? error.message : String(error);
      console.log('[sync] no se pudo obtener sesión de Supabase, se reintenta después:', mensaje);
      registrarUltimoCiclo(false, `No se pudo conectar con Supabase: ${mensaje}`);
      return;
    }

    let completadas = 0;
    let fallidas = 0;
    for (const tarea of pendientes) {
      try {
        console.log(`[sync] subiendo ${tarea.tabla}/${tarea.tipo_tarea} (${tarea.entidad_id}), intento ${tarea.intentos + 1}`);
        if (tarea.tipo_tarea === 'FILA') {
          await subirFila(db, supabase, tarea);
        } else {
          await subirFoto(db, supabase, tarea);
        }
        await db.runAsync('UPDATE _sync_pendiente SET completado_ts = ? WHERE id = ?', [
          new Date().toISOString(),
          tarea.id,
        ]);
        console.log(`[sync] ✓ ${tarea.tabla}/${tarea.tipo_tarea} (${tarea.entidad_id})`);
        completadas++;
      } catch (error) {
        const mensaje = error instanceof Error ? error.message : String(error);
        console.log(`[sync] ✗ ${tarea.tabla}/${tarea.tipo_tarea} (${tarea.entidad_id}):`, mensaje);
        await db.runAsync(
          'UPDATE _sync_pendiente SET intentos = intentos + 1, ultimo_error = ? WHERE id = ?',
          [mensaje, tarea.id]
        );
        fallidas++;
      }
    }
    registrarUltimoCiclo(
      fallidas === 0,
      `${completadas} subida(s), ${fallidas} fallida(s) de ${pendientes.length} tarea(s).`
    );
  } finally {
    corriendo = false;
  }
}

/**
 * Cierra localmente un turno que perdió la carrera por el índice único de
 * Supabase (ver el `case 'turnos'` de `subirFila`, error 23505 —
 * `turnos.promotor_id` no puede repetirse con `hora_fin IS NULL`, así que
 * si el upsert falla así es porque YA existe otro turno abierto de ese
 * promotor en Supabase). `hora_fin = hora_inicio` dura cero: nunca debió
 * existir como turno independiente. Reencola la fila para que el siguiente
 * ciclo suba el cierre — ya no choca con el índice, que solo aplica a
 * `hora_fin IS NULL`.
 *
 * SOLO actúa sobre turnos de días ANTERIORES a hoy (Bogotá) — nunca el de
 * hoy. Un duplicado de hoy puede seguir en uso activo en ese mismo celular
 * (el promotor vendiendo ahora mismo): cerrarlo de golpe le bloquearía la
 * venta sin avisarle. Uno de hoy simplemente queda pendiente en la cola con
 * error, sin romper nada más — se resuelve solo la próxima vez que la
 * persona abra la app (mismo flujo de `iniciarTurno`, que ya adopta el
 * turno remoto ganador si lo encuentra).
 */
async function cerrarTurnoDuplicadoPerdedor(db: SQLiteDatabase, turnoId: string, horaInicio: string): Promise<void> {
  if (fechaBogota(horaInicio) >= fechaHoyBogota()) {
    throw new Error('Turno duplicado de hoy — se deja pendiente, no se cierra automáticamente.');
  }
  await db.withTransactionAsync(async () => {
    await db.runAsync('UPDATE turnos SET hora_fin = ? WHERE id = ? AND hora_fin IS NULL', [
      horaInicio,
      turnoId,
    ]);
    await encolarSync(db, { tabla: 'turnos', entidadId: turnoId, tipoTarea: 'FILA' });
  });
}

async function subirFila(
  db: SQLiteDatabase,
  supabase: Awaited<ReturnType<typeof getSupabaseClient>>,
  tarea: TareaPendiente
): Promise<void> {
  const dispositivoId = await getDispositivoId(db);

  switch (tarea.tabla) {
    case 'turnos': {
      const turno = await obtenerTurno(db, tarea.entidad_id);
      if (!turno) return; // la fila local ya no existe — nada que subir
      const { error } = await supabase.from('turnos').upsert({
        id: turno.id,
        promotor_id: turno.promotorId,
        promotor_nombre: turno.promotorNombre,
        selfie_path: `${turno.id}.jpg`,
        latitud: turno.latitud,
        longitud: turno.longitud,
        hora_inicio: turno.horaInicio,
        hora_fin: turno.horaFin,
        ts_cliente: turno.horaInicio,
        dispositivo_id: dispositivoId,
      });
      if (!error) return;

      // Índice único parcial en Supabase (turnos.promotor_id WHERE hora_fin
      // IS NULL, ver supabase/migraciones/0015) — dos dispositivos abrieron
      // turno casi al mismo tiempo (carrera) y este perdió. En vez de
      // reintentar para siempre (nunca va a lograr subir un segundo turno
      // abierto del mismo promotor), se cierra localmente este duplicado
      // con su propia hora de inicio como hora de fin — nunca debió existir
      // como turno independiente — y se deja que el siguiente ciclo lo suba
      // ya cerrado, sin chocar con el índice.
      if (turno.horaFin === null && error.code === '23505') {
        await cerrarTurnoDuplicadoPerdedor(db, turno.id, turno.horaInicio);
        return;
      }
      throw error;
    }

    case 'comprobantes_venta': {
      const resultado = await obtenerVenta(db, tarea.entidad_id);
      if (!resultado || !resultado.venta.comprobanteUri) return;
      const { venta } = resultado;
      const { error } = await supabase.from('comprobantes_venta').upsert({
        venta_id: venta.id,
        promotor_id: venta.promotorId,
        promotor_nombre: venta.promotorNombre,
        numero_recibo: venta.numeroRecibo,
        total: venta.total,
        comprobante_path: `${venta.id}.jpg`,
        ts_cliente: venta.tsCliente,
        dispositivo_id: dispositivoId,
      });
      if (error) throw error;
      return;
    }

    case 'ventas': {
      const resultado = await obtenerVenta(db, tarea.entidad_id);
      if (!resultado) return;
      const { venta, items } = resultado;
      const { error } = await supabase.from('ventas').upsert({
        id: venta.id,
        numero_recibo: venta.numeroRecibo,
        promotor_id: venta.promotorId,
        promotor_nombre: venta.promotorNombre,
        punto_id: venta.puntoId,
        punto_nombre: venta.puntoNombre,
        cliente_nombre: venta.clienteNombre,
        ts_cliente: venta.tsCliente,
        metodo_pago: venta.metodoPago,
        total: venta.total,
        anulada: venta.anulada,
        motivo_anulacion: venta.motivoAnulacion,
        dispositivo_id: dispositivoId,
      });
      if (error) throw error;

      if (items.length > 0) {
        const skus = await skuPorProductoId(db, items.map((i) => i.productoId));
        const { error: errorItems } = await supabase.from('venta_items').upsert(
          items.map((item) => ({
            venta_id: venta.id,
            producto_id: item.productoId,
            producto_sku: skus.get(item.productoId) ?? null,
            producto_nombre: item.productoNombre,
            cantidad: item.cantidad,
            precio_unitario: item.precioUnitario,
            ts_cliente: venta.tsCliente,
            dispositivo_id: dispositivoId,
          }))
        );
        if (errorItems) throw errorItems;
      }
      return;
    }

    case 'movimientos': {
      const movimiento = await obtenerMovimientoParaSync(db, tarea.entidad_id);
      if (!movimiento) return;
      const { error } = await supabase.from('movimientos').upsert({
        id: movimiento.id,
        tipo: movimiento.tipo,
        producto_id: movimiento.productoId,
        producto_sku: movimiento.productoSku,
        producto_nombre: movimiento.productoNombre,
        cantidad: movimiento.cantidad,
        ubicacion_origen_tipo: movimiento.ubicacionOrigenTipo,
        ubicacion_origen_nombre: movimiento.ubicacionOrigenNombre,
        ubicacion_origen_responsable_id: movimiento.ubicacionOrigenResponsableId,
        ubicacion_destino_tipo: movimiento.ubicacionDestinoTipo,
        ubicacion_destino_nombre: movimiento.ubicacionDestinoNombre,
        ubicacion_destino_responsable_id: movimiento.ubicacionDestinoResponsableId,
        usuario_id: movimiento.usuarioId,
        usuario_nombre: movimiento.usuarioNombre,
        motivo: movimiento.motivo,
        ts_cliente: movimiento.tsCliente,
        dispositivo_id: dispositivoId,
      });
      if (error) throw error;
      return;
    }

    case 'lotes': {
      const lote = await obtenerLoteParaSync(db, tarea.entidad_id);
      if (!lote) return;
      const { error } = await supabase.from('lotes').upsert({
        id: lote.id,
        producto_id: lote.productoId,
        producto_nombre: lote.productoNombre,
        fecha_vencimiento: lote.fechaVencimiento,
        ts_cliente: lote.tsCliente,
        dispositivo_id: dispositivoId,
      });
      if (error) throw error;
      return;
    }

    case 'cargues': {
      const resultado = await obtenerCargue(db, tarea.entidad_id);
      if (!resultado) return;
      const { cargue, lineas } = resultado;
      const creador = await db.getFirstAsync<{ creado_por: string }>('SELECT creado_por FROM cargues WHERE id = ?', [cargue.id]);
      const { error } = await supabase.from('cargues').upsert({
        id: cargue.id,
        promotor_id: cargue.promotorId,
        promotor_nombre: cargue.promotorNombre,
        estado: cargue.estado,
        creado_por: creador?.creado_por ?? null,
        ts_cliente: cargue.tsCliente,
        dispositivo_id: dispositivoId,
      });
      if (error) throw error;

      if (lineas.length > 0) {
        const skus = await skuPorProductoId(db, lineas.map((l) => l.productoId));
        const { error: errorLineas } = await supabase.from('cargue_lineas').upsert(
          lineas.map((linea) => ({
            id: linea.id,
            cargue_id: cargue.id,
            producto_id: linea.productoId,
            producto_sku: skus.get(linea.productoId) ?? null,
            producto_nombre: linea.productoNombre,
            cantidad_planeada: linea.cantidadPlaneada,
            cantidad_entregada: linea.cantidadEntregada,
            estado: linea.estado,
            motivo_revision: linea.motivoRevision,
            ts_cliente: cargue.tsCliente,
            dispositivo_id: dispositivoId,
          }))
        );
        if (errorLineas) throw errorLineas;
      }
      return;
    }

    case 'traslados': {
      const resultado = await obtenerTraslado(db, tarea.entidad_id);
      if (!resultado) return;
      const { traslado, lineas } = resultado;
      const creador = await db.getFirstAsync<{ creado_por: string }>(
        'SELECT creado_por FROM traslados WHERE id = ?',
        [traslado.id]
      );
      const { error } = await supabase.from('traslados').upsert({
        id: traslado.id,
        promotor_origen_id: traslado.promotorOrigenId,
        promotor_origen_nombre: traslado.promotorOrigenNombre,
        promotor_destino_id: traslado.promotorDestinoId,
        promotor_destino_nombre: traslado.promotorDestinoNombre,
        estado: traslado.estado,
        creado_por: creador?.creado_por ?? null,
        ts_cliente: traslado.tsCliente,
        dispositivo_id: dispositivoId,
      });
      if (error) throw error;

      if (lineas.length > 0) {
        const skus = await skuPorProductoId(db, lineas.map((l) => l.productoId));
        const { error: errorLineas } = await supabase.from('traslado_lineas').upsert(
          lineas.map((linea) => ({
            id: linea.id,
            traslado_id: traslado.id,
            producto_id: linea.productoId,
            producto_sku: skus.get(linea.productoId) ?? null,
            producto_nombre: linea.productoNombre,
            cantidad_planeada: linea.cantidadPlaneada,
            cantidad_entregada: linea.cantidadEntregada,
            estado: linea.estado,
            motivo_revision: linea.motivoRevision,
            ts_cliente: traslado.tsCliente,
            dispositivo_id: dispositivoId,
          }))
        );
        if (errorLineas) throw errorLineas;
      }
      return;
    }

    case 'arqueos_caja': {
      const arqueo = await obtenerArqueoPorId(db, tarea.entidad_id);
      if (!arqueo) return;
      const { error } = await supabase.from('arqueos_caja').upsert({
        id: arqueo.id,
        turno_id: arqueo.turnoId,
        promotor_id: arqueo.promotorId,
        promotor_nombre: arqueo.promotorNombre,
        efectivo_teorico: arqueo.efectivoTeorico,
        efectivo_contado: arqueo.efectivoContado,
        diferencia: arqueo.diferencia,
        total_transferencia: arqueo.totalTransferencia,
        total_libranza: arqueo.totalLibranza,
        ts_cliente: arqueo.tsCliente,
        dispositivo_id: dispositivoId,
      });
      if (error) throw error;
      return;
    }

    case 'usuarios': {
      const persona = await obtenerPersona(db, tarea.entidad_id);
      if (!persona) return; // se eliminó (DELETE real) después de encolarse — nada que subir
      // PIN y datos personales van a `usuarios_credenciales`, que la app no
      // puede leer; el servidor exige el PIN del admin que firma el cambio
      // (supabase/migraciones/0018_credenciales_privadas.sql).
      const pinAdmin = await obtenerPinAdminDeSesion(db);
      if (!pinAdmin) throw new SinAdminEnSesionError();
      const { data: aceptado, error } = await supabase.rpc('guardar_usuario', {
        p_admin_pin: pinAdmin,
        p_usuario: {
          id: persona.id,
          nombre: persona.nombre,
          rol: persona.rol,
          activo: persona.activo,
          pin: persona.pin,
          cedula: persona.cedula,
          celular: persona.celular,
          direccion: persona.direccion,
          ts_cliente: persona.tsCliente,
          dispositivo_id: dispositivoId,
        },
      });
      if (error) throw error;
      if (aceptado !== true) throw new PinAdminNoRegistradoError();
      return;
    }

    case 'productos': {
      const producto = await obtenerProducto(db, tarea.entidad_id);
      if (!producto) return; // se eliminó del catálogo local (no debería pasar, es activo=0) — nada que subir

      // Las 7 categorías iniciales (migración 0020) existen en cada
      // dispositivo pero nunca se encolaron — si el producto apunta a una,
      // se sube junto con él para que el otro dispositivo pueda resolverla
      // (`aplicarProductosRemotos` la busca por nombre). Idempotente.
      if (producto.categoriaId) {
        const categoria = await obtenerCategoria(db, producto.categoriaId);
        if (categoria) {
          const { error: errorCategoria } = await supabase.from('categorias').upsert({
            id: categoria.id,
            nombre: categoria.nombre,
            nombre_normalizado: normalizarNombreCategoria(categoria.nombre),
            activo: categoria.activo,
            ts_cliente: categoria.tsCliente,
            dispositivo_id: dispositivoId,
          });
          if (errorCategoria) throw errorCategoria;
        }
      }

      const { error } = await supabase.from('productos').upsert({
        id: producto.id,
        sku: producto.sku,
        codigo_barras: producto.codigoBarras,
        nombre: producto.nombre,
        categoria_id: producto.categoriaId,
        marca: producto.marca,
        es_licor: producto.esLicor,
        es_perecedero: producto.esPerecedero,
        precio: producto.precio,
        costo: producto.costo,
        unidad_empaque: producto.unidadEmpaque,
        activo: producto.activo,
        // foto_uri no sincroniza todavía (CLAUDE.md sección 11) — es una URI
        // local, sin sentido en otro dispositivo sin un bucket de Storage.
        ts_cliente: producto.tsCliente,
        dispositivo_id: dispositivoId,
      });
      if (error) throw error;
      return;
    }

    case 'categorias': {
      const categoria = await obtenerCategoria(db, tarea.entidad_id);
      if (!categoria) return;
      const { error } = await supabase.from('categorias').upsert({
        id: categoria.id,
        nombre: categoria.nombre,
        nombre_normalizado: normalizarNombreCategoria(categoria.nombre),
        activo: categoria.activo,
        ts_cliente: categoria.tsCliente,
        dispositivo_id: dispositivoId,
      });
      if (error) throw error;
      return;
    }

    case 'empresas': {
      await subirEmpresa(db, supabase, tarea.entidad_id, dispositivoId);
      return;
    }

    case 'puntos': {
      await subirPunto(db, supabase, tarea.entidad_id, dispositivoId);
      return;
    }

    case 'eventos': {
      const evento = await obtenerEventoParaSync(db, tarea.entidad_id);
      if (!evento) return;
      // Su punto (y empresa) primero: sin ellos el celular no puede guardar el
      // evento (FK local). Cubre puntos que nunca se encolaron, como los de
      // la demo en `__DEV__`.
      await subirPuntoUnaVez(db, supabase, evento.puntoId, dispositivoId);
      const { error } = await supabase.from('eventos').upsert({
        id: evento.id,
        empresa_id: evento.empresaId,
        punto_id: evento.puntoId,
        fecha: evento.fecha,
        estado: evento.estado,
        motivo_cancelacion: evento.motivoCancelacion,
        serie_id: evento.serieId,
        creado_por: evento.creadoPor,
        creado_por_nombre: evento.creadoPorNombre,
        // Los promotores viajan dentro del evento (supabase/migraciones/0014):
        // reasignar reemplaza el conjunto completo.
        promotores: evento.promotores.map((p) => ({
          promotor_id: p.promotorId,
          promotor_nombre: p.promotorNombre,
        })),
        hora_inicio: evento.horaInicio,
        hora_fin: evento.horaFin,
        // La meta es del evento: la comparte todo el equipo (migración local 0032).
        meta_diaria: evento.metaDiaria,
        ts_cliente: evento.tsCliente,
        dispositivo_id: dispositivoId,
      });
      if (error) throw error;
      return;
    }

    case 'descuentos': {
      const descuento = await obtenerDescuentoParaSync(db, tarea.entidad_id);
      if (!descuento) return;
      // Un descuento por punto necesita ese punto en el celular (FK local).
      if (descuento.puntoId) await subirPuntoUnaVez(db, supabase, descuento.puntoId, dispositivoId);
      const { error } = await supabase.from('descuentos').upsert({
        id: descuento.id,
        producto_id: descuento.productoId,
        // Los 123 productos iniciales tienen id distinto en cada dispositivo:
        // el celular los encuentra por sku (ver mapeoRemoto.ts).
        producto_sku: descuento.productoSku,
        producto_nombre: descuento.productoNombre,
        punto_id: descuento.puntoId,
        promotor_id: descuento.promotorId,
        promotor_nombre: descuento.promotorNombre,
        tipo: descuento.tipo,
        valor: descuento.valor,
        desde: descuento.desde,
        hasta: descuento.hasta,
        activo: descuento.activo,
        creado_por: descuento.creadoPor,
        creado_por_nombre: descuento.creadoPorNombre,
        ts_cliente: descuento.tsCliente,
        dispositivo_id: dispositivoId,
      });
      if (error) throw error;
      return;
    }

    case 'clientes': {
      const cliente = await obtenerClienteParaSync(db, tarea.entidad_id);
      if (!cliente) return; // se eliminó después de encolarse — nada que subir
      const { error } = await supabase.from('clientes').upsert({
        id: cliente.id,
        nombre_completo: cliente.nombreCompleto,
        telefono: cliente.telefono,
        direccion: cliente.direccion,
        ciudad: cliente.ciudad,
        empresa: cliente.empresa,
        nota: cliente.nota,
        creado_por: cliente.creadoPor,
        creado_por_nombre: cliente.creadoPorNombre,
        ts_cliente: cliente.tsCliente,
        dispositivo_id: dispositivoId,
      });
      if (error) throw error;
      return;
    }

    case 'conteos': {
      const resultado = await obtenerConteo(db, tarea.entidad_id);
      if (!resultado) return;
      const { conteo, lineas } = resultado;
      const { error } = await supabase.from('conteos').upsert({
        id: conteo.id,
        promotor_id: conteo.promotorId,
        promotor_nombre: conteo.promotorNombre,
        estado: conteo.estado,
        ts_cliente: conteo.tsCliente,
        dispositivo_id: dispositivoId,
      });
      if (error) throw error;

      if (lineas.length > 0) {
        const skus = await skuPorProductoId(db, lineas.map((l) => l.productoId));
        const { error: errorLineas } = await supabase.from('conteo_lineas').upsert(
          lineas.map((linea) => ({
            conteo_id: conteo.id,
            producto_id: linea.productoId,
            producto_sku: skus.get(linea.productoId) ?? null,
            producto_nombre: linea.productoNombre,
            teorico: linea.teorico,
            contado: linea.contado,
            diferencia: linea.diferencia,
            motivo: linea.motivo,
            ts_cliente: conteo.tsCliente,
            dispositivo_id: dispositivoId,
          }))
        );
        if (errorLineas) throw errorLineas;
      }
      return;
    }

    case 'intentos_pin_fallidos': {
      const fila = await db.getFirstAsync<{
        id: string;
        dispositivo_id: string;
        modo: string;
        ts_cliente: string;
      }>('SELECT id, dispositivo_id, modo, ts_cliente FROM intentos_pin_fallidos WHERE id = ?', [
        tarea.entidad_id,
      ]);
      if (!fila) return;
      const { error } = await supabase.from('intentos_pin_fallidos').upsert({
        id: fila.id,
        dispositivo_id: fila.dispositivo_id,
        modo: fila.modo,
        ts_cliente: fila.ts_cliente,
      });
      if (error) throw error;
      return;
    }

    case 'logins_exitosos_pin': {
      const fila = await db.getFirstAsync<{
        id: string;
        dispositivo_id: string;
        modo: string;
        ts_cliente: string;
      }>('SELECT id, dispositivo_id, modo, ts_cliente FROM logins_exitosos_pin WHERE id = ?', [
        tarea.entidad_id,
      ]);
      if (!fila) return;
      const { error } = await supabase.from('logins_exitosos_pin').upsert({
        id: fila.id,
        dispositivo_id: fila.dispositivo_id,
        modo: fila.modo,
        ts_cliente: fila.ts_cliente,
      });
      if (error) throw error;
      return;
    }

    case 'desbloqueos_pin': {
      const fila = await db.getFirstAsync<{
        id: string;
        dispositivo_id: string;
        modo: string;
        admin_id: string;
        ts_cliente: string;
      }>('SELECT id, dispositivo_id, modo, admin_id, ts_cliente FROM desbloqueos_pin WHERE id = ?', [
        tarea.entidad_id,
      ]);
      if (!fila) return;
      // Queda como registro (sin verificar). Si `registrarDesbloqueo` ya lo
      // subió verificado por `desbloquear_dispositivo`, no se toca: insertar
      // solo si no existe (y así tampoco hace falta permiso de UPDATE).
      const { error } = await supabase.from('desbloqueos_pin').upsert(
        {
          id: fila.id,
          dispositivo_id: fila.dispositivo_id,
          modo: fila.modo,
          admin_id: fila.admin_id,
          ts_cliente: fila.ts_cliente,
        },
        { onConflict: 'id', ignoreDuplicates: true }
      );
      if (error) throw error;
      return;
    }
  }
}

async function subirFoto(
  db: SQLiteDatabase,
  supabase: Awaited<ReturnType<typeof getSupabaseClient>>,
  tarea: TareaPendiente
): Promise<void> {
  const bucket = tarea.tabla === 'turnos' ? 'selfies-turnos' : 'comprobantes-venta';
  const path = `${tarea.entidad_id}.jpg`;

  const uriLocal =
    tarea.tabla === 'turnos'
      ? (await obtenerTurno(db, tarea.entidad_id))?.selfieUri
      : (await obtenerVenta(db, tarea.entidad_id))?.venta.comprobanteUri;
  if (!uriLocal) return; // la entidad ya no existe localmente — nada que subir

  const archivo = new File(uriLocal);
  const bytes = await archivo.arrayBuffer();

  // Sin upsert: una selfie o comprobante ya subido es evidencia y nunca se
  // sobrescribe (el bucket no admite UPDATE, migración 0017). En un reintento
  // de una subida que sí llegó, "ya existe" es éxito.
  const { error } = await supabase.storage.from(bucket).upload(path, bytes, {
    contentType: 'image/jpeg',
    upsert: false,
  });
  if (error && !esArchivoYaSubido(error)) throw error;
}

function esArchivoYaSubido(error: { message?: string; statusCode?: string }): boolean {
  return error.statusCode === '409' || /already exists|duplicate/i.test(error.message ?? '');
}
