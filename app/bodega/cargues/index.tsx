import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { Cargue } from '@/core/tipos';
import { listarCarguesPendientes } from '@/db/cargues';
import { getDb } from '@/db/client';
import { COLORES } from '@/ui/colores';
import { ContenedorAncho } from '@/ui/ContenedorAncho';
import { useRequiereSesion } from '@/ui/useRequiereSesion';

function formatearFecha(ts: string): string {
  return new Date(ts).toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' });
}

export default function CarguesPendientesBodega() {
  const usuario = useRequiereSesion(['BODEGA']);
  const [cargues, setCargues] = useState<Cargue[]>([]);
  const [cargando, setCargando] = useState(true);
  const insets = useSafeAreaInsets();

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const db = await getDb();
      setCargues(await listarCarguesPendientes(db));
    } finally {
      setCargando(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      cargar();
    }, [cargar])
  );

  if (!usuario) return null;

  return (
    <View style={styles.contenedor}>
      <View style={[styles.encabezado, { paddingTop: insets.top + 20 }]}>
        <ContenedorAncho anchoMaximo={640} style={styles.encabezadoContenido}>
          <Pressable onPress={() => router.back()}>
            <Text style={styles.volver}>‹ Bodega</Text>
          </Pressable>
          <Text style={styles.titulo}>Cargues por entregar</Text>
        </ContenedorAncho>
      </View>

      {cargando ? (
        <View style={styles.centrado}>
          <ActivityIndicator size="large" color={COLORES.oscuro} />
        </View>
      ) : cargues.length === 0 ? (
        <View style={styles.centrado}>
          <Text style={styles.vacio}>No hay cargues pendientes por entregar.</Text>
        </View>
      ) : (
        <ContenedorAncho anchoMaximo={640} llenarAlto>
          <FlatList
            data={cargues}
            keyExtractor={(c) => c.id}
            contentContainerStyle={styles.lista}
            renderItem={({ item }) => (
              <Pressable
                style={styles.fila}
                onPress={() => router.push(`/bodega/cargues/${item.id}`)}
              >
                <View style={styles.filaTexto}>
                  <Text style={styles.filaPromotor}>{item.promotorNombre}</Text>
                  <Text style={styles.filaDetalle}>{formatearFecha(item.tsCliente)}</Text>
                </View>
                <Text style={styles.filaFlecha}>›</Text>
              </Pressable>
            )}
          />
        </ContenedorAncho>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  contenedor: { flex: 1, backgroundColor: '#FBEDED' },
  encabezado: { backgroundColor: COLORES.oscuro, paddingHorizontal: 20, paddingBottom: 16 },
  encabezadoContenido: { gap: 4 },
  volver: { color: '#FFFFFF', fontSize: 14, textDecorationLine: 'underline' },
  titulo: { color: '#FFFFFF', fontSize: 17, fontWeight: '700' },
  centrado: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  vacio: { fontSize: 14, color: '#888', textAlign: 'center' },
  lista: { padding: 20, gap: 10 },
  fila: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 16,
  },
  filaTexto: { gap: 2 },
  filaPromotor: { fontSize: 15, fontWeight: '700', color: '#333' },
  filaDetalle: { fontSize: 12, color: '#888' },
  filaFlecha: { fontSize: 20, color: COLORES.oscuro },
});
