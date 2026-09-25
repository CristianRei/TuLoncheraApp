import { Pressable, StyleSheet, Text, View } from 'react-native';

import { COLORES_ADMIN, ESPACIADO_ADMIN, RADII_ADMIN, TEXTO_ADMIN } from './tema';

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
 * Tabs de filtro (ej. Activos/Inactivos, Vigentes/Vencidos) — mismo aspecto
 * que el control de período del Dashboard (grupo unido sobre fondo común),
 * para que todos los filtros de admin se vean iguales.
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
    gap: ESPACIADO_ADMIN.xs,
    backgroundColor: COLORES_ADMIN.superficieBaja,
    padding: ESPACIADO_ADMIN.xs,
    borderRadius: RADII_ADMIN.sm,
    alignSelf: 'flex-start',
  },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: ESPACIADO_ADMIN.xs,
    paddingHorizontal: ESPACIADO_ADMIN.md,
    paddingVertical: 7,
    borderRadius: RADII_ADMIN.sm,
  },
  tabActivo: {
    backgroundColor: COLORES_ADMIN.vino,
  },
  tabTexto: {
    ...TEXTO_ADMIN.boton,
  },
  tabTextoActivo: {
    color: COLORES_ADMIN.textoInverso,
  },
});
