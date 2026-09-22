import { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import type { ModoLogin } from '@/core/tipos';
import { getDb } from '@/db/client';
import { registrarDesbloqueo, registrarIntentoFallido } from '@/db/intentosPin';
import { buscarUsuarioPorPin } from '@/db/usuarios';

import { CampoPin } from './CampoPin';
import { COLORES } from './colores';

// Este modal siempre pide el PIN de un ADMIN (6 dígitos, ver src/core/pin.ts).
const LARGO_PIN = 6;

interface Props {
  visible: boolean;
  modo: ModoLogin;
  dispositivoId: string;
  onDesbloqueado: () => void;
  onCerrar: () => void;
}

/**
 * PIN de un administrador para desbloquear un dispositivo+modo tras
 * demasiados intentos fallidos. Los fallos dentro de este modal cuentan
 * contra el mismo contador dispositivo+modo del bloqueo de fondo — no crea
 * un canal paralelo sin fricción.
 */
export function ModalDesbloqueoPin({
  visible,
  modo,
  dispositivoId,
  onDesbloqueado,
  onCerrar,
}: Props) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [intentoFallido, setIntentoFallido] = useState(0);
  const [verificando, setVerificando] = useState(false);

  function reiniciar() {
    setPin('');
    setError(null);
  }

  useEffect(() => {
    if (pin.length !== LARGO_PIN) return;

    let cancelado = false;
    (async () => {
      setVerificando(true);
      setError(null);
      try {
        const db = await getDb();
        const admin = await buscarUsuarioPorPin(db, pin, ['ADMIN']);
        if (cancelado) return;

        if (!admin) {
          await registrarIntentoFallido(db, dispositivoId, modo);
          if (cancelado) return;
          setError('PIN de administrador incorrecto');
          setPin('');
          setIntentoFallido((n) => n + 1);
          return;
        }

        await registrarDesbloqueo(db, dispositivoId, modo, admin.id);
        if (cancelado) return;
        setPin('');
        onDesbloqueado();
      } finally {
        if (!cancelado) setVerificando(false);
      }
    })();

    return () => {
      cancelado = true;
    };
  }, [pin, modo, dispositivoId, onDesbloqueado]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onShow={reiniciar}
      onRequestClose={onCerrar}
    >
      <View style={styles.fondo}>
        <View style={styles.tarjeta}>
          <Text style={styles.titulo}>PIN de administrador</Text>
          <Text style={styles.subtitulo}>Se requiere autorización para desbloquear</Text>

          <CampoPin
            pin={pin}
            largo={LARGO_PIN}
            deshabilitado={verificando}
            colorAcento={COLORES.oscuro}
            intentoFallido={intentoFallido}
            onPresionar={(digito) =>
              setPin((actual) => (actual.length < LARGO_PIN ? actual + digito : actual))
            }
            onBorrar={() => setPin((actual) => actual.slice(0, -1))}
          />

          <View style={styles.pieError}>
            {error && <Text style={styles.error}>{error}</Text>}
          </View>

          <Pressable
            onPress={() => {
              reiniciar();
              onCerrar();
            }}
            style={({ pressed }) => pressed && styles.presionado}
          >
            <Text style={styles.cancelar}>Cancelar</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fondo: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  tarjeta: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    paddingVertical: 28,
    paddingHorizontal: 24,
    alignItems: 'center',
    gap: 20,
    width: '100%',
    maxWidth: 360,
  },
  titulo: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORES.oscuro,
  },
  subtitulo: {
    fontSize: 13,
    color: '#777',
    marginTop: -12,
    textAlign: 'center',
  },
  pieError: {
    minHeight: 20,
  },
  error: {
    fontSize: 13,
    color: '#B00020',
    fontWeight: '600',
  },
  cancelar: {
    fontSize: 14,
    fontWeight: '600',
    color: '#777',
    textDecorationLine: 'underline',
  },
  presionado: {
    opacity: 0.6,
  },
});
