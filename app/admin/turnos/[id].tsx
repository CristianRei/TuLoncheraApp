import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { Turno } from '@/core/tipos';
import { getDb } from '@/db/client';
import { obtenerTurno } from '@/db/turnos';
import { listarTurnosRemotos } from '@/db/turnosRemotos';
import { COLORES } from '@/ui/colores';
import { ContenedorAncho } from '@/ui/ContenedorAncho';
import { useRequiereSesion } from '@/ui/useRequiereSesion';

function formatearFecha(ts: string): string {
  return new Date(ts).toLocaleString('es-CO', { dateStyle: 'long', timeStyle: 'short' });
}

function urlGoogleMaps(latitud: number, longitud: number): string {
  return `https://www.google.com/maps?q=${latitud},${longitud}`;
}

function EnlaceUbicacion({ latitud, longitud }: { latitud: number; longitud: number }) {
  return (
    <Pressable onPress={() => Linking.openURL(urlGoogleMaps(latitud, longitud))}>
      <Text style={styles.resumenUbicacionLink}>
        Ver ubicación en Google Maps ({latitud.toFixed(5)}, {longitud.toFixed(5)})
      </Text>
    </Pressable>
  );
}

export default function DetalleTurno() {
  const usuario = useRequiereSesion(['ADMIN']);
  const { id } = useLocalSearchParams<{ id: string }>();
  const [turno, setTurno] = useState<Turno | null>(null);
  const [cargando, setCargando] = useState(true);
  const insets = useSafeAreaInsets();

  useEffect(() => {
    (async () => {
      const db = await getDb();
      const local = await obtenerTurno(db, id);
      if (local) {
        setTurno(local);
        setCargando(false);
        return;
      }
      // No está en este dispositivo — puede ser un turno originado en otro.
      try {
        const remotos = await listarTurnosRemotos();
        setTurno(remotos.find((t) => t.id === id) ?? null);
      } catch {
        setTurno(null);
      } finally {
        setCargando(false);
      }
    })();
  }, [id]);

  if (!usuario) return null;

  return (
    <View style={styles.contenedor}>
      <View style={[styles.encabezado, { paddingTop: insets.top + 20 }]}>
        <ContenedorAncho anchoMaximo={720} style={styles.encabezadoContenido}>
          <Pressable onPress={() => router.back()}>
            <Text style={styles.volver}>‹ Turnos</Text>
          </Pressable>
          <Text style={styles.titulo}>Detalle del turno</Text>
        </ContenedorAncho>
      </View>

      {cargando ? (
        <View style={styles.centrado}>
          <ActivityIndicator size="large" color={COLORES.oscuro} />
        </View>
      ) : !turno ? (
        <View style={styles.centrado}>
          <Text style={styles.vacio}>Este turno ya no existe.</Text>
        </View>
      ) : (
        <ContenedorAncho anchoMaximo={720} llenarAlto>
          <View style={styles.contenido}>
            <Image source={{ uri: turno.selfieUri }} style={styles.selfie} />

            <View style={styles.resumen}>
              <Text style={styles.resumenPromotor}>{turno.promotorNombre}</Text>
              <Text style={styles.resumenDetalle}>Inicio: {formatearFecha(turno.horaInicio)}</Text>
              <Text style={styles.resumenDetalle}>
                {turno.horaFin ? `Fin: ${formatearFecha(turno.horaFin)}` : 'Turno en curso'}
              </Text>
              {turno.latitud !== null && turno.longitud !== null ? (
                <EnlaceUbicacion latitud={turno.latitud} longitud={turno.longitud} />
              ) : (
                <Text style={styles.resumenDetalle}>Sin ubicación registrada</Text>
              )}
            </View>
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
  contenido: {
    padding: 20,
    gap: 16,
  },
  selfie: {
    width: '100%',
    height: 320,
    borderRadius: 16,
    backgroundColor: '#F0F0F0',
  },
  resumen: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 16,
    gap: 4,
  },
  resumenPromotor: {
    fontSize: 16,
    fontWeight: '700',
    color: '#333',
  },
  resumenDetalle: {
    fontSize: 13,
    color: '#777',
  },
  resumenUbicacionLink: {
    fontSize: 13,
    color: COLORES.oscuro,
    fontWeight: '600',
    textDecorationLine: 'underline',
  },
});
