import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useEffect, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { rolesPermitidosPara, type ModoLogin } from '@/core/auth';
import type { EstadoIntentosPin, Rol } from '@/core/tipos';
import { mensajeDeError } from '@/core/errores';
import { getDb } from '@/db/client';
import { getDispositivoId } from '@/db/dispositivo';
import { encolarEventosSinSubir } from '@/db/eventos';
import {
  aplicarDesbloqueoRemoto,
  contarFallosConsecutivos,
  obtenerEstadoIntentos,
  registrarIntentoFallido,
  registrarLoginExitoso,
} from '@/db/intentosPin';
import { huboDesbloqueoRemotoReciente } from '@/db/intentosPinRemotos';
import { encolarPersonalSinSubir } from '@/db/personal';
import { encolarEmpresasYPuntosSinSubir } from '@/db/puntos';
import { buscarUsuarioPorPin } from '@/db/usuarios';
import { descargarDatosDeAdminConLimite } from '@/sync/bajada';
import { registrarPushToken } from '@/sync/push';
import { CampoPin } from '@/ui/CampoPin';
import { FondoFlotante, HaloResplandor } from '@/ui/FondoAnimado';
import { ModalDesbloqueoPin } from '@/ui/ModalDesbloqueoPin';
import { useSesion } from '@/ui/SesionContext';

