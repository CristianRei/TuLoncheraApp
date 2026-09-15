import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { COLORES } from '@/ui/colores';
import { ContenedorAncho } from '@/ui/ContenedorAncho';
import { PantallaIngresarPedido } from '@/ui/PantallaIngresarPedido';
import { useRequiereSesion } from '@/ui/useRequiereSesion';

export default function IngresarPedido() {
  const usuario = useRequiereSesion(['ADMIN']);
  const insets = useSafeAreaInsets();

  if (!usuario) return null;

  return (
    <View style={styles.contenedor}>
      <View style={[styles.encabezado, { paddingTop: insets.top + 20 }]}>
        <ContenedorAncho anchoMaximo={640} style={styles.encabezadoContenido}>
          <Pressable onPress={() => router.back()}>
            <Text style={styles.volver}>‹ Inventario</Text>
          </Pressable>
          <Text style={styles.titulo}>Ingresar pedido</Text>
        </ContenedorAncho>
      </View>
      <ContenedorAncho anchoMaximo={640} llenarAlto>
        <PantallaIngresarPedido usuarioId={usuario.id} />
      </ContenedorAncho>
    </View>
  );
}

const styles = StyleSheet.create({
  contenedor: {
    flex: 1,
    backgroundColor: '#FBEDED',
  },
  encabezado: {
    backgroundColor: COLORES.oscuro,
    paddingHorizontal: 20,
    paddingBottom: 16,
  },
  encabezadoContenido: {
    gap: 4,
  },
  volver: {
    color: '#FFFFFF',
    fontSize: 14,
    textDecorationLine: 'underline',
  },
  titulo: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '700',
  },
});
