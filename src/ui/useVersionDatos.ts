import { useEffect, useRef, useState } from 'react';

import { suscribirDatosActualizados, versionDatos } from '@/sync/eventosDatos';

/**
 * Número que sube cada vez que llegan datos nuevos de Supabase a la base
 * local (una venta, un cargue, un movimiento de inventario).
 */
export function useVersionDatos(): number {
  const [version, setVersion] = useState(versionDatos());
  useEffect(() => suscribirDatosActualizados(() => setVersion(versionDatos())), []);
  return version;
}

/**
 * Vuelve a ejecutar `recargar` cada vez que llegan datos nuevos de Supabase,
 * para que una pantalla abierta se actualice sola sin que nadie toque nada.
 * NO corre al montar (eso ya lo hace el `useFocusEffect` de cada pantalla) y
 * usa siempre la versión más reciente de `recargar`, así respeta los filtros
 * que la persona tenga puestos en ese momento.
 */
export function useRecargarConDatosNuevos(recargar: () => void): void {
  const version = useVersionDatos();
  const ultimaRecarga = useRef(recargar);
  const primeraVez = useRef(true);

  // Sin dependencias a propósito: se ejecuta tras cada render y deja en la ref
  // la versión más reciente de `recargar` (con los filtros actuales) antes de
  // que corra el efecto de abajo.
  useEffect(() => {
    ultimaRecarga.current = recargar;
  });

  useEffect(() => {
    if (primeraVez.current) {
      primeraVez.current = false;
      return;
    }
    ultimaRecarga.current();
  }, [version]);
}
