import * as ImagePicker from 'expo-image-picker';
import { useState } from 'react';
import { ActivityIndicator, Alert, Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { formatearPesos } from '@/core/dinero';
import type { MetodoPago } from '@/core/tipos';
import { COLORES, TIPOGRAFIA_PROMOTOR } from '@/ui/colores';

interface Props {
  visible: boolean;
  total: number;
  colorAcento: string;
  procesando: boolean;
  /** `comprobanteUri` solo viene con TRANSFERENCIA — la foto ya se tomó antes de llamar esto. */
  onSeleccionar: (metodo: MetodoPago, comprobanteUri?: string) => void;
  onCerrar: () => void;
  /**
   * 'modal' (default): Modal nativo propio. 'superpuesto': sin Modal propio,
   * para usarlo ya dentro de otro Modal (ej. encima de la cámara del
   * escáner) — dos Modal nativos simultáneos con la cámara activa cuelgan
   * la pantalla en Android.
   */
  variante?: 'modal' | 'superpuesto';
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
  variante = 'modal',
}: Props) {
  const [tomandoFoto, setTomandoFoto] = useState(false);

  if (variante === 'superpuesto' && !visible) return null;

  async function elegirMetodo(metodo: MetodoPago) {
    if (metodo !== 'TRANSFERENCIA') {
      onSeleccionar(metodo);
      return;
    }

    const permiso = await ImagePicker.requestCameraPermissionsAsync();
    if (!permiso.granted) {
      Alert.alert('Falta permiso de cámara', 'La transferencia necesita foto del comprobante.');
      return;
    }

    setTomandoFoto(true);
    try {
      const resultado = await ImagePicker.launchCameraAsync({ mediaTypes: 'images', quality: 0.7 });
      if (resultado.canceled || !resultado.assets[0]) return;
      onSeleccionar('TRANSFERENCIA', resultado.assets[0].uri);
    } finally {
      setTomandoFoto(false);
    }
  }

  const contenido = (
    <View style={[StyleSheet.absoluteFill, styles.fondo]}>
      <View style={styles.tarjeta}>
        <Text style={styles.etiquetaTotal}>Total a cobrar</Text>
        <Text style={[styles.total, { color: colorAcento }]}>{formatearPesos(total)}</Text>

        <Text style={styles.pregunta}>¿Cómo va a pagar?</Text>

        {procesando || tomandoFoto ? (
          <ActivityIndicator size="large" color={colorAcento} style={styles.cargando} />
        ) : (
          <View style={styles.opciones}>
            {OPCIONES.map((opcion) => (
              <Pressable
                key={opcion.metodo}
                style={[styles.opcion, { borderColor: colorAcento }]}
                onPress={() => elegirMetodo(opcion.metodo)}
                accessibilityRole="button"
                accessibilityLabel={`Pagar con ${opcion.etiqueta}`}
              >
                <Text style={[styles.opcionTexto, { color: colorAcento }]}>
                  {opcion.etiqueta}
                </Text>
              </Pressable>
            ))}
          </View>
        )}

        {!procesando && !tomandoFoto && (
          <Pressable onPress={onCerrar} accessibilityRole="button" accessibilityLabel="Cancelar cobro">
            <Text style={styles.cancelar}>Cancelar</Text>
          </Pressable>
        )}
      </View>
    </View>
  );

  if (variante === 'superpuesto') return contenido;

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onCerrar}>
      {contenido}
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
    backgroundColor: COLORES.superficie,
    borderRadius: 18,
    padding: 24,
    alignItems: 'center',
    gap: 8,
  },
  etiquetaTotal: {
    fontSize: 13,
    fontFamily: TIPOGRAFIA_PROMOTOR.regular,
    color: COLORES.textoSecundario,
  },
  total: {
    fontSize: 30,
    fontFamily: TIPOGRAFIA_PROMOTOR.monoSemiNegrita,
    marginBottom: 8,
  },
  pregunta: {
    fontSize: 14,
    fontFamily: TIPOGRAFIA_PROMOTOR.medio,
    color: COLORES.textoSobreOscuro,
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
    fontFamily: TIPOGRAFIA_PROMOTOR.negrita,
  },
  cargando: {
    marginVertical: 12,
  },
  cancelar: {
    marginTop: 14,
    fontSize: 13,
    fontFamily: TIPOGRAFIA_PROMOTOR.regular,
    color: COLORES.textoSecundario,
    textDecorationLine: 'underline',
  },
});
