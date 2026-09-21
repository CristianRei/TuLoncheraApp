import { StyleSheet, Text, View } from 'react-native';

import { COLORES_ADMIN, TIPOGRAFIA_ADMIN } from '@/ui/tema';

export interface BarraHorizontal {
  etiqueta: string;
  valor: number;
}

interface Props {
  barras: BarraHorizontal[];
  formatearValor?: (valor: number) => string;
  color?: string;
  /** Cuántas barras mostrar como máximo — por defecto todas. */
  limite?: number;
}

/**
 * Ranking horizontal (ej. promotores por ticket promedio) — barras `View`
 * con ancho proporcional, mismo enfoque sin librería que el resto de
 * gráficas de src/ui/graficas.
 */
export function GraficoBarrasHorizontales({ barras, formatearValor, color = COLORES_ADMIN.dorado, limite }: Props) {
  const visibles = limite ? barras.slice(0, limite) : barras;
  if (visibles.length === 0) return null;

  const maximo = Math.max(...visibles.map((b) => Math.abs(b.valor)), 1);

  return (
    <View style={styles.contenedor}>
      {visibles.map((barra, i) => {
        const porcentaje = (Math.abs(barra.valor) / maximo) * 100;
        return (
          <View key={i} style={styles.fila}>
            <Text style={styles.etiqueta} numberOfLines={1}>
              {barra.etiqueta}
            </Text>
            <View style={styles.trackContenedor}>
              <View style={styles.track}>
                <View style={[styles.relleno, { width: `${porcentaje}%`, backgroundColor: color }]} />
              </View>
            </View>
            <Text style={styles.valor}>{formatearValor ? formatearValor(barra.valor) : barra.valor}</Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  contenedor: {
    gap: 8,
  },
  fila: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  etiqueta: {
    width: 90,
    fontSize: 12,
    fontFamily: TIPOGRAFIA_ADMIN.regular,
    color: COLORES_ADMIN.texto,
  },
  trackContenedor: {
    flex: 1,
  },
  track: {
    height: 10,
    borderRadius: 5,
    backgroundColor: COLORES_ADMIN.superficieBaja,
    overflow: 'hidden',
  },
  relleno: {
    height: '100%',
    borderRadius: 5,
  },
  valor: {
    minWidth: 64,
    textAlign: 'right',
    fontSize: 11.5,
    fontFamily: TIPOGRAFIA_ADMIN.monoMedio,
    color: COLORES_ADMIN.textoSecundario,
  },
});
