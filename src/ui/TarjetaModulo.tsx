import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { COLORES_ADMIN, ESTADO_ADMIN, RADII_ADMIN, TEXTO_ADMIN, TIPOGRAFIA_ADMIN } from './tema';

interface Props {
  icono: keyof typeof Ionicons.glyphMap;
  titulo: string;
  descripcion: string;
  badge?: string;
  destacada?: boolean;
  ancha?: boolean;
  /** Celular: baldosa vertical de media columna (ícono + título), sin descripción. */
  compacta?: boolean;
  onPress: () => void;
}

export function TarjetaModulo({
  icono,
  titulo,
  descripcion,
  badge,
  destacada,
  ancha,
  compacta,
  onPress,
}: Props) {
  if (compacta) {
    return (
      <Pressable
        style={[styles.baldosa, destacada && styles.tarjetaDestacada]}
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={titulo}
        accessibilityHint={descripcion}
      >
        <View style={styles.baldosaSuperior}>
          <View style={[styles.icono, destacada && styles.iconoDestacado]}>
            <Ionicons name={icono} size={22} color={destacada ? COLORES_ADMIN.textoInverso : COLORES_ADMIN.vino} />
          </View>
          {badge && (
            <View style={[styles.badge, destacada && styles.badgeDestacado]}>
              <Text style={[styles.badgeTexto, destacada && styles.badgeTextoDestacado]} numberOfLines={1}>
                {badge}
              </Text>
            </View>
          )}
        </View>
        <Text style={styles.baldosaTitulo} numberOfLines={2}>
          {titulo}
        </Text>
      </Pressable>
    );
  }
  return (
    <Pressable
      style={[styles.tarjeta, ancha && styles.tarjetaAncha, destacada && styles.tarjetaDestacada]}
      onPress={onPress}
    >
      <View style={[styles.icono, destacada && styles.iconoDestacado]}>
        <Ionicons name={icono} size={22} color={destacada ? COLORES_ADMIN.textoInverso : COLORES_ADMIN.vino} />
      </View>
      <View style={styles.texto}>
        <View style={styles.tituloFila}>
          <Text style={styles.titulo}>{titulo}</Text>
          {badge && (
            <View style={[styles.badge, destacada && styles.badgeDestacado]}>
              <Text style={[styles.badgeTexto, destacada && styles.badgeTextoDestacado]}>
                {badge}
              </Text>
            </View>
          )}
        </View>
        <Text style={styles.descripcion}>{descripcion}</Text>
      </View>
      <Ionicons
        name="chevron-forward"
        size={18}
        color={destacada ? COLORES_ADMIN.vino : COLORES_ADMIN.textoSecundario}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  tarjeta: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORES_ADMIN.superficieMasBaja,
    borderRadius: RADII_ADMIN.md,
    borderWidth: 1,
    borderColor: COLORES_ADMIN.bordeSuave,
    padding: 16,
    gap: 14,
  },
  baldosa: {
    width: '48.5%',
    minHeight: 112,
    backgroundColor: COLORES_ADMIN.superficieMasBaja,
    borderRadius: RADII_ADMIN.md,
    borderWidth: 1,
    borderColor: COLORES_ADMIN.bordeSuave,
    padding: 14,
    justifyContent: 'space-between',
    gap: 10,
  },
  baldosaSuperior: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 6,
  },
  baldosaTitulo: {
    ...TEXTO_ADMIN.tituloTarjeta,
    fontSize: 14,
    lineHeight: 18,
  },
  tarjetaAncha: {
    width: '48%',
  },
  tarjetaDestacada: {
    borderWidth: 1.5,
    borderColor: COLORES_ADMIN.dorado,
    backgroundColor: ESTADO_ADMIN.alerta.fondo,
  },
  icono: {
    width: 44,
    height: 44,
    borderRadius: RADII_ADMIN.sm,
    backgroundColor: COLORES_ADMIN.superficie,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  iconoDestacado: {
    backgroundColor: COLORES_ADMIN.dorado,
  },
  texto: {
    flex: 1,
    gap: 3,
  },
  tituloFila: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  titulo: {
    fontSize: 15,
    fontFamily: TIPOGRAFIA_ADMIN.semiNegrita,
    color: COLORES_ADMIN.texto,
  },
  descripcion: {
    fontSize: 13,
    fontFamily: TIPOGRAFIA_ADMIN.regular,
    color: COLORES_ADMIN.textoSecundario,
    lineHeight: 18,
  },
  badge: {
    backgroundColor: COLORES_ADMIN.superficie,
    borderRadius: 4,
    flexShrink: 1,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  badgeDestacado: {
    backgroundColor: COLORES_ADMIN.dorado,
  },
  badgeTexto: {
    fontSize: 10,
    fontFamily: TIPOGRAFIA_ADMIN.semiNegrita,
    color: COLORES_ADMIN.textoSecundario,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  badgeTextoDestacado: {
    color: COLORES_ADMIN.vino,
  },
});
