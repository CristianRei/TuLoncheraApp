import { router } from 'expo-router';
import { useEffect } from 'react';

import type { Rol, UsuarioSesion } from '@/core/tipos';

import { useSesion } from './SesionContext';

/**
 * Guardia de pantallas por rol: si no hay sesión o el rol no coincide,
 * redirige al login. Devuelve el usuario solo cuando es válido mostrar la
 * pantalla.
 */
export function useRequiereSesion(rolesPermitidos: Rol[]): UsuarioSesion | null {
  const { usuario } = useSesion();
  const autorizado = !!usuario && rolesPermitidos.includes(usuario.rol);

  useEffect(() => {
    if (!autorizado) {
      router.replace('/');
    }
  }, [autorizado]);

  return autorizado ? usuario : null;
}
