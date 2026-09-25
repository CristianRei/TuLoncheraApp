import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import type { Categoria, Producto } from '@/core/tipos';
import { formatearPesos } from '@/core/dinero';
import { listarCategorias } from '@/db/categorias';
import { exportarAExcel } from '@/db/exportarExcel';
import { getDb } from '@/db/client';
import { asignarCategoriaAProductos, listarProductos } from '@/db/productos';
import { ContenedorAncho } from '@/ui/ContenedorAncho';
import { Encabezado } from '@/ui/Encabezado';
import { EmptyState } from '@/ui/EmptyState';
import { FiltroSegmentado } from '@/ui/FiltroSegmentado';
import { AccionFiltro, CampoFiltro, FilaFiltrosSuperior, FilaSelectores, FiltrosAplicados, PanelFiltros, SelectorFiltro, type FiltroAplicado } from '@/ui/PanelFiltros';
import { SelectorModal } from '@/ui/SelectorModal';
import { SearchBar } from '@/ui/SearchBar';
import { ANCHO_ADMIN, COLORES_ADMIN, ESPACIADO_ADMIN, RADII_ADMIN, TEXTO_ADMIN } from '@/ui/tema';
import { useEsPantallaAncha } from '@/ui/useEsPantallaAncha';
import { useRequiereSesion } from '@/ui/useRequiereSesion';

type Filtro = 'ACTIVOS' | 'ELIMINADOS';
type FiltroCategoria = 'TODAS' | 'SIN_CATEGORIA' | string;

const OPCIONES_FILTRO: { valor: Filtro; etiqueta: string }[] = [
  { valor: 'ACTIVOS', etiqueta: 'Activos' },
  { valor: 'ELIMINADOS', etiqueta: 'Eliminados' },
];

