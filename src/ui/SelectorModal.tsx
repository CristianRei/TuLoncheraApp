import { FlatList, Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { COLORES_ADMIN, ESPACIADO_ADMIN, RADII_ADMIN, TEXTO_ADMIN } from './tema';

export interface OpcionSelector {
  id: string;
  etiqueta: string;
}

interface Props {
  visible: boolean;
  titulo: string;
  opciones: OpcionSelector[];
  /** `null` = quitar el filtro (la primera opción de la lista). */
  onElegir: (id: string | null) => void;
  onCerrar: () => void;
  /** Texto de la opción que limpia la selección. */
  textoQuitar?: string;
}

/**
 * Modal de selección simple (lista de opciones + "Quitar filtro") — estaba
 * copiado palabra por palabra en Turnos y en Bitácora, así que un ajuste en
 * uno no llegaba al otro.
 */
export function SelectorModal({
  visible,
  titulo,
  opciones,
  onElegir,
  onCerrar,
  textoQuitar = 'Quitar filtro',
}: Props) {
  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onCerrar}>
      <View style={styles.fondo}>
        <View style={styles.tarjeta}>
          <Text style={styles.titulo}>{titulo}</Text>
          <Pressable style={styles.opcion} onPress={() => onElegir(null)}>
            <Text style={styles.opcionQuitarTexto}>{textoQuitar}</Text>
          </Pressable>
          <FlatList
            data={opciones}
            keyExtractor={(o) => o.id}
            style={styles.lista}
            renderItem={({ item }) => (
              <Pressable style={styles.opcion} onPress={() => onElegir(item.id)}>
                <Text style={styles.opcionTexto}>{item.etiqueta}</Text>
              </Pressable>
            )}
          />
          <Pressable onPress={onCerrar}>
            <Text style={styles.cerrar}>Cerrar</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fondo: {
    flex: 1,
    backgroundColor: 'rgba(42,24,16,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: ESPACIADO_ADMIN.xl,
  },
  tarjeta: {
    width: '100%',
    maxWidth: 420,
    maxHeight: '80%',
    backgroundColor: COLORES_ADMIN.superficieMasBaja,
    borderRadius: RADII_ADMIN.lg,
    padding: ESPACIADO_ADMIN.xl,
    gap: ESPACIADO_ADMIN.md,
  },
  titulo: TEXTO_ADMIN.tituloSeccion,
  lista: {
    flexGrow: 0,
  },
  opcion: {
    paddingVertical: ESPACIADO_ADMIN.sm,
    borderBottomWidth: 1,
    borderBottomColor: COLORES_ADMIN.bordeSuave,
  },
  opcionTexto: TEXTO_ADMIN.cuerpo,
  opcionQuitarTexto: {
    ...TEXTO_ADMIN.cuerpo,
    fontFamily: TEXTO_ADMIN.boton.fontFamily,
    color: COLORES_ADMIN.error,
  },
  cerrar: {
    ...TEXTO_ADMIN.cuerpoSecundario,
    textAlign: 'center',
  },
});
