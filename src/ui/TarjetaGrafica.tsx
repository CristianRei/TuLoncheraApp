import { StyleSheet, Text, View, type ViewStyle } from 'react-native';

import { COLORES_ADMIN, ESPACIADO_ADMIN, RADII_ADMIN, TEXTO_ADMIN } from './tema';

interface Props {
  children: React.ReactNode;
  /** Qué mide la gráfica (ej. "Ticket promedio por evento, por temporada"). */
  leyenda?: string;
  /** Nota al pie: cobertura parcial, datos omitidos, cómo leer el dato. */
  nota?: string;
  style?: ViewStyle;
}

/**
 * Contenedor estándar de una gráfica o bloque de datos: superficie, borde y
 * padding iguales en toda la app, con la leyenda arriba y la nota al pie
 * siempre en el mismo lugar. Antes cada pantalla armaba su propia `tarjeta`
 * con radios entre 12 y 18 y la leyenda en tamaños distintos.
 *
 * La `nota` existe para que una gráfica nunca oculte en silencio lo que deja
 * fuera (CLAUDE.md §8): cobertura parcial, elementos omitidos del top, o qué
 * NO se puede concluir del dato.
 */
export function TarjetaGrafica({ children, leyenda, nota, style }: Props) {
  return (
    <View style={[styles.tarjeta, style]}>
      {leyenda && <Text style={styles.leyenda}>{leyenda}</Text>}
      {children}
      {nota && <Text style={styles.nota}>{nota}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  tarjeta: {
    backgroundColor: COLORES_ADMIN.superficieMasBaja,
    borderRadius: RADII_ADMIN.lg,
    borderWidth: 1,
    borderColor: COLORES_ADMIN.bordeSuave,
    padding: ESPACIADO_ADMIN.lg,
    gap: ESPACIADO_ADMIN.md,
  },
  leyenda: TEXTO_ADMIN.etiqueta,
  nota: TEXTO_ADMIN.cuerpoSecundario,
});
