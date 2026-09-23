import { Pressable, StyleSheet, Text, View } from 'react-native';

import { COLORES_ADMIN, ESPACIADO_ADMIN, RADII_ADMIN, TIPOGRAFIA_ADMIN } from './tema';

interface Opcion<T extends string> {
  valor: T;
  etiqueta: string;
}

interface Props<T extends string> {
  opciones: Opcion<T>[];
  /** null cuando todavía no hay selección (ej. selector de rol antes de elegir uno). */
  valorActivo: T | null;
  onCambiar: (valor: T) => void;
}

/**
 * Tabs de filtro (ej. Activos/Inactivos, Vigentes/Vencidos) — ya era el
 * elemento más consistente entre pantallas (radio 20 en casi todas),
 * formalizado aquí como componente único en vez de repetirlo en cada
 * StyleSheet.
 */
export function FilterTabs<T extends string>({ opciones, valorActivo, onCambiar }: Props<T>) {
  return (
    <View style={styles.tabs}>
      {opciones.map((opcion) => {
        const activo = opcion.valor === valorActivo;
        return (
          <Pressable
            key={opcion.valor}
            style={[styles.tab, activo && styles.tabActivo]}
            onPress={() => onCambiar(opcion.valor)}
          >
            <Text style={[styles.tabTexto, activo && styles.tabTextoActivo]}>{opcion.etiqueta}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  tabs: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: ESPACIADO_ADMIN.sm,
  },
  tab: {
    paddingHorizontal: ESPACIADO_ADMIN.lg,
    paddingVertical: ESPACIADO_ADMIN.sm,
    borderRadius: RADII_ADMIN.pill,
    backgroundColor: COLORES_ADMIN.superficieMasBaja,
    borderWidth: 1,
    borderColor: COLORES_ADMIN.bordeSuave,
  },
  tabActivo: {
    backgroundColor: COLORES_ADMIN.vino,
    borderColor: COLORES_ADMIN.vino,
  },
  tabTexto: {
    fontSize: 13,
    fontFamily: TIPOGRAFIA_ADMIN.medio,
    color: COLORES_ADMIN.textoSecundario,
  },
  tabTextoActivo: {
    color: '#FFFFFF',
    fontFamily: TIPOGRAFIA_ADMIN.semiNegrita,
  },
});
