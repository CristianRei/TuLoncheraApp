import type { SQLiteDatabase } from 'expo-sqlite';

import { migracion0001EsquemaInicial } from './0001_esquema_inicial';
import { migracion0002IdentidadDispositivo } from './0002_identidad_dispositivo';
import { migracion0003PinUnico } from './0003_pin_unico';
import { migracion0004CatalogoEditable } from './0004_catalogo_editable';
import { migracion0005CargaCatalogoInicial } from './0005_carga_catalogo_inicial';
import { migracion0006VentasSinEvento } from './0006_ventas_sin_evento';
import { migracion0007CodigoBarrasUnico } from './0007_codigo_barras_unico';
import { migracion0008AnulacionVentas } from './0008_anulacion_ventas';
import { migracion0009SeguridadPin } from './0009_seguridad_pin';
import { migracion0010ConteoCierre } from './0010_conteo_cierre';
import { migracion0011PuntosYMarca } from './0011_puntos_y_marca';
import { migracion0012Descuentos } from './0012_descuentos';
import { migracion0013Notificaciones } from './0013_notificaciones';
import { migracion0014CalendarioEventos } from './0014_calendario_eventos';
import { migracion0015ComprobantesYTurnos } from './0015_comprobantes_y_turnos';
import { migracion0016ColaSync } from './0016_cola_sync';
import { migracion0017CarguesPendientes } from './0017_cargues_pendientes';
import { migracion0018NotificacionCargueRevisar } from './0018_notificacion_cargue_revisar';
import { migracion0019Clientes } from './0019_clientes';
import { migracion0020Categorias } from './0020_categorias';
import { migracion0021Metas } from './0021_metas';
import { migracion0022DatosPromotor } from './0022_datos_promotor';
import { migracion0023MetaDiariaYMensajes } from './0023_meta_diaria_y_mensajes';
import { migracion0024ArqueosCaja } from './0024_arqueos_caja';
import { migracion0025ColaSyncTodasLasTablas } from './0025_cola_sync_todas_las_tablas';
import { migracion0026SyncEstado } from './0026_sync_estado';
import { migracion0027BitacoraAuditoria } from './0027_bitacora_auditoria';
import { migracion0028DesbloqueosPinSinFk } from './0028_desbloqueos_pin_sin_fk';
import { migracion0029Traslados } from './0029_traslados';
import { migracion0030NotificacionesModo } from './0030_notificaciones_modo';
import { migracion0031DescuentosPromotor } from './0031_descuentos_promotor';

export interface Migracion {
  version: number;
  nombre: string;
  up: (db: SQLiteDatabase) => Promise<void>;
}

// Nuevas migraciones se agregan aquí, en orden. Nunca editar una ya aplicada
// en producción — ver CLAUDE.md sección 8 ("toda evolución pasa por archivos
// de migración versionados").
const migraciones: Migracion[] = [
  migracion0001EsquemaInicial,
  migracion0002IdentidadDispositivo,
  migracion0003PinUnico,
  migracion0004CatalogoEditable,
  migracion0005CargaCatalogoInicial,
  migracion0006VentasSinEvento,
  migracion0007CodigoBarrasUnico,
  migracion0008AnulacionVentas,
  migracion0009SeguridadPin,
  migracion0010ConteoCierre,
  migracion0011PuntosYMarca,
  migracion0012Descuentos,
  migracion0013Notificaciones,
  migracion0014CalendarioEventos,
  migracion0015ComprobantesYTurnos,
  migracion0016ColaSync,
  migracion0017CarguesPendientes,
  migracion0018NotificacionCargueRevisar,
  migracion0019Clientes,
  migracion0020Categorias,
  migracion0021Metas,
  migracion0022DatosPromotor,
  migracion0023MetaDiariaYMensajes,
  migracion0024ArqueosCaja,
  migracion0025ColaSyncTodasLasTablas,
  migracion0026SyncEstado,
  migracion0027BitacoraAuditoria,
  migracion0028DesbloqueosPinSinFk,
  migracion0029Traslados,
  migracion0030NotificacionesModo,
  migracion0031DescuentosPromotor,
];

/**
 * Aplica las migraciones pendientes, en orden, dentro de una transacción cada
 * una. Se corre al arrancar la app (CLAUDE.md sección 8).
 */
export async function aplicarMigracionesPendientes(db: SQLiteDatabase): Promise<void> {
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS _migraciones (
      version INTEGER PRIMARY KEY NOT NULL,
      nombre TEXT NOT NULL,
      aplicado_ts TEXT NOT NULL
    );
  `);

  const aplicadas = await db.getAllAsync<{ version: number }>(
    'SELECT version FROM _migraciones'
  );
  const versionesAplicadas = new Set(aplicadas.map((fila) => fila.version));

  const pendientes = migraciones
    .filter((m) => !versionesAplicadas.has(m.version))
    .sort((a, b) => a.version - b.version);

  for (const migracion of pendientes) {
    await db.withTransactionAsync(async () => {
      await migracion.up(db);
      await db.runAsync(
        'INSERT INTO _migraciones (version, nombre, aplicado_ts) VALUES (?, ?, ?)',
        [migracion.version, migracion.nombre, new Date().toISOString()]
      );
    });
  }
}
