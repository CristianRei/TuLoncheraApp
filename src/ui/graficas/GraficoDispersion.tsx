import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Line } from 'react-native-svg';

import { COLORES_ADMIN, TIPOGRAFIA_ADMIN } from '@/ui/tema';

export interface PuntoDispersion {
  etiqueta: string;
  x: number;
  y: number;
}

interface Props {
  puntos: PuntoDispersion[];
  etiquetaEjeX: string;
  etiquetaEjeY: string;
  /** Coeficiente de Pearson ya calculado — si |r| > 0.3, se dibuja la línea de tendencia (regresión lineal simple). */
  correlacion: number | null;
  altura?: number;
}

const ALTO_DEFECTO = 180;
const PADDING = 24;
const UMBRAL_LINEA_TENDENCIA = 0.3;

/** Pendiente e intercepto de la recta de mínimos cuadrados — solo para dibujar la línea de tendencia, no reemplaza el Pearson calculado en core/analisis. */
function regresionLineal(puntos: { x: number; y: number }[]): { pendiente: number; intercepto: number } | null {
  const n = puntos.length;
  if (n < 2) return null;
  const mediaX = puntos.reduce((s, p) => s + p.x, 0) / n;
  const mediaY = puntos.reduce((s, p) => s + p.y, 0) / n;
  let num = 0;
  let den = 0;
  for (const p of puntos) {
    num += (p.x - mediaX) * (p.y - mediaY);
    den += (p.x - mediaX) ** 2;
  }
  if (den === 0) return null;
  const pendiente = num / den;
  return { pendiente, intercepto: mediaY - pendiente * mediaX };
}

/**
 * Dispersión (scatter) de dos variables por entidad (ej. eventos trabajados
 * vs. ticket promedio por promotor), con línea de tendencia si la
 * correlación es al menos moderada — mismo criterio que
 * `interpretarFuerzaPearson` en core/analisis.
 */
export function GraficoDispersion({ puntos, etiquetaEjeX, etiquetaEjeY, correlacion, altura = ALTO_DEFECTO }: Props) {
  const [ancho, setAncho] = useState(0);

  if (puntos.length === 0) return null;

  const xs = puntos.map((p) => p.x);
  const ys = puntos.map((p) => p.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs, minX + 1);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys, minY + 1);

  const escalarX = (x: number) => PADDING + ((x - minX) / (maxX - minX)) * (ancho - PADDING * 2);
  const escalarY = (y: number) => altura - PADDING - ((y - minY) / (maxY - minY)) * (altura - PADDING * 2);

  const regresion =
    correlacion !== null && Math.abs(correlacion) >= UMBRAL_LINEA_TENDENCIA ? regresionLineal(puntos) : null;

  return (
    <View style={styles.contenedor} onLayout={(evento) => setAncho(evento.nativeEvent.layout.width)}>
      {ancho > 0 && (
        <Svg width={ancho} height={altura}>
          <Line x1={PADDING} y1={altura - PADDING} x2={ancho - PADDING} y2={altura - PADDING} stroke={COLORES_ADMIN.bordeSuave} strokeWidth={1} />
          <Line x1={PADDING} y1={PADDING} x2={PADDING} y2={altura - PADDING} stroke={COLORES_ADMIN.bordeSuave} strokeWidth={1} />
          {regresion && (
            <Line
              x1={escalarX(minX)}
              y1={escalarY(regresion.pendiente * minX + regresion.intercepto)}
              x2={escalarX(maxX)}
              y2={escalarY(regresion.pendiente * maxX + regresion.intercepto)}
              stroke={COLORES_ADMIN.vino}
              strokeWidth={1.5}
              strokeDasharray="4,4"
            />
          )}
          {puntos.map((p, i) => (
            <Circle key={i} cx={escalarX(p.x)} cy={escalarY(p.y)} r={4} fill={COLORES_ADMIN.dorado} stroke={COLORES_ADMIN.vino} strokeWidth={1} />
          ))}
        </Svg>
      )}
      <View style={styles.ejesFila}>
        <Text style={styles.etiquetaEje}>{etiquetaEjeX} →</Text>
      </View>
      <Text style={styles.etiquetaEjeY}>↑ {etiquetaEjeY}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  contenedor: {
    width: '100%',
  },
  ejesFila: {
    marginTop: 4,
    alignItems: 'center',
  },
  etiquetaEje: {
    fontSize: 11,
    fontFamily: TIPOGRAFIA_ADMIN.regular,
    color: COLORES_ADMIN.textoSecundario,
  },
  etiquetaEjeY: {
    position: 'absolute',
    top: 0,
    left: 0,
    fontSize: 11,
    fontFamily: TIPOGRAFIA_ADMIN.regular,
    color: COLORES_ADMIN.textoSecundario,
  },
});
