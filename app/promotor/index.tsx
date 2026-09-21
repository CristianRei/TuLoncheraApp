import Ionicons from '@expo/vector-icons/Ionicons';
import * as Crypto from 'expo-crypto';
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
import type { Evento, MetodoPago, Turno } from '@/core/tipos';
import { getDb } from '@/db/client';
import { getDispositivoId } from '@/db/dispositivo';
import { guardarFotoComprobante } from '@/db/fotos';
import { existeConteoHoy } from '@/db/conteos';
import { obtenerSaldoProducto, listarInventarioPromotor, type ItemInventario } from '@/db/inventario';
import { buscarProductoPorCodigoBarras } from '@/db/productos';
import { finalizarTurno, obtenerEventoDeHoyPromotor, obtenerTurnoAbiertoHoy } from '@/db/turnos';
import { registrarVenta, SinTurnoAbiertoError } from '@/db/ventas';
import { CobrarModal } from '@/ui/CobrarModal';
import { COLORES, TIPOGRAFIA_PROMOTOR } from '@/ui/colores';
import { EscanerCodigoBarras } from '@/ui/EscanerCodigoBarras';
import { PantallaIniciarTurno } from '@/ui/PantallaIniciarTurno';
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
  // undefined = todavía no se sabe; null = confirmado que no hay turno abierto hoy.
  const [turno, setTurno] = useState<Turno | null | undefined>(undefined);
  const [eventoHoy, setEventoHoy] = useState<Evento | null>(null);
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

  const cargarTurno = useCallback(async (promotorId: string) => {
    const db = await getDb();
    setTurno(await obtenerTurnoAbiertoHoy(db, promotorId));
    setEventoHoy(await obtenerEventoDeHoyPromotor(db, promotorId));
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (usuario) {
        cargarTurno(usuario.id);
        cargarInventario(usuario.id);
      }
    }, [usuario, cargarTurno, cargarInventario])
  );

  if (!usuario) return null;
  const usuarioActual = usuario;

  function salir() {
    cerrarSesion();
    router.replace('/');
  }

  if (turno === undefined) {
    return (
      <View style={[styles.contenedor, styles.centrado]}>
        <ActivityIndicator size="large" color={COLORES.primario} />
      </View>
    );
  }

  if (turno === null) {
    return (
      <PantallaIniciarTurno
        promotorId={usuarioActual.id}
        onIniciado={() => cargarTurno(usuarioActual.id)}
        onCerrarSesion={salir}
      />
    );
  }

  async function confirmarFinalizarTurno() {
    if (!turno) return;
    const db = await getDb();
    const yaConto = await existeConteoHoy(db, usuarioActual.id);

    Alert.alert(
      'Finalizar turno',
      yaConto
        ? '¿Seguro que quieres terminar tu turno de hoy?'
        : 'No has hecho tu conteo de cierre hoy. ¿Aun así quieres finalizar turno?',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Finalizar',
          style: 'destructive',
          onPress: async () => {
            setTicketVisible(false);
            setCobrarVisible(false);
            setEscanerVisible(false);
            await finalizarTurno(db, { turnoId: turno.id });
            await cargarTurno(usuarioActual.id);
          },
        },
      ]
    );
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

  function abrirCobrar() {
    // Ticket y Cobrar son Modal nativos separados — nunca deben quedar
    // visibles los dos a la vez (dos Modal de React Native apilados cuelga
    // los toques en Android, ver comentario en CobrarModal/TicketModal).
    setTicketVisible(false);
    setCobrarVisible(true);
  }

  async function cobrar(metodoPago: MetodoPago, comprobanteUriTemp?: string) {
    setProcesandoVenta(true);
    try {
      const db = await getDb();
      const dispositivoId = await getDispositivoId(db);

      // El id se genera aquí (R3) porque el comprobante necesita guardarse
      // con el id final de la venta antes de insertarla.
      const ventaId = Crypto.randomUUID();
      const comprobanteUri = comprobanteUriTemp
        ? await guardarFotoComprobante(comprobanteUriTemp, ventaId)
        : null;

      try {
        await registrarVenta(
          db,
          {
            id: ventaId,
            promotorId: usuarioActual.id,
            promotorNombre: usuarioActual.nombre,
            metodoPago,
            comprobanteUri,
            items: carrito.items.map((item) => ({
              productoId: item.productoId,
              productoNombre: item.nombre,
              cantidad: item.cantidad,
              precioUnitario: item.precio,
            })),
          },
          dispositivoId
        );
      } catch (error) {
        if (error instanceof SinTurnoAbiertoError) {
          setCobrarVisible(false);
          setTicketVisible(false);
          setEscanerVisible(false);
          await cargarTurno(usuarioActual.id);
          Alert.alert('Turno finalizado', error.message);
          return;
        }
        throw error;
      }
      carrito.vaciar();
      setCobrarVisible(false);
      setTicketVisible(false);
      await cargarInventario(usuarioActual.id);
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
        <View style={styles.encabezadoTexto}>
          <Text style={styles.saludo}>Hola, {usuario.nombre}</Text>
          {eventoHoy && (
            <View style={styles.chipEvento}>
              <Ionicons name="location-outline" size={12} color={COLORES.textoSobreOscuro} />
              <Text style={styles.chipEventoTexto} numberOfLines={1}>
                {eventoHoy.empresaNombre} · {eventoHoy.puntoNombre}
              </Text>
            </View>
          )}
        </View>
        <Pressable
          style={styles.botonMenu}
          onPress={() => setMenuVisible(true)}
          accessibilityRole="button"
          accessibilityLabel="Abrir menú"
        >
          <Ionicons name="menu-outline" size={24} color={COLORES.textoSobreOscuro} />
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
            <Pressable
              style={styles.opcionMenu}
              onPress={() => {
                setMenuVisible(false);
                confirmarFinalizarTurno();
              }}
            >
              <Ionicons name="exit-outline" size={20} color={COLORES.oscuro} />
              <Text style={styles.opcionMenuTexto}>Finalizar turno</Text>
            </Pressable>
            <View style={styles.separadorMenu} />
            <Pressable
              style={styles.opcionMenu}
              onPress={() => {
                setMenuVisible(false);
                salir();
              }}
            >
              <Ionicons name="log-out-outline" size={20} color={COLORES.error} />
              <Text style={[styles.opcionMenuTexto, styles.opcionMenuTextoSalir]}>Cerrar sesión</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>

      <View style={styles.barraAcciones}>
        <TextInput
          style={styles.busqueda}
          placeholder="Buscar producto..."
          placeholderTextColor={COLORES.textoSecundario}
          value={busqueda}
          onChangeText={setBusqueda}
        />
        <Pressable
          style={styles.botonEscanear}
          onPress={() => setEscanerVisible(true)}
          accessibilityRole="button"
          accessibilityLabel="Escanear código de barras"
        >
          <Ionicons name="camera-outline" size={20} color={COLORES.oscuro} />
        </Pressable>
        <Pressable
          style={styles.botonTicket}
          onPress={() => setTicketVisible(true)}
          accessibilityRole="button"
          accessibilityLabel="Ver ticket"
        >
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
        <Pressable
          style={styles.barraCobrar}
          onPress={abrirCobrar}
          accessibilityRole="button"
          accessibilityLabel={`Cobrar ${formatearPesos(carrito.total)}`}
        >
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
        onCobrar={abrirCobrar}
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
            <Pressable
              style={styles.barraCobrarEscaner}
              onPress={abrirCobrar}
              accessibilityRole="button"
              accessibilityLabel={`Cobrar ${formatearPesos(carrito.total)}`}
            >
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
              onCobrar={abrirCobrar}
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
    backgroundColor: COLORES.fondo,
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
  encabezadoTexto: {
    flex: 1,
    gap: 4,
    marginRight: 12,
  },
  saludo: {
    fontSize: 18,
    fontFamily: TIPOGRAFIA_PROMOTOR.negrita,
    color: COLORES.textoSobreOscuro,
  },
  chipEvento: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255,255,255,0.35)',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    maxWidth: '100%',
  },
  chipEventoTexto: {
    fontSize: 12,
    fontFamily: TIPOGRAFIA_PROMOTOR.medio,
    color: COLORES.textoSobreOscuro,
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
    backgroundColor: COLORES.superficie,
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
    fontFamily: TIPOGRAFIA_PROMOTOR.semiNegrita,
    color: COLORES.textoSobreOscuro,
  },
  opcionMenuTextoSalir: {
    color: COLORES.error,
  },
  separadorMenu: {
    height: 1,
    backgroundColor: COLORES.borde,
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
    backgroundColor: COLORES.superficie,
    borderRadius: 22,
    paddingHorizontal: 16,
    paddingVertical: 9,
    fontSize: 14,
    fontFamily: TIPOGRAFIA_PROMOTOR.regular,
    borderWidth: 1,
    borderColor: COLORES.borde,
  },
  botonEscanear: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORES.superficie,
    borderWidth: 1,
    borderColor: COLORES.borde,
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
    fontFamily: TIPOGRAFIA_PROMOTOR.negrita,
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
    fontFamily: TIPOGRAFIA_PROMOTOR.negrita,
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
    fontFamily: TIPOGRAFIA_PROMOTOR.negrita,
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
    fontFamily: TIPOGRAFIA_PROMOTOR.regular,
    color: COLORES.textoSecundario,
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
    fontFamily: TIPOGRAFIA_PROMOTOR.negrita,
  },
  barraCobrarTotal: {
    color: '#FFF',
    fontSize: 18,
    fontFamily: TIPOGRAFIA_PROMOTOR.monoSemiNegrita,
  },
});
