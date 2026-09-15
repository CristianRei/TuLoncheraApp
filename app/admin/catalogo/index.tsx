import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { Producto } from '@/core/tipos';
import { formatearPesos } from '@/core/dinero';
import { exportarAExcel } from '@/db/exportarExcel';
import { getDb } from '@/db/client';
import { listarProductos } from '@/db/productos';
import { COLORES } from '@/ui/colores';
import { ContenedorAncho } from '@/ui/ContenedorAncho';
import { useEsPantallaAncha } from '@/ui/useEsPantallaAncha';
import { useRequiereSesion } from '@/ui/useRequiereSesion';

type Filtro = 'ACTIVOS' | 'ELIMINADOS';

export default function CatalogoProductos() {
  const usuario = useRequiereSesion(['ADMIN']);
  const [productos, setProductos] = useState<Producto[]>([]);
  const [cargando, setCargando] = useState(true);
  const [filtro, setFiltro] = useState<Filtro>('ACTIVOS');
  const [busqueda, setBusqueda] = useState('');
  const [exportando, setExportando] = useState(false);
  const insets = useSafeAreaInsets();
  const anchaPantalla = useEsPantallaAncha();
  const columnas = anchaPantalla ? 3 : 1;

  const cargar = useCallback(async (filtroActual: Filtro) => {
    setCargando(true);
    try {
      const db = await getDb();
      const lista = await listarProductos(db, { incluirInactivos: filtroActual === 'ELIMINADOS' });
      setProductos(lista);
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

  const filtrados = productos.filter((p) =>
    p.nombre.toLowerCase().includes(busqueda.trim().toLowerCase())
  );

  async function exportar() {
    setExportando(true);
    try {
      await exportarAExcel(
        'Catálogo',
        filtrados.map((p) => ({
          SKU: p.sku,
          Nombre: p.nombre,
          Precio: p.precio,
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
                onPress={() => router.push(`/admin/catalogo/${item.id}`)}
              >
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
                </View>
              </Pressable>
            )}
          />
        </ContenedorAncho>
      )}
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
});
