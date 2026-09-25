import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

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
import { listarCategorias } from '@/db/categorias';
import { listarProductos } from '@/db/productos';
import { listarPuntos } from '@/db/puntos';
import { listarPromotores } from '@/db/usuarios';
import { ContenedorAncho } from '@/ui/ContenedorAncho';
import { Encabezado } from '@/ui/Encabezado';
import { FilaFiltrosSuperior, FiltrosAplicados, PanelFiltros, PeriodoFijo, type FiltroAplicado } from '@/ui/PanelFiltros';
import { GraficoBarrasHorizontales } from '@/ui/graficas/GraficoBarrasHorizontales';
import { GraficoLinea } from '@/ui/graficas/GraficoLinea';
import { ANCHO_ADMIN, COLORES_ADMIN, TIPOGRAFIA_ADMIN, RADII_ADMIN, TEXTO_ADMIN } from '@/ui/tema';
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
  const { metrica, desde, hasta, filtros: filtrosParam } = useLocalSearchParams<{
    metrica: Metrica;
    desde: string;
    hasta: string;
    filtros?: string;
  }>();

  const rango: RangoFechas = useMemo(() => ({ desde, hasta }), [desde, hasta]);
  const [filtros, setFiltros] = useState<FiltrosVentas>(() => {
    try {
      return filtrosParam ? JSON.parse(filtrosParam) : {};
    } catch {
      return {};
    }
  });
  const [nombres, setNombres] = useState<Record<string, string>>({});

  useEffect(() => {
    (async () => {
      const db = await getDb();
      const [promotores, puntos, productos, categorias] = await Promise.all([
        listarPromotores(db),
        listarPuntos(db),
        listarProductos(db),
        listarCategorias(db),
      ]);
      const mapa: Record<string, string> = {};
      for (const p of promotores) mapa[p.id] = p.nombre;
      for (const p of puntos) mapa[p.id] = `${p.empresaNombre} · ${p.nombre}`;
      for (const p of productos) mapa[p.id] = p.nombre;
      for (const c of categorias) mapa[c.id] = c.nombre;
      setNombres(mapa);
    })();
  }, []);

  function quitarFiltro(campo: keyof FiltrosVentas) {
    setFiltros((actual) => {
      const nuevo = { ...actual };
      delete nuevo[campo];
      return nuevo;
    });
  }

  const filtrosAplicados = [
    filtros.promotorId && {
      clave: 'promotorId',
      texto: `Promotor: ${nombres[filtros.promotorId] ?? ''}`,
      onQuitar: () => quitarFiltro('promotorId'),
    },
    filtros.puntoId && {
      clave: 'puntoId',
      texto: `Punto: ${nombres[filtros.puntoId] ?? ''}`,
      onQuitar: () => quitarFiltro('puntoId'),
    },
    filtros.categoriaId && {
      clave: 'categoriaId',
      texto: `Categoría: ${nombres[filtros.categoriaId] ?? ''}`,
      onQuitar: () => quitarFiltro('categoriaId'),
    },
    filtros.marca && { clave: 'marca', texto: `Marca: ${filtros.marca}`, onQuitar: () => quitarFiltro('marca') },
    filtros.productoId && {
      clave: 'productoId',
      texto: `Producto: ${nombres[filtros.productoId] ?? ''}`,
      onQuitar: () => quitarFiltro('productoId'),
    },
    filtros.metodoPago && {
      clave: 'metodoPago',
      texto: `Pago: ${ETIQUETAS_METODO[filtros.metodoPago]}`,
      onQuitar: () => quitarFiltro('metodoPago'),
    },
  ].filter((f): f is FiltroAplicado => !!f);

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
      <Encabezado titulo={titulo} rutaVolverTexto="Dashboard" anchoMaximo={ANCHO_ADMIN.tablero} />

      {anchaPantalla && (
        <ContenedorAncho anchoMaximo={ANCHO_ADMIN.tablero}>
          <View style={styles.filtrosMargen}>
            <PanelFiltros>
              <FilaFiltrosSuperior separador={false}>
                <PeriodoFijo desde={desde} hasta={hasta} />
              </FilaFiltrosSuperior>
              <FiltrosAplicados filtros={filtrosAplicados} onLimpiar={() => setFiltros({})} />
            </PanelFiltros>
          </View>
        </ContenedorAncho>
      )}

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
            <ContenedorAncho anchoMaximo={ANCHO_ADMIN.tablero}>
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
            <ContenedorAncho anchoMaximo={ANCHO_ADMIN.tablero}>
              <Text style={styles.vacio}>Sin transacciones en este período.</Text>
            </ContenedorAncho>
          }
          renderItem={({ item }) => (
            <ContenedorAncho anchoMaximo={ANCHO_ADMIN.tablero}>
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
  filtrosMargen: {
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  contenedor: {
    flex: 1,
    backgroundColor: COLORES_ADMIN.background,
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
    ...TEXTO_ADMIN.boton,
  },
  filaVentaDetalle: {
    ...TEXTO_ADMIN.nota,
    marginTop: 2,
  },
  filaVentaFecha: {
    fontSize: 11,
    fontFamily: TIPOGRAFIA_ADMIN.monoRegular,
    color: COLORES_ADMIN.textoSecundario,
    marginTop: 2,
  },
  filaVentaTotal: {
    ...TEXTO_ADMIN.datoDestacado,
  },
});
