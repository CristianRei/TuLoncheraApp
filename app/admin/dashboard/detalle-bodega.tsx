import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { fechaBogota } from '@/core/analitica';
import { formatearPesos } from '@/core/dinero';
import type { TipoMovimiento } from '@/core/tipos';
import { getDb } from '@/db/client';
import {
  listarInventarioBodega,
  obtenerMovimientosBodegaDetallados,
  type ItemInventario,
  type MovimientoBodegaDetallado,
} from '@/db/inventario';
import { ContenedorAncho } from '@/ui/ContenedorAncho';
import { GraficoLinea } from '@/ui/graficas/GraficoLinea';
import { ANCHO_ADMIN, COLORES_ADMIN, TIPOGRAFIA_ADMIN, RADII_ADMIN, TEXTO_ADMIN } from '@/ui/tema';
import { useEsPantallaAncha } from '@/ui/useEsPantallaAncha';
import { useRequiereSesion } from '@/ui/useRequiereSesion';

const ETIQUETAS_TIPO: Partial<Record<TipoMovimiento, string>> = {
  COMPRA_PROVEEDOR: 'Entrada · Compra a proveedor',
  RECARGA: 'Salida · Recarga a promotor',
};

function formatearFechaHora(iso: string): string {
  return new Date(iso).toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' });
}

interface SaldoNetoDia {
  fecha: string;
  neto: number;
}

function calcularSerieNeta(movimientos: MovimientoBodegaDetallado[]): SaldoNetoDia[] {
  const acumulado = new Map<string, number>();
  for (const m of movimientos) {
    const fecha = fechaBogota(m.tsCliente);
    const delta = m.entrada ? m.cantidad : -m.cantidad;
    acumulado.set(fecha, (acumulado.get(fecha) ?? 0) + delta);
  }
  return [...acumulado.entries()].map(([fecha, neto]) => ({ fecha, neto })).sort((a, b) => a.fecha.localeCompare(b.fecha));
}

