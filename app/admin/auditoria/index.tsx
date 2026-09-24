import Ionicons from '@expo/vector-icons/Ionicons';
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { calcularRangoPeriodo, ETIQUETAS_PERIODO, type Periodo } from '@/core/analitica';
import type { EntidadAuditoria, LogAuditoria } from '@/core/auditoria';
import type { Categoria, Cliente, Persona, Producto } from '@/core/tipos';
import { obtenerLineaDeTiempoAuditoria } from '@/db/auditoria';
import { listarCategorias } from '@/db/categorias';
import { getDb } from '@/db/client';
import { listarClientes } from '@/db/clientes';
import { listarPersonalCompleto } from '@/db/personal';
import { listarProductos } from '@/db/productos';
import { CalendarioRango } from '@/ui/CalendarioRango';
import { ContenedorAncho } from '@/ui/ContenedorAncho';
import { EmptyState } from '@/ui/EmptyState';
import { Encabezado } from '@/ui/Encabezado';
import { COLORES_ADMIN, ESPACIADO_ADMIN, RADII_ADMIN, TIPOGRAFIA_ADMIN } from '@/ui/tema';
import { useRequiereSesion } from '@/ui/useRequiereSesion';

type FiltroEntidad = 'TODOS' | EntidadAuditoria | 'ACCESOS';

const OPCIONES_ENTIDAD: { valor: FiltroEntidad; etiqueta: string }[] = [
  { valor: 'TODOS', etiqueta: 'Todos los registros' },
  { valor: 'PERSONA', etiqueta: 'Personal' },
  { valor: 'CLIENTE', etiqueta: 'Clientes' },
  { valor: 'CATEGORIA', etiqueta: 'Categorías' },
  { valor: 'EVENTO', etiqueta: 'Eventos' },
  { valor: 'ACCESOS', etiqueta: 'Accesos' },
];

const OPCIONES_PERIODO: { valor: Exclude<Periodo, 'PERSONALIZADO'>; etiqueta: string }[] = (
  Object.keys(ETIQUETAS_PERIODO) as Exclude<Periodo, 'PERSONALIZADO'>[]
).map((p) => ({ valor: p, etiqueta: ETIQUETAS_PERIODO[p] }));

const ICONO_ORIGEN: Record<LogAuditoria['origen'], keyof typeof Ionicons.glyphMap> = {
  AUDITORIA: 'person-circle-outline',
  MOVIMIENTO: 'cube-outline',
  ACCESO_FALLIDO: 'warning-outline',
};

/** Icono en caja de color según origen — mismo lenguaje del mockup (ámbar=alerta, naranja=movimiento, vino=administrativo). */
const ESTILO_ICONO: Record<LogAuditoria['origen'], { fondo: string; borde: string; color: string }> = {
  AUDITORIA: { fondo: COLORES_ADMIN.superficieBaja, borde: COLORES_ADMIN.bordeSuave, color: COLORES_ADMIN.vino },
  MOVIMIENTO: { fondo: '#FFF3E8', borde: '#FBDCA3', color: '#B5651D' },
  ACCESO_FALLIDO: { fondo: '#FEF6E7', borde: '#FBDCA3', color: '#976200' },
};

function formatearFecha(tsCliente: string): string {
  return new Date(tsCliente).toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' });
}

interface OpcionSelector {
  id: string;
  etiqueta: string;
}

/** Modal de selección simple (lista de opciones + "Quitar filtro") — usado por los selectores de esta pantalla. */
function SelectorModal({
  visible,
  titulo,
  opciones,
  onElegir,
  onCerrar,
}: {
  visible: boolean;
  titulo: string;
  opciones: OpcionSelector[];
  onElegir: (id: string | null) => void;
  onCerrar: () => void;
}) {
  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onCerrar}>
      <View style={styles.fondoModal}>
        <View style={styles.tarjetaModal}>
          <Text style={styles.modalTitulo}>{titulo}</Text>
          <Pressable style={styles.opcionQuitar} onPress={() => onElegir(null)}>
            <Text style={styles.opcionQuitarTexto}>Quitar filtro</Text>
          </Pressable>
          <FlatList
            data={opciones}
            keyExtractor={(o) => o.id}
            style={styles.modalLista}
            renderItem={({ item }) => (
              <Pressable style={styles.opcion} onPress={() => onElegir(item.id)}>
                <Text style={styles.opcionTexto}>{item.etiqueta}</Text>
              </Pressable>
            )}
          />
          <Pressable onPress={onCerrar}>
            <Text style={styles.modalCancelar}>Cerrar</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

