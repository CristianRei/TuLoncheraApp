import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { COLORES, TEXTO_PROMOTOR } from './colores';
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
  /** 'promotor': dorado de marca, letra y área táctil más grandes. */
  variante?: 'admin' | 'promotor';
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
export function FiltroSegmentado<T extends string>({
  opciones,
  valorActivo,
  onCambiar,
  variante = 'admin',
}: Props<T>) {
  const promotor = variante === 'promotor';
  const colorActivo = promotor ? COLORES.textoSobreOscuro : COLORES_ADMIN.textoInverso;
  return (
    <View style={[styles.grupo, promotor && estilosPromotor.grupo]}>
      {opciones.map((opcion) => {
        const activo = opcion.valor === valorActivo;
        return (
          <Pressable
            key={opcion.valor}
            style={[
              styles.boton,
              promotor && estilosPromotor.boton,
              activo && (promotor ? estilosPromotor.botonActivo : styles.botonActivo),
            ]}
            onPress={() => onCambiar(opcion.valor)}
            accessibilityRole="button"
            accessibilityState={{ selected: activo }}
          >
            {opcion.icono && (
              <Ionicons
                name={opcion.icono}
                size={13}
                color={activo ? colorActivo : COLORES_ADMIN.texto}
              />
            )}
            <Text
              style={[
                styles.texto,
                promotor && estilosPromotor.texto,
                activo && { color: colorActivo },
              ]}
            >
              {opcion.etiqueta}
            </Text>
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
    gap: ESPACIADO_ADMIN.xs,
    backgroundColor: COLORES_ADMIN.superficieBaja,
    padding: ESPACIADO_ADMIN.xs,
    borderRadius: RADII_ADMIN.sm,
    alignSelf: 'flex-start',
  },
  boton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: ESPACIADO_ADMIN.xs,
    paddingHorizontal: ESPACIADO_ADMIN.md,
    paddingVertical: 7,
    borderRadius: RADII_ADMIN.sm,
  },
  botonActivo: {
    backgroundColor: COLORES_ADMIN.vino,
  },
  texto: {
    ...TEXTO_ADMIN.boton,
  },
  textoActivo: {
    color: COLORES_ADMIN.textoInverso,
  },
});

const estilosPromotor = StyleSheet.create({
  grupo: {
    backgroundColor: COLORES.superficieBaja,
    alignSelf: 'stretch',
  },
  boton: {
    flex: 1,
    justifyContent: 'center',
    paddingVertical: ESPACIADO_ADMIN.sm + 2,
  },
  botonActivo: {
    backgroundColor: COLORES.primario,
  },
  texto: {
    ...TEXTO_PROMOTOR.boton,
  },
});
