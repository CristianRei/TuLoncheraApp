import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import type { Producto } from '@/core/tipos';
import { getDb } from '@/db/client';
import { getDispositivoId } from '@/db/dispositivo';
import { registrarEntradaBodega } from '@/db/entradasBodega';
import { listarProductos } from '@/db/productos';
import { COLORES } from '@/ui/colores';
import { SelectorProductosConCantidad } from '@/ui/SelectorProductosConCantidad';
import { useRequiereSesion } from '@/ui/useRequiereSesion';

export default function EntradaBodega() {
  const usuario = useRequiereSesion(['ADMIN']);
  const [productos, setProductos] = useState<Producto[]>([]);
  const [cantidades, setCantidades] = useState<Record<string, number>>({});
  const [busqueda, setBusqueda] = useState('');
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    (async () => {
      const db = await getDb();
      setProductos(await listarProductos(db));
      setCargando(false);
    })();
  }, []);

  if (!usuario) return null;
  const usuarioActual = usuario;

  function cambiarCantidad(productoId: string, delta: number) {
    setCantidades((actual) => {
      const nueva = Math.max(0, (actual[productoId] ?? 0) + delta);
      return { ...actual, [productoId]: nueva };
    });
  }

  const totalUnidades = Object.values(cantidades).reduce((suma, c) => suma + c, 0);

  async function confirmar() {
    if (totalUnidades === 0) return;
    setGuardando(true);
    try {
      const db = await getDb();
      const dispositivoId = await getDispositivoId(db);
      const items = Object.entries(cantidades)
        .filter(([, cantidad]) => cantidad > 0)
        .map(([productoId, cantidad]) => ({ productoId, cantidad }));

      await registrarEntradaBodega(db, { adminId: usuarioActual.id, items }, dispositivoId);

      Alert.alert('Entrada registrada', 'El stock de bodega quedó actualizado.');
      router.back();
    } finally {
      setGuardando(false);
    }
  }

  return (
    <View style={styles.contenedor}>
      <View style={styles.encabezado}>
        <Pressable onPress={() => router.back()}>
          <Text style={styles.volver}>‹ Inventario</Text>
        </Pressable>
        <Text style={styles.titulo}>Agregar entrada</Text>
      </View>

      {cargando ? (
        <View style={styles.centrado}>
          <ActivityIndicator size="large" color={COLORES.oscuro} />
        </View>
      ) : (
        <>
          <SelectorProductosConCantidad
            productos={productos}
            cantidades={cantidades}
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
                  Confirmar entrada{totalUnidades > 0 ? ` (${totalUnidades} unidades)` : ''}
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
