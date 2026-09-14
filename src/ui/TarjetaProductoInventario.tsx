import { Image, Pressable, StyleSheet, Text, View } from 'react-native';

import { formatearPesos } from '@/core/dinero';

interface Props {
  nombre: string;
  precio: number;
  fotoUri: string | null;
  saldo: number;
  colorAcento: string;
  onPress: () => void;
}

export function TarjetaProductoInventario({
  nombre,
  precio,
  fotoUri,
  saldo,
  colorAcento,
  onPress,
}: Props) {
  return (
    <Pressable style={styles.tarjeta} onPress={onPress}>
      <View style={styles.fotoContenedor}>
        {fotoUri ? (
          <Image source={{ uri: fotoUri }} style={styles.foto} />
        ) : (
          <Text style={styles.fotoPlaceholder}>Sin foto</Text>
        )}
        <View style={[styles.saldoBadge, { backgroundColor: colorAcento }]}>
          <Text style={styles.saldoTexto}>x{saldo}</Text>
        </View>
      </View>
      <Text style={styles.nombre} numberOfLines={2}>
        {nombre}
      </Text>
      <Text style={[styles.precio, { color: colorAcento }]}>{formatearPesos(precio)}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  tarjeta: {
    flex: 1,
    backgroundColor: '#FFF',
    borderRadius: 14,
    padding: 8,
    gap: 4,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  fotoContenedor: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: 10,
    backgroundColor: '#F0F0F0',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  foto: {
    width: '100%',
    height: '100%',
  },
  fotoPlaceholder: {
    fontSize: 10,
    color: '#AAA',
  },
  saldoBadge: {
    position: 'absolute',
    top: 6,
    right: 6,
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  saldoTexto: {
    fontSize: 10,
    fontWeight: '700',
    color: '#FFF',
  },
  nombre: {
    fontSize: 12,
    fontWeight: '600',
    color: '#333',
    minHeight: 32,
  },
  precio: {
    fontSize: 13,
    fontWeight: '700',
  },
});
