import type { ReactNode } from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';

import { ANCHO_ADMIN } from './tema';

interface Props {
  children: ReactNode;
  /** Ancho máximo del contenido en pantallas grandes. Default: cómodo para lectura de listas/formularios. */
  anchoMaximo?: number;
  style?: ViewStyle;
  /** El contenido tiene una lista/scroll que debe llenar el alto disponible (ej. envuelve un FlatList con flex: 1). */
  llenarAlto?: boolean;
}

/**
 * Centra el contenido con un ancho máximo cuando la pantalla es más ancha
 * que ese límite (tablet, monitor de admin/bodega) — en celular no hace
 * nada, `width` real siempre es menor al límite. Evita que tarjetas y
 * formularios pensados para celular se estiren de borde a borde en
 * pantallas grandes.
 */
export function ContenedorAncho({ children, anchoMaximo = ANCHO_ADMIN.lista, style, llenarAlto }: Props) {
  return (
    <View style={[styles.centrador, llenarAlto && styles.llenarAlto]}>
      <View
        style={[
          { width: '100%', maxWidth: anchoMaximo },
          llenarAlto && styles.llenarAlto,
          style,
        ]}
      >
        {children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  centrador: {
    width: '100%',
    alignItems: 'center',
  },
  llenarAlto: {
    flex: 1,
  },
});
