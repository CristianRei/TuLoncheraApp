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
import { COLORES } from '@/ui/colores';
import { ContenedorAncho } from '@/ui/ContenedorAncho';
import { useEsPantallaAncha } from '@/ui/useEsPantallaAncha';
import { useRequiereSesion } from '@/ui/useRequiereSesion';

type Periodo = 'HOY' | 'SEMANA' | 'MES' | 'PERSONALIZADO';

const OFFSET_BOGOTA_MS = 5 * 60 * 60 * 1000;
const REFRESCO_MS = 15000;
const PATRON_FECHA = /^\d{4}-\d{2}-\d{2}$/;

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

/** "20260315" tecleado en number-pad → "2026-03-15", insertando guiones. */
function formatearEntradaFecha(texto: string): string {
  const digitos = texto.replace(/\D/g, '').slice(0, 8);
  const partes = [digitos.slice(0, 4), digitos.slice(4, 6), digitos.slice(6, 8)].filter(Boolean);
  return partes.join('-');
}

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

interface DatosFiltro {
  promotores: UsuarioSesion[];
  puntos: Punto[];
  productos: Producto[];
  categorias: string[];
  marcas: string[];
}

type CampoFiltro = 'promotor' | 'punto' | 'categoria' | 'marca' | 'producto' | 'metodoPago';

