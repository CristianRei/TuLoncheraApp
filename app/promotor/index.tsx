import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { COLORES } from '@/ui/colores';
import { useSesion } from '@/ui/SesionContext';
import { useRequiereSesion } from '@/ui/useRequiereSesion';

export default function HomePromotor() {
  const usuario = useRequiereSesion(['PROMOTOR']);
  const { cerrarSesion } = useSesion();

  if (!usuario) return null;

  function salir() {
    cerrarSesion();
    router.replace('/');
  }

  return (
    <View style={styles.contenedor}>
      <View style={styles.encabezado}>
        <Text style={styles.saludo}>Hola, {usuario.nombre}</Text>
        <Pressable onPress={salir}>
          <Text style={styles.cerrarSesion}>Cerrar sesión</Text>
        </Pressable>
      </View>
      <View style={styles.cuerpo}>
        <Text style={styles.mensaje}>Todavía no hay ventas ni inventario que mostrar aquí.</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  contenedor: {
    flex: 1,
    backgroundColor: '#FFF8EC',
  },
  encabezado: {
    backgroundColor: COLORES.primario,
    paddingTop: 64,
    paddingHorizontal: 20,
    paddingBottom: 24,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  saludo: {
    fontSize: 20,
    fontWeight: '700',
    color: '#3A2400',
  },
  cerrarSesion: {
    fontSize: 13,
    color: '#3A2400',
    textDecorationLine: 'underline',
  },
  cuerpo: {
    padding: 20,
  },
  mensaje: {
    fontSize: 14,
    color: '#666',
  },
});
