import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { formatearPesos } from '@/core/dinero';
import type { MetodoPago, Producto, Punto, UsuarioSesion } from '@/core/tipos';
import { getDb } from '@/db/client';
import {
  obtenerResumenVentas,
  obtenerSaldoTotalBodega,
  obtenerVentasPorCategoria,
  obtenerVentasPorPromotor,
  obtenerVentasPorPunto,
  type FiltrosVentas,
  type RangoFechas,
  type ResumenVentasPeriodo,
  type SaldoTotalBodega,
  type TotalPorCategoria,
  type TotalPorPromotor,
  type TotalPorPunto,
} from '@/db/analitica';
import { listarCategoriasDistintas, listarMarcasDistintas, listarProductos } from '@/db/productos';
import { listarPuntos } from '@/db/puntos';
import { listarPromotores } from '@/db/usuarios';
import { CalendarioRango } from '@/ui/CalendarioRango';
import { ContenedorAncho } from '@/ui/ContenedorAncho';
import { COLORES_ADMIN, TIPOGRAFIA_ADMIN } from '@/ui/tema';
import { useEsPantallaAncha } from '@/ui/useEsPantallaAncha';
import { useRequiereSesion } from '@/ui/useRequiereSesion';

type Periodo = 'HOY' | 'SEMANA' | 'MES' | 'PERSONALIZADO';

const OFFSET_BOGOTA_MS = 5 * 60 * 60 * 1000;
const REFRESCO_MS = 15000;

const ETIQUETAS_PERIODO: Record<Exclude<Periodo, 'PERSONALIZADO'>, string> = {
  HOY: 'Hoy',
  SEMANA: 'Últimos 7 días',
  MES: 'Últimos 30 días',
};

const DIAS_POR_PERIODO: Record<Exclude<Periodo, 'PERSONALIZADO'>, number> = {
  HOY: 1,
  SEMANA: 7,
  MES: 30,
};

const ETIQUETAS_METODO: Record<string, string> = {
  EFECTIVO: 'Efectivo',
  TRANSFERENCIA: 'Transferencia',
  LIBRANZA: 'Libranza',
};

