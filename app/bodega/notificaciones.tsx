import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { MensajeRecibido } from '@/core/tipos';
import { getDb } from '@/db/client';
import { descargarMensajesNuevos, listarMensajesRecibidos, marcarMensajeLeido } from '@/db/mensajes';
import { COLORES } from '@/ui/colores';
import { ContenedorAncho } from '@/ui/ContenedorAncho';
import { useRequiereSesion } from '@/ui/useRequiereSesion';

function formatearFechaHora(iso: string): string {
  return new Date(iso).toLocaleString('es-CO', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function NotificacionesBodega() {
  const usuario = useRequiereSesion(['BODEGA']);
  const insets = useSafeAreaInsets();
  const [mensajes, setMensajes] = useState<MensajeRecibido[]>([]);
  const [cargando, setCargando] = useState(true);

  const cargar = useCallback(async (usuarioId: string) => {
    setCargando(true);
    try {
      const db = await getDb();
      await descargarMensajesNuevos(db, usuarioId);
      setMensajes(await listarMensajesRecibidos(db, usuarioId));
    } finally {
      setCargando(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (usuario) cargar(usuario.id);
    }, [usuario, cargar])
  );

  if (!usuario) return null;

  async function abrir(mensaje: MensajeRecibido) {
    if (!mensaje.leida && usuario) {
      const db = await getDb();
      await marcarMensajeLeido(db, mensaje.id, usuario.id);
      setMensajes((actual) => actual.map((m) => (m.id === mensaje.id ? { ...m, leida: true } : m)));
    }
  }

  return (
    <View style={styles.contenedor}>
      <View style={[styles.encabezado, { paddingTop: insets.top + 20 }]}>
        <ContenedorAncho anchoMaximo={640}>
          <View style={styles.encabezadoFila}>
            <Pressable onPress={() => router.back()}>
              <Text style={styles.volver}>‹ Bodega</Text>
            </Pressable>
            <Text style={styles.titulo}>Notificaciones</Text>
            <View style={{ width: 60 }} />
          </View>
        </ContenedorAncho>
      </View>

      {cargando ? (
        <View style={styles.centrado}>
          <ActivityIndicator size="large" color={COLORES.oscuro} />
        </View>
      ) : mensajes.length === 0 ? (
        <View style={styles.centrado}>
          <Ionicons name="notifications-outline" size={32} color="#BBB" />
          <Text style={styles.vacio}>Todavía no tienes notificaciones.</Text>
        </View>
      ) : (
        <ContenedorAncho anchoMaximo={640} llenarAlto>
          <FlatList
            data={mensajes}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.lista}
            renderItem={({ item }) => (
              <Pressable style={[styles.tarjeta, !item.leida && styles.tarjetaNoLeida]} onPress={() => abrir(item)}>
                {!item.leida && <View style={styles.punto} />}
                <View style={styles.tarjetaTexto}>
                  <Text style={styles.tarjetaRemitente}>{item.remitenteNombre}</Text>
                  <Text style={styles.tarjetaCuerpo}>{item.cuerpo}</Text>
                  <Text style={styles.tarjetaFecha}>{formatearFechaHora(item.tsCliente)}</Text>
                </View>
              </Pressable>
            )}
          />
        </ContenedorAncho>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  contenedor: { flex: 1, backgroundColor: '#FBEDED' },
  encabezado: { backgroundColor: COLORES.oscuro, paddingHorizontal: 20, paddingBottom: 16 },
  encabezadoFila: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  volver: { fontSize: 13, color: '#FFFFFF', textDecorationLine: 'underline' },
  titulo: { fontSize: 17, fontWeight: '700', color: '#FFFFFF' },
  centrado: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 10 },
  vacio: { fontSize: 14, color: '#888', textAlign: 'center' },
  lista: { padding: 20, gap: 10 },
  tarjeta: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 14,
    gap: 10,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  tarjetaNoLeida: { backgroundColor: '#FFF3F3' },
  punto: { width: 8, height: 8, borderRadius: 4, backgroundColor: COLORES.oscuro, marginTop: 6 },
  tarjetaTexto: { flex: 1, gap: 3 },
  tarjetaRemitente: { fontSize: 12, fontWeight: '700', color: COLORES.oscuro },
  tarjetaCuerpo: { fontSize: 14, color: '#333' },
  tarjetaFecha: { fontSize: 11, color: '#999' },
});
