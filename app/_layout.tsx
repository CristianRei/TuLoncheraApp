import {
  HankenGrotesk_400Regular,
  HankenGrotesk_500Medium,
  HankenGrotesk_600SemiBold,
  HankenGrotesk_700Bold,
} from '@expo-google-fonts/hanken-grotesk';
import {
  JetBrainsMono_400Regular,
  JetBrainsMono_500Medium,
  JetBrainsMono_600SemiBold,
} from '@expo-google-fonts/jetbrains-mono';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { getDb } from '@/db/client';
import { getDispositivoId } from '@/db/dispositivo';
import { aplicarMigracionesPendientes } from '@/db/migraciones';
import { sembrarUsuariosDePrueba } from '@/db/seed';
import { sembrarDatosDemo } from '@/db/seedDemo';
import { sembrarInventarioDePrueba } from '@/db/seedInventario';
import { buscarUsuarioPorPin } from '@/db/usuarios';
import { SesionProvider } from '@/ui/SesionContext';

interface EstadoDb {
  listo: boolean;
  error?: string;
}

export default function RootLayout() {
  const [estado, setEstado] = useState<EstadoDb>({ listo: false });
  const [fuentesCargadas] = useFonts({
    HankenGrotesk_400Regular,
    HankenGrotesk_500Medium,
    HankenGrotesk_600SemiBold,
    HankenGrotesk_700Bold,
    JetBrainsMono_400Regular,
    JetBrainsMono_500Medium,
    JetBrainsMono_600SemiBold,
  });

  useEffect(() => {
    let cancelado = false;
    (async () => {
      try {
        const db = await getDb();
        await aplicarMigracionesPendientes(db);
        const dispositivoId = await getDispositivoId(db);
        if (__DEV__) {
          await sembrarUsuariosDePrueba(db, dispositivoId);
          const admin = await buscarUsuarioPorPin(db, '0000', ['ADMIN']);
          const promotor = await buscarUsuarioPorPin(db, '8509', ['PROMOTOR']);
          if (admin && promotor) {
            await sembrarInventarioDePrueba(db, admin.id, promotor.id, promotor.nombre, dispositivoId);
          }
          if (admin) {
            await sembrarDatosDemo(db, admin.id, dispositivoId);
          }
        }
        if (!cancelado) setEstado({ listo: true });
      } catch (error) {
        if (!cancelado) {
          setEstado({
            listo: false,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
    })();
    return () => {
      cancelado = true;
    };
  }, []);

  if (estado.error) {
    return (
      <View style={styles.centrado}>
        <Text style={styles.error}>No se pudo inicializar la base de datos</Text>
        <Text style={styles.errorDetalle}>{estado.error}</Text>
      </View>
    );
  }

  if (!estado.listo || !fuentesCargadas) {
    return (
      <View style={styles.centrado}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <SesionProvider>
      <Stack screenOptions={{ headerShown: false }} />
    </SesionProvider>
  );
}

const styles = StyleSheet.create({
  centrado: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  error: {
    fontSize: 16,
    fontWeight: '600',
    color: '#B00020',
    textAlign: 'center',
  },
  errorDetalle: {
    marginTop: 8,
    fontSize: 13,
    color: '#666',
    textAlign: 'center',
  },
});
