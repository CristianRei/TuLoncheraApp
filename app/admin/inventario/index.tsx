import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import { getDb } from '@/db/client';
import { listarInventarioBodega, type ItemInventario } from '@/db/inventario';
import { COLORES } from '@/ui/colores';
import { useRequiereSesion } from '@/ui/useRequiereSesion';

export default function Inventario() {
  const usuario = useRequiereSesion(['ADMIN']);
  const [items, setItems] = useState<ItemInventario[]>([]);
  const [cargando, setCargando] = useState(true);

  useFocusEffect(
    useCallback(() => {
      (async () => {
        setCargando(true);
        try {
          const db = await getDb();
          setItems(await listarInventarioBodega(db));
        } finally {
          setCargando(false);
        }
      })();
    }, [])
  );

  if (!usuario) return null;

  return (
    <View style={styles.contenedor}>
      <View style={styles.encabezado}>
        <Pressable onPress={() => router.back()}>
          <Text style={styles.volver}>‹ Admin</Text>
        </Pressable>
        <Text style={styles.titulo}>Inventario de bodega</Text>
        <Pressable style={styles.botonNuevo} onPress={() => router.push('/admin/inventario/entrada')}>
          <Text style={styles.botonNuevoTexto}>+</Text>
        </Pressable>
      </View>

      {cargando ? (
        <View style={styles.centrado}>
          <ActivityIndicator size="large" color={COLORES.oscuro} />
        </View>
      ) : items.length === 0 ? (
        <View style={styles.centrado}>
          <Text style={styles.vacio}>
            Todavía no hay stock en bodega. Toca "+" para registrar una entrada.
          </Text>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => item.producto.id}
          contentContainerStyle={styles.lista}
          renderItem={({ item }) => (
            <View style={styles.fila}>
              <Text style={styles.filaNombre} numberOfLines={2}>
                {item.producto.nombre}
              </Text>
              <Text style={styles.filaSaldo}>{item.saldo} und.</Text>
            </View>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  contenedor: {
    flex: 1,
    backgroundColor: '#FBEDED',
  },
  encabezado: {
    backgroundColor: COLORES.oscuro,
    paddingTop: 64,
    paddingHorizontal: 20,
    paddingBottom: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  volver: {
    color: '#FFFFFF',
    fontSize: 14,
    textDecorationLine: 'underline',
  },
  titulo: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  botonNuevo: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: COLORES.primario,
    alignItems: 'center',
    justifyContent: 'center',
  },
  botonNuevoTexto: {
    color: '#3A2400',
    fontSize: 20,
    fontWeight: '700',
    lineHeight: 22,
  },
  centrado: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  vacio: {
    fontSize: 14,
    color: '#888',
    textAlign: 'center',
  },
  lista: {
    padding: 20,
    gap: 10,
  },
  fila: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 14,
  },
  filaNombre: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginRight: 12,
  },
  filaSaldo: {
    fontSize: 15,
    fontWeight: '800',
    color: COLORES.oscuro,
  },
});
