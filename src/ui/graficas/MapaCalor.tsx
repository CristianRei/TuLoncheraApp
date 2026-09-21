import { StyleSheet, Text, View } from 'react-native';

import { COLORES_ADMIN, TIPOGRAFIA_ADMIN } from '@/ui/tema';

export interface CeldaMapaCalor {
  filaId: string;
  columnaId: string;
  valor: number;
}

interface Props {
  filas: { id: string; etiqueta: string }[];
  columnas: { id: string; etiqueta: string }[];
  celdas: CeldaMapaCalor[];
}

const TAMANO_CELDA = 40;
const ANCHO_ETIQUETA_FILA = 110;

/** Interpola entre superficieAlta (bajo) y vino (alto) según `t` en [0,1]. */
function colorIntensidad(t: number): string {
  const claro = { r: 0xfe, g: 0xdb, b: 0xce }; // COLORES_ADMIN.superficieMasAlta
  const oscuro = { r: 0x54, g: 0x12, b: 0x12 }; // COLORES_ADMIN.vino
  const r = Math.round(claro.r + (oscuro.r - claro.r) * t);
  const g = Math.round(claro.g + (oscuro.g - claro.g) * t);
  const b = Math.round(claro.b + (oscuro.b - claro.b) * t);
  return `rgb(${r}, ${g}, ${b})`;
}

/**
 * Grilla punto × producto coloreada por intensidad — sin SVG, celdas `View`
 * son suficientes para una grilla regular (a diferencia de línea/scatter,
 * que sí necesitan geometría libre).
 */
export function MapaCalor({ filas, columnas, celdas }: Props) {
  if (filas.length === 0 || columnas.length === 0) return null;

  const valorPorCelda = new Map(celdas.map((c) => [`${c.filaId}|${c.columnaId}`, c.valor]));
  const maximo = Math.max(...celdas.map((c) => c.valor), 1);

  return (
    <View>
      <View style={styles.fila}>
        <View style={{ width: ANCHO_ETIQUETA_FILA }} />
        {columnas.map((columna) => (
          <View key={columna.id} style={[styles.celdaEncabezado, { width: TAMANO_CELDA }]}>
            <Text style={styles.etiquetaColumna} numberOfLines={3}>
              {columna.etiqueta}
            </Text>
          </View>
        ))}
      </View>
      {filas.map((fila) => (
        <View key={fila.id} style={styles.fila}>
          <Text style={[styles.etiquetaFila, { width: ANCHO_ETIQUETA_FILA }]} numberOfLines={1}>
            {fila.etiqueta}
          </Text>
          {columnas.map((columna) => {
            const valor = valorPorCelda.get(`${fila.id}|${columna.id}`) ?? 0;
            const t = valor / maximo;
            return (
              <View
                key={columna.id}
                style={[
                  styles.celda,
                  { width: TAMANO_CELDA, height: TAMANO_CELDA, backgroundColor: colorIntensidad(t) },
                ]}
              >
                {valor > 0 && (
                  <Text style={[styles.valorCelda, { color: t > 0.5 ? '#FFFFFF' : COLORES_ADMIN.texto }]}>
                    {valor}
                  </Text>
                )}
              </View>
            );
          })}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  fila: {
    flexDirection: 'row',
  },
  celdaEncabezado: {
    justifyContent: 'flex-end',
    paddingBottom: 4,
    paddingHorizontal: 2,
  },
  etiquetaColumna: {
    fontSize: 9,
    fontFamily: TIPOGRAFIA_ADMIN.medio,
    color: COLORES_ADMIN.textoSecundario,
    textAlign: 'center',
  },
  etiquetaFila: {
    fontSize: 11.5,
    fontFamily: TIPOGRAFIA_ADMIN.regular,
    color: COLORES_ADMIN.texto,
    alignSelf: 'center',
  },
  celda: {
    borderWidth: 1,
    borderColor: COLORES_ADMIN.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  valorCelda: {
    fontSize: 10,
    fontFamily: TIPOGRAFIA_ADMIN.monoMedio,
  },
});