// Admin usa PIN de 6 dígitos (ver src/core/pin.ts, modoPinParaRol); el resto
// de roles sigue derivando el PIN de los últimos 4 dígitos de la cédula.
const LARGO_PIN: Record<ModoLogin, number> = {
  PROMOTOR: 4,
  ADMIN: 6,
  BODEGA: 4,
};

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
  const [intentoFallido, setIntentoFallido] = useState(0);
  const [dispositivoId, setDispositivoId] = useState<string | null>(null);
  const [estadoIntentos, setEstadoIntentos] = useState<EstadoIntentosPin>({ estado: 'NORMAL' });
  const [segundosRestantes, setSegundosRestantes] = useState(0);
  const [mostrarDesbloqueo, setMostrarDesbloqueo] = useState(false);
  // Timestamp del último fallo local — necesario para preguntarle a Supabase
  // "¿hay un desbloqueo remoto MÁS RECIENTE que esto?" (ver efecto de
  // auto-desbloqueo abajo). No se muestra en UI, solo es insumo de esa consulta.
  const [ultimoIntentoTs, setUltimoIntentoTs] = useState<string | null>(null);
  const insets = useSafeAreaInsets();

  const tema = TEMAS[modo];

  useEffect(() => {
    (async () => {
      const db = await getDb();
      setDispositivoId(await getDispositivoId(db));
    })();
  }, []);

  async function refrescarEstadoIntentos(idDispositivo: string, modoActual: ModoLogin) {
    const db = await getDb();
    const { ultimoIntentoTs: ultimo } = await contarFallosConsecutivos(db, idDispositivo, modoActual);
    setUltimoIntentoTs(ultimo);
    const estado = await obtenerEstadoIntentos(db, idDispositivo, modoActual);
    setEstadoIntentos(estado);
    if (estado.estado === 'ESPERANDO') setSegundosRestantes(estado.segundosRestantes);
  }

  useEffect(() => {
    if (!dispositivoId) return;
    let cancelado = false;
    (async () => {
      const db = await getDb();
      const { ultimoIntentoTs: ultimo } = await contarFallosConsecutivos(db, dispositivoId, modo);
      const estado = await obtenerEstadoIntentos(db, dispositivoId, modo);
      if (cancelado) return;
      setUltimoIntentoTs(ultimo);
      setEstadoIntentos(estado);
      if (estado.estado === 'ESPERANDO') setSegundosRestantes(estado.segundosRestantes);
    })();
    return () => {
      cancelado = true;
    };
  }, [dispositivoId, modo]);

  // Mientras está BLOQUEADO, pregunta a Supabase (best-effort, cada 5s) si un
  // admin ya lo desbloqueó desde OTRO dispositivo — así la persona no tiene
  // que teclear el PIN de un admin en su propio celular (ver
  // src/db/intentosPinRemotos.ts). Sin red, esto simplemente no encuentra
  // nada y el link local sigue funcionando igual (R5).
  useEffect(() => {
    if (estadoIntentos.estado !== 'BLOQUEADO' || !dispositivoId) return;
    let cancelado = false;

    async function verificar() {
      if (!dispositivoId) return;
      try {
        const desbloqueo = await huboDesbloqueoRemotoReciente(
          dispositivoId,
          modo,
          ultimoIntentoTs ?? '0000-00-00'
        );
        if (cancelado || !desbloqueo) return;
        const db = await getDb();
        await aplicarDesbloqueoRemoto(db, {
          id: desbloqueo.id,
          dispositivoId,
          modo,
          adminId: desbloqueo.adminId,
          tsCliente: desbloqueo.tsCliente,
        });
        if (cancelado) return;
        await refrescarEstadoIntentos(dispositivoId, modo);
      } catch (error) {
        console.log('[login] chequeo de desbloqueo remoto falló (sin red probablemente):', mensajeDeError(error));
      }
    }

    verificar();
    const intervalo = setInterval(verificar, 5000);
    return () => {
      cancelado = true;
      clearInterval(intervalo);
    };
  }, [estadoIntentos.estado, dispositivoId, modo, ultimoIntentoTs]);

  useEffect(() => {
    if (estadoIntentos.estado !== 'ESPERANDO' || !dispositivoId) return;

    const intervalo = setInterval(() => {
      setSegundosRestantes((actual) => {
        if (actual <= 1) {
          refrescarEstadoIntentos(dispositivoId, modo);
          return 0;
        }
        return actual - 1;
      });
    }, 1000);

    return () => clearInterval(intervalo);
  }, [estadoIntentos.estado, dispositivoId, modo]);

  useEffect(() => {
    if (pin.length !== LARGO_PIN[modo] || !dispositivoId) return;
    if (estadoIntentos.estado !== 'NORMAL') return;

    let cancelado = false;
    (async () => {
      setVerificando(true);
      setError(null);
      try {
        const db = await getDb();
        let usuario = await buscarUsuarioPorPin(db, pin, rolesPermitidosPara(modo));
        if (cancelado) return;

        // Si no se encontró y no es modo admin, puede ser personal contratado
        // después de instalar la app en este celular (ver CLAUDE.md sección
        // 11) — se intenta una descarga fresca del personal antes de rendirse.
        // El dispositivo de admin nunca hace esto: su base local ya es la
        // fuente de verdad de `usuarios`, no la de otro dispositivo.
        if (!usuario && modo !== 'ADMIN') {
          await descargarDatosDeAdminConLimite(db, 8000);
          if (cancelado) return;
          usuario = await buscarUsuarioPorPin(db, pin, rolesPermitidosPara(modo));
          if (cancelado) return;
        }

        if (!usuario) {
          await registrarIntentoFallido(db, dispositivoId, modo);
          if (cancelado) return;
          setError('Código no encontrado');
          setIntentoFallido((n) => n + 1);
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
          await refrescarEstadoIntentos(dispositivoId, modo);
          setVerificando(false);
          setPin('');
          return;
        }

        await registrarLoginExitoso(db, dispositivoId, modo);
        iniciarSesion(usuario);
        // Personal contratado antes de que `usuarios` sincronizara nunca se
        // encoló — se sube ahora, una sola vez. Nunca en `__DEV__` (los
        // usuarios de prueba no deben llegar a Supabase).
        if (!__DEV__ && usuario.rol === 'ADMIN') {
          encolarPersonalSinSubir(db).catch((errorEncolado) =>
            console.log('[personal] no se pudo encolar personal existente:', errorEncolado)
          );
          encolarEmpresasYPuntosSinSubir(db)
            .then(() => encolarEventosSinSubir(db))
            .catch((errorEncolado) =>
              console.log('[puntos] no se pudo encolar empresas/puntos/eventos existentes:', errorEncolado)
            );
        }
        // Nunca bloquea el login (R5): si falla (sin red, permiso negado,
        // Expo Go sin soporte de push remoto) la persona simplemente no
        // recibe notificaciones hasta el próximo login — ver src/sync/push.ts.
        registrarPushToken(usuario, dispositivoId);
        irAHome(usuario.rol);
      } finally {
        if (!cancelado) setVerificando(false);
      }
    })();

    return () => {
      cancelado = true;
    };
  }, [pin, modo, dispositivoId, estadoIntentos.estado, iniciarSesion]);

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
          largo={LARGO_PIN[modo]}
          deshabilitado={verificando || estadoIntentos.estado !== 'NORMAL'}
          colorAcento={tema.colorTexto}
          intentoFallido={intentoFallido}
          decoracionTeclado={
            tema.haloEnTeclado ? <HaloResplandor color={tema.colorDecoracion} /> : undefined
          }
          onPresionar={(digito) =>
            setPin((actual) => (actual.length < LARGO_PIN[modo] ? actual + digito : actual))
          }
          onBorrar={() => setPin((actual) => actual.slice(0, -1))}
        />

        <View style={styles.pieError}>
          {estadoIntentos.estado === 'BLOQUEADO' && (
            <View style={styles.chipError}>
              <Text style={styles.error}>Bloqueado. Requiere autorización de administrador</Text>
            </View>
          )}
          {estadoIntentos.estado === 'ESPERANDO' && (
            <View style={styles.chipError}>
              <Text style={styles.error}>Espera {segundosRestantes}s...</Text>
            </View>
          )}
          {estadoIntentos.estado === 'NORMAL' && error && (
            <View style={styles.chipError}>
              <Text style={styles.error}>{error}</Text>
            </View>
          )}
        </View>

        <View style={styles.accesos}>
          {estadoIntentos.estado === 'BLOQUEADO' && (
            <Pressable
              onPress={() => setMostrarDesbloqueo(true)}
              style={({ pressed }) => [styles.enlace, pressed && styles.enlacePresionado]}
            >
              <Text style={[styles.enlaceTexto, { color: tema.colorTexto }]}>
                Desbloquear con PIN de administrador
              </Text>
            </Pressable>
          )}
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

      {dispositivoId && (
        <ModalDesbloqueoPin
          visible={mostrarDesbloqueo}
          modo={modo}
          dispositivoId={dispositivoId}
          onDesbloqueado={() => {
            setMostrarDesbloqueo(false);
            refrescarEstadoIntentos(dispositivoId, modo);
          }}
          onCerrar={() => setMostrarDesbloqueo(false)}
        />
      )}
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
