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
import { FilterTabs } from '@/ui/FilterTabs';
import { COLORES_ADMIN, ESPACIADO_ADMIN, RADII_ADMIN, TIPOGRAFIA_ADMIN } from '@/ui/tema';
import { useRequiereSesion } from '@/ui/useRequiereSesion';

type FiltroEntidad = 'TODOS' | EntidadAuditoria | 'ACCESOS';

const OPCIONES_ENTIDAD: { valor: FiltroEntidad; etiqueta: string }[] = [
  { valor: 'TODOS', etiqueta: 'Todos' },
  { valor: 'PERSONA', etiqueta: 'Personal' },
  { valor: 'CLIENTE', etiqueta: 'Clientes' },
  { valor: 'CATEGORIA', etiqueta: 'Categorías' },
  { valor: 'EVENTO', etiqueta: 'Eventos' },
  { valor: 'ACCESOS', etiqueta: 'Accesos' },
];

const OPCIONES_PERIODO: { valor: Periodo; etiqueta: string }[] = [
  ...(Object.keys(ETIQUETAS_PERIODO) as Exclude<Periodo, 'PERSONALIZADO'>[]).map((p) => ({
    valor: p as Periodo,
    etiqueta: ETIQUETAS_PERIODO[p],
  })),
  { valor: 'PERSONALIZADO', etiqueta: 'Personalizado' },
];

const ICONO_ORIGEN: Record<LogAuditoria['origen'], keyof typeof Ionicons.glyphMap> = {
  AUDITORIA: 'person-circle-outline',
  MOVIMIENTO: 'cube-outline',
  ACCESO_FALLIDO: 'warning-outline',
};

function formatearFecha(tsCliente: string): string {
  return new Date(tsCliente).toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' });
}

interface OpcionSelector {
  id: string;
  etiqueta: string;
}

/** Modal de selección simple (lista de opciones + "Quitar filtro") — usado por los 4 selectores de esta pantalla. */
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

