import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { COLORES } from '@/ui/colores';
import { useSesion } from '@/ui/SesionContext';
import { useRequiereSesion } from '@/ui/useRequiereSesion';

export default function HomeBodega() {
  const usuario = useRequiereSesion(['BODEGA']);
  const { cerrarSesion } = useSesion();

  if (!usuario) return null;

  function salir() {
    cerrarSesion();
    router.replace('/');
  }

  return (
    <View style={styles.contenedor}>
      <View style={styles.encabezado}>
        <View>
          <Text style={styles.etiqueta}>Bodega</Text>
          <Text style={styles.saludo}>{usuario.nombre}</Text>
        </View>
        <Pressable onPress={salir}>
          <Text style={styles.cerrarSesion}>Cerrar sesión</Text>
        </Pressable>
      </View>
      <View style={styles.cuerpo}>
        <Text style={styles.mensaje}>Todavía no hay alistamiento de recargas disponible.</Text>
      </View>
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
    paddingBottom: 24,
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
  cuerpo: {
    padding: 20,
  },
  mensaje: {
    fontSize: 14,
    color: '#666',
  },
});
