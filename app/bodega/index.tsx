import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { COLORES } from '@/ui/colores';
import { ContenedorAncho } from '@/ui/ContenedorAncho';
import { PantallaIngresarPedido } from '@/ui/PantallaIngresarPedido';
import { useSesion } from '@/ui/SesionContext';
import { useRequiereSesion } from '@/ui/useRequiereSesion';

export default function HomeBodega() {
  const usuario = useRequiereSesion(['BODEGA']);
  const { cerrarSesion } = useSesion();
  const insets = useSafeAreaInsets();

  if (!usuario) return null;

  function salir() {
    cerrarSesion();
    router.replace('/');
  }

  return (
    <View style={styles.contenedor}>
      <View style={[styles.encabezado, { paddingTop: insets.top + 20 }]}>
        <ContenedorAncho anchoMaximo={640}>
          <View style={styles.encabezadoFila}>
            <View>
              <Text style={styles.etiqueta}>Bodega</Text>
              <Text style={styles.saludo}>{usuario.nombre}</Text>
            </View>
            <Pressable onPress={salir}>
              <Text style={styles.cerrarSesion}>Cerrar sesión</Text>
            </Pressable>
          </View>
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
    paddingBottom: 24,
  },
  encabezadoFila: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  etiqueta: {
    fontSize: 12,
    color: '#F3D6D6',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  saludo: {
    fontSize: 20,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  cerrarSesion: {
    fontSize: 13,
    color: '#FFFFFF',
    textDecorationLine: 'underline',
  },
});
