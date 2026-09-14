import { CameraView, useCameraPermissions } from 'expo-camera';
import { useEffect, useRef } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

interface Props {
  visible: boolean;
  onDetectado: (codigo: string) => void;
  onCerrar: () => void;
  titulo?: string;
  colorAcento: string;
}

const TIPOS_CODIGO = ['ean13', 'ean8', 'upc_a', 'upc_e', 'code128'] as const;

/**
 * Cámara + lectura de código de barras, en un Modal de pantalla completa.
 * Componente genérico: no sabe qué hacer con el código detectado, solo lo
 * reporta una vez (debounce con `yaEscaneado`) — lo usan tanto el catálogo
 * (para registrar el código de un producto) como la venta del promotor.
 */
export function EscanerCodigoBarras({
  visible,
  onDetectado,
  onCerrar,
  titulo = 'Escanear código',
  colorAcento,
}: Props) {
  const [permiso, solicitarPermiso] = useCameraPermissions();
  const yaEscaneado = useRef(false);

  useEffect(() => {
    if (visible) yaEscaneado.current = false;
  }, [visible]);

  function manejarEscaneo(resultado: { data: string }) {
    if (yaEscaneado.current) return;
    yaEscaneado.current = true;
    onDetectado(resultado.data);
  }

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onCerrar}>
      <View style={styles.contenedor}>
        <View style={[styles.barra, { backgroundColor: colorAcento }]}>
          <Text style={styles.titulo}>{titulo}</Text>
          <Pressable onPress={onCerrar}>
            <Text style={styles.cerrar}>Cerrar</Text>
          </Pressable>
        </View>

        {!permiso ? (
          <View style={styles.centrado} />
        ) : !permiso.granted ? (
          <View style={styles.centrado}>
            <Text style={styles.mensaje}>Se necesita permiso de cámara para escanear.</Text>
            <Pressable
              style={[styles.boton, { backgroundColor: colorAcento }]}
              onPress={solicitarPermiso}
            >
              <Text style={styles.botonTexto}>Dar permiso</Text>
            </Pressable>
          </View>
        ) : (
          <CameraView
            style={styles.camara}
            facing="back"
            barcodeScannerSettings={{ barcodeTypes: [...TIPOS_CODIGO] }}
            onBarcodeScanned={manejarEscaneo}
          />
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  contenedor: {
    flex: 1,
    backgroundColor: '#000',
  },
  barra: {
    paddingTop: 56,
    paddingBottom: 16,
    paddingHorizontal: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  titulo: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '700',
  },
  cerrar: {
    color: '#FFF',
    fontSize: 14,
    textDecorationLine: 'underline',
  },
  camara: {
    flex: 1,
  },
  centrado: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 16,
  },
  mensaje: {
    color: '#FFF',
    fontSize: 14,
    textAlign: 'center',
  },
  boton: {
    borderRadius: 10,
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  botonTexto: {
    color: '#FFF',
    fontWeight: '700',
  },
});
