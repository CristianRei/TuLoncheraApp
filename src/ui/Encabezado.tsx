import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ContenedorAncho } from './ContenedorAncho';
import { ANCHO_ADMIN, COLORES_ADMIN, ESPACIADO_ADMIN, RADII_ADMIN, TEXTO_ADMIN } from './tema';
import { useEsPantallaAncha } from './useEsPantallaAncha';

interface Accion {
  icono: keyof typeof Ionicons.glyphMap;
  texto?: string;
  onPress: () => void;
}

interface Props {
  titulo: string;
  /** Texto del enlace de volver en celular (ej. "Admin", "Personal"). Se omite el botón si no se pasa. */
  rutaVolverTexto?: string;
  /** Override del comportamiento por defecto (router.back()) al tocar "volver". */
  onVolver?: () => void;
  /** Botón de acción a la derecha del título (ej. "+ Nuevo"). Un solo estilo, sin variantes. */
  accion?: Accion;
  anchoMaximo?: number;
  /**
   * true en roles sin sidebar (Bodega): la franja vino con botón de volver se
   * mantiene también en pantalla ancha, porque no hay otra forma de volver.
   */
  sinMenuLateral?: boolean;
}

/**
 * Encabezado estándar de admin — reemplaza la franja vino/oscura que cada
 * pantalla hand-rolleaba con su propio back-button y botón de acción. En
 * pantalla ancha (≥768px), la barra global (BarraSuperiorAdmin) ya cubre el
 * logo y el branding, así que aquí el fondo queda transparente, sin botón
 * de volver (el sidebar cumple esa función) y el título en color oscuro. En
 * celular, franja vino de siempre con botón de volver.
 */
export function Encabezado({
  titulo,
  rutaVolverTexto,
  onVolver,
  accion,
  anchoMaximo = ANCHO_ADMIN.lista,
  sinMenuLateral = false,
}: Props) {
  const insets = useSafeAreaInsets();
  const anchaPantalla = useEsPantallaAncha() && !sinMenuLateral;

  return (
    <View
      style={[
        anchaPantalla ? styles.encabezadoAncho : styles.encabezado,
        { paddingTop: anchaPantalla ? ESPACIADO_ADMIN.xl : insets.top + ESPACIADO_ADMIN.md },
      ]}
    >
      <ContenedorAncho anchoMaximo={anchoMaximo}>
        <View style={styles.fila}>
          <View style={styles.izquierda}>
            {!anchaPantalla && rutaVolverTexto && (
              <Pressable
                onPress={onVolver ?? (() => router.back())}
                style={styles.botonVolver}
                hitSlop={4}
                accessibilityRole="button"
                accessibilityLabel={`Volver a ${rutaVolverTexto}`}
              >
                <Ionicons name="chevron-back" size={24} color={COLORES_ADMIN.textoInverso} />
              </Pressable>
            )}
            <Text style={anchaPantalla ? styles.tituloAncho : styles.titulo} numberOfLines={1}>
              {titulo}
            </Text>
          </View>
          {accion && (
            <Pressable
              style={[styles.botonAccion, !anchaPantalla && styles.botonAccionMovil]}
              onPress={accion.onPress}
              accessibilityRole="button"
            >
              <Ionicons name={accion.icono} size={16} color={COLORES_ADMIN.textoInverso} />
              {accion.texto && <Text style={styles.botonAccionTexto}>{accion.texto}</Text>}
            </Pressable>
          )}
        </View>
      </ContenedorAncho>
    </View>
  );
}

const styles = StyleSheet.create({
  encabezado: {
    backgroundColor: COLORES_ADMIN.vino,
    paddingHorizontal: ESPACIADO_ADMIN.lg,
    paddingBottom: ESPACIADO_ADMIN.md,
  },
  encabezadoAncho: {
    backgroundColor: 'transparent',
    paddingHorizontal: ESPACIADO_ADMIN.xl,
    paddingBottom: ESPACIADO_ADMIN.lg,
  },
  fila: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: ESPACIADO_ADMIN.sm,
  },
  izquierda: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: ESPACIADO_ADMIN.xs,
    flexShrink: 1,
  },
  botonVolver: {
    width: 40,
    height: 40,
    marginLeft: -ESPACIADO_ADMIN.sm,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: RADII_ADMIN.pill,
  },
  titulo: {
    ...TEXTO_ADMIN.tituloSeccion,
    fontSize: 18,
    flexShrink: 1,
    color: COLORES_ADMIN.textoInverso,
  },
  tituloAncho: {
    ...TEXTO_ADMIN.tituloPantalla,
    color: COLORES_ADMIN.vino,
  },
  botonAccion: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: ESPACIADO_ADMIN.xs,
    backgroundColor: COLORES_ADMIN.vino,
    borderRadius: RADII_ADMIN.pill,
    paddingHorizontal: ESPACIADO_ADMIN.md,
    paddingVertical: ESPACIADO_ADMIN.sm,
  },
  botonAccionMovil: {
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
    minHeight: 36,
  },
  botonAccionTexto: {
    ...TEXTO_ADMIN.boton,
    color: COLORES_ADMIN.textoInverso,
  },
});
