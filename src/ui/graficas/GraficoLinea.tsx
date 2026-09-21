import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Line, Path } from 'react-native-svg';

import { COLORES_ADMIN, TIPOGRAFIA_ADMIN } from '@/ui/tema';

export interface PuntoLinea {
  etiqueta: string;
  valor: number;
}

interface Props {
  puntos: PuntoLinea[];
  /** Alto del área de dibujo en px, sin contar etiquetas. */
  altura?: number;
  /** Formatea el valor para el tooltip/eje — por defecto, el número tal cual. */
  formatearValor?: (valor: number) => string;
  color?: string;
}

const ALTO_DEFECTO = 90;
const PADDING_HORIZONTAL = 8;

/**
 * Línea simple de tendencia (ej. tasa de repetición de un producto evento a
 * evento) — sin librería de charts, dibujado a mano con react-native-svg
 * (ya es dependencia del proyecto, ver src/ui/EscanerCodigoBarras.tsx).
 */
export function GraficoLinea({ puntos, altura = ALTO_DEFECTO, formatearValor, color = COLORES_ADMIN.vino }: Props) {
  const [ancho, setAncho] = useState(0);

  if (puntos.length === 0) return null;

  const valores = puntos.map((p) => p.valor);
  const minimo = Math.min(...valores, 0);
  const maximo = Math.max(...valores, 1);
  const rango = maximo - minimo || 1;

  const coordenadas = puntos.map((p, i) => {
    const x =
      puntos.length === 1
        ? ancho / 2
        : PADDING_HORIZONTAL + (i / (puntos.length - 1)) * (ancho - PADDING_HORIZONTAL * 2);
    const y = altura - ((p.valor - minimo) / rango) * altura;
    return { x, y, valor: p.valor };
  });

  const path = coordenadas.map((c, i) => `${i === 0 ? 'M' : 'L'} ${c.x} ${c.y}`).join(' ');

  return (
    <View
      style={[styles.contenedor, { height: altura }]}
      onLayout={(evento) => setAncho(evento.nativeEvent.layout.width)}
    >
      {ancho > 0 && (
        <Svg width={ancho} height={altura}>
          <Line x1={0} y1={altura} x2={ancho} y2={altura} stroke={COLORES_ADMIN.bordeSuave} strokeWidth={1} />
          <Path d={path} stroke={color} strokeWidth={2} fill="none" />
          {coordenadas.map((c, i) => (
            <Circle key={i} cx={c.x} cy={c.y} r={3.5} fill={color} />
          ))}
        </Svg>
      )}
      <View style={styles.etiquetasFila}>
        {puntos.map((p, i) => (
          <Text key={i} style={styles.etiqueta} numberOfLines={1}>
            {formatearValor ? formatearValor(p.valor) : p.valor}
          </Text>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  contenedor: {
    width: '100%',
  },
  etiquetasFila: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  etiqueta: {
    fontSize: 10,
    fontFamily: TIPOGRAFIA_ADMIN.monoRegular,
    color: COLORES_ADMIN.textoSecundario,
  },
});