export default function CatalogoProductos() {
  const usuario = useRequiereSesion(['ADMIN']);
  const [productos, setProductos] = useState<Producto[]>([]);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [cargando, setCargando] = useState(true);
  const [filtro, setFiltro] = useState<Filtro>('ACTIVOS');
  const [filtroCategoria, setFiltroCategoria] = useState<FiltroCategoria>('TODAS');
  const [selectorCategoriaVisible, setSelectorCategoriaVisible] = useState(false);
  const [busqueda, setBusqueda] = useState('');
  const [exportando, setExportando] = useState(false);
  const [modoSeleccion, setModoSeleccion] = useState(false);
  const [seleccionados, setSeleccionados] = useState<Set<string>>(new Set());
  const [modalAsignarVisible, setModalAsignarVisible] = useState(false);
  const [asignando, setAsignando] = useState(false);
  const anchaPantalla = useEsPantallaAncha();
  const columnas = anchaPantalla ? 3 : 1;

  const cargar = useCallback(async (filtroActual: Filtro) => {
    setCargando(true);
    try {
      const db = await getDb();
      const [lista, listaCategorias] = await Promise.all([
        listarProductos(db, { incluirInactivos: filtroActual === 'ELIMINADOS' }),
        listarCategorias(db),
      ]);
      setProductos(lista);
      setCategorias(listaCategorias);
    } finally {
      setCargando(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      cargar(filtro);
    }, [cargar, filtro])
  );

  if (!usuario) return null;

  const filtrados = productos.filter((p) => {
    if (!p.nombre.toLowerCase().includes(busqueda.trim().toLowerCase())) return false;
    if (filtroCategoria === 'TODAS') return true;
    if (filtroCategoria === 'SIN_CATEGORIA') return p.categoriaId === null;
    return p.categoriaId === filtroCategoria;
  });

  function salirDeSeleccion() {
    setModoSeleccion(false);
    setSeleccionados(new Set());
  }

  function alternarSeleccion(id: string) {
    setSeleccionados((actual) => {
      const nuevo = new Set(actual);
      if (nuevo.has(id)) nuevo.delete(id);
      else nuevo.add(id);
      return nuevo;
    });
  }

  async function confirmarAsignarCategoria(categoriaId: string) {
    setAsignando(true);
    try {
      const db = await getDb();
      await asignarCategoriaAProductos(db, [...seleccionados], categoriaId);
      setModalAsignarVisible(false);
      salirDeSeleccion();
      await cargar(filtro);
    } finally {
      setAsignando(false);
    }
  }

  async function exportar() {
    setExportando(true);
    try {
      await exportarAExcel(
        'Catálogo',
        filtrados.map((p) => ({
          SKU: p.sku,
          Nombre: p.nombre,
          Precio: p.precio,
          Categoría: p.categoriaNombre ?? '',
          Marca: p.marca ?? '',
          'Código de barras': p.codigoBarras ?? '',
          Activo: p.activo ? 'Sí' : 'No',
        })),
        'catalogo_productos'
      );
    } finally {
      setExportando(false);
    }
  }

  const nombreFiltroCategoria =
    filtroCategoria === 'TODAS'
      ? null
      : filtroCategoria === 'SIN_CATEGORIA'
        ? 'Sin categoría'
        : (categorias.find((c) => c.id === filtroCategoria)?.nombre ?? null);

  return (
    <View style={styles.contenedor}>
      <Encabezado
        titulo="Catálogo de productos"
        rutaVolverTexto="Admin"
        anchoMaximo={ANCHO_ADMIN.lista}
        accion={{ icono: 'add', onPress: () => router.push('/admin/catalogo/nuevo') }}
      />
      <ContenedorAncho anchoMaximo={ANCHO_ADMIN.lista}>
        <View style={styles.encabezadoAcciones}>
          <Pressable onPress={() => router.push('/admin/catalogo/categorias')}>
            <Text style={styles.enlaceEncabezado}>Gestionar categorías</Text>
          </Pressable>
          <Pressable onPress={() => (modoSeleccion ? salirDeSeleccion() : setModoSeleccion(true))}>
            <Text style={styles.enlaceEncabezado}>
              {modoSeleccion ? 'Cancelar selección' : 'Etiquetar en bloque'}
            </Text>
          </Pressable>
        </View>
      </ContenedorAncho>

      <ContenedorAncho anchoMaximo={ANCHO_ADMIN.lista}>
        <View style={styles.controles}>
          <PanelFiltros>
            <FilaFiltrosSuperior
              acciones={
                <AccionFiltro
                  icono="download-outline"
                  texto="Exportar"
                  onPress={exportar}
                  cargando={exportando}
                  deshabilitado={filtrados.length === 0}
                />
              }
            >
              <FiltroSegmentado opciones={OPCIONES_FILTRO} valorActivo={filtro} onCambiar={setFiltro} />
            </FilaFiltrosSuperior>
            <FilaSelectores activos={nombreFiltroCategoria ? 1 : 0}>
              <CampoFiltro icono="search-outline" etiqueta="Buscar">
                <SearchBar valor={busqueda} onCambiar={setBusqueda} placeholder="Nombre del producto..." />
              </CampoFiltro>
              <SelectorFiltro
                icono="pricetags-outline"
                etiqueta="Categoría"
                valorTexto={nombreFiltroCategoria ?? 'Todas las categorías'}
                onPress={() => setSelectorCategoriaVisible(true)}
              />
            </FilaSelectores>
            <FiltrosAplicados
              filtros={[
                busqueda.trim() !== '' && {
                  clave: 'busqueda',
                  texto: `Búsqueda: ${busqueda.trim()}`,
                  onQuitar: () => setBusqueda(''),
                },
                nombreFiltroCategoria && {
                  clave: 'categoria',
                  texto: `Categoría: ${nombreFiltroCategoria}`,
                  onQuitar: () => setFiltroCategoria('TODAS'),
                },
              ].filter((f): f is FiltroAplicado => !!f)}
              onLimpiar={() => {
                setBusqueda('');
                setFiltroCategoria('TODAS');
              }}
            />
          </PanelFiltros>
        </View>
      </ContenedorAncho>

      {cargando ? (
        <View style={styles.centrado}>
          <ActivityIndicator size="large" color={COLORES_ADMIN.vino} />
        </View>
      ) : filtrados.length === 0 ? (
        <EmptyState
          icono="pricetags-outline"
          mensaje={
            busqueda
              ? 'Ningún producto coincide con la búsqueda.'
              : filtro === 'ACTIVOS'
                ? 'Todavía no hay productos en el catálogo.'
                : 'No hay productos eliminados.'
          }
        />
      ) : (
        <ContenedorAncho anchoMaximo={ANCHO_ADMIN.lista} llenarAlto>
          <FlatList
            key={columnas}
            data={filtrados}
            keyExtractor={(p) => p.id}
            numColumns={columnas}
            columnWrapperStyle={anchaPantalla ? styles.filaGrilla : undefined}
            contentContainerStyle={styles.lista}
            renderItem={({ item }) => (
              <Pressable
                style={[styles.fila, anchaPantalla && styles.filaAncha]}
                onPress={() =>
                  modoSeleccion
                    ? alternarSeleccion(item.id)
                    : router.push(`/admin/catalogo/${item.id}`)
                }
              >
                {modoSeleccion && (
                  <Ionicons
                    name={seleccionados.has(item.id) ? 'checkbox' : 'square-outline'}
                    size={22}
                    color={COLORES_ADMIN.vino}
                  />
                )}
                {item.fotoUri ? (
                  <Image source={{ uri: item.fotoUri }} style={styles.miniatura} />
                ) : (
                  <View style={styles.miniaturaVacia}>
                    <Text style={styles.miniaturaVaciaTexto}>Sin foto</Text>
                  </View>
                )}
                <View style={styles.filaTexto}>
                  <Text style={styles.filaNombre} numberOfLines={2}>
                    {item.nombre}
                  </Text>
                  <Text style={styles.filaPrecio}>{formatearPesos(item.precio)}</Text>
                  <Text style={item.categoriaNombre ? styles.filaCategoria : styles.filaSinCategoria}>
                    {item.categoriaNombre ?? 'Sin categoría'}
                  </Text>
                </View>
              </Pressable>
            )}
          />
        </ContenedorAncho>
      )}

      {modoSeleccion && seleccionados.size > 0 && (
        <View style={styles.barraSeleccion}>
          <Text style={styles.barraSeleccionTexto}>{seleccionados.size} seleccionados</Text>
          <Pressable style={styles.barraSeleccionBoton} onPress={() => setModalAsignarVisible(true)}>
            <Text style={styles.barraSeleccionBotonTexto}>Asignar categoría</Text>
          </Pressable>
        </View>
      )}

      <Modal visible={modalAsignarVisible} animationType="fade" transparent>
        <View style={styles.fondoModal}>
          <View style={styles.tarjetaModal}>
            <Text style={styles.modalTitulo}>Asignar categoría</Text>
            <Text style={styles.modalSubtitulo}>
              A {seleccionados.size} producto{seleccionados.size === 1 ? '' : 's'} seleccionado
              {seleccionados.size === 1 ? '' : 's'}
            </Text>
            {categorias.length === 0 ? (
              <Text style={styles.vacio}>Todavía no hay categorías creadas.</Text>
            ) : (
              <ScrollView style={styles.modalListaCategorias}>
                {categorias.map((c) => (
                  <Pressable
                    key={c.id}
                    style={styles.modalCategoriaFila}
                    onPress={() => confirmarAsignarCategoria(c.id)}
                    disabled={asignando}
                  >
                    <Text style={styles.modalCategoriaTexto}>{c.nombre}</Text>
                  </Pressable>
                ))}
              </ScrollView>
            )}
            <Pressable onPress={() => setModalAsignarVisible(false)} disabled={asignando}>
              <Text style={styles.modalCancelar}>Cancelar</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
      <SelectorModal
        visible={selectorCategoriaVisible}
        titulo="Filtrar por categoría"
        opciones={[
          { id: 'SIN_CATEGORIA', etiqueta: 'Sin categoría' },
          ...categorias.map((c) => ({ id: c.id, etiqueta: c.nombre })),
        ]}
        onElegir={(id) => {
          setFiltroCategoria(id ?? 'TODAS');
          setSelectorCategoriaVisible(false);
        }}
        onCerrar={() => setSelectorCategoriaVisible(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  contenedor: {
    flex: 1,
    backgroundColor: COLORES_ADMIN.background,
  },
  encabezadoAcciones: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: ESPACIADO_ADMIN.xl,
    marginTop: -ESPACIADO_ADMIN.sm,
    marginBottom: ESPACIADO_ADMIN.xs,
  },
  enlaceEncabezado: {
    ...TEXTO_ADMIN.boton,
    color: COLORES_ADMIN.vino,
    textDecorationLine: 'underline',
  },
  controles: {
    paddingHorizontal: ESPACIADO_ADMIN.xl,
    paddingTop: ESPACIADO_ADMIN.lg,
    paddingBottom: ESPACIADO_ADMIN.sm,
  },
  centrado: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  vacio: {
    fontSize: 14,
    color: COLORES_ADMIN.textoSecundario,
    textAlign: 'center',
  },
  lista: {
    padding: 20,
    gap: 12,
  },
  filaGrilla: {
    gap: 12,
  },
  fila: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORES_ADMIN.superficieMasBaja,
    borderRadius: RADII_ADMIN.md,
    padding: 10,
    gap: 12,
    shadowColor: COLORES_ADMIN.texto,
    shadowOpacity: 0.05,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  filaAncha: {
    flex: 1,
  },
  miniatura: {
    width: 56,
    height: 56,
    borderRadius: RADII_ADMIN.sm,
    backgroundColor: COLORES_ADMIN.superficieBaja,
  },
  miniaturaVacia: {
    width: 56,
    height: 56,
    borderRadius: RADII_ADMIN.sm,
    backgroundColor: COLORES_ADMIN.superficieBaja,
    alignItems: 'center',
    justifyContent: 'center',
  },
  miniaturaVaciaTexto: {
    fontSize: 9,
    color: COLORES_ADMIN.textoSecundario,
    textAlign: 'center',
  },
  filaTexto: {
    flex: 1,
    gap: 2,
  },
  filaNombre: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORES_ADMIN.texto,
  },
  filaPrecio: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORES_ADMIN.vino,
  },
  filaCategoria: {
    fontSize: 11,
    fontWeight: '600',
    color: COLORES_ADMIN.dorado,
    marginTop: 1,
  },
  filaSinCategoria: {
    fontSize: 11,
    fontStyle: 'italic',
    color: COLORES_ADMIN.textoSecundario,
    marginTop: 1,
  },
  barraSeleccion: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 20,
    backgroundColor: COLORES_ADMIN.vino,
    borderRadius: RADII_ADMIN.lg,
    paddingVertical: 12,
    paddingHorizontal: 18,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    shadowColor: COLORES_ADMIN.texto,
    shadowOpacity: 0.15,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  barraSeleccionTexto: {
    color: COLORES_ADMIN.textoInverso,
    fontSize: 14,
    fontWeight: '600',
  },
  barraSeleccionBoton: {
    backgroundColor: COLORES_ADMIN.dorado,
    borderRadius: RADII_ADMIN.sm,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  barraSeleccionBotonTexto: {
    color: COLORES_ADMIN.texto,
    fontSize: 13,
    fontWeight: '700',
  },
  fondoModal: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  tarjetaModal: {
    width: '100%',
    maxWidth: 360,
    maxHeight: '70%',
    backgroundColor: COLORES_ADMIN.superficieMasBaja,
    borderRadius: RADII_ADMIN.lg,
    padding: 22,
    gap: 10,
  },
  modalTitulo: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORES_ADMIN.texto,
  },
  modalSubtitulo: {
    fontSize: 13,
    color: COLORES_ADMIN.textoSecundario,
    marginBottom: 4,
  },
  modalListaCategorias: {
    maxHeight: 260,
  },
  modalCategoriaFila: {
    paddingVertical: 13,
    borderBottomWidth: 1,
    borderBottomColor: COLORES_ADMIN.bordeSuave,
  },
  modalCategoriaTexto: {
    fontSize: 15,
    color: COLORES_ADMIN.texto,
    fontWeight: '600',
  },
  modalCancelar: {
    fontSize: 14,
    color: COLORES_ADMIN.textoSecundario,
    textAlign: 'center',
    marginTop: 10,
  },
});
