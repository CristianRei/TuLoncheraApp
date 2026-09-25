import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { COLORES_ADMIN, TIPOGRAFIA_ADMIN } from './tema';

interface Props {
  visible: boolean;
  titulo: string;
  mensaje: string;
  textoConfirmar: string;
  /** true = botón de confirmar en rojo (dar de baja, eliminar). false = color normal (vino). */
  destructivo?: boolean;
  cargando?: boolean;
  onConfirmar: () => void;
  onCancelar: () => void;
}

/**
 * Reemplaza Alert.alert con botones — Alert.alert no tiene implementación de
 * UI en React Native Web, así que un confirm de 2 botones nunca aparece
 * cuando se prueba en el dev server del navegador (ver CLAUDE.md sección 5).
 * Mismos estilos que el modal ya usado en app/admin/calendario/index.tsx
 * (fondoModal/tarjetaModal/modalTitulo/modalTexto/modalAcciones).
 */
export function ModalConfirmacion({
  visible,
  titulo,
  mensaje,
  textoConfirmar,
  destructivo,
  cargando,
  onConfirmar,
  onCancelar,
}: Props) {
  return (
    <Modal visible={visible} animationType="fade" transparent>
      <View style={styles.fondoModal}>
        <View style={styles.tarjetaModal}>
          <Text style={styles.modalTitulo}>{titulo}</Text>
          <Text style={styles.modalTexto}>{mensaje}</Text>
          <View style={styles.modalAcciones}>
            <Pressable onPress={onCancelar} disabled={cargando}>
              <Text style={styles.modalCancelar}>Cancelar</Text>
            </Pressable>
            <Pressable
              style={[
                styles.botonConfirmar,
                destructivo && styles.botonConfirmarDestructivo,
                cargando && styles.botonDeshabilitado,
              ]}
              disabled={cargando}
              onPress={onConfirmar}
            >
              {cargando ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={styles.botonConfirmarTexto}>{textoConfirmar}</Text>
              )}
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fondoModal: {
    flex: 1,
    backgroundColor: 'rgba(42,24,16,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  tarjetaModal: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: COLORES_ADMIN.superficieMasBaja,
    borderRadius: 16,
    padding: 20,
    gap: 10,
  },
  modalTitulo: { fontSize: 16, fontFamily: TIPOGRAFIA_ADMIN.negrita, color: COLORES_ADMIN.texto },
  modalTexto: { fontSize: 13, fontFamily: TIPOGRAFIA_ADMIN.regular, color: COLORES_ADMIN.textoSecundario },
  modalAcciones: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: 16,
    marginTop: 12,
  },
  modalCancelar: { fontSize: 14, fontFamily: TIPOGRAFIA_ADMIN.medio, color: COLORES_ADMIN.textoSecundario },
  botonConfirmar: {
    backgroundColor: COLORES_ADMIN.vino,
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    minWidth: 100,
    alignItems: 'center',
  },
  botonConfirmarDestructivo: {
    backgroundColor: COLORES_ADMIN.error,
  },
  botonConfirmarTexto: { color: COLORES_ADMIN.textoInverso, fontSize: 13, fontFamily: TIPOGRAFIA_ADMIN.semiNegrita },
  botonDeshabilitado: { opacity: 0.5 },
});
