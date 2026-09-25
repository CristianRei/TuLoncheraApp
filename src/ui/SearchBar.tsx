import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { COLORES_ADMIN, ESPACIADO_ADMIN, RADII_ADMIN, TEXTO_ADMIN } from './tema';

interface Props {
  valor: string;
  onCambiar: (texto: string) => void;
  placeholder?: string;
}

/** Buscador de admin — mismo aspecto que los selectores del panel de filtros del Dashboard. */
export function SearchBar({ valor, onCambiar, placeholder = 'Buscar...' }: Props) {
  return (
    <View style={styles.caja}>
      <Ionicons name="search-outline" size={15} color={COLORES_ADMIN.textoSecundario} />
      <TextInput
        style={styles.input}
        placeholder={placeholder}
        placeholderTextColor={COLORES_ADMIN.textoSecundario}
        value={valor}
        onChangeText={onCambiar}
      />
      {valor.length > 0 && (
        <Pressable onPress={() => onCambiar('')} hitSlop={8}>
          <Ionicons name="close-circle" size={16} color={COLORES_ADMIN.textoSecundario} />
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  caja: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: ESPACIADO_ADMIN.sm,
    backgroundColor: COLORES_ADMIN.superficieBaja,
    borderWidth: 1,
    borderColor: COLORES_ADMIN.superficie,
    borderRadius: RADII_ADMIN.sm,
    paddingHorizontal: ESPACIADO_ADMIN.md,
  },
  input: {
    ...TEXTO_ADMIN.cuerpo,
    flex: 1,
    paddingVertical: 9,
  },
});
