import * as Crypto from 'expo-crypto';
import type { SQLiteDatabase } from 'expo-sqlite';

export type TablaSync =
  | 'turnos'
  | 'comprobantes_venta'
  | 'ventas'
  | 'movimientos'
  | 'lotes'
  | 'cargues'
  | 'conteos'
  | 'arqueos_caja'
  | 'usuarios'
  | 'productos'
  | 'categorias';
export type TipoTareaSync = 'FILA' | 'FOTO';

let disparadorSync: (() => void) | null = null;
let temporizadorDisparo: ReturnType<typeof setTimeout> | null = null;
const ESPERA_DISPARO_MS = 700;

/**
 * Registra qué hacer para subir "ya" lo recién encolado (lo registra
 * `app/_layout.tsx` con `drenarColaSync`). Está aquí y no importado del motor
 * para no crear un ciclo de imports (el motor importa casi todo `src/db`).
 */
export function registrarDisparadorSync(disparador: (() => void) | null): void {
  disparadorSync = disparador;
}

/**
 * Encola una tarea de subida a Supabase. Se llama SIEMPRE dentro de la misma
 * transacción SQLite que ya crea la entidad local (`iniciarTurno`, registrar
 * venta con comprobante) — la cola nunca debe quedar inconsistente con el
 * dato que describe. El motor de sync (`src/sync/motor.ts`) es quien
 * consume estas filas en background; esta función nunca toca la red.
 *
 * Además programa un disparo diferido (unos cientos de ms, agrupando varias
 * tareas seguidas) para que lo encolado suba enseguida en vez de esperar al
 * temporizador de 2 minutos — así el admin ve una venta casi al instante. El
 * diferido deja terminar primero la transacción que está encolando; si
 * falla o no hay red, el temporizador de respaldo lo sube después.
 */
export async function encolarSync(
  db: SQLiteDatabase,
  datos: { tabla: TablaSync; entidadId: string; tipoTarea: TipoTareaSync }
): Promise<void> {
  await db.runAsync(
    `INSERT INTO _sync_pendiente (id, tabla, entidad_id, tipo_tarea, creado_ts) VALUES (?, ?, ?, ?, ?)`,
    [Crypto.randomUUID(), datos.tabla, datos.entidadId, datos.tipoTarea, new Date().toISOString()]
  );
  if (disparadorSync && !temporizadorDisparo) {
    temporizadorDisparo = setTimeout(() => {
      temporizadorDisparo = null;
      disparadorSync?.();
    }, ESPERA_DISPARO_MS);
  }
}

export interface TareaSyncVista {
  id: string;
  tabla: TablaSync;
  entidadId: string;
  tipoTarea: TipoTareaSync;
  intentos: number;
  ultimoError: string | null;
  creadoTs: string;
  completadoTs: string | null;
}

/** Estado completo de la cola (pendientes y completadas), más reciente primero — para diagnóstico en app/admin/sync/. */
export async function listarColaSync(db: SQLiteDatabase): Promise<TareaSyncVista[]> {
  const filas = await db.getAllAsync<{
    id: string;
    tabla: TablaSync;
    entidad_id: string;
    tipo_tarea: TipoTareaSync;
    intentos: number;
    ultimo_error: string | null;
    creado_ts: string;
    completado_ts: string | null;
  }>(`SELECT id, tabla, entidad_id, tipo_tarea, intentos, ultimo_error, creado_ts, completado_ts
      FROM _sync_pendiente
      ORDER BY creado_ts DESC`);
  return filas.map((fila) => ({
    id: fila.id,
    tabla: fila.tabla,
    entidadId: fila.entidad_id,
    tipoTarea: fila.tipo_tarea,
    intentos: fila.intentos,
    ultimoError: fila.ultimo_error,
    creadoTs: fila.creado_ts,
    completadoTs: fila.completado_ts,
  }));
}
