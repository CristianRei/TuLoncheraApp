import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { rolesPermitidosPara, type ModoLogin } from '@/core/auth';
import type { Rol } from '@/core/tipos';
import { getDb } from '@/db/client';
import { buscarUsuarioPorPin } from '@/db/usuarios';
import { CampoPin } from '@/ui/CampoPin';
import { COLORES } from '@/ui/colores';
import { useSesion } from '@/ui/SesionContext';

const LARGO_PIN = 4;

const TITULOS: Record<ModoLogin, string> = {
  PROMOTOR: 'Tu Lonchera',
  ADMIN: 'Modo administrador',
  BODEGA: 'Modo bodega',
};

const FONDOS: Record<ModoLogin, string> = {
  PROMOTOR: '#FFF8EC',
  ADMIN: '#FBEDED',
  BODEGA: '#FBEDED',
};

export default function Login() {
  const { iniciarSesion } = useSesion();
  const [modo, setModo] = useState<ModoLogin>('PROMOTOR');
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [verificando, setVerificando] = useState(false);

  const colorAcento = modo === 'PROMOTOR' ? COLORES.primario : COLORES.oscuro;

  useEffect(() => {
    if (pin.length !== LARGO_PIN) return;

    let cancelado = false;
    (async () => {
      setVerificando(true);
      setError(null);
      try {
        const db = await getDb();
        const usuario = await buscarUsuarioPorPin(db, pin, rolesPermitidosPara(modo));
        if (cancelado) return;

        if (!usuario) {
          setError('Código no encontrado');
          setPin('');
          return;
        }

        iniciarSesion(usuario);
        irAHome(usuario.rol);
      } finally {
        if (!cancelado) setVerificando(false);
      }
    })();

    return () => {
      cancelado = true;
    };
  }, [pin]);

  function irAHome(rol: Rol) {
    if (rol === 'PROMOTOR') router.replace('/promotor');
    else if (rol === 'ADMIN') router.replace('/admin');
    else if (rol === 'BODEGA') router.replace('/bodega');
  }

  function cambiarModo(nuevoModo: ModoLogin) {
    setModo(nuevoModo);
    setPin('');
    setError(null);
  }

  return (
    <View style={[styles.contenedor, { backgroundColor: FONDOS[modo] }]}>
      <View style={styles.encabezado}>
        <Text style={[styles.titulo, { color: colorAcento }]}>{TITULOS[modo]}</Text>
        <Text style={styles.subtitulo}>Ingresa tu código</Text>
      </View>

      <CampoPin
        pin={pin}
        deshabilitado={verificando}
        colorAcento={colorAcento}
        onPresionar={(digito) =>
          setPin((actual) => (actual.length < LARGO_PIN ? actual + digito : actual))
        }
        onBorrar={() => setPin((actual) => actual.slice(0, -1))}
      />

      <View style={styles.pieError}>{error && <Text style={styles.error}>{error}</Text>}</View>

      <View style={styles.accesos}>
        {modo === 'PROMOTOR' ? (
          <>
            <Pressable onPress={() => cambiarModo('ADMIN')}>
              <Text style={styles.enlace}>Ingresar como administrador</Text>
            </Pressable>
            <Pressable onPress={() => cambiarModo('BODEGA')}>
              <Text style={styles.enlace}>Ingresar como bodega</Text>
            </Pressable>
          </>
        ) : (
          <Pressable onPress={() => cambiarModo('PROMOTOR')}>
            <Text style={styles.enlace}>‹ Volver</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  contenedor: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 24,
  },
  encabezado: {
    alignItems: 'center',
    gap: 4,
  },
  titulo: {
    fontSize: 26,
    fontWeight: '700',
  },
  subtitulo: {
    fontSize: 14,
    color: '#666',
  },
  pieError: {
    minHeight: 20,
  },
  error: {
    fontSize: 14,
    color: '#B00020',
    fontWeight: '600',
  },
  accesos: {
    alignItems: 'center',
    gap: 12,
  },
  enlace: {
    fontSize: 14,
    color: '#555',
    textDecorationLine: 'underline',
  },
});
