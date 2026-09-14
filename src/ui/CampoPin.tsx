import { StyleSheet, View } from 'react-native';

import { TecladoNumerico } from './TecladoNumerico';

interface Props {
  pin: string;
  largo?: number;
  onPresionar: (digito: string) => void;
  onBorrar: () => void;
  deshabilitado?: boolean;
  colorAcento: string;
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
}: Props) {
  return (
    <View style={styles.contenedor}>
      <View style={styles.puntos}>
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
      </View>
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
