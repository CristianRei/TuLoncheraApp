import type { SQLiteDatabase } from 'expo-sqlite';

import type { Migracion } from './index';

/**
 * Dos cosas nuevas, relacionadas pero independientes:
 *
 * 1. `evento_promotores.meta_diaria` — meta de venta del día para ESE
 *    promotor en ESE evento (ej. $1.800.000), distinta de la meta mensual
 *    (tabla `metas`, migración 0021). Va en `evento_promotores` (no en
 *    `eventos`) porque un evento puede tener varios promotores y cada uno
 *    puede tener una meta distinta ese día.
 *
 * 2. `mensajes_recibidos` — espejo local de solo lectura de los mensajes que
 *    un admin envió como notificación push (ver app/admin/mensajes/,
 *    src/db/mensajes.ts). El mensaje en sí vive en Supabase (`mensajes` +
 *    `mensaje_destinatarios`, supabase/migraciones/0003_mensajes.sql) porque
 *    tiene que viajar entre dispositivos (R5/R6 no alcanzan aquí, mismo caso
 *    que turnos/comprobantes, ADR 0006) — esta tabla es la copia local para
 *    que la pantalla "Notificaciones" funcione sin conexión después del
 *    primer sync. `leida` se actualiza local y remoto a la vez
 *    (marcarMensajeLeido).
 */
export const migracion0023MetaDiariaYMensajes: Migracion = {
  version: 23,
  nombre: 'meta_diaria_y_mensajes',
  async up(db: SQLiteDatabase) {
    await db.execAsync(`
      ALTER TABLE evento_promotores ADD COLUMN meta_diaria INTEGER;

      CREATE TABLE mensajes_recibidos (
        id TEXT PRIMARY KEY NOT NULL,
        destinatario_id TEXT NOT NULL,
        cuerpo TEXT NOT NULL,
        tipo TEXT NOT NULL,
        remitente_nombre TEXT NOT NULL,
        ts_cliente TEXT NOT NULL,
        leida INTEGER NOT NULL DEFAULT 0
      );
      CREATE INDEX idx_mensajes_recibidos_destinatario ON mensajes_recibidos(destinatario_id);
    `);
  },
};
