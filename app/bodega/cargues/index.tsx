import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, View } from 'react-native';

import type { Cargue, Traslado } from '@/core/tipos';
import { listarCarguesPendientes } from '@/db/cargues';
import { getDb } from '@/db/client';
import { listarTrasladosPendientes } from '@/db/traslados';
import { ContenedorAncho } from '@/ui/ContenedorAncho';
import { Encabezado } from '@/ui/Encabezado';
import { EmptyState } from '@/ui/EmptyState';
import { ListRow } from '@/ui/ListRow';
import { ANCHO_ADMIN, COLORES_ADMIN, ESPACIADO_ADMIN } from '@/ui/tema';
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
      <Encabezado titulo="Cargues por entregar" rutaVolverTexto="Bodega" anchoMaximo={ANCHO_ADMIN.lista} sinMenuLateral />

      {cargando ? (
        <View style={styles.centrado}>
          <ActivityIndicator size="large" color={COLORES_ADMIN.vino} />
        </View>
      ) : items.length === 0 ? (
        <EmptyState icono="cube-outline" mensaje="No hay cargues ni traslados pendientes." />
      ) : (
        <ContenedorAncho anchoMaximo={ANCHO_ADMIN.lista} llenarAlto>
          <FlatList
            data={items}
            keyExtractor={(item) => (item.tipo === 'CARGUE' ? item.cargue.id : item.traslado.id)}
            contentContainerStyle={styles.lista}
            renderItem={({ item }) => (
              <ListRow
                titulo={
                  item.tipo === 'CARGUE'
                    ? item.cargue.promotorNombre
                    : `${item.traslado.promotorOrigenNombre} → ${item.traslado.promotorDestinoNombre}`
                }
                subtitulo={formatearFecha(item.tipo === 'CARGUE' ? item.cargue.tsCliente : item.traslado.tsCliente)}
                badge={item.tipo === 'TRASLADO' ? 'Traslado' : undefined}
                onPress={() =>
                  router.push(
                    item.tipo === 'CARGUE'
                      ? `/bodega/cargues/${item.cargue.id}`
                      : `/bodega/cargues/traslado/${item.traslado.id}`
                  )
                }
              />
            )}
          />
        </ContenedorAncho>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  contenedor: { flex: 1, backgroundColor: COLORES_ADMIN.background },
  centrado: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: ESPACIADO_ADMIN.xxl },
  lista: { padding: ESPACIADO_ADMIN.xl, gap: ESPACIADO_ADMIN.sm },
});
