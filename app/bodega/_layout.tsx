import { Stack } from 'expo-router';

import { useSesion } from '@/ui/SesionContext';
import { useSincronizacionEnVivo } from '@/ui/useSincronizacionEnVivo';

/**
 * Bodega ve al instante los cargues que admin planea (y los movimientos de la
 * bodega) — ver src/ui/useSincronizacionEnVivo.ts.
 */
export default function BodegaLayout() {
  const { usuario } = useSesion();
  const esBodega = usuario?.rol === 'BODEGA';

  useSincronizacionEnVivo(esBodega ? usuario.id : null, esBodega ? 'BODEGA' : null, usuario?.nombre ?? '', [
    'cargues',
    'movimientos',
  ]);

  return <Stack screenOptions={{ headerShown: false }} />;
}
