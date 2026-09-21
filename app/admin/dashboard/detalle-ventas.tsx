import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { agruparVentasPorDia, type VentasPorDia } from '@/core/analitica';
import { formatearPesos } from '@/core/dinero';
import type { MetodoPago } from '@/core/tipos';
import {
  listarVentasFiltradas,
  obtenerVentasPorPromotor,
  obtenerVentasPorPunto,
  type FiltrosVentas,
  type RangoFechas,
  type TotalPorPromotor,
  type TotalPorPunto,
  type VentaResumida,
} from '@/db/analitica';
import { getDb } from '@/db/client';
import { ContenedorAncho } from '@/ui/ContenedorAncho';
import { GraficoBarrasHorizontales } from '@/ui/graficas/GraficoBarrasHorizontales';
import { GraficoLinea } from '@/ui/graficas/GraficoLinea';
import { COLORES_ADMIN, TIPOGRAFIA_ADMIN } from '@/ui/tema';
import { useEsPantallaAncha } from '@/ui/useEsPantallaAncha';
import { useRequiereSesion } from '@/ui/useRequiereSesion';

type Metrica = 'total' | 'cantidad' | 'ticket';

const TITULOS: Record<Metrica, string> = {
  total: 'Total vendido',
  cantidad: 'Ventas emitidas',
  ticket: 'Ticket promedio',
};

const ETIQUETAS_METODO: Record<MetodoPago, string> = {
  EFECTIVO: 'Efectivo',
  TRANSFERENCIA: 'Transferencia',
  LIBRANZA: 'Libranza',
};

function valorDe(metrica: Metrica, totalVendido: number, cantidadVentas: number): number {
  if (metrica === 'total') return totalVendido;
  if (metrica === 'cantidad') return cantidadVentas;
  return cantidadVentas === 0 ? 0 : Math.round(totalVendido / cantidadVentas);
}

function formatearValor(metrica: Metrica, valor: number): string {
  return metrica === 'cantidad' ? String(valor) : formatearPesos(valor);
}

function formatearFechaHora(iso: string): string {
  return new Date(iso).toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' });
}

