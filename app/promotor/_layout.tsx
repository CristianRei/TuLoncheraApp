import { Stack } from 'expo-router';

import { VentaEnCursoProvider } from '@/ui/VentaEnCursoContext';

export default function PromotorLayout() {
  return (
    <VentaEnCursoProvider>
      <Stack screenOptions={{ headerShown: false }} />
    </VentaEnCursoProvider>
  );
}
