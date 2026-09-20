import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { Descuento } from '@/core/tipos';
import { getDb } from '@/db/client';
import { desactivarDescuento, listarDescuentos } from '@/db/descuentos';
import { COLORES } from '@/ui/colores';
import { ContenedorAncho } from '@/ui/ContenedorAncho';
import { useRequiereSesion } from '@/ui/useRequiereSesion';

type Filtro = 'VIGENTES' | 'VENCIDOS';

function formatearFecha(iso: string): string {
  return new Date(iso).toLocaleDateString('es-CO', { dateStyle: 'medium' });
}

function describirValor(descuento: Descuento): string {
  return descuento.tipo === 'PORCENTAJE' ? `${descuento.valor}%` : `$ ${descuento.valor}`;
}

function describirAlcance(descuento: Descuento): string {
  const producto = descuento.productoNombre ?? 'Todos los productos';
  const punto = descuento.puntoNombre ?? 'Todos los puntos';
  return `${producto} · ${punto}`;
}

export default function Descuentos() {
  const usuario = useRequiereSesion(['ADMIN']);
  const [descuentos, setDescuentos] = useState<Descuento[]>([]);
  const [filtro, setFiltro] = useState<Filtro>('VIGENTES');
  const [cargando, setCargando] = useState(true);
  const insets = useSafeAreaInsets();

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const db = await getDb();
      setDescuentos(await listarDescuentos(db));
    } finally {
      setCargando(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      cargar();
    }, [cargar])
  );

  if (!usuario) return null;

  const ahora = new Date().toISOString();
  const filtrados = descuentos.filter((d) => {
    const vigente = d.activo && d.desde <= ahora && d.hasta >= ahora;
    return filtro === 'VIGENTES' ? vigente : !vigente;
  });

  async function desactivar(id: string) {
    Alert.alert('Desactivar descuento', 'Este descuento dejará de aplicarse de inmediato.', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Desactivar',
        style: 'destructive',
        onPress: async () => {
          const db = await getDb();
          await desactivarDescuento(db, id);
          await cargar();
        },
      },
    ]);
  }

  return (
    <View style={styles.contenedor}>
      <View style={[styles.encabezado, { paddingTop: insets.top + 20 }]}>
        <ContenedorAncho anchoMaximo={720}>
          <View style={styles.encabezadoFila}>
            <Pressable onPress={() => router.back()}>
              <Text style={styles.volver}>‹ Admin</Text>
            </Pressable>
            <Text style={styles.titulo}>Descuentos</Text>
            <Pressable onPress={() => router.push('/admin/descuentos/nuevo')}>
              <Text style={styles.agregar}>+ Nuevo</Text>
            </Pressable>
          </View>
        </ContenedorAncho>
      </View>

      <ContenedorAncho anchoMaximo={720}>
        <View style={styles.tabs}>
          <Pressable
            style={[styles.tab, filtro === 'VIGENTES' && styles.tabActivo]}
            onPress={() => setFiltro('VIGENTES')}
          >
            <Text style={[styles.tabTexto, filtro === 'VIGENTES' && styles.tabTextoActivo]}>
              Vigentes
            </Text>
          </Pressable>
          <Pressable
            style={[styles.tab, filtro === 'VENCIDOS' && styles.tabActivo]}
            onPress={() => setFiltro('VENCIDOS')}
          >
            <Text style={[styles.tabTexto, filtro === 'VENCIDOS' && styles.tabTextoActivo]}>
              Vencidos / inactivos
            </Text>
          </Pressable>
        </View>
      </ContenedorAncho>

      {cargando ? (
        <View style={styles.centrado}>
          <ActivityIndicator size="large" color={COLORES.oscuro} />
        </View>
      ) : filtrados.length === 0 ? (
        <View style={styles.centrado}>
          <Text style={styles.vacio}>
            {filtro === 'VIGENTES' ? 'No hay descuentos vigentes.' : 'No hay descuentos vencidos o inactivos.'}
          </Text>
        </View>
      ) : (
        <ContenedorAncho anchoMaximo={720} llenarAlto>
          <FlatList
            data={filtrados}
            keyExtractor={(d) => d.id}
            contentContainerStyle={styles.lista}
            renderItem={({ item }) => (
              <View style={styles.fila}>
                <View style={styles.filaTexto}>
                  <Text style={styles.filaValor}>{describirValor(item)}</Text>
                  <Text style={styles.filaAlcance}>{describirAlcance(item)}</Text>
                  <Text style={styles.filaVigencia}>
                    {formatearFecha(item.desde)} — {formatearFecha(item.hasta)}
                  </Text>
                </View>
                {filtro === 'VIGENTES' && (
                  <Pressable onPress={() => desactivar(item.id)}>
                    <Text style={styles.botonDesactivar}>Desactivar</Text>
                  </Pressable>
                )}
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
    fontSize: 17,
    fontWeight: '700',
  },
  agregar: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
    textDecorationLine: 'underline',
  },
  tabs: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  tab: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#EBD3D3',
  },
  tabActivo: {
    backgroundColor: COLORES.oscuro,
    borderColor: COLORES.oscuro,
  },
  tabTexto: {
    fontSize: 13,
    fontWeight: '600',
    color: '#666',
  },
  tabTextoActivo: {
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
    textAlign: 'center',
  },
  lista: {
    padding: 20,
    gap: 12,
  },
  fila: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 14,
    gap: 12,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  filaTexto: {
    flex: 1,
    gap: 2,
  },
  filaValor: {
    fontSize: 16,
    fontWeight: '800',
    color: COLORES.oscuro,
  },
  filaAlcance: {
    fontSize: 13,
    fontWeight: '600',
    color: '#333',
  },
  filaVigencia: {
    fontSize: 12,
    color: '#888',
  },
  botonDesactivar: {
    fontSize: 13,
    fontWeight: '700',
    color: '#B00020',
  },
});