export default function Dashboard() {
  const usuario = useRequiereSesion(['ADMIN']);
  const anchaPantalla = useEsPantallaAncha();
  const [periodo, setPeriodo] = useState<Periodo>('HOY');
  const [desdePersonalizado, setDesdePersonalizado] = useState('');
  const [hastaPersonalizado, setHastaPersonalizado] = useState('');
  const [filtros, setFiltros] = useState<FiltrosVentas>({});
  const [modalFiltroVisible, setModalFiltroVisible] = useState<CampoFiltro | null>(null);

  const [resumen, setResumen] = useState<ResumenVentasPeriodo | null>(null);
  const [saldoBodega, setSaldoBodega] = useState<SaldoTotalBodega | null>(null);
  const [porPromotor, setPorPromotor] = useState<TotalPorPromotor[]>([]);
  const [porPunto, setPorPunto] = useState<TotalPorPunto[]>([]);
  const [porCategoria, setPorCategoria] = useState<TotalPorCategoria[]>([]);
  const [datosFiltro, setDatosFiltro] = useState<DatosFiltro | null>(null);
  const [cargando, setCargando] = useState(true);
  const insets = useSafeAreaInsets();
  const enfocado = useRef(true);

  const rango: RangoFechas | null = useMemo(() => {
    if (periodo === 'PERSONALIZADO') {
      if (!PATRON_FECHA.test(desdePersonalizado) || !PATRON_FECHA.test(hastaPersonalizado)) return null;
      if (desdePersonalizado > hastaPersonalizado) return null;
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
    const intervalo = setInterval(() => {
      if (enfocado.current) cargar();
    }, REFRESCO_MS);
    return () => clearInterval(intervalo);
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

  const nombrePromotorFiltro = datosFiltro?.promotores.find((p) => p.id === filtros.promotorId)?.nombre;
  const nombrePuntoFiltro = datosFiltro?.puntos.find((p) => p.id === filtros.puntoId);
  const nombreProductoFiltro = datosFiltro?.productos.find((p) => p.id === filtros.productoId)?.nombre;

  return (
    <View style={styles.contenedor}>
      <View style={[styles.encabezado, { paddingTop: insets.top + 20 }]}>
        <ContenedorAncho anchoMaximo={960}>
          <View style={styles.encabezadoFila}>
            <Pressable onPress={() => router.back()}>
              <Text style={styles.volver}>‹ Admin</Text>
            </Pressable>
            <Text style={styles.titulo}>Dashboard</Text>
            <Pressable onPress={() => router.push('/admin/ventas')}>
              <Text style={styles.verRecibos}>Recibos</Text>
            </Pressable>
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
                onPress={() => setPeriodo('PERSONALIZADO')}
              >
                <Text style={[styles.tabTexto, periodo === 'PERSONALIZADO' && styles.tabTextoActivo]}>
                  Rango personalizado
                </Text>
              </Pressable>
            </View>

            {periodo === 'PERSONALIZADO' && (
              <View style={styles.rangoPersonalizado}>
                <TextInput
                  style={styles.rangoInput}
                  placeholder="Desde AAAA-MM-DD"
                  placeholderTextColor="#999"
                  value={desdePersonalizado}
                  onChangeText={(t) => setDesdePersonalizado(formatearEntradaFecha(t))}
                  keyboardType="number-pad"
                  maxLength={10}
                />
                <TextInput
                  style={styles.rangoInput}
                  placeholder="Hasta AAAA-MM-DD"
                  placeholderTextColor="#999"
                  value={hastaPersonalizado}
                  onChangeText={(t) => setHastaPersonalizado(formatearEntradaFecha(t))}
                  keyboardType="number-pad"
                  maxLength={10}
                />
              </View>
            )}

            <View style={styles.filtrosFila}>
              <Pressable
                style={styles.botonFiltros}
                onPress={() => setModalFiltroVisible('promotor')}
              >
                <Text style={styles.botonFiltrosTexto}>
                  Filtros{cantidadFiltrosActivos > 0 ? ` (${cantidadFiltrosActivos})` : ''}
                </Text>
              </Pressable>
              {cantidadFiltrosActivos > 0 && (
                <Pressable onPress={() => setFiltros({})}>
                  <Text style={styles.limpiarFiltros}>Limpiar</Text>
                </Pressable>
              )}
            </View>

            {cantidadFiltrosActivos > 0 && (
              <View style={styles.chips}>
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
              </View>
            )}

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
                    <Text style={styles.kpiEtiqueta}>Ticket promedio</Text>
                    <Text style={styles.kpiValor}>{formatearPesos(resumen.ticketPromedio)}</Text>
                  </View>
                  <View style={styles.kpi}>
                    <Text style={styles.kpiEtiqueta}>Saldo en bodega</Text>
                    <Text style={styles.kpiValor}>{saldoBodega.totalUnidades} und.</Text>
                    {saldoBodega.valorEstimado !== null && (
                      <Text style={styles.kpiSubtexto}>
                        ≈ {formatearPesos(saldoBodega.valorEstimado)}
                        {saldoBodega.productosConCosto < saldoBodega.productosTotal &&
                          ` · ${saldoBodega.productosConCosto} de ${saldoBodega.productosTotal} productos con costo`}
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

                <Text style={styles.seccionTitulo}>Por promotor</Text>
                <View style={styles.tarjeta}>
                  {porPromotor.length === 0 ? (
                    <Text style={styles.vacio}>Sin ventas en este período.</Text>
                  ) : (
                    porPromotor.map((p, indice) => (
                      <View
                        key={p.promotorId}
                        style={[styles.filaDesglose, indice < porPromotor.length - 1 && styles.filaDesgloseBorde]}
                      >
                        <Text style={styles.filaDesgloseNombre}>{p.promotorNombre}</Text>
                        <Text style={styles.filaDesgloseSub}>{p.cantidadVentas} ventas</Text>
                        <Text style={styles.filaDesgloseTotal}>{formatearPesos(p.totalVendido)}</Text>
                      </View>
                    ))
                  )}
                </View>

                <Text style={styles.seccionTitulo}>Por punto</Text>
                <View style={styles.tarjeta}>
                  {porPunto.length === 0 ? (
                    <Text style={styles.vacio}>Sin ventas con punto asignado en este período.</Text>
                  ) : (
                    porPunto.map((p, indice) => (
                      <View
                        key={p.puntoId}
                        style={[styles.filaDesglose, indice < porPunto.length - 1 && styles.filaDesgloseBorde]}
                      >
                        <Text style={styles.filaDesgloseNombre}>
                          {p.empresaNombre} · {p.puntoNombre}
                        </Text>
                        <Text style={styles.filaDesgloseSub}>{p.cantidadVentas} ventas</Text>
                        <Text style={styles.filaDesgloseTotal}>{formatearPesos(p.totalVendido)}</Text>
                      </View>
                    ))
                  )}
                </View>

                <Text style={styles.seccionTitulo}>Por categoría</Text>
                <View style={styles.tarjeta}>
                  {porCategoria.length === 0 ? (
                    <Text style={styles.vacio}>
                      Sin ventas de productos con categoría asignada en este período.
                    </Text>
                  ) : (
                    porCategoria.map((c, indice) => (
                      <View
                        key={c.categoria}
                        style={[styles.filaDesglose, indice < porCategoria.length - 1 && styles.filaDesgloseBorde]}
                      >
                        <Text style={styles.filaDesgloseNombre}>{c.categoria}</Text>
                        <Text style={styles.filaDesgloseSub}>{c.unidadesVendidas} und.</Text>
                        <Text style={styles.filaDesgloseTotal}>{formatearPesos(c.totalVendido)}</Text>
                      </View>
                    ))
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
                    <Text
                      style={[
                        styles.modalFiltroTabTexto,
                        modalFiltroVisible === campo && styles.modalFiltroTabTextoActivo,
                      ]}
                    >
                      {{
                        promotor: 'Promotor',
                        punto: 'Punto',
                        categoria: 'Categoría',
                        marca: 'Marca',
                        producto: 'Producto',
                        metodoPago: 'Pago',
                      }[campo]}
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

function Chip({ texto, onQuitar }: { texto: string; onQuitar: () => void }) {
  return (
    <View style={styles.chip}>
      <Text style={styles.chipTexto}>{texto}</Text>
      <Pressable onPress={onQuitar}>
        <Text style={styles.chipQuitar}>×</Text>
      </Pressable>
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
  verRecibos: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
    textDecorationLine: 'underline',
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
    flexWrap: 'wrap',
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
  rangoPersonalizado: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 20,
    paddingTop: 12,
  },
  rangoInput: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#EBD3D3',
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
  },
  filtrosFila: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    paddingHorizontal: 20,
    paddingTop: 12,
  },
  botonFiltros: {
    backgroundColor: COLORES.oscuro,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  botonFiltrosTexto: {
    color: '#FFF',
    fontSize: 13,
    fontWeight: '700',
  },
  limpiarFiltros: {
    fontSize: 13,
    color: '#B00020',
    fontWeight: '600',
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingHorizontal: 20,
    paddingTop: 10,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#EBD3D3',
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  chipTexto: {
    fontSize: 12,
    color: '#555',
    fontWeight: '600',
  },
  chipQuitar: {
    fontSize: 14,
    color: '#B00020',
    fontWeight: '700',
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
    padding: 4,
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
  filaDesglose: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    gap: 8,
  },
  filaDesgloseBorde: {
    borderBottomWidth: 1,
    borderBottomColor: '#F1E4E4',
  },
  filaDesgloseNombre: {
    flex: 2,
    fontSize: 13,
    color: '#333',
    fontWeight: '600',
  },
  filaDesgloseSub: {
    flex: 1,
    fontSize: 12,
    color: '#888',
    textAlign: 'right',
  },
  filaDesgloseTotal: {
    flex: 1,
    fontSize: 13,
    color: COLORES.oscuro,
    fontWeight: '700',
    textAlign: 'right',
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
  fondoModal: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  tarjetaModalFiltro: {
    backgroundColor: '#FFF',
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
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: '#F5F5F5',
  },
  modalFiltroTabActivo: {
    backgroundColor: COLORES.oscuro,
  },
  modalFiltroTabTexto: {
    fontSize: 12,
    fontWeight: '600',
    color: '#555',
  },
  modalFiltroTabTextoActivo: {
    color: '#FFF',
  },
  modalFiltroLista: {
    flex: 1,
  },
  modalFiltroFila: {
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  modalFiltroFilaTexto: {
    fontSize: 14,
    color: '#333',
  },
  modalCerrar: {
    alignItems: 'center',
    paddingVertical: 12,
  },
  modalCerrarTexto: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORES.oscuro,
  },
});
