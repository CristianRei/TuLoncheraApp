import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { COLORES } from '@/ui/colores';
import { PantallaIngresarPedido } from '@/ui/PantallaIngresarPedido';
import { useRequiereSesion } from '@/ui/useRequiereSesion';

export default function IngresarPedido() {
  const usuario = useRequiereSesion(['ADMIN']);

  if (!usuario) return null;

  return (
    <View style={styles.contenedor}>
      <View style={styles.encabezado}>
        <Pressable onPress={() => router.back()}>
          <Text style={styles.volver}>‹ Inventario</Text>
        </Pressable>
        <Text style={styles.titulo}>Ingresar pedido</Text>
      </View>
      <PantallaIngresarPedido usuarioId={usuario.id} />
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
    paddingTop: 64,
    paddingHorizontal: 20,
    paddingBottom: 16,
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
