import Ionicons from '@expo/vector-icons/Ionicons';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ContenedorAncho } from './ContenedorAncho';
import { COLORES_ADMIN, RADII_ADMIN, TEXTO_ADMIN, TIPOGRAFIA_ADMIN } from './tema';

interface Props {
  /** Rol en mayúsculas sobre el nombre (ej. "Bodega"). */
  rol: string;
  /** Línea principal: nombre de la persona o de la app. */
  titulo: string;
  onCerrarSesion: () => void;
  anchoMaximo: number;
}

/**
 * Encabezado de la pantalla de inicio de un rol (logo + rol + nombre +
 * cerrar sesión) — el mismo del menú de admin, para que Bodega arranque
 * igual. Las subpantallas usan `Encabezado`.
 */
export function EncabezadoInicio({ rol, titulo, onCerrarSesion, anchoMaximo }: Props) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.encabezado, { paddingTop: insets.top + 16 }]}>
      <ContenedorAncho anchoMaximo={anchoMaximo}>
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
              <Text style={styles.rol}>{rol}</Text>
              <Text style={styles.titulo}>{titulo}</Text>
            </View>
          </View>
          <Pressable style={styles.botonCerrarSesion} onPress={onCerrarSesion}>
            <Ionicons name="log-out-outline" size={15} color={COLORES_ADMIN.textoInverso} />
            <Text style={styles.cerrarSesion}>Cerrar sesión</Text>
          </Pressable>
        </View>
      </ContenedorAncho>
    </View>
  );
}

const styles = StyleSheet.create({
  encabezado: {
    backgroundColor: COLORES_ADMIN.vino,
    paddingHorizontal: 20,
    paddingBottom: 16,
  },
  fila: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 10,
  },
  marca: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  logo: {
    width: 40,
    height: 40,
    borderRadius: RADII_ADMIN.sm,
    backgroundColor: COLORES_ADMIN.superficieMasBaja,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 4,
  },
  logoImagen: {
    width: '100%',
    height: '100%',
  },
  rol: {
    fontSize: 10,
    fontFamily: TIPOGRAFIA_ADMIN.semiNegrita,
    color: COLORES_ADMIN.dorado,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  titulo: {
    ...TEXTO_ADMIN.tituloSeccion,
    color: COLORES_ADMIN.textoInverso,
  },
  botonCerrarSesion: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
    borderRadius: RADII_ADMIN.pill,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  cerrarSesion: {
    ...TEXTO_ADMIN.boton,
    color: COLORES_ADMIN.textoInverso,
  },
});
