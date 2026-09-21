import Ionicons from '@expo/vector-icons/Ionicons';
import * as Crypto from 'expo-crypto';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { getDb } from '@/db/client';
import { getDispositivoId } from '@/db/dispositivo';
import { guardarFotoSelfie } from '@/db/fotos';
import { iniciarTurno } from '@/db/turnos';
import { COLORES, TIPOGRAFIA_PROMOTOR } from '@/ui/colores';

interface Props {
  promotorId: string;
  onIniciado: () => void;
  onCerrarSesion: () => void;
}

// getCurrentPositionAsync puede colgarse sin resolver ni rechazar cuando
// la señal GPS es débil (típico dentro de un edificio, ver CLAUDE.md
// sección 5) — sin tope, el botón queda "procesando" para siempre.
const TIMEOUT_UBICACION_MS = 15000;

/**
 * Check-in físico del día: selfie + ubicación, ambos obligatorios (sin
 * ellos no se puede vender). El id del turno se genera aquí (R3) porque la
 * selfie se guarda con ese id antes de insertar el turno.
 */
export function PantallaIniciarTurno({ promotorId, onIniciado, onCerrarSesion }: Props) {
  const [procesando, setProcesando] = useState(false);

  async function iniciar() {
    setProcesando(true);
    try {
      const permisoCamara = await ImagePicker.requestCameraPermissionsAsync();
      if (!permisoCamara.granted) {
        Alert.alert('Falta permiso de cámara', 'Necesitas dar permiso de cámara para tomarte la selfie de inicio.');
        return;
      }
      const permisoUbicacion = await Location.requestForegroundPermissionsAsync();
      if (!permisoUbicacion.granted) {
        Alert.alert('Falta permiso de ubicación', 'Necesitas dar permiso de ubicación para iniciar tu turno.');
        return;
      }

      const foto = await ImagePicker.launchCameraAsync({
        mediaTypes: 'images',
        quality: 0.6,
        cameraType: ImagePicker.CameraType.front,
      });
      if (foto.canceled || !foto.assets[0]) return;

      let ubicacion: { coords: { latitude: number; longitude: number } };
      try {
        ubicacion = await Promise.race([
          Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('timeout')), TIMEOUT_UBICACION_MS)
          ),
        ]);
      } catch {
        Alert.alert(
          'No se pudo obtener tu ubicación',
          'Verifica que el GPS esté activado, sal a un lugar con mejor señal, e intenta de nuevo.'
        );
        return;
      }

      try {
        const turnoId = Crypto.randomUUID();
        const selfieUri = await guardarFotoSelfie(foto.assets[0].uri, turnoId);

        const db = await getDb();
        const dispositivoId = await getDispositivoId(db);
        await iniciarTurno(
          db,
          {
            promotorId,
            selfieUri,
            latitud: ubicacion.coords.latitude,
            longitud: ubicacion.coords.longitude,
          },
          dispositivoId
        );
        onIniciado();
      } catch (error) {
        Alert.alert(
          'No se pudo iniciar el turno',
          error instanceof Error ? error.message : 'Ocurrió un error inesperado. Intenta de nuevo.'
        );
      }
    } finally {
      setProcesando(false);
    }
  }

  return (
    <View style={styles.contenedor}>
      <View style={styles.encabezadoAcciones}>
        <Pressable
          onPress={() => router.push('/promotor/calendario')}
          accessibilityRole="button"
          accessibilityLabel="Ver mi calendario"
        >
          <Text style={styles.enlace}>Mi calendario</Text>
        </Pressable>
        <Pressable onPress={onCerrarSesion} accessibilityRole="button" accessibilityLabel="Cerrar sesión">
          <Text style={styles.enlace}>Cerrar sesión</Text>
        </Pressable>
      </View>

      <View style={styles.tarjeta}>
        <View style={styles.icono}>
          <Ionicons name="camera-outline" size={36} color={COLORES.primario} />
        </View>
        <Text style={styles.titulo}>Inicia tu turno</Text>
        <Text style={styles.texto}>
          Tómate una selfie para confirmar que empiezas tu jornada. Se guarda con la hora exacta y tu
          ubicación.
        </Text>

        {procesando ? (
          <ActivityIndicator size="large" color={COLORES.primario} style={styles.cargando} />
        ) : (
          <Pressable
            style={styles.boton}
            onPress={iniciar}
            accessibilityRole="button"
            accessibilityLabel="Tomar selfie e iniciar turno"
          >
            <Ionicons name="camera" size={20} color="#FFFFFF" />
            <Text style={styles.botonTexto}>Tomar selfie e iniciar turno</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  contenedor: {
    flex: 1,
    backgroundColor: COLORES.fondo,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  encabezadoAcciones: {
    position: 'absolute',
    top: 56,
    right: 20,
    flexDirection: 'row',
    gap: 16,
  },
  enlace: {
    fontSize: 13,
    fontFamily: TIPOGRAFIA_PROMOTOR.semiNegrita,
    color: COLORES.oscuro,
    textDecorationLine: 'underline',
  },
  tarjeta: {
    backgroundColor: COLORES.superficie,
    borderRadius: 20,
    padding: 28,
    alignItems: 'center',
    gap: 12,
    width: '100%',
    maxWidth: 360,
  },
  icono: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#FFF1D8',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  titulo: {
    fontSize: 18,
    fontFamily: TIPOGRAFIA_PROMOTOR.negrita,
    color: COLORES.textoSobreOscuro,
  },
  texto: {
    fontSize: 13,
    fontFamily: TIPOGRAFIA_PROMOTOR.regular,
    color: COLORES.textoSecundario,
    textAlign: 'center',
    lineHeight: 19,
  },
  cargando: {
    marginTop: 12,
  },
  boton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: COLORES.oscuro,
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 24,
    marginTop: 8,
  },
  botonTexto: {
    color: '#FFFFFF',
    fontSize: 15,
    fontFamily: TIPOGRAFIA_PROMOTOR.negrita,
  },
});
