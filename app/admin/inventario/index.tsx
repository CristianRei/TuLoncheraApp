import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import { exportarAExcel } from '@/db/exportarExcel';
import { getDb } from '@/db/client';
import { listarInventarioBodega, type ItemInventario } from '@/db/inventario';
import { listarTodosLosMovimientos } from '@/db/movimientos';
import { ContenedorAncho } from '@/ui/ContenedorAncho';
import { Encabezado } from '@/ui/Encabezado';
import { EmptyState } from '@/ui/EmptyState';
import { SearchBar } from '@/ui/SearchBar';
import { ANCHO_ADMIN, COLORES_ADMIN, ESPACIADO_ADMIN, RADII_ADMIN, TIPOGRAFIA_ADMIN, TEXTO_ADMIN } from '@/ui/tema';
import { useRequiereSesion } from '@/ui/useRequiereSesion';
import { useRecargarConDatosNuevos } from '@/ui/useVersionDatos';

/** Minúsculas y sin tildes: "limon" encuentra "LIMÓN". */
function normalizar(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

/** Busca por nombre, SKU, código de barras o marca. */
function coincide(item: ItemInventario, busqueda: string): boolean {
  const termino = normalizar(busqueda);
  if (!termino) return true;
  const { nombre, sku, codigoBarras, marca } = item.producto;
  return [nombre, sku, codigoBarras, marca].some((campo) => campo && normalizar(campo).includes(termino));
}

export default function Inventario() {
  const usuario = useRequiereSesion(['ADMIN']);
  const [items, setItems] = useState<ItemInventario[]>([]);
  const [cargando, setCargando] = useState(true);
  const [exportando, setExportando] = useState<'inventario' | 'movimientos' | null>(null);
  const [busqueda, setBusqueda] = useState('');

  const cargarInventario = useCallback(async () => {
    setCargando(true);
    try {
      const db = await getDb();
      setItems(await listarInventarioBodega(db));
    } finally {
      setCargando(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      cargarInventario();
    }, [cargarInventario])
  );
  // El stock de bodega se actualiza solo cuando bodega ingresa un pedido o
  // entrega un cargue desde otro dispositivo.
  useRecargarConDatosNuevos(cargarInventario);

  async function exportarInventario() {
    setExportando('inventario');
    try {
      await exportarAExcel(
        'Inventario de bodega',
        items.map((item) => ({ Producto: item.producto.nombre, Saldo: item.saldo })),
        'inventario_bodega'
      );
    } finally {
      setExportando(null);
    }
  }

  async function exportarMovimientos() {
    setExportando('movimientos');
    try {
      const db = await getDb();
      const movimientos = await listarTodosLosMovimientos(db);
      await exportarAExcel(
        'Movimientos',
        movimientos.map((m) => ({
          Tipo: m.tipo,
          Producto: m.productoNombre,
          Cantidad: m.cantidad,
          Origen: m.ubicacionOrigen ?? '',
          Destino: m.ubicacionDestino ?? '',
          Usuario: m.usuarioNombre,
          Motivo: m.motivo ?? '',
          Fecha: m.tsCliente,
        })),
        'movimientos'
      );
    } finally {
      setExportando(null);
    }
  }

  if (!usuario) return null;

  const filtrados = items.filter((item) => coincide(item, busqueda));

  return (
    <View style={styles.contenedor}>
      <Encabezado
        titulo="Inventario de bodega"
        rutaVolverTexto="Admin"
        accion={{ icono: 'add', texto: 'Pedido', onPress: () => router.push('/admin/inventario/pedido') }}
      />

      <ContenedorAncho anchoMaximo={ANCHO_ADMIN.lista}>
        <View style={styles.accionesExport}>
          <Pressable
            style={styles.botonExport}
            onPress={exportarInventario}
            disabled={exportando !== null || items.length === 0}
          >
            {exportando === 'inventario' ? (
              <ActivityIndicator size="small" color={COLORES_ADMIN.vino} />
            ) : (
              <Text style={styles.botonExportTexto}>Exportar inventario a Excel</Text>
            )}
          </Pressable>
          <Pressable
            style={styles.botonExport}
            onPress={exportarMovimientos}
            disabled={exportando !== null}
          >
            {exportando === 'movimientos' ? (
              <ActivityIndicator size="small" color={COLORES_ADMIN.vino} />
            ) : (
              <Text style={styles.botonExportTexto}>Exportar movimientos a Excel</Text>
            )}
          </Pressable>
        </View>
        {items.length > 0 && (
          <View style={styles.busqueda}>
            <SearchBar
              valor={busqueda}
              onCambiar={setBusqueda}
              placeholder="Buscar por nombre, SKU, código de barras o marca..."
            />
          </View>
        )}
      </ContenedorAncho>

      {cargando ? (
        <View style={styles.centrado}>
          <ActivityIndicator size="large" color={COLORES_ADMIN.vino} />
        </View>
      ) : items.length === 0 ? (
        <EmptyState
          icono="cube-outline"
          mensaje={'Todavía no hay stock en bodega. Toca "+ Pedido" para registrar lo que llegó.'}
        />
      ) : filtrados.length === 0 ? (
        <EmptyState icono="search-outline" mensaje={`Ningún producto en bodega coincide con "${busqueda.trim()}".`} />
      ) : (
        <ContenedorAncho anchoMaximo={ANCHO_ADMIN.lista} llenarAlto>
          <FlatList
            data={filtrados}
            keyExtractor={(item) => item.producto.id}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.lista}
            renderItem={({ item }) => (
              <View style={styles.fila}>
                <Text style={styles.filaNombre} numberOfLines={2}>
                  {item.producto.nombre}
                </Text>
                <Text style={styles.filaSaldo}>{item.saldo} und.</Text>
              </View>
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
    backgroundColor: COLORES_ADMIN.background,
  },
  accionesExport: {
    flexDirection: 'row',
    gap: ESPACIADO_ADMIN.sm,
    paddingTop: ESPACIADO_ADMIN.lg,
  },
  botonExport: {
    flex: 1,
    borderRadius: RADII_ADMIN.md,
    paddingVertical: ESPACIADO_ADMIN.sm + 2,
    paddingHorizontal: ESPACIADO_ADMIN.sm,
    backgroundColor: COLORES_ADMIN.superficieMasBaja,
    borderWidth: 1,
    borderColor: COLORES_ADMIN.vino,
    alignItems: 'center',
    justifyContent: 'center',
  },
  botonExportTexto: {
    ...TEXTO_ADMIN.nota,
    fontFamily: TIPOGRAFIA_ADMIN.semiNegrita,
    color: COLORES_ADMIN.vino,
    textAlign: 'center',
  },
  busqueda: {
    paddingTop: ESPACIADO_ADMIN.md,
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
    justifyContent: 'space-between',
    backgroundColor: COLORES_ADMIN.superficieMasBaja,
    borderRadius: RADII_ADMIN.md,
    borderWidth: 1,
    borderColor: COLORES_ADMIN.bordeSuave,
    padding: ESPACIADO_ADMIN.md,
    gap: ESPACIADO_ADMIN.md,
  },
  filaNombre: {
    ...TEXTO_ADMIN.cuerpo,
    flex: 1,
    fontFamily: TIPOGRAFIA_ADMIN.semiNegrita,
  },
  filaSaldo: {
    fontSize: 15,
    fontFamily: TIPOGRAFIA_ADMIN.monoSemiNegrita,
    color: COLORES_ADMIN.vino,
  },
});
