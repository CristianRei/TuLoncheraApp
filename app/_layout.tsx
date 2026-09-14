import { Stack } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { getDb } from '@/db/client';
import { getDispositivoId } from '@/db/dispositivo';
import { aplicarMigracionesPendientes } from '@/db/migraciones';
import { sembrarUsuariosDePrueba } from '@/db/seed';
import { SesionProvider } from '@/ui/SesionContext';

interface EstadoDb {
  listo: boolean;
  error?: string;
}

export default function RootLayout() {
  const [estado, setEstado] = useState<EstadoDb>({ listo: false });

  useEffect(() => {
    let cancelado = false;
    (async () => {
      try {
        const db = await getDb();
        await aplicarMigracionesPendientes(db);
        const dispositivoId = await getDispositivoId(db);
        if (__DEV__) {
          await sembrarUsuariosDePrueba(db, dispositivoId);
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

  if (!estado.listo) {
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
