import * as Haptics from 'expo-haptics';
import { Pressable, StyleSheet, Text, View } from 'react-native';

interface Props {
  onPresionar: (digito: string) => void;
  onBorrar: () => void;
  deshabilitado?: boolean;
  colorAcento?: string;
}

const FILAS: string[][] = [
  ['1', '2', '3'],
  ['4', '5', '6'],
  ['7', '8', '9'],
  ['', '0', '⌫'],
];

export function TecladoNumerico({
  onPresionar,
  onBorrar,
  deshabilitado,
  colorAcento = '#333333',
}: Props) {
  return (
    <View style={styles.teclado}>
      {FILAS.map((fila, i) => (
        <View key={i} style={styles.fila}>
          {fila.map((tecla, j) => {
            if (tecla === '') return <View key={j} style={styles.tecla} />;
            const esBorrar = tecla === '⌫';
            return (
              <Pressable
                key={j}
                disabled={deshabilitado}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  if (esBorrar) onBorrar();
                  else onPresionar(tecla);
                }}
                style={({ pressed }) => [
                  styles.tecla,
                  { borderColor: colorAcento },
                  pressed && { backgroundColor: `${colorAcento}22` },
                ]}
              >
                <Text style={[styles.textoTecla, { color: colorAcento }]}>{tecla}</Text>
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  teclado: {
    width: '100%',
    maxWidth: 320,
    gap: 14,
  },
  fila: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  tecla: {
    width: 86,
    height: 86,
    borderRadius: 43,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textoTecla: {
    fontSize: 26,
    fontWeight: '600',
  },
});
