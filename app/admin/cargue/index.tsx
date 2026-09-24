import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { Cargue, Producto, Traslado, UsuarioSesion } from '@/core/tipos';
import { crearCargue, listarCargues, StockInsuficienteError } from '@/db/cargues';
import { getDb } from '@/db/client';
import { getDispositivoId } from '@/db/dispositivo';
import { obtenerSaldosBodega, obtenerSaldosPromotor } from '@/db/inventario';
import { listarProductos } from '@/db/productos';
import {
  crearTraslado,
  listarTraslados,
  StockInsuficienteError as StockInsuficienteTrasladoError,
} from '@/db/traslados';
import { listarPromotores } from '@/db/usuarios';
import { COLORES } from '@/ui/colores';
import { ContenedorAncho } from '@/ui/ContenedorAncho';
import { SelectorProductosConCantidad } from '@/ui/SelectorProductosConCantidad';
import { useEsPantallaAncha } from '@/ui/useEsPantallaAncha';
import { useRequiereSesion } from '@/ui/useRequiereSesion';
import { useRecargarConDatosNuevos } from '@/ui/useVersionDatos';

const ETIQUETAS_ESTADO: Record<Cargue['estado'], string> = {
  PLANEADO: 'Planeado',
  ENTREGADO: 'Entregado',
  CANCELADO: 'Cancelado',
};

function formatearFecha(ts: string): string {
  return new Date(ts).toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' });
}

