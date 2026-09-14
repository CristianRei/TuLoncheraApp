import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { formatearPesos } from '@/core/dinero';
import type { MetodoPago } from '@/core/tipos';
import { getDb } from '@/db/client';
import { getDispositivoId } from '@/db/dispositivo';
import { obtenerSaldoProducto, listarInventarioPromotor, type ItemInventario } from '@/db/inventario';
import { buscarProductoPorCodigoBarras } from '@/db/productos';
import { registrarVenta } from '@/db/ventas';
import { CobrarModal } from '@/ui/CobrarModal';
import { COLORES } from '@/ui/colores';
import { EscanerCodigoBarras } from '@/ui/EscanerCodigoBarras';
import { useSesion } from '@/ui/SesionContext';
import { TarjetaProductoInventario } from '@/ui/TarjetaProductoInventario';
import { TicketModal } from '@/ui/TicketModal';
import { useCarrito } from '@/ui/useCarrito';
import { useRequiereSesion } from '@/ui/useRequiereSesion';

export default function HomePromotor() {
  const usuario = useRequiereSesion(['PROMOTOR']);
  const { cerrarSesion } = useSesion();
  const carrito = useCarrito();

  const [inventario, setInventario] = useState<ItemInventario[]>([]);
  const [cargando, setCargando] = useState(true);
  const [busqueda, setBusqueda] = useState('');
  const [ticketVisible, setTicketVisible] = useState(false);
  const [cobrarVisible, setCobrarVisible] = useState(false);
  const [escanerVisible, setEscanerVisible] = useState(false);
  const [procesandoVenta, setProcesandoVenta] = useState(false);

  const cargarInventario = useCallback(async (promotorId: string) => {
    setCargando(true);
    try {
      const db = await getDb();
      setInventario(await listarInventarioPromotor(db, promotorId));
    } finally {
      setCargando(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (usuario) cargarInventario(usuario.id);
    }, [usuario, cargarInventario])
  );

  if (!usuario) return null;
  const usuarioActual = usuario;

  function salir() {
    cerrarSesion();
    router.replace('/');
  }

  async function manejarCodigoEscaneado(codigo: string) {
    setEscanerVisible(false);
    const db = await getDb();
    const producto = await buscarProductoPorCodigoBarras(db, codigo);
    if (!producto) {
      Alert.alert('Código no reconocido', 'Ningún producto del catálogo tiene ese código.');
      return;
    }
    const saldo = await obtenerSaldoProducto(db, usuarioActual.id, producto.id);
    if (saldo <= 0) {
      Alert.alert('Sin inventario', `No tienes "${producto.nombre}" en tu inventario.`);
      return;
    }
    carrito.agregar({
      id: producto.id,
      nombre: producto.nombre,
      precio: producto.precio,
      fotoUri: producto.fotoUri,
    });
  }

  async function cobrar(metodoPago: MetodoPago) {
    setProcesandoVenta(true);
    try {
      const db = await getDb();
      const dispositivoId = await getDispositivoId(db);
      await registrarVenta(
        db,
        {
          promotorId: usuarioActual.id,
          promotorNombre: usuarioActual.nombre,
          metodoPago,
          items: carrito.items.map((item) => ({
            productoId: item.productoId,
            productoNombre: item.nombre,
            cantidad: item.cantidad,
            precioUnitario: item.precio,
          })),
        },
        dispositivoId
      );
      carrito.vaciar();
      setCobrarVisible(false);
      setTicketVisible(false);
      await cargarInventario(usuarioActual.id);
      Alert.alert('Venta registrada', 'La venta quedó guardada correctamente.');
    } finally {
      setProcesandoVenta(false);
    }
  }

  const filtrados = inventario.filter((item) =>
    item.producto.nombre.toLowerCase().includes(busqueda.trim().toLowerCase())
  );

  return (
    <View style={styles.contenedor}>
      <View style={styles.encabezado}>
        <Text style={styles.saludo}>Hola, {usuario.nombre}</Text>
        <Pressable onPress={salir}>
          <Text style={styles.cerrarSesion}>Cerrar sesión</Text>
        </Pressable>
      </View>

      <View style={styles.barraAcciones}>
        <TextInput
          style={styles.busqueda}
          placeholder="Buscar producto..."
          placeholderTextColor="#999"
          value={busqueda}
          onChangeText={setBusqueda}
        />
        <Pressable style={styles.botonEscanear} onPress={() => setEscanerVisible(true)}>
          <Text style={styles.botonEscanearTexto}>📷</Text>
        </Pressable>
        <Pressable style={styles.botonTicket} onPress={() => setTicketVisible(true)}>
          <Text style={styles.botonTicketTexto}>Ticket</Text>
          {carrito.cantidadTotal > 0 && (
            <View style={styles.botonTicketBadge}>
              <Text style={styles.botonTicketBadgeTexto}>{carrito.cantidadTotal}</Text>
            </View>
          )}
        </Pressable>
      </View>

      {cargando ? (
        <View style={styles.centrado}>
          <ActivityIndicator size="large" color={COLORES.primario} />
        </View>
      ) : filtrados.length === 0 ? (
        <View style={styles.centrado}>
          <Text style={styles.vacio}>
            {inventario.length === 0
              ? 'Todavía no tienes productos asignados.'
              : 'Ningún producto coincide con la búsqueda.'}
          </Text>
        </View>
      ) : (
        <FlatList
          data={filtrados}
          keyExtractor={(item) => item.producto.id}
          numColumns={3}
          columnWrapperStyle={styles.filaGrilla}
          contentContainerStyle={styles.grilla}
          renderItem={({ item }) => (
            <TarjetaProductoInventario
              nombre={item.producto.nombre}
              precio={item.producto.precio}
              fotoUri={item.producto.fotoUri}
              saldo={item.saldo}
              colorAcento={COLORES.primario}
              onPress={() =>
                carrito.agregar({
                  id: item.producto.id,
                  nombre: item.producto.nombre,
                  precio: item.producto.precio,
                  fotoUri: item.producto.fotoUri,
                })
              }
            />
          )}
        />
      )}

      {carrito.cantidadTotal > 0 && (
        <Pressable style={styles.barraCobrar} onPress={() => setCobrarVisible(true)}>
          <Text style={styles.barraCobrarTexto}>Cobrar</Text>
          <Text style={styles.barraCobrarTotal}>{formatearPesos(carrito.total)}</Text>
        </Pressable>
      )}

      <TicketModal
        visible={ticketVisible}
        items={carrito.items}
        total={carrito.total}
        colorAcento={COLORES.primario}
        onQuitarUno={carrito.quitarUno}
        onVaciar={carrito.vaciar}
        onCerrar={() => setTicketVisible(false)}
        onCobrar={() => setCobrarVisible(true)}
      />

      <CobrarModal
        visible={cobrarVisible}
        total={carrito.total}
        colorAcento={COLORES.primario}
        procesando={procesandoVenta}
        onSeleccionar={cobrar}
        onCerrar={() => setCobrarVisible(false)}
      />

      <EscanerCodigoBarras
        visible={escanerVisible}
        colorAcento={COLORES.primario}
        titulo="Escanear producto"
        onCerrar={() => setEscanerVisible(false)}
        onDetectado={manejarCodigoEscaneado}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  contenedor: {
    flex: 1,
    backgroundColor: '#FFF8EC',
  },
  encabezado: {
    backgroundColor: COLORES.primario,
    paddingTop: 64,
    paddingHorizontal: 20,
    paddingBottom: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  saludo: {
    fontSize: 18,
    fontWeight: '700',
    color: '#3A2400',
  },
  cerrarSesion: {
    fontSize: 13,
    color: '#3A2400',
    textDecorationLine: 'underline',
  },
  barraAcciones: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 14,
  },
  busqueda: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    paddingHorizontal: 16,
    paddingVertical: 9,
    fontSize: 14,
    borderWidth: 1,
    borderColor: '#F0DDB8',
  },
  botonEscanear: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#F0DDB8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  botonEscanearTexto: {
    fontSize: 18,
  },
  botonTicket: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: COLORES.oscuro,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  botonTicketTexto: {
    color: '#FFF',
    fontSize: 13,
    fontWeight: '700',
  },
  botonTicketBadge: {
    backgroundColor: '#FFF',
    borderRadius: 9,
    minWidth: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  botonTicketBadgeTexto: {
    color: COLORES.oscuro,
    fontSize: 11,
    fontWeight: '800',
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
  grilla: {
    padding: 16,
    paddingBottom: 90,
    gap: 12,
  },
  filaGrilla: {
    gap: 12,
  },
  barraCobrar: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 20,
    backgroundColor: COLORES.oscuro,
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  barraCobrarTexto: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '700',
  },
  barraCobrarTotal: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '800',
  },
});
