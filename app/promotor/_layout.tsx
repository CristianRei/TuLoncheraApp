import { Stack } from 'expo-router';

import { useSesion } from '@/ui/SesionContext';
import { useSincronizacionEnVivo } from '@/ui/useSincronizacionEnVivo';
import { VentaEnCursoProvider } from '@/ui/VentaEnCursoContext';

export default function PromotorLayout() {
  const { usuario } = useSesion();
  const esPromotor = usuario?.rol === 'PROMOTOR';

  // Lo que bodega le entrega (RECARGA) llega solo a su inventario, los
  // eventos que admin le planea llegan a su calendario, un descuento que le
  // asignan cambia sus precios al instante, lo que venden sus compañeros de
  // evento suma a la meta compartida, y un cliente que admin (u otro
  // promotor) crea o elimina llega a su lista — ver
  // src/ui/useSincronizacionEnVivo.ts.
  useSincronizacionEnVivo(esPromotor ? usuario.id : null, esPromotor ? 'PROMOTOR' : null, usuario?.nombre ?? '', [
    'movimientos',
    'eventos',
    'descuentos',
    'ventas',
    'clientes',
  ]);

  return (
    <VentaEnCursoProvider>
      <Stack screenOptions={{ headerShown: false }} />
    </VentaEnCursoProvider>
  );
}
