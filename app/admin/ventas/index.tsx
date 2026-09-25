import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { calcularRangoDiaBogota, calcularRangoHoyBogota } from '@/core/analitica';
import { formatearPesos } from '@/core/dinero';
import type { Venta } from '@/core/tipos';
import { exportarAExcel } from '@/db/exportarExcel';
import { getDb } from '@/db/client';
import { listarVentas } from '@/db/ventas';
import { CalendarioRango } from '@/ui/CalendarioRango';
import { ContenedorAncho } from '@/ui/ContenedorAncho';
import { Encabezado } from '@/ui/Encabezado';
import { EmptyState } from '@/ui/EmptyState';
import { FiltroSegmentado } from '@/ui/FiltroSegmentado';
import { FilaFiltrosSuperior, FiltrosAplicados, PanelFiltros } from '@/ui/PanelFiltros';
import { ListRow } from '@/ui/ListRow';
import { ANCHO_ADMIN, COLORES_ADMIN, ESPACIADO_ADMIN, RADII_ADMIN, TEXTO_ADMIN } from '@/ui/tema';
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

const OPCIONES_FILTRO: { valor: Filtro; etiqueta: string }[] = [
  { valor: 'ACTIVAS', etiqueta: 'Activas' },
  { valor: 'ANULADAS', etiqueta: 'Anuladas' },
];

export default function Ventas() {
  const usuario = useRequiereSesion(['ADMIN']);
  const [ventas, setVentas] = useState<Venta[]>([]);
  const [filtro, setFiltro] = useState<Filtro>('ACTIVAS');
  const [filtroFecha, setFiltroFecha] = useState<FiltroFecha>('TODOS');
  const [fechaEspecifica, setFechaEspecifica] = useState<string | null>(null);
  const [calendarioVisible, setCalendarioVisible] = useState(false);
  const [cargando, setCargando] = useState(true);
  const [exportando, setExportando] = useState(false);

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
      <Encabezado
        titulo="Ventas"
        rutaVolverTexto="Admin"
        accion={{
          icono: 'download-outline',
          texto: 'Excel',
          onPress: exportar,
        }}
      />

      <ContenedorAncho anchoMaximo={ANCHO_ADMIN.lista}>
        <View style={styles.controles}>
          <PanelFiltros>
            <FilaFiltrosSuperior
              separador={false}
              acciones={<FiltroSegmentado opciones={OPCIONES_FILTRO} valorActivo={filtro} onCambiar={setFiltro} />}
            >
              <FiltroSegmentado
                opciones={[
                  { valor: 'TODOS' as FiltroFecha, etiqueta: 'Todos los días' },
                  { valor: 'HOY' as FiltroFecha, etiqueta: 'Hoy' },
                  {
                    valor: 'ESPECIFICA' as FiltroFecha,
                    etiqueta:
                      filtroFecha === 'ESPECIFICA' && fechaEspecifica
                        ? formatearFechaCorta(fechaEspecifica)
                        : 'Elegir fecha',
                    icono: 'calendar-outline',
                  },
                ]}
                valorActivo={filtroFecha}
                onCambiar={(valor) => {
                  if (valor === 'ESPECIFICA') {
                    setCalendarioVisible(true);
                    return;
                  }
                  setFiltroFecha(valor);
                  if (valor === 'TODOS') setFechaEspecifica(null);
                }}
              />
            </FilaFiltrosSuperior>
            <FiltrosAplicados
              filtros={
                filtroFecha === 'ESPECIFICA' && fechaEspecifica
                  ? [
                      {
                        clave: 'fecha',
                        texto: `Fecha: ${formatearFechaCorta(fechaEspecifica)}`,
                        onQuitar: () => {
                          setFiltroFecha('TODOS');
                          setFechaEspecifica(null);
                        },
                      },
                    ]
                  : []
              }
              onLimpiar={() => {
                setFiltroFecha('TODOS');
                setFechaEspecifica(null);
              }}
            />
          </PanelFiltros>
        </View>
      </ContenedorAncho>

      {exportando && (
        <View style={styles.exportandoAviso}>
          <ActivityIndicator size="small" color={COLORES_ADMIN.vino} />
        </View>
      )}

      {cargando ? (
        <View style={styles.centrado}>
          <ActivityIndicator size="large" color={COLORES_ADMIN.vino} />
        </View>
      ) : ventas.length === 0 ? (
        <EmptyState
          icono="receipt-outline"
          mensaje={
            filtroFecha === 'TODOS'
              ? filtro === 'ACTIVAS'
                ? 'Todavía no se ha registrado ninguna venta.'
                : 'No hay ventas anuladas.'
              : filtro === 'ACTIVAS'
                ? 'No hay ventas registradas ese día.'
                : 'No hay ventas anuladas ese día.'
          }
        />
      ) : (
        <ContenedorAncho anchoMaximo={ANCHO_ADMIN.lista} llenarAlto>
          <FlatList
            data={ventas}
            keyExtractor={(v) => v.id}
            contentContainerStyle={styles.lista}
            renderItem={({ item }) => (
              <ListRow
                titulo={item.promotorNombre}
                subtitulo={`${item.numeroRecibo} · ${formatearFecha(item.tsCliente)} · ${
                  item.metodoPago.charAt(0) + item.metodoPago.slice(1).toLowerCase()
                }`}
                valor={formatearPesos(item.total)}
                badge={item.anulada ? 'Anulada' : undefined}
                onPress={() => router.push(`/admin/ventas/${item.id}`)}
              />
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
    backgroundColor: COLORES_ADMIN.background,
  },
  controles: {
    paddingHorizontal: ESPACIADO_ADMIN.xl,
    paddingTop: ESPACIADO_ADMIN.lg,
    paddingBottom: ESPACIADO_ADMIN.sm,
  },
  exportandoAviso: {
    paddingHorizontal: ESPACIADO_ADMIN.xl,
    paddingTop: ESPACIADO_ADMIN.sm,
  },
  fondoModal: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: ESPACIADO_ADMIN.xl,
  },
  tarjetaCalendario: {
    backgroundColor: COLORES_ADMIN.superficieMasBaja,
    borderRadius: RADII_ADMIN.lg,
    padding: ESPACIADO_ADMIN.xl,
    gap: ESPACIADO_ADMIN.lg,
    alignItems: 'center',
  },
  modalTitulo: {
    ...TEXTO_ADMIN.tituloSeccion,
  },
  modalCerrar: {
    paddingVertical: ESPACIADO_ADMIN.sm,
  },
  modalCerrarTexto: {
    ...TEXTO_ADMIN.boton,
    color: COLORES_ADMIN.textoSecundario,
  },
  centrado: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: ESPACIADO_ADMIN.xxl,
  },
  lista: {
    padding: ESPACIADO_ADMIN.xl,
    gap: ESPACIADO_ADMIN.md,
  },
});
