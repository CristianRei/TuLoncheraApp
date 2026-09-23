import { File } from 'expo-file-system';
import type { SQLiteDatabase } from 'expo-sqlite';

import { pinParaSincronizar } from '@/core/pin';
import { obtenerArqueoPorId } from '@/db/arqueos';
import { normalizar as normalizarNombreCategoria, obtenerCategoria } from '@/db/categorias';
import { getDb } from '@/db/client';
import { obtenerCargue } from '@/db/cargues';
import { obtenerConteo } from '@/db/conteos';
import { getDispositivoId } from '@/db/dispositivo';
import { obtenerLoteParaSync } from '@/db/lotes';
import { skuPorProductoId } from '@/db/mapeoRemoto';
import { obtenerMovimientoParaSync } from '@/db/movimientos';
import { obtenerPersona } from '@/db/personal';
import { obtenerProducto } from '@/db/productos';
import type { TablaSync } from '@/db/syncCola';
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
      if (error) throw error;
      return;
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
      const { error } = await supabase.from('usuarios').upsert({
        id: persona.id,
        nombre: persona.nombre,
        rol: persona.rol,
        activo: persona.activo,
        cedula: persona.cedula,
        celular: persona.celular,
        direccion: persona.direccion,
        // Nunca el PIN derivable de cédula — ver src/core/pin, pinParaSincronizar.
        pin: pinParaSincronizar(persona.rol, persona.cedula, persona.pin),
        ts_cliente: persona.tsCliente,
        dispositivo_id: dispositivoId,
      });
      if (error) throw error;
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

  const { error } = await supabase.storage.from(bucket).upload(path, bytes, {
    contentType: 'image/jpeg',
    upsert: true,
  });
  if (error) throw error;
}
