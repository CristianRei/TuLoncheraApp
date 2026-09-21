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
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { Categoria, Producto } from '@/core/tipos';
import { formatearPesos } from '@/core/dinero';
import { listarCategorias } from '@/db/categorias';
import { exportarAExcel } from '@/db/exportarExcel';
import { getDb } from '@/db/client';
import { asignarCategoriaAProductos, listarProductos } from '@/db/productos';
import { COLORES } from '@/ui/colores';
import { ContenedorAncho } from '@/ui/ContenedorAncho';
import { useEsPantallaAncha } from '@/ui/useEsPantallaAncha';
import { useRequiereSesion } from '@/ui/useRequiereSesion';

type Filtro = 'ACTIVOS' | 'ELIMINADOS';
type FiltroCategoria = 'TODAS' | 'SIN_CATEGORIA' | string;

export default function CatalogoProductos() {
  const usuario = useRequiereSesion(['ADMIN']);
  const [productos, setProductos] = useState<Producto[]>([]);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [cargando, setCargando] = useState(true);
  const [filtro, setFiltro] = useState<Filtro>('ACTIVOS');
  const [filtroCategoria, setFiltroCategoria] = useState<FiltroCategoria>('TODAS');
  const [busqueda, setBusqueda] = useState('');
  const [exportando, setExportando] = useState(false);
  const [modoSeleccion, setModoSeleccion] = useState(false);
  const [seleccionados, setSeleccionados] = useState<Set<string>>(new Set());
  const [modalAsignarVisible, setModalAsignarVisible] = useState(false);
  const [asignando, setAsignando] = useState(false);
  const insets = useSafeAreaInsets();
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

  return (
    <View style={styles.contenedor}>
      <View style={[styles.encabezado, { paddingTop: insets.top + 20 }]}>
        <ContenedorAncho anchoMaximo={960}>
          <View style={styles.encabezadoFila}>
            <Pressable onPress={() => router.back()}>
              <Text style={styles.volver}>‹ Admin</Text>
            </Pressable>
            <Text style={styles.titulo}>Catálogo de productos</Text>
            <Pressable
              style={styles.botonNuevo}
              onPress={() => router.push('/admin/catalogo/nuevo')}
            >
              <Text style={styles.botonNuevoTexto}>+</Text>
            </Pressable>
          </View>
          <View style={styles.encabezadoAcciones}>
            <Pressable onPress={() => router.push('/admin/catalogo/categorias')}>
              <Text style={styles.enlaceEncabezado}>Gestionar categorías</Text>
            </Pressable>
            <Pressable
              onPress={() => (modoSeleccion ? salirDeSeleccion() : setModoSeleccion(true))}
            >
              <Text style={styles.enlaceEncabezado}>
                {modoSeleccion ? 'Cancelar selección' : 'Etiquetar en bloque'}
              </Text>
            </Pressable>
          </View>
        </ContenedorAncho>
      </View>

      <ContenedorAncho anchoMaximo={960}>
        <View style={styles.controles}>
          <TextInput
            style={styles.busqueda}
            placeholder="Buscar producto..."
            placeholderTextColor="#999"
            value={busqueda}
            onChangeText={setBusqueda}
          />
          <View style={styles.tabs}>
            <Pressable
              style={[styles.tab, filtro === 'ACTIVOS' && styles.tabActivo]}
              onPress={() => setFiltro('ACTIVOS')}
            >
              <Text style={[styles.tabTexto, filtro === 'ACTIVOS' && styles.tabTextoActivo]}>
                Activos
              </Text>
            </Pressable>
            <Pressable
              style={[styles.tab, filtro === 'ELIMINADOS' && styles.tabActivo]}
              onPress={() => setFiltro('ELIMINADOS')}
            >
              <Text style={[styles.tabTexto, filtro === 'ELIMINADOS' && styles.tabTextoActivo]}>
                Eliminados
              </Text>
            </Pressable>
            <Pressable
              style={styles.tab}
              onPress={exportar}
              disabled={exportando || filtrados.length === 0}
            >
              {exportando ? (
                <ActivityIndicator size="small" color={COLORES.oscuro} />
              ) : (
                <Text style={styles.tabTexto}>Exportar</Text>
              )}
            </Pressable>
          </View>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipsCategoria}>
            <Pressable
              style={[styles.chipCategoria, filtroCategoria === 'TODAS' && styles.chipCategoriaActivo]}
              onPress={() => setFiltroCategoria('TODAS')}
            >
              <Text
                style={[
                  styles.chipCategoriaTexto,
                  filtroCategoria === 'TODAS' && styles.chipCategoriaTextoActivo,
                ]}
              >
                Todas
              </Text>
            </Pressable>
            <Pressable
              style={[
                styles.chipCategoria,
                filtroCategoria === 'SIN_CATEGORIA' && styles.chipCategoriaActivo,
              ]}
              onPress={() => setFiltroCategoria('SIN_CATEGORIA')}
            >
              <Text
                style={[
                  styles.chipCategoriaTexto,
                  filtroCategoria === 'SIN_CATEGORIA' && styles.chipCategoriaTextoActivo,
                ]}
              >
                Sin categoría
              </Text>
            </Pressable>
            {categorias.map((c) => (
              <Pressable
                key={c.id}
                style={[styles.chipCategoria, filtroCategoria === c.id && styles.chipCategoriaActivo]}
                onPress={() => setFiltroCategoria(c.id)}
              >
                <Text
                  style={[
                    styles.chipCategoriaTexto,
                    filtroCategoria === c.id && styles.chipCategoriaTextoActivo,
                  ]}
                >
                  {c.nombre}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      </ContenedorAncho>

      {cargando ? (
        <View style={styles.centrado}>
          <ActivityIndicator size="large" color={COLORES.oscuro} />
        </View>
      ) : filtrados.length === 0 ? (
        <View style={styles.centrado}>
          <Text style={styles.vacio}>
            {busqueda
              ? 'Ningún producto coincide con la búsqueda.'
              : filtro === 'ACTIVOS'
                ? 'Todavía no hay productos en el catálogo.'
                : 'No hay productos eliminados.'}
          </Text>
        </View>
      ) : (
        <ContenedorAncho anchoMaximo={960} llenarAlto>
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
                    color={COLORES.oscuro}
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
  encabezadoAcciones: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 10,
  },
  enlaceEncabezado: {
    color: '#FFE9E2',
    fontSize: 12.5,
    fontWeight: '600',
    textDecorationLine: 'underline',
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
  botonNuevo: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: COLORES.primario,
    alignItems: 'center',
    justifyContent: 'center',
  },
  botonNuevoTexto: {
    color: '#3A2400',
    fontSize: 20,
    fontWeight: '700',
    lineHeight: 22,
  },
  controles: {
    paddingHorizontal: 20,
    paddingTop: 16,
    gap: 12,
  },
  busqueda: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    paddingHorizontal: 18,
    paddingVertical: 10,
    fontSize: 15,
    borderWidth: 1,
    borderColor: '#EBD3D3',
  },
  tabs: {
    flexDirection: 'row',
    gap: 8,
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
  chipsCategoria: {
    flexDirection: 'row',
  },
  chipCategoria: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#EBD3D3',
    marginRight: 8,
  },
  chipCategoriaActivo: {
    backgroundColor: COLORES.primario,
    borderColor: COLORES.primario,
  },
  chipCategoriaTexto: {
    fontSize: 12.5,
    fontWeight: '600',
    color: '#666',
  },
  chipCategoriaTextoActivo: {
    color: '#3A2400',
  },
  centrado: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  vacio: {
    fontSize: 14,
    color: '#888',
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
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 10,
    gap: 12,
    shadowColor: '#000',
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
    borderRadius: 10,
    backgroundColor: '#F0F0F0',
  },
  miniaturaVacia: {
    width: 56,
    height: 56,
    borderRadius: 10,
    backgroundColor: '#F0F0F0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  miniaturaVaciaTexto: {
    fontSize: 9,
    color: '#AAA',
    textAlign: 'center',
  },
  filaTexto: {
    flex: 1,
    gap: 2,
  },
  filaNombre: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
  },
  filaPrecio: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORES.oscuro,
  },
  filaCategoria: {
    fontSize: 11,
    fontWeight: '600',
    color: COLORES.primario,
    marginTop: 1,
  },
  filaSinCategoria: {
    fontSize: 11,
    fontStyle: 'italic',
    color: '#AAA',
    marginTop: 1,
  },
  barraSeleccion: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 20,
    backgroundColor: COLORES.oscuro,
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 18,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  barraSeleccionTexto: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '600',
  },
  barraSeleccionBoton: {
    backgroundColor: COLORES.primario,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  barraSeleccionBotonTexto: {
    color: '#3A2400',
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
    backgroundColor: '#FFF',
    borderRadius: 18,
    padding: 22,
    gap: 10,
  },
  modalTitulo: {
    fontSize: 17,
    fontWeight: '700',
    color: '#333',
  },
  modalSubtitulo: {
    fontSize: 13,
    color: '#888',
    marginBottom: 4,
  },
  modalListaCategorias: {
    maxHeight: 260,
  },
  modalCategoriaFila: {
    paddingVertical: 13,
    borderBottomWidth: 1,
    borderBottomColor: '#EEE',
  },
  modalCategoriaTexto: {
    fontSize: 15,
    color: '#333',
    fontWeight: '600',
  },
  modalCancelar: {
    fontSize: 14,
    color: '#888',
    textAlign: 'center',
    marginTop: 10,
  },
});
