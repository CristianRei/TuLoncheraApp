import * as Crypto from 'expo-crypto';
import type { SQLiteDatabase } from 'expo-sqlite';

import { modoPinParaRol, pinDesdeCedula, pinManualValido } from '@/core/pin';
import type { Persona, Rol } from '@/core/tipos';

interface FilaPersona {
  id: string;
  nombre: string;
  rol: Rol;
  cedula: string | null;
  celular: string | null;
  direccion: string | null;
  pin: string | null;
  activo: number;
}

const COLUMNAS = 'id, nombre, rol, cedula, celular, direccion, pin, activo';

function aPersona(fila: FilaPersona): Persona {
  return {
    id: fila.id,
    nombre: fila.nombre,
    rol: fila.rol,
    cedula: fila.cedula,
    celular: fila.celular,
    direccion: fila.direccion,
    pin: fila.pin,
    activo: fila.activo === 1,
  };
}

export class PinDuplicadoError extends Error {
  readonly pin: string;
  constructor(pin: string) {
    super(`El PIN ${pin} ya está en uso por otra persona. Escribe un PIN distinto para esta persona.`);
    this.name = 'PinDuplicadoError';
    this.pin = pin;
  }
}

/** El rol nuevo necesita cédula (PIN derivado de ella) pero la persona no tiene una guardada. */
export class CedulaRequeridaError extends Error {
  constructor() {
    super('Este rol deriva el PIN de la cédula — captúrala antes de cambiar el rol.');
    this.name = 'CedulaRequeridaError';
  }
}

async function pinEnUso(db: SQLiteDatabase, pin: string, excluirId?: string): Promise<boolean> {
  const fila = excluirId
    ? await db.getFirstAsync<{ id: string }>('SELECT id FROM usuarios WHERE pin = ? AND id != ?', [pin, excluirId])
    : await db.getFirstAsync<{ id: string }>('SELECT id FROM usuarios WHERE pin = ?', [pin]);
  return !!fila;
}

/**
 * Calcula el PIN según la regla del rol (src/core/pin.ts). Para roles
 * DESDE_CEDULA, `pinManual` es solo el override de colisión (4 dígitos);
 * para ADMIN, `pinManual` es el PIN elegido a mano (obligatorio, 6 dígitos).
 */
function calcularPin(rol: Rol, cedula: string | null, pinManual: string | null | undefined): string {
  const modo = modoPinParaRol(rol);
  if (modo === 'MANUAL_6_DIGITOS') {
    const pin = pinManual?.trim() ?? '';
    if (!pinManualValido(pin)) {
      throw new Error('El PIN de administrador debe tener exactamente 6 dígitos.');
    }
    return pin;
  }
  const manual = pinManual?.trim();
  if (manual) return manual;
  if (!cedula) throw new CedulaRequeridaError();
  return pinDesdeCedula(cedula);
}

export async function listarPersonalCompleto(
  db: SQLiteDatabase,
  opciones: { incluirInactivos?: boolean; rol?: Rol } = {}
): Promise<Persona[]> {
  const condiciones = [opciones.incluirInactivos ? 'activo = 0' : 'activo = 1'];
  const parametros: string[] = [];
  if (opciones.rol) {
    condiciones.push('rol = ?');
    parametros.push(opciones.rol);
  }
  const filas = await db.getAllAsync<FilaPersona>(
    `SELECT ${COLUMNAS} FROM usuarios WHERE ${condiciones.join(' AND ')} ORDER BY nombre ASC`,
    parametros
  );
  return filas.map(aPersona);
}

export async function obtenerPersona(db: SQLiteDatabase, id: string): Promise<Persona | null> {
  const fila = await db.getFirstAsync<FilaPersona>(`SELECT ${COLUMNAS} FROM usuarios WHERE id = ?`, [id]);
  return fila ? aPersona(fila) : null;
}

export interface DatosPersona {
  nombre: string;
  rol: Rol;
  cedula: string | null;
  celular?: string | null;
  direccion?: string | null;
  /** Override de colisión (roles DESDE_CEDULA) o el PIN de 6 dígitos elegido (ADMIN). */
  pinManual?: string | null;
}