/** Fila-selector estilo "dropdown" del mockup (icono + etiqueta + valor elegido) — abre un SelectorModal al tocarla. */
function FilaSelector({
  icono,
  etiqueta,
  valor,
  onPress,
}: {
  icono: keyof typeof Ionicons.glyphMap;
  etiqueta: string;
  valor: string;
  onPress: () => void;
}) {
  return (
    <Pressable style={styles.dropdown} onPress={onPress}>
      <Text style={styles.dropdownEtiqueta}>{etiqueta}</Text>
      <View style={styles.dropdownValor}>
        <Ionicons name={icono} size={14} color={COLORES_ADMIN.textoSecundario} />
        <Text style={styles.dropdownValorTexto} numberOfLines={1}>
          {valor}
        </Text>
        <Ionicons name="chevron-down" size={14} color={COLORES_ADMIN.textoSecundario} />
      </View>
    </Pressable>
  );
}

export default function Auditoria() {
  const usuario = useRequiereSesion(['ADMIN']);
  const [logs, setLogs] = useState<LogAuditoria[]>([]);
  const [cargando, setCargando] = useState(true);

  const [filtroEntidad, setFiltroEntidad] = useState<FiltroEntidad>('TODOS');
  const [periodo, setPeriodo] = useState<Periodo>('SEMANA');
  const [desdePersonalizado, setDesdePersonalizado] = useState<string | null>(null);
  const [hastaPersonalizado, setHastaPersonalizado] = useState<string | null>(null);
  const [calendarioVisible, setCalendarioVisible] = useState(false);
  const [busqueda, setBusqueda] = useState('');

  const [actorId, setActorId] = useState<string | null>(null);
  const [afectadoId, setAfectadoId] = useState<string | null>(null);
  const [productoId, setProductoId] = useState<string | null>(null);
  const [categoriaId, setCategoriaId] = useState<string | null>(null);

  const [selectorAbierto, setSelectorAbierto] = useState<'ACTOR' | 'AFECTADO' | 'PRODUCTO' | 'CATEGORIA' | null>(
    null
  );

  const [personal, setPersonal] = useState<Persona[]>([]);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [productos, setProductos] = useState<Producto[]>([]);

  useEffect(() => {
    (async () => {
      const db = await getDb();
      const [listaPersonal, listaClientes, listaCategorias, listaProductos] = await Promise.all([
        listarPersonalCompleto(db),
        listarClientes(db),
        listarCategorias(db),
        listarProductos(db),
      ]);
      setPersonal(listaPersonal);
      setClientes(listaClientes);
      setCategorias(listaCategorias);
      setProductos(listaProductos);
    })();
  }, []);

  const rango = useMemo(() => {
    if (periodo === 'PERSONALIZADO') {
      if (!desdePersonalizado || !hastaPersonalizado) return null;
      return {
        desde: new Date(`${desdePersonalizado}T00:00:00-05:00`).toISOString(),
        hasta: new Date(`${hastaPersonalizado}T23:59:59-05:00`).toISOString(),
      };
    }
    return calcularRangoPeriodo(periodo);
  }, [periodo, desdePersonalizado, hastaPersonalizado]);

  // "Sobre quién" solo aplica cuando el tipo elegido tiene un catálogo de
  // nombres del que elegir (Personal/Clientes/Categorías) — Eventos no tiene
  // un nombre reconocible por evento, Todos/Accesos no son una sola tabla.
  const opcionesAfectado: OpcionSelector[] = useMemo(() => {
    if (filtroEntidad === 'PERSONA') return personal.map((p) => ({ id: p.id, etiqueta: p.nombre }));
    if (filtroEntidad === 'CLIENTE') return clientes.map((c) => ({ id: c.id, etiqueta: c.nombreCompleto }));
    if (filtroEntidad === 'CATEGORIA') return categorias.map((c) => ({ id: c.id, etiqueta: c.nombre }));
    return [];
  }, [filtroEntidad, personal, clientes, categorias]);

  const cargar = useCallback(async () => {
    if (!rango) return;
    setCargando(true);
    try {
      const db = await getDb();
      const resultado = await obtenerLineaDeTiempoAuditoria(db, {
        desde: rango.desde,
        hasta: rango.hasta,
        entidad: filtroEntidad === 'TODOS' || filtroEntidad === 'ACCESOS' ? undefined : filtroEntidad,
        entidadId: afectadoId ?? undefined,
        usuarioId: actorId ?? undefined,
        productoId: productoId ?? undefined,
        categoriaId: categoriaId ?? undefined,
      });
      setLogs(filtroEntidad === 'ACCESOS' ? resultado.filter((l) => l.origen === 'ACCESO_FALLIDO') : resultado);
    } finally {
      setCargando(false);
    }
  }, [rango, filtroEntidad, afectadoId, actorId, productoId, categoriaId]);

  useFocusEffect(
    useCallback(() => {
      cargar();
    }, [cargar])
  );

  if (!usuario) return null;

  function elegirTipo(valor: FiltroEntidad) {
    setFiltroEntidad(valor);
    // "Sobre quién"/producto/categoría dejan de tener sentido si se cambia
    // a un tipo que no los soporta — se limpian para no dejar un filtro
    // fantasma que el usuario ya no ve en pantalla.
    setAfectadoId(null);
    setProductoId(null);
    setCategoriaId(null);
  }

  function restablecerFiltros() {
    setFiltroEntidad('TODOS');
    setPeriodo('SEMANA');
    setDesdePersonalizado(null);
    setHastaPersonalizado(null);
    setBusqueda('');
    setActorId(null);
    setAfectadoId(null);
    setProductoId(null);
    setCategoriaId(null);
  }

  const nombreActor = actorId ? personal.find((p) => p.id === actorId)?.nombre : null;
  const nombreAfectado = afectadoId ? opcionesAfectado.find((o) => o.id === afectadoId)?.etiqueta : null;
  const nombreProducto = productoId ? productos.find((p) => p.id === productoId)?.nombre : null;
  const nombreCategoria = categoriaId ? categorias.find((c) => c.id === categoriaId)?.nombre : null;

  const muestraProductoCategoria = filtroEntidad === 'TODOS';
  const muestraAfectado = ['PERSONA', 'CLIENTE', 'CATEGORIA'].includes(filtroEntidad);

  const terminoBusqueda = busqueda.trim().toLowerCase();
  const logsFiltrados = terminoBusqueda
    ? logs.filter((l) => l.descripcion.toLowerCase().includes(terminoBusqueda))
    : logs;

  const hayFiltrosActivos =
    filtroEntidad !== 'TODOS' ||
    periodo !== 'SEMANA' ||
    busqueda.trim().length > 0 ||
    actorId !== null ||
    afectadoId !== null ||
    productoId !== null ||
    categoriaId !== null;

  const etiquetaPeriodo =
    periodo === 'PERSONALIZADO'
      ? desdePersonalizado && hastaPersonalizado
        ? `${desdePersonalizado} — ${hastaPersonalizado}`
        : 'Personalizado'
      : ETIQUETAS_PERIODO[periodo];

  return (
    <View style={styles.contenedor}>
      <Encabezado titulo="Bitácora y auditoría" rutaVolverTexto="Admin" anchoMaximo={860} />

      <ContenedorAncho anchoMaximo={860} llenarAlto>
        <View style={styles.scroll}>
          {/* Panel de filtros — una sola tarjeta con 3 filas divididas, igual al mockup de Stitch */}
          <View style={styles.panelFiltros}>
            {/* Fila 1: segmented de período + buscador, lado a lado */}
            <View style={[styles.filaPanel, styles.filaPeriodoBuscador]}>
              <View style={styles.periodoSegmentado}>
                {OPCIONES_PERIODO.map((op) => {
                  const activo = periodo === op.valor;
                  return (
                    <Pressable
                      key={op.valor}
                      style={[styles.periodoBoton, activo && styles.periodoBotonActivo]}
                      onPress={() => setPeriodo(op.valor)}
                    >
                      <Text style={[styles.periodoBotonTexto, activo && styles.periodoBotonTextoActivo]}>
                        {op.etiqueta}
                      </Text>
                    </Pressable>
                  );
                })}
                <Pressable
                  style={[styles.periodoBoton, periodo === 'PERSONALIZADO' && styles.periodoBotonActivo]}
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
                    style={[
                      styles.periodoBotonTexto,
                      periodo === 'PERSONALIZADO' && styles.periodoBotonTextoActivo,
                    ]}
                  >
                    Personalizado
                  </Text>
                </Pressable>
              </View>

              <View style={styles.buscador}>
                <Ionicons name="search-outline" size={15} color={COLORES_ADMIN.textoSecundario} />
                <TextInput
                  style={styles.buscadorInput}
                  placeholder="Buscar por usuario, producto o descripción..."
                  placeholderTextColor={COLORES_ADMIN.textoSecundario}
                  value={busqueda}
                  onChangeText={setBusqueda}
                />
              </View>
            </View>

            {/* Fila 2: pills de tipo + restablecer */}
            <View style={styles.filaPanel}>
              <View style={styles.pillsFila}>
                <Text style={styles.pillsEtiqueta}>Filtrar por:</Text>
                {OPCIONES_ENTIDAD.map((op) => {
                  const activo = filtroEntidad === op.valor;
                  return (
                    <Pressable
                      key={op.valor}
                      style={[styles.pill, activo && styles.pillActivo]}
                      onPress={() => elegirTipo(op.valor)}
                    >
                      <Text style={[styles.pillTexto, activo && styles.pillTextoActivo]}>{op.etiqueta}</Text>
                    </Pressable>
                  );
                })}
              </View>
              {hayFiltrosActivos && (
                <Pressable onPress={restablecerFiltros}>
                  <Text style={styles.restablecer}>Restablecer filtros</Text>
                </Pressable>
              )}
            </View>

            {/* Fila 3: selectores tipo dropdown */}
            <View style={[styles.filaPanel, styles.filaDropdowns]}>
              <FilaSelector
                icono="person-outline"
                etiqueta="Usuario responsable"
                valor={nombreActor ?? 'Cualquier usuario (Todos)'}
                onPress={() => setSelectorAbierto('ACTOR')}
              />
              {muestraAfectado && (
                <FilaSelector
                  icono="locate-outline"
                  etiqueta="Sobre quién"
                  valor={nombreAfectado ?? 'Cualquiera'}
                  onPress={() => setSelectorAbierto('AFECTADO')}
                />
              )}
              {muestraProductoCategoria && (
                <>
                  <FilaSelector
                    icono="pricetag-outline"
                    etiqueta="Producto o SKU"
                    valor={nombreProducto ?? 'Cualquier producto (Todos)'}
                    onPress={() => setSelectorAbierto('PRODUCTO')}
                  />
                  <FilaSelector
                    icono="pricetags-outline"
                    etiqueta="Categoría de producto"
                    valor={nombreCategoria ?? 'Cualquier categoría'}
                    onPress={() => setSelectorAbierto('CATEGORIA')}
                  />
                </>
              )}
            </View>
          </View>

          {/* Chips de filtros aplicados + contador */}
          <View style={styles.resumenFila}>
            <Text style={styles.resumenEtiqueta}>Filtros aplicados:</Text>
            <View style={styles.chipResumen}>
              <Text style={styles.chipResumenTexto}>
                Período: <Text style={styles.chipResumenValor}>{etiquetaPeriodo}</Text>
              </Text>
            </View>
            <View style={styles.chipResumen}>
              <Text style={styles.chipResumenTexto}>
                Tipo:{' '}
                <Text style={styles.chipResumenValor}>
                  {OPCIONES_ENTIDAD.find((o) => o.valor === filtroEntidad)?.etiqueta}
                </Text>
              </Text>
            </View>
            <Text style={styles.resumenContador}>
              Mostrando {logsFiltrados.length} de {logs.length} eventos
            </Text>
          </View>

          {cargando ? (
            <View style={styles.centrado}>
              <ActivityIndicator size="large" color={COLORES_ADMIN.vino} />
            </View>
          ) : logsFiltrados.length === 0 ? (
            <EmptyState icono="document-text-outline" mensaje="Sin actividad registrada con estos filtros." />
          ) : (
            <FlatList
              data={logsFiltrados}
              keyExtractor={(log) => log.id}
              contentContainerStyle={styles.lista}
              renderItem={({ item }) => {
                const estilo = ESTILO_ICONO[item.origen];
                return (
                  <View
                    style={[
                      styles.tarjetaEvento,
                      item.origen === 'ACCESO_FALLIDO' && styles.tarjetaEventoAlerta,
                    ]}
                  >
                    <View
                      style={[
                        styles.iconoCaja,
                        { backgroundColor: estilo.fondo, borderColor: estilo.borde },
                      ]}
                    >
                      <Ionicons name={ICONO_ORIGEN[item.origen]} size={18} color={estilo.color} />
                    </View>
                    <View style={styles.tarjetaTexto}>
                      <Text style={styles.tarjetaDescripcion}>{item.descripcion}</Text>
                      <View style={styles.tarjetaMetaFila}>
                        <Ionicons name="time-outline" size={13} color={COLORES_ADMIN.textoSecundario} />
                        <Text style={styles.tarjetaMeta}>{formatearFecha(item.tsCliente)}</Text>
                        {item.dispositivoId && (
                          <>
                            <Text style={styles.tarjetaMetaSeparador}>·</Text>
                            <Text style={styles.tarjetaMetaMono}>
                              Dispositivo: {item.dispositivoId.slice(0, 8)}
                            </Text>
                          </>
                        )}
                      </View>
                    </View>
                  </View>
                );
              }}
            />
          )}
        </View>
      </ContenedorAncho>

      <Modal visible={calendarioVisible} animationType="fade" transparent>
        <View style={styles.fondoModal}>
          <View style={styles.tarjetaModal}>
            <Text style={styles.modalTitulo}>Elige el rango de fechas</Text>
            <CalendarioRango
              desde={desdePersonalizado}
              hasta={hastaPersonalizado}
              onCambiar={(desde, hasta) => {
                setDesdePersonalizado(desde);
                setHastaPersonalizado(hasta);
              }}
            />
            <Pressable
              style={[styles.botonAplicar, (!desdePersonalizado || !hastaPersonalizado) && styles.botonDeshabilitado]}
              disabled={!desdePersonalizado || !hastaPersonalizado}
              onPress={() => setCalendarioVisible(false)}
            >
              <Text style={styles.botonAplicarTexto}>Aplicar rango</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <SelectorModal
        visible={selectorAbierto === 'ACTOR'}
        titulo="Usuario responsable"
        opciones={personal.map((p) => ({ id: p.id, etiqueta: p.nombre }))}
        onElegir={(id) => {
          setActorId(id);
          setSelectorAbierto(null);
        }}
        onCerrar={() => setSelectorAbierto(null)}
      />
      <SelectorModal
        visible={selectorAbierto === 'AFECTADO'}
        titulo="Sobre quién"
        opciones={opcionesAfectado}
        onElegir={(id) => {
          setAfectadoId(id);
          setSelectorAbierto(null);
        }}
        onCerrar={() => setSelectorAbierto(null)}
      />
      <SelectorModal
        visible={selectorAbierto === 'PRODUCTO'}
        titulo="Producto o SKU"
        opciones={productos.map((p) => ({ id: p.id, etiqueta: p.nombre }))}
        onElegir={(id) => {
          setProductoId(id);
          setSelectorAbierto(null);
        }}
        onCerrar={() => setSelectorAbierto(null)}
      />
      <SelectorModal
        visible={selectorAbierto === 'CATEGORIA'}
        titulo="Categoría de producto"
        opciones={categorias.map((c) => ({ id: c.id, etiqueta: c.nombre }))}
        onElegir={(id) => {
          setCategoriaId(id);
          setSelectorAbierto(null);
        }}
        onCerrar={() => setSelectorAbierto(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  contenedor: {
    flex: 1,
    backgroundColor: COLORES_ADMIN.background,
  },
  scroll: {
    padding: ESPACIADO_ADMIN.xl,
    paddingTop: ESPACIADO_ADMIN.lg,
    gap: ESPACIADO_ADMIN.md,
    flex: 1,
  },
  panelFiltros: {
    backgroundColor: COLORES_ADMIN.superficieMasBaja,
    borderRadius: RADII_ADMIN.lg,
    borderWidth: 1,
    borderColor: COLORES_ADMIN.bordeSuave,
    overflow: 'hidden',
  },
  filaPanel: {
    padding: ESPACIADO_ADMIN.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORES_ADMIN.bordeSuave,
    gap: ESPACIADO_ADMIN.md,
  },
  filaPeriodoBuscador: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  filaDropdowns: {
    borderBottomWidth: 0,
    backgroundColor: COLORES_ADMIN.superficieBaja,
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  periodoSegmentado: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 2,
    backgroundColor: COLORES_ADMIN.superficieBaja,
    padding: 3,
    borderRadius: RADII_ADMIN.sm,
    borderWidth: 1,
    borderColor: COLORES_ADMIN.bordeSuave,
    alignSelf: 'flex-start',
  },
  periodoBoton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: ESPACIADO_ADMIN.md,
    paddingVertical: ESPACIADO_ADMIN.xs + 2,
    borderRadius: RADII_ADMIN.sm - 2,
  },
  periodoBotonActivo: {
    backgroundColor: COLORES_ADMIN.vino,
  },
  periodoBotonTexto: {
    fontSize: 12,
    fontFamily: TIPOGRAFIA_ADMIN.medio,
    color: COLORES_ADMIN.textoSecundario,
  },
  periodoBotonTextoActivo: {
    color: '#FFFFFF',
    fontFamily: TIPOGRAFIA_ADMIN.semiNegrita,
  },
  buscador: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    minWidth: 180,
    gap: ESPACIADO_ADMIN.sm,
    backgroundColor: COLORES_ADMIN.superficieMasBaja,
    borderWidth: 1,
    borderColor: COLORES_ADMIN.bordeSuave,
    borderRadius: RADII_ADMIN.sm,
    paddingHorizontal: ESPACIADO_ADMIN.md,
    paddingVertical: ESPACIADO_ADMIN.sm,
  },
  buscadorInput: {
    flex: 1,
    fontSize: 13,
    fontFamily: TIPOGRAFIA_ADMIN.regular,
    color: COLORES_ADMIN.texto,
  },
  pillsFila: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: ESPACIADO_ADMIN.xs,
    flex: 1,
  },
  pillsEtiqueta: {
    fontSize: 10,
    fontFamily: TIPOGRAFIA_ADMIN.semiNegrita,
    color: COLORES_ADMIN.textoSecundario,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginRight: 2,
  },
  pill: {
    backgroundColor: COLORES_ADMIN.superficieBaja,
    borderWidth: 1,
    borderColor: COLORES_ADMIN.bordeSuave,
    borderRadius: RADII_ADMIN.pill,
    paddingHorizontal: ESPACIADO_ADMIN.md,
    paddingVertical: ESPACIADO_ADMIN.xs + 2,
  },
  pillActivo: {
    backgroundColor: COLORES_ADMIN.vino,
    borderColor: COLORES_ADMIN.vino,
  },
  pillTexto: {
    fontSize: 12,
    fontFamily: TIPOGRAFIA_ADMIN.medio,
    color: COLORES_ADMIN.textoSecundario,
  },
  pillTextoActivo: {
    color: '#FFFFFF',
    fontFamily: TIPOGRAFIA_ADMIN.semiNegrita,
  },
  restablecer: {
    fontSize: 12,
    fontFamily: TIPOGRAFIA_ADMIN.semiNegrita,
    color: COLORES_ADMIN.vino,
    textDecorationLine: 'underline',
  },
  dropdown: {
    minWidth: 180,
    flex: 1,
    gap: 2,
  },
  dropdownEtiqueta: {
    fontSize: 10,
    fontFamily: TIPOGRAFIA_ADMIN.semiNegrita,
    color: COLORES_ADMIN.textoSecundario,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  dropdownValor: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: ESPACIADO_ADMIN.xs,
    backgroundColor: COLORES_ADMIN.superficieMasBaja,
    borderWidth: 1,
    borderColor: COLORES_ADMIN.bordeSuave,
    borderRadius: RADII_ADMIN.sm,
    paddingHorizontal: ESPACIADO_ADMIN.sm,
    paddingVertical: ESPACIADO_ADMIN.sm,
  },
  dropdownValorTexto: {
    flex: 1,
    fontSize: 12,
    fontFamily: TIPOGRAFIA_ADMIN.medio,
    color: COLORES_ADMIN.texto,
  },
  resumenFila: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: ESPACIADO_ADMIN.sm,
    paddingHorizontal: 2,
  },
  resumenEtiqueta: {
    fontSize: 11,
    fontFamily: TIPOGRAFIA_ADMIN.medio,
    color: COLORES_ADMIN.textoSecundario,
  },
  chipResumen: {
    backgroundColor: COLORES_ADMIN.superficieMasBaja,
    borderWidth: 1,
    borderColor: COLORES_ADMIN.bordeSuave,
    borderRadius: RADII_ADMIN.sm,
    paddingHorizontal: ESPACIADO_ADMIN.sm,
    paddingVertical: 3,
  },
  chipResumenTexto: {
    fontSize: 11,
    fontFamily: TIPOGRAFIA_ADMIN.regular,
    color: COLORES_ADMIN.textoSecundario,
  },
  chipResumenValor: {
    fontFamily: TIPOGRAFIA_ADMIN.semiNegrita,
    color: COLORES_ADMIN.vino,
  },
  resumenContador: {
    fontSize: 11,
    fontFamily: TIPOGRAFIA_ADMIN.regular,
    color: COLORES_ADMIN.textoSecundario,
    marginLeft: 'auto',
  },
  centrado: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: ESPACIADO_ADMIN.xxl,
  },
  lista: {
    gap: ESPACIADO_ADMIN.sm,
    paddingBottom: ESPACIADO_ADMIN.xl,
  },
  tarjetaEvento: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: ESPACIADO_ADMIN.md,
    backgroundColor: COLORES_ADMIN.superficieMasBaja,
    borderRadius: RADII_ADMIN.lg,
    borderWidth: 1,
    borderColor: COLORES_ADMIN.bordeSuave,
    padding: ESPACIADO_ADMIN.md,
  },
  tarjetaEventoAlerta: {
    borderLeftWidth: 4,
    borderLeftColor: '#F3A712',
  },
  iconoCaja: {
    width: 36,
    height: 36,
    borderRadius: RADII_ADMIN.sm,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tarjetaTexto: {
    flex: 1,
    gap: 4,
  },
  tarjetaDescripcion: {
    fontSize: 14,
    fontFamily: TIPOGRAFIA_ADMIN.semiNegrita,
    color: COLORES_ADMIN.texto,
  },
  tarjetaMetaFila: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: ESPACIADO_ADMIN.xs,
    flexWrap: 'wrap',
  },
  tarjetaMeta: {
    fontSize: 12,
    fontFamily: TIPOGRAFIA_ADMIN.regular,
    color: COLORES_ADMIN.textoSecundario,
  },
  tarjetaMetaSeparador: {
    fontSize: 12,
    color: COLORES_ADMIN.bordeSuave,
  },
  tarjetaMetaMono: {
    fontSize: 11,
    fontFamily: TIPOGRAFIA_ADMIN.monoRegular,
    color: COLORES_ADMIN.textoSecundario,
    backgroundColor: COLORES_ADMIN.superficieBaja,
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 4,
  },
  fondoModal: {
    flex: 1,
    backgroundColor: 'rgba(42,24,16,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: ESPACIADO_ADMIN.xl,
  },
  tarjetaModal: {
    width: '100%',
    maxWidth: 420,
    maxHeight: '80%',
    backgroundColor: '#FFFFFF',
    borderRadius: RADII_ADMIN.lg,
    padding: ESPACIADO_ADMIN.xl,
    gap: ESPACIADO_ADMIN.md,
  },
  modalTitulo: {
    fontSize: 16,
    fontFamily: TIPOGRAFIA_ADMIN.negrita,
    color: COLORES_ADMIN.texto,
  },
  modalLista: {
    flexGrow: 0,
  },
  modalCancelar: {
    fontSize: 14,
    fontFamily: TIPOGRAFIA_ADMIN.medio,
    color: COLORES_ADMIN.textoSecundario,
    textAlign: 'center',
  },
  opcion: {
    paddingVertical: ESPACIADO_ADMIN.sm,
    borderBottomWidth: 1,
    borderBottomColor: COLORES_ADMIN.bordeSuave,
  },
  opcionTexto: {
    fontSize: 14,
    fontFamily: TIPOGRAFIA_ADMIN.regular,
    color: COLORES_ADMIN.texto,
  },
  opcionQuitar: {
    paddingVertical: ESPACIADO_ADMIN.sm,
    borderBottomWidth: 1,
    borderBottomColor: COLORES_ADMIN.bordeSuave,
  },
  opcionQuitarTexto: {
    fontSize: 14,
    fontFamily: TIPOGRAFIA_ADMIN.semiNegrita,
    color: COLORES_ADMIN.error,
  },
  botonAplicar: {
    backgroundColor: COLORES_ADMIN.vino,
    borderRadius: RADII_ADMIN.sm,
    paddingVertical: ESPACIADO_ADMIN.md,
    alignItems: 'center',
  },
  botonAplicarTexto: {
    color: '#FFFFFF',
    fontSize: 14,
    fontFamily: TIPOGRAFIA_ADMIN.semiNegrita,
  },
  botonDeshabilitado: {
    opacity: 0.5,
  },
});
