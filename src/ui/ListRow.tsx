import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { COLORES_ADMIN, ESPACIADO_ADMIN, RADII_ADMIN, TEXTO_ADMIN, TIPOGRAFIA_ADMIN } from './tema';

interface Props {
  titulo: string;
  subtitulo?: string;
  badge?: string;
  /** Cifra principal de la fila (ej. total de la venta), a la derecha — nunca se corta. */
  valor?: string;
  onPress: () => void;
}

/**
 * Fila de lista genérica de admin — reemplaza el `fila`/`filaTexto`/
 * `filaNombre` que cada pantalla index.tsx redefinía desde cero, con radios
 * y sombra distintos según si venía de la paleta legado (14px + drop
 * shadow) o de COLORES_ADMIN (12px, sin sombra). Un solo estilo: plano,
 * borde 1px, sin sombra — filosofía de COLORES_ADMIN.
 */
export function ListRow({ titulo, subtitulo, badge, valor, onPress }: Props) {
  return (
    <Pressable style={styles.fila} onPress={onPress} accessibilityRole="button">
      <View style={styles.texto}>
        <View style={styles.tituloFila}>
          <Text style={styles.titulo} numberOfLines={1}>
            {titulo}
          </Text>
          {badge && (
            <View style={styles.badge}>
              <Text style={styles.badgeTexto}>{badge}</Text>
            </View>
          )}
        </View>
        {subtitulo && (
          <Text style={styles.subtitulo} numberOfLines={2}>
            {subtitulo}
          </Text>
        )}
      </View>
      {valor && <Text style={styles.valor}>{valor}</Text>}
      <Ionicons name="chevron-forward" size={18} color={COLORES_ADMIN.textoSecundario} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fila: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: COLORES_ADMIN.superficieMasBaja,
    borderRadius: RADII_ADMIN.md,
    borderWidth: 1,
    borderColor: COLORES_ADMIN.bordeSuave,
    padding: ESPACIADO_ADMIN.md,
    minHeight: 56,
    gap: ESPACIADO_ADMIN.md,
  },
  texto: {
    flex: 1,
    gap: 2,
  },
  tituloFila: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: ESPACIADO_ADMIN.sm,
    flexWrap: 'wrap',
  },
  titulo: {
    fontSize: 15,
    fontFamily: TIPOGRAFIA_ADMIN.semiNegrita,
    color: COLORES_ADMIN.texto,
  },
  subtitulo: {
    fontSize: 12,
    fontFamily: TIPOGRAFIA_ADMIN.regular,
    color: COLORES_ADMIN.textoSecundario,
  },
  valor: {
    ...TEXTO_ADMIN.datoDestacado,
    fontSize: 14,
  },
  badge: {
    backgroundColor: COLORES_ADMIN.superficieBaja,
    borderRadius: RADII_ADMIN.sm,
    paddingHorizontal: ESPACIADO_ADMIN.sm,
    paddingVertical: 2,
  },
  badgeTexto: {
    fontSize: 10,
    fontFamily: TIPOGRAFIA_ADMIN.semiNegrita,
    color: COLORES_ADMIN.vino,
    textTransform: 'uppercase',
  },
});
