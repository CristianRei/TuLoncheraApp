import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import type { MensajeRecibido } from '@/core/tipos';
import { getDb } from '@/db/client';
import { descargarMensajesNuevos, listarMensajesRecibidos, marcarMensajeLeido } from '@/db/mensajes';
import { ContenedorAncho } from '@/ui/ContenedorAncho';
import { Encabezado } from '@/ui/Encabezado';
import { EmptyState } from '@/ui/EmptyState';
import { ANCHO_ADMIN, COLORES_ADMIN, ESPACIADO_ADMIN, RADII_ADMIN, TEXTO_ADMIN } from '@/ui/tema';
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
      <Encabezado titulo="Notificaciones" rutaVolverTexto="Bodega" anchoMaximo={ANCHO_ADMIN.lista} sinMenuLateral />

      {cargando ? (
        <View style={styles.centrado}>
          <ActivityIndicator size="large" color={COLORES_ADMIN.vino} />
        </View>
      ) : mensajes.length === 0 ? (
        <EmptyState icono="notifications-outline" mensaje="Todavía no tienes notificaciones." />
      ) : (
        <ContenedorAncho anchoMaximo={ANCHO_ADMIN.lista} llenarAlto>
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
  contenedor: { flex: 1, backgroundColor: COLORES_ADMIN.background },
  centrado: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: ESPACIADO_ADMIN.xxl },
  lista: { padding: ESPACIADO_ADMIN.xl, gap: ESPACIADO_ADMIN.sm },
  tarjeta: {
    flexDirection: 'row',
    backgroundColor: COLORES_ADMIN.superficieMasBaja,
    borderWidth: 1,
    borderColor: COLORES_ADMIN.bordeSuave,
    borderRadius: RADII_ADMIN.md,
    padding: ESPACIADO_ADMIN.lg,
    gap: ESPACIADO_ADMIN.sm,
  },
  tarjetaNoLeida: { backgroundColor: COLORES_ADMIN.superficieBaja, borderColor: COLORES_ADMIN.vino },
  punto: { width: 8, height: 8, borderRadius: 4, backgroundColor: COLORES_ADMIN.vino, marginTop: 6 },
  tarjetaTexto: { flex: 1, gap: ESPACIADO_ADMIN.xs },
  tarjetaRemitente: { ...TEXTO_ADMIN.etiqueta, color: COLORES_ADMIN.vino },
  tarjetaCuerpo: TEXTO_ADMIN.cuerpo,
  tarjetaFecha: TEXTO_ADMIN.datoSecundario,
});
