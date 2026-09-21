import Ionicons from '@expo/vector-icons/Ionicons';
import * as Crypto from 'expo-crypto';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { getDb } from '@/db/client';
import { getDispositivoId } from '@/db/dispositivo';
import { guardarFotoSelfie } from '@/db/fotos';
import { iniciarTurno } from '@/db/turnos';
import { COLORES } from '@/ui/colores';

interface Props {
  promotorId: string;
  onIniciado: () => void;
}

/**
 * Check-in físico del día: selfie + ubicación, ambos obligatorios (sin
 * ellos no se puede vender). El id del turno se genera aquí (R3) porque la
 * selfie se guarda con ese id antes de insertar el turno.
 */
export function PantallaIniciarTurno({ promotorId, onIniciado }: Props) {
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

      let ubicacion: { coords: { latitude: number; longitude: number } } | null = null;
      try {
        ubicacion = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      } catch {
        Alert.alert('No se pudo obtener tu ubicación', 'Verifica que el GPS esté activado e intenta de nuevo.');
        return;
      }

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
    } finally {
      setProcesando(false);
    }
  }

  return (
    <View style={styles.contenedor}>
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
          <Pressable style={styles.boton} onPress={iniciar}>
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
    backgroundColor: '#FFF8EC',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  tarjeta: {
    backgroundColor: '#FFFFFF',
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
    fontWeight: '700',
    color: '#3A2400',
  },
  texto: {
    fontSize: 13,
    color: '#777',
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
    fontWeight: '700',
  },
});
