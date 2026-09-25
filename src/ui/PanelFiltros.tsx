import Ionicons from '@expo/vector-icons/Ionicons';
import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { COLORES_ADMIN, ESPACIADO_ADMIN, RADII_ADMIN, TEXTO_ADMIN } from './tema';

/**
 * Tarjeta de filtros estándar de admin — el patrón del Dashboard: fila
 * superior (período + acciones), fila de selectores y fila de "Filtros
 * aplicados". Cada módulo la arma con las piezas de este archivo en vez de
 * su propio StyleSheet.
 */
export function PanelFiltros({ children }: { children: ReactNode }) {
  return <View style={styles.tarjeta}>{children}</View>;
}

/** Fila superior con separador: control segmentado a la izquierda, acciones a la derecha. */
export function FilaFiltrosSuperior({
  children,
  acciones,
  separador = true,
}: {
  children?: ReactNode;
  acciones?: ReactNode;
  /** false cuando no hay nada debajo en la tarjeta (sin selectores). */
  separador?: boolean;
}) {
  return (
    <View style={[styles.filaSuperior, !separador && styles.filaSuperiorSinSeparador]}>
      <View style={styles.filaSuperiorIzquierda}>{children}</View>
      {acciones && <View style={styles.acciones}>{acciones}</View>}
    </View>
  );
}

/** Fila de selectores/buscador que se reparten el ancho. */
export function FilaSelectores({ children }: { children: ReactNode }) {
  return <View style={styles.filaSelectores}>{children}</View>;
}

export function SelectorFiltro({
  icono,
  etiqueta,
  valorTexto,
  onPress,
}: {
  icono: keyof typeof Ionicons.glyphMap;
  etiqueta: string;
  valorTexto: string;
  onPress: () => void;
}) {
  return (
    <View style={styles.selector}>
      <View style={styles.selectorEtiquetaFila}>
        <Ionicons name={icono} size={12} color={COLORES_ADMIN.dorado} />
        <Text style={styles.selectorEtiqueta}>{etiqueta}</Text>
      </View>
      <Pressable style={styles.selectorBoton} onPress={onPress}>
        <Text style={styles.selectorBotonTexto} numberOfLines={1}>
          {valorTexto}
        </Text>
        <Ionicons name="chevron-down" size={16} color={COLORES_ADMIN.textoSecundario} />
      </Pressable>
    </View>
  );
}

/** Envuelve cualquier control (ej. SearchBar) con la misma etiqueta que un SelectorFiltro. */
export function CampoFiltro({
  icono,
  etiqueta,
  children,
}: {
  icono: keyof typeof Ionicons.glyphMap;
  etiqueta: string;
  children: ReactNode;
}) {
  return (
    <View style={[styles.selector, styles.campoAncho]}>
      <View style={styles.selectorEtiquetaFila}>
        <Ionicons name={icono} size={12} color={COLORES_ADMIN.dorado} />
        <Text style={styles.selectorEtiqueta}>{etiqueta}</Text>
      </View>
      {children}
    </View>
  );
}

/** Botón secundario de la fila superior (Actualizar, Exportar...). */
export function AccionFiltro({
  icono,
  texto,
  onPress,
  deshabilitado,
  cargando,
}: {
  icono: keyof typeof Ionicons.glyphMap;
  texto: string;
  onPress: () => void;
  deshabilitado?: boolean;
  cargando?: boolean;
}) {
  return (
    <Pressable
      style={[styles.accion, deshabilitado && styles.accionDeshabilitada]}
      onPress={onPress}
      disabled={deshabilitado || cargando}
    >
      {cargando ? (
        <ActivityIndicator size="small" color={COLORES_ADMIN.textoSecundario} />
      ) : (
        <Ionicons name={icono} size={15} color={COLORES_ADMIN.textoSecundario} />
      )}
      <Text style={styles.accionTexto}>{texto}</Text>
    </Pressable>
  );
}

export interface FiltroAplicado {
  clave: string;
  texto: string;
  onQuitar: () => void;
}

/** "Filtros aplicados: [chip ×] [chip ×] Limpiar todos" — no renderiza nada si no hay filtros. */
export function FiltrosAplicados({ filtros, onLimpiar }: { filtros: FiltroAplicado[]; onLimpiar: () => void }) {
  if (filtros.length === 0) return null;
  return (
    <View style={styles.chipsFila}>
      <Text style={styles.chipsEtiqueta}>Filtros aplicados:</Text>
      {filtros.map((f) => (
        <View key={f.clave} style={styles.chip}>
          <Text style={styles.chipTexto}>{f.texto}</Text>
          <Pressable onPress={f.onQuitar} hitSlop={6}>
            <Ionicons name="close" size={13} color={COLORES_ADMIN.error} />
          </Pressable>
        </View>
      ))}
      <Pressable style={styles.limpiar} onPress={onLimpiar}>
        <Ionicons name="refresh-outline" size={13} color={COLORES_ADMIN.vino} />
        <Text style={styles.limpiarTexto}>Limpiar todos</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  tarjeta: {
    backgroundColor: COLORES_ADMIN.superficieMasBaja,
    borderRadius: RADII_ADMIN.md,
    borderWidth: 1,
    borderColor: COLORES_ADMIN.bordeSuave,
    padding: ESPACIADO_ADMIN.lg,
    gap: 14,
  },
  filaSuperior: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 10,
    paddingBottom: ESPACIADO_ADMIN.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORES_ADMIN.superficie,
  },
  filaSuperiorSinSeparador: {
    paddingBottom: 0,
    borderBottomWidth: 0,
  },
  filaSuperiorIzquierda: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 10,
  },
  acciones: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: ESPACIADO_ADMIN.sm,
  },
  filaSelectores: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  selector: {
    flex: 1,
    minWidth: 180,
    gap: ESPACIADO_ADMIN.xs,
  },
  campoAncho: {
    flexGrow: 2,
  },
  selectorEtiquetaFila: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: ESPACIADO_ADMIN.xs,
  },
  selectorEtiqueta: {
    ...TEXTO_ADMIN.etiqueta,
    letterSpacing: 0.5,
  },
  selectorBoton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: COLORES_ADMIN.superficieBaja,
    borderWidth: 1,
    borderColor: COLORES_ADMIN.superficie,
    borderRadius: RADII_ADMIN.sm,
    paddingHorizontal: ESPACIADO_ADMIN.md,
    paddingVertical: 9,
  },
  selectorBotonTexto: {
    ...TEXTO_ADMIN.boton,
    flex: 1,
    color: COLORES_ADMIN.vino,
  },
  accion: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 28,
    borderRadius: RADII_ADMIN.sm,
    backgroundColor: COLORES_ADMIN.superficieBaja,
    paddingHorizontal: 10,
  },
  accionDeshabilitada: {
    opacity: 0.5,
  },
  accionTexto: {
    ...TEXTO_ADMIN.boton,
  },
  chipsFila: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: ESPACIADO_ADMIN.sm,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: COLORES_ADMIN.superficie,
  },
  chipsEtiqueta: {
    ...TEXTO_ADMIN.boton,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: COLORES_ADMIN.superficie,
    borderWidth: 1,
    borderColor: COLORES_ADMIN.bordeSuave,
    borderRadius: RADII_ADMIN.lg,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  chipTexto: {
    ...TEXTO_ADMIN.boton,
  },
  limpiar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: ESPACIADO_ADMIN.xs,
    marginLeft: ESPACIADO_ADMIN.xs,
  },
  limpiarTexto: {
    ...TEXTO_ADMIN.boton,
    color: COLORES_ADMIN.vino,
  },
});
