import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import { formatearPesos } from '@/core/dinero';
import type { Venta } from '@/core/tipos';
import { getDb } from '@/db/client';
import { listarVentas } from '@/db/ventas';
import { COLORES } from '@/ui/colores';
import { useRequiereSesion } from '@/ui/useRequiereSesion';

function formatearFecha(tsCliente: string): string {
  const fecha = new Date(tsCliente);
  return fecha.toLocaleString('es-CO', {
    dateStyle: 'short',
    timeStyle: 'short',
  });
}

export default function Ventas() {
  const usuario = useRequiereSesion(['ADMIN']);
  const [ventas, setVentas] = useState<Venta[]>([]);
  const [cargando, setCargando] = useState(true);

  useFocusEffect(
    useCallback(() => {
      (async () => {
        setCargando(true);
        try {
          const db = await getDb();
          setVentas(await listarVentas(db));
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
        <Text style={styles.titulo}>Ventas</Text>
        <View style={{ width: 40 }} />
      </View>

      {cargando ? (
        <View style={styles.centrado}>
          <ActivityIndicator size="large" color={COLORES.oscuro} />
        </View>
      ) : ventas.length === 0 ? (
        <View style={styles.centrado}>
          <Text style={styles.vacio}>Todavía no se ha registrado ninguna venta.</Text>
        </View>
      ) : (
        <FlatList
          data={ventas}
          keyExtractor={(v) => v.id}
          contentContainerStyle={styles.lista}
          renderItem={({ item }) => (
            <Pressable style={styles.fila} onPress={() => router.push(`/admin/ventas/${item.id}`)}>
              <View style={styles.filaTexto}>
                <Text style={styles.filaPromotor}>{item.promotorNombre}</Text>
                <Text style={styles.filaDetalle}>
                  {item.numeroRecibo} · {formatearFecha(item.tsCliente)} ·{' '}
                  {item.metodoPago.charAt(0) + item.metodoPago.slice(1).toLowerCase()}
                </Text>
              </View>
              <Text style={styles.filaTotal}>{formatearPesos(item.total)}</Text>
            </Pressable>
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
    fontSize: 17,
    fontWeight: '700',
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
    gap: 12,
  },
  fila: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 14,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  filaTexto: {
    flex: 1,
    gap: 2,
  },
  filaPromotor: {
    fontSize: 14,
    fontWeight: '700',
    color: '#333',
  },
  filaDetalle: {
    fontSize: 12,
    color: '#888',
  },
  filaTotal: {
    fontSize: 15,
    fontWeight: '800',
    color: COLORES.oscuro,
  },
});
