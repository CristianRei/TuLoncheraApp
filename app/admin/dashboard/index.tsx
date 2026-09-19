import { router, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { formatearPesos } from '@/core/dinero';
import { getDb } from '@/db/client';
import { obtenerResumenVentas, obtenerSaldoTotalBodega, type RangoFechas, type ResumenVentasPeriodo, type SaldoTotalBodega } from '@/db/analitica';
import { COLORES } from '@/ui/colores';
import { ContenedorAncho } from '@/ui/ContenedorAncho';
import { useEsPantallaAncha } from '@/ui/useEsPantallaAncha';
import { useRequiereSesion } from '@/ui/useRequiereSesion';

type Periodo = 'HOY' | 'SEMANA' | 'MES';

const OFFSET_BOGOTA_MS = 5 * 60 * 60 * 1000;

const ETIQUETAS_PERIODO: Record<Periodo, string> = {
  HOY: 'Hoy',
  SEMANA: 'Últimos 7 días',
  MES: 'Últimos 30 días',
};

const DIAS_POR_PERIODO: Record<Periodo, number> = {
  HOY: 1,
  SEMANA: 7,
  MES: 30,
};

/** Medianoche de hoy en Bogotá, menos N días, convertida a ISO UTC. */
function calcularRango(periodo: Periodo): RangoFechas {
  const ahoraBogota = new Date(Date.now() - OFFSET_BOGOTA_MS);
  const medianocheBogota = new Date(
    Date.UTC(ahoraBogota.getUTCFullYear(), ahoraBogota.getUTCMonth(), ahoraBogota.getUTCDate())
  );
  const desdeBogota = new Date(
    medianocheBogota.getTime() - (DIAS_POR_PERIODO[periodo] - 1) * 24 * 60 * 60 * 1000
  );

  return {
    desde: new Date(desdeBogota.getTime() + OFFSET_BOGOTA_MS).toISOString(),
    hasta: new Date().toISOString(),
  };
}

const ETIQUETAS_METODO: Record<string, string> = {
  EFECTIVO: 'Efectivo',
  TRANSFERENCIA: 'Transferencia',
  LIBRANZA: 'Libranza',
};

const ALTURA_MAXIMA_BARRA = 80;

function GraficoHoras({ porHora }: { porHora: ResumenVentasPeriodo['porHora'] }) {
  const porHoraCompleto = useMemo(() => {
    const mapa = new Map(porHora.map((h) => [h.hora, h.cantidadVentas]));
    return Array.from({ length: 24 }, (_, hora) => mapa.get(hora) ?? 0);
  }, [porHora]);

  const maximo = Math.max(1, ...porHoraCompleto);

  return (
    <View style={styles.grafico}>
      {porHoraCompleto.map((cantidad, hora) => (
        <View key={hora} style={styles.barraColumna}>
          <View
            style={[
              styles.barra,
              {
                height: Math.max(2, (cantidad / maximo) * ALTURA_MAXIMA_BARRA),
                backgroundColor: cantidad > 0 ? COLORES.primario : '#EEE',
              },
            ]}
          />
          {hora % 3 === 0 && <Text style={styles.barraEtiqueta}>{hora}</Text>}
        </View>
      ))}
    </View>
  );
}

export default function Dashboard() {
  const usuario = useRequiereSesion(['ADMIN']);
  const anchaPantalla = useEsPantallaAncha();
  const [periodo, setPeriodo] = useState<Periodo>('HOY');
  const [resumen, setResumen] = useState<ResumenVentasPeriodo | null>(null);
  const [saldoBodega, setSaldoBodega] = useState<SaldoTotalBodega | null>(null);
  const [cargando, setCargando] = useState(true);
  const insets = useSafeAreaInsets();

  const cargar = useCallback(async (periodoActual: Periodo) => {
    setCargando(true);
    try {
      const db = await getDb();
      const rango = calcularRango(periodoActual);
      const [resumenVentas, saldo] = await Promise.all([
        obtenerResumenVentas(db, rango),
        obtenerSaldoTotalBodega(db),
      ]);
      setResumen(resumenVentas);
      setSaldoBodega(saldo);
    } finally {
      setCargando(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      cargar(periodo);
    }, [cargar, periodo])
  );

  if (!usuario) return null;

  return (
    <View style={styles.contenedor}>
      <View style={[styles.encabezado, { paddingTop: insets.top + 20 }]}>
        <ContenedorAncho anchoMaximo={960}>
          <View style={styles.encabezadoFila}>
            <Pressable onPress={() => router.back()}>
              <Text style={styles.volver}>‹ Admin</Text>
            </Pressable>
            <Text style={styles.titulo}>Dashboard</Text>
            <View style={{ width: 40 }} />
          </View>
        </ContenedorAncho>
      </View>

      {!anchaPantalla ? (
        <View style={styles.centrado}>
          <Text style={styles.avisoAngosto}>
            Este panel está optimizado para pantalla ancha. Ábrelo desde un computador o tablet.
          </Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.scroll}>
          <ContenedorAncho anchoMaximo={960}>
            <View style={styles.tabs}>
              {(Object.keys(ETIQUETAS_PERIODO) as Periodo[]).map((p) => (
                <Pressable
                  key={p}
                  style={[styles.tab, periodo === p && styles.tabActivo]}
                  onPress={() => setPeriodo(p)}
                >
                  <Text style={[styles.tabTexto, periodo === p && styles.tabTextoActivo]}>
                    {ETIQUETAS_PERIODO[p]}
                  </Text>
                </Pressable>
              ))}
            </View>

            {cargando || !resumen || !saldoBodega ? (
              <View style={styles.centrado}>
                <ActivityIndicator size="large" color={COLORES.oscuro} />
              </View>
            ) : (
              <View style={styles.cuerpo}>
                <View style={styles.filaKpis}>
                  <View style={styles.kpi}>
                    <Text style={styles.kpiEtiqueta}>Total vendido</Text>
                    <Text style={styles.kpiValor}>{formatearPesos(resumen.totalVendido)}</Text>
                  </View>
                  <View style={styles.kpi}>
                    <Text style={styles.kpiEtiqueta}>Ventas</Text>
                    <Text style={styles.kpiValor}>{resumen.cantidadVentas}</Text>
                  </View>
                  <View style={styles.kpi}>
                    <Text style={styles.kpiEtiqueta}>Saldo en bodega</Text>
                    <Text style={styles.kpiValor}>{saldoBodega.totalUnidades} und.</Text>
                    {saldoBodega.valorEstimado !== null && (
                      <Text style={styles.kpiSubtexto}>
                        ≈ {formatearPesos(saldoBodega.valorEstimado)}
                      </Text>
                    )}
                  </View>
                </View>

                <Text style={styles.seccionTitulo}>Por método de pago</Text>
                <View style={styles.filaKpis}>
                  {resumen.porMetodoPago.length === 0 ? (
                    <Text style={styles.vacio}>Sin ventas en este período.</Text>
                  ) : (
                    resumen.porMetodoPago.map((m) => (
                      <View key={m.metodoPago} style={styles.kpi}>
                        <Text style={styles.kpiEtiqueta}>{ETIQUETAS_METODO[m.metodoPago]}</Text>
                        <Text style={styles.kpiValor}>{formatearPesos(m.total)}</Text>
                        <Text style={styles.kpiSubtexto}>{m.cantidadVentas} ventas</Text>
                      </View>
                    ))
                  )}
                </View>

                <Text style={styles.seccionTitulo}>Hora del día con más ventas</Text>
                <View style={styles.tarjeta}>
                  {resumen.cantidadVentas === 0 ? (
                    <Text style={styles.vacio}>Sin ventas en este período.</Text>
                  ) : (
                    <GraficoHoras porHora={resumen.porHora} />
                  )}
                </View>

                <Text style={styles.seccionTitulo}>Productos más vendidos</Text>
                <View style={styles.tarjeta}>
                  {resumen.topProductos.length === 0 ? (
                    <Text style={styles.vacio}>Sin ventas en este período.</Text>
                  ) : (
                    resumen.topProductos.map((p, indice) => (
                      <View
                        key={p.productoId}
                        style={[
                          styles.filaProducto,
                          indice < resumen.topProductos.length - 1 && styles.filaProductoBorde,
                        ]}
                      >
                        <Text style={styles.filaProductoNombre}>{p.productoNombre}</Text>
                        <Text style={styles.filaProductoUnidades}>{p.unidadesVendidas} und.</Text>
                        <Text style={styles.filaProductoTotal}>{formatearPesos(p.totalVendido)}</Text>
                      </View>
                    ))
                  )}
                </View>
              </View>
            )}
          </ContenedorAncho>
        </ScrollView>
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
  centrado: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  avisoAngosto: {
    fontSize: 14,
    color: '#888',
    textAlign: 'center',
    maxWidth: 320,
  },
  scroll: {
    paddingBottom: 40,
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
  cuerpo: {
    padding: 20,
    gap: 20,
  },
  filaKpis: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  kpi: {
    flex: 1,
    minWidth: 180,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 16,
    gap: 4,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  kpiEtiqueta: {
    fontSize: 12,
    color: '#888',
    fontWeight: '600',
  },
  kpiValor: {
    fontSize: 20,
    fontWeight: '800',
    color: COLORES.oscuro,
  },
  kpiSubtexto: {
    fontSize: 12,
    color: '#999',
  },
  seccionTitulo: {
    fontSize: 15,
    fontWeight: '700',
    color: '#333',
    marginTop: 4,
  },
  vacio: {
    fontSize: 13,
    color: '#888',
  },
  tarjeta: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 16,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  grafico: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 4,
    height: ALTURA_MAXIMA_BARRA + 20,
  },
  barraColumna: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 4,
  },
  barra: {
    width: '100%',
    borderRadius: 3,
    minWidth: 4,
  },
  barraEtiqueta: {
    fontSize: 9,
    color: '#999',
  },
  filaProducto: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    gap: 8,
  },
  filaProductoBorde: {
    borderBottomWidth: 1,
    borderBottomColor: '#F1E4E4',
  },
  filaProductoNombre: {
    flex: 2,
    fontSize: 13,
    color: '#333',
    fontWeight: '600',
  },
  filaProductoUnidades: {
    flex: 1,
    fontSize: 13,
    color: '#888',
    textAlign: 'right',
  },
  filaProductoTotal: {
    flex: 1,
    fontSize: 13,
    color: COLORES.oscuro,
    fontWeight: '700',
    textAlign: 'right',
  },
});
