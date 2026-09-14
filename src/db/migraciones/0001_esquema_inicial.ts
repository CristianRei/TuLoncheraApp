import type { SQLiteDatabase } from 'expo-sqlite';

import type { Migracion } from './index';

/**
 * Esquema inicial completo — ver CLAUDE.md sección 7 y docs/02-modelo-datos.md.
 *
 * Toda tabla de dominio usa PRIMARY KEY TEXT (UUID generado en cliente, R3).
 * `ts_cliente` + `dispositivo_id` en cada fila para que sincronizar después no
 * obligue a rehacer nada (R6). `movimientos` es append-only: solo INSERT, nunca
 * UPDATE ni DELETE (R2) — eso se aplica en la capa de queries, no aquí.
 */
export const migracion0001EsquemaInicial: Migracion = {
  version: 1,
  nombre: 'esquema_inicial',
  async up(db: SQLiteDatabase) {
    await db.execAsync(`
      CREATE TABLE usuarios (
        id TEXT PRIMARY KEY NOT NULL,
        nombre TEXT NOT NULL,
        rol TEXT NOT NULL CHECK (rol IN ('PROMOTOR', 'CONDUCTOR', 'BODEGA', 'ADMIN')),
        activo INTEGER NOT NULL DEFAULT 1,
        pin TEXT,
        ts_cliente TEXT NOT NULL,
        dispositivo_id TEXT NOT NULL
      );

      CREATE TABLE ubicaciones (
        id TEXT PRIMARY KEY NOT NULL,
        tipo TEXT NOT NULL CHECK (tipo IN ('BODEGA', 'CAMION', 'PROMOTOR')),
        nombre TEXT NOT NULL,
        responsable_id TEXT REFERENCES usuarios(id),
        ts_cliente TEXT NOT NULL,
        dispositivo_id TEXT NOT NULL
      );

      CREATE TABLE productos (
        id TEXT PRIMARY KEY NOT NULL,
        sku TEXT NOT NULL UNIQUE,
        codigo_barras TEXT,
        nombre TEXT NOT NULL,
        categoria TEXT NOT NULL,
        es_licor INTEGER NOT NULL DEFAULT 0,
        es_perecedero INTEGER NOT NULL DEFAULT 0,
        precio INTEGER NOT NULL,
        costo INTEGER NOT NULL,
        unidad_empaque INTEGER NOT NULL DEFAULT 1,
        ts_cliente TEXT NOT NULL,
        dispositivo_id TEXT NOT NULL
      );

      CREATE TABLE lotes (
        id TEXT PRIMARY KEY NOT NULL,
        producto_id TEXT NOT NULL REFERENCES productos(id),
        fecha_vencimiento TEXT,
        ts_cliente TEXT NOT NULL,
        dispositivo_id TEXT NOT NULL
      );

      CREATE TABLE empresas (
        id TEXT PRIMARY KEY NOT NULL,
        nombre TEXT NOT NULL,
        direccion TEXT,
        sector TEXT,
        contacto TEXT,
        ts_cliente TEXT NOT NULL,
        dispositivo_id TEXT NOT NULL
      );

      CREATE TABLE eventos (
        id TEXT PRIMARY KEY NOT NULL,
        empresa_id TEXT NOT NULL REFERENCES empresas(id),
        fecha TEXT NOT NULL,
        promotor_id TEXT REFERENCES usuarios(id),
        conductor_id TEXT REFERENCES usuarios(id),
        camion_id TEXT REFERENCES ubicaciones(id),
        estado TEXT NOT NULL CHECK (estado IN ('PLANEADO', 'EN_CURSO', 'CERRADO')),
        ts_cliente TEXT NOT NULL,
        dispositivo_id TEXT NOT NULL
      );

      CREATE TABLE movimientos (
        id TEXT PRIMARY KEY NOT NULL,
        tipo TEXT NOT NULL CHECK (tipo IN (
          'COMPRA_PROVEEDOR', 'RECARGA', 'VENTA', 'TRASLADO', 'RETIRO_ADMIN',
          'AJUSTE_CONTEO', 'AVERIA', 'DEGUSTACION', 'OBSEQUIO', 'DEVOLUCION_VENCIMIENTO'
        )),
        producto_id TEXT NOT NULL REFERENCES productos(id),
        lote_id TEXT REFERENCES lotes(id),
        cantidad INTEGER NOT NULL,
        ubicacion_origen_id TEXT REFERENCES ubicaciones(id),
        ubicacion_destino_id TEXT REFERENCES ubicaciones(id),
        evento_id TEXT REFERENCES eventos(id),
        usuario_id TEXT NOT NULL REFERENCES usuarios(id),
        motivo TEXT,
        ts_cliente TEXT NOT NULL,
        dispositivo_id TEXT NOT NULL
      );

      CREATE INDEX idx_movimientos_producto ON movimientos(producto_id);
      CREATE INDEX idx_movimientos_evento ON movimientos(evento_id);

      CREATE TABLE ventas (
        id TEXT PRIMARY KEY NOT NULL,
        numero_recibo TEXT NOT NULL UNIQUE,
        evento_id TEXT NOT NULL REFERENCES eventos(id),
        promotor_id TEXT NOT NULL REFERENCES usuarios(id),
        ts_cliente TEXT NOT NULL,
        metodo_pago TEXT NOT NULL CHECK (metodo_pago IN ('EFECTIVO', 'NEQUI', 'DAVIPLATA', 'DATAFONO')),
        total INTEGER NOT NULL,
        dispositivo_id TEXT NOT NULL
      );

      CREATE TABLE venta_items (
        venta_id TEXT NOT NULL REFERENCES ventas(id),
        producto_id TEXT NOT NULL REFERENCES productos(id),
        cantidad INTEGER NOT NULL,
        precio_unitario INTEGER NOT NULL,
        ts_cliente TEXT NOT NULL,
        dispositivo_id TEXT NOT NULL,
        PRIMARY KEY (venta_id, producto_id)
      );

      CREATE TABLE conteos (
        id TEXT PRIMARY KEY NOT NULL,
        evento_id TEXT NOT NULL REFERENCES eventos(id),
        ts_cliente TEXT NOT NULL,
        estado TEXT NOT NULL CHECK (estado IN ('ABIERTO', 'PENDIENTE_APROBACION', 'CERRADO')),
        firmado_por TEXT REFERENCES usuarios(id),
        dispositivo_id TEXT NOT NULL
      );

      CREATE TABLE conteo_lineas (
        conteo_id TEXT NOT NULL REFERENCES conteos(id),
        producto_id TEXT NOT NULL REFERENCES productos(id),
        teorico INTEGER NOT NULL,
        contado INTEGER NOT NULL,
        diferencia INTEGER NOT NULL,
        motivo TEXT,
        aprobado_por TEXT REFERENCES usuarios(id),
        ts_cliente TEXT NOT NULL,
        dispositivo_id TEXT NOT NULL,
        PRIMARY KEY (conteo_id, producto_id)
      );

      CREATE TABLE niveles_objetivo (
        promotor_id TEXT NOT NULL REFERENCES usuarios(id),
        producto_id TEXT NOT NULL REFERENCES productos(id),
        cantidad INTEGER NOT NULL,
        actualizado_ts TEXT NOT NULL,
        dispositivo_id TEXT NOT NULL,
        PRIMARY KEY (promotor_id, producto_id)
      );
    `);
  },
};
