import { StyleSheet, Text, View } from 'react-native';

import { ESPACIADO_ADMIN, ESTADO_ADMIN, RADII_ADMIN, TEXTO_ADMIN } from './tema';

export type EstadoInsignia = keyof typeof ESTADO_ADMIN;

interface Props {
  texto: string;
  estado?: EstadoInsignia;
}

/**
 * Insignia de estado (Entregado / Pendiente / Cancelado / En curso...) — el
 * trío fondo+borde+texto salía hardcodeado y distinto en cada pantalla
 * (#EAF5EA aquí, #FEF6E7 allá, #B00020 en vez de la paleta), así que el
 * mismo estado no se veía igual en Cargue que en Turnos.
 */
export function Insignia({ texto, estado = 'neutro' }: Props) {
  const color = ESTADO_ADMIN[estado];
  return (
    <View style={[styles.insignia, { backgroundColor: color.fondo, borderColor: color.borde }]}>
      <Text style={[styles.texto, { color: color.texto }]}>{texto}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  insignia: {
    borderRadius: RADII_ADMIN.sm - 4,
    borderWidth: 1,
    paddingHorizontal: ESPACIADO_ADMIN.sm,
    paddingVertical: 2,
    alignSelf: 'flex-start',
  },
  texto: TEXTO_ADMIN.etiqueta,
});
