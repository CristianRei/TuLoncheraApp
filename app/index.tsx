import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useEffect, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { rolesPermitidosPara, type ModoLogin } from '@/core/auth';
import type { Rol } from '@/core/tipos';
import { getDb } from '@/db/client';
import { buscarUsuarioPorPin } from '@/db/usuarios';
import { CampoPin } from '@/ui/CampoPin';
import { FondoFlotante, HaloResplandor } from '@/ui/FondoAnimado';
import { useSesion } from '@/ui/SesionContext';

const LARGO_PIN = 4;

const TITULOS: Record<ModoLogin, string> = {
  PROMOTOR: 'Tu Lonchera',
  ADMIN: 'Modo administrador',
  BODEGA: 'Modo bodega',
};

interface Tema {
  gradiente: [string, string];
  colorTexto: string;
  colorDecoracion: string;
  /** Formas flotando de fondo, en toda la pantalla. */
  fondoFlotante?: boolean;
  /** Resplandor que respira, centrado detrás del teclado numérico. */
  haloEnTeclado?: boolean;
}

// Los tres tonos salen de la paleta real del logo: dorado (ícono/"TU"),
// naranja quemado (degradado del ícono) y vinotinto ("LONCHERA").
const TEMAS: Record<ModoLogin, Tema> = {
  PROMOTOR: {
    gradiente: ['#FFCB55', '#F3A712'],
    colorTexto: '#541212',
    colorDecoracion: '#541212',
    fondoFlotante: true,
  },
  BODEGA: {
    gradiente: ['#E0791E', '#9C4308'],
    colorTexto: '#FFFFFF',
    colorDecoracion: '#FFFFFF',
    fondoFlotante: true,
  },
  ADMIN: {
    gradiente: ['#7A2020', '#360A0A'],
    colorTexto: '#FFFFFF',
    colorDecoracion: '#FFFFFF',
    haloEnTeclado: true,
  },
};

export default function Login() {
  const { iniciarSesion } = useSesion();
  const [modo, setModo] = useState<ModoLogin>('PROMOTOR');
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [verificando, setVerificando] = useState(false);
  const [intentosFallidos, setIntentosFallidos] = useState(0);
  const insets = useSafeAreaInsets();

  const tema = TEMAS[modo];

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
          setIntentosFallidos((n) => n + 1);
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
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
  }, [pin, modo, iniciarSesion]);

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
    <View style={styles.contenedor}>
      <Animated.View key={modo} entering={FadeIn.duration(400)} style={StyleSheet.absoluteFill}>
        <LinearGradient colors={tema.gradiente} style={StyleSheet.absoluteFill} />
        {tema.fondoFlotante && <FondoFlotante color={tema.colorDecoracion} />}
      </Animated.View>

      <View style={[styles.contenido, { paddingTop: insets.top + 28, paddingBottom: insets.bottom + 16 }]}>
        <View style={styles.tarjetaLogo}>
          <Image
            source={require('../assets/images/logo-tu-lonchera.png')}
            style={styles.logo}
            resizeMode="contain"
          />
        </View>

        <View style={styles.encabezado}>
          {modo !== 'PROMOTOR' && (
            <Text style={[styles.etiquetaModo, { color: tema.colorTexto }]}>{TITULOS[modo]}</Text>
          )}
          <Text style={[styles.subtitulo, { color: tema.colorTexto }]}>Ingresa tu código</Text>
        </View>

        <CampoPin
          pin={pin}
          deshabilitado={verificando}
          colorAcento={tema.colorTexto}
          intentoFallido={intentosFallidos}
          decoracionTeclado={
            tema.haloEnTeclado ? <HaloResplandor color={tema.colorDecoracion} /> : undefined
          }
          onPresionar={(digito) =>
            setPin((actual) => (actual.length < LARGO_PIN ? actual + digito : actual))
          }
          onBorrar={() => setPin((actual) => actual.slice(0, -1))}
        />

        <View style={styles.pieError}>
          {error && (
            <View style={styles.chipError}>
              <Text style={styles.error}>{error}</Text>
            </View>
          )}
        </View>

        <View style={styles.accesos}>
          {modo === 'PROMOTOR' ? (
            <>
              <Pressable
                onPress={() => cambiarModo('ADMIN')}
                style={({ pressed }) => [styles.enlace, pressed && styles.enlacePresionado]}
              >
                <Text style={[styles.enlaceTexto, { color: tema.colorTexto }]}>
                  Ingresar como administrador
                </Text>
              </Pressable>
              <Pressable
                onPress={() => cambiarModo('BODEGA')}
                style={({ pressed }) => [styles.enlace, pressed && styles.enlacePresionado]}
              >
                <Text style={[styles.enlaceTexto, { color: tema.colorTexto }]}>
                  Ingresar como bodega
                </Text>
              </Pressable>
            </>
          ) : (
            <Pressable
              onPress={() => cambiarModo('PROMOTOR')}
              style={({ pressed }) => [styles.enlace, pressed && styles.enlacePresionado]}
            >
              <Text style={[styles.enlaceTexto, { color: tema.colorTexto }]}>‹ Volver</Text>
            </Pressable>
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  contenedor: {
    flex: 1,
    overflow: 'hidden',
  },
  contenido: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 24,
  },
  tarjetaLogo: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    paddingHorizontal: 22,
    paddingVertical: 16,
  },
  logo: {
    width: 200,
    height: 73,
  },
  encabezado: {
    alignItems: 'center',
    gap: 4,
  },
  etiquetaModo: {
    fontSize: 20,
    fontWeight: '700',
  },
  subtitulo: {
    fontSize: 14,
    opacity: 0.85,
  },
  pieError: {
    minHeight: 32,
  },
  chipError: {
    backgroundColor: 'rgba(0,0,0,0.32)',
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 6,
  },
  error: {
    fontSize: 13,
    color: '#FFFFFF',
    fontWeight: '600',
  },
  accesos: {
    alignItems: 'center',
    gap: 4,
  },
  enlace: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
  },
  enlacePresionado: {
    backgroundColor: 'rgba(0,0,0,0.12)',
  },
  enlaceTexto: {
    fontSize: 14,
    fontWeight: '600',
    textDecorationLine: 'underline',
  },
});
