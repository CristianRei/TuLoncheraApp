import { router } from 'expo-router';
import { useEffect, useState } from 'react';
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
import type { Producto, UsuarioSesion } from '@/core/tipos';
import { registrarCargue } from '@/db/cargue';
import { getDb } from '@/db/client';
import { getDispositivoId } from '@/db/dispositivo';
import { listarProductos } from '@/db/productos';
import { listarPromotores } from '@/db/usuarios';
import { COLORES } from '@/ui/colores';
import { useRequiereSesion } from '@/ui/useRequiereSesion';

export default function Cargue() {
  const usuario = useRequiereSesion(['ADMIN']);
  const [promotores, setPromotores] = useState<UsuarioSesion[]>([]);
  const [promotor, setPromotor] = useState<UsuarioSesion | null>(null);
  const [productos, setProductos] = useState<Producto[]>([]);
  const [cantidades, setCantidades] = useState<Record<string, number>>({});
  const [busqueda, setBusqueda] = useState('');
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    (async () => {
      const db = await getDb();
      const [listaPromotores, listaProductos] = await Promise.all([
        listarPromotores(db),
        listarProductos(db),
      ]);
      setPromotores(listaPromotores);
      setProductos(listaProductos);
      setCargando(false);
    })();
  }, []);

  if (!usuario) return null;

  function cambiarCantidad(productoId: string, delta: number) {
    setCantidades((actual) => {
      const nueva = Math.max(0, (actual[productoId] ?? 0) + delta);
      return { ...actual, [productoId]: nueva };
    });
  }

  const totalUnidades = Object.values(cantidades).reduce((suma, c) => suma + c, 0);

  async function confirmar() {
    if (!promotor || totalUnidades === 0 || !usuario) return;
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
          adminId: usuario.id,
          items,
        },
        dispositivoId
      );

      Alert.alert('Cargue asignado', `Se le asignó el cargue a ${promotor.nombre}.`);
      setCantidades({});
      setPromotor(null);
    } finally {
      setGuardando(false);
    }
  }

  const filtrados = productos.filter((p) =>
    p.nombre.toLowerCase().includes(busqueda.trim().toLowerCase())
  );

  return (
    <View style={styles.contenedor}>
      <View style={styles.encabezado}>
        <Pressable onPress={() => (promotor ? setPromotor(null) : router.back())}>
          <Text style={styles.volver}>‹ {promotor ? 'Elegir otro promotor' : 'Admin'}</Text>
        </Pressable>
        <Text style={styles.titulo}>
          {promotor ? `Cargue para ${promotor.nombre}` : 'Cargue a promotor'}
        </Text>
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
        )
      ) : (
        <>
          <View style={styles.controles}>
            <TextInput
              style={styles.busqueda}
              placeholder="Buscar producto..."
              placeholderTextColor="#999"
              value={busqueda}
              onChangeText={setBusqueda}
            />
          </View>

          <FlatList
            data={filtrados}
            keyExtractor={(p) => p.id}
            contentContainerStyle={styles.lista}
            renderItem={({ item }) => {
              const cantidad = cantidades[item.id] ?? 0;
              return (
                <View style={styles.filaProducto}>
                  <View style={styles.filaProductoTexto}>
                    <Text style={styles.filaProductoNombre} numberOfLines={2}>
                      {item.nombre}
                    </Text>
                    <Text style={styles.filaProductoPrecio}>{formatearPesos(item.precio)}</Text>
                  </View>
                  <View style={styles.contador}>
                    <Pressable
                      style={styles.contadorBoton}
                      onPress={() => cambiarCantidad(item.id, -1)}
                    >
                      <Text style={styles.contadorBotonTexto}>−</Text>
                    </Pressable>
                    <Text style={styles.contadorValor}>{cantidad}</Text>
                    <Pressable
                      style={styles.contadorBoton}
                      onPress={() => cambiarCantidad(item.id, 1)}
                    >
                      <Text style={styles.contadorBotonTexto}>+</Text>
                    </Pressable>
                  </View>
                </View>
              );
            }}
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
        </>
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
    paddingTop: 64,
    paddingHorizontal: 20,
    paddingBottom: 16,
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
  controles: {
    paddingHorizontal: 20,
    paddingTop: 16,
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
  filaProducto: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 12,
    gap: 12,
  },
  filaProductoTexto: {
    flex: 1,
    gap: 2,
  },
  filaProductoNombre: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
  },
  filaProductoPrecio: {
    fontSize: 13,
    color: COLORES.oscuro,
    fontWeight: '600',
  },
  contador: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  contadorBoton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#F0F0F0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  contadorBotonTexto: {
    fontSize: 16,
    fontWeight: '700',
    color: '#555',
  },
  contadorValor: {
    fontSize: 15,
    fontWeight: '700',
    minWidth: 20,
    textAlign: 'center',
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
