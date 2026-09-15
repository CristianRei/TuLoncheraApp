import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { Producto, UsuarioSesion } from '@/core/tipos';
import { registrarCargue, StockInsuficienteError } from '@/db/cargue';
import { getDb } from '@/db/client';
import { getDispositivoId } from '@/db/dispositivo';
import { obtenerSaldosBodega } from '@/db/inventario';
import { listarProductos } from '@/db/productos';
import { listarPromotores } from '@/db/usuarios';
import { COLORES } from '@/ui/colores';
import { ContenedorAncho } from '@/ui/ContenedorAncho';
import { SelectorProductosConCantidad } from '@/ui/SelectorProductosConCantidad';
import { useRequiereSesion } from '@/ui/useRequiereSesion';

export default function Cargue() {
  const usuario = useRequiereSesion(['ADMIN']);
  const [promotores, setPromotores] = useState<UsuarioSesion[]>([]);
  const [promotor, setPromotor] = useState<UsuarioSesion | null>(null);
  const [productos, setProductos] = useState<Producto[]>([]);
  const [disponibles, setDisponibles] = useState<Record<string, number>>({});
  const [cantidades, setCantidades] = useState<Record<string, number>>({});
  const [busqueda, setBusqueda] = useState('');
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const insets = useSafeAreaInsets();

  useEffect(() => {
    (async () => {
      const db = await getDb();
      const [listaPromotores, listaProductos, saldosBodega] = await Promise.all([
        listarPromotores(db),
        listarProductos(db),
        obtenerSaldosBodega(db),
      ]);
      setPromotores(listaPromotores);
      setProductos(listaProductos);
      setDisponibles(Object.fromEntries(saldosBodega));
      setCargando(false);
    })();
  }, []);

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

      await registrarCargue(
        db,
        {
          promotorId: promotor.id,
          promotorNombre: promotor.nombre,
          adminId: usuarioActual.id,
          items,
        },
        dispositivoId
      );

      Alert.alert('Cargue asignado', `Se le asignó el cargue a ${promotor.nombre}.`);
      setCantidades({});
      setPromotor(null);
      setDisponibles(Object.fromEntries(await obtenerSaldosBodega(db)));
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
      <View style={[styles.encabezado, { paddingTop: insets.top + 20 }]}>
        <ContenedorAncho anchoMaximo={720} style={styles.encabezadoContenido}>
          <Pressable onPress={() => (promotor ? setPromotor(null) : router.back())}>
            <Text style={styles.volver}>‹ {promotor ? 'Elegir otro promotor' : 'Admin'}</Text>
          </Pressable>
          <Text style={styles.titulo}>
            {promotor ? `Cargue para ${promotor.nombre}` : 'Cargue a promotor'}
          </Text>
        </ContenedorAncho>
      </View>

      {cargando ? (
        <View style={styles.centrado}>
          <ActivityIndicator size="large" color={COLORES.oscuro} />
        </View>
      ) : !promotor ? (
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
      ) : (
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
                  Confirmar cargue{totalUnidades > 0 ? ` (${totalUnidades} unidades)` : ''}
                </Text>
              )}
            </Pressable>
          </View>
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
  encabezadoContenido: {
    gap: 4,
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
