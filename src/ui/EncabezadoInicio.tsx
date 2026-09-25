import Ionicons from '@expo/vector-icons/Ionicons';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { COLORES, TEXTO_PROMOTOR } from './colores';
import { ContenedorAncho } from './ContenedorAncho';
import { COLORES_ADMIN, RADII_ADMIN, TEXTO_ADMIN, TIPOGRAFIA_ADMIN } from './tema';

interface Props {
  /** Rol en mayúsculas sobre el nombre (ej. "Bodega"). */
  rol: string;
  /** Línea principal: nombre de la persona o de la app. */
  titulo: string;
  onCerrarSesion: () => void;
  anchoMaximo: number;
  /** 'promotor': franja dorada de marca y texto café, en vez de vino. */
  variante?: 'admin' | 'promotor';
  /** Botones de ícono extra antes de "cerrar sesión" (ej. calendario). */
  acciones?: { icono: keyof typeof Ionicons.glyphMap; etiqueta: string; onPress: () => void }[];
}

/**
 * Encabezado de la pantalla de inicio de un rol (logo + rol + nombre +
 * cerrar sesión) — el mismo del menú de admin, para que Bodega arranque
 * igual. Las subpantallas usan `Encabezado`.
 */
export function EncabezadoInicio({
  rol,
  titulo,
  onCerrarSesion,
  anchoMaximo,
  variante = 'admin',
  acciones = [],
}: Props) {
  const insets = useSafeAreaInsets();
  const promotor = variante === 'promotor';
  const colorTexto = promotor ? COLORES.textoSobreOscuro : COLORES_ADMIN.textoInverso;
  return (
    <View style={[styles.encabezado, promotor && estilosPromotor.encabezado, { paddingTop: insets.top + 16 }]}>
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
              <Text style={[styles.rol, promotor && estilosPromotor.rol]}>{rol}</Text>
              <Text style={[styles.titulo, promotor && estilosPromotor.titulo]} numberOfLines={1}>
                {titulo}
              </Text>
            </View>
          </View>
          <View style={styles.acciones}>
            {acciones.map((a) => (
              <Pressable
                key={a.etiqueta}
                style={[styles.botonIcono, promotor && estilosPromotor.boton]}
                onPress={a.onPress}
                accessibilityRole="button"
                accessibilityLabel={a.etiqueta}
              >
                <Ionicons name={a.icono} size={20} color={colorTexto} />
              </Pressable>
            ))}
            <Pressable
              style={[styles.botonCerrarSesion, promotor && estilosPromotor.boton]}
              onPress={onCerrarSesion}
              accessibilityRole="button"
              accessibilityLabel="Cerrar sesión"
            >
              <Ionicons name="log-out-outline" size={15} color={colorTexto} />
              <Text style={[styles.cerrarSesion, { color: colorTexto }]}>Salir</Text>
            </Pressable>
          </View>
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
    flexShrink: 1,
  },
  acciones: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  botonIcono: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: RADII_ADMIN.pill,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
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
    height: 40,
  },
  cerrarSesion: {
    ...TEXTO_ADMIN.boton,
    color: COLORES_ADMIN.textoInverso,
  },
});

const estilosPromotor = StyleSheet.create({
  encabezado: {
    backgroundColor: COLORES.primario,
  },
  rol: {
    color: COLORES.oscuro,
  },
  titulo: {
    ...TEXTO_PROMOTOR.tituloSeccion,
    color: COLORES.textoSobreOscuro,
  },
  boton: {
    backgroundColor: 'rgba(255,255,255,0.35)',
    borderColor: 'rgba(58,36,0,0.15)',
  },
});
