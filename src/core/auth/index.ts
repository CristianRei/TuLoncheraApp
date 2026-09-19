import type { ModoLogin, Rol } from '../tipos';

export type { ModoLogin };

const ROLES_POR_MODO: Record<ModoLogin, Rol[]> = {
  PROMOTOR: ['PROMOTOR'],
  ADMIN: ['ADMIN'],
  BODEGA: ['BODEGA'],
};

export function rolesPermitidosPara(modo: ModoLogin): Rol[] {
  return ROLES_POR_MODO[modo];
}