export default function PantallaCargue() {
  const usuario = useRequiereSesion(['ADMIN']);
  const [pestana, setPestana] = useState<'nuevo' | 'planeados' | 'traslado'>('nuevo');
  const [promotores, setPromotores] = useState<UsuarioSesion[]>([]);
  const [promotor, setPromotor] = useState<UsuarioSesion | null>(null);
  const [productos, setProductos] = useState<Producto[]>([]);
  const [disponibles, setDisponibles] = useState<Record<string, number>>({});
  const [cantidades, setCantidades] = useState<Record<string, number>>({});
  const [busqueda, setBusqueda] = useState('');
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [cargues, setCargues] = useState<Cargue[]>([]);

  // Traslado entre promotores: primero se elige origen, luego destino, y
  // recién ahí aparece el selector de productos (topado al inventario del
  // origen, nunca al de bodega) — mismo flujo de "elegir promotor" del
  // cargue normal, con un paso extra.
  const [promotorOrigen, setPromotorOrigen] = useState<UsuarioSesion | null>(null);
  const [promotorDestino, setPromotorDestino] = useState<UsuarioSesion | null>(null);
  const [disponiblesOrigen, setDisponiblesOrigen] = useState<Record<string, number>>({});
  const [cantidadesTraslado, setCantidadesTraslado] = useState<Record<string, number>>({});
  const [busquedaTraslado, setBusquedaTraslado] = useState('');
  const [guardandoTraslado, setGuardandoTraslado] = useState(false);
  const [traslados, setTraslados] = useState<Traslado[]>([]);

  const insets = useSafeAreaInsets();
  const anchaPantalla = useEsPantallaAncha();

  const cargarBase = useCallback(async () => {
    const db = await getDb();
    const [listaPromotores, listaProductos, saldosBodega, listaCargues, listaTraslados] = await Promise.all([
      listarPromotores(db),
      listarProductos(db),
      obtenerSaldosBodega(db),
      listarCargues(db),
      listarTraslados(db),
    ]);
    setPromotores(listaPromotores);
    setProductos(listaProductos);
    setDisponibles(Object.fromEntries(saldosBodega));
    setCargues(listaCargues);
    setTraslados(listaTraslados);
    setCargando(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      cargarBase();
    }, [cargarBase])
  );
  useRecargarConDatosNuevos(cargarBase);

  if (!usuario) return null;
  const usuarioActual = usuario;

  function cambiarCantidad(productoId: string, delta: number) {
    setCantidades((actual) => {
      const disponible = disponibles[productoId] ?? 0;
      const nueva = Math.min(disponible, Math.max(0, (actual[productoId] ?? 0) + delta));
      return { ...actual, [productoId]: nueva };
    });
  }

  const totalUnidades = Object.values(cantidades).reduce((suma, c) => suma + c, 0);

  async function confirmar() {
    if (!promotor || totalUnidades === 0) return;
    setGuardando(true);
    try {
      const db = await getDb();
      const dispositivoId = await getDispositivoId(db);
      const items = Object.entries(cantidades)
        .filter(([, cantidad]) => cantidad > 0)
        .map(([productoId, cantidad]) => ({ productoId, cantidad }));

      await crearCargue(
        db,
        {
          promotorId: promotor.id,
          promotorNombre: promotor.nombre,
          items,
          creadoPor: usuarioActual.id,
        },
        dispositivoId
      );

      Alert.alert('Cargue planeado', `Bodega ya puede entregarle el cargue a ${promotor.nombre}.`);
      setCantidades({});
      setPromotor(null);
      await cargarBase();
    } catch (error) {
      if (error instanceof StockInsuficienteError) {
        Alert.alert('Stock insuficiente', error.message);
      } else {
        throw error;
      }
    } finally {
      setGuardando(false);
    }
  }

  async function elegirPromotorOrigen(elegido: UsuarioSesion) {
    setPromotorOrigen(elegido);
    const db = await getDb();
    const saldos = await obtenerSaldosPromotor(db, elegido.id);
    setDisponiblesOrigen(Object.fromEntries(saldos));
  }

  function cerrarTraslado() {
    setPromotorOrigen(null);
    setPromotorDestino(null);
    setCantidadesTraslado({});
    setBusquedaTraslado('');
  }

  function cambiarCantidadTraslado(productoId: string, delta: number) {
    setCantidadesTraslado((actual) => {
      const disponible = disponiblesOrigen[productoId] ?? 0;
      const nueva = Math.min(disponible, Math.max(0, (actual[productoId] ?? 0) + delta));
      return { ...actual, [productoId]: nueva };
    });
  }

  const totalUnidadesTraslado = Object.values(cantidadesTraslado).reduce((suma, c) => suma + c, 0);

  async function confirmarTraslado() {
    if (!promotorOrigen || !promotorDestino || totalUnidadesTraslado === 0) return;
    setGuardandoTraslado(true);
    try {
      const db = await getDb();
      const dispositivoId = await getDispositivoId(db);
      const items = Object.entries(cantidadesTraslado)
        .filter(([, cantidad]) => cantidad > 0)
        .map(([productoId, cantidad]) => ({ productoId, cantidad }));

      await crearTraslado(
        db,
        {
          promotorOrigenId: promotorOrigen.id,
          promotorOrigenNombre: promotorOrigen.nombre,
          promotorDestinoId: promotorDestino.id,
          promotorDestinoNombre: promotorDestino.nombre,
          items,
          creadoPor: usuarioActual.id,
        },
        dispositivoId
      );

      Alert.alert(
        'Traslado planeado',
        `Bodega ya puede confirmar el traslado de ${promotorOrigen.nombre} a ${promotorDestino.nombre}.`
      );
      cerrarTraslado();
      await cargarBase();
    } catch (error) {
      if (error instanceof StockInsuficienteTrasladoError) {
        Alert.alert('Stock insuficiente', error.message);
      } else {
        throw error;
      }
    } finally {
      setGuardandoTraslado(false);
    }
  }

  return (
    <View style={styles.contenedor}>
      <View
        style={[
          anchaPantalla ? styles.encabezadoAncho : styles.encabezado,
          { paddingTop: anchaPantalla ? 20 : insets.top + 20 },
        ]}
      >
        <ContenedorAncho anchoMaximo={720} style={styles.encabezadoContenido}>
          {(!anchaPantalla || promotor || promotorOrigen) && (
            <Pressable
              onPress={() => {
                if (promotor) setPromotor(null);
                else if (promotorDestino) setPromotorDestino(null);
                else if (promotorOrigen) cerrarTraslado();
                else router.back();
              }}
            >
              <Text style={anchaPantalla ? styles.volverAncho : styles.volver}>
                ‹{' '}
                {promotor
                  ? 'Elegir otro promotor'
                  : promotorDestino
                    ? 'Elegir otro destino'
                    : promotorOrigen
                      ? 'Elegir otro origen'
                      : 'Admin'}
              </Text>
            </Pressable>
          )}
          <Text style={anchaPantalla ? styles.tituloAncho : styles.titulo}>
            {promotor
              ? `Cargue para ${promotor.nombre}`
              : promotorOrigen && promotorDestino
                ? `Traslado de ${promotorOrigen.nombre} a ${promotorDestino.nombre}`
                : promotorOrigen
                  ? `Traslado desde ${promotorOrigen.nombre}`
                  : 'Cargue a promotor'}
          </Text>
        </ContenedorAncho>
      </View>

      {!promotor && !promotorOrigen && (
        <ContenedorAncho anchoMaximo={720}>
          <View style={styles.pestanas}>
            <Pressable
              style={[styles.pestana, pestana === 'nuevo' && styles.pestanaActiva]}
              onPress={() => setPestana('nuevo')}
            >
              <Text style={[styles.pestanaTexto, pestana === 'nuevo' && styles.pestanaTextoActiva]}>
                Nuevo cargue
              </Text>
            </Pressable>
            <Pressable
              style={[styles.pestana, pestana === 'planeados' && styles.pestanaActiva]}
              onPress={() => setPestana('planeados')}
            >
              <Text style={[styles.pestanaTexto, pestana === 'planeados' && styles.pestanaTextoActiva]}>
                Cargues planeados
              </Text>
            </Pressable>
            <Pressable
              style={[styles.pestana, pestana === 'traslado' && styles.pestanaActiva]}
              onPress={() => setPestana('traslado')}
            >
              <Text style={[styles.pestanaTexto, pestana === 'traslado' && styles.pestanaTextoActiva]}>
                Traslado entre promotores
              </Text>
            </Pressable>
          </View>
        </ContenedorAncho>
      )}

      {cargando ? (
        <View style={styles.centrado}>
          <ActivityIndicator size="large" color={COLORES.oscuro} />
        </View>
      ) : promotor ? (
        <ContenedorAncho anchoMaximo={720} llenarAlto>
          <SelectorProductosConCantidad
            productos={productos}
            cantidades={cantidades}
            disponibles={disponibles}
            onCambiarCantidad={cambiarCantidad}
            busqueda={busqueda}
            onCambiarBusqueda={setBusqueda}
            colorAcento={COLORES.oscuro}
          />

          <View style={styles.pie}>
            <Pressable
              style={[
                styles.botonConfirmar,
                (totalUnidades === 0 || guardando) && styles.botonDeshabilitado,
              ]}
              disabled={totalUnidades === 0 || guardando}
              onPress={confirmar}
            >
              {guardando ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.botonConfirmarTexto}>
                  Planear cargue{totalUnidades > 0 ? ` (${totalUnidades} unidades)` : ''}
                </Text>
              )}
            </Pressable>
          </View>
        </ContenedorAncho>
      ) : promotorOrigen && promotorDestino ? (
        <ContenedorAncho anchoMaximo={720} llenarAlto>
          <SelectorProductosConCantidad
            productos={productos}
            cantidades={cantidadesTraslado}
            disponibles={disponiblesOrigen}
            onCambiarCantidad={cambiarCantidadTraslado}
            busqueda={busquedaTraslado}
            onCambiarBusqueda={setBusquedaTraslado}
            colorAcento={COLORES.oscuro}
          />

          <View style={styles.pie}>
            <Pressable
              style={[
                styles.botonConfirmar,
                (totalUnidadesTraslado === 0 || guardandoTraslado) && styles.botonDeshabilitado,
              ]}
              disabled={totalUnidadesTraslado === 0 || guardandoTraslado}
              onPress={confirmarTraslado}
            >
              {guardandoTraslado ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.botonConfirmarTexto}>
                  Planear traslado{totalUnidadesTraslado > 0 ? ` (${totalUnidadesTraslado} unidades)` : ''}
                </Text>
              )}
            </Pressable>
          </View>
        </ContenedorAncho>
      ) : promotorOrigen ? (
        <ContenedorAncho anchoMaximo={720} llenarAlto>
          <FlatList
            data={promotores.filter((p) => p.id !== promotorOrigen.id)}
            keyExtractor={(p) => p.id}
            contentContainerStyle={styles.lista}
            renderItem={({ item }) => (
              <Pressable style={styles.filaPromotor} onPress={() => setPromotorDestino(item)}>
                <Text style={styles.filaPromotorNombre}>{item.nombre}</Text>
                <Text style={styles.filaPromotorFlecha}>›</Text>
              </Pressable>
            )}
          />
        </ContenedorAncho>
      ) : pestana === 'nuevo' ? (
        promotores.length === 0 ? (
          <View style={styles.centrado}>
            <Text style={styles.vacio}>No hay promotores activos.</Text>
          </View>
        ) : (
          <ContenedorAncho anchoMaximo={720} llenarAlto>
            <FlatList
              data={promotores}
              keyExtractor={(p) => p.id}
              contentContainerStyle={styles.lista}
              renderItem={({ item }) => (
                <Pressable style={styles.filaPromotor} onPress={() => setPromotor(item)}>
                  <Text style={styles.filaPromotorNombre}>{item.nombre}</Text>
                  <Text style={styles.filaPromotorFlecha}>›</Text>
                </Pressable>
              )}
            />
          </ContenedorAncho>
        )
      ) : pestana === 'traslado' ? (
        promotores.length < 2 ? (
          <View style={styles.centrado}>
            <Text style={styles.vacio}>Hace falta al menos dos promotores activos para trasladar entre ellos.</Text>
          </View>
        ) : (
          <ContenedorAncho anchoMaximo={720} llenarAlto>
            <FlatList
              data={promotores}
              keyExtractor={(p) => p.id}
              contentContainerStyle={styles.lista}
              renderItem={({ item }) => (
                <Pressable style={styles.filaPromotor} onPress={() => elegirPromotorOrigen(item)}>
                  <Text style={styles.filaPromotorNombre}>{item.nombre}</Text>
                  <Text style={styles.filaPromotorFlecha}>›</Text>
                </Pressable>
              )}
            />
          </ContenedorAncho>
        )
      ) : pestana === 'planeados' ? (
        cargues.length === 0 ? (
          <View style={styles.centrado}>
            <Text style={styles.vacio}>Todavía no se ha planeado ningún cargue.</Text>
          </View>
        ) : (
          <ContenedorAncho anchoMaximo={720} llenarAlto>
            <FlatList
              data={cargues}
              keyExtractor={(c) => c.id}
              contentContainerStyle={styles.lista}
              renderItem={({ item }) => (
                <Pressable
                  style={styles.filaCargue}
                  onPress={() => router.push(`/admin/cargue/${item.id}`)}
                >
                  <View style={styles.filaCargueTexto}>
                    <Text style={styles.filaPromotorNombre}>{item.promotorNombre}</Text>
                    <Text style={styles.filaCargueDetalle}>{formatearFecha(item.tsCliente)}</Text>
                  </View>
                  <Text
                    style={[
                      styles.badgeEstado,
                      item.estado === 'ENTREGADO' && styles.badgeEstadoEntregado,
                    ]}
                  >
                    {ETIQUETAS_ESTADO[item.estado]}
                  </Text>
                  <Text style={styles.filaPromotorFlecha}>›</Text>
                </Pressable>
              )}
            />
          </ContenedorAncho>
        )
      ) : traslados.length === 0 ? (
        <View style={styles.centrado}>
          <Text style={styles.vacio}>Todavía no se ha planeado ningún traslado.</Text>
        </View>
      ) : (
        <ContenedorAncho anchoMaximo={720} llenarAlto>
          <FlatList
            data={traslados}
            keyExtractor={(t) => t.id}
            contentContainerStyle={styles.lista}
            renderItem={({ item }) => (
              <Pressable
                style={styles.filaCargue}
                onPress={() => router.push(`/admin/cargue/traslado/${item.id}`)}
              >
                <View style={styles.filaCargueTexto}>
                  <Text style={styles.filaPromotorNombre}>
                    {item.promotorOrigenNombre} → {item.promotorDestinoNombre}
                  </Text>
                  <Text style={styles.filaCargueDetalle}>{formatearFecha(item.tsCliente)}</Text>
                </View>
                <Text
                  style={[
                    styles.badgeEstado,
                    item.estado === 'ENTREGADO' && styles.badgeEstadoEntregado,
                  ]}
                >
                  {ETIQUETAS_ESTADO[item.estado]}
                </Text>
                <Text style={styles.filaPromotorFlecha}>›</Text>
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
  encabezadoAncho: {
    backgroundColor: 'transparent',
    paddingHorizontal: 20,
    paddingBottom: 16,
  },
  encabezadoContenido: {
    gap: 4,
  },
  volver: {
    color: '#FFFFFF',
    fontSize: 14,
    textDecorationLine: 'underline',
  },
  volverAncho: {
    color: COLORES.oscuro,
    fontSize: 14,
    textDecorationLine: 'underline',
  },
  titulo: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '700',
  },
  tituloAncho: {
    color: COLORES.oscuro,
    fontSize: 20,
    fontWeight: '700',
  },
  pestanas: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  pestana: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
  },
  pestanaActiva: {
    backgroundColor: COLORES.oscuro,
  },
  pestanaTexto: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORES.oscuro,
  },
  pestanaTextoActiva: {
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
  },
  lista: {
    padding: 20,
    gap: 10,
  },
  filaPromotor: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 16,
  },
  filaPromotorNombre: {
    fontSize: 15,
    fontWeight: '700',
    color: '#333',
  },
  filaPromotorFlecha: {
    fontSize: 20,
    color: COLORES.oscuro,
  },
  filaCargue: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 16,
    gap: 10,
  },
  filaCargueTexto: {
    flex: 1,
    gap: 2,
  },
  filaCargueDetalle: {
    fontSize: 12,
    color: '#888',
  },
  badgeEstado: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    color: '#976200',
  },
  badgeEstadoEntregado: {
    color: '#2E7D32',
  },
  pie: {
    padding: 20,
  },
  botonConfirmar: {
    backgroundColor: COLORES.oscuro,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  botonDeshabilitado: {
    opacity: 0.5,
  },
  botonConfirmarTexto: {
    color: '#FFF',
    fontSize: 15,
    fontWeight: '700',
  },
});
