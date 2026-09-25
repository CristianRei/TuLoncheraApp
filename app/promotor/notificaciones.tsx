import Ionicons from '@expo/vector-icons/Ionicons';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import type { MensajeRecibido } from '@/core/tipos';
import { getDb } from '@/db/client';
import { descargarMensajesNuevos, listarMensajesRecibidos, marcarMensajeLeido } from '@/db/mensajes';
import { EncabezadoPromotor } from '@/ui/EncabezadoPromotor';
import { COLORES, TIPOGRAFIA_PROMOTOR, TEXTO_PROMOTOR } from '@/ui/colores';
import { RADII_ADMIN } from '@/ui/tema';
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
      <EncabezadoPromotor titulo="Notificaciones" />

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
  centrado: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 10 },
  vacio: {
    ...TEXTO_PROMOTOR.cuerpoSecundario,
    textAlign: 'center',
  },
  lista: { padding: 16, gap: 10 },
  tarjeta: {
    flexDirection: 'row',
    backgroundColor: COLORES.superficie,
    borderRadius: RADII_ADMIN.md,
    padding: 14,
    gap: 10,
    borderWidth: 1,
    borderColor: COLORES.borde,
  },
  tarjetaNoLeida: { backgroundColor: COLORES.superficieBaja },
  punto: { width: 8, height: 8, borderRadius: 4, backgroundColor: COLORES.primario, marginTop: 6 },
  tarjetaTexto: { flex: 1, gap: 3 },
  tarjetaRemitente: { fontSize: 12, fontFamily: TIPOGRAFIA_PROMOTOR.semiNegrita, color: COLORES.oscuro },
  tarjetaCuerpo: {
    ...TEXTO_PROMOTOR.cuerpo,
    color: COLORES.textoSobreOscuro,
  },
  tarjetaFecha: {
    ...TEXTO_PROMOTOR.nota,
  },
});
