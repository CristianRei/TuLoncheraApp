import * as Crypto from 'expo-crypto';
import type { SQLiteDatabase } from 'expo-sqlite';

interface UsuarioSemilla {
  nombre: string;
  rol: 'ADMIN' | 'PROMOTOR' | 'BODEGA';
  pin: string;
}

const USUARIOS_DE_PRUEBA: UsuarioSemilla[] = [
  // Admin usa PIN de 6 dígitos (ver src/core/pin.ts, modoPinParaRol) — antes '0000'.
  { nombre: 'Admin', rol: 'ADMIN', pin: '000000' },
  { nombre: 'Cristian', rol: 'PROMOTOR', pin: '8509' },
  { nombre: 'Bodega', rol: 'BODEGA', pin: '1234' },
];

/**
 * Solo para desarrollo (ver app/_layout.tsx, se llama bajo __DEV__).
 * Idempotente: si el PIN ya existe no vuelve a insertar.
 */
export async function sembrarUsuariosDePrueba(
  db: SQLiteDatabase,
  dispositivoId: string
): Promise<void> {
  const existentes = await db.getAllAsync<{ pin: string }>('SELECT pin FROM usuarios');
  const pinsExistentes = new Set(existentes.map((fila) => fila.pin));
  const ahora = new Date().toISOString();

  for (const usuario of USUARIOS_DE_PRUEBA) {
    if (pinsExistentes.has(usuario.pin)) continue;
    await db.runAsync(
      `INSERT INTO usuarios (id, nombre, rol, activo, pin, ts_cliente, dispositivo_id)
       VALUES (?, ?, ?, 1, ?, ?, ?)`,
      [Crypto.randomUUID(), usuario.nombre, usuario.rol, usuario.pin, ahora, dispositivoId]
    );
  }
}
