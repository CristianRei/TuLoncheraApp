import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { COLORES_ADMIN, ESPACIADO_ADMIN, RADII_ADMIN, TEXTO_ADMIN } from './tema';

interface Opcion<T extends string> {
  valor: T;
  etiqueta: string;
  /** Icono opcional a la izquierda de la etiqueta (ej. calendario en "Personalizado"). */
  icono?: keyof typeof Ionicons.glyphMap;
}

interface Props<T extends string> {
  opciones: Opcion<T>[];
  valorActivo: T;
  onCambiar: (valor: T) => void;
}

/**
 * Control segmentado (grupo de botones donde solo uno está activo) —
 * el patrón del filtro de período, que estaba re-implementado con su propio
 * StyleSheet en Turnos, Bitácora, Dashboard y Análisis, cada uno con radios
 * y tamaños ligeramente distintos.
 *
 * Genérico sobre el valor en vez de atado a `Periodo` (src/core/analitica):
 * Análisis usa su propia escala de períodos (30/90 días/todo) y así el mismo
 * control sirve para cualquier otro filtro de opción única.
 *
 * Distinto de `FilterTabs`: aquel son pastillas sueltas, este es un grupo
 * unido sobre un fondo común — se usa para escalas (períodos) más que para
 * categorías.
 */
export function FiltroSegmentado<T extends string>({ opciones, valorActivo, onCambiar }: Props<T>) {
  return (
    <View style={styles.grupo}>
      {opciones.map((opcion) => {
        const activo = opcion.valor === valorActivo;
        return (
          <Pressable
            key={opcion.valor}
            style={[styles.boton, activo && styles.botonActivo]}
            onPress={() => onCambiar(opcion.valor)}
          >
            {opcion.icono && (
              <Ionicons
                name={opcion.icono}
                size={13}
                color={activo ? '#FFFFFF' : COLORES_ADMIN.textoSecundario}
              />
            )}
            <Text style={[styles.texto, activo && styles.textoActivo]}>{opcion.etiqueta}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  grupo: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 2,
    backgroundColor: COLORES_ADMIN.superficieBaja,
    padding: 3,
    borderRadius: RADII_ADMIN.sm,
    borderWidth: 1,
    borderColor: COLORES_ADMIN.bordeSuave,
    alignSelf: 'flex-start',
  },
  boton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: ESPACIADO_ADMIN.xs,
    paddingHorizontal: ESPACIADO_ADMIN.md,
    paddingVertical: ESPACIADO_ADMIN.xs + 2,
    borderRadius: RADII_ADMIN.sm - 2,
  },
  botonActivo: {
    backgroundColor: COLORES_ADMIN.vino,
  },
  texto: {
    ...TEXTO_ADMIN.boton,
    fontFamily: TEXTO_ADMIN.cuerpo.fontFamily,
    fontSize: 12,
    color: COLORES_ADMIN.textoSecundario,
  },
  textoActivo: {
    color: '#FFFFFF',
    fontFamily: TEXTO_ADMIN.boton.fontFamily,
  },
});
