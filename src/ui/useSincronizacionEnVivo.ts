import { useEffect } from 'react';

import type { Rol } from '@/core/tipos';
import { getDb } from '@/db/client';
import { sincronizarDatosRemotos } from '@/sync/bajada';
import { suscribirCambiosRemotos } from '@/sync/realtime';

const INTERVALO_RESPALDO_MS = 45 * 1000;
const ESPERA_AGRUPAR_MS = 400;

/**
 * Mantiene la base local al día con Supabase mientras la persona está dentro
 * de su sección: una descarga al entrar, otra cada vez que Supabase avisa de
 * un cambio en `tablas` (Realtime — casi instantáneo) y una periódica de
 * respaldo por si Realtime se cae. Nada de esto bloquea la UI (R5): si no hay
 * red simplemente no llega nada nuevo. Se monta una vez por sección
 * (`app/admin/_layout.tsx`, `app/bodega/_layout.tsx`, `app/promotor/_layout.tsx`).
 */
export function useSincronizacionEnVivo(usuarioId: string | null, rol: Rol | null, nombre: string, tablas: string[]) {
  const tablasClave = tablas.join(',');

  useEffect(() => {
    if (!usuarioId || !rol) return;
    let activo = true;
    let temporizador: ReturnType<typeof setTimeout> | null = null;

    const sincronizar = async () => {
      if (!activo) return;
      const db = await getDb();
      await sincronizarDatosRemotos(db, { id: usuarioId, nombre, rol });
    };

    sincronizar();
    const cancelarRealtime = suscribirCambiosRemotos(tablasClave.split(','), () => {
      // Varios cambios seguidos (una venta trae cabecera + líneas) se juntan en una sola descarga.
      if (temporizador) clearTimeout(temporizador);
      temporizador = setTimeout(sincronizar, ESPERA_AGRUPAR_MS);
    });
    const intervalo = setInterval(sincronizar, INTERVALO_RESPALDO_MS);

    return () => {
      activo = false;
      cancelarRealtime();
      clearInterval(intervalo);
      if (temporizador) clearTimeout(temporizador);
    };
  }, [usuarioId, rol, nombre, tablasClave]);
}
