import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import { formatearPesos } from '@/core/dinero';
import type { Venta, VentaItem } from '@/core/tipos';
import { getDb } from '@/db/client';
import { obtenerVenta } from '@/db/ventas';
import { COLORES } from '@/ui/colores';
import { useRequiereSesion } from '@/ui/useRequiereSesion';

function formatearFecha(tsCliente: string): string {
  const fecha = new Date(tsCliente);
  return fecha.toLocaleString('es-CO', { dateStyle: 'long', timeStyle: 'short' });
}

const ETIQUETAS_METODO: Record<string, string> = {
  EFECTIVO: 'Efectivo',
  TRANSFERENCIA: 'Transferencia',
  LIBRANZA: 'Libranza',
};

export default function DetalleVenta() {
  const usuario = useRequiereSesion(['ADMIN']);
  const { id } = useLocalSearchParams<{ id: string }>();
  const [venta, setVenta] = useState<Venta | null>(null);
  const [items, setItems] = useState<VentaItem[]>([]);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    (async () => {
      const db = await getDb();
      const resultado = await obtenerVenta(db, id);
      setVenta(resultado?.venta ?? null);
      setItems(resultado?.items ?? []);
      setCargando(false);
    })();
  }, [id]);

  if (!usuario) return null;

  return (
    <View style={styles.contenedor}>
      <View style={styles.encabezado}>
        <Pressable onPress={() => router.back()}>
          <Text style={styles.volver}>‹ Ventas</Text>
        </Pressable>
        <Text style={styles.titulo}>Detalle de venta</Text>
      </View>

      {cargando ? (
        <View style={styles.centrado}>
          <ActivityIndicator size="large" color={COLORES.oscuro} />
        </View>
      ) : !venta ? (
        <View style={styles.centrado}>
          <Text style={styles.vacio}>Esta venta ya no existe.</Text>
        </View>
      ) : (
        <>
          <View style={styles.resumen}>
            <Text style={styles.resumenPromotor}>{venta.promotorNombre}</Text>
            <Text style={styles.resumenDetalle}>
              {venta.numeroRecibo} · {formatearFecha(venta.tsCliente)}
            </Text>
            <Text style={styles.resumenDetalle}>
              Pagado con {ETIQUETAS_METODO[venta.metodoPago] ?? venta.metodoPago}
            </Text>
          </View>

          <FlatList
            data={items}
            keyExtractor={(item) => item.productoId}
            contentContainerStyle={styles.lista}
            renderItem={({ item }) => (
              <View style={styles.fila}>
                <View style={styles.filaTexto}>
                  <Text style={styles.filaNombre} numberOfLines={2}>
                    {item.productoNombre}
                  </Text>
                  <Text style={styles.filaDetalle}>
                    {item.cantidad} × {formatearPesos(item.precioUnitario)}
                  </Text>
                </View>
                <Text style={styles.filaSubtotal}>
                  {formatearPesos(item.cantidad * item.precioUnitario)}
                </Text>
              </View>
            )}
          />

          <View style={styles.pie}>
            <Text style={styles.totalEtiqueta}>Total</Text>
            <Text style={styles.totalValor}>{formatearPesos(venta.total)}</Text>
          </View>
        </>
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
    gap: 4,
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
  },
  resumen: {
    backgroundColor: '#FFFFFF',
    margin: 20,
    marginBottom: 0,
    borderRadius: 14,
    padding: 16,
    gap: 4,
  },
  resumenPromotor: {
    fontSize: 16,
    fontWeight: '700',
    color: '#333',
  },
  resumenDetalle: {
    fontSize: 13,
    color: '#777',
  },
  lista: {
    padding: 20,
    gap: 10,
  },
  fila: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 12,
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
    color: '#888',
  },
  filaSubtotal: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORES.oscuro,
  },
  pie: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    marginHorizontal: 20,
    marginBottom: 20,
    padding: 16,
    borderRadius: 14,
  },
  totalEtiqueta: {
    fontSize: 15,
    fontWeight: '600',
    color: '#555',
  },
  totalValor: {
    fontSize: 20,
    fontWeight: '800',
    color: COLORES.oscuro,
  },
});
