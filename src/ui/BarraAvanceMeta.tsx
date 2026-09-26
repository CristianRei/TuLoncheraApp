import { useEffect, useState } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';

import { formatearPesos } from '@/core/dinero';
import type { Pesos } from '@/core/tipos';

import { aRgb, PARADAS, rgbEnFraccion } from './BarraMetaDiaria';
import { COLORES_ADMIN, TIPOGRAFIA_ADMIN } from './tema';

/**
 * Barra de cumplimiento de la meta del día, versión admin (compacta, con la
 * paleta de admin): la misma escala de rojo a verde que ve el promotor en
 * `BarraMetaDiaria`, para que los dos lean el mismo color con el mismo avance.
 */
export function BarraAvanceMeta({
  vendido,
  meta,
  etiqueta,
  grande = false,
}: {
  vendido: Pesos;
  meta: Pesos;
  /** Ej. "Meta del equipo" o "Meta del día". */
  etiqueta: string;
  grande?: boolean;
}) {
  const fraccion = meta > 0 ? Math.min(1, vendido / meta) : 0;
  const pct = meta > 0 ? Math.round((vendido / meta) * 100) : 0;
  const [avance] = useState(() => new Animated.Value(0));

  useEffect(() => {
    Animated.timing(avance, {
      toValue: fraccion,
      duration: 800,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false, // anima ancho y color
    }).start();
  }, [avance, fraccion]);

  const colorTexto = aRgb(rgbEnFraccion(fraccion).map((c) => Math.round(c * 0.78)) as [number, number, number]);

  return (
    <View style={styles.contenedor} accessible accessibilityLabel={`${etiqueta}: ${pct} por ciento`}>
      <View style={styles.fila}>
        <Text style={styles.etiqueta}>{etiqueta}</Text>
        <Text style={[grande ? styles.pctGrande : styles.pct, { color: colorTexto }]}>{pct}%</Text>
      </View>
      <View style={[styles.pista, grande && styles.pistaGrande]}>
        <Animated.View
          style={[
            styles.relleno,
            {
              width: avance.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }),
              backgroundColor: avance.interpolate({
                inputRange: PARADAS.map((p) => p.en),
                outputRange: PARADAS.map((p) => aRgb(p.rgb)),
              }),
            },
          ]}
        />
      </View>
      <Text style={styles.detalle}>
        {formatearPesos(vendido)} de {formatearPesos(meta)}
        {vendido >= meta ? ' · ¡Cumplida!' : ` · faltan ${formatearPesos(meta - vendido)}`}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  contenedor: { gap: 4 },
  fila: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  etiqueta: {
    fontSize: 11,
    fontFamily: TIPOGRAFIA_ADMIN.semiNegrita,
    color: COLORES_ADMIN.textoSecundario,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  pct: { fontSize: 16, fontFamily: TIPOGRAFIA_ADMIN.monoSemiNegrita },
  pctGrande: { fontSize: 26, fontFamily: TIPOGRAFIA_ADMIN.monoSemiNegrita },
  pista: { height: 10, borderRadius: 5, backgroundColor: COLORES_ADMIN.superficie, overflow: 'hidden' },
  pistaGrande: { height: 16, borderRadius: 8 },
  relleno: { height: '100%', borderRadius: 8 },
  detalle: { fontSize: 12, fontFamily: TIPOGRAFIA_ADMIN.monoRegular, color: COLORES_ADMIN.textoSecundario },
});
