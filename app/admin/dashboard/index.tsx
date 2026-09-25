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
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { formatearPesos, parsearPesos } from '@/core/dinero';
import {
  calcularProyeccionMes,
  calcularRangoMesBogota,
  calcularRangoPeriodo,
  diasEnMes,
  ETIQUETAS_PERIODO,
  fechaHoyBogota,
  mesActualBogota,
  type Periodo,
} from '@/core/analitica';
import type { Categoria, MetodoPago, Producto, Punto, TipoMeta, UsuarioSesion } from '@/core/tipos';
import { getDb } from '@/db/client';
import { listarCategorias } from '@/db/categorias';
import {
  compararConPeriodoAnterior,
  listarProductosVendidos,
  listarVentasFiltradas,
  obtenerMargenPorProducto,
  obtenerResumenVentas,
  obtenerSaldoTotalBodega,
  obtenerVentasPorCategoria,
  obtenerVentasPorPromotor,
  obtenerVentasPorPunto,
  type ComparacionPeriodo,
  type FiltrosVentas,
  type ProductoMasVendido,
  type RangoFechas,
  type ResumenMargen,
  type ResumenVentasPeriodo,
  type SaldoTotalBodega,
  type TotalPorCategoria,
  type TotalPorPromotor,
  type TotalPorPunto,
} from '@/db/analitica';
import { getDispositivoId } from '@/db/dispositivo';
import { exportarVariasHojasAExcel } from '@/db/exportarExcel';
import { establecerMeta, obtenerProgresoMetas, type ProgresoMeta } from '@/db/metas';
import { listarNotificaciones } from '@/db/notificaciones';
import { listarMarcasDistintas, listarProductos } from '@/db/productos';
import { listarPuntos } from '@/db/puntos';
import { listarPromotores } from '@/db/usuarios';
import { CalendarioRango } from '@/ui/CalendarioRango';
import { ContenedorAncho } from '@/ui/ContenedorAncho';
import { GraficoBarrasHorizontales } from '@/ui/graficas/GraficoBarrasHorizontales';
import { GraficoCircular } from '@/ui/graficas/GraficoCircular';
import { ModalDetalleSeccion, type SeccionDetalle } from '@/ui/ModalDetalleSeccion';
import { ANCHO_ADMIN, COLORES_ADMIN, TIPOGRAFIA_ADMIN, RADII_ADMIN, TEXTO_ADMIN } from '@/ui/tema';
import { useEsPantallaAncha } from '@/ui/useEsPantallaAncha';
import { useRequiereSesion } from '@/ui/useRequiereSesion';
import { useRecargarConDatosNuevos } from '@/ui/useVersionDatos';

/** Paleta cíclica para gráficas circulares con más de 3 segmentos (categorías, etc.) — más allá de vino/dorado no hay más colores de marca definidos. */
const PALETA_CIRCULAR = [
  COLORES_ADMIN.vino,
  COLORES_ADMIN.dorado,
  '#4C8C86',
  '#5B7B9A',
  '#B5651D',
  '#8E6C88',
  '#7A9E7E',
  '#C97B63',
];

const COLORES_METODO_PAGO: Record<MetodoPago, string> = {
  EFECTIVO: COLORES_ADMIN.positivo,
  TRANSFERENCIA: COLORES_ADMIN.vino,
  LIBRANZA: COLORES_ADMIN.dorado,
};

const ETIQUETAS_METODO: Record<string, string> = {
  EFECTIVO: 'Efectivo',
  TRANSFERENCIA: 'Transferencia',
  LIBRANZA: 'Libranza',
};

/** Navega al detalle de un KPI de venta, pasando el rango vigente y los filtros activos del dashboard por query param. */
function irADetalleVentas(
  metrica: 'total' | 'cantidad' | 'ticket',
  rango: RangoFechas | null,
  filtros: FiltrosVentas
) {
  if (!rango) return;
  router.push({
    pathname: '/admin/dashboard/detalle-ventas',
    params: { metrica, desde: rango.desde, hasta: rango.hasta, filtros: JSON.stringify(filtros) },
  });
}

const ALTURA_MAXIMA_BARRA = 96;

