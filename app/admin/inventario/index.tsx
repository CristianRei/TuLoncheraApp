import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { exportarAExcel } from '@/db/exportarExcel';
import { getDb } from '@/db/client';
import { listarInventarioBodega, type ItemInventario } from '@/db/inventario';
import { listarTodosLosMovimientos } from '@/db/movimientos';
import { COLORES } from '@/ui/colores';
import { ContenedorAncho } from '@/ui/ContenedorAncho';
import { useEsPantallaAncha } from '@/ui/useEsPantallaAncha';
import { useRequiereSesion } from '@/ui/useRequiereSesion';

export default function Inventario() {
  const usuario = useRequiereSesion(['ADMIN']);
  const [items, setItems] = useState<ItemInventario[]>([]);
  const [cargando, setCargando] = useState(true);
  const [exportando, setExportando] = useState<'inventario' | 'movimientos' | null>(null);
  const insets = useSafeAreaInsets();
  const anchaPantalla = useEsPantallaAncha();

  useFocusEffect(
    useCallback(() => {
      (async () => {
        setCargando(true);
        try {
          const db = await getDb();
          setItems(await listarInventarioBodega(db));
        } finally {
          setCargando(false);
        }
      })();
    }, [])
  );

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

  return (
    <View style={styles.contenedor}>
      <View
        style={[
          anchaPantalla ? styles.encabezadoAncho : styles.encabezado,
          { paddingTop: anchaPantalla ? 20 : insets.top + 20 },
        ]}
      >
        <ContenedorAncho anchoMaximo={720}>
          <View style={styles.encabezadoFila}>
            {!anchaPantalla && (
              <Pressable onPress={() => router.back()}>
                <Text style={styles.volver}>‹ Admin</Text>
              </Pressable>
            )}
            <Text style={anchaPantalla ? styles.tituloAncho : styles.titulo}>Inventario de bodega</Text>
            <Pressable
              style={styles.botonNuevo}
              onPress={() => router.push('/admin/inventario/pedido')}
            >
              <Text style={styles.botonNuevoTexto}>+ Pedido</Text>
            </Pressable>
          </View>
        </ContenedorAncho>
      </View>

      <ContenedorAncho anchoMaximo={720}>
        <View style={styles.accionesExport}>
          <Pressable
            style={styles.botonExport}
            onPress={exportarInventario}
            disabled={exportando !== null || items.length === 0}
          >
            {exportando === 'inventario' ? (
              <ActivityIndicator size="small" color={COLORES.oscuro} />
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
              <ActivityIndicator size="small" color={COLORES.oscuro} />
            ) : (
              <Text style={styles.botonExportTexto}>Exportar movimientos a Excel</Text>
            )}
          </Pressable>
        </View>
      </ContenedorAncho>

      {cargando ? (
        <View style={styles.centrado}>
          <ActivityIndicator size="large" color={COLORES.oscuro} />
        </View>
      ) : items.length === 0 ? (
        <View style={styles.centrado}>
          <Text style={styles.vacio}>
            Todavía no hay stock en bodega. Toca &ldquo;Ingresar pedido&rdquo; para registrar lo que llegó.
          </Text>
        </View>
      ) : (
        <ContenedorAncho anchoMaximo={720} llenarAlto>
          <FlatList
            data={items}
            keyExtractor={(item) => item.producto.id}
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
    backgroundColor: '#FBEDED',
  },
  encabezado: {
    backgroundColor: COLORES.oscuro,
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
  },
  volver: {
    color: '#FFFFFF',
    fontSize: 14,
    textDecorationLine: 'underline',
  },
  titulo: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  tituloAncho: {
    color: COLORES.oscuro,
    fontSize: 20,
    fontWeight: '700',
  },
  botonNuevo: {
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: COLORES.primario,
    alignItems: 'center',
    justifyContent: 'center',
  },
  botonNuevoTexto: {
    color: '#3A2400',
    fontSize: 13,
    fontWeight: '700',
  },
  accionesExport: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  botonExport: {
    flex: 1,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 8,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: COLORES.oscuro,
    alignItems: 'center',
    justifyContent: 'center',
  },
  botonExportTexto: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORES.oscuro,
    textAlign: 'center',
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
    gap: 10,
  },
  fila: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 14,
  },
  filaNombre: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginRight: 12,
  },
  filaSaldo: {
    fontSize: 15,
    fontWeight: '800',
    color: COLORES.oscuro,
  },
});
