import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  generarRecomendaciones,
  interpretarFuerzaPearson,
  NOMBRES_DIA_ISO,
  type DispersionPromotores,
  type EntidadMetodoPago,
  type HallazgoCruzado,
  type MapaCalorPuntoProducto,
  type PrioridadRecomendacion,
  type Recomendacion,
  type RendimientoPromotor,
  type RepetibilidadPunto,
  type SeccionAnalisis,
  type Tendencia,
  type VentaPorDiaSemana,
  type VentaPorTemporada,
} from '@/core/analisis';
import { formatearPesos } from '@/core/dinero';
import type { MetodoPago } from '@/core/tipos';
import type { RangoFechas } from '@/db/analitica';
import {
  obtenerCrucePuntoPromotorProducto,
  obtenerDispersionPromotor,
  obtenerMapaCalorPuntoProducto,
  obtenerMetodoPagoPorPromotor,
  obtenerMetodoPagoPorPunto,
  obtenerRendimientoPorPromotor,
  obtenerRepetibilidadPorPunto,
  obtenerVentasPorDiaSemana,
  obtenerVentasPorTemporada,
} from '@/db/analisis';
import { getDb } from '@/db/client';
import { ContenedorAncho } from '@/ui/ContenedorAncho';
import { GraficoBarrasHorizontales } from '@/ui/graficas/GraficoBarrasHorizontales';
import { GraficoDispersion } from '@/ui/graficas/GraficoDispersion';
import { GraficoLinea } from '@/ui/graficas/GraficoLinea';
import { MapaCalor } from '@/ui/graficas/MapaCalor';
import { ANCHO_ADMIN, COLORES_ADMIN, TIPOGRAFIA_ADMIN, RADII_ADMIN, TEXTO_ADMIN } from '@/ui/tema';
import { useEsPantallaAncha } from '@/ui/useEsPantallaAncha';
import { useRequiereSesion } from '@/ui/useRequiereSesion';

type Periodo = 'MES' | 'TRIMESTRE' | 'TODO';

const ETIQUETAS_PERIODO: Record<Periodo, string> = {
  MES: 'Últimos 30 días',
  TRIMESTRE: 'Últimos 90 días',
  TODO: 'Todo el historial',
};

const DIAS_POR_PERIODO: Record<Exclude<Periodo, 'TODO'>, number> = {
  MES: 30,
  TRIMESTRE: 90,
};

const OFFSET_BOGOTA_MS = 5 * 60 * 60 * 1000;

/** "Todo" arranca desde una fecha lo bastante atrás como para cubrir cualquier dato real cargado hoy — sin depender de una fecha de fundación hardcodeada con significado de negocio. */
const DESDE_TODO_ISO = '2020-01-01T00:00:00.000Z';

