import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { Cargue, Producto, UsuarioSesion } from '@/core/tipos';
import { crearCargue, listarCargues, StockInsuficienteError } from '@/db/cargues';
import { getDb } from '@/db/client';
import { getDispositivoId } from '@/db/dispositivo';
import { obtenerSaldosBodega } from '@/db/inventario';
import { listarProductos } from '@/db/productos';
import { listarPromotores } from '@/db/usuarios';
import { COLORES } from '@/ui/colores';
import { ContenedorAncho } from '@/ui/ContenedorAncho';
import { SelectorProductosConCantidad } from '@/ui/SelectorProductosConCantidad';
import { useEsPantallaAncha } from '@/ui/useEsPantallaAncha';
import { useRequiereSesion } from '@/ui/useRequiereSesion';

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
  const [pestana, setPestana] = useState<'nuevo' | 'planeados'>('nuevo');
  const [promotores, setPromotores] = useState<UsuarioSesion[]>([]);
  const [promotor, setPromotor] = useState<UsuarioSesion | null>(null);
  const [productos, setProductos] = useState<Producto[]>([]);
  const [disponibles, setDisponibles] = useState<Record<string, number>>({});
  const [cantidades, setCantidades] = useState<Record<string, number>>({});
  const [busqueda, setBusqueda] = useState('');
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [cargues, setCargues] = useState<Cargue[]>([]);
  const insets = useSafeAreaInsets();
  const anchaPantalla = useEsPantallaAncha();

  const cargarBase = useCallback(async () => {
    const db = await getDb();
    const [listaPromotores, listaProductos, saldosBodega, listaCargues] = await Promise.all([
      listarPromotores(db),
      listarProductos(db),
      obtenerSaldosBodega(db),
      listarCargues(db),
    ]);
    setPromotores(listaPromotores);
    setProductos(listaProductos);
    setDisponibles(Object.fromEntries(saldosBodega));
    setCargues(listaCargues);
    setCargando(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      cargarBase();
    }, [cargarBase])
  );

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

  return (
    <View style={styles.contenedor}>
      <View
        style={[
          anchaPantalla ? styles.encabezadoAncho : styles.encabezado,
          { paddingTop: anchaPantalla ? 20 : insets.top + 20 },
        ]}
      >
        <ContenedorAncho anchoMaximo={720} style={styles.encabezadoContenido}>
          {(!anchaPantalla || promotor) && (
            <Pressable onPress={() => (promotor ? setPromotor(null) : router.back())}>
              <Text style={anchaPantalla ? styles.volverAncho : styles.volver}>
                ‹ {promotor ? 'Elegir otro promotor' : 'Admin'}
              </Text>
            </Pressable>
          )}
          <Text style={anchaPantalla ? styles.tituloAncho : styles.titulo}>
            {promotor ? `Cargue para ${promotor.nombre}` : 'Cargue a promotor'}
          </Text>
        </ContenedorAncho>
      </View>

      {!promotor && (
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
      ) : cargues.length === 0 ? (
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
