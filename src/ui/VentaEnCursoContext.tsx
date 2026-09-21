import { createContext, useContext, useState, type ReactNode } from 'react';

import type { Cliente } from '@/core/tipos';

interface VentaEnCursoContextValue {
  /** Cliente al que se le va a facturar la venta que el promotor está armando ahora mismo (el carrito actual). */
  clienteVentaActual: Cliente | null;
  setClienteVentaActual: (cliente: Cliente | null) => void;
}

const VentaEnCursoContext = createContext<VentaEnCursoContextValue | null>(null);

/**
 * El carrito vive como estado local de app/promotor/index.tsx, pero el
 * promotor elige el cliente desde una pantalla distinta (app/promotor/
 * clientes/), que expo-router monta como una screen separada de la misma
 * pila — no puede leer el estado de otro componente directamente. Este
 * contexto, provisto en app/promotor/_layout.tsx (envuelve toda la pila de
 * `/promotor`), es el punto en común entre ambas pantallas.
 */
export function VentaEnCursoProvider({ children }: { children: ReactNode }) {
  const [clienteVentaActual, setClienteVentaActual] = useState<Cliente | null>(null);
  return (
    <VentaEnCursoContext.Provider value={{ clienteVentaActual, setClienteVentaActual }}>
      {children}
    </VentaEnCursoContext.Provider>
  );
}

export function useVentaEnCurso(): VentaEnCursoContextValue {
  const contexto = useContext(VentaEnCursoContext);
  if (!contexto) throw new Error('useVentaEnCurso debe usarse dentro de VentaEnCursoProvider');
  return contexto;
}
