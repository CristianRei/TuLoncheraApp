import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { formatearPesos } from '@/core/dinero';
import type { MetodoPago } from '@/core/tipos';
import { getDb } from '@/db/client';
import {
  compararConPeriodoAnterior,
  listarProductosVendidos,
  listarVentasFiltradas,
  type FiltrosVentas,
  type ProductoMasVendido,
  type RangoFechas,
  type VentaResumida,
} from '@/db/analitica';
import { COLORES_ADMIN, TIPOGRAFIA_ADMIN } from './tema';

const ETIQUETAS_METODO: Record<MetodoPago, string> = {
  EFECTIVO: 'Efectivo',
  TRANSFERENCIA: 'Transferencia',
  LIBRANZA: 'Libranza',
};

export type SeccionDetalle =
  | { campo: 'metodoPago'; valor: MetodoPago; titulo: string }
  | { campo: 'promotorId'; valor: string; titulo: string }
  | { campo: 'puntoId'; valor: string; titulo: string }
  | { campo: 'categoriaId'; valor: string; titulo: string };

interface Props {
  seccion: SeccionDetalle | null;
  rango: RangoFechas | null;
  filtrosBase: FiltrosVentas;
  onCerrar: () => void;
}

function formatearFechaHora(iso: string): string {
  return new Date(iso).toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' });
}

/**
 * Detalle expandido de una sección del dashboard (Por método de pago, Por
 * promotor, Por punto, Por categoría): transacciones completas del período
 * con ese filtro adicional aplicado, productos top, y comparación contra el
 * período anterior — mismo patrón visual de modal que CalendarioRango.
 */
export function ModalDetalleSeccion({ seccion, rango, filtrosBase, onCerrar }: Props) {
  const [cargando, setCargando] = useState(true);
  const [ventas, setVentas] = useState<VentaResumida[]>([]);
  const [productos, setProductos] = useState<ProductoMasVendido[]>([]);
  const [variacionTotalPct, setVariacionTotalPct] = useState<number | null>(null);
  const [variacionCantidadPct, setVariacionCantidadPct] = useState<number | null>(null);
  const [totalVendido, setTotalVendido] = useState(0);
  const [cantidadVentas, setCantidadVentas] = useState(0);

  useEffect(() => {
    if (!seccion || !rango) return;
    let cancelado = false;
    (async () => {
      setCargando(true);
      try {
        const filtros: FiltrosVentas = { ...filtrosBase, [seccion.campo]: seccion.valor };
        const db = await getDb();
        const [listaVentas, listaProductos, comparacion] = await Promise.all([
          listarVentasFiltradas(db, rango, filtros),
          listarProductosVendidos(db, rango, filtros),
          compararConPeriodoAnterior(db, rango, filtros),
        ]);
        if (cancelado) return;
        setVentas(listaVentas);
        setProductos(listaProductos);
        setVariacionTotalPct(comparacion.variacionTotalPct);
        setVariacionCantidadPct(comparacion.variacionCantidadPct);
        setTotalVendido(comparacion.totalVendido);
        setCantidadVentas(comparacion.cantidadVentas);
      } finally {
        if (!cancelado) setCargando(false);
      }
    })();
    return () => {
      cancelado = true;
    };
  }, [seccion, rango, filtrosBase]);

  return (
    <Modal visible={seccion !== null} animationType="slide" transparent>
      <View style={styles.fondoModal}>
        <View style={styles.tarjeta}>
          <View style={styles.encabezado}>
            <Text style={styles.titulo}>{seccion?.titulo}</Text>
            <Pressable onPress={onCerrar}>
              <Ionicons name="close" size={20} color={COLORES_ADMIN.textoSecundario} />
            </Pressable>
          </View>

          {cargando ? (
            <View style={styles.centrado}>
              <ActivityIndicator size="large" color={COLORES_ADMIN.vino} />
            </View>
          ) : (
            <FlatList
              data={ventas}
              keyExtractor={(v) => v.id}
              ListHeaderComponent={
                <View style={styles.resumen}>
                  <View style={styles.filaKpis}>
                    <View style={styles.kpi}>
                      <Text style={styles.kpiEtiqueta}>Total vendido</Text>
                      <Text style={styles.kpiValor}>{formatearPesos(totalVendido)}</Text>
                      <Variacion pct={variacionTotalPct} />
                    </View>
                    <View style={styles.kpi}>
                      <Text style={styles.kpiEtiqueta}>Ventas</Text>
                      <Text style={styles.kpiValor}>{cantidadVentas}</Text>
                      <Variacion pct={variacionCantidadPct} />
                    </View>
                  </View>

                  {productos.length > 0 && (
                    <View style={styles.seccionProductos}>
                      <Text style={styles.seccionTitulo}>Productos</Text>
                      {productos.slice(0, 8).map((p) => (
                        <View key={p.productoId} style={styles.filaProducto}>
                          <Text style={styles.filaProductoNombre} numberOfLines={1}>
                            {p.productoNombre}
                          </Text>
                          <Text style={styles.filaProductoUnidades}>{p.unidadesVendidas} und.</Text>
                          <Text style={styles.filaProductoTotal}>{formatearPesos(p.totalVendido)}</Text>
                        </View>
                      ))}
                    </View>
                  )}

                  <Text style={styles.seccionTitulo}>
                    Transacciones ({ventas.length})
                  </Text>
                </View>
              }
              ListEmptyComponent={<Text style={styles.vacio}>Sin transacciones en este período.</Text>}
              renderItem={({ item }) => (
                <View style={styles.filaVenta}>
                  <View style={styles.filaVentaTexto}>
                    <Text style={styles.filaVentaRecibo}>{item.numeroRecibo}</Text>
                    <Text style={styles.filaVentaSub}>
                      {item.promotorNombre}
                      {item.puntoNombre ? ` · ${item.puntoNombre}` : ''} ·{' '}
                      {ETIQUETAS_METODO[item.metodoPago]}
                    </Text>
                    <Text style={styles.filaVentaFecha}>{formatearFechaHora(item.tsCliente)}</Text>
                  </View>
                  <Text style={styles.filaVentaMonto}>{formatearPesos(item.total)}</Text>
                </View>
              )}
              contentContainerStyle={styles.lista}
            />
          )}
        </View>
      </View>
    </Modal>
  );
}

