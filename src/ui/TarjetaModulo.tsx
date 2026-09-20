import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { COLORES_ADMIN, TIPOGRAFIA_ADMIN } from './tema';

interface Props {
  icono: keyof typeof Ionicons.glyphMap;
  titulo: string;
  descripcion: string;
  badge?: string;
  destacada?: boolean;
  ancha?: boolean;
  onPress: () => void;
}

export function TarjetaModulo({
  icono,
  titulo,
  descripcion,
  badge,
  destacada,
  ancha,
  onPress,
}: Props) {
  return (
    <Pressable
      style={[styles.tarjeta, ancha && styles.tarjetaAncha, destacada && styles.tarjetaDestacada]}
      onPress={onPress}
    >
      <View style={[styles.icono, destacada && styles.iconoDestacado]}>
        <Ionicons name={icono} size={22} color={destacada ? '#FFFFFF' : COLORES_ADMIN.vino} />
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
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORES_ADMIN.bordeSuave,
    padding: 16,
    gap: 14,
  },
  tarjetaAncha: {
    width: '48%',
  },
  tarjetaDestacada: {
    borderWidth: 1.5,
    borderColor: COLORES_ADMIN.dorado,
    backgroundColor: '#FFFBF3',
  },
  icono: {
    width: 44,
    height: 44,
    borderRadius: 10,
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
