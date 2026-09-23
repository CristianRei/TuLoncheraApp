import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import type { MensajeRecibido } from '@/core/tipos';
import { getDb } from '@/db/client';
import { descargarMensajesNuevos, listarMensajesRecibidos, marcarMensajeLeido } from '@/db/mensajes';
import { COLORES, TIPOGRAFIA_PROMOTOR } from '@/ui/colores';
import { useRequiereSesion } from '@/ui/useRequiereSesion';

function formatearFechaHora(iso: string): string {
  return new Date(iso).toLocaleString('es-CO', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function NotificacionesPromotor() {
  const usuario = useRequiereSesion(['PROMOTOR']);
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
      <View style={styles.encabezado}>
        <Pressable onPress={() => router.back()} style={styles.botonIcono} accessibilityLabel="Volver">
          <Ionicons name="chevron-back" size={22} color={COLORES.textoSobreOscuro} />
        </Pressable>
        <Text style={styles.titulo}>Notificaciones</Text>
        <View style={styles.botonIcono} />
      </View>

      {cargando ? (
        <View style={styles.centrado}>
          <ActivityIndicator size="large" color={COLORES.primario} />
        </View>
      ) : mensajes.length === 0 ? (
        <View style={styles.centrado}>
          <Ionicons name="notifications-outline" size={32} color={COLORES.textoSecundario} />
          <Text style={styles.vacio}>Todavía no tienes notificaciones.</Text>
        </View>
      ) : (
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
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  contenedor: { flex: 1, backgroundColor: COLORES.fondo },
  encabezado: {
    backgroundColor: COLORES.primario,
    paddingTop: 64,
    paddingHorizontal: 12,
    paddingBottom: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  botonIcono: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  titulo: { fontSize: 17, fontFamily: TIPOGRAFIA_PROMOTOR.negrita, color: COLORES.textoSobreOscuro },
  centrado: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 10 },
  vacio: { fontSize: 14, fontFamily: TIPOGRAFIA_PROMOTOR.regular, color: COLORES.textoSecundario, textAlign: 'center' },
  lista: { padding: 16, gap: 10 },
  tarjeta: {
    flexDirection: 'row',
    backgroundColor: COLORES.superficie,
    borderRadius: 14,
    padding: 14,
    gap: 10,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  tarjetaNoLeida: { backgroundColor: '#FFF7E8' },
  punto: { width: 8, height: 8, borderRadius: 4, backgroundColor: COLORES.primario, marginTop: 6 },
  tarjetaTexto: { flex: 1, gap: 3 },
  tarjetaRemitente: { fontSize: 12, fontFamily: TIPOGRAFIA_PROMOTOR.semiNegrita, color: COLORES.oscuro },
  tarjetaCuerpo: { fontSize: 14, fontFamily: TIPOGRAFIA_PROMOTOR.regular, color: COLORES.textoSobreOscuro },
  tarjetaFecha: { fontSize: 11, fontFamily: TIPOGRAFIA_PROMOTOR.regular, color: COLORES.textoSecundario },
});
