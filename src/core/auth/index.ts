import type { Rol } from '../tipos';

/**
 * Modo de la pantalla de login. Ver docs/03-decisiones/0001-metodo-autenticacion.md:
 * un solo campo de PIN, acotado por rol a través del modo elegido.
 */
export type ModoLogin = 'PROMOTOR' | 'ADMIN' | 'BODEGA';

const ROLES_POR_MODO: Record<ModoLogin, Rol[]> = {
  PROMOTOR: ['PROMOTOR'],
  ADMIN: ['ADMIN'],
  BODEGA: ['BODEGA'],
};

export function rolesPermitidosPara(modo: ModoLogin): Rol[] {
  return ROLES_POR_MODO[modo];
}
