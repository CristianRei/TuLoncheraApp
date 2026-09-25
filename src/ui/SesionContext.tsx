import { createContext, useContext, useState, type ReactNode } from 'react';

import type { UsuarioSesion } from '@/core/tipos';
import { establecerAdminDeSesion } from '@/db/adminSesion';

interface SesionContextValor {
  usuario: UsuarioSesion | null;
  iniciarSesion: (usuario: UsuarioSesion) => void;
  cerrarSesion: () => void;
}

const SesionContext = createContext<SesionContextValor | null>(null);

/**
 * Sesión en memoria — no se persiste entre reinicios de la app (decisión
 * deliberada, ver docs/03-decisiones/0001-metodo-autenticacion.md).
 */
export function SesionProvider({ children }: { children: ReactNode }) {
  const [usuario, setUsuario] = useState<UsuarioSesion | null>(null);

  const valor: SesionContextValor = {
    usuario,
    iniciarSesion: (u) => {
      establecerAdminDeSesion(u.rol === 'ADMIN' ? u.id : null);
      setUsuario(u);
    },
    cerrarSesion: () => {
      establecerAdminDeSesion(null);
      setUsuario(null);
    },
  };

  return <SesionContext.Provider value={valor}>{children}</SesionContext.Provider>;
}

export function useSesion(): SesionContextValor {
  const contexto = useContext(SesionContext);
  if (!contexto) {
    throw new Error('useSesion debe usarse dentro de SesionProvider');
  }
  return contexto;
}
