// Tipos puros de la bitácora de auditoría. Sin imports de React/Expo/SQLite
// — ver CLAUDE.md sección 6.

export type EntidadAuditoria = 'PERSONA' | 'CLIENTE' | 'CATEGORIA' | 'EVENTO';

export type AccionAuditoria = 'CREAR' | 'ACTUALIZAR' | 'ELIMINAR' | 'CAMBIAR_ROL' | 'CANCELAR';

/**
 * Una entrada de la línea de tiempo de auditoría — puede venir de
 * `bitacora_auditoria` (acciones administrativas), de `movimientos`
 * (inventario, ya inmutable) o de `intentos_pin_fallidos` (accesos
 * fallidos, sin usuario identificado). `usuarioNombre`/`dispositivoId` son
 * mutuamente informativos: un intento fallido de PIN no tiene usuario, solo
 * dispositivo — nunca se inventa un nombre para ese caso.
 */
export interface LogAuditoria {
  id: string;
  origen: 'AUDITORIA' | 'MOVIMIENTO' | 'ACCESO_FALLIDO';
  usuarioNombre: string | null;
  dispositivoId: string | null;
  descripcion: string;
  detalles: string | null;
  tsCliente: string;
}