export default function DetalleBodega() {
  const usuario = useRequiereSesion(['ADMIN']);
  const anchaPantalla = useEsPantallaAncha();
  const insets = useSafeAreaInsets();
  const { desde, hasta } = useLocalSearchParams<{ desde: string; hasta: string }>();
  const rango = useMemo(() => ({ desde, hasta }), [desde, hasta]);

  const [cargando, setCargando] = useState(true);
  const [inventario, setInventario] = useState<ItemInventario[]>([]);
  const [movimientos, setMovimientos] = useState<MovimientoBodegaDetallado[]>([]);

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const db = await getDb();
      const [items, movs] = await Promise.all([
        listarInventarioBodega(db),
        obtenerMovimientosBodegaDetallados(db, rango),
      ]);
      setInventario([...items].sort((a, b) => b.saldo - a.saldo));
      setMovimientos(movs);
    } finally {
      setCargando(false);
    }
  }, [rango]);

  useEffect(() => {
    (async () => {
      await cargar();
    })();
  }, [cargar]);

  if (!usuario) return null;

  const serieNeta = calcularSerieNeta(movimientos);

  return (
    <View style={styles.contenedor}>
      <View
        style={[
          anchaPantalla ? styles.encabezadoAncho : styles.encabezado,
          { paddingTop: anchaPantalla ? 16 : insets.top + 16 },
        ]}
      >
        <ContenedorAncho anchoMaximo={ANCHO_ADMIN.tablero}>
          <View style={styles.encabezadoFila}>
            <Pressable
              style={anchaPantalla ? styles.volverBotonAncho : styles.volverBoton}
              onPress={() => router.back()}
            >
              <Ionicons
                name="chevron-back"
                size={16}
                color={anchaPantalla ? COLORES_ADMIN.vino : COLORES_ADMIN.superficie}
              />
              <Text style={anchaPantalla ? styles.volverTextoAncho : styles.volverTexto}>Dashboard</Text>
            </Pressable>
            <Text style={anchaPantalla ? styles.tituloAncho : styles.titulo}>Saldo en bodega</Text>
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
          data={movimientos}
          keyExtractor={(m) => m.id}
          ListHeaderComponent={
            <ContenedorAncho anchoMaximo={ANCHO_ADMIN.tablero}>
              <View style={styles.cuerpo}>
                {serieNeta.length > 0 && (
                  <View style={styles.tarjeta}>
                    <Text style={styles.seccionTitulo}>Movimiento neto por día (entradas − salidas)</Text>
                    <GraficoLinea puntos={serieNeta.map((d) => ({ etiqueta: d.fecha, valor: d.neto }))} />
                  </View>
                )}

                <View style={styles.tarjeta}>
                  <Text style={styles.seccionTitulo}>Por producto ({inventario.length})</Text>
                  {inventario.length === 0 ? (
                    <Text style={styles.vacioInline}>Sin stock en bodega.</Text>
                  ) : (
                    <View style={styles.listaProductos}>
                      {inventario.map((item) => (
                        <View key={item.producto.id} style={styles.filaProducto}>
                          <Text style={styles.filaProductoNombre} numberOfLines={1}>
                            {item.producto.nombre}
                          </Text>
                          <Text style={styles.filaProductoSaldo}>{item.saldo} und.</Text>
                          <Text style={styles.filaProductoValor}>
                            {item.producto.costo !== null ? formatearPesos(item.saldo * item.producto.costo) : '—'}
                          </Text>
                        </View>
                      ))}
                    </View>
                  )}
                </View>

                <Text style={styles.seccionTitulo}>Movimientos del período ({movimientos.length})</Text>
              </View>
            </ContenedorAncho>
          }
          ListEmptyComponent={
            <ContenedorAncho anchoMaximo={ANCHO_ADMIN.tablero}>
              <Text style={styles.vacio}>Sin movimientos de bodega en este período.</Text>
            </ContenedorAncho>
          }
          renderItem={({ item }) => (
            <ContenedorAncho anchoMaximo={ANCHO_ADMIN.tablero}>
              <View style={styles.filaMovimiento}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.filaMovimientoTipo}>{ETIQUETAS_TIPO[item.tipo] ?? item.tipo}</Text>
                  <Text style={styles.filaMovimientoProducto} numberOfLines={1}>
                    {item.productoNombre}
                  </Text>
                  <Text style={styles.filaMovimientoFecha}>{formatearFechaHora(item.tsCliente)}</Text>
                </View>
                <Text style={[styles.filaMovimientoCantidad, { color: item.entrada ? COLORES_ADMIN.positivo : COLORES_ADMIN.error }]}>
                  {item.entrada ? '+' : '−'}
                  {item.cantidad}
                </Text>
              </View>
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
  encabezadoAncho: {
    backgroundColor: 'transparent',
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
    borderRadius: RADII_ADMIN.sm,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  volverBotonAncho: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    backgroundColor: COLORES_ADMIN.superficieBaja,
    borderRadius: RADII_ADMIN.sm,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  volverTexto: {
    ...TEXTO_ADMIN.cuerpoSecundario,
    fontFamily: TIPOGRAFIA_ADMIN.medio,
    color: COLORES_ADMIN.superficie,
  },
  volverTextoAncho: {
    ...TEXTO_ADMIN.cuerpoSecundario,
    fontFamily: TIPOGRAFIA_ADMIN.medio,
    color: COLORES_ADMIN.vino,
  },
  titulo: {
    ...TEXTO_ADMIN.tituloSeccion,
    color: COLORES_ADMIN.textoInverso,
  },
  tituloAncho: {
    ...TEXTO_ADMIN.tituloPantalla,
    color: COLORES_ADMIN.vino,
  },
  centrado: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  avisoAngosto: {
    ...TEXTO_ADMIN.cuerpo,
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
    borderRadius: RADII_ADMIN.md,
    borderWidth: 1,
    borderColor: COLORES_ADMIN.bordeSuave,
    padding: 16,
    gap: 10,
  },
  seccionTitulo: {
    ...TEXTO_ADMIN.tituloTarjeta,
  },
  vacio: {
    ...TEXTO_ADMIN.cuerpoSecundario,
    paddingHorizontal: 20,
  },
  vacioInline: {
    ...TEXTO_ADMIN.cuerpoSecundario,
  },
  listaProductos: {
    gap: 8,
    maxHeight: 320,
  },
  filaProducto: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  filaProductoNombre: {
    ...TEXTO_ADMIN.cuerpoSecundario,
    flex: 1,
    color: COLORES_ADMIN.texto,
  },
  filaProductoSaldo: {
    ...TEXTO_ADMIN.datoSecundario,
    fontFamily: TIPOGRAFIA_ADMIN.monoMedio,
    minWidth: 60,
    textAlign: 'right',
  },
  filaProductoValor: {
    ...TEXTO_ADMIN.datoSecundario,
    fontFamily: TIPOGRAFIA_ADMIN.monoMedio,
    color: COLORES_ADMIN.texto,
    minWidth: 90,
    textAlign: 'right',
  },
  filaMovimiento: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORES_ADMIN.superficie,
  },
  filaMovimientoTipo: {
    ...TEXTO_ADMIN.nota,
    fontFamily: TIPOGRAFIA_ADMIN.semiNegrita,
    color: COLORES_ADMIN.texto,
  },
  filaMovimientoProducto: {
    ...TEXTO_ADMIN.cuerpoSecundario,
    marginTop: 2,
  },
  filaMovimientoFecha: {
    fontSize: 11,
    fontFamily: TIPOGRAFIA_ADMIN.monoRegular,
    color: COLORES_ADMIN.textoSecundario,
    marginTop: 2,
  },
  filaMovimientoCantidad: {
    fontSize: 14,
    fontFamily: TIPOGRAFIA_ADMIN.monoSemiNegrita,
  },
});