export default function DetalleVentas() {
  const usuario = useRequiereSesion(['ADMIN']);
  const anchaPantalla = useEsPantallaAncha();
  const insets = useSafeAreaInsets();
  const { metrica, desde, hasta, filtros: filtrosParam } = useLocalSearchParams<{
    metrica: Metrica;
    desde: string;
    hasta: string;
    filtros?: string;
  }>();

  const rango: RangoFechas = useMemo(() => ({ desde, hasta }), [desde, hasta]);
  const filtros: FiltrosVentas = useMemo(() => {
    try {
      return filtrosParam ? JSON.parse(filtrosParam) : {};
    } catch {
      return {};
    }
  }, [filtrosParam]);

  const [cargando, setCargando] = useState(true);
  const [ventas, setVentas] = useState<VentaResumida[]>([]);
  const [porPromotor, setPorPromotor] = useState<TotalPorPromotor[]>([]);
  const [porPunto, setPorPunto] = useState<TotalPorPunto[]>([]);
  const [porDia, setPorDia] = useState<VentasPorDia[]>([]);

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const db = await getDb();
      const [listaVentas, promotores, puntos] = await Promise.all([
        listarVentasFiltradas(db, rango, filtros),
        obtenerVentasPorPromotor(db, rango, filtros),
        obtenerVentasPorPunto(db, rango, filtros),
      ]);
      setVentas(listaVentas);
      setPorPromotor(promotores);
      setPorPunto(puntos);
      setPorDia(agruparVentasPorDia(listaVentas));
    } finally {
      setCargando(false);
    }
  }, [rango, filtros]);

  useEffect(() => {
    (async () => {
      await cargar();
    })();
  }, [cargar]);

  if (!usuario) return null;

  const titulo = metrica ? TITULOS[metrica] : '';

  return (
    <View style={styles.contenedor}>
      <View style={[styles.encabezado, { paddingTop: insets.top + 16 }]}>
        <ContenedorAncho anchoMaximo={1200}>
          <View style={styles.encabezadoFila}>
            <Pressable style={styles.volverBoton} onPress={() => router.back()}>
              <Ionicons name="chevron-back" size={16} color="#FFE9E2" />
              <Text style={styles.volverTexto}>Dashboard</Text>
            </Pressable>
            <Text style={styles.titulo}>{titulo}</Text>
          </View>
        </ContenedorAncho>
      </View>

      {!anchaPantalla ? (
        <View style={styles.centrado}>
          <Text style={styles.avisoAngosto}>
            Esta sección está optimizada para pantalla ancha. Ábrela desde un computador o tablet.
          </Text>
        </View>
      ) : cargando ? (
        <View style={styles.centrado}>
          <ActivityIndicator size="large" color={COLORES_ADMIN.vino} />
        </View>
      ) : (
        <FlatList
          contentContainerStyle={styles.scroll}
          data={ventas}
          keyExtractor={(v) => v.id}
          ListHeaderComponent={
            <ContenedorAncho anchoMaximo={1200}>
              <View style={styles.cuerpo}>
                {metrica && porDia.length > 0 && (
                  <View style={styles.tarjeta}>
                    <Text style={styles.seccionTitulo}>Evolución en el período</Text>
                    <GraficoLinea
                      puntos={porDia.map((d) => ({
                        etiqueta: d.fecha,
                        valor: valorDe(metrica, d.totalVendido, d.cantidadVentas),
                      }))}
                      formatearValor={(v) => (metrica === 'cantidad' ? String(v) : formatearPesos(v))}
                    />
                  </View>
                )}

                {metrica && porPromotor.length > 0 && (
                  <View style={styles.tarjeta}>
                    <Text style={styles.seccionTitulo}>Por promotor</Text>
                    <GraficoBarrasHorizontales
                      barras={porPromotor.map((p) => ({
                        etiqueta: p.promotorNombre,
                        valor: valorDe(metrica, p.totalVendido, p.cantidadVentas),
                      }))}
                      formatearValor={(v) => formatearValor(metrica, v)}
                    />
                  </View>
                )}

                {metrica && porPunto.length > 0 && (
                  <View style={styles.tarjeta}>
                    <Text style={styles.seccionTitulo}>Por punto</Text>
                    <GraficoBarrasHorizontales
                      barras={porPunto.map((p) => ({
                        etiqueta: `${p.empresaNombre} · ${p.puntoNombre}`,
                        valor: valorDe(metrica, p.totalVendido, p.cantidadVentas),
                      }))}
                      formatearValor={(v) => formatearValor(metrica, v)}
                    />
                  </View>
                )}

                <Text style={styles.seccionTitulo}>Transacciones ({ventas.length})</Text>
              </View>
            </ContenedorAncho>
          }
          ListEmptyComponent={
            <ContenedorAncho anchoMaximo={1200}>
              <Text style={styles.vacio}>Sin transacciones en este período.</Text>
            </ContenedorAncho>
          }
          renderItem={({ item }) => (
            <ContenedorAncho anchoMaximo={1200}>
              <Pressable style={styles.filaVenta} onPress={() => router.push(`/admin/ventas/${item.id}`)}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.filaVentaRecibo}>{item.numeroRecibo}</Text>
                  <Text style={styles.filaVentaDetalle} numberOfLines={1}>
                    {item.promotorNombre}
                    {item.puntoNombre ? ` · ${item.puntoNombre}` : ''} · {ETIQUETAS_METODO[item.metodoPago]}
                  </Text>
                  <Text style={styles.filaVentaFecha}>{formatearFechaHora(item.tsCliente)}</Text>
                </View>
                <Text style={styles.filaVentaTotal}>{formatearPesos(item.total)}</Text>
              </Pressable>
            </ContenedorAncho>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  contenedor: {
    flex: 1,
    backgroundColor: COLORES_ADMIN.background,
  },
  encabezado: {
    backgroundColor: COLORES_ADMIN.vino,
    paddingHorizontal: 20,
    paddingBottom: 16,
  },
  encabezadoFila: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  volverBoton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  volverTexto: {
    fontSize: 13,
    fontFamily: TIPOGRAFIA_ADMIN.medio,
    color: '#FFE9E2',
  },
  titulo: {
    fontSize: 17,
    fontFamily: TIPOGRAFIA_ADMIN.semiNegrita,
    color: '#FFFFFF',
  },
  centrado: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  avisoAngosto: {
    fontSize: 14,
    fontFamily: TIPOGRAFIA_ADMIN.regular,
    color: COLORES_ADMIN.textoSecundario,
    textAlign: 'center',
    maxWidth: 320,
  },
  scroll: {
    paddingBottom: 40,
  },
  cuerpo: {
    paddingHorizontal: 20,
    paddingTop: 20,
    gap: 14,
  },
  tarjeta: {
    backgroundColor: COLORES_ADMIN.superficieMasBaja,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORES_ADMIN.bordeSuave,
    padding: 16,
    gap: 10,
  },
  seccionTitulo: {
    fontSize: 15,
    fontFamily: TIPOGRAFIA_ADMIN.semiNegrita,
    color: COLORES_ADMIN.texto,
  },
  vacio: {
    paddingHorizontal: 20,
    fontSize: 13,
    fontFamily: TIPOGRAFIA_ADMIN.regular,
    color: COLORES_ADMIN.textoSecundario,
  },
  filaVenta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORES_ADMIN.superficie,
  },
  filaVentaRecibo: {
    fontSize: 13,
    fontFamily: TIPOGRAFIA_ADMIN.semiNegrita,
    color: COLORES_ADMIN.texto,
  },
  filaVentaDetalle: {
    fontSize: 12,
    fontFamily: TIPOGRAFIA_ADMIN.regular,
    color: COLORES_ADMIN.textoSecundario,
    marginTop: 2,
  },
  filaVentaFecha: {
    fontSize: 11,
    fontFamily: TIPOGRAFIA_ADMIN.monoRegular,
    color: COLORES_ADMIN.textoSecundario,
    marginTop: 2,
  },
  filaVentaTotal: {
    fontSize: 13,
    fontFamily: TIPOGRAFIA_ADMIN.monoSemiNegrita,
    color: COLORES_ADMIN.texto,
  },
});
