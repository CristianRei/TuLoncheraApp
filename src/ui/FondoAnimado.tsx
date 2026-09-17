import { useEffect } from 'react';
import { StyleSheet } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

/**
 * Formas suaves flotando de fondo (pantalla completa). Solo anima
 * `transform` (hilo de UI vía reanimated, sin recálculo de layout) para que
 * no le pese a celulares de gama baja.
 */
export function FondoFlotante({ color }: { color: string }) {
  const progreso1 = useSharedValue(0);
  const progreso2 = useSharedValue(0);

  useEffect(() => {
    progreso1.value = withRepeat(
      withTiming(1, { duration: 6500, easing: Easing.inOut(Easing.sin) }),
      -1,
      true
    );
    progreso2.value = withRepeat(
      withTiming(1, { duration: 8000, easing: Easing.inOut(Easing.sin) }),
      -1,
      true
    );
  }, [progreso1, progreso2]);

  const estilo1 = useAnimatedStyle(() => ({
    transform: [
      { translateX: progreso1.value * 26 },
      { translateY: progreso1.value * -20 },
    ],
  }));
  const estilo2 = useAnimatedStyle(() => ({
    transform: [
      { translateX: progreso2.value * -22 },
      { translateY: progreso2.value * 24 },
    ],
  }));

  return (
    <>
      <Animated.View
        style={[
          styles.blob,
          { width: 220, height: 220, top: -60, left: -70, backgroundColor: color },
          estilo1,
        ]}
      />
      <Animated.View
        style={[
          styles.blob,
          { width: 170, height: 170, bottom: -40, right: -50, backgroundColor: color },
          estilo2,
        ]}
      />
    </>
  );
}

/**
 * Círculo que "respira" (escala + opacidad en loop). No se posiciona a sí
 * mismo — quien lo use debe centrarlo con flexbox (`alignItems`/
 * `justifyContent: 'center'` en un contenedor absoluto), que es más
 * confiable en Android que centrar con `top/left: '50%'` + margen negativo.
 */
export function HaloResplandor({ color, tamano = 240 }: { color: string; tamano?: number }) {
  const progreso = useSharedValue(0);

  useEffect(() => {
    progreso.value = withRepeat(
      withTiming(1, { duration: 1600, easing: Easing.inOut(Easing.sin) }),
      -1,
      true
    );
  }, [progreso]);

  const estilo = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + progreso.value * 0.2 }],
    opacity: 0.18 + progreso.value * 0.18,
  }));

  return (
    <Animated.View
      style={[
        { width: tamano, height: tamano, borderRadius: tamano / 2, backgroundColor: color },
        estilo,
      ]}
      pointerEvents="none"
    />
  );
}

const styles = StyleSheet.create({
  blob: {
    position: 'absolute',
    borderRadius: 999,
    opacity: 0.14,
  },
});
