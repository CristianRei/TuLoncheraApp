import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { TecladoNumerico } from './TecladoNumerico';

interface Props {
  pin: string;
  largo?: number;
  onPresionar: (digito: string) => void;
  onBorrar: () => void;
  deshabilitado?: boolean;
  colorAcento: string;
  /** Cambiar este número (ej. incrementar un contador) dispara la sacudida de error. */
  intentoFallido?: number;
}

/**
 * Componente controlado: no guarda su propio estado, solo muestra el `pin`
 * recibido (indicador de puntos + teclado) y avisa cada pulsación.
 */
export function CampoPin({
  pin,
  largo = 4,
  onPresionar,
  onBorrar,
  deshabilitado,
  colorAcento,
  intentoFallido,
}: Props) {
  const desplazamiento = useSharedValue(0);

  useEffect(() => {
    if (!intentoFallido) return;
    desplazamiento.value = withSequence(
      withTiming(-10, { duration: 45 }),
      withTiming(10, { duration: 90 }),
      withTiming(-8, { duration: 90 }),
      withTiming(8, { duration: 90 }),
      withTiming(0, { duration: 60 })
    );
  }, [intentoFallido, desplazamiento]);

  const estiloSacudida = useAnimatedStyle(() => ({
    transform: [{ translateX: desplazamiento.value }],
  }));

  return (
    <View style={styles.contenedor}>
      <Animated.View style={[styles.puntos, estiloSacudida]}>
        {Array.from({ length: largo }).map((_, i) => (
          <View
            key={i}
            style={[
              styles.punto,
              { borderColor: colorAcento },
              i < pin.length && { backgroundColor: colorAcento },
            ]}
          />
        ))}
      </Animated.View>
      <TecladoNumerico
        onPresionar={onPresionar}
        onBorrar={onBorrar}
        deshabilitado={deshabilitado}
        colorAcento={colorAcento}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  contenedor: {
    alignItems: 'center',
    gap: 28,
  },
  puntos: {
    flexDirection: 'row',
    gap: 16,
  },
  punto: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1.5,
  },
});
