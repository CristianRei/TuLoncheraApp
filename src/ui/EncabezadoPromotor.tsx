import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { COLORES, TEXTO_PROMOTOR } from './colores';
import { ContenedorAncho } from './ContenedorAncho';
import { ANCHO_ADMIN, ESPACIADO_ADMIN } from './tema';

interface Props {
  titulo: string;
  /** Bajada debajo del título (ej. instrucción corta de la pantalla). */
  subtitulo?: string;
  /** 'close' en pantallas que se cancelan (formularios), 'chevron-back' en el resto. */
  iconoVolver?: 'chevron-back' | 'close';
  onVolver?: () => void;
  volverDeshabilitado?: boolean;
  accion?: { icono: keyof typeof Ionicons.glyphMap; etiqueta: string; onPress: () => void };
}

/**
 * Encabezado estándar de promotor — misma estructura que `Encabezado` de
 * admin, en dorado de marca y con botones de 44px (se toca de pie, con una
 * mano). Volver a la izquierda, título centrado, acción opcional a la derecha.
 */
export function EncabezadoPromotor({
  titulo,
  subtitulo,
  iconoVolver = 'chevron-back',
  onVolver,
  volverDeshabilitado,
  accion,
}: Props) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.encabezado, { paddingTop: insets.top + ESPACIADO_ADMIN.md }]}>
      <ContenedorAncho anchoMaximo={ANCHO_ADMIN.formulario}>
        <View style={styles.fila}>
          <Pressable
            onPress={onVolver ?? (() => router.back())}
            style={styles.botonIcono}
            disabled={volverDeshabilitado}
            accessibilityRole="button"
            accessibilityLabel={iconoVolver === 'close' ? 'Cancelar' : 'Volver'}
          >
            <Ionicons name={iconoVolver} size={24} color={COLORES.textoSobreOscuro} />
          </Pressable>
          <Text style={styles.titulo} numberOfLines={1}>
            {titulo}
          </Text>
          {accion ? (
            <Pressable
              onPress={accion.onPress}
              style={styles.botonIcono}
              accessibilityRole="button"
              accessibilityLabel={accion.etiqueta}
            >
              <Ionicons name={accion.icono} size={26} color={COLORES.textoSobreOscuro} />
            </Pressable>
          ) : (
            <View style={styles.botonIcono} />
          )}
        </View>
        {subtitulo && <Text style={styles.subtitulo}>{subtitulo}</Text>}
      </ContenedorAncho>
    </View>
  );
}

const styles = StyleSheet.create({
  encabezado: {
    backgroundColor: COLORES.primario,
    paddingHorizontal: ESPACIADO_ADMIN.md,
    paddingBottom: ESPACIADO_ADMIN.md,
  },
  fila: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  botonIcono: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  titulo: {
    ...TEXTO_PROMOTOR.tituloSeccion,
    flex: 1,
    textAlign: 'center',
    color: COLORES.textoSobreOscuro,
  },
  subtitulo: {
    ...TEXTO_PROMOTOR.cuerpoSecundario,
    color: COLORES.textoSobreOscuro,
    textAlign: 'center',
    paddingHorizontal: ESPACIADO_ADMIN.lg,
  },
});
