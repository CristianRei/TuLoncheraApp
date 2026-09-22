import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useSesion } from './SesionContext';
import { COLORES_ADMIN, TIPOGRAFIA_ADMIN } from './tema';

export const ALTO_BARRA_SUPERIOR_ADMIN = 64;

/**
 * Barra superior fija de administración — 100% del ancho, por encima del
 * sidebar y del contenido (mismo lugar en las 14 secciones, montada una
 * sola vez por app/admin/_layout.tsx). Antes cada pantalla dibujaba su
 * propia franja vino con su propio logo/título, que solo cubría el ancho
 * del contenido a la derecha del sidebar — se veía cortada.
 */
export function BarraSuperiorAdmin() {
  const insets = useSafeAreaInsets();
  const { cerrarSesion } = useSesion();

  function salir() {
    cerrarSesion();
    router.replace('/');
  }

  return (
    <View style={[styles.barra, { paddingTop: insets.top }]}>
      <View style={styles.fila}>
        <View style={styles.marca}>
          <View style={styles.logo}>
            <Image
              source={require('@/assets/images/logo-tu-lonchera.png')}
              style={styles.logoImagen}
              resizeMode="contain"
            />
          </View>
          <View>
            <Text style={styles.etiqueta}>Administración</Text>
            <Text style={styles.nombreApp}>Tu Lonchera</Text>
          </View>
        </View>

        <Pressable style={styles.botonCerrarSesion} onPress={salir}>
          <Ionicons name="log-out-outline" size={15} color="#FFFFFF" />
          <Text style={styles.cerrarSesion}>Cerrar sesión</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  barra: {
    backgroundColor: COLORES_ADMIN.vino,
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  fila: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: ALTO_BARRA_SUPERIOR_ADMIN - 12,
  },
  marca: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  logo: {
    width: 36,
    height: 36,
    borderRadius: 9,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 4,
  },
  logoImagen: {
    width: '100%',
    height: '100%',
  },
  etiqueta: {
    fontSize: 10,
    fontFamily: TIPOGRAFIA_ADMIN.semiNegrita,
    color: COLORES_ADMIN.dorado,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  nombreApp: {
    fontSize: 15,
    fontFamily: TIPOGRAFIA_ADMIN.negrita,
    color: '#FFFFFF',
  },
  botonCerrarSesion: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  cerrarSesion: {
    fontSize: 13,
    fontFamily: TIPOGRAFIA_ADMIN.semiNegrita,
    color: '#FFFFFF',
  },
});
