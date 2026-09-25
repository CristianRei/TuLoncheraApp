import Ionicons from '@expo/vector-icons/Ionicons';
import { StyleSheet, Text, View } from 'react-native';

import { COLORES_ADMIN, ESPACIADO_ADMIN, TEXTO_ADMIN } from './tema';

interface Props {
  titulo: string;
  /** Bajada que explica qué muestra la sección y para qué sirve. */
  descripcion?: string;
  icono?: keyof typeof Ionicons.glyphMap;
  /** Separación superior — `false` para la primera sección de la pantalla. */
  espaciado?: boolean;
}

/**
 * Encabezado de una sección dentro de una pantalla (título + bajada) — antes
 * cada pantalla lo escribía a mano y el mismo nivel de jerarquía terminó con
 * 5 tamaños de fuente distintos (14, 15, 15.5, 16, 11.5).
 */
export function TituloSeccion({ titulo, descripcion, icono, espaciado = true }: Props) {
  return (
    <View style={[styles.contenedor, espaciado && styles.espaciado]}>
      <View style={styles.filaTitulo}>
        {icono && <Ionicons name={icono} size={18} color={COLORES_ADMIN.vino} />}
        <Text style={styles.titulo}>{titulo}</Text>
      </View>
      {descripcion && <Text style={styles.descripcion}>{descripcion}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  contenedor: {
    gap: ESPACIADO_ADMIN.xs,
  },
  espaciado: {
    marginTop: ESPACIADO_ADMIN.xl,
  },
  filaTitulo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: ESPACIADO_ADMIN.sm,
  },
  titulo: TEXTO_ADMIN.tituloSeccion,
  descripcion: TEXTO_ADMIN.subtituloSeccion,
});
