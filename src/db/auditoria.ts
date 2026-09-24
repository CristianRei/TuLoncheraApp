import * as Crypto from 'expo-crypto';
import type { SQLiteDatabase } from 'expo-sqlite';

import type { AccionAuditoria, EntidadAuditoria, LogAuditoria } from '@/core/auditoria';

const ETIQUETA_ENTIDAD: Record<EntidadAuditoria, string> = {
  PERSONA: 'Personal',
  CLIENTE: 'Cliente',
  CATEGORIA: 'Categoría',
  EVENTO: 'Evento',
};

const ETIQUETA_ACCION: Record<AccionAuditoria, string> = {
  CREAR: 'creó',
  ACTUALIZAR: 'actualizó',
  ELIMINAR: 'eliminó',
  CAMBIAR_ROL: 'cambió el rol de',
  CANCELAR: 'canceló',
};

/**
 * Registra una acción administrativa en la bitácora — append-only, nunca se
 * actualiza ni se borra (mismo espíritu R1/R2 que `movimientos`). Si la
 * función que llama ya está dentro de un `withTransactionAsync`, esta
 * llamada debe ir DENTRO de ese mismo callback para que sea atómica con la
 * escritura que audita (ver src/db/personal.ts, clientes.ts, eventos.ts).
 */
