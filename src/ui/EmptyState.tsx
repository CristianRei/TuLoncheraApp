import Ionicons from '@expo/vector-icons/Ionicons';
import { StyleSheet, Text, View } from 'react-native';

import { COLORES_ADMIN, ESPACIADO_ADMIN, TIPOGRAFIA_ADMIN } from './tema';

interface Props {
  mensaje: string;
  icono?: keyof typeof Ionicons.glyphMap;
}

/**
 * Mensaje de estado vacío — reemplaza el estilo `vacio` copiado (mismo
 * triple {fontSize:14, color:'#888', textAlign:'center'}) en 20+ pantallas.
 */
export function EmptyState({ mensaje, icono }: Props) {
  return (
    <View style={styles.contenedor}>
      {icono && <Ionicons name={icono} size={28} color={COLORES_ADMIN.bordeSuave} />}
      <Text style={styles.texto}>{mensaje}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  contenedor: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: ESPACIADO_ADMIN.sm,
    padding: ESPACIADO_ADMIN.xxl,
  },
  texto: {
    fontSize: 14,
    fontFamily: TIPOGRAFIA_ADMIN.regular,
    color: COLORES_ADMIN.textoSecundario,
    textAlign: 'center',
  },
});
