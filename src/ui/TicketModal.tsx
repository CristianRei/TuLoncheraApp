import { FlatList, Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { formatearPesos } from '@/core/dinero';

import type { ItemCarrito } from './useCarrito';

interface Props {
  visible: boolean;
  items: ItemCarrito[];
  total: number;
  colorAcento: string;
  onQuitarUno: (productoId: string) => void;
  onVaciar: () => void;
  onCerrar: () => void;
  onCobrar: () => void;
  /**
   * 'modal' (default): Modal nativo propio. 'superpuesto': sin Modal propio,
   * para usarlo ya dentro de otro Modal (ej. encima de la cámara del
   * escáner) — dos Modal nativos simultáneos con la cámara activa cuelgan
   * la pantalla en Android.
   */
  variante?: 'modal' | 'superpuesto';
}

export function TicketModal({
  visible,
  items,
  total,
  colorAcento,
  onQuitarUno,
  onVaciar,
  onCerrar,
  onCobrar,
  variante = 'modal',
}: Props) {
  if (variante === 'superpuesto' && !visible) return null;

  const contenido = (
    <View style={[StyleSheet.absoluteFill, styles.fondo]}>
      <View style={styles.hoja}>
        <View style={styles.encabezado}>
          <Text style={styles.titulo}>Ticket</Text>
          <Pressable onPress={onCerrar}>
            <Text style={styles.cerrar}>Cerrar</Text>
          </Pressable>
        </View>

        {items.length === 0 ? (
          <View style={styles.vacio}>
            <Text style={styles.vacioTexto}>Todavía no has agregado productos.</Text>
          </View>
        ) : (
          <>
            <FlatList
              data={items}
              keyExtractor={(item) => item.productoId}
              style={styles.lista}
              renderItem={({ item }) => (
                <View style={styles.fila}>
                  <View style={styles.filaTexto}>
                    <Text style={styles.filaNombre} numberOfLines={2}>
                      {item.nombre}
                    </Text>
                    <Text style={styles.filaDetalle}>
                      {item.cantidad} × {formatearPesos(item.precio)} ={' '}
                      {formatearPesos(item.precio * item.cantidad)}
                    </Text>
                  </View>
                  <Pressable
                    style={styles.botonQuitar}
                    onPress={() => onQuitarUno(item.productoId)}
                  >
                    <Text style={styles.botonQuitarTexto}>−</Text>
                  </Pressable>
                </View>
              )}
            />

            <Pressable onPress={onVaciar}>
              <Text style={styles.vaciar}>Vaciar ticket</Text>
            </Pressable>

            <View style={styles.pie}>
              <View style={styles.totalFila}>
                <Text style={styles.totalEtiqueta}>Total</Text>
                <Text style={styles.totalValor}>{formatearPesos(total)}</Text>
              </View>
              <Pressable
                style={[styles.botonCobrar, { backgroundColor: colorAcento }]}
                onPress={onCobrar}
              >
                <Text style={styles.botonCobrarTexto}>Cobrar</Text>
              </Pressable>
            </View>
          </>
        )}
      </View>
    </View>
  );

  if (variante === 'superpuesto') return contenido;

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onCerrar}>
      {contenido}
    </Modal>
  );
}

const styles = StyleSheet.create({
  fondo: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  hoja: {
    backgroundColor: '#FFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '80%',
    padding: 20,
  },
  encabezado: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  titulo: {
    fontSize: 18,
    fontWeight: '700',
  },
  cerrar: {
    fontSize: 14,
    color: '#888',
    textDecorationLine: 'underline',
  },
  vacio: {
    paddingVertical: 40,
    alignItems: 'center',
  },
  vacioTexto: {
    color: '#888',
    fontSize: 14,
  },
  lista: {
    maxHeight: 320,
  },
  fila: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
    gap: 12,
  },
  filaTexto: {
    flex: 1,
    gap: 2,
  },
  filaNombre: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
  },
  filaDetalle: {
    fontSize: 13,
    color: '#777',
  },
  botonQuitar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F0F0F0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  botonQuitarTexto: {
    fontSize: 18,
    fontWeight: '700',
    color: '#555',
  },
  vaciar: {
    fontSize: 13,
    color: '#B00020',
    textAlign: 'center',
    marginTop: 10,
  },
  pie: {
    marginTop: 16,
    gap: 12,
  },
  totalFila: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  totalEtiqueta: {
    fontSize: 15,
    fontWeight: '600',
    color: '#555',
  },
  totalValor: {
    fontSize: 20,
    fontWeight: '800',
  },
  botonCobrar: {
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  botonCobrarTexto: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '700',
  },
});