export async function registrarAccionAuditoria(
  db: SQLiteDatabase,
  datos: {
    usuarioId: string;
    entidad: EntidadAuditoria;
    entidadId: string;
    accion: AccionAuditoria;
    detalles?: Record<string, unknown>;
  },
  dispositivoId: string
): Promise<void> {
  await db.runAsync(
    `INSERT INTO bitacora_auditoria (id, usuario_id, entidad, entidad_id, accion, detalles, ts_cliente, dispositivo_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      Crypto.randomUUID(),
      datos.usuarioId,
      datos.entidad,
      datos.entidadId,
      datos.accion,
      datos.detalles ? JSON.stringify(datos.detalles) : null,
      new Date().toISOString(),
      dispositivoId,
    ]
  );
}

interface FiltrosLineaDeTiempo {
  desde: string;
  hasta: string;
  /** "Hecho por" — quién ejecutó la acción. */
  usuarioId?: string;
  entidad?: EntidadAuditoria;
  /** "Sobre quién" — la persona/cliente/categoría afectada (solo tiene sentido junto con `entidad`, ver app/admin/auditoria). */
  entidadId?: string;
  /** Solo afecta el bloque de movimientos de inventario (no aplica cuando `entidad` está fijado). */
  productoId?: string;
  /** Solo afecta el bloque de movimientos de inventario, vía productos.categoria_id. */
  categoriaId?: string;
}

/**
 * Línea de tiempo unificada: bitácora administrativa + movimientos de
 * inventario (ya inmutables, no se duplican aquí, solo se leen).
 * `bitacora_auditoria`/`movimientos` comparten `usuario_id`, así que se
 * combinan en memoria, ordenando por `tsCliente` al final. Los intentos
 * fallidos de PIN NO viven aquí — el filtro "Accesos" de la pantalla usa
 * `listarResumenIntentosPin`/`listarResumenIntentosPinRemoto`
 * (src/db/intentosPin.ts/intentosPinRemotos.ts) directo: son estado
 * AGREGADO por dispositivo+modo (fallos/bloqueado), no eventos sueltos —
 * necesario para poder ofrecer el botón "Desbloquear" ahí mismo (antes
 * vivía en el módulo separado "Seguridad de acceso", fusionado aquí).
 */
export async function obtenerLineaDeTiempoAuditoria(
  db: SQLiteDatabase,
  filtros: FiltrosLineaDeTiempo
): Promise<LogAuditoria[]> {
  const condicionEntidad = filtros.entidad ? 'AND a.entidad = ?' : '';
  const condicionEntidadId = filtros.entidadId ? 'AND a.entidad_id = ?' : '';
  const condicionUsuarioAuditoria = filtros.usuarioId ? 'AND a.usuario_id = ?' : '';
  const parametrosAuditoria = [
    filtros.desde,
    filtros.hasta,
    ...(filtros.entidad ? [filtros.entidad] : []),
    ...(filtros.entidadId ? [filtros.entidadId] : []),
    ...(filtros.usuarioId ? [filtros.usuarioId] : []),
  ];

  const filasAuditoria = await db.getAllAsync<{
    id: string;
    usuarioNombre: string;
    entidad: EntidadAuditoria;
    accion: AccionAuditoria;
    detalles: string | null;
    tsCliente: string;
  }>(
    `SELECT a.id, u.nombre as usuarioNombre, a.entidad, a.accion, a.detalles, a.ts_cliente as tsCliente
     FROM bitacora_auditoria a
     JOIN usuarios u ON u.id = a.usuario_id
     WHERE a.ts_cliente >= ? AND a.ts_cliente <= ? ${condicionEntidad} ${condicionEntidadId} ${condicionUsuarioAuditoria}
     ORDER BY a.ts_cliente DESC`,
    parametrosAuditoria
  );

  const logsAuditoria: LogAuditoria[] = filasAuditoria.map((fila) => ({
    id: fila.id,
    origen: 'AUDITORIA',
    usuarioNombre: fila.usuarioNombre,
    dispositivoId: null,
    descripcion: `${fila.usuarioNombre} ${ETIQUETA_ACCION[fila.accion]} ${ETIQUETA_ENTIDAD[fila.entidad].toLowerCase()}`,
    detalles: fila.detalles,
    tsCliente: fila.tsCliente,
  }));

  // Movimientos de inventario solo si no se filtró por una de las 4
  // entidades administrativas (Personal/Clientes/Categorías/Eventos no
  // tienen productos ni movimientos propios) — `entidadId` tampoco aplica
  // aquí por el mismo motivo.
  let logsMovimientos: LogAuditoria[] = [];
  if (!filtros.entidad && !filtros.entidadId) {
    const condicionUsuarioMov = filtros.usuarioId ? 'AND m.usuario_id = ?' : '';
    const condicionProducto = filtros.productoId ? 'AND m.producto_id = ?' : '';
    const condicionCategoria = filtros.categoriaId ? 'AND p.categoria_id = ?' : '';
    const parametrosMov = [
      filtros.desde,
      filtros.hasta,
      ...(filtros.usuarioId ? [filtros.usuarioId] : []),
      ...(filtros.productoId ? [filtros.productoId] : []),
      ...(filtros.categoriaId ? [filtros.categoriaId] : []),
    ];
    const filasMovimiento = await db.getAllAsync<{
      id: string;
      usuarioNombre: string;
      tipo: string;
      productoNombre: string;
      cantidad: number;
      tsCliente: string;
    }>(
      `SELECT m.id, u.nombre as usuarioNombre, m.tipo, p.nombre as productoNombre, m.cantidad, m.ts_cliente as tsCliente
       FROM movimientos m
       JOIN usuarios u ON u.id = m.usuario_id
       JOIN productos p ON p.id = m.producto_id
       WHERE m.ts_cliente >= ? AND m.ts_cliente <= ? ${condicionUsuarioMov} ${condicionProducto} ${condicionCategoria}
       ORDER BY m.ts_cliente DESC`,
      parametrosMov
    );
    logsMovimientos = filasMovimiento.map((fila) => ({
      id: fila.id,
      origen: 'MOVIMIENTO',
      usuarioNombre: fila.usuarioNombre,
      dispositivoId: null,
      descripcion: `${fila.usuarioNombre} registró ${fila.tipo.toLowerCase()} · ${fila.productoNombre} (${fila.cantidad})`,
      detalles: null,
      tsCliente: fila.tsCliente,
    }));
  }

  return [...logsAuditoria, ...logsMovimientos].sort((a, b) => b.tsCliente.localeCompare(a.tsCliente));
}
