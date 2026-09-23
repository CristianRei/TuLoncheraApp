import { Stack } from 'expo-router';

import { useSesion } from '@/ui/SesionContext';
import { useSincronizacionEnVivo } from '@/ui/useSincronizacionEnVivo';
import { VentaEnCursoProvider } from '@/ui/VentaEnCursoContext';

export default function PromotorLayout() {
  const { usuario } = useSesion();
  const esPromotor = usuario?.rol === 'PROMOTOR';

  // Lo que bodega le entrega (RECARGA) llega solo a su inventario — ver
  // src/ui/useSincronizacionEnVivo.ts.
  useSincronizacionEnVivo(esPromotor ? usuario.id : null, esPromotor ? 'PROMOTOR' : null, usuario?.nombre ?? '', [
    'movimientos',
  ]);

  return (
    <VentaEnCursoProvider>
      <Stack screenOptions={{ headerShown: false }} />
    </VentaEnCursoProvider>
  );
}
