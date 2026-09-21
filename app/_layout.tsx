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
import NetInfo from '@react-native-community/netinfo';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { getDb } from '@/db/client';
import { getDispositivoId } from '@/db/dispositivo';
import { aplicarMigracionesPendientes } from '@/db/migraciones';
import { sembrarUsuariosDePrueba } from '@/db/seed';
import { sembrarDatosDemo } from '@/db/seedDemo';
import { reforzarStockBodega, sembrarInventarioDePrueba } from '@/db/seedInventario';
import { buscarUsuarioPorPin } from '@/db/usuarios';
import { drenarColaSync } from '@/sync/motor';
import { SesionProvider } from '@/ui/SesionContext';

// Sync periódica, no tiempo real (decisión ya tomada) — cada 2 minutos
// mientras la app está en foreground basta para "el admin ve datos con
// minutos de retraso, no segundos".
const INTERVALO_SYNC_MS = 2 * 60 * 1000;

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
            await reforzarStockBodega(db, admin.id, dispositivoId);
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

  // Motor de sincronización (turnos + comprobantes de transferencia, ver
  // docs/03-decisiones/0006-sincronizacion-turnos-comprobantes.md): corre
  // en background, disparado por conectividad y un intervalo simple. Nunca
  // bloquea el arranque ni ninguna operación de negocio (R5) — arranca solo
  // después de que la DB local ya está lista.
  useEffect(() => {
    if (!estado.listo) return;

    drenarColaSync();
    const cancelarNetInfo = NetInfo.addEventListener((red) => {
      if (red.isConnected && red.isInternetReachable !== false) {
        drenarColaSync();
      }
    });
    const intervalo = setInterval(drenarColaSync, INTERVALO_SYNC_MS);

    return () => {
      cancelarNetInfo();
      clearInterval(intervalo);
    };
  }, [estado.listo]);

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