function calcularRango(periodo: Periodo): RangoFechas {
  if (periodo === 'TODO') {
    return { desde: DESDE_TODO_ISO, hasta: new Date().toISOString() };
  }
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

const ICONO_TENDENCIA: Record<Tendencia, keyof typeof Ionicons.glyphMap> = {
  SUBIENDO: 'trending-up-outline',
  ESTABLE: 'remove-outline',
  BAJANDO: 'trending-down-outline',
};

const COLOR_TENDENCIA: Record<Tendencia, string> = {
  SUBIENDO: COLORES_ADMIN.positivo,
  ESTABLE: COLORES_ADMIN.textoSecundario,
  BAJANDO: COLORES_ADMIN.error,
};

const ETIQUETAS_METODO: Record<MetodoPago, string> = {
  EFECTIVO: 'Efectivo',
  TRANSFERENCIA: 'Transferencia',
  LIBRANZA: 'Libranza',
};

const COLOR_METODO: Record<MetodoPago, string> = {
  EFECTIVO: COLORES_ADMIN.positivo,
  TRANSFERENCIA: COLORES_ADMIN.dorado,
  LIBRANZA: COLORES_ADMIN.vino,
};

function BarraMetodoPago({ entidad }: { entidad: EntidadMetodoPago }) {
  return (
    <View style={styles.filaMetodoPago}>
      <Text style={styles.filaMetodoPagoNombre} numberOfLines={1}>
        {entidad.nombre}
      </Text>
      <View style={styles.barraMetodoPagoTrack}>
        {entidad.porMetodo.map((m) => (
          <View
            key={m.metodoPago}
            style={{ width: `${m.pct}%`, backgroundColor: COLOR_METODO[m.metodoPago], height: '100%' }}
          />
        ))}
      </View>
      <Text style={styles.filaMetodoPagoDetalle}>
        {entidad.porMetodo.map((m) => `${ETIQUETAS_METODO[m.metodoPago]} ${m.pct}%`).join(' · ')}
      </Text>
    </View>
  );
}

function TarjetaPunto({ punto }: { punto: RepetibilidadPunto }) {
  const [expandido, setExpandido] = useState(false);
  const productosDestacados = punto.productos.filter((p) => p.apariciones >= 1).slice(0, expandido ? undefined : 3);
  const productoMasRepetible = punto.productos[0];

  return (
    <View style={styles.tarjeta}>
      <Pressable style={styles.tarjetaEncabezado} onPress={() => setExpandido((v) => !v)}>
        <View style={{ flex: 1 }}>
          <Text style={styles.tarjetaTitulo}>{punto.puntoNombre}</Text>
          <Text style={styles.tarjetaSubtitulo}>
            {punto.totalApariciones} evento{punto.totalApariciones === 1 ? '' : 's'} con venta registrada
          </Text>
        </View>
        {punto.datosInsuficientes ? (
          <View style={styles.badgeInsuficiente}>
            <Text style={styles.badgeInsuficienteTexto}>Historial corto</Text>
          </View>
        ) : (
          <Ionicons
            name={expandido ? 'chevron-up' : 'chevron-down'}
            size={18}
            color={COLORES_ADMIN.textoSecundario}
          />
        )}
      </Pressable>

      {punto.datosInsuficientes ? (
        <Text style={styles.textoAviso}>
          Todavía no hay suficientes eventos en este punto para saber qué se repite. Se necesitan al menos 3.
        </Text>
      ) : (
        <>
          {productoMasRepetible && productoMasRepetible.tasaAcumuladaPorAparicion.length >= 3 && (
            <View>
              <Text style={styles.leyendaGrafico}>
                Tendencia de repetición de {productoMasRepetible.productoNombre}
              </Text>
              <GraficoLinea
                puntos={productoMasRepetible.tasaAcumuladaPorAparicion.map((tasa, i) => ({
                  etiqueta: `#${i + 1}`,
                  valor: Math.round(tasa * 100),
                }))}
                formatearValor={(v) => `${v}%`}
              />
            </View>
          )}
          <View style={styles.listaProductos}>
            {productosDestacados.map((producto) => (
              <View key={producto.productoId} style={styles.filaProducto}>
                <Text style={styles.filaProductoNombre} numberOfLines={1}>
                  {producto.productoNombre}
                </Text>
                <Text style={styles.filaProductoDato}>
                  {producto.vecesEnTopN}/{producto.apariciones} veces en el top
                </Text>
                {producto.tendencia && (
                  <Ionicons
                    name={ICONO_TENDENCIA[producto.tendencia]}
                    size={15}
                    color={COLOR_TENDENCIA[producto.tendencia]}
                  />
                )}
              </View>
            ))}
            {!expandido && punto.productos.length > 3 && (
              <Pressable onPress={() => setExpandido(true)}>
                <Text style={styles.verMasTexto}>Ver los {punto.productos.length} productos</Text>
              </Pressable>
            )}
          </View>
        </>
      )}
    </View>
  );
}

function TarjetaPromotor({ promotor }: { promotor: RendimientoPromotor }) {
  return (
    <View style={styles.tarjeta}>
      <View style={styles.tarjetaEncabezado}>
        <View style={{ flex: 1 }}>
          <Text style={styles.tarjetaTitulo}>{promotor.promotorNombre}</Text>
          <Text style={styles.tarjetaSubtitulo}>
            {promotor.eventosTrabajados} evento{promotor.eventosTrabajados === 1 ? '' : 's'} · Ticket promedio{' '}
            {formatearPesos(promotor.ticketPromedioPorEvento)}/evento
          </Text>
        </View>
      </View>

      {promotor.mixDestacado.length === 0 ? (
        <Text style={styles.textoAviso}>Sin desviaciones notables frente al resto de promotores todavía.</Text>
      ) : (
        <View style={styles.listaProductos}>
          {promotor.mixDestacado.map((desviacion) => (
            <View key={desviacion.productoId} style={styles.filaProducto}>
              <Text style={styles.filaProductoNombre} numberOfLines={1}>
                {desviacion.productoNombre}
              </Text>
              <Text
                style={[
                  styles.filaProductoDato,
                  { color: desviacion.desviacionPct > 0 ? COLORES_ADMIN.positivo : COLORES_ADMIN.error },
                ]}
              >
                {desviacion.desviacionPct > 0 ? '+' : ''}
                {desviacion.desviacionPct}% vs. resto
              </Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

function BloqueDispersion({ dispersion }: { dispersion: DispersionPromotores }) {
  if (dispersion.puntos.length === 0) return null;

  const textoCorrelacion =
    dispersion.correlacion === null
      ? 'Sin suficiente historial para calcular una correlación confiable (se necesitan al menos 3 promotores).'
      : `r = ${dispersion.correlacion.toFixed(2)} — correlación ${interpretarFuerzaPearson(dispersion.correlacion)} entre eventos trabajados y ticket promedio. Esto describe qué tan juntas se mueven las dos variables en los datos actuales, no que una cause la otra.`;

  return (
    <View style={styles.tarjeta}>
      <GraficoDispersion
        puntos={dispersion.puntos.map((p) => ({ etiqueta: p.promotorNombre, x: p.eventosTrabajados, y: p.ticketPromedioPorEvento }))}
        etiquetaEjeX="Eventos trabajados"
        etiquetaEjeY="Ticket prom."
        correlacion={dispersion.correlacion}
      />
      <Text style={styles.textoAviso}>{textoCorrelacion}</Text>
    </View>
  );
}

function BloqueMapaCalor({ mapa }: { mapa: MapaCalorPuntoProducto }) {
  if (mapa.puntos.length === 0) return null;

  return (
    <View style={styles.tarjeta}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <MapaCalor
          filas={mapa.puntos.map((p) => ({ id: p.id, etiqueta: p.etiqueta }))}
          columnas={mapa.productos.map((p) => ({ id: p.id, etiqueta: p.etiqueta }))}
          celdas={mapa.celdas.map((c) => ({ filaId: c.puntoId, columnaId: c.productoId, valor: c.unidades }))}
        />
      </ScrollView>
      {(mapa.puntosOmitidos > 0 || mapa.productosOmitidos > 0) && (
        <Text style={styles.textoAviso}>
          Mostrando los puntos y productos más activos
          {mapa.puntosOmitidos > 0 ? ` (${mapa.puntosOmitidos} punto${mapa.puntosOmitidos === 1 ? '' : 's'} fuera)` : ''}
          {mapa.productosOmitidos > 0
            ? ` (${mapa.productosOmitidos} producto${mapa.productosOmitidos === 1 ? '' : 's'} fuera)`
            : ''}
          .
        </Text>
      )}
    </View>
  );
}

const ALTURA_BARRA_DIA = 70;

function BloqueDiaSemana({ dias }: { dias: VentaPorDiaSemana[] }) {
  const maximo = Math.max(...dias.map((d) => d.totalVendido), 1);
  return (
    <View style={styles.diasFila}>
      {dias.map((dia) => (
        <View key={dia.diaIso} style={styles.diaColumna}>
          <View style={styles.diaBarraTrack}>
            <View
              style={[
                styles.diaBarraRelleno,
                { height: Math.max(2, (dia.totalVendido / maximo) * ALTURA_BARRA_DIA) },
              ]}
            />
          </View>
          <Text style={styles.diaEtiqueta}>{NOMBRES_DIA_ISO[dia.diaIso].slice(0, 3)}</Text>
        </View>
      ))}
    </View>
  );
}

function BloqueTemporadas({ temporadas }: { temporadas: VentaPorTemporada[] }) {
  const conDatos = temporadas.filter((t) => t.apariciones > 0);
  if (conDatos.length === 0) return null;

  return (
    <GraficoBarrasHorizontales
      barras={conDatos.map((t) => ({ etiqueta: t.nombre, valor: t.promedioPorEvento }))}
      formatearValor={(v) => formatearPesos(v)}
    />
  );
}

const ETIQUETA_PRIORIDAD: Record<PrioridadRecomendacion, string> = {
  ALTA: 'Prioridad alta',
  MEDIA: 'Prioridad media',
  BAJA: 'Nota operativa',
};

const COLOR_PRIORIDAD: Record<PrioridadRecomendacion, string> = {
  ALTA: COLORES_ADMIN.vino,
  MEDIA: COLORES_ADMIN.dorado,
  BAJA: COLORES_ADMIN.textoSecundario,
};

const ICONO_SECCION: Record<SeccionAnalisis, keyof typeof Ionicons.glyphMap> = {
  REPETIBILIDAD: 'repeat-outline',
  RENDIMIENTO: 'person-outline',
  DISPERSION: 'analytics-outline',
  METODO_PAGO: 'cash-outline',
  HALLAZGOS: 'git-network-outline',
};

/** Nombre visible de la sección de gráficas que respalda cada recomendación. */
const NOMBRE_SECCION: Record<SeccionAnalisis, string> = {
  REPETIBILIDAD: 'Qué se repite por punto',
  RENDIMIENTO: 'Rendimiento por promotor',
  DISPERSION: 'Relación entre variables',
  METODO_PAGO: 'Método de pago',
  HALLAZGOS: 'Hallazgos cruzados',
};

function TarjetaRecomendacion({
  recomendacion,
  onVerGrafica,
}: {
  recomendacion: Recomendacion;
  onVerGrafica: () => void;
}) {
  return (
    <View style={styles.tarjetaRecomendacion}>
      <View style={styles.recomendacionEncabezado}>
        <View style={[styles.recomendacionIcono, { borderColor: COLOR_PRIORIDAD[recomendacion.prioridad] }]}>
          <Ionicons
            name={ICONO_SECCION[recomendacion.seccion]}
            size={17}
            color={COLOR_PRIORIDAD[recomendacion.prioridad]}
          />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.recomendacionTitulo}>{recomendacion.titulo}</Text>
          <Text style={styles.recomendacionDetalle}>{recomendacion.detalle}</Text>
        </View>
        <View style={[styles.badgePrioridad, { borderColor: COLOR_PRIORIDAD[recomendacion.prioridad] }]}>
          <Text style={[styles.badgePrioridadTexto, { color: COLOR_PRIORIDAD[recomendacion.prioridad] }]}>
            {ETIQUETA_PRIORIDAD[recomendacion.prioridad]}
          </Text>
        </View>
      </View>
      <Pressable style={styles.verGraficaBoton} onPress={onVerGrafica}>
        <Ionicons name="bar-chart-outline" size={14} color={COLORES_ADMIN.vino} />
        <Text style={styles.verGraficaTexto}>
          Sale de &ldquo;{NOMBRE_SECCION[recomendacion.seccion]}&rdquo; · Ver gráficas
        </Text>
      </Pressable>
    </View>
  );
}

function TarjetaHallazgo({ hallazgo }: { hallazgo: HallazgoCruzado }) {
  const positivo = hallazgo.desviacionPct > 0;
  return (
    <View style={styles.tarjetaHallazgo}>
      <Ionicons
        name={positivo ? 'trending-up-outline' : 'trending-down-outline'}
        size={18}
        color={positivo ? COLORES_ADMIN.positivo : COLORES_ADMIN.error}
      />
      <Text style={styles.textoHallazgo}>
        <Text style={styles.textoHallazgoFuerte}>{hallazgo.promotorNombre}</Text> vende{' '}
        <Text style={styles.textoHallazgoFuerte}>
          {positivo ? '+' : ''}
          {hallazgo.desviacionPct}%
        </Text>{' '}
        de <Text style={styles.textoHallazgoFuerte}>{hallazgo.productoNombre}</Text> en{' '}
        <Text style={styles.textoHallazgoFuerte}>{hallazgo.puntoNombre}</Text> frente al resto de promotores ahí (
        {hallazgo.aparicionesEnPunto} eventos).
      </Text>
    </View>
  );
}

export default function Analisis() {
  const usuario = useRequiereSesion(['ADMIN']);
  const anchaPantalla = useEsPantallaAncha();
  const insets = useSafeAreaInsets();
  const [periodo, setPeriodo] = useState<Periodo>('MES');
  const [cargando, setCargando] = useState(true);
  const [porPunto, setPorPunto] = useState<RepetibilidadPunto[]>([]);
  const [porPromotor, setPorPromotor] = useState<RendimientoPromotor[]>([]);
  const [hallazgos, setHallazgos] = useState<HallazgoCruzado[]>([]);
  const [dispersion, setDispersion] = useState<DispersionPromotores>({ puntos: [], correlacion: null });
  const [mapaCalor, setMapaCalor] = useState<MapaCalorPuntoProducto>({
    puntos: [],
    productos: [],
    celdas: [],
    puntosOmitidos: 0,
    productosOmitidos: 0,
  });
  const [porDiaSemana, setPorDiaSemana] = useState<VentaPorDiaSemana[]>([]);
  const [porTemporada, setPorTemporada] = useState<VentaPorTemporada[]>([]);
  const [metodoPorPunto, setMetodoPorPunto] = useState<EntidadMetodoPago[]>([]);
  const [metodoPorPromotor, setMetodoPorPromotor] = useState<EntidadMetodoPago[]>([]);
  const [vista, setVista] = useState<'RECOMENDACIONES' | 'GRAFICAS'>('RECOMENDACIONES');

  const rango = useMemo(() => calcularRango(periodo), [periodo]);

  const recomendaciones = useMemo(
    () => generarRecomendaciones({ porPunto, porPromotor, hallazgos, dispersion, metodoPorPunto }),
    [porPunto, porPromotor, hallazgos, dispersion, metodoPorPunto]
  );


  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const db = await getDb();
      const [repetibilidad, rendimiento, cruce, dispersionPromotor, mapa, diaSemana, temporada, metodoPunto, metodoPromotor] =
        await Promise.all([
          obtenerRepetibilidadPorPunto(db, rango),
          obtenerRendimientoPorPromotor(db, rango),
          obtenerCrucePuntoPromotorProducto(db, rango),
          obtenerDispersionPromotor(db, rango),
          obtenerMapaCalorPuntoProducto(db, rango),
          obtenerVentasPorDiaSemana(db, rango),
          obtenerVentasPorTemporada(db, rango),
          obtenerMetodoPagoPorPunto(db, rango),
          obtenerMetodoPagoPorPromotor(db, rango),
        ]);
      setPorPunto(repetibilidad);
      setPorPromotor(rendimiento);
      setHallazgos(cruce);
      setDispersion(dispersionPromotor);
      setMapaCalor(mapa);
      setPorDiaSemana(diaSemana);
      setPorTemporada(temporada);
      setMetodoPorPunto(metodoPunto);
      setMetodoPorPromotor(metodoPromotor);
    } finally {
      setCargando(false);
    }
  }, [rango]);

  useFocusEffect(
    useCallback(() => {
      cargar();
    }, [cargar])
  );

  if (!usuario) return null;

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
            {!anchaPantalla && (
              <Pressable style={styles.volverBoton} onPress={() => router.back()}>
                <Ionicons name="chevron-back" size={16} color="#FFE9E2" />
                <Text style={styles.volverTexto}>Admin</Text>
              </Pressable>
            )}
            <Text style={anchaPantalla ? styles.tituloAncho : styles.titulo}>Análisis</Text>
          </View>
        </ContenedorAncho>
      </View>

      {!anchaPantalla ? (
        <View style={styles.centrado}>
          <Text style={styles.avisoAngosto}>
            Esta sección está optimizada para pantalla ancha. Ábrela desde un computador o tablet.
          </Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.scroll}>
          <ContenedorAncho anchoMaximo={ANCHO_ADMIN.tablero}>
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

            <View style={styles.tabsVista}>
              {(
                [
                  ['RECOMENDACIONES', 'Recomendaciones'],
                  ['GRAFICAS', 'Gráficas'],
                ] as const
              ).map(([valor, etiqueta]) => (
                <Pressable
                  key={valor}
                  style={[styles.tabVista, vista === valor && styles.tabVistaActivo]}
                  onPress={() => setVista(valor)}
                >
                  <Text style={[styles.tabVistaTexto, vista === valor && styles.tabVistaTextoActivo]}>
                    {etiqueta}
                    {valor === 'RECOMENDACIONES' && recomendaciones.length > 0 ? ` (${recomendaciones.length})` : ''}
                  </Text>
                </Pressable>
              ))}
            </View>

            {cargando ? (
              <View style={styles.centrado}>
                <ActivityIndicator size="large" color={COLORES_ADMIN.vino} />
              </View>
            ) : vista === 'RECOMENDACIONES' ? (
              <View style={styles.cuerpo}>
                <Text style={styles.seccionTitulo}>Qué hacer con estos datos</Text>
                <Text style={styles.seccionSubtitulo}>
                  Patrones detectados en el período seleccionado, traducidos a acciones concretas. Cada una sale
                  de una señal medida: debajo de cada recomendación está la sección de Gráficas que la respalda.
                </Text>
                {recomendaciones.length === 0 ? (
                  <View style={styles.tarjeta}>
                    <Text style={styles.textoAviso}>
                      Todavía no hay señales lo bastante claras para recomendar algo en este período. Hacen falta
                      al menos 3 eventos por punto para detectar qué se repite — prueba con &ldquo;Todo el
                      historial&rdquo;, o revisa las gráficas para ver el detalle crudo.
                    </Text>
                  </View>
                ) : (
                  recomendaciones.map((recomendacion) => (
                    <TarjetaRecomendacion
                      key={recomendacion.id}
                      recomendacion={recomendacion}
                      onVerGrafica={() => setVista('GRAFICAS')}
                    />
                  ))
                )}
              </View>
            ) : (
              <View style={styles.cuerpo}>
                <Text style={styles.seccionTitulo}>Qué se repite por punto</Text>
                <Text style={styles.seccionSubtitulo}>
                  Productos que aparecen entre los más vendidos evento tras evento en cada punto — para decidir
                  qué cargue armar la próxima vez.
                </Text>
                {porPunto.length === 0 ? (
                  <Text style={styles.textoAviso}>Sin ventas con punto asignado en este período.</Text>
                ) : (
                  porPunto.map((punto) => <TarjetaPunto key={punto.puntoId} punto={punto} />)
                )}

                <Text style={[styles.seccionTitulo, styles.seccionEspaciada]}>Rendimiento por promotor</Text>
                <Text style={styles.seccionSubtitulo}>
                  Ticket promedio por evento y en qué productos cada promotor se desvía del resto.
                </Text>
                {porPromotor.length === 0 ? (
                  <Text style={styles.textoAviso}>Sin ventas con punto asignado en este período.</Text>
                ) : (
                  <>
                    <View style={styles.tarjeta}>
                      <GraficoBarrasHorizontales
                        barras={porPromotor.map((p) => ({ etiqueta: p.promotorNombre, valor: p.ticketPromedioPorEvento }))}
                        formatearValor={(v) => formatearPesos(v)}
                      />
                    </View>
                    {porPromotor.map((promotor) => <TarjetaPromotor key={promotor.promotorId} promotor={promotor} />)}
                  </>
                )}

                <Text style={[styles.seccionTitulo, styles.seccionEspaciada]}>Relación entre variables</Text>
                <Text style={styles.seccionSubtitulo}>
                  ¿Trabajar más eventos se relaciona con un ticket promedio más alto? Correlación de Pearson real,
                  no solo lectura visual.
                </Text>
                <BloqueDispersion dispersion={dispersion} />

                <Text style={[styles.seccionTitulo, styles.seccionEspaciada]}>Por punto y producto</Text>
                <Text style={styles.seccionSubtitulo}>
                  Unidades vendidas por combinación de punto y producto — más oscuro es más unidades.
                </Text>
                <BloqueMapaCalor mapa={mapaCalor} />

                <Text style={[styles.seccionTitulo, styles.seccionEspaciada]}>Día de la semana y temporada</Text>
                <Text style={styles.seccionSubtitulo}>
                  Total vendido por día de la semana, y comparación entre temporadas de negocio (Navidad,
                  vacaciones, fechas especiales) y el resto del año.
                </Text>
                <View style={styles.tarjeta}>
                  <BloqueDiaSemana dias={porDiaSemana} />
                </View>
                {porTemporada.some((t) => t.apariciones > 0 && t.nombre !== 'Temporada normal') && (
                  <View style={styles.tarjeta}>
                    <Text style={styles.leyendaGrafico}>Ticket promedio por evento, por temporada</Text>
                    <BloqueTemporadas temporadas={porTemporada} />
                  </View>
                )}

                <Text style={[styles.seccionTitulo, styles.seccionEspaciada]}>Método de pago por lugar y por promotor</Text>
                <Text style={styles.seccionSubtitulo}>
                  Qué % de las ventas de cada punto o promotor usa efectivo, transferencia o libranza.
                </Text>
                {metodoPorPunto.length === 0 && metodoPorPromotor.length === 0 ? (
                  <Text style={styles.textoAviso}>Sin ventas con punto asignado en este período.</Text>
                ) : (
                  <>
                    {metodoPorPunto.length > 0 && (
                      <View style={styles.tarjeta}>
                        <Text style={styles.leyendaGrafico}>Por punto</Text>
                        <View style={styles.listaProductos}>
                          {metodoPorPunto.map((entidad) => (
                            <BarraMetodoPago key={entidad.id} entidad={entidad} />
                          ))}
                        </View>
                      </View>
                    )}
                    {metodoPorPromotor.length > 0 && (
                      <View style={styles.tarjeta}>
                        <Text style={styles.leyendaGrafico}>Por promotor</Text>
                        <View style={styles.listaProductos}>
                          {metodoPorPromotor.map((entidad) => (
                            <BarraMetodoPago key={entidad.id} entidad={entidad} />
                          ))}
                        </View>
                      </View>
                    )}
                  </>
                )}

                <Text style={[styles.seccionTitulo, styles.seccionEspaciada]}>Hallazgos cruzados</Text>
                <Text style={styles.seccionSubtitulo}>
                  Combinaciones punto + promotor + producto con la desviación más marcada frente al resto,
                  ordenadas de mayor a menor.
                </Text>
                {hallazgos.length === 0 ? (
                  <Text style={styles.textoAviso}>
                    Todavía no hay suficiente historial para encontrar cruces con señal clara.
                  </Text>
                ) : (
                  hallazgos
                    .slice(0, 20)
                    .map((hallazgo, i) => (
                      <TarjetaHallazgo key={`${hallazgo.puntoId}-${hallazgo.promotorId}-${hallazgo.productoId}-${i}`} hallazgo={hallazgo} />
                    ))
                )}
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
  tabs: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    backgroundColor: COLORES_ADMIN.superficieBaja,
    padding: 4,
    borderRadius: RADII_ADMIN.sm,
    margin: 20,
    marginBottom: 8,
    alignSelf: 'flex-start',
  },
  tab: {
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
  tabsVista: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  tabVista: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: RADII_ADMIN.pill,
    borderWidth: 1,
    borderColor: COLORES_ADMIN.bordeSuave,
    backgroundColor: COLORES_ADMIN.superficieMasBaja,
  },
  tabVistaActivo: {
    backgroundColor: COLORES_ADMIN.vino,
    borderColor: COLORES_ADMIN.vino,
  },
  tabVistaTexto: {
    ...TEXTO_ADMIN.cuerpoSecundario,
    fontFamily: TIPOGRAFIA_ADMIN.medio,
  },
  tabVistaTextoActivo: {
    color: COLORES_ADMIN.textoInverso,
    fontFamily: TIPOGRAFIA_ADMIN.semiNegrita,
  },
  cuerpo: {
    paddingHorizontal: 20,
    gap: 10,
  },
  tarjetaRecomendacion: {
    backgroundColor: COLORES_ADMIN.superficieMasBaja,
    borderRadius: RADII_ADMIN.md,
    borderWidth: 1,
    borderColor: COLORES_ADMIN.bordeSuave,
    padding: 16,
    gap: 12,
  },
  recomendacionEncabezado: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  recomendacionIcono: {
    width: 34,
    height: 34,
    borderRadius: RADII_ADMIN.sm,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORES_ADMIN.superficieBaja,
  },
  recomendacionTitulo: {
    ...TEXTO_ADMIN.cuerpo,
    fontFamily: TIPOGRAFIA_ADMIN.semiNegrita,
  },
  recomendacionDetalle: {
    ...TEXTO_ADMIN.cuerpoSecundario,
    marginTop: 3,
    lineHeight: 18,
  },
  badgePrioridad: {
    borderRadius: 6,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  badgePrioridadTexto: {
    fontSize: 10,
    fontFamily: TIPOGRAFIA_ADMIN.semiNegrita,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  verGraficaBoton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
  },
  verGraficaTexto: {
    ...TEXTO_ADMIN.nota,
    fontFamily: TIPOGRAFIA_ADMIN.medio,
    color: COLORES_ADMIN.vino,
    textDecorationLine: 'underline',
  },
  seccionTitulo: {
    ...TEXTO_ADMIN.tituloTarjeta,
  },
  seccionEspaciada: {
    marginTop: 20,
  },
  seccionSubtitulo: {
    ...TEXTO_ADMIN.cuerpoSecundario,
    marginBottom: 4,
  },
  tarjeta: {
    backgroundColor: COLORES_ADMIN.superficieMasBaja,
    borderRadius: RADII_ADMIN.md,
    borderWidth: 1,
    borderColor: COLORES_ADMIN.bordeSuave,
    padding: 16,
    gap: 10,
  },
  tarjetaEncabezado: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  tarjetaTitulo: {
    ...TEXTO_ADMIN.cuerpo,
    fontFamily: TIPOGRAFIA_ADMIN.semiNegrita,
  },
  tarjetaSubtitulo: {
    ...TEXTO_ADMIN.nota,
    marginTop: 2,
  },
  badgeInsuficiente: {
    backgroundColor: COLORES_ADMIN.superficieAlta,
    borderRadius: RADII_ADMIN.sm,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  badgeInsuficienteTexto: {
    fontSize: 11,
    fontFamily: TIPOGRAFIA_ADMIN.medio,
    color: COLORES_ADMIN.textoSecundario,
  },
  textoAviso: {
    ...TEXTO_ADMIN.cuerpoSecundario,
  },
  listaProductos: {
    gap: 8,
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
  filaProductoDato: {
    ...TEXTO_ADMIN.datoSecundario,
    fontFamily: TIPOGRAFIA_ADMIN.monoMedio,
  },
  verMasTexto: {
    ...TEXTO_ADMIN.cuerpoSecundario,
    fontFamily: TIPOGRAFIA_ADMIN.medio,
    color: COLORES_ADMIN.vino,
  },
  tarjetaHallazgo: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: COLORES_ADMIN.superficieMasBaja,
    borderRadius: RADII_ADMIN.md,
    borderWidth: 1,
    borderColor: COLORES_ADMIN.bordeSuave,
    padding: 14,
  },
  textoHallazgo: {
    ...TEXTO_ADMIN.cuerpoSecundario,
    flex: 1,
    color: COLORES_ADMIN.texto,
    lineHeight: 19,
  },
  textoHallazgoFuerte: {
    fontFamily: TIPOGRAFIA_ADMIN.semiNegrita,
  },
  leyendaGrafico: {
    ...TEXTO_ADMIN.nota,
    fontFamily: TIPOGRAFIA_ADMIN.medio,
    marginBottom: 6,
  },
  diasFila: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
  },
  diaColumna: {
    alignItems: 'center',
    gap: 6,
    flex: 1,
  },
  diaBarraTrack: {
    height: 70,
    width: 18,
    justifyContent: 'flex-end',
  },
  diaBarraRelleno: {
    width: '100%',
    borderRadius: 4,
    backgroundColor: COLORES_ADMIN.dorado,
  },
  diaEtiqueta: {
    fontSize: 11,
    fontFamily: TIPOGRAFIA_ADMIN.medio,
    color: COLORES_ADMIN.textoSecundario,
  },
  filaMetodoPago: {
    gap: 4,
  },
  filaMetodoPagoNombre: {
    ...TEXTO_ADMIN.boton,
    fontFamily: TIPOGRAFIA_ADMIN.medio,
  },
  barraMetodoPagoTrack: {
    flexDirection: 'row',
    height: 10,
    borderRadius: 5,
    overflow: 'hidden',
    backgroundColor: COLORES_ADMIN.superficieBaja,
  },
  filaMetodoPagoDetalle: {
    fontSize: 11,
    fontFamily: TIPOGRAFIA_ADMIN.monoRegular,
    color: COLORES_ADMIN.textoSecundario,
  },
});