export async function crearPersona(
  db: SQLiteDatabase,
  datos: DatosPersona,
  dispositivoId: string
): Promise<Persona> {
  const pin = calcularPin(datos.rol, datos.cedula, datos.pinManual);
  if (await pinEnUso(db, pin)) throw new PinDuplicadoError(pin);

  const id = Crypto.randomUUID();
  await db.runAsync(
    `INSERT INTO usuarios (id, nombre, rol, activo, pin, cedula, celular, direccion, ts_cliente, dispositivo_id)
     VALUES (?, ?, ?, 1, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      datos.nombre,
      datos.rol,
      pin,
      datos.cedula,
      datos.celular ?? null,
      datos.direccion ?? null,
      new Date().toISOString(),
      dispositivoId,
    ]
  );
  const creada = await obtenerPersona(db, id);
  if (!creada) throw new Error('No se pudo crear la persona');
  return creada;
}

export async function actualizarPersona(
  db: SQLiteDatabase,
  id: string,
  cambios: {
    nombre?: string;
    cedula?: string | null;
    celular?: string | null;
    direccion?: string | null;
    pinManual?: string | null;
  }
): Promise<void> {
  const columnas: string[] = [];
  const valores: (string | null)[] = [];

  if (cambios.nombre !== undefined) {
    columnas.push('nombre = ?');
    valores.push(cambios.nombre);
  }
  if (cambios.celular !== undefined) {
    columnas.push('celular = ?');
    valores.push(cambios.celular);
  }
  if (cambios.direccion !== undefined) {
    columnas.push('direccion = ?');
    valores.push(cambios.direccion);
  }
  // La cédula y el PIN cambian juntos (solo para roles DESDE_CEDULA) para
  // que el PIN mostrado siempre coincida con la cédula real.
  if (cambios.cedula !== undefined) {
    const actual = await obtenerPersona(db, id);
    if (!actual) throw new Error('Esta persona ya no existe.');
    if (modoPinParaRol(actual.rol) === 'DESDE_CEDULA') {
      const nuevoPin = calcularPin(actual.rol, cambios.cedula, cambios.pinManual);
      if (await pinEnUso(db, nuevoPin, id)) throw new PinDuplicadoError(nuevoPin);
      columnas.push('cedula = ?', 'pin = ?');
      valores.push(cambios.cedula, nuevoPin);
    } else {
      // ADMIN: la cédula es solo un dato de contacto opcional, no toca el PIN.
      columnas.push('cedula = ?');
      valores.push(cambios.cedula);
    }
  }
  // Reemplazar el PIN de un ADMIN sin tocar la cédula (ej. elegir un PIN nuevo).
  if (cambios.cedula === undefined && cambios.pinManual !== undefined && cambios.pinManual !== null) {
    const actual = await obtenerPersona(db, id);
    if (!actual) throw new Error('Esta persona ya no existe.');
    if (modoPinParaRol(actual.rol) === 'MANUAL_6_DIGITOS') {
      const nuevoPin = calcularPin(actual.rol, actual.cedula, cambios.pinManual);
      if (await pinEnUso(db, nuevoPin, id)) throw new PinDuplicadoError(nuevoPin);
      columnas.push('pin = ?');
      valores.push(nuevoPin);
    }
  }

  if (columnas.length === 0) return;
  await db.runAsync(`UPDATE usuarios SET ${columnas.join(', ')} WHERE id = ?`, [...valores, id]);
}

/**
 * Cambia el rol de una persona y recalcula su PIN según la regla del rol
 * nuevo (src/core/pin.ts) — un promotor que pasa a bodega/conductor
 * conserva el PIN derivado de su cédula (no cambia, misma regla); si pasa a
 * ADMIN necesita un `nuevoPinManual` de 6 dígitos; si pasa de ADMIN a un rol
 * DESDE_CEDULA sin cédula guardada, lanza CedulaRequeridaError — la UI debe
 * pedirla antes de reintentar.
 */
export async function cambiarRolPersona(
  db: SQLiteDatabase,
  id: string,
  nuevoRol: Rol,
  opciones: { nuevoPinManual?: string | null; cedula?: string | null } = {}
): Promise<Persona> {
  const actual = await obtenerPersona(db, id);
  if (!actual) throw new Error('Esta persona ya no existe.');

  const cedula = opciones.cedula !== undefined ? opciones.cedula : actual.cedula;
  const nuevoPin = calcularPin(nuevoRol, cedula, opciones.nuevoPinManual);
  if (await pinEnUso(db, nuevoPin, id)) throw new PinDuplicadoError(nuevoPin);

  await db.runAsync('UPDATE usuarios SET rol = ?, cedula = ?, pin = ? WHERE id = ?', [
    nuevoRol,
    cedula,
    nuevoPin,
    id,
  ]);
  const actualizada = await obtenerPersona(db, id);
  if (!actualizada) throw new Error('Esta persona ya no existe.');
  return actualizada;
}

/**
 * "Eliminar" nunca borra la fila: ya puede tener ventas, movimientos,
 * turnos, cargues y conteos guardados con su ID — se desactiva (mismo
 * criterio que productos.activo) y se libera el PIN (queda NULL) para que
 * una futura persona con la misma cédula no choque con el índice único.
 */
export async function eliminarPersona(db: SQLiteDatabase, id: string): Promise<void> {
  await db.runAsync('UPDATE usuarios SET activo = 0, pin = NULL WHERE id = ?', [id]);
}

export class PersonaConHistorialError extends Error {
  constructor() {
    super(
      'Esta persona ya tiene ventas, turnos, cargues u otro movimiento guardado — no se puede eliminar por completo sin perder ese historial. Solo se puede dejar dada de baja.'
    );
    this.name = 'PersonaConHistorialError';
  }
}

/**
 * Borra a la persona de verdad de la base — no `activo = 0`, un DELETE real.
 * Solo para un registro de prueba o un error de captura que nunca tuvo
 * actividad real. `PRAGMA foreign_keys = ON` (src/db/client.ts) es la red de
 * seguridad real: si la persona tiene ventas, turnos, cargues, conteos,
 * eventos asignados o cualquier otra referencia real, el DELETE de
 * `usuarios` falla solo por la restricción de llave foránea, y ese fallo se
 * traduce aquí a un error claro en vez de dejar datos huérfanos.
 *
 * `metas` no tiene llave foránea hacia `usuarios` (es polimórfica: puede
 * apuntar a un promotor o a un punto) — por eso si la persona tenía una
 * meta asignada, se borra a mano antes.
 */
export async function eliminarPersonaPermanente(db: SQLiteDatabase, id: string): Promise<void> {
  try {
    await db.withTransactionAsync(async () => {
      await db.runAsync("DELETE FROM metas WHERE tipo = 'PROMOTOR' AND entidad_id = ?", [id]);
      await db.runAsync("DELETE FROM ubicaciones WHERE tipo = 'PROMOTOR' AND responsable_id = ?", [id]);
      await db.runAsync('DELETE FROM usuarios WHERE id = ?', [id]);
    });
  } catch (error) {
    if (error instanceof Error && /foreign\s*key|constraint/i.test(error.message)) {
      throw new PersonaConHistorialError();
    }
    throw error;
  }
}
