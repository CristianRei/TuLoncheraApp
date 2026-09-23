import { StyleSheet, TextInput } from 'react-native';

import { COLORES_ADMIN, ESPACIADO_ADMIN, RADII_ADMIN, TIPOGRAFIA_ADMIN } from './tema';

interface Props {
  valor: string;
  onCambiar: (texto: string) => void;
  placeholder?: string;
}

/** Input de búsqueda genérico de admin — antes cada pantalla elegía su propio radio (10 o 24). */
export function SearchBar({ valor, onCambiar, placeholder = 'Buscar...' }: Props) {
  return (
    <TextInput
      style={styles.input}
      placeholder={placeholder}
      placeholderTextColor={COLORES_ADMIN.textoSecundario}
      value={valor}
      onChangeText={onCambiar}
    />
  );
}

const styles = StyleSheet.create({
  input: {
    backgroundColor: COLORES_ADMIN.superficieMasBaja,
    borderRadius: RADII_ADMIN.pill,
    borderWidth: 1,
    borderColor: COLORES_ADMIN.bordeSuave,
    paddingHorizontal: ESPACIADO_ADMIN.lg,
    paddingVertical: ESPACIADO_ADMIN.sm + 2,
    fontSize: 15,
    fontFamily: TIPOGRAFIA_ADMIN.regular,
    color: COLORES_ADMIN.texto,
  },
});
