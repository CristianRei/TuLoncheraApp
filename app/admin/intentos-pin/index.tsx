import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { ResumenIntentosPin } from '@/core/tipos';
import { getDb } from '@/db/client';
import { listarResumenIntentosPin, registrarDesbloqueo } from '@/db/intentosPin';
import { COLORES } from '@/ui/colores';
import { ContenedorAncho } from '@/ui/ContenedorAncho';
import { useEsPantallaAncha } from '@/ui/useEsPantallaAncha';
import { useRequiereSesion } from '@/ui/useRequiereSesion';

function formatearFecha(tsCliente: string | null): string {
  if (!tsCliente) return 'Sin registro';
  return new Date(tsCliente).toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' });
}

function nombreDispositivo(dispositivoId: string): string {
  return `Dispositivo ${dispositivoId.slice(0, 8)}`;
}

export default function IntentosPin() {
  const usuario = useRequiereSesion(['ADMIN']);
  const [resumen, setResumen] = useState<ResumenIntentosPin[]>([]);
  const [cargando, setCargando] = useState(true);
  const [desbloqueando, setDesbloqueando] = useState<string | null>(null);
  const insets = useSafeAreaInsets();
  const anchaPantalla = useEsPantallaAncha();

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const db = await getDb();
      setResumen(await listarResumenIntentosPin(db));
    } finally {
      setCargando(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      cargar();
    }, [cargar])
  );

  async function desbloquear(item: ResumenIntentosPin) {
    if (!usuario) return;
    const clave = `${item.dispositivoId}-${item.modo}`;
    setDesbloqueando(clave);
    try {
      const db = await getDb();
      await registrarDesbloqueo(db, item.dispositivoId, item.modo, usuario.id);
      await cargar();
    } finally {
      setDesbloqueando(null);
    }
  }

  if (!usuario) return null;

  return (
    <View style={styles.contenedor}>
      <View
        style={[
          anchaPantalla ? styles.encabezadoAncho : styles.encabezado,
          { paddingTop: anchaPantalla ? 20 : insets.top + 20 },
        ]}
      >
        <ContenedorAncho anchoMaximo={720}>
          <View style={styles.encabezadoFila}>
            {!anchaPantalla && (
              <Pressable onPress={() => router.back()}>
                <Text style={styles.volver}>‹ Admin</Text>
              </Pressable>
            )}
            <Text style={anchaPantalla ? styles.tituloAncho : styles.titulo}>Seguridad de acceso</Text>
            {!anchaPantalla && <View style={{ width: 40 }} />}
          </View>
        </ContenedorAncho>
      </View>

      {cargando ? (
        <View style={styles.centrado}>
          <ActivityIndicator size="large" color={COLORES.oscuro} />
        </View>
      ) : resumen.length === 0 ? (
        <View style={styles.centrado}>
          <Text style={styles.vacio}>No hay intentos fallidos de PIN registrados.</Text>
        </View>
      ) : (
        <ContenedorAncho anchoMaximo={720} llenarAlto>
          <FlatList
            data={resumen}
            keyExtractor={(item) => `${item.dispositivoId}-${item.modo}`}
            contentContainerStyle={styles.lista}
            renderItem={({ item }) => {
              const clave = `${item.dispositivoId}-${item.modo}`;
              return (
                <View style={styles.fila}>
                  <View style={styles.filaTexto}>
                    <View style={styles.filaTituloFila}>
                      <Text style={styles.filaDispositivo}>{nombreDispositivo(item.dispositivoId)}</Text>
                      {item.bloqueado && (
                        <View style={styles.insigniaBloqueado}>
                          <Text style={styles.insigniaBloqueadoTexto}>Bloqueado</Text>
                        </View>
                      )}
                    </View>
                    <Text style={styles.filaDetalle}>
                      Modo {item.modo} · {item.fallosConsecutivos} fallos consecutivos
                    </Text>
                    <Text style={styles.filaDetalle}>
                      Último intento: {formatearFecha(item.ultimoIntentoTs)}
                    </Text>
                  </View>
                  {item.bloqueado && (
                    <Pressable
                      style={styles.botonDesbloquear}
                      onPress={() => desbloquear(item)}
                      disabled={desbloqueando === clave}
                    >
                      {desbloqueando === clave ? (
                        <ActivityIndicator size="small" color="#FFFFFF" />
                      ) : (
                        <Text style={styles.botonDesbloquearTexto}>Desbloquear</Text>
                      )}
                    </Pressable>
                  )}
                </View>
              );
            }}
          />
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
  encabezadoAncho: {
    backgroundColor: 'transparent',
    paddingHorizontal: 20,
    paddingBottom: 16,
  },
  encabezadoFila: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
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
  tituloAncho: {
    color: COLORES.oscuro,
    fontSize: 20,
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
    textAlign: 'center',
  },
  lista: {
    padding: 20,
    gap: 12,
  },
  fila: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 14,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  filaTexto: {
    flex: 1,
    gap: 2,
  },
  filaTituloFila: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  filaDispositivo: {
    fontSize: 14,
    fontWeight: '700',
    color: '#333',
  },
  insigniaBloqueado: {
    backgroundColor: '#B00020',
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  insigniaBloqueadoTexto: {
    fontSize: 10,
    fontWeight: '700',
    color: '#FFF',
  },
  filaDetalle: {
    fontSize: 12,
    color: '#888',
  },
  botonDesbloquear: {
    backgroundColor: COLORES.oscuro,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  botonDesbloquearTexto: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});
