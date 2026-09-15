import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { formatearPesos } from '@/core/dinero';
import type { Venta } from '@/core/tipos';
import { exportarAExcel } from '@/db/exportarExcel';
import { getDb } from '@/db/client';
import { listarVentas } from '@/db/ventas';
import { COLORES } from '@/ui/colores';
import { ContenedorAncho } from '@/ui/ContenedorAncho';
import { useRequiereSesion } from '@/ui/useRequiereSesion';

type Filtro = 'ACTIVAS' | 'ANULADAS';

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
  const [filtro, setFiltro] = useState<Filtro>('ACTIVAS');
  const [cargando, setCargando] = useState(true);
  const [exportando, setExportando] = useState(false);
  const insets = useSafeAreaInsets();

  async function exportar() {
    setExportando(true);
    try {
      await exportarAExcel(
        'Ventas',
        ventas.map((v) => ({
          Recibo: v.numeroRecibo,
          Promotor: v.promotorNombre,
          Fecha: formatearFecha(v.tsCliente),
          Método: v.metodoPago,
          Total: v.total,
          Anulada: v.anulada ? 'Sí' : 'No',
        })),
        'ventas'
      );
    } finally {
      setExportando(false);
    }
  }

  const cargar = useCallback(async (filtroActual: Filtro) => {
    setCargando(true);
    try {
      const db = await getDb();
      setVentas(await listarVentas(db, { incluirAnuladas: filtroActual === 'ANULADAS' }));
    } finally {
      setCargando(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      cargar(filtro);
    }, [cargar, filtro])
  );

  if (!usuario) return null;

  return (
    <View style={styles.contenedor}>
      <View style={[styles.encabezado, { paddingTop: insets.top + 20 }]}>
        <ContenedorAncho anchoMaximo={720}>
          <View style={styles.encabezadoFila}>
            <Pressable onPress={() => router.back()}>
              <Text style={styles.volver}>‹ Admin</Text>
            </Pressable>
            <Text style={styles.titulo}>Ventas</Text>
            <Pressable onPress={exportar} disabled={exportando || ventas.length === 0}>
              {exportando ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Text style={styles.exportar}>Excel</Text>
              )}
            </Pressable>
          </View>
        </ContenedorAncho>
      </View>

      <ContenedorAncho anchoMaximo={720}>
        <View style={styles.tabs}>
          <Pressable
            style={[styles.tab, filtro === 'ACTIVAS' && styles.tabActivo]}
            onPress={() => setFiltro('ACTIVAS')}
          >
            <Text style={[styles.tabTexto, filtro === 'ACTIVAS' && styles.tabTextoActivo]}>
              Activas
            </Text>
          </Pressable>
          <Pressable
            style={[styles.tab, filtro === 'ANULADAS' && styles.tabActivo]}
            onPress={() => setFiltro('ANULADAS')}
          >
            <Text style={[styles.tabTexto, filtro === 'ANULADAS' && styles.tabTextoActivo]}>
              Anuladas
            </Text>
          </Pressable>
        </View>
      </ContenedorAncho>

      {cargando ? (
        <View style={styles.centrado}>
          <ActivityIndicator size="large" color={COLORES.oscuro} />
        </View>
      ) : ventas.length === 0 ? (
        <View style={styles.centrado}>
          <Text style={styles.vacio}>
            {filtro === 'ACTIVAS'
              ? 'Todavía no se ha registrado ninguna venta.'
              : 'No hay ventas anuladas.'}
          </Text>
        </View>
      ) : (
        <ContenedorAncho anchoMaximo={720} llenarAlto>
          <FlatList
            data={ventas}
            keyExtractor={(v) => v.id}
            contentContainerStyle={styles.lista}
            renderItem={({ item }) => (
              <Pressable
                style={styles.fila}
                onPress={() => router.push(`/admin/ventas/${item.id}`)}
              >
                <View style={styles.filaTexto}>
                  <View style={styles.filaPromotorFila}>
                    <Text style={styles.filaPromotor}>{item.promotorNombre}</Text>
                    {item.anulada && (
                      <View style={styles.insigniaAnulada}>
                        <Text style={styles.insigniaAnuladaTexto}>Anulada</Text>
                      </View>
                    )}
                  </View>
                  <Text style={styles.filaDetalle}>
                    {item.numeroRecibo} · {formatearFecha(item.tsCliente)} ·{' '}
                    {item.metodoPago.charAt(0) + item.metodoPago.slice(1).toLowerCase()}
                  </Text>
                </View>
                <Text style={[styles.filaTotal, item.anulada && styles.filaTotalAnulada]}>
                  {formatearPesos(item.total)}
                </Text>
              </Pressable>
            )}
          />
        </ContenedorAncho>
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
    paddingHorizontal: 20,
    paddingBottom: 16,
  },
  encabezadoFila: {
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
  exportar: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
    textDecorationLine: 'underline',
  },
  tabs: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  tab: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#EBD3D3',
  },
  tabActivo: {
    backgroundColor: COLORES.oscuro,
    borderColor: COLORES.oscuro,
  },
  tabTexto: {
    fontSize: 13,
    fontWeight: '600',
    color: '#666',
  },
  tabTextoActivo: {
    color: '#FFFFFF',
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
  filaPromotorFila: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  filaPromotor: {
    fontSize: 14,
    fontWeight: '700',
    color: '#333',
  },
  insigniaAnulada: {
    backgroundColor: '#B00020',
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  insigniaAnuladaTexto: {
    fontSize: 10,
    fontWeight: '700',
    color: '#FFF',
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
  filaTotalAnulada: {
    color: '#999',
    textDecorationLine: 'line-through',
  },
});
