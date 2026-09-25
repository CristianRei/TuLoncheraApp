import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useState } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';

import { formatearPesos } from '@/core/dinero';
import type { ProgresoMetaDiaria } from '@/db/metasDiarias';

import { COLORES, TIPOGRAFIA_PROMOTOR, TEXTO_PROMOTOR } from './colores';
import { RADII_ADMIN } from './tema';

type Rgb = [number, number, number];

/**
 * Del rojo (0 %) al verde (meta cumplida), pasando por naranja y ámbar — el
 * verde final es el mismo `COLORES.positivo` del resto de la app. La misma
 * escala pinta la barra mientras se llena (Animated) y el texto del
 * porcentaje, así nunca quedan de colores distintos.
 */
const PARADAS: { en: number; rgb: Rgb }[] = [
  { en: 0, rgb: [211, 47, 47] },
  { en: 0.4, rgb: [245, 124, 0] },
  { en: 0.7, rgb: [249, 168, 37] },
  { en: 0.85, rgb: [124, 179, 66] },
  { en: 1, rgb: [46, 125, 50] },
];

const aRgb = ([r, g, b]: Rgb, alfa = 1) => `rgba(${r}, ${g}, ${b}, ${alfa})`;

function rgbEnFraccion(fraccion: number): Rgb {
  const f = Math.min(1, Math.max(0, fraccion));
  for (let i = 1; i < PARADAS.length; i++) {
    const [a, b] = [PARADAS[i - 1], PARADAS[i]];
    if (f <= b.en) {
      const t = (f - a.en) / (b.en - a.en);
      return [0, 1, 2].map((c) => Math.round(a.rgb[c] + (b.rgb[c] - a.rgb[c]) * t)) as Rgb;
    }
  }
  return PARADAS[PARADAS.length - 1].rgb;
}

/**
 * Barra de cumplimiento de la meta DIARIA del promotor (ver CLAUDE.md glosario
 * "Meta"): se llena con animación y cambia de rojo a verde según el avance.
 * Sin meta asignada hoy muestra solo un aviso discreto — nunca una meta
 * inventada (CLAUDE.md sección 8).
 */
export function BarraMetaDiaria({ meta }: { meta: ProgresoMetaDiaria | null }) {
  const fraccion = meta && meta.metaDiaria > 0 ? Math.min(1, meta.totalVendidoHoy / meta.metaDiaria) : 0;
  // Estado (no ref): el valor animado se crea una sola vez y se puede leer al renderizar.
  const [avance] = useState(() => new Animated.Value(0));

  useEffect(() => {
    Animated.timing(avance, {
      toValue: fraccion,
      duration: 900,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false, // anima ancho y color, que el driver nativo no soporta
    }).start();
  }, [avance, fraccion]);

  if (!meta) {
    return (
      <View style={styles.sinMeta}>
        <Ionicons name="flag-outline" size={16} color={COLORES.textoSecundario} />
        <Text style={styles.sinMetaTexto}>Hoy no tienes una meta de venta asignada.</Text>
      </View>
    );
  }

  const cumplida = meta.totalVendidoHoy >= meta.metaDiaria;
  const rgb = rgbEnFraccion(fraccion);
  // Más oscuro para el texto: el ámbar puro casi no se lee sobre fondo claro.
  const rgbTexto = rgb.map((c) => Math.round(c * 0.78)) as Rgb;

  return (
    <View
      style={[styles.tarjeta, { borderColor: aRgb(rgb), backgroundColor: aRgb(rgb, 0.08) }]}
      accessible
      accessibilityLabel={`Meta del día: ${meta.progresoPct} por ciento, ${formatearPesos(meta.totalVendidoHoy)} de ${formatearPesos(meta.metaDiaria)}`}
    >
      <View style={styles.fila}>
        <View style={styles.tituloFila}>
          <Ionicons name={cumplida ? 'trophy' : 'flag'} size={18} color={aRgb(rgbTexto)} />
          <Text style={styles.titulo}>Meta del día</Text>
        </View>
        <Text style={[styles.porcentaje, { color: aRgb(rgbTexto) }]}>{meta.progresoPct}%</Text>
      </View>

      <View style={styles.pista}>
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
        >
          <View style={styles.brillo} />
        </Animated.View>
      </View>

      <View style={styles.fila}>
        <Text style={styles.detalle}>
          {formatearPesos(meta.totalVendidoHoy)} de {formatearPesos(meta.metaDiaria)}
        </Text>
        <Text style={[styles.estado, { color: aRgb(rgbTexto) }]}>
          {cumplida ? '¡Meta cumplida!' : `Te faltan ${formatearPesos(meta.metaDiaria - meta.totalVendidoHoy)}`}
        </Text>
      </View>
      <Text style={styles.punto} numberOfLines={1}>
        {meta.puntoNombre}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  tarjeta: {
    borderWidth: 2,
    borderRadius: RADII_ADMIN.lg,
    paddingVertical: 14,
    paddingHorizontal: 16,
    gap: 10,
  },
  fila: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  tituloFila: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  titulo: {
    ...TEXTO_PROMOTOR.tituloTarjeta,
    color: COLORES.textoSobreOscuro,
  },
  porcentaje: {
    fontSize: 30,
    fontFamily: TIPOGRAFIA_PROMOTOR.monoSemiNegrita,
  },
  pista: {
    height: 24,
    borderRadius: RADII_ADMIN.md,
    backgroundColor: 'rgba(58, 36, 0, 0.1)',
    overflow: 'hidden',
  },
  relleno: {
    height: '100%',
    borderRadius: RADII_ADMIN.md,
    overflow: 'hidden',
  },
  brillo: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: '45%',
    backgroundColor: 'rgba(255, 255, 255, 0.28)',
  },
  detalle: {
    ...TEXTO_PROMOTOR.datoDestacado,
    color: COLORES.textoSobreOscuro,
  },
  estado: {
    fontSize: 13,
    fontFamily: TIPOGRAFIA_PROMOTOR.negrita,
    flexShrink: 1,
    textAlign: 'right',
  },
  punto: {
    ...TEXTO_PROMOTOR.nota,
  },
  sinMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
  },
  sinMetaTexto: {
    ...TEXTO_PROMOTOR.cuerpoSecundario,
  },
});