function GraficoHoras({ porHora }: { porHora: ResumenVentasPeriodo['porHora'] }) {
  const [horaSeleccionada, setHoraSeleccionada] = useState<number | null>(null);

  const porHoraCompleto = useMemo(() => {
    const mapa = new Map(porHora.map((h) => [h.hora, h]));
    return Array.from({ length: 24 }, (_, hora) => mapa.get(hora) ?? { hora, cantidadVentas: 0, totalVendido: 0, porPromotor: [] });
  }, [porHora]);

  const maximo = Math.max(1, ...porHoraCompleto.map((h) => h.cantidadVentas));
  const horaPico = porHoraCompleto.reduce((mejor, h) => (h.cantidadVentas > mejor.cantidadVentas ? h : mejor));
  const detalle = horaSeleccionada !== null ? porHoraCompleto[horaSeleccionada] : null;

  return (
    <View style={styles.graficoBloque}>
      {horaPico.cantidadVentas > 0 && (
        <View style={styles.graficoPicoFila}>
          <View style={styles.graficoPicoPunto} />
          <Text style={styles.graficoPicoTexto}>
            Hora pico:{' '}
            <Text style={styles.graficoPicoTextoFuerte}>
              {horaPico.hora}:00 ({horaPico.cantidadVentas} ventas)
            </Text>
          </Text>
        </View>
      )}
      <View style={styles.graficoContenedor}>
        <View style={styles.grafico}>
          {porHoraCompleto.map((datosHora) => {
            const { hora, cantidadVentas } = datosHora;
            const seleccionada = hora === horaSeleccionada;
            return (
              <Pressable
                key={hora}
                style={styles.barraColumna}
                disabled={cantidadVentas === 0}
                onPress={() => setHoraSeleccionada(seleccionada ? null : hora)}
              >
                <View style={styles.barraEtiquetaPicoContenedor}>
                  {cantidadVentas > 0 && cantidadVentas === maximo && (
                    <Text style={styles.barraEtiquetaPico}>{cantidadVentas}v.</Text>
                  )}
                </View>
                <View
                  style={[
                    styles.barra,
                    {
                      height: Math.max(3, (cantidadVentas / maximo) * ALTURA_MAXIMA_BARRA),
                      backgroundColor:
                        cantidadVentas === 0
                          ? COLORES_ADMIN.superficieAlta
                          : seleccionada
                            ? COLORES_ADMIN.vino
                            : COLORES_ADMIN.dorado,
                    },
                  ]}
                />
              </Pressable>
            );
          })}
        </View>
        <View style={styles.graficoEje} />
        <View style={styles.graficoEtiquetas}>
          {porHoraCompleto.map(({ hora }) => (
            <View key={hora} style={styles.graficoEtiquetaColumna}>
              {hora % 3 === 0 && <Text style={styles.barraEtiqueta}>{hora}</Text>}
            </View>
          ))}
        </View>
      </View>

      {detalle && detalle.cantidadVentas > 0 && (
        <View style={styles.desgloseHora}>
          <View style={styles.desgloseHoraEncabezado}>
            <Text style={styles.desgloseHoraTitulo}>
              {String(detalle.hora).padStart(2, '0')}:00 — {formatearPesos(detalle.totalVendido)} ·{' '}
              {detalle.cantidadVentas} venta{detalle.cantidadVentas === 1 ? '' : 's'}
            </Text>
            <Pressable onPress={() => setHoraSeleccionada(null)}>
              <Ionicons name="close" size={16} color={COLORES_ADMIN.textoSecundario} />
            </Pressable>
          </View>
          {detalle.porPromotor.map((p) => {
            const porcentaje = detalle.totalVendido === 0 ? 0 : (p.totalVendido / detalle.totalVendido) * 100;
            return (
              <View key={p.promotorId} style={styles.desgloseHoraFila}>
                <Text style={styles.desgloseHoraPromotor} numberOfLines={1}>
                  {p.promotorNombre}
                </Text>
                <View style={styles.desgloseHoraBarraTrack}>
                  <View style={[styles.desgloseHoraBarraFill, { width: `${porcentaje}%` }]} />
                </View>
                <Text style={styles.desgloseHoraMonto}>{formatearPesos(p.totalVendido)}</Text>
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
}

interface DatosFiltro {
  promotores: UsuarioSesion[];
  puntos: Punto[];
  productos: Producto[];
  categorias: Categoria[];
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
  const [productosVendidos, setProductosVendidos] = useState<ProductoMasVendido[]>([]);
  const [comparacion, setComparacion] = useState<ComparacionPeriodo | null>(null);
  const [margen, setMargen] = useState<ResumenMargen | null>(null);
  const [notificacionesCriticas, setNotificacionesCriticas] = useState(0);
  const [seccionDetalle, setSeccionDetalle] = useState<SeccionDetalle | null>(null);
  const [datosFiltro, setDatosFiltro] = useState<DatosFiltro | null>(null);
  const [cargando, setCargando] = useState(true);
  const [minutosDesdeActualizacion, setMinutosDesdeActualizacion] = useState(0);
  const [exportando, setExportando] = useState(false);
  const [vistaCategoria, setVistaCategoria] = useState<'BARRAS' | 'CIRCULAR'>('BARRAS');
  const [metricaRanking, setMetricaRanking] = useState<'INGRESOS' | 'MARGEN'>('INGRESOS');
  const [ordenRanking, setOrdenRanking] = useState<'MEJOR' | 'PEOR'>('MEJOR');
  const insets = useSafeAreaInsets();
  const ultimaActualizacion = useRef<number>(0);

  const mesActual = useMemo(() => mesActualBogota(), []);
  const [progresoMetas, setProgresoMetas] = useState<ProgresoMeta[]>([]);
  const [totalVendidoMesActual, setTotalVendidoMesActual] = useState(0);
  const [cargandoMetas, setCargandoMetas] = useState(true);
  const [modalMetaVisible, setModalMetaVisible] = useState(false);
  const [metaTipo, setMetaTipo] = useState<TipoMeta>('PROMOTOR');
  const [metaEntidadId, setMetaEntidadId] = useState<string | null>(null);
  const [metaMontoTexto, setMetaMontoTexto] = useState('');
  const [guardandoMeta, setGuardandoMeta] = useState(false);

  const rango: RangoFechas | null = useMemo(() => {
    if (periodo === 'PERSONALIZADO') {
      if (!desdePersonalizado || !hastaPersonalizado) return null;
      return {
        desde: new Date(`${desdePersonalizado}T00:00:00-05:00`).toISOString(),
        hasta: new Date(`${hastaPersonalizado}T23:59:59-05:00`).toISOString(),
      };
    }
    return calcularRangoPeriodo(periodo);
  }, [periodo, desdePersonalizado, hastaPersonalizado]);

  const cargar = useCallback(async () => {
    if (!rango) return;
    setCargando(true);
    try {
      const db = await getDb();
      const [
        resumenVentas,
        saldo,
        promotorTotales,
        puntoTotales,
        categoriaTotales,
        productosVendidosLista,
        comparacionPeriodo,
        margenPeriodo,
        criticas,
      ] = await Promise.all([
        obtenerResumenVentas(db, rango, filtros),
        obtenerSaldoTotalBodega(db),
        obtenerVentasPorPromotor(db, rango, filtros),
        obtenerVentasPorPunto(db, rango, filtros),
        obtenerVentasPorCategoria(db, rango, filtros),
        listarProductosVendidos(db, rango, filtros),
        compararConPeriodoAnterior(db, rango, filtros),
        obtenerMargenPorProducto(db, rango, filtros),
        listarNotificaciones(db, { soloNoLeidas: true }),
      ]);
      setResumen(resumenVentas);
      setSaldoBodega(saldo);
      setPorPromotor(promotorTotales);
      setPorPunto(puntoTotales);
      setPorCategoria(categoriaTotales);
      setProductosVendidos(productosVendidosLista);
      setComparacion(comparacionPeriodo);
      setMargen(margenPeriodo);
      setNotificacionesCriticas(criticas.filter((n) => n.nivel === 'CRITICO').length);
      ultimaActualizacion.current = Date.now();
      setMinutosDesdeActualizacion(0);
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
      listarCategorias(db),
      listarMarcasDistintas(db),
    ]);
    setDatosFiltro({ promotores, puntos, productos, categorias, marcas });
  }, []);

  const cargarMetas = useCallback(async () => {
    setCargandoMetas(true);
    try {
      const db = await getDb();
      const [progreso, resumenMes] = await Promise.all([
        obtenerProgresoMetas(db, mesActual),
        obtenerResumenVentas(db, calcularRangoMesBogota(mesActual)),
      ]);
      setProgresoMetas(progreso);
      setTotalVendidoMesActual(resumenMes.totalVendido);
    } finally {
      setCargandoMetas(false);
    }
  }, [mesActual]);

  useFocusEffect(
    useCallback(() => {
      cargar();
      cargarDatosFiltro();
      cargarMetas();
    }, [cargar, cargarDatosFiltro, cargarMetas])
  );
  // Cuando llega una venta nueva de otro dispositivo (Realtime, ver
  // src/ui/useSincronizacionEnVivo.ts) los números se actualizan solos, sin
  // tocar nada — pedido explícito: las ventas deben verse "de forma
  // instantánea".
  useRecargarConDatosNuevos(() => {
    cargar();
    cargarMetas();
  });

  // Ya no hay refresco por temporizador (se quitó el de 15 s) — solo se
  // actualiza al llegar datos nuevos o cuando el admin toca el botón de
  // refrescar. Se mantiene el contador de "hace cuántos minutos".
  useEffect(() => {
    const intervaloContador = setInterval(() => {
      setMinutosDesdeActualizacion(Math.floor((Date.now() - ultimaActualizacion.current) / 60000));
    }, 30000);
    return () => {
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
    if (campo === 'categoria') return !!filtros.categoriaId;
    if (campo === 'marca') return !!filtros.marca;
    return !!filtros.productoId;
  }).length;

  const nombrePromotorFiltro = datosFiltro?.promotores.find((p) => p.id === filtros.promotorId)?.nombre;
  const nombrePuntoFiltro = datosFiltro?.puntos.find((p) => p.id === filtros.puntoId);
  const nombreProductoFiltro = datosFiltro?.productos.find((p) => p.id === filtros.productoId)?.nombre;
  const nombreCategoriaFiltro = datosFiltro?.categorias.find((c) => c.id === filtros.categoriaId)?.nombre;

  const proyeccionMes = calcularProyeccionMes(totalVendidoMesActual, mesActual);
  const diaActualDelMes = Number(fechaHoyBogota().slice(8, 10));
  const diasTotalesDelMes = diasEnMes(mesActual);
  const nombreMesActual = new Date(`${mesActual}-01T12:00:00`).toLocaleDateString('es-CO', {
    month: 'long',
    year: 'numeric',
  });

  const margenPorProductoId = new Map(margen?.productos.map((p) => [p.productoId, p.margenTotal]) ?? []);
  const productosConMetrica = (
    metricaRanking === 'INGRESOS'
      ? productosVendidos
      : productosVendidos.filter((p) => margenPorProductoId.has(p.productoId))
  ).map((p) => ({
    productoId: p.productoId,
    productoNombre: p.productoNombre,
    unidadesVendidas: p.unidadesVendidas,
    valor: metricaRanking === 'INGRESOS' ? p.totalVendido : (margenPorProductoId.get(p.productoId) ?? 0),
  }));
  const productosOrdenados = [...productosConMetrica].sort((a, b) =>
    ordenRanking === 'MEJOR' ? b.valor - a.valor : a.valor - b.valor
  );

  async function guardarMeta() {
    if (!metaEntidadId || !usuario) return;
    const monto = parsearPesos(metaMontoTexto);
    if (monto <= 0) return;
    setGuardandoMeta(true);
    try {
      const db = await getDb();
      const dispositivoId = await getDispositivoId(db);
      await establecerMeta(
        db,
        { tipo: metaTipo, entidadId: metaEntidadId, mes: mesActual, montoObjetivo: monto },
        usuario.id,
        dispositivoId
      );
      setModalMetaVisible(false);
      setMetaEntidadId(null);
      setMetaMontoTexto('');
      await cargarMetas();
    } finally {
      setGuardandoMeta(false);
    }
  }

  async function exportarInforme() {
    if (!rango) return;
    setExportando(true);
    try {
      const db = await getDb();
      const ventasDetalle = await listarVentasFiltradas(db, rango, filtros);
      await exportarVariasHojasAExcel(
        [
          {
            nombre: 'Resumen',
            filas: [
              {
                'Total vendido': resumen?.totalVendido ?? 0,
                'Cantidad de ventas': resumen?.cantidadVentas ?? 0,
                'Ticket promedio': resumen?.ticketPromedio ?? 0,
                Desde: rango.desde,
                Hasta: rango.hasta,
              },
            ],
          },
          {
            nombre: 'Por método de pago',
            filas: (resumen?.porMetodoPago ?? []).map((m) => ({
              Método: ETIQUETAS_METODO[m.metodoPago],
              Total: m.total,
              Ventas: m.cantidadVentas,
            })),
          },
          {
            nombre: 'Por promotor',
            filas: porPromotor.map((p) => ({
              Promotor: p.promotorNombre,
              Total: p.totalVendido,
              Ventas: p.cantidadVentas,
              'Ticket promedio': p.cantidadVentas === 0 ? 0 : Math.round(p.totalVendido / p.cantidadVentas),
            })),
          },
          {
            nombre: 'Por punto',
            filas: porPunto.map((p) => ({
              Punto: `${p.empresaNombre} · ${p.puntoNombre}`,
              Total: p.totalVendido,
              Ventas: p.cantidadVentas,
            })),
          },
          {
            nombre: 'Por categoría',
            filas: porCategoria.map((c) => ({
              Categoría: c.categoriaNombre,
              Total: c.totalVendido,
              Unidades: c.unidadesVendidas,
            })),
          },
          {
            nombre: 'Ranking productos',
            filas: productosVendidos.map((p) => ({
              Producto: p.productoNombre,
              Unidades: p.unidadesVendidas,
              'Total vendido': p.totalVendido,
              Margen: margenPorProductoId.get(p.productoId) ?? '',
            })),
          },
          {
            nombre: 'Ventas',
            filas: ventasDetalle.map((v) => ({
              Recibo: v.numeroRecibo,
              Promotor: v.promotorNombre,
              Punto: v.puntoNombre ?? '',
              Fecha: v.tsCliente,
              Método: ETIQUETAS_METODO[v.metodoPago],
              Total: v.total,
            })),
          },
        ],
        `informe_ventas_${rango.desde.slice(0, 10)}_a_${rango.hasta.slice(0, 10)}`
      );
    } finally {
      setExportando(false);
    }
  }

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
            <View style={styles.encabezadoIzquierda}>
              {!anchaPantalla && (
                <Pressable style={styles.volverBoton} onPress={() => router.back()}>
                  <Ionicons name="chevron-back" size={16} color="#FFE9E2" />
                  <Text style={styles.volverTexto}>Admin</Text>
                </Pressable>
              )}
              <Text style={anchaPantalla ? styles.tituloAncho : styles.titulo}>Dashboard</Text>
            </View>
            <View style={styles.encabezadoDerecha}>
              {notificacionesCriticas > 0 && (
                <Pressable
                  style={styles.botonNotificaciones}
                  onPress={() => router.push('/admin/notificaciones')}
                >
                  <Ionicons name="warning-outline" size={15} color="#FFFFFF" />
                  <Text style={styles.botonNotificacionesTexto}>
                    {notificacionesCriticas} crítica{notificacionesCriticas === 1 ? '' : 's'}
                  </Text>
                </Pressable>
              )}
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
          <ContenedorAncho anchoMaximo={ANCHO_ADMIN.tablero}>
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
                      color={periodo === 'PERSONALIZADO' ? COLORES_ADMIN.textoInverso : COLORES_ADMIN.textoSecundario}
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
                    {minutosDesdeActualizacion === 0
                      ? 'Actualizado hace instantes'
                      : `Actualizado hace ${minutosDesdeActualizacion} min`}
                  </Text>
                  <Pressable style={styles.botonRefrescar} onPress={cargar}>
                    <Ionicons name="sync-outline" size={15} color={COLORES_ADMIN.textoSecundario} />
                    <Text style={styles.botonRefrescarTexto}>Actualizar</Text>
                  </Pressable>
                  <Pressable
                    style={styles.botonRefrescar}
                    onPress={exportarInforme}
                    disabled={exportando || !resumen || resumen.cantidadVentas === 0}
                  >
                    {exportando ? (
                      <ActivityIndicator size="small" color={COLORES_ADMIN.textoSecundario} />
                    ) : (
                      <>
                        <Ionicons name="download-outline" size={15} color={COLORES_ADMIN.textoSecundario} />
                        <Text style={styles.botonRefrescarTexto}>Exportar informe</Text>
                      </>
                    )}
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
                  {filtros.categoriaId && (
                    <Chip
                      texto={`Categoría: ${nombreCategoriaFiltro ?? ''}`}
                      onQuitar={() => quitarFiltro('categoriaId')}
                    />
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
                    variacionPct={comparacion?.variacionTotalPct}
                    onPress={() => irADetalleVentas('total', rango, filtros)}
                  />
                  <TarjetaKpi
                    icono="receipt-outline"
                    etiqueta="Ventas emitidas"
                    valor={String(resumen.cantidadVentas)}
                    pie="Recibos emitidos"
                    variacionPct={comparacion?.variacionCantidadPct}
                    onPress={() => irADetalleVentas('cantidad', rango, filtros)}
                  />
                  <TarjetaKpi
                    icono="stats-chart-outline"
                    etiqueta="Ticket promedio"
                    valor={formatearPesos(resumen.ticketPromedio)}
                    pie="Por venta registrada"
                    onPress={() => irADetalleVentas('ticket', rango, filtros)}
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
                    onPress={() => rango && router.push({ pathname: '/admin/dashboard/detalle-bodega', params: { desde: rango.desde, hasta: rango.hasta } })}
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
                      <View style={{ gap: 16 }}>
                        <GraficoCircular
                          segmentos={resumen.porMetodoPago.map((m) => ({
                            etiqueta: ETIQUETAS_METODO[m.metodoPago],
                            valor: m.total,
                            color: COLORES_METODO_PAGO[m.metodoPago],
                          }))}
                          formatearValor={formatearPesos}
                        />
                        <View style={styles.divisor} />
                        {resumen.porMetodoPago.map((m) => {
                          const porcentaje =
                            resumen.totalVendido === 0 ? 0 : (m.total / resumen.totalVendido) * 100;
                          return (
                            <Pressable
                              key={m.metodoPago}
                              style={{ gap: 5 }}
                              onPress={() =>
                                setSeccionDetalle({
                                  campo: 'metodoPago',
                                  valor: m.metodoPago,
                                  titulo: ETIQUETAS_METODO[m.metodoPago],
                                })
                              }
                            >
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
                            </Pressable>
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
                          <Pressable
                            key={p.promotorId}
                            style={styles.filaRanking}
                            onPress={() =>
                              setSeccionDetalle({
                                campo: 'promotorId',
                                valor: p.promotorId,
                                titulo: p.promotorNombre,
                              })
                            }
                          >
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
                                <Text style={styles.filaRankingSub}>
                                  {p.cantidadVentas} ventas · ticket prom.{' '}
                                  {formatearPesos(
                                    p.cantidadVentas === 0 ? 0 : Math.round(p.totalVendido / p.cantidadVentas)
                                  )}
                                </Text>
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
                          </Pressable>
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
                            <Pressable
                              key={p.puntoId}
                              style={styles.puntoCard}
                              onPress={() =>
                                setSeccionDetalle({
                                  campo: 'puntoId',
                                  valor: p.puntoId,
                                  titulo: `${p.empresaNombre} · ${p.puntoNombre}`,
                                })
                              }
                            >
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
                            </Pressable>
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
                      {porCategoria.length > 0 && (
                        <View style={styles.mininTabs}>
                          <Pressable
                            style={[styles.mininTab, vistaCategoria === 'BARRAS' && styles.mininTabActivo]}
                            onPress={() => setVistaCategoria('BARRAS')}
                          >
                            <Ionicons
                              name="stats-chart-outline"
                              size={13}
                              color={vistaCategoria === 'BARRAS' ? COLORES_ADMIN.textoInverso : COLORES_ADMIN.textoSecundario}
                            />
                          </Pressable>
                          <Pressable
                            style={[styles.mininTab, vistaCategoria === 'CIRCULAR' && styles.mininTabActivo]}
                            onPress={() => setVistaCategoria('CIRCULAR')}
                          >
                            <Ionicons
                              name="pie-chart-outline"
                              size={13}
                              color={vistaCategoria === 'CIRCULAR' ? COLORES_ADMIN.textoInverso : COLORES_ADMIN.textoSecundario}
                            />
                          </Pressable>
                        </View>
                      )}
                    </View>
                    {porCategoria.length === 0 ? (
                      <Text style={styles.vacio}>
                        Sin ventas de productos con categoría asignada en este período.
                      </Text>
                    ) : vistaCategoria === 'CIRCULAR' ? (
                      <GraficoCircular
                        segmentos={porCategoria.map((c, indice) => ({
                          etiqueta: c.categoriaNombre,
                          valor: c.totalVendido,
                          color: PALETA_CIRCULAR[indice % PALETA_CIRCULAR.length],
                        }))}
                        formatearValor={formatearPesos}
                      />
                    ) : (
                      <View style={styles.categoriaGrilla}>
                        {porCategoria.map((c) => (
                          <Pressable
                            key={c.categoriaId}
                            style={styles.categoriaCard}
                            onPress={() =>
                              setSeccionDetalle({
                                campo: 'categoriaId',
                                valor: c.categoriaId,
                                titulo: c.categoriaNombre,
                              })
                            }
                          >
                            <View style={styles.barraProgresoEncabezado}>
                              <Text style={styles.barraProgresoNombre}>{c.categoriaNombre}</Text>
                              <View style={styles.categoriaBadge}>
                                <Text style={styles.categoriaBadgeTexto}>{c.unidadesVendidas} und.</Text>
                              </View>
                            </View>
                            <Text style={styles.categoriaMonto}>{formatearPesos(c.totalVendido)}</Text>
                          </Pressable>
                        ))}
                      </View>
                    )}

                    <View style={styles.divisor} />

                    <View style={styles.seccionEncabezadoFila}>
                      <View style={styles.seccionEncabezadoIcono}>
                        <Ionicons name="trophy-outline" size={17} color={COLORES_ADMIN.textoSecundario} />
                        <Text style={styles.seccionTitulo}>Ranking de productos</Text>
                      </View>
                    </View>
                    <View style={styles.rankingControles}>
                      <View style={styles.mininTabs}>
                        <Pressable
                          style={[styles.mininTabTexto, metricaRanking === 'INGRESOS' && styles.mininTabActivo]}
                          onPress={() => setMetricaRanking('INGRESOS')}
                        >
                          <Text
                            style={[
                              styles.mininTabEtiqueta,
                              metricaRanking === 'INGRESOS' && styles.mininTabEtiquetaActiva,
                            ]}
                          >
                            Ingresos
                          </Text>
                        </Pressable>
                        <Pressable
                          style={[styles.mininTabTexto, metricaRanking === 'MARGEN' && styles.mininTabActivo]}
                          onPress={() => setMetricaRanking('MARGEN')}
                        >
                          <Text
                            style={[
                              styles.mininTabEtiqueta,
                              metricaRanking === 'MARGEN' && styles.mininTabEtiquetaActiva,
                            ]}
                          >
                            Margen
                          </Text>
                        </Pressable>
                      </View>
                      <View style={styles.mininTabs}>
                        <Pressable
                          style={[styles.mininTabTexto, ordenRanking === 'MEJOR' && styles.mininTabActivo]}
                          onPress={() => setOrdenRanking('MEJOR')}
                        >
                          <Text
                            style={[
                              styles.mininTabEtiqueta,
                              ordenRanking === 'MEJOR' && styles.mininTabEtiquetaActiva,
                            ]}
                          >
                            Mejores
                          </Text>
                        </Pressable>
                        <Pressable
                          style={[styles.mininTabTexto, ordenRanking === 'PEOR' && styles.mininTabActivo]}
                          onPress={() => setOrdenRanking('PEOR')}
                        >
                          <Text
                            style={[
                              styles.mininTabEtiqueta,
                              ordenRanking === 'PEOR' && styles.mininTabEtiquetaActiva,
                            ]}
                          >
                            Peores
                          </Text>
                        </Pressable>
                      </View>
                    </View>
                    {metricaRanking === 'MARGEN' &&
                      margen &&
                      margen.productosConCosto < margen.productosVendidosTotal && (
                        <Text style={styles.margenCobertura}>
                          {margen.productosConCosto} de {margen.productosVendidosTotal} productos vendidos
                          tienen costo capturado — este ranking por margen es parcial.
                        </Text>
                      )}
                    {productosOrdenados.length === 0 ? (
                      <Text style={styles.vacio}>
                        {metricaRanking === 'MARGEN'
                          ? 'Ningún producto vendido en este período tiene costo capturado todavía.'
                          : 'Sin ventas en este período.'}
                      </Text>
                    ) : (
                      <>
                        <GraficoBarrasHorizontales
                          barras={productosOrdenados.slice(0, 8).map((p) => ({
                            etiqueta: p.productoNombre,
                            valor: p.valor,
                          }))}
                          formatearValor={formatearPesos}
                          color={ordenRanking === 'MEJOR' ? COLORES_ADMIN.positivo : COLORES_ADMIN.error}
                        />
                        <View style={{ gap: 4, marginTop: 12 }}>
                          {productosOrdenados.slice(0, 8).map((p, indice) => (
                            <View
                              key={p.productoId}
                              style={[
                                styles.filaProducto,
                                indice < Math.min(productosOrdenados.length, 8) - 1 && styles.filaProductoBorde,
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
                              <Text style={styles.filaProductoTotal}>{formatearPesos(p.valor)}</Text>
                            </View>
                          ))}
                        </View>
                      </>
                    )}
                  </View>
                </View>

                <View style={styles.tarjetaAncha}>
                  <View style={styles.seccionEncabezadoFila}>
                    <View style={styles.seccionEncabezadoIcono}>
                      <Ionicons name="flag-outline" size={17} color={COLORES_ADMIN.textoSecundario} />
                      <Text style={styles.seccionTitulo}>Metas del mes</Text>
                      <Text style={styles.seccionEtiquetaChica}>{nombreMesActual}</Text>
                    </View>
                    <Pressable
                      style={styles.botonAgregarMeta}
                      onPress={() => {
                        setMetaTipo('PROMOTOR');
                        setMetaEntidadId(null);
                        setMetaMontoTexto('');
                        setModalMetaVisible(true);
                      }}
                    >
                      <Ionicons name="add" size={16} color={COLORES_ADMIN.vino} />
                      <Text style={styles.botonAgregarMetaTexto}>Nueva meta</Text>
                    </Pressable>
                  </View>

                  <View style={styles.proyeccionFila}>
                    <View style={styles.proyeccionCard}>
                      <Text style={styles.seccionEtiquetaChica}>Vendido este mes</Text>
                      <Text style={styles.filaRankingMonto}>{formatearPesos(totalVendidoMesActual)}</Text>
                    </View>
                    <View style={styles.proyeccionCard}>
                      <Text style={styles.seccionEtiquetaChica}>Proyección de cierre</Text>
                      <Text style={styles.filaRankingMonto}>
                        {proyeccionMes !== null ? formatearPesos(proyeccionMes) : '—'}
                      </Text>
                      <Text style={styles.margenCobertura}>
                        Con el ritmo de los {diaActualDelMes} días transcurridos (de {diasTotalesDelMes})
                      </Text>
                    </View>
                  </View>

                  {cargandoMetas ? (
                    <ActivityIndicator size="small" color={COLORES_ADMIN.vino} style={{ marginTop: 12 }} />
                  ) : progresoMetas.length === 0 ? (
                    <Text style={styles.vacio}>
                      Todavía no hay metas para este mes. Toca &quot;Nueva meta&quot; para crear una.
                    </Text>
                  ) : (
                    <View style={{ gap: 14, marginTop: 14 }}>
                      {progresoMetas.map((m) => (
                        <View key={m.metaId} style={{ gap: 5 }}>
                          <View style={styles.barraProgresoEncabezado}>
                            <Text style={styles.barraProgresoNombre}>
                              {m.entidadNombre} · {m.tipo === 'PROMOTOR' ? 'Promotor' : 'Punto'}
                            </Text>
                            <Text style={styles.barraProgresoSub}>
                              {formatearPesos(m.totalVendido)} / {formatearPesos(m.montoObjetivo)}
                            </Text>
                          </View>
                          <View style={styles.barraProgresoTrack}>
                            <View
                              style={[
                                styles.barraProgresoFill,
                                {
                                  width: `${Math.min(m.progresoPct, 100)}%`,
                                  backgroundColor:
                                    m.progresoPct >= 100 ? COLORES_ADMIN.positivo : COLORES_ADMIN.dorado,
                                },
                              ]}
                            />
                          </View>
                          <Text style={styles.barraProgresoPorcentaje}>{m.progresoPct}% de la meta</Text>
                        </View>
                      ))}
                    </View>
                  )}
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
                      color={modalFiltroVisible === campo ? COLORES_ADMIN.textoInverso : COLORES_ADMIN.textoSecundario}
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
                      ? datosFiltro?.categorias.map((c) => ({ id: c.id, texto: c.nombre })) ?? []
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
                    else if (modalFiltroVisible === 'categoria') actualizarFiltro('categoriaId', item.id);
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

      <Modal visible={modalMetaVisible} animationType="fade" transparent>
        <View style={styles.fondoModal}>
          <View style={styles.tarjetaModalMeta}>
            <Text style={styles.modalCalendarioTitulo}>Nueva meta — {nombreMesActual}</Text>

            <View style={styles.mininTabs}>
              <Pressable
                style={[styles.mininTabTexto, metaTipo === 'PROMOTOR' && styles.mininTabActivo]}
                onPress={() => {
                  setMetaTipo('PROMOTOR');
                  setMetaEntidadId(null);
                }}
              >
                <Text
                  style={[styles.mininTabEtiqueta, metaTipo === 'PROMOTOR' && styles.mininTabEtiquetaActiva]}
                >
                  Por promotor
                </Text>
              </Pressable>
              <Pressable
                style={[styles.mininTabTexto, metaTipo === 'PUNTO' && styles.mininTabActivo]}
                onPress={() => {
                  setMetaTipo('PUNTO');
                  setMetaEntidadId(null);
                }}
              >
                <Text style={[styles.mininTabEtiqueta, metaTipo === 'PUNTO' && styles.mininTabEtiquetaActiva]}>
                  Por punto
                </Text>
              </Pressable>
            </View>

            <FlatList
              style={styles.modalMetaLista}
              data={
                metaTipo === 'PROMOTOR'
                  ? (datosFiltro?.promotores ?? []).map((p) => ({ id: p.id, texto: p.nombre }))
                  : (datosFiltro?.puntos ?? []).map((p) => ({
                      id: p.id,
                      texto: `${p.empresaNombre} · ${p.nombre}`,
                    }))
              }
              keyExtractor={(item) => item.id}
              ListEmptyComponent={<Text style={styles.vacio}>Sin opciones disponibles.</Text>}
              renderItem={({ item }) => (
                <Pressable
                  style={[styles.modalMetaFila, metaEntidadId === item.id && styles.modalMetaFilaActiva]}
                  onPress={() => setMetaEntidadId(item.id)}
                >
                  <Text style={styles.modalFiltroFilaTexto}>{item.texto}</Text>
                  {metaEntidadId === item.id && (
                    <Ionicons name="checkmark" size={16} color={COLORES_ADMIN.vino} />
                  )}
                </Pressable>
              )}
            />

            <TextInput
              style={styles.modalMetaInput}
              placeholder="$ 0"
              placeholderTextColor={COLORES_ADMIN.textoSecundario}
              value={metaMontoTexto}
              onChangeText={(texto) => setMetaMontoTexto(formatearPesos(parsearPesos(texto)))}
              keyboardType="number-pad"
              editable={!guardandoMeta}
            />

            <View style={styles.modalMetaAcciones}>
              <Pressable onPress={() => setModalMetaVisible(false)} disabled={guardandoMeta}>
                <Text style={styles.modalCerrarTexto}>Cancelar</Text>
              </Pressable>
              <Pressable
                style={[
                  styles.modalCalendarioConfirmar,
                  (!metaEntidadId || parsearPesos(metaMontoTexto) <= 0 || guardandoMeta) &&
                    styles.botonDeshabilitado,
                ]}
                disabled={!metaEntidadId || parsearPesos(metaMontoTexto) <= 0 || guardandoMeta}
                onPress={guardarMeta}
              >
                {guardandoMeta ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.modalCalendarioConfirmarTexto}>Guardar meta</Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <ModalDetalleSeccion
        seccion={seccionDetalle}
        rango={rango}
        filtrosBase={filtros}
        onCerrar={() => setSeccionDetalle(null)}
      />
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
  variacionPct,
  onPress,
}: {
  icono: keyof typeof Ionicons.glyphMap;
  etiqueta: string;
  valor: string;
  pie: string;
  variacionPct?: number | null;
  onPress?: () => void;
}) {
  return (
    <Pressable style={styles.kpi} onPress={onPress} disabled={!onPress}>
      <View style={styles.kpiEncabezado}>
        <Text style={styles.kpiEtiqueta}>{etiqueta}</Text>
        <Ionicons name={icono} size={17} color={COLORES_ADMIN.textoSecundario} />
      </View>
      <View style={styles.kpiValorFila}>
        <Text style={styles.kpiValor}>{valor}</Text>
        {variacionPct !== undefined && variacionPct !== null && (
          <View style={styles.kpiVariacionChip}>
            <Ionicons
              name={variacionPct >= 0 ? 'arrow-up' : 'arrow-down'}
              size={10}
              color={variacionPct >= 0 ? COLORES_ADMIN.positivo : COLORES_ADMIN.error}
            />
            <Text
              style={[
                styles.kpiVariacionTexto,
                { color: variacionPct >= 0 ? COLORES_ADMIN.positivo : COLORES_ADMIN.error },
              ]}
            >
              {Math.abs(variacionPct)}%
            </Text>
          </View>
        )}
      </View>
      <View style={styles.kpiPieDivisor} />
      <View style={styles.kpiPieFila}>
        <Text style={styles.kpiPie}>{pie}</Text>
        {onPress && <Ionicons name="chevron-forward" size={13} color={COLORES_ADMIN.textoSecundario} />}
      </View>
    </Pressable>
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
  encabezadoAncho: {
    backgroundColor: 'transparent',
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
    borderRadius: RADII_ADMIN.sm,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  volverTexto: {
    ...TEXTO_ADMIN.cuerpoSecundario,
    fontFamily: TIPOGRAFIA_ADMIN.medio,
    color: COLORES_ADMIN.superficie,
  },
  titulo: {
    ...TEXTO_ADMIN.tituloSeccion,
    color: COLORES_ADMIN.textoInverso,
  },
  tituloAncho: {
    ...TEXTO_ADMIN.tituloPantalla,
    color: COLORES_ADMIN.vino,
  },
  encabezadoDerecha: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  botonNotificaciones: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: COLORES_ADMIN.error,
    borderRadius: RADII_ADMIN.sm,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  botonNotificacionesTexto: {
    ...TEXTO_ADMIN.boton,
    color: COLORES_ADMIN.textoInverso,
  },
  botonRecibos: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: COLORES_ADMIN.dorado,
    borderRadius: RADII_ADMIN.sm,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  botonRecibosTexto: {
    ...TEXTO_ADMIN.boton,
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
  filtrosTarjeta: {
    backgroundColor: COLORES_ADMIN.superficieMasBaja,
    borderRadius: RADII_ADMIN.md,
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
    borderRadius: RADII_ADMIN.sm,
  },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: RADII_ADMIN.sm,
  },
  tabActivo: {
    backgroundColor: COLORES_ADMIN.vino,
  },
  tabTexto: {
    ...TEXTO_ADMIN.cuerpoSecundario,
    fontFamily: TIPOGRAFIA_ADMIN.medio,
  },
  tabTextoActivo: {
    color: COLORES_ADMIN.textoInverso,
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
    ...TEXTO_ADMIN.datoSecundario,
  },
  botonRefrescar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 28,
    borderRadius: RADII_ADMIN.sm,
    backgroundColor: COLORES_ADMIN.superficieBaja,
    paddingHorizontal: 10,
  },
  botonRefrescarTexto: {
    ...TEXTO_ADMIN.nota,
    fontFamily: TIPOGRAFIA_ADMIN.semiNegrita,
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
    ...TEXTO_ADMIN.etiqueta,
    letterSpacing: 0.5,
  },
  selectorBoton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: COLORES_ADMIN.superficieBaja,
    borderWidth: 1,
    borderColor: COLORES_ADMIN.superficie,
    borderRadius: RADII_ADMIN.sm,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  selectorBotonTexto: {
    ...TEXTO_ADMIN.boton,
    flex: 1,
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
    borderRadius: RADII_ADMIN.sm,
    paddingHorizontal: 14,
    minWidth: 140,
    marginTop: 18,
  },
  masFiltrosTexto: {
    ...TEXTO_ADMIN.boton,
    fontFamily: TIPOGRAFIA_ADMIN.medio,
  },
  masFiltrosBadge: {
    backgroundColor: COLORES_ADMIN.superficieMasAlta,
    borderRadius: RADII_ADMIN.sm,
    minWidth: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  masFiltrosBadgeTexto: {
    fontSize: 11,
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
    ...TEXTO_ADMIN.nota,
    fontFamily: TIPOGRAFIA_ADMIN.medio,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: COLORES_ADMIN.superficie,
    borderWidth: 1,
    borderColor: COLORES_ADMIN.bordeSuave,
    borderRadius: RADII_ADMIN.lg,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  chipTexto: {
    ...TEXTO_ADMIN.nota,
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
    ...TEXTO_ADMIN.nota,
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
    borderRadius: RADII_ADMIN.md,
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
    ...TEXTO_ADMIN.etiqueta,
    letterSpacing: 0.5,
  },
  kpiValorFila: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  kpiValor: {
    ...TEXTO_ADMIN.datoGrande,
    color: COLORES_ADMIN.vino,
  },
  kpiVariacionChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  kpiVariacionTexto: {
    fontSize: 11,
    fontFamily: TIPOGRAFIA_ADMIN.monoSemiNegrita,
  },
  kpiPieDivisor: {
    height: 1,
    backgroundColor: COLORES_ADMIN.superficie,
    marginVertical: 10,
  },
  kpiPie: {
    ...TEXTO_ADMIN.nota,
    fontFamily: TIPOGRAFIA_ADMIN.medio,
  },
  kpiPieFila: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  tarjeta: {
    flex: 1,
    minWidth: 320,
    backgroundColor: COLORES_ADMIN.superficieMasBaja,
    borderRadius: RADII_ADMIN.md,
    borderWidth: 1,
    borderColor: COLORES_ADMIN.bordeSuave,
    padding: 18,
  },
  tarjetaAncha: {
    backgroundColor: COLORES_ADMIN.superficieMasBaja,
    borderRadius: RADII_ADMIN.md,
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
    ...TEXTO_ADMIN.tituloSeccion,
    color: COLORES_ADMIN.vino,
  },
  seccionSubtitulo: {
    ...TEXTO_ADMIN.cuerpoSecundario,
    marginTop: 2,
  },
  seccionEtiquetaChica: {
    ...TEXTO_ADMIN.etiqueta,
    letterSpacing: 0.5,
  },
  vacio: {
    ...TEXTO_ADMIN.cuerpoSecundario,
  },
  margenCobertura: {
    ...TEXTO_ADMIN.nota,
    marginBottom: 10,
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
    borderRadius: RADII_ADMIN.sm,
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
    ...TEXTO_ADMIN.nota,
    fontFamily: TIPOGRAFIA_ADMIN.medio,
  },
  graficoPicoTextoFuerte: {
    fontFamily: TIPOGRAFIA_ADMIN.semiNegrita,
    color: COLORES_ADMIN.vino,
  },
  graficoContenedor: {
    backgroundColor: COLORES_ADMIN.superficieBaja,
    borderRadius: RADII_ADMIN.md,
    paddingHorizontal: 10,
    paddingTop: 24,
    paddingBottom: 8,
  },
  grafico: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 4,
    height: ALTURA_MAXIMA_BARRA,
  },
  barraColumna: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  barraEtiquetaPicoContenedor: {
    height: 16,
    justifyContent: 'flex-end',
    marginBottom: 3,
  },
  barra: {
    width: '100%',
    borderTopLeftRadius: 3,
    borderTopRightRadius: 3,
    minWidth: 4,
  },
  graficoEje: {
    height: 1,
    backgroundColor: COLORES_ADMIN.bordeSuave,
    marginTop: 2,
  },
  graficoEtiquetas: {
    flexDirection: 'row',
    gap: 4,
    marginTop: 6,
  },
  graficoEtiquetaColumna: {
    flex: 1,
    alignItems: 'center',
  },
  barraEtiqueta: {
    fontSize: 9,
    fontFamily: TIPOGRAFIA_ADMIN.monoRegular,
    color: COLORES_ADMIN.textoSecundario,
  },
  barraEtiquetaPico: {
    fontSize: 9,
    fontFamily: TIPOGRAFIA_ADMIN.monoSemiNegrita,
    color: COLORES_ADMIN.textoInverso,
    backgroundColor: COLORES_ADMIN.vino,
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 3,
    overflow: 'hidden',
  },
  desgloseHora: {
    backgroundColor: COLORES_ADMIN.superficieBaja,
    borderRadius: RADII_ADMIN.sm,
    padding: 14,
    gap: 10,
  },
  desgloseHoraEncabezado: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  desgloseHoraTitulo: {
    ...TEXTO_ADMIN.boton,
    color: COLORES_ADMIN.vino,
  },
  desgloseHoraFila: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  desgloseHoraPromotor: {
    ...TEXTO_ADMIN.nota,
    width: 100,
    fontFamily: TIPOGRAFIA_ADMIN.medio,
    color: COLORES_ADMIN.texto,
  },
  desgloseHoraBarraTrack: {
    flex: 1,
    height: 8,
    backgroundColor: COLORES_ADMIN.superficie,
    borderRadius: 4,
    overflow: 'hidden',
  },
  desgloseHoraBarraFill: {
    height: '100%',
    backgroundColor: COLORES_ADMIN.dorado,
    borderRadius: 4,
  },
  desgloseHoraMonto: {
    ...TEXTO_ADMIN.datoSecundario,
    width: 90,
    textAlign: 'right',
    fontFamily: TIPOGRAFIA_ADMIN.monoSemiNegrita,
    color: COLORES_ADMIN.vino,
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
    ...TEXTO_ADMIN.boton,
    flexShrink: 1,
  },
  barraProgresoValores: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  barraProgresoMonto: {
    ...TEXTO_ADMIN.dato,
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
    fontSize: 11,
    fontFamily: TIPOGRAFIA_ADMIN.monoMedio,
    color: COLORES_ADMIN.textoSecundario,
    alignSelf: 'flex-end',
  },
  filaRanking: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: COLORES_ADMIN.superficieBaja,
    borderRadius: RADII_ADMIN.sm,
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
    borderRadius: RADII_ADMIN.md,
    backgroundColor: COLORES_ADMIN.superficie,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filaRankingMedallaPrimera: {
    backgroundColor: COLORES_ADMIN.dorado,
  },
  filaRankingMedallaTexto: {
    ...TEXTO_ADMIN.datoSecundario,
    fontFamily: TIPOGRAFIA_ADMIN.monoSemiNegrita,
  },
  filaRankingMedallaTextoPrimera: {
    color: COLORES_ADMIN.vino,
  },
  filaRankingNombre: {
    ...TEXTO_ADMIN.boton,
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
    ...TEXTO_ADMIN.dato,
    fontFamily: TIPOGRAFIA_ADMIN.monoSemiNegrita,
    color: COLORES_ADMIN.vino,
  },
  filaRankingPorcentaje: {
    fontSize: 11,
    fontFamily: TIPOGRAFIA_ADMIN.medio,
    color: COLORES_ADMIN.textoSecundario,
  },
  puntoCard: {
    backgroundColor: COLORES_ADMIN.superficieBaja,
    borderRadius: RADII_ADMIN.sm,
    padding: 12,
    gap: 6,
  },
  puntoCardSub: {
    fontSize: 11,
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
    borderRadius: RADII_ADMIN.sm,
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
    fontSize: 11,
    fontFamily: TIPOGRAFIA_ADMIN.monoSemiNegrita,
    color: COLORES_ADMIN.vino,
  },
  filaProductoNombre: {
    ...TEXTO_ADMIN.boton,
  },
  filaProductoUnidades: {
    fontSize: 11,
    fontFamily: TIPOGRAFIA_ADMIN.regular,
    color: COLORES_ADMIN.textoSecundario,
  },
  filaProductoTotal: {
    ...TEXTO_ADMIN.dato,
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
    borderRadius: RADII_ADMIN.md,
    padding: 14,
    marginBottom: 8,
  },
  piePaginaIzquierda: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  piePaginaTexto: {
    ...TEXTO_ADMIN.cuerpoSecundario,
  },
  piePaginaEnlace: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  piePaginaEnlaceTexto: {
    ...TEXTO_ADMIN.boton,
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
    borderRadius: RADII_ADMIN.lg,
    padding: 20,
    marginBottom: 40,
    gap: 12,
  },
  modalCalendarioTitulo: {
    ...TEXTO_ADMIN.tituloTarjeta,
    color: COLORES_ADMIN.vino,
    textAlign: 'center',
  },
  modalCalendarioConfirmar: {
    backgroundColor: COLORES_ADMIN.vino,
    borderRadius: RADII_ADMIN.sm,
    paddingVertical: 12,
    alignItems: 'center',
  },
  modalCalendarioConfirmarTexto: {
    ...TEXTO_ADMIN.cuerpo,
    fontFamily: TIPOGRAFIA_ADMIN.semiNegrita,
    color: COLORES_ADMIN.textoInverso,
  },
  botonDeshabilitado: {
    opacity: 0.5,
  },
  tarjetaModalFiltro: {
    backgroundColor: COLORES_ADMIN.background,
    borderTopLeftRadius: RADII_ADMIN.lg,
    borderTopRightRadius: RADII_ADMIN.lg,
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
    borderRadius: RADII_ADMIN.lg,
    backgroundColor: COLORES_ADMIN.superficieMasBaja,
    borderWidth: 1,
    borderColor: COLORES_ADMIN.bordeSuave,
  },
  modalFiltroTabActivo: {
    backgroundColor: COLORES_ADMIN.vino,
    borderColor: COLORES_ADMIN.vino,
  },
  modalFiltroTabTexto: {
    ...TEXTO_ADMIN.nota,
    fontFamily: TIPOGRAFIA_ADMIN.medio,
  },
  modalFiltroTabTextoActivo: {
    color: COLORES_ADMIN.textoInverso,
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
    ...TEXTO_ADMIN.cuerpo,
  },
  modalCerrar: {
    alignItems: 'center',
    paddingVertical: 12,
  },
  modalCerrarTexto: {
    ...TEXTO_ADMIN.cuerpo,
    fontFamily: TIPOGRAFIA_ADMIN.semiNegrita,
    color: COLORES_ADMIN.vino,
  },
  mininTabs: {
    flexDirection: 'row',
    gap: 6,
  },
  mininTab: {
    width: 28,
    height: 28,
    borderRadius: RADII_ADMIN.sm,
    backgroundColor: COLORES_ADMIN.superficieBaja,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mininTabTexto: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: RADII_ADMIN.md,
    backgroundColor: COLORES_ADMIN.superficieBaja,
  },
  mininTabActivo: {
    backgroundColor: COLORES_ADMIN.vino,
  },
  mininTabEtiqueta: {
    ...TEXTO_ADMIN.nota,
    fontFamily: TIPOGRAFIA_ADMIN.semiNegrita,
  },
  mininTabEtiquetaActiva: {
    color: COLORES_ADMIN.textoInverso,
  },
  rankingControles: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
    flexWrap: 'wrap',
    gap: 8,
  },
  botonAgregarMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: COLORES_ADMIN.superficieBaja,
    borderRadius: RADII_ADMIN.md,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  botonAgregarMetaTexto: {
    ...TEXTO_ADMIN.boton,
    color: COLORES_ADMIN.vino,
  },
  proyeccionFila: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 4,
    marginBottom: 4,
  },
  proyeccionCard: {
    flex: 1,
    backgroundColor: COLORES_ADMIN.superficieBaja,
    borderRadius: RADII_ADMIN.md,
    padding: 12,
    gap: 4,
  },
  tarjetaModalMeta: {
    alignSelf: 'center',
    width: '100%',
    maxWidth: 420,
    backgroundColor: COLORES_ADMIN.background,
    borderRadius: RADII_ADMIN.lg,
    padding: 20,
    marginBottom: 40,
    gap: 12,
  },
  modalMetaLista: {
    maxHeight: 220,
  },
  modalMetaFila: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    borderBottomColor: COLORES_ADMIN.superficie,
  },
  modalMetaFilaActiva: {
    backgroundColor: COLORES_ADMIN.superficieBaja,
    borderRadius: RADII_ADMIN.sm,
  },
  modalMetaInput: {
    borderWidth: 1,
    borderColor: COLORES_ADMIN.bordeSuave,
    borderRadius: RADII_ADMIN.sm,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    fontFamily: TIPOGRAFIA_ADMIN.monoMedio,
    color: COLORES_ADMIN.texto,
    backgroundColor: COLORES_ADMIN.superficieMasBaja,
  },
  modalMetaAcciones: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: 20,
  },
});