function Variacion({ pct }: { pct: number | null }) {
  if (pct === null) return <Text style={styles.variacionNeutral}>Sin dato del período anterior</Text>;
  const positivo = pct >= 0;
  return (
    <View style={styles.variacionFila}>
      <Ionicons
        name={positivo ? 'arrow-up' : 'arrow-down'}
        size={11}
        color={positivo ? COLORES_ADMIN.positivo : COLORES_ADMIN.error}
      />
      <Text style={[styles.variacionTexto, { color: positivo ? COLORES_ADMIN.positivo : COLORES_ADMIN.error }]}>
        {Math.abs(pct)}% vs. período anterior
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  fondoModal: {
    flex: 1,
    backgroundColor: 'rgba(41,23,15,0.45)',
    justifyContent: 'flex-end',
  },
  tarjeta: {
    backgroundColor: COLORES_ADMIN.background,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    height: '85%',
  },
  encabezado: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORES_ADMIN.superficie,
  },
  titulo: {
    fontSize: 16,
    fontFamily: TIPOGRAFIA_ADMIN.semiNegrita,
    color: COLORES_ADMIN.vino,
  },
  centrado: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  resumen: {
    padding: 20,
    gap: 16,
  },
  filaKpis: {
    flexDirection: 'row',
    gap: 12,
  },
  kpi: {
    flex: 1,
    backgroundColor: COLORES_ADMIN.superficieMasBaja,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORES_ADMIN.bordeSuave,
    padding: 14,
    gap: 4,
  },
  kpiEtiqueta: {
    fontSize: 10.5,
    fontFamily: TIPOGRAFIA_ADMIN.semiNegrita,
    color: COLORES_ADMIN.textoSecundario,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  kpiValor: {
    fontSize: 19,
    fontFamily: TIPOGRAFIA_ADMIN.monoSemiNegrita,
    color: COLORES_ADMIN.vino,
  },
  variacionFila: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  variacionTexto: {
    fontSize: 10.5,
    fontFamily: TIPOGRAFIA_ADMIN.semiNegrita,
  },
  variacionNeutral: {
    fontSize: 10.5,
    fontFamily: TIPOGRAFIA_ADMIN.regular,
    color: COLORES_ADMIN.textoSecundario,
  },
  seccionProductos: {
    gap: 8,
  },
  seccionTitulo: {
    fontSize: 13,
    fontFamily: TIPOGRAFIA_ADMIN.semiNegrita,
    color: COLORES_ADMIN.vino,
  },
  filaProducto: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 4,
  },
  filaProductoNombre: {
    flex: 2,
    fontSize: 12.5,
    fontFamily: TIPOGRAFIA_ADMIN.medio,
    color: COLORES_ADMIN.texto,
  },
  filaProductoUnidades: {
    flex: 1,
    fontSize: 11.5,
    fontFamily: TIPOGRAFIA_ADMIN.monoRegular,
    color: COLORES_ADMIN.textoSecundario,
    textAlign: 'right',
  },
  filaProductoTotal: {
    flex: 1,
    fontSize: 11.5,
    fontFamily: TIPOGRAFIA_ADMIN.monoSemiNegrita,
    color: COLORES_ADMIN.vino,
    textAlign: 'right',
  },
  vacio: {
    fontSize: 13,
    fontFamily: TIPOGRAFIA_ADMIN.regular,
    color: COLORES_ADMIN.textoSecundario,
    paddingHorizontal: 20,
  },
  lista: {
    paddingBottom: 30,
  },
  filaVenta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: COLORES_ADMIN.superficie,
  },
  filaVentaTexto: {
    flex: 1,
    gap: 2,
  },
  filaVentaRecibo: {
    fontSize: 12.5,
    fontFamily: TIPOGRAFIA_ADMIN.monoSemiNegrita,
    color: COLORES_ADMIN.texto,
  },
  filaVentaSub: {
    fontSize: 11.5,
    fontFamily: TIPOGRAFIA_ADMIN.regular,
    color: COLORES_ADMIN.textoSecundario,
  },
  filaVentaFecha: {
    fontSize: 10.5,
    fontFamily: TIPOGRAFIA_ADMIN.monoRegular,
    color: COLORES_ADMIN.textoSecundario,
  },
  filaVentaMonto: {
    fontSize: 13,
    fontFamily: TIPOGRAFIA_ADMIN.monoSemiNegrita,
    color: COLORES_ADMIN.vino,
  },
});
