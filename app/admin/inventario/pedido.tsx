import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { COLORES } from '@/ui/colores';
import { ContenedorAncho } from '@/ui/ContenedorAncho';
import { PantallaIngresarPedido } from '@/ui/PantallaIngresarPedido';
import { useEsPantallaAncha } from '@/ui/useEsPantallaAncha';
import { useRequiereSesion } from '@/ui/useRequiereSesion';

export default function IngresarPedido() {
  const usuario = useRequiereSesion(['ADMIN']);
  const insets = useSafeAreaInsets();
  const anchaPantalla = useEsPantallaAncha();

  if (!usuario) return null;

  return (
    <View style={styles.contenedor}>
      <View
        style={[
          anchaPantalla ? styles.encabezadoAncho : styles.encabezado,
          { paddingTop: anchaPantalla ? 20 : insets.top + 20 },
        ]}
      >
        <ContenedorAncho anchoMaximo={640} style={styles.encabezadoContenido}>
          {!anchaPantalla && (
            <Pressable onPress={() => router.back()}>
              <Text style={styles.volver}>‹ Inventario</Text>
            </Pressable>
          )}
          <Text style={anchaPantalla ? styles.tituloAncho : styles.titulo}>Ingresar pedido</Text>
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
  encabezadoAncho: {
    backgroundColor: 'transparent',
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
  tituloAncho: {
    color: COLORES.oscuro,
    fontSize: 20,
    fontWeight: '700',
  },
});