/** Medianoche de hoy en Bogotá, menos N días, convertida a ISO UTC. */
function calcularRango(periodo: Exclude<Periodo, 'PERSONALIZADO'>): RangoFechas {
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

const ALTURA_MAXIMA_BARRA = 96;

function colorBarraHora(cantidad: number, maximo: number): string {
  if (cantidad === 0) return COLORES_ADMIN.bordeSuave;
  const proporcion = cantidad / maximo;
  if (proporcion >= 0.9) return COLORES_ADMIN.vino;
  if (proporcion >= 0.5) return COLORES_ADMIN.dorado;
  return COLORES_ADMIN.superficieMasAlta;
}

function GraficoHoras({ porHora }: { porHora: ResumenVentasPeriodo['porHora'] }) {
  const porHoraCompleto = useMemo(() => {
    const mapa = new Map(porHora.map((h) => [h.hora, h.cantidadVentas]));
    return Array.from({ length: 24 }, (_, hora) => mapa.get(hora) ?? 0);
  }, [porHora]);

  const maximo = Math.max(1, ...porHoraCompleto);
  const horaPico = porHoraCompleto.indexOf(maximo);

  return (
    <View style={styles.graficoBloque}>
      {maximo > 0 && (
        <View style={styles.graficoPicoFila}>
          <View style={styles.graficoPicoPunto} />
          <Text style={styles.graficoPicoTexto}>
            Hora pico: <Text style={styles.graficoPicoTextoFuerte}>{horaPico}:00 ({maximo} ventas)</Text>
          </Text>
        </View>
      )}
      <View style={styles.grafico}>
        {porHoraCompleto.map((cantidad, hora) => (
          <View key={hora} style={styles.barraColumna}>
            {cantidad > 0 && cantidad === maximo && (
              <Text style={styles.barraEtiquetaPico}>{cantidad}v.</Text>
            )}
            <View
              style={[
                styles.barra,
                {
                  height: Math.max(3, (cantidad / maximo) * ALTURA_MAXIMA_BARRA),
                  backgroundColor: colorBarraHora(cantidad, maximo),
                },
              ]}
            />
            {hora % 3 === 0 && <Text style={styles.barraEtiqueta}>{hora}</Text>}
          </View>
        ))}
      </View>
    </View>
  );
}

interface DatosFiltro {
  promotores: UsuarioSesion[];
  puntos: Punto[];
  productos: Producto[];
  categorias: string[];
  marcas: string[];
}

type CampoFiltro = 'promotor' | 'punto' | 'categoria' | 'marca' | 'producto' | 'metodoPago';

const ICONOS_FILTRO: Record<CampoFiltro, keyof typeof Ionicons.glyphMap> = {
  promotor: 'person-outline',
  punto: 'storefront-outline',
  categoria: 'grid-outline',
  marca: 'ribbon-outline',
  producto: 'cube-outline',
  metodoPago: 'wallet-outline',
};

const ETIQUETAS_FILTRO: Record<CampoFiltro, string> = {
  promotor: 'Promotor',
  punto: 'Punto',
  categoria: 'Categoría',
  marca: 'Marca',
  producto: 'Producto',
  metodoPago: 'Método de pago',
};

export default function Dashboard() {
  const usuario = useRequiereSesion(['ADMIN']);
  const anchaPantalla = useEsPantallaAncha();
  const [periodo, setPeriodo] = useState<Periodo>('HOY');
  const [desdePersonalizado, setDesdePersonalizado] = useState<string | null>(null);
  const [hastaPersonalizado, setHastaPersonalizado] = useState<string | null>(null);
  const [calendarioVisible, setCalendarioVisible] = useState(false);
  const [filtros, setFiltros] = useState<FiltrosVentas>({});
  const [modalFiltroVisible, setModalFiltroVisible] = useState<CampoFiltro | null>(null);

  const [resumen, setResumen] = useState<ResumenVentasPeriodo | null>(null);
  const [saldoBodega, setSaldoBodega] = useState<SaldoTotalBodega | null>(null);
  const [porPromotor, setPorPromotor] = useState<TotalPorPromotor[]>([]);
  const [porPunto, setPorPunto] = useState<TotalPorPunto[]>([]);
  const [porCategoria, setPorCategoria] = useState<TotalPorCategoria[]>([]);
  const [datosFiltro, setDatosFiltro] = useState<DatosFiltro | null>(null);
  const [cargando, setCargando] = useState(true);
  const [segundosDesdeActualizacion, setSegundosDesdeActualizacion] = useState(0);
  const insets = useSafeAreaInsets();
  const enfocado = useRef(true);
  const ultimaActualizacion = useRef<number>(0);

  const rango: RangoFechas | null = useMemo(() => {
    if (periodo === 'PERSONALIZADO') {
      if (!desdePersonalizado || !hastaPersonalizado) return null;
      return {
        desde: new Date(`${desdePersonalizado}T00:00:00-05:00`).toISOString(),
        hasta: new Date(`${hastaPersonalizado}T23:59:59-05:00`).toISOString(),
      };
    }
    return calcularRango(periodo);
  }, [periodo, desdePersonalizado, hastaPersonalizado]);

  const cargar = useCallback(async () => {
    if (!rango) return;
    setCargando(true);
    try {
      const db = await getDb();
      const [resumenVentas, saldo, promotorTotales, puntoTotales, categoriaTotales] = await Promise.all([
        obtenerResumenVentas(db, rango, filtros),
        obtenerSaldoTotalBodega(db),
        obtenerVentasPorPromotor(db, rango, filtros),
        obtenerVentasPorPunto(db, rango, filtros),
        obtenerVentasPorCategoria(db, rango, filtros),
      ]);
      setResumen(resumenVentas);
      setSaldoBodega(saldo);
      setPorPromotor(promotorTotales);
      setPorPunto(puntoTotales);
      setPorCategoria(categoriaTotales);
      ultimaActualizacion.current = Date.now();
      setSegundosDesdeActualizacion(0);
    } finally {
      setCargando(false);
    }
  }, [rango, filtros]);

  const cargarDatosFiltro = useCallback(async () => {
    const db = await getDb();
    const [promotores, puntos, productos, categorias, marcas] = await Promise.all([
      listarPromotores(db),
      listarPuntos(db),
      listarProductos(db),
      listarCategoriasDistintas(db),
      listarMarcasDistintas(db),
    ]);
    setDatosFiltro({ promotores, puntos, productos, categorias, marcas });
  }, []);

  useFocusEffect(
    useCallback(() => {
      enfocado.current = true;
      cargar();
      cargarDatosFiltro();
      return () => {
        enfocado.current = false;
      };
    }, [cargar, cargarDatosFiltro])
  );

  // "Tiempo real" dentro de este dispositivo: refresca mientras la pantalla
  // está enfocada. No hay push desde otros dispositivos — la app es local
  // sin servidor todavía (CLAUDE.md sección 1, Fase 5 sin construir).
  useEffect(() => {
    const intervaloRefresco = setInterval(() => {
      if (enfocado.current) cargar();
    }, REFRESCO_MS);
    const intervaloContador = setInterval(() => {
      setSegundosDesdeActualizacion(Math.floor((Date.now() - ultimaActualizacion.current) / 1000));
    }, 1000);
    return () => {
      clearInterval(intervaloRefresco);
      clearInterval(intervaloContador);
    };
  }, [cargar]);

  if (!usuario) return null;

  function actualizarFiltro<K extends keyof FiltrosVentas>(campo: K, valor: FiltrosVentas[K]) {
    setFiltros((actual) => ({ ...actual, [campo]: valor }));
    setModalFiltroVisible(null);
  }

  function quitarFiltro(campo: keyof FiltrosVentas) {
    setFiltros((actual) => {
      const nuevo = { ...actual };
      delete nuevo[campo];
      return nuevo;
    });
  }

  const cantidadFiltrosActivos = Object.keys(filtros).length;
  const filtrosExtra: CampoFiltro[] = ['categoria', 'marca', 'producto'];
  const cantidadFiltrosExtra = filtrosExtra.filter((campo) => {
    if (campo === 'categoria') return !!filtros.categoria;
    if (campo === 'marca') return !!filtros.marca;
    return !!filtros.productoId;
  }).length;

  const nombrePromotorFiltro = datosFiltro?.promotores.find((p) => p.id === filtros.promotorId)?.nombre;
  const nombrePuntoFiltro = datosFiltro?.puntos.find((p) => p.id === filtros.puntoId);
  const nombreProductoFiltro = datosFiltro?.productos.find((p) => p.id === filtros.productoId)?.nombre;

  return (
    <View style={styles.contenedor}>
      <View style={[styles.encabezado, { paddingTop: insets.top + 16 }]}>
        <ContenedorAncho anchoMaximo={1200}>
          <View style={styles.encabezadoFila}>
            <View style={styles.encabezadoIzquierda}>
              <Pressable style={styles.volverBoton} onPress={() => router.back()}>
                <Ionicons name="chevron-back" size={16} color="#FFE9E2" />
                <Text style={styles.volverTexto}>Admin</Text>
              </Pressable>
              <Text style={styles.titulo}>Dashboard</Text>
            </View>
            <View style={styles.encabezadoDerecha}>
              <View style={styles.enVivoIndicador}>
                <View style={styles.enVivoPunto} />
                <Text style={styles.enVivoTexto}>Auto-actualiza cada 15s</Text>
              </View>
              <Pressable style={styles.botonRecibos} onPress={() => router.push('/admin/ventas')}>
                <Ionicons name="receipt-outline" size={15} color={COLORES_ADMIN.vino} />
                <Text style={styles.botonRecibosTexto}>Recibos</Text>
              </Pressable>
            </View>
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
          <ContenedorAncho anchoMaximo={1200}>
            <View style={styles.filtrosTarjeta}>
              <View style={styles.filtrosFilaSuperior}>
                <View style={styles.tabs}>
                  {(Object.keys(ETIQUETAS_PERIODO) as Exclude<Periodo, 'PERSONALIZADO'>[]).map((p) => (
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
                  <Pressable
                    style={[styles.tab, periodo === 'PERSONALIZADO' && styles.tabActivo]}
                    onPress={() => {
                      setPeriodo('PERSONALIZADO');
                      setCalendarioVisible(true);
                    }}
                  >
                    <Ionicons
                      name="calendar-outline"
                      size={13}
                      color={periodo === 'PERSONALIZADO' ? '#FFFFFF' : COLORES_ADMIN.textoSecundario}
                    />
                    <Text
                      style={[styles.tabTexto, periodo === 'PERSONALIZADO' && styles.tabTextoActivo]}
                    >
                      {' '}
                      {periodo === 'PERSONALIZADO' && desdePersonalizado && hastaPersonalizado
                        ? `${desdePersonalizado} — ${hastaPersonalizado}`
                        : 'Rango personalizado'}
                    </Text>
                  </Pressable>
                </View>
                <View style={styles.actualizadoFila}>
                  <View style={styles.actualizadoPunto} />
                  <Text style={styles.actualizadoTexto}>
                    Actualizado hace {segundosDesdeActualizacion}s
                  </Text>
                  <Pressable style={styles.botonRefrescar} onPress={cargar}>
                    <Ionicons name="sync-outline" size={15} color={COLORES_ADMIN.textoSecundario} />
                  </Pressable>
                </View>
              </View>

              <View style={styles.selectoresFila}>
                <SelectorFiltro
                  campo="punto"
                  valorTexto={
                    nombrePuntoFiltro
                      ? `${nombrePuntoFiltro.empresaNombre} · ${nombrePuntoFiltro.nombre}`
                      : 'Todos los puntos'
                  }
                  onPress={() => setModalFiltroVisible('punto')}
                />
                <SelectorFiltro
                  campo="promotor"
                  valorTexto={nombrePromotorFiltro ?? 'Todos los promotores'}
                  onPress={() => setModalFiltroVisible('promotor')}
                />
                <SelectorFiltro
                  campo="metodoPago"
                  valorTexto={filtros.metodoPago ? ETIQUETAS_METODO[filtros.metodoPago] : 'Todos los métodos'}
                  onPress={() => setModalFiltroVisible('metodoPago')}
                />
                <Pressable style={styles.masFiltrosBoton} onPress={() => setModalFiltroVisible('categoria')}>
                  <Ionicons name="options-outline" size={16} color={COLORES_ADMIN.textoSecundario} />
                  <Text style={styles.masFiltrosTexto}>Más filtros</Text>
                  {cantidadFiltrosExtra > 0 && (
                    <View style={styles.masFiltrosBadge}>
                      <Text style={styles.masFiltrosBadgeTexto}>{cantidadFiltrosExtra}</Text>
                    </View>
                  )}
                </Pressable>
              </View>

              {cantidadFiltrosActivos > 0 && (
                <View style={styles.chipsFila}>
                  <Text style={styles.chipsEtiqueta}>Filtros aplicados:</Text>
                  {filtros.promotorId && (
                    <Chip texto={`Promotor: ${nombrePromotorFiltro ?? ''}`} onQuitar={() => quitarFiltro('promotorId')} />
                  )}
                  {filtros.puntoId && (
                    <Chip
                      texto={`Punto: ${nombrePuntoFiltro ? `${nombrePuntoFiltro.empresaNombre} · ${nombrePuntoFiltro.nombre}` : ''}`}
                      onQuitar={() => quitarFiltro('puntoId')}
                    />
                  )}
                  {filtros.categoria && (
                    <Chip texto={`Categoría: ${filtros.categoria}`} onQuitar={() => quitarFiltro('categoria')} />
                  )}
                  {filtros.marca && <Chip texto={`Marca: ${filtros.marca}`} onQuitar={() => quitarFiltro('marca')} />}
                  {filtros.productoId && (
                    <Chip texto={`Producto: ${nombreProductoFiltro ?? ''}`} onQuitar={() => quitarFiltro('productoId')} />
                  )}
                  {filtros.metodoPago && (
                    <Chip
                      texto={`Pago: ${ETIQUETAS_METODO[filtros.metodoPago]}`}
                      onQuitar={() => quitarFiltro('metodoPago')}
                    />
                  )}
                  <Pressable style={styles.limpiarFiltrosBoton} onPress={() => setFiltros({})}>
                    <Ionicons name="refresh-outline" size={13} color={COLORES_ADMIN.vino} />
                    <Text style={styles.limpiarFiltrosTexto}>Limpiar todos</Text>
                  </Pressable>
                </View>
              )}
            </View>

            {cargando || !resumen || !saldoBodega ? (
              <View style={styles.centrado}>
                <ActivityIndicator size="large" color={COLORES_ADMIN.vino} />
              </View>
            ) : (
              <View style={styles.cuerpo}>
                <View style={styles.filaKpis}>
                  <TarjetaKpi
                    icono="cash-outline"
                    etiqueta="Total vendido"
                    valor={formatearPesos(resumen.totalVendido)}
                    pie={`COP · período ${periodo === 'PERSONALIZADO' ? 'personalizado' : ETIQUETAS_PERIODO[periodo]}`}
                  />
                  <TarjetaKpi
                    icono="receipt-outline"
                    etiqueta="Ventas emitidas"
                    valor={String(resumen.cantidadVentas)}
                    pie="Recibos emitidos"
                  />
                  <TarjetaKpi
                    icono="stats-chart-outline"
                    etiqueta="Ticket promedio"
                    valor={formatearPesos(resumen.ticketPromedio)}
                    pie="Por venta registrada"
                  />
                  <TarjetaKpi
                    icono="cube-outline"
                    etiqueta="Saldo en bodega"
                    valor={`${saldoBodega.totalUnidades} und.`}
                    pie={
                      saldoBodega.valorEstimado !== null
                        ? `≈ ${formatearPesos(saldoBodega.valorEstimado)}${
                            saldoBodega.productosConCosto < saldoBodega.productosTotal
                              ? ` · ${saldoBodega.productosConCosto} de ${saldoBodega.productosTotal} con costo`
                              : ''
                          }`
                        : 'Sin costos capturados todavía'
                    }
                  />
                </View>

                <View style={styles.tarjetaAncha}>
                  <View style={styles.seccionEncabezado}>
                    <View>
                      <Text style={styles.seccionTitulo}>Hora del día con más ventas</Text>
                      <Text style={styles.seccionSubtitulo}>
                        Distribución de ventas en el ciclo de 24 horas
                      </Text>
                    </View>
                  </View>
                  {resumen.cantidadVentas === 0 ? (
                    <Text style={styles.vacio}>Sin ventas en este período.</Text>
                  ) : (
                    <GraficoHoras porHora={resumen.porHora} />
                  )}
                </View>

                <View style={styles.grilla2Columnas}>
                  <View style={styles.tarjeta}>
                    <View style={styles.seccionEncabezadoFila}>
                      <View style={styles.seccionEncabezadoIcono}>
                        <Ionicons name="wallet-outline" size={17} color={COLORES_ADMIN.textoSecundario} />
                        <Text style={styles.seccionTitulo}>Por método de pago</Text>
                      </View>
                      <Text style={styles.seccionEtiquetaChica}>
                        {resumen.porMetodoPago.length} método{resumen.porMetodoPago.length === 1 ? '' : 's'}
                      </Text>
                    </View>
                    {resumen.porMetodoPago.length === 0 ? (
                      <Text style={styles.vacio}>Sin ventas en este período.</Text>
                    ) : (
                      <View style={{ gap: 14 }}>
                        {resumen.porMetodoPago.map((m) => {
                          const porcentaje =
                            resumen.totalVendido === 0 ? 0 : (m.total / resumen.totalVendido) * 100;
                          return (
                            <View key={m.metodoPago} style={{ gap: 5 }}>
                              <View style={styles.barraProgresoEncabezado}>
                                <Text style={styles.barraProgresoNombre}>
                                  {ETIQUETAS_METODO[m.metodoPago]}
                                </Text>
                                <View style={styles.barraProgresoValores}>
                                  <Text style={styles.barraProgresoMonto}>{formatearPesos(m.total)}</Text>
                                  <Text style={styles.barraProgresoSub}>({m.cantidadVentas} vtas)</Text>
                                </View>
                              </View>
                              <View style={styles.barraProgresoTrack}>
                                <View
                                  style={[
                                    styles.barraProgresoFill,
                                    { width: `${porcentaje}%`, backgroundColor: COLORES_ADMIN.vino },
                                  ]}
                                />
                              </View>
                              <Text style={styles.barraProgresoPorcentaje}>
                                {porcentaje.toFixed(1)}%
                              </Text>
                            </View>
                          );
                        })}
                      </View>
                    )}
                  </View>

                  <View style={styles.tarjeta}>
                    <View style={styles.seccionEncabezadoFila}>
                      <View style={styles.seccionEncabezadoIcono}>
                        <Ionicons name="person-outline" size={17} color={COLORES_ADMIN.textoSecundario} />
                        <Text style={styles.seccionTitulo}>Por promotor</Text>
                      </View>
                    </View>
                    {porPromotor.length === 0 ? (
                      <Text style={styles.vacio}>Sin ventas en este período.</Text>
                    ) : (
                      <View style={{ gap: 8 }}>
                        {porPromotor.map((p, indice) => (
                          <View key={p.promotorId} style={styles.filaRanking}>
                            <View style={styles.filaRankingIzquierda}>
                              <View
                                style={[
                                  styles.filaRankingMedalla,
                                  indice === 0 && styles.filaRankingMedallaPrimera,
                                ]}
                              >
                                <Text
                                  style={[
                                    styles.filaRankingMedallaTexto,
                                    indice === 0 && styles.filaRankingMedallaTextoPrimera,
                                  ]}
                                >
                                  {indice + 1}
                                </Text>
                              </View>
                              <View>
                                <Text style={styles.filaRankingNombre}>{p.promotorNombre}</Text>
                                <Text style={styles.filaRankingSub}>{p.cantidadVentas} ventas emitidas</Text>
                              </View>
                            </View>
                            <View style={styles.filaRankingDerecha}>
                              <Text style={styles.filaRankingMonto}>{formatearPesos(p.totalVendido)}</Text>
                              <Text style={styles.filaRankingPorcentaje}>
                                {resumen.totalVendido === 0
                                  ? '0'
                                  : ((p.totalVendido / resumen.totalVendido) * 100).toFixed(1)}
                                % del total
                              </Text>
                            </View>
                          </View>
                        ))}
                      </View>
                    )}
                  </View>

                  <View style={styles.tarjeta}>
                    <View style={styles.seccionEncabezadoFila}>
                      <View style={styles.seccionEncabezadoIcono}>
                        <Ionicons name="location-outline" size={17} color={COLORES_ADMIN.textoSecundario} />
                        <Text style={styles.seccionTitulo}>Por punto de venta</Text>
                      </View>
                    </View>
                    {porPunto.length === 0 ? (
                      <Text style={styles.vacio}>Sin ventas con punto asignado en este período.</Text>
                    ) : (
                      <View style={{ gap: 10 }}>
                        {porPunto.map((p) => {
                          const porcentaje =
                            resumen.totalVendido === 0 ? 0 : (p.totalVendido / resumen.totalVendido) * 100;
                          return (
                            <View key={p.puntoId} style={styles.puntoCard}>
                              <View style={styles.barraProgresoEncabezado}>
                                <Text style={styles.barraProgresoNombre}>
                                  {p.empresaNombre} · {p.puntoNombre}
                                </Text>
                                <Text style={styles.barraProgresoMonto}>{formatearPesos(p.totalVendido)}</Text>
                              </View>
                              <View style={styles.barraProgresoTrack}>
                                <View
                                  style={[
                                    styles.barraProgresoFill,
                                    { width: `${porcentaje}%`, backgroundColor: COLORES_ADMIN.dorado },
                                  ]}
                                />
                              </View>
                              <View style={styles.barraProgresoEncabezado}>
                                <Text style={styles.puntoCardSub}>{p.cantidadVentas} ventas</Text>
                                <Text style={styles.puntoCardSub}>{porcentaje.toFixed(1)}% aporte</Text>
                              </View>
                            </View>
                          );
                        })}
                      </View>
                    )}
                  </View>

                  <View style={styles.tarjeta}>
                    <View style={styles.seccionEncabezadoFila}>
                      <View style={styles.seccionEncabezadoIcono}>
                        <Ionicons name="grid-outline" size={17} color={COLORES_ADMIN.textoSecundario} />
                        <Text style={styles.seccionTitulo}>Por categoría</Text>
                      </View>
                    </View>
                    {porCategoria.length === 0 ? (
                      <Text style={styles.vacio}>
                        Sin ventas de productos con categoría asignada en este período.
                      </Text>
                    ) : (
                      <View style={styles.categoriaGrilla}>
                        {porCategoria.map((c) => (
                          <View key={c.categoria} style={styles.categoriaCard}>
                            <View style={styles.barraProgresoEncabezado}>
                              <Text style={styles.barraProgresoNombre}>{c.categoria}</Text>
                              <View style={styles.categoriaBadge}>
                                <Text style={styles.categoriaBadgeTexto}>{c.unidadesVendidas} und.</Text>
                              </View>
                            </View>
                            <Text style={styles.categoriaMonto}>{formatearPesos(c.totalVendido)}</Text>
                          </View>
                        ))}
                      </View>
                    )}

                    <View style={styles.divisor} />

                    <View style={styles.seccionEncabezadoFila}>
                      <View style={styles.seccionEncabezadoIcono}>
                        <Ionicons name="star-outline" size={17} color={COLORES_ADMIN.textoSecundario} />
                        <Text style={styles.seccionTitulo}>Productos más vendidos</Text>
                      </View>
                    </View>
                    {resumen.topProductos.length === 0 ? (
                      <Text style={styles.vacio}>Sin ventas en este período.</Text>
                    ) : (
                      <View>
                        {resumen.topProductos.map((p, indice) => (
                          <View
                            key={p.productoId}
                            style={[
                              styles.filaProducto,
                              indice < resumen.topProductos.length - 1 && styles.filaProductoBorde,
                            ]}
                          >
                            <View style={styles.filaProductoIzquierda}>
                              <View style={styles.filaProductoIndice}>
                                <Text style={styles.filaProductoIndiceTexto}>{indice + 1}</Text>
                              </View>
                              <View>
                                <Text style={styles.filaProductoNombre}>{p.productoNombre}</Text>
                                <Text style={styles.filaProductoUnidades}>
                                  {p.unidadesVendidas} unidades vendidas
                                </Text>
                              </View>
                            </View>
                            <Text style={styles.filaProductoTotal}>{formatearPesos(p.totalVendido)}</Text>
                          </View>
                        ))}
                      </View>
                    )}
                  </View>
                </View>

                <View style={styles.piePagina}>
                  <View style={styles.piePaginaIzquierda}>
                    <Ionicons name="shield-checkmark-outline" size={16} color={COLORES_ADMIN.textoSecundario} />
                    <Text style={styles.piePaginaTexto}>
                      Datos calculados en este dispositivo a partir del SQLite local.
                    </Text>
                  </View>
                  <Pressable style={styles.piePaginaEnlace} onPress={() => router.push('/admin/ventas')}>
                    <Text style={styles.piePaginaEnlaceTexto}>Ver todos los recibos</Text>
                    <Ionicons name="arrow-forward" size={14} color={COLORES_ADMIN.vino} />
                  </Pressable>
                </View>
              </View>
            )}
          </ContenedorAncho>
        </ScrollView>
      )}

      <Modal visible={calendarioVisible} animationType="fade" transparent>
        <View style={styles.fondoModal}>
          <View style={styles.tarjetaModalCalendario}>
            <Text style={styles.modalCalendarioTitulo}>Elige el rango de fechas</Text>
            <CalendarioRango
              desde={desdePersonalizado}
              hasta={hastaPersonalizado}
              onCambiar={(desde, hasta) => {
                setDesdePersonalizado(desde);
                setHastaPersonalizado(hasta);
              }}
            />
            <Pressable
              style={[
                styles.modalCalendarioConfirmar,
                (!desdePersonalizado || !hastaPersonalizado) && styles.botonDeshabilitado,
              ]}
              disabled={!desdePersonalizado || !hastaPersonalizado}
              onPress={() => setCalendarioVisible(false)}
            >
              <Text style={styles.modalCalendarioConfirmarTexto}>Aplicar rango</Text>
            </Pressable>
            <Pressable style={styles.modalCerrar} onPress={() => setCalendarioVisible(false)}>
              <Text style={styles.modalCerrarTexto}>Cerrar</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <Modal visible={modalFiltroVisible !== null} animationType="slide" transparent>
        <View style={styles.fondoModal}>
          <View style={styles.tarjetaModalFiltro}>
            <View style={styles.modalFiltroTabs}>
              {(['promotor', 'punto', 'categoria', 'marca', 'producto', 'metodoPago'] as CampoFiltro[]).map(
                (campo) => (
                  <Pressable
                    key={campo}
                    style={[styles.modalFiltroTab, modalFiltroVisible === campo && styles.modalFiltroTabActivo]}
                    onPress={() => setModalFiltroVisible(campo)}
                  >
                    <Ionicons
                      name={ICONOS_FILTRO[campo]}
                      size={13}
                      color={modalFiltroVisible === campo ? '#FFFFFF' : COLORES_ADMIN.textoSecundario}
                    />
                    <Text
                      style={[
                        styles.modalFiltroTabTexto,
                        modalFiltroVisible === campo && styles.modalFiltroTabTextoActivo,
                      ]}
                    >
                      {' '}{ETIQUETAS_FILTRO[campo]}
                    </Text>
                  </Pressable>
                )
              )}
            </View>

            <FlatList
              style={styles.modalFiltroLista}
              data={
                modalFiltroVisible === 'promotor'
                  ? datosFiltro?.promotores.map((p) => ({ id: p.id, texto: p.nombre })) ?? []
                  : modalFiltroVisible === 'punto'
                    ? datosFiltro?.puntos.map((p) => ({ id: p.id, texto: `${p.empresaNombre} · ${p.nombre}` })) ?? []
                    : modalFiltroVisible === 'categoria'
                      ? datosFiltro?.categorias.map((c) => ({ id: c, texto: c })) ?? []
                      : modalFiltroVisible === 'marca'
                        ? datosFiltro?.marcas.map((m) => ({ id: m, texto: m })) ?? []
                        : modalFiltroVisible === 'producto'
                          ? datosFiltro?.productos.map((p) => ({ id: p.id, texto: p.nombre })) ?? []
                          : (Object.keys(ETIQUETAS_METODO) as MetodoPago[]).map((m) => ({
                              id: m,
                              texto: ETIQUETAS_METODO[m],
                            }))
              }
              keyExtractor={(item) => item.id}
              ListEmptyComponent={<Text style={styles.vacio}>Sin opciones disponibles.</Text>}
              renderItem={({ item }) => (
                <Pressable
                  style={styles.modalFiltroFila}
                  onPress={() => {
                    if (modalFiltroVisible === 'promotor') actualizarFiltro('promotorId', item.id);
                    else if (modalFiltroVisible === 'punto') actualizarFiltro('puntoId', item.id);
                    else if (modalFiltroVisible === 'categoria') actualizarFiltro('categoria', item.id);
                    else if (modalFiltroVisible === 'marca') actualizarFiltro('marca', item.id);
                    else if (modalFiltroVisible === 'producto') actualizarFiltro('productoId', item.id);
                    else if (modalFiltroVisible === 'metodoPago')
                      actualizarFiltro('metodoPago', item.id as MetodoPago);
                  }}
                >
                  <Text style={styles.modalFiltroFilaTexto}>{item.texto}</Text>
                </Pressable>
              )}
            />

            <Pressable style={styles.modalCerrar} onPress={() => setModalFiltroVisible(null)}>
              <Text style={styles.modalCerrarTexto}>Cerrar</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function SelectorFiltro({
  campo,
  valorTexto,
  onPress,
}: {
  campo: CampoFiltro;
  valorTexto: string;
  onPress: () => void;
}) {
  return (
    <View style={styles.selector}>
      <View style={styles.selectorLabelFila}>
        <Ionicons name={ICONOS_FILTRO[campo]} size={12} color={COLORES_ADMIN.dorado} />
        <Text style={styles.selectorLabel}>{ETIQUETAS_FILTRO[campo]}</Text>
      </View>
      <Pressable style={styles.selectorBoton} onPress={onPress}>
        <Text style={styles.selectorBotonTexto} numberOfLines={1}>
          {valorTexto}
        </Text>
        <Ionicons name="chevron-down" size={16} color={COLORES_ADMIN.textoSecundario} />
      </Pressable>
    </View>
  );
}

function TarjetaKpi({
  icono,
  etiqueta,
  valor,
  pie,
}: {
  icono: keyof typeof Ionicons.glyphMap;
  etiqueta: string;
  valor: string;
  pie: string;
}) {
  return (
    <View style={styles.kpi}>
      <View style={styles.kpiEncabezado}>
        <Text style={styles.kpiEtiqueta}>{etiqueta}</Text>
        <Ionicons name={icono} size={17} color={COLORES_ADMIN.textoSecundario} />
      </View>
      <Text style={styles.kpiValor}>{valor}</Text>
      <View style={styles.kpiPieDivisor} />
      <Text style={styles.kpiPie}>{pie}</Text>
    </View>
  );
}

function Chip({ texto, onQuitar }: { texto: string; onQuitar: () => void }) {
  return (
    <View style={styles.chip}>
      <Text style={styles.chipTexto}>{texto}</Text>
      <Pressable onPress={onQuitar}>
        <Ionicons name="close" size={13} color={COLORES_ADMIN.error} />
      </Pressable>
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
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 10,
  },
  encabezadoIzquierda: {
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
  encabezadoDerecha: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  enVivoIndicador: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    backgroundColor: 'rgba(0,0,0,0.18)',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  enVivoPunto: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: COLORES_ADMIN.positivo,
  },
  enVivoTexto: {
    fontSize: 11,
    fontFamily: TIPOGRAFIA_ADMIN.medio,
    color: '#FFE9E2',
  },
  botonRecibos: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: COLORES_ADMIN.dorado,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  botonRecibosTexto: {
    fontSize: 13,
    fontFamily: TIPOGRAFIA_ADMIN.semiNegrita,
    color: COLORES_ADMIN.vino,
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
  filtrosTarjeta: {
    backgroundColor: COLORES_ADMIN.superficieMasBaja,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORES_ADMIN.bordeSuave,
    margin: 20,
    marginBottom: 16,
    padding: 16,
    gap: 14,
  },
  filtrosFilaSuperior: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 10,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORES_ADMIN.superficie,
  },
  tabs: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    backgroundColor: COLORES_ADMIN.superficieBaja,
    padding: 4,
    borderRadius: 10,
  },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
  },
  tabActivo: {
    backgroundColor: COLORES_ADMIN.vino,
  },
  tabTexto: {
    fontSize: 12.5,
    fontFamily: TIPOGRAFIA_ADMIN.medio,
    color: COLORES_ADMIN.textoSecundario,
  },
  tabTextoActivo: {
    color: '#FFFFFF',
    fontFamily: TIPOGRAFIA_ADMIN.semiNegrita,
  },
  actualizadoFila: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  actualizadoPunto: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: COLORES_ADMIN.dorado,
  },
  actualizadoTexto: {
    fontSize: 11.5,
    fontFamily: TIPOGRAFIA_ADMIN.monoRegular,
    color: COLORES_ADMIN.textoSecundario,
  },
  botonRefrescar: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: COLORES_ADMIN.superficieBaja,
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectoresFila: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  selector: {
    flex: 1,
    minWidth: 180,
    gap: 4,
  },
  selectorLabelFila: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  selectorLabel: {
    fontSize: 10.5,
    fontFamily: TIPOGRAFIA_ADMIN.semiNegrita,
    color: COLORES_ADMIN.textoSecundario,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  selectorBoton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: COLORES_ADMIN.superficieBaja,
    borderWidth: 1,
    borderColor: COLORES_ADMIN.superficie,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  selectorBotonTexto: {
    flex: 1,
    fontSize: 13,
    fontFamily: TIPOGRAFIA_ADMIN.semiNegrita,
    color: COLORES_ADMIN.vino,
  },
  masFiltrosBoton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: COLORES_ADMIN.superficie,
    borderWidth: 1,
    borderColor: COLORES_ADMIN.bordeSuave,
    borderRadius: 8,
    paddingHorizontal: 14,
    minWidth: 140,
    marginTop: 18,
  },
  masFiltrosTexto: {
    fontSize: 13,
    fontFamily: TIPOGRAFIA_ADMIN.medio,
    color: COLORES_ADMIN.texto,
  },
  masFiltrosBadge: {
    backgroundColor: COLORES_ADMIN.superficieMasAlta,
    borderRadius: 10,
    minWidth: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  masFiltrosBadgeTexto: {
    fontSize: 10.5,
    fontFamily: TIPOGRAFIA_ADMIN.monoSemiNegrita,
    color: COLORES_ADMIN.vino,
  },
  chipsFila: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 8,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: COLORES_ADMIN.superficie,
  },
  chipsEtiqueta: {
    fontSize: 12,
    fontFamily: TIPOGRAFIA_ADMIN.medio,
    color: COLORES_ADMIN.textoSecundario,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: COLORES_ADMIN.superficie,
    borderWidth: 1,
    borderColor: COLORES_ADMIN.bordeSuave,
    borderRadius: 16,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  chipTexto: {
    fontSize: 12,
    fontFamily: TIPOGRAFIA_ADMIN.medio,
    color: COLORES_ADMIN.texto,
  },
  limpiarFiltrosBoton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginLeft: 4,
  },
  limpiarFiltrosTexto: {
    fontSize: 12,
    fontFamily: TIPOGRAFIA_ADMIN.semiNegrita,
    color: COLORES_ADMIN.vino,
  },
  cuerpo: {
    paddingHorizontal: 20,
    gap: 16,
  },
  filaKpis: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  kpi: {
    flex: 1,
    minWidth: 200,
    backgroundColor: COLORES_ADMIN.superficieMasBaja,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORES_ADMIN.bordeSuave,
    padding: 16,
  },
  kpiEncabezado: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  kpiEtiqueta: {
    fontSize: 10.5,
    fontFamily: TIPOGRAFIA_ADMIN.semiNegrita,
    color: COLORES_ADMIN.textoSecundario,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  kpiValor: {
    fontSize: 24,
    fontFamily: TIPOGRAFIA_ADMIN.monoSemiNegrita,
    color: COLORES_ADMIN.vino,
  },
  kpiPieDivisor: {
    height: 1,
    backgroundColor: COLORES_ADMIN.superficie,
    marginVertical: 10,
  },
  kpiPie: {
    fontSize: 11.5,
    fontFamily: TIPOGRAFIA_ADMIN.medio,
    color: COLORES_ADMIN.textoSecundario,
  },
  tarjeta: {
    flex: 1,
    minWidth: 320,
    backgroundColor: COLORES_ADMIN.superficieMasBaja,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORES_ADMIN.bordeSuave,
    padding: 18,
  },
  tarjetaAncha: {
    backgroundColor: COLORES_ADMIN.superficieMasBaja,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORES_ADMIN.bordeSuave,
    padding: 18,
    gap: 14,
  },
  seccionEncabezado: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  seccionEncabezadoFila: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  seccionEncabezadoIcono: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  seccionTitulo: {
    fontSize: 15.5,
    fontFamily: TIPOGRAFIA_ADMIN.semiNegrita,
    color: COLORES_ADMIN.vino,
  },
  seccionSubtitulo: {
    fontSize: 12.5,
    fontFamily: TIPOGRAFIA_ADMIN.regular,
    color: COLORES_ADMIN.textoSecundario,
    marginTop: 2,
  },
  seccionEtiquetaChica: {
    fontSize: 10.5,
    fontFamily: TIPOGRAFIA_ADMIN.semiNegrita,
    color: COLORES_ADMIN.textoSecundario,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  vacio: {
    fontSize: 13,
    fontFamily: TIPOGRAFIA_ADMIN.regular,
    color: COLORES_ADMIN.textoSecundario,
  },
  graficoBloque: {
    gap: 10,
  },
  graficoPicoFila: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    backgroundColor: COLORES_ADMIN.superficieBaja,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  graficoPicoPunto: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: COLORES_ADMIN.dorado,
  },
  graficoPicoTexto: {
    fontSize: 12,
    fontFamily: TIPOGRAFIA_ADMIN.medio,
    color: COLORES_ADMIN.textoSecundario,
  },
  graficoPicoTextoFuerte: {
    fontFamily: TIPOGRAFIA_ADMIN.semiNegrita,
    color: COLORES_ADMIN.vino,
  },
  grafico: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 4,
    height: ALTURA_MAXIMA_BARRA + 24,
    backgroundColor: COLORES_ADMIN.superficieBaja,
    borderRadius: 12,
    padding: 10,
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
    fontFamily: TIPOGRAFIA_ADMIN.monoRegular,
    color: COLORES_ADMIN.textoSecundario,
  },
  barraEtiquetaPico: {
    fontSize: 9,
    fontFamily: TIPOGRAFIA_ADMIN.monoSemiNegrita,
    color: '#FFFFFF',
    backgroundColor: COLORES_ADMIN.vino,
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 3,
    overflow: 'hidden',
  },
  grilla2Columnas: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
  },
  barraProgresoEncabezado: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  barraProgresoNombre: {
    fontSize: 13,
    fontFamily: TIPOGRAFIA_ADMIN.semiNegrita,
    color: COLORES_ADMIN.texto,
    flexShrink: 1,
  },
  barraProgresoValores: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  barraProgresoMonto: {
    fontSize: 13,
    fontFamily: TIPOGRAFIA_ADMIN.monoSemiNegrita,
    color: COLORES_ADMIN.vino,
  },
  barraProgresoSub: {
    fontSize: 11,
    fontFamily: TIPOGRAFIA_ADMIN.regular,
    color: COLORES_ADMIN.textoSecundario,
  },
  barraProgresoTrack: {
    height: 8,
    backgroundColor: COLORES_ADMIN.superficieBaja,
    borderRadius: 4,
    overflow: 'hidden',
  },
  barraProgresoFill: {
    height: '100%',
    borderRadius: 4,
  },
  barraProgresoPorcentaje: {
    fontSize: 10.5,
    fontFamily: TIPOGRAFIA_ADMIN.monoMedio,
    color: COLORES_ADMIN.textoSecundario,
    alignSelf: 'flex-end',
  },
  filaRanking: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: COLORES_ADMIN.superficieBaja,
    borderRadius: 10,
    padding: 12,
  },
  filaRankingIzquierda: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  filaRankingMedalla: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: COLORES_ADMIN.superficie,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filaRankingMedallaPrimera: {
    backgroundColor: COLORES_ADMIN.dorado,
  },
  filaRankingMedallaTexto: {
    fontSize: 12,
    fontFamily: TIPOGRAFIA_ADMIN.monoSemiNegrita,
    color: COLORES_ADMIN.textoSecundario,
  },
  filaRankingMedallaTextoPrimera: {
    color: COLORES_ADMIN.vino,
  },
  filaRankingNombre: {
    fontSize: 13,
    fontFamily: TIPOGRAFIA_ADMIN.semiNegrita,
    color: COLORES_ADMIN.texto,
  },
  filaRankingSub: {
    fontSize: 11,
    fontFamily: TIPOGRAFIA_ADMIN.regular,
    color: COLORES_ADMIN.textoSecundario,
  },
  filaRankingDerecha: {
    alignItems: 'flex-end',
  },
  filaRankingMonto: {
    fontSize: 13,
    fontFamily: TIPOGRAFIA_ADMIN.monoSemiNegrita,
    color: COLORES_ADMIN.vino,
  },
  filaRankingPorcentaje: {
    fontSize: 10.5,
    fontFamily: TIPOGRAFIA_ADMIN.medio,
    color: COLORES_ADMIN.textoSecundario,
  },
  puntoCard: {
    backgroundColor: COLORES_ADMIN.superficieBaja,
    borderRadius: 10,
    padding: 12,
    gap: 6,
  },
  puntoCardSub: {
    fontSize: 10.5,
    fontFamily: TIPOGRAFIA_ADMIN.medio,
    color: COLORES_ADMIN.textoSecundario,
  },
  categoriaGrilla: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 14,
  },
  categoriaCard: {
    flex: 1,
    minWidth: 130,
    backgroundColor: COLORES_ADMIN.superficieBaja,
    borderRadius: 10,
    padding: 12,
    gap: 4,
  },
  categoriaBadge: {
    backgroundColor: COLORES_ADMIN.superficieMasAlta,
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  categoriaBadgeTexto: {
    fontSize: 10,
    fontFamily: TIPOGRAFIA_ADMIN.monoSemiNegrita,
    color: COLORES_ADMIN.vino,
  },
  categoriaMonto: {
    fontSize: 15,
    fontFamily: TIPOGRAFIA_ADMIN.monoSemiNegrita,
    color: COLORES_ADMIN.vino,
  },
  divisor: {
    height: 1,
    backgroundColor: COLORES_ADMIN.superficie,
    marginVertical: 14,
  },
  filaProducto: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 9,
    gap: 8,
  },
  filaProductoBorde: {
    borderBottomWidth: 1,
    borderBottomColor: COLORES_ADMIN.superficie,
  },
  filaProductoIzquierda: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flexShrink: 1,
  },
  filaProductoIndice: {
    width: 22,
    height: 22,
    borderRadius: 6,
    backgroundColor: COLORES_ADMIN.superficieAlta,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filaProductoIndiceTexto: {
    fontSize: 10.5,
    fontFamily: TIPOGRAFIA_ADMIN.monoSemiNegrita,
    color: COLORES_ADMIN.vino,
  },
  filaProductoNombre: {
    fontSize: 13,
    fontFamily: TIPOGRAFIA_ADMIN.semiNegrita,
    color: COLORES_ADMIN.texto,
  },
  filaProductoUnidades: {
    fontSize: 11,
    fontFamily: TIPOGRAFIA_ADMIN.regular,
    color: COLORES_ADMIN.textoSecundario,
  },
  filaProductoTotal: {
    fontSize: 13,
    fontFamily: TIPOGRAFIA_ADMIN.monoSemiNegrita,
    color: COLORES_ADMIN.vino,
  },
  piePagina: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 10,
    backgroundColor: COLORES_ADMIN.superficieBaja,
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
  },
  piePaginaIzquierda: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  piePaginaTexto: {
    fontSize: 12.5,
    fontFamily: TIPOGRAFIA_ADMIN.regular,
    color: COLORES_ADMIN.textoSecundario,
  },
  piePaginaEnlace: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  piePaginaEnlaceTexto: {
    fontSize: 13,
    fontFamily: TIPOGRAFIA_ADMIN.semiNegrita,
    color: COLORES_ADMIN.vino,
  },
  fondoModal: {
    flex: 1,
    backgroundColor: 'rgba(41,23,15,0.45)',
    justifyContent: 'flex-end',
  },
  tarjetaModalCalendario: {
    alignSelf: 'center',
    backgroundColor: COLORES_ADMIN.background,
    borderRadius: 16,
    padding: 20,
    marginBottom: 40,
    gap: 12,
  },
  modalCalendarioTitulo: {
    fontSize: 15,
    fontFamily: TIPOGRAFIA_ADMIN.semiNegrita,
    color: COLORES_ADMIN.vino,
    textAlign: 'center',
  },
  modalCalendarioConfirmar: {
    backgroundColor: COLORES_ADMIN.vino,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  modalCalendarioConfirmarTexto: {
    fontSize: 14,
    fontFamily: TIPOGRAFIA_ADMIN.semiNegrita,
    color: '#FFFFFF',
  },
  botonDeshabilitado: {
    opacity: 0.5,
  },
  tarjetaModalFiltro: {
    backgroundColor: COLORES_ADMIN.background,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    height: '70%',
    gap: 12,
  },
  modalFiltroTabs: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  modalFiltroTab: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 16,
    backgroundColor: COLORES_ADMIN.superficieMasBaja,
    borderWidth: 1,
    borderColor: COLORES_ADMIN.bordeSuave,
  },
  modalFiltroTabActivo: {
    backgroundColor: COLORES_ADMIN.vino,
    borderColor: COLORES_ADMIN.vino,
  },
  modalFiltroTabTexto: {
    fontSize: 12,
    fontFamily: TIPOGRAFIA_ADMIN.medio,
    color: COLORES_ADMIN.textoSecundario,
  },
  modalFiltroTabTextoActivo: {
    color: '#FFFFFF',
    fontFamily: TIPOGRAFIA_ADMIN.semiNegrita,
  },
  modalFiltroLista: {
    flex: 1,
  },
  modalFiltroFila: {
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORES_ADMIN.superficie,
  },
  modalFiltroFilaTexto: {
    fontSize: 14,
    fontFamily: TIPOGRAFIA_ADMIN.regular,
    color: COLORES_ADMIN.texto,
  },
  modalCerrar: {
    alignItems: 'center',
    paddingVertical: 12,
  },
  modalCerrarTexto: {
    fontSize: 14,
    fontFamily: TIPOGRAFIA_ADMIN.semiNegrita,
    color: COLORES_ADMIN.vino,
  },
});
