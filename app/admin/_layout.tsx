import { Stack } from 'expo-router';
import { View, StyleSheet } from 'react-native';

import { BarraSuperiorAdmin } from '@/ui/BarraSuperiorAdmin';
import { SidebarAdmin } from '@/ui/SidebarAdmin';
import { useSesion } from '@/ui/SesionContext';
import { COLORES_ADMIN } from '@/ui/tema';
import { useEsPantallaAncha } from '@/ui/useEsPantallaAncha';
import { useSincronizacionEnVivo } from '@/ui/useSincronizacionEnVivo';

/**
 * Envuelve toda la sección /admin. En pantalla ancha (tablet/desktop,
 * ≥768px) agrega BarraSuperiorAdmin (logo + cerrar sesión, 100% del ancho,
 * siempre en el mismo lugar en las 14 secciones) con SidebarAdmin debajo a
 * la izquierda del contenido. En celular no se monta nada de esto — cada
 * pantalla sigue funcionando exactamente igual que antes (con su propia
 * franja de encabezado y volver a /admin y tocar un módulo).
 */
export default function AdminLayout() {
  const pantallaAncha = useEsPantallaAncha();
  const { usuario } = useSesion();
  const esAdmin = usuario?.rol === 'ADMIN';

  // Ventas de los promotores, cargues que bodega entrega y movimientos de la
  // bodega llegan solos (Realtime) — ver src/ui/useSincronizacionEnVivo.ts.
  useSincronizacionEnVivo(esAdmin ? usuario.id : null, esAdmin ? 'ADMIN' : null, usuario?.nombre ?? '', [
    'ventas',
    'cargues',
    'movimientos',
  ]);

  if (!pantallaAncha) {
    return <Stack screenOptions={{ headerShown: false }} />;
  }

  return (
    <View style={styles.columna}>
      <BarraSuperiorAdmin />
      <View style={styles.fila}>
        <SidebarAdmin />
        <View style={styles.contenido}>
          <Stack screenOptions={{ headerShown: false }} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  columna: {
    flex: 1,
    backgroundColor: COLORES_ADMIN.background,
  },
  fila: {
    flex: 1,
    flexDirection: 'row',
  },
  contenido: {
    flex: 1,
  },
});
