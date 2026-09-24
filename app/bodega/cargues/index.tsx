import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { Cargue, Traslado } from '@/core/tipos';
import { listarCarguesPendientes } from '@/db/cargues';
import { getDb } from '@/db/client';
import { listarTrasladosPendientes } from '@/db/traslados';
import { COLORES } from '@/ui/colores';
import { ContenedorAncho } from '@/ui/ContenedorAncho';
import { useRequiereSesion } from '@/ui/useRequiereSesion';
import { useRecargarConDatosNuevos } from '@/ui/useVersionDatos';

function formatearFecha(ts: string): string {
  return new Date(ts).toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' });
}

type ItemPendiente =
  | { tipo: 'CARGUE'; cargue: Cargue }
  | { tipo: 'TRASLADO'; traslado: Traslado };

export default function CarguesPendientesBodega() {
  const usuario = useRequiereSesion(['BODEGA']);
  const [items, setItems] = useState<ItemPendiente[]>([]);
  const [cargando, setCargando] = useState(true);
  const insets = useSafeAreaInsets();

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const db = await getDb();
      const [cargues, traslados] = await Promise.all([
        listarCarguesPendientes(db),
        listarTrasladosPendientes(db),
      ]);
      const combinados: ItemPendiente[] = [
        ...cargues.map((cargue): ItemPendiente => ({ tipo: 'CARGUE', cargue })),
        ...traslados.map((traslado): ItemPendiente => ({ tipo: 'TRASLADO', traslado })),
      ].sort((a, b) => {
        const tsA = a.tipo === 'CARGUE' ? a.cargue.tsCliente : a.traslado.tsCliente;
        const tsB = b.tipo === 'CARGUE' ? b.cargue.tsCliente : b.traslado.tsCliente;
        return tsA.localeCompare(tsB);
      });
      setItems(combinados);
    } finally {
      setCargando(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      cargar();
    }, [cargar])
  );
  useRecargarConDatosNuevos(cargar);

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
      ) : items.length === 0 ? (
        <View style={styles.centrado}>
          <Text style={styles.vacio}>No hay cargues ni traslados pendientes.</Text>
        </View>
      ) : (
        <ContenedorAncho anchoMaximo={640} llenarAlto>
          <FlatList
            data={items}
            keyExtractor={(item) => (item.tipo === 'CARGUE' ? item.cargue.id : item.traslado.id)}
            contentContainerStyle={styles.lista}
            renderItem={({ item }) => (
              <Pressable
                style={styles.fila}
                onPress={() =>
                  router.push(
                    item.tipo === 'CARGUE'
                      ? `/bodega/cargues/${item.cargue.id}`
                      : `/bodega/cargues/traslado/${item.traslado.id}`
                  )
                }
              >
                <View style={styles.filaTexto}>
                  <View style={styles.filaTituloFila}>
                    <Text style={styles.filaPromotor}>
                      {item.tipo === 'CARGUE'
                        ? item.cargue.promotorNombre
                        : `${item.traslado.promotorOrigenNombre} → ${item.traslado.promotorDestinoNombre}`}
                    </Text>
                    {item.tipo === 'TRASLADO' && (
                      <View style={styles.insigniaTraslado}>
                        <Text style={styles.insigniaTrasladoTexto}>Traslado</Text>
                      </View>
                    )}
                  </View>
                  <Text style={styles.filaDetalle}>
                    {formatearFecha(item.tipo === 'CARGUE' ? item.cargue.tsCliente : item.traslado.tsCliente)}
                  </Text>
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
  filaTituloFila: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  filaPromotor: { fontSize: 15, fontWeight: '700', color: '#333' },
  insigniaTraslado: {
    backgroundColor: '#FFF3E8',
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  insigniaTrasladoTexto: { fontSize: 10, fontWeight: '700', color: '#B5651D' },
  filaDetalle: { fontSize: 12, color: '#888' },
  filaFlecha: { fontSize: 20, color: COLORES.oscuro },
});
