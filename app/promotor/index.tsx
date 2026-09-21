import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
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
  const [avisoEscaner, setAvisoEscaner] = useState<string | null>(null);
  const [menuVisible, setMenuVisible] = useState(false);
  const avisoTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  function mostrarAvisoEscaner(texto: string) {
    if (avisoTimeout.current) clearTimeout(avisoTimeout.current);
    setAvisoEscaner(texto);
    avisoTimeout.current = setTimeout(() => setAvisoEscaner(null), 1300);
  }

  async function manejarCodigoEscaneado(codigo: string) {
    const db = await getDb();
    const producto = await buscarProductoPorCodigoBarras(db, codigo);
    if (!producto) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert('Código no reconocido', 'Ningún producto del catálogo tiene ese código.');
      return;
    }
    const saldo = await obtenerSaldoProducto(db, usuarioActual.id, producto.id);
    if (saldo <= 0) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert('Sin inventario', `No tienes "${producto.nombre}" en tu inventario.`);
      return;
    }
    if (agregarAlCarritoConTope(producto, saldo)) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      mostrarAvisoEscaner(`✓ Agregado: ${producto.nombre}`);
    }
  }

  function agregarAlCarritoConTope(
    producto: { id: string; nombre: string; precio: number; fotoUri: string | null },
    saldo: number
  ): boolean {
    const enCarrito = carrito.items.find((item) => item.productoId === producto.id)?.cantidad ?? 0;
    if (enCarrito >= saldo) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert('Sin inventario', `No tienes más "${producto.nombre}" disponible.`);
      return false;
    }
    carrito.agregar({
      id: producto.id,
      nombre: producto.nombre,
      precio: producto.precio,
      fotoUri: producto.fotoUri,
    });
    return true;
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
        <Pressable style={styles.botonMenu} onPress={() => setMenuVisible(true)}>
          <Ionicons name="menu-outline" size={24} color="#3A2400" />
        </Pressable>
      </View>

      <Modal visible={menuVisible} animationType="fade" transparent onRequestClose={() => setMenuVisible(false)}>
        <Pressable style={styles.fondoMenu} onPress={() => setMenuVisible(false)}>
          <View style={styles.tarjetaMenu}>
            <Pressable
              style={styles.opcionMenu}
              onPress={() => {
                setMenuVisible(false);
                router.push('/promotor/calendario');
              }}
            >
              <Ionicons name="calendar-outline" size={20} color={COLORES.oscuro} />
              <Text style={styles.opcionMenuTexto}>Mi calendario</Text>
            </Pressable>
            <Pressable
              style={styles.opcionMenu}
              onPress={() => {
                setMenuVisible(false);
                router.push('/promotor/conteo-cierre');
              }}
            >
              <Ionicons name="clipboard-outline" size={20} color={COLORES.oscuro} />
              <Text style={styles.opcionMenuTexto}>Conteo de cierre</Text>
            </Pressable>
            <View style={styles.separadorMenu} />
            <Pressable
              style={styles.opcionMenu}
              onPress={() => {
                setMenuVisible(false);
                salir();
              }}
            >
              <Ionicons name="log-out-outline" size={20} color="#B00020" />
              <Text style={[styles.opcionMenuTexto, styles.opcionMenuTextoSalir]}>Cerrar sesión</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>

      <View style={styles.barraAcciones}>
        <TextInput
          style={styles.busqueda}
          placeholder="Buscar producto..."
          placeholderTextColor="#999"
          value={busqueda}
          onChangeText={setBusqueda}
        />
        <Pressable style={styles.botonEscanear} onPress={() => setEscanerVisible(true)}>
          <Ionicons name="camera-outline" size={20} color={COLORES.oscuro} />
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
              onPress={() => agregarAlCarritoConTope(item.producto, item.saldo)}
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
        visible={ticketVisible && !escanerVisible}
        items={carrito.items}
        total={carrito.total}
        colorAcento={COLORES.primario}
        onQuitarUno={carrito.quitarUno}
        onVaciar={carrito.vaciar}
        onCerrar={() => setTicketVisible(false)}
        onCobrar={() => setCobrarVisible(true)}
      />

      <CobrarModal
        visible={cobrarVisible && !escanerVisible}
        total={carrito.total}
        colorAcento={COLORES.primario}
        procesando={procesandoVenta}
        onSeleccionar={cobrar}
        onCerrar={() => setCobrarVisible(false)}
      />

      <EscanerCodigoBarras
        visible={escanerVisible}
        activa={!ticketVisible && !cobrarVisible}
        colorAcento={COLORES.primario}
        titulo={avisoEscaner ?? 'Escanear producto'}
        onCerrar={() => setEscanerVisible(false)}
        onDetectado={manejarCodigoEscaneado}
        accionesHeaderExtra={
          <Pressable style={styles.botonTicketEscaner} onPress={() => setTicketVisible(true)}>
            <Text style={styles.botonTicketEscanerTexto}>Ticket</Text>
            {carrito.cantidadTotal > 0 && (
              <View style={styles.botonTicketBadge}>
                <Text style={styles.botonTicketBadgeTexto}>{carrito.cantidadTotal}</Text>
              </View>
            )}
          </Pressable>
        }
        piePersonalizado={
          carrito.cantidadTotal > 0 ? (
            <Pressable style={styles.barraCobrarEscaner} onPress={() => setCobrarVisible(true)}>
              <Text style={styles.barraCobrarTexto}>Cobrar</Text>
              <Text style={styles.barraCobrarTotal}>{formatearPesos(carrito.total)}</Text>
            </Pressable>
          ) : undefined
        }
        overlayEncimaDeCamara={
          <>
            <TicketModal
              variante="superpuesto"
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
              variante="superpuesto"
              visible={cobrarVisible}
              total={carrito.total}
              colorAcento={COLORES.primario}
              procesando={procesandoVenta}
              onSeleccionar={cobrar}
              onCerrar={() => setCobrarVisible(false)}
            />
          </>
        }
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
  botonMenu: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(255,255,255,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  fondoMenu: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    alignItems: 'flex-end',
  },
  tarjetaMenu: {
    marginTop: 108,
    marginRight: 16,
    minWidth: 220,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    paddingVertical: 8,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  opcionMenu: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 13,
  },
  opcionMenuTexto: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
  },
  opcionMenuTextoSalir: {
    color: '#B00020',
  },
  separadorMenu: {
    height: 1,
    backgroundColor: '#F0DDB8',
    marginVertical: 4,
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
  botonTicketEscaner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(0,0,0,0.4)',
    borderRadius: 21,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  botonTicketEscanerTexto: {
    color: '#FFF',
    fontSize: 13,
    fontWeight: '700',
  },
  barraCobrarEscaner: {
    backgroundColor: COLORES.oscuro,
    borderRadius: 16,
    paddingVertical: 16,
    paddingHorizontal: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
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
