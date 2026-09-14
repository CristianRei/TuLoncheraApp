import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { formatearPesos } from '@/core/dinero';
import type { MetodoPago } from '@/core/tipos';

interface Props {
  visible: boolean;
  total: number;
  colorAcento: string;
  procesando: boolean;
  onSeleccionar: (metodo: MetodoPago) => void;
  onCerrar: () => void;
}

const OPCIONES: { metodo: MetodoPago; etiqueta: string }[] = [
  { metodo: 'EFECTIVO', etiqueta: 'Efectivo' },
  { metodo: 'TRANSFERENCIA', etiqueta: 'Transferencia' },
  { metodo: 'LIBRANZA', etiqueta: 'Libranza' },
];

export function CobrarModal({
  visible,
  total,
  colorAcento,
  procesando,
  onSeleccionar,
  onCerrar,
}: Props) {
  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onCerrar}>
      <View style={styles.fondo}>
        <View style={styles.tarjeta}>
          <Text style={styles.etiquetaTotal}>Total a cobrar</Text>
          <Text style={[styles.total, { color: colorAcento }]}>{formatearPesos(total)}</Text>

          <Text style={styles.pregunta}>¿Cómo va a pagar?</Text>

          {procesando ? (
            <ActivityIndicator size="large" color={colorAcento} style={styles.cargando} />
          ) : (
            <View style={styles.opciones}>
              {OPCIONES.map((opcion) => (
                <Pressable
                  key={opcion.metodo}
                  style={[styles.opcion, { borderColor: colorAcento }]}
                  onPress={() => onSeleccionar(opcion.metodo)}
                >
                  <Text style={[styles.opcionTexto, { color: colorAcento }]}>
                    {opcion.etiqueta}
                  </Text>
                </Pressable>
              ))}
            </View>
          )}

          {!procesando && (
            <Pressable onPress={onCerrar}>
              <Text style={styles.cancelar}>Cancelar</Text>
            </Pressable>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fondo: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  tarjeta: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: '#FFF',
    borderRadius: 18,
    padding: 24,
    alignItems: 'center',
    gap: 8,
  },
  etiquetaTotal: {
    fontSize: 13,
    color: '#888',
  },
  total: {
    fontSize: 30,
    fontWeight: '800',
    marginBottom: 8,
  },
  pregunta: {
    fontSize: 14,
    color: '#555',
    marginBottom: 8,
  },
  opciones: {
    width: '100%',
    gap: 10,
  },
  opcion: {
    borderWidth: 1.5,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  opcionTexto: {
    fontSize: 16,
    fontWeight: '700',
  },
  cargando: {
    marginVertical: 12,
  },
  cancelar: {
    marginTop: 14,
    fontSize: 13,
    color: '#888',
    textDecorationLine: 'underline',
  },
});