export default function Auditoria() {
  const usuario = useRequiereSesion(['ADMIN']);
  const [logs, setLogs] = useState<LogAuditoria[]>([]);
  const [cargando, setCargando] = useState(true);

  const [filtroEntidad, setFiltroEntidad] = useState<FiltroEntidad>('TODOS');
  const [periodo, setPeriodo] = useState<Periodo>('SEMANA');
  const [desdePersonalizado, setDesdePersonalizado] = useState<string | null>(null);
  const [hastaPersonalizado, setHastaPersonalizado] = useState<string | null>(null);
  const [calendarioVisible, setCalendarioVisible] = useState(false);

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

  const nombreActor = actorId ? personal.find((p) => p.id === actorId)?.nombre : null;
  const nombreAfectado = afectadoId ? opcionesAfectado.find((o) => o.id === afectadoId)?.etiqueta : null;
  const nombreProducto = productoId ? productos.find((p) => p.id === productoId)?.nombre : null;
  const nombreCategoria = categoriaId ? categorias.find((c) => c.id === categoriaId)?.nombre : null;

  const muestraProductoCategoria = filtroEntidad === 'TODOS';
  const muestraAfectado = ['PERSONA', 'CLIENTE', 'CATEGORIA'].includes(filtroEntidad);

  return (
    <View style={styles.contenedor}>
      <Encabezado titulo="Bitácora y auditoría" rutaVolverTexto="Admin" anchoMaximo={720} />

      <ContenedorAncho anchoMaximo={720}>
        <View style={styles.controles}>
          <View style={styles.filaPeriodo}>
            <FilterTabs
              opciones={OPCIONES_PERIODO}
              valorActivo={periodo}
              onCambiar={(valor) => {
                setPeriodo(valor);
                if (valor === 'PERSONALIZADO') setCalendarioVisible(true);
              }}
            />
            {periodo === 'PERSONALIZADO' && desdePersonalizado && hastaPersonalizado && (
              <Pressable onPress={() => setCalendarioVisible(true)}>
                <Text style={styles.rangoTexto}>
                  {desdePersonalizado} — {hastaPersonalizado}
                </Text>
              </Pressable>
            )}
          </View>

          <FilterTabs opciones={OPCIONES_ENTIDAD} valorActivo={filtroEntidad} onCambiar={elegirTipo} />

          <View style={styles.chipsFiltro}>
            <Pressable style={styles.chipFiltro} onPress={() => setSelectorAbierto('ACTOR')}>
              <Ionicons name="person-outline" size={14} color={COLORES_ADMIN.vino} />
              <Text style={styles.chipFiltroTexto}>{nombreActor ?? 'Hecho por: cualquiera'}</Text>
            </Pressable>

            {muestraAfectado && (
              <Pressable style={styles.chipFiltro} onPress={() => setSelectorAbierto('AFECTADO')}>
                <Ionicons name="locate-outline" size={14} color={COLORES_ADMIN.vino} />
                <Text style={styles.chipFiltroTexto}>{nombreAfectado ?? 'Sobre quién: cualquiera'}</Text>
              </Pressable>
            )}

            {muestraProductoCategoria && (
              <>
                <Pressable style={styles.chipFiltro} onPress={() => setSelectorAbierto('PRODUCTO')}>
                  <Ionicons name="pricetag-outline" size={14} color={COLORES_ADMIN.vino} />
                  <Text style={styles.chipFiltroTexto}>{nombreProducto ?? 'Producto: cualquiera'}</Text>
                </Pressable>
                <Pressable style={styles.chipFiltro} onPress={() => setSelectorAbierto('CATEGORIA')}>
                  <Ionicons name="pricetags-outline" size={14} color={COLORES_ADMIN.vino} />
                  <Text style={styles.chipFiltroTexto}>{nombreCategoria ?? 'Categoría: cualquiera'}</Text>
                </Pressable>
              </>
            )}
          </View>
        </View>
      </ContenedorAncho>

      {cargando ? (
        <View style={styles.centrado}>
          <ActivityIndicator size="large" color={COLORES_ADMIN.vino} />
        </View>
      ) : logs.length === 0 ? (
        <EmptyState icono="document-text-outline" mensaje="Sin actividad registrada con estos filtros." />
      ) : (
        <ContenedorAncho anchoMaximo={720} llenarAlto>
          <FlatList
            data={logs}
            keyExtractor={(log) => log.id}
            contentContainerStyle={styles.lista}
            renderItem={({ item }) => (
              <View style={styles.fila}>
                <Ionicons name={ICONO_ORIGEN[item.origen]} size={20} color={COLORES_ADMIN.vino} />
                <View style={styles.filaTexto}>
                  <Text style={styles.filaDescripcion}>{item.descripcion}</Text>
                  <Text style={styles.filaDetalle}>
                    {formatearFecha(item.tsCliente)}
                    {item.dispositivoId ? ` · Dispositivo ${item.dispositivoId.slice(0, 8)}` : ''}
                  </Text>
                </View>
              </View>
            )}
          />
        </ContenedorAncho>
      )}

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
        titulo="Hecho por"
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
        titulo="Producto"
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
  controles: {
    paddingTop: ESPACIADO_ADMIN.lg,
    gap: ESPACIADO_ADMIN.md,
  },
  filaPeriodo: {
    gap: ESPACIADO_ADMIN.sm,
  },
  rangoTexto: {
    fontSize: 12,
    fontFamily: TIPOGRAFIA_ADMIN.monoRegular,
    color: COLORES_ADMIN.textoSecundario,
    textDecorationLine: 'underline',
  },
  chipsFiltro: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: ESPACIADO_ADMIN.sm,
  },
  chipFiltro: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: ESPACIADO_ADMIN.xs,
    backgroundColor: COLORES_ADMIN.superficieBaja,
    borderWidth: 1,
    borderColor: COLORES_ADMIN.bordeSuave,
    borderRadius: RADII_ADMIN.pill,
    paddingHorizontal: ESPACIADO_ADMIN.md,
    paddingVertical: ESPACIADO_ADMIN.sm,
  },
  chipFiltroTexto: {
    fontSize: 12,
    fontFamily: TIPOGRAFIA_ADMIN.medio,
    color: COLORES_ADMIN.vino,
  },
  centrado: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: ESPACIADO_ADMIN.xxl,
  },
  lista: {
    padding: ESPACIADO_ADMIN.xl,
    gap: ESPACIADO_ADMIN.sm,
  },
  fila: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: ESPACIADO_ADMIN.md,
    backgroundColor: COLORES_ADMIN.superficieMasBaja,
    borderRadius: RADII_ADMIN.md,
    borderWidth: 1,
    borderColor: COLORES_ADMIN.bordeSuave,
    padding: ESPACIADO_ADMIN.md,
  },
  filaTexto: {
    flex: 1,
    gap: 2,
  },
  filaDescripcion: {
    fontSize: 14,
    fontFamily: TIPOGRAFIA_ADMIN.semiNegrita,
    color: COLORES_ADMIN.texto,
  },
  filaDetalle: {
    fontSize: 12,
    fontFamily: TIPOGRAFIA_ADMIN.monoRegular,
    color: COLORES_ADMIN.textoSecundario,
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
