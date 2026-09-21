import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

import { COLORES_ADMIN, TIPOGRAFIA_ADMIN } from '@/ui/tema';

export interface SegmentoCircular {
  etiqueta: string;
  valor: number;
  color: string;
}

interface Props {
  segmentos: SegmentoCircular[];
  formatearValor?: (valor: number) => string;
  tamano?: number;
}

const GROSOR = 22;

/**
 * Dona (pie con hueco) dibujada con `Circle` + `strokeDasharray` — técnica
 * estándar de SVG para gráficas circulares sin tener que calcular arcos a
 * mano, mismo espíritu sin librería de charts que el resto de
 * src/ui/graficas. Cada segmento es un círculo completo con solo una
 * porción de su trazo visible (el resto es "hueco" invisible), rotado -90°
 * para que empiece arriba en vez de a la derecha.
 */
export function GraficoCircular({ segmentos, formatearValor, tamano = 150 }: Props) {
  const total = segmentos.reduce((suma, s) => suma + s.valor, 0);
  const radio = (tamano - GROSOR) / 2;
  const circunferencia = 2 * Math.PI * radio;
  const centro = tamano / 2;
  const segmentosVisibles = segmentos.filter((s) => s.valor > 0);

  let acumulado = 0;

  return (
    <View style={styles.contenedor}>
      <Svg width={tamano} height={tamano}>
        <Circle
          cx={centro}
          cy={centro}
          r={radio}
          stroke={COLORES_ADMIN.superficieBaja}
          strokeWidth={GROSOR}
          fill="none"
        />
        {total > 0 &&
          segmentosVisibles.map((segmento, indice) => {
            const largo = (segmento.valor / total) * circunferencia;
            const elemento = (
              <Circle
                key={indice}
                cx={centro}
                cy={centro}
                r={radio}
                stroke={segmento.color}
                strokeWidth={GROSOR}
                strokeDasharray={`${largo} ${circunferencia - largo}`}
                strokeDashoffset={-acumulado}
                strokeLinecap={segmentosVisibles.length > 1 ? 'butt' : 'round'}
                fill="none"
                transform={`rotate(-90 ${centro} ${centro})`}
              />
            );
            acumulado += largo;
            return elemento;
          })}
      </Svg>
      <View style={styles.leyenda}>
        {segmentos.map((segmento, indice) => (
          <View key={indice} style={styles.leyendaFila}>
            <View style={[styles.leyendaPunto, { backgroundColor: segmento.color }]} />
            <Text style={styles.leyendaTexto} numberOfLines={1}>
              {segmento.etiqueta}
            </Text>
            <Text style={styles.leyendaValor}>
              {total === 0 ? '0%' : `${((segmento.valor / total) * 100).toFixed(0)}%`}
              {formatearValor ? ` · ${formatearValor(segmento.valor)}` : ''}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  contenedor: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    flexWrap: 'wrap',
  },
  leyenda: {
    flex: 1,
    minWidth: 140,
    gap: 8,
  },
  leyendaFila: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  leyendaPunto: {
    width: 9,
    height: 9,
    borderRadius: 4.5,
  },
  leyendaTexto: {
    flex: 1,
    fontSize: 12,
    fontFamily: TIPOGRAFIA_ADMIN.regular,
    color: COLORES_ADMIN.texto,
  },
  leyendaValor: {
    fontSize: 11,
    fontFamily: TIPOGRAFIA_ADMIN.monoMedio,
    color: COLORES_ADMIN.textoSecundario,
  },
});
