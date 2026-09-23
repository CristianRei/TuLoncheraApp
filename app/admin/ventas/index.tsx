import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { calcularRangoDiaBogota, calcularRangoHoyBogota } from '@/core/analitica';
import { formatearPesos } from '@/core/dinero';
import type { Venta } from '@/core/tipos';
import { exportarAExcel } from '@/db/exportarExcel';
import { getDb } from '@/db/client';
import { listarVentas } from '@/db/ventas';
import { COLORES } from '@/ui/colores';
import { CalendarioRango } from '@/ui/CalendarioRango';
import { ContenedorAncho } from '@/ui/ContenedorAncho';
import { useEsPantallaAncha } from '@/ui/useEsPantallaAncha';
import { useRequiereSesion } from '@/ui/useRequiereSesion';
import { useRecargarConDatosNuevos } from '@/ui/useVersionDatos';

type Filtro = 'ACTIVAS' | 'ANULADAS';
type FiltroFecha = 'TODOS' | 'HOY' | 'ESPECIFICA';

function formatearFecha(tsCliente: string): string {
  const fecha = new Date(tsCliente);
  return fecha.toLocaleString('es-CO', {
    dateStyle: 'short',
    timeStyle: 'short',
  });
}

/** "AAAA-MM-DD" → "15 ene" — para el chip de fecha específica. */
function formatearFechaCorta(fecha: string): string {
  return new Date(`${fecha}T12:00:00`).toLocaleDateString('es-CO', { day: 'numeric', month: 'short' });
}

export default function Ventas() {
  const usuario = useRequiereSesion(['ADMIN']);
  const [ventas, setVentas] = useState<Venta[]>([]);
  const [filtro, setFiltro] = useState<Filtro>('ACTIVAS');
  const [filtroFecha, setFiltroFecha] = useState<FiltroFecha>('TODOS');
  const [fechaEspecifica, setFechaEspecifica] = useState<string | null>(null);
  const [calendarioVisible, setCalendarioVisible] = useState(false);
  const [cargando, setCargando] = useState(true);
  const [exportando, setExportando] = useState(false);
  const insets = useSafeAreaInsets();
  const anchaPantalla = useEsPantallaAncha();

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

  const cargar = useCallback(
    async (filtroActual: Filtro, filtroFechaActual: FiltroFecha, fechaActual: string | null) => {
      setCargando(true);
      try {
        const db = await getDb();
        const rango =
          filtroFechaActual === 'HOY'
            ? calcularRangoHoyBogota()
            : filtroFechaActual === 'ESPECIFICA' && fechaActual
              ? calcularRangoDiaBogota(fechaActual)
              : undefined;
        setVentas(await listarVentas(db, { incluirAnuladas: filtroActual === 'ANULADAS', rango }));
      } finally {
        setCargando(false);
      }
    },
    []
  );

  useFocusEffect(
    useCallback(() => {
      cargar(filtro, filtroFecha, fechaEspecifica);
    }, [cargar, filtro, filtroFecha, fechaEspecifica])
  );
  // La lista se actualiza sola cuando llega una venta nueva de otro
  // dispositivo (Realtime) — ver src/ui/useSincronizacionEnVivo.ts.
  useRecargarConDatosNuevos(() => cargar(filtro, filtroFecha, fechaEspecifica));

  if (!usuario) return null;

  return (
    <View style={styles.contenedor}>
      <View
        style={[
          anchaPantalla ? styles.encabezadoAncho : styles.encabezado,
          { paddingTop: anchaPantalla ? 20 : insets.top + 20 },
        ]}
      >
        <ContenedorAncho anchoMaximo={720}>
          <View style={styles.encabezadoFila}>
            {!anchaPantalla && (
              <Pressable onPress={() => router.back()}>
                <Text style={styles.volver}>‹ Admin</Text>
              </Pressable>
            )}
            <Text style={anchaPantalla ? styles.tituloAncho : styles.titulo}>Ventas</Text>
            <Pressable onPress={exportar} disabled={exportando || ventas.length === 0}>
              {exportando ? (
                <ActivityIndicator size="small" color={anchaPantalla ? COLORES.oscuro : '#FFFFFF'} />
              ) : (
                <Text style={anchaPantalla ? styles.exportarAncho : styles.exportar}>Excel</Text>
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

        <View style={[styles.tabs, styles.tabsFecha]}>
          <Pressable
            style={[styles.tab, filtroFecha === 'TODOS' && styles.tabActivo]}
            onPress={() => {
              setFiltroFecha('TODOS');
              setFechaEspecifica(null);
            }}
          >
            <Text style={[styles.tabTexto, filtroFecha === 'TODOS' && styles.tabTextoActivo]}>
              Todos los días
            </Text>
          </Pressable>
          <Pressable
            style={[styles.tab, filtroFecha === 'HOY' && styles.tabActivo]}
            onPress={() => setFiltroFecha('HOY')}
          >
            <Text style={[styles.tabTexto, filtroFecha === 'HOY' && styles.tabTextoActivo]}>Hoy</Text>
          </Pressable>
          <Pressable
            style={[styles.tab, styles.tabFecha, filtroFecha === 'ESPECIFICA' && styles.tabActivo]}
            onPress={() => setCalendarioVisible(true)}
          >
            <Ionicons
              name="calendar-outline"
              size={13}
              color={filtroFecha === 'ESPECIFICA' ? '#FFFFFF' : '#666'}
            />
            <Text style={[styles.tabTexto, filtroFecha === 'ESPECIFICA' && styles.tabTextoActivo]}>
              {filtroFecha === 'ESPECIFICA' && fechaEspecifica
                ? formatearFechaCorta(fechaEspecifica)
                : 'Elegir fecha'}
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
            {filtroFecha === 'TODOS'
              ? filtro === 'ACTIVAS'
                ? 'Todavía no se ha registrado ninguna venta.'
                : 'No hay ventas anuladas.'
              : filtro === 'ACTIVAS'
                ? 'No hay ventas registradas ese día.'
                : 'No hay ventas anuladas ese día.'}
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

      <Modal visible={calendarioVisible} animationType="fade" transparent>
        <View style={styles.fondoModal}>
          <View style={styles.tarjetaCalendario}>
            <Text style={styles.modalTitulo}>Elige el día</Text>
            <CalendarioRango
              desde={fechaEspecifica}
              hasta={fechaEspecifica}
              onCambiar={(desde) => {
                if (desde) {
                  setFechaEspecifica(desde);
                  setFiltroFecha('ESPECIFICA');
                  setCalendarioVisible(false);
                } else {
                  setFechaEspecifica(null);
                }
              }}
            />
            <Pressable style={styles.modalCerrar} onPress={() => setCalendarioVisible(false)}>
              <Text style={styles.modalCerrarTexto}>Cerrar</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
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
  encabezadoAncho: {
    backgroundColor: 'transparent',
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
  tituloAncho: {
    color: COLORES.oscuro,
    fontSize: 20,
    fontWeight: '700',
  },
  exportar: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
    textDecorationLine: 'underline',
  },
  exportarAncho: {
    color: COLORES.oscuro,
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
  tabsFecha: {
    paddingTop: 10,
  },
  tabFecha: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  fondoModal: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  tarjetaCalendario: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 20,
    gap: 14,
    alignItems: 'center',
  },
  modalTitulo: {
    fontSize: 16,
    fontWeight: '700',
    color: '#333',
  },
  modalCerrar: {
    paddingVertical: 6,
  },
  modalCerrarTexto: {
    fontSize: 14,
    fontWeight: '600',
    color: '#888',
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
