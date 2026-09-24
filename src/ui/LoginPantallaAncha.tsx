import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useRef, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import type { ModoLogin } from '@/core/auth';
import type { EstadoIntentosPin } from '@/core/tipos';

import { COLORES_ADMIN, TIPOGRAFIA_ADMIN } from './tema';

const TITULOS: Record<ModoLogin, string> = {
  PROMOTOR: 'Terminal de operación · Promotor',
  ADMIN: 'Terminal de operación · Administrador',
  BODEGA: 'Terminal de operación · Bodega',
};

const TEXTO_BOTON: Record<ModoLogin, string> = {
  PROMOTOR: 'Iniciar turno / Abrir caja',
  ADMIN: 'Entrar al panel',
  BODEGA: 'Entrar a bodega',
};

interface Props {
  modo: ModoLogin;
  pin: string;
  largoPin: number;
  verificando: boolean;
  error: string | null;
  estadoIntentos: EstadoIntentosPin;
  segundosRestantes: number;
  onCambiarPin: (pin: string) => void;
  onCambiarModo: (modo: ModoLogin) => void;
  onMostrarDesbloqueo: () => void;
}

/**
 * Login para pantalla ancha (PC/navegador), calcado del mockup en
 * TemDesing/code.html — estilo "terminal POS": reloj en vivo, tarjeta
 * central con casillas de PIN individuales (no puntos ni teclado táctil
 * grande, pensado para teclado físico), accesos a Admin/Bodega como pills.
 * Puramente de presentación: TODA la lógica de negocio (verificación de
 * PIN, backoff, desbloqueo remoto) sigue viviendo en app/index.tsx — este
 * componente solo recibe estado y notifica cambios de pin/modo. En
 * celular la pantalla de login original no cambia (ver app/index.tsx,
 * useEsPantallaAncha).
 */
export function LoginPantallaAncha({
  modo,
  pin,
  largoPin,
  verificando,
  error,
  estadoIntentos,
  segundosRestantes,
  onCambiarPin,
  onCambiarModo,
  onMostrarDesbloqueo,
}: Props) {
  const [hora, setHora] = useState(new Date());
  const inputRef = useRef<TextInput>(null);

  useEffect(() => {
    const intervalo = setInterval(() => setHora(new Date()), 1000);
    return () => clearInterval(intervalo);
  }, []);

  const deshabilitado = verificando || estadoIntentos.estado !== 'NORMAL';

  const fechaTexto = hora
    .toLocaleDateString('es-CO', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' })
    .toUpperCase();
  const horaTexto = hora.toLocaleTimeString('es-CO', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  });

  function manejarCambioTexto(texto: string) {
    const soloDigitos = texto.replace(/\D/g, '').slice(0, largoPin);
    onCambiarPin(soloDigitos);
  }

  return (
    <View style={styles.fondo}>
      <View style={styles.encabezado}>
        <View style={styles.estadoPill}>
          <View style={styles.puntoEnLinea} />
          <Text style={styles.estadoPillTexto}>Terminal BOG-01</Text>
          <View style={styles.separadorPunto} />
          <Text style={styles.estadoPillTextoVerde}>En línea</Text>
        </View>
        <View style={styles.relojPill}>
          <Text style={styles.relojFecha}>{fechaTexto}</Text>
          <View style={styles.separadorAlto} />
          <Text style={styles.relojHora}>{horaTexto}</Text>
        </View>
      </View>

      <View style={styles.centro}>
        <View style={styles.tarjeta}>
          <Image
            source={require('../../assets/images/logo-tu-lonchera.png')}
            style={styles.logo}
            resizeMode="contain"
          />

          <View style={styles.badgeModo}>
            <View style={styles.badgeModoPunto} />
            <Text style={styles.badgeModoTexto}>{TITULOS[modo].toUpperCase()}</Text>
          </View>

          <View style={styles.textoEncabezado}>
            <Text style={styles.titulo}>Ingresa tu PIN</Text>
            <Text style={styles.subtitulo}>
              {largoPin === 6 ? 'Ingresa tus 6 dígitos de acceso' : 'Ingresa tus 4 dígitos de acceso asignados'}
            </Text>
          </View>

          <Pressable
            style={styles.casillasFila}
            onPress={() => inputRef.current?.focus()}
            accessibilityRole="button"
            accessibilityLabel="Enfocar campo de PIN"
          >
            {Array.from({ length: largoPin }).map((_, i) => (
              <View
                key={i}
                style={[
                  styles.casilla,
                  i < pin.length && styles.casillaLlena,
                  error && styles.casillaError,
                ]}
              >
                <Text style={styles.casillaTexto}>{pin[i] ?? ''}</Text>
              </View>
            ))}
          </Pressable>

          <TextInput
            ref={inputRef}
            value={pin}
            onChangeText={manejarCambioTexto}
            editable={!deshabilitado}
            autoFocus
            keyboardType="number-pad"
            maxLength={largoPin}
            secureTextEntry
            style={styles.inputOculto}
            accessibilityLabel={`Código PIN de ${largoPin} dígitos`}
          />

          <View style={styles.pistaTeclado}>
            <Ionicons name="keypad-outline" size={14} color={COLORES_ADMIN.textoSecundario} />
            <Text style={styles.pistaTecladoTexto}>Usa el teclado físico de tu computador</Text>
          </View>

          <View style={styles.pieError}>
            {estadoIntentos.estado === 'BLOQUEADO' && (
              <Text style={styles.textoError}>Bloqueado. Requiere autorización de administrador</Text>
            )}
            {estadoIntentos.estado === 'ESPERANDO' && (
              <Text style={styles.textoError}>Espera {segundosRestantes}s...</Text>
            )}
            {estadoIntentos.estado === 'NORMAL' && error && <Text style={styles.textoError}>{error}</Text>}
          </View>

          <View
            style={[
              styles.boton,
              (pin.length !== largoPin || deshabilitado) && styles.botonDeshabilitado,
            ]}
          >
            <Text style={styles.botonTexto}>{verificando ? 'Verificando…' : TEXTO_BOTON[modo]}</Text>
            {!verificando && <Ionicons name="arrow-forward" size={16} color="#FFFFFF" />}
          </View>

          {estadoIntentos.estado === 'BLOQUEADO' && (
            <Pressable onPress={onMostrarDesbloqueo}>
              <Text style={styles.enlaceAyuda}>Desbloquear con PIN de administrador</Text>
            </Pressable>
          )}

          <View style={styles.divisor} />

          <View style={styles.accesosFila}>
            {modo === 'PROMOTOR' ? (
              <>
                <Pressable style={styles.accesoPill} onPress={() => onCambiarModo('ADMIN')}>
                  <Ionicons name="lock-closed-outline" size={14} color={COLORES_ADMIN.textoSecundario} />
                  <Text style={styles.accesoPillTexto}>Modo administrador</Text>
                </Pressable>
                <Pressable style={styles.accesoPill} onPress={() => onCambiarModo('BODEGA')}>
                  <Ionicons name="cube-outline" size={14} color={COLORES_ADMIN.textoSecundario} />
                  <Text style={styles.accesoPillTexto}>Modo bodega</Text>
                </Pressable>
              </>
            ) : (
              <Pressable style={styles.accesoPill} onPress={() => onCambiarModo('PROMOTOR')}>
                <Ionicons name="arrow-back" size={14} color={COLORES_ADMIN.textoSecundario} />
                <Text style={styles.accesoPillTexto}>Volver</Text>
              </Pressable>
            )}
          </View>
        </View>
      </View>

      <View style={styles.pie}>
        <Text style={styles.pieTexto}>© {hora.getFullYear()} Tu Lonchera · Todos los derechos reservados.</Text>
        <View style={styles.pieEstado}>
          <View style={styles.puntoEnLinea} />
          <Text style={styles.pieEstadoTexto}>SQLite local · Sincronización activa</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  fondo: {
    flex: 1,
    backgroundColor: COLORES_ADMIN.background,
    justifyContent: 'space-between',
  },
  encabezado: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingTop: 16,
  },
  estadoPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: COLORES_ADMIN.bordeSuave,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  puntoEnLinea: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: COLORES_ADMIN.positivo,
  },
  estadoPillTexto: {
    fontSize: 12,
    fontFamily: TIPOGRAFIA_ADMIN.semiNegrita,
    color: COLORES_ADMIN.texto,
  },
  separadorPunto: {
    width: 3,
    height: 3,
    borderRadius: 2,
    backgroundColor: COLORES_ADMIN.bordeSuave,
  },
  estadoPillTextoVerde: {
    fontSize: 11,
    fontFamily: TIPOGRAFIA_ADMIN.medio,
    color: COLORES_ADMIN.positivo,
  },
  relojPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: COLORES_ADMIN.bordeSuave,
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 6,
  },
  relojFecha: {
    fontSize: 11,
    fontFamily: TIPOGRAFIA_ADMIN.medio,
    color: COLORES_ADMIN.textoSecundario,
    letterSpacing: 0.4,
  },
  separadorAlto: {
    width: 1,
    height: 14,
    backgroundColor: COLORES_ADMIN.bordeSuave,
  },
  relojHora: {
    fontSize: 13,
    fontFamily: TIPOGRAFIA_ADMIN.monoSemiNegrita,
    color: COLORES_ADMIN.texto,
  },
  centro: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  tarjeta: {
    width: '100%',
    maxWidth: 440,
    backgroundColor: 'rgba(255,255,255,0.9)',
    borderRadius: 40,
    borderWidth: 1,
    borderColor: '#FFFFFF',
    padding: 36,
    alignItems: 'center',
    gap: 4,
  },
  logo: {
    width: 180,
    height: 66,
    marginBottom: 12,
  },
  badgeModo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(243,167,18,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(243,167,18,0.25)',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 5,
    marginBottom: 20,
  },
  badgeModoPunto: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: COLORES_ADMIN.dorado,
  },
  badgeModoTexto: {
    fontSize: 10,
    fontFamily: TIPOGRAFIA_ADMIN.semiNegrita,
    color: '#6A4600',
    letterSpacing: 0.4,
  },
  textoEncabezado: {
    alignItems: 'center',
    gap: 4,
    marginBottom: 24,
  },
  titulo: {
    fontSize: 22,
    fontFamily: TIPOGRAFIA_ADMIN.negrita,
    color: COLORES_ADMIN.vino,
  },
  subtitulo: {
    fontSize: 13,
    fontFamily: TIPOGRAFIA_ADMIN.regular,
    color: COLORES_ADMIN.textoSecundario,
  },
  casillasFila: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  casilla: {
    width: 56,
    height: 64,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.7)',
    borderWidth: 2,
    borderColor: COLORES_ADMIN.bordeSuave,
    alignItems: 'center',
    justifyContent: 'center',
  },
  casillaLlena: {
    borderColor: COLORES_ADMIN.vino,
  },
  casillaError: {
    borderColor: COLORES_ADMIN.error,
  },
  casillaTexto: {
    fontSize: 22,
    fontFamily: TIPOGRAFIA_ADMIN.negrita,
    color: COLORES_ADMIN.vino,
  },
  inputOculto: {
    position: 'absolute',
    opacity: 0,
    width: 0,
    height: 0,
  },
  pistaTeclado: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 24,
  },
  pistaTecladoTexto: {
    fontSize: 12,
    fontFamily: TIPOGRAFIA_ADMIN.regular,
    color: COLORES_ADMIN.textoSecundario,
  },
  pieError: {
    minHeight: 20,
    marginBottom: 8,
  },
  textoError: {
    fontSize: 12,
    fontFamily: TIPOGRAFIA_ADMIN.semiNegrita,
    color: COLORES_ADMIN.error,
    textAlign: 'center',
  },
  boton: {
    flexDirection: 'row',
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: COLORES_ADMIN.vino,
    borderRadius: 16,
    paddingVertical: 16,
    paddingHorizontal: 24,
  },
  botonDeshabilitado: {
    opacity: 0.5,
  },
  botonTexto: {
    fontSize: 14,
    fontFamily: TIPOGRAFIA_ADMIN.semiNegrita,
    color: '#FFFFFF',
  },
  enlaceAyuda: {
    fontSize: 12,
    fontFamily: TIPOGRAFIA_ADMIN.medio,
    color: COLORES_ADMIN.textoSecundario,
    textDecorationLine: 'underline',
    marginTop: 12,
    textAlign: 'center',
  },
  divisor: {
    width: '100%',
    height: 1,
    backgroundColor: COLORES_ADMIN.bordeSuave,
    marginTop: 24,
    marginBottom: 16,
  },
  accesosFila: {
    flexDirection: 'row',
    gap: 8,
  },
  accesoPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: COLORES_ADMIN.superficieBaja,
    borderWidth: 1,
    borderColor: COLORES_ADMIN.bordeSuave,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  accesoPillTexto: {
    fontSize: 12,
    fontFamily: TIPOGRAFIA_ADMIN.medio,
    color: COLORES_ADMIN.textoSecundario,
  },
  pie: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingBottom: 16,
  },
  pieTexto: {
    fontSize: 11,
    fontFamily: TIPOGRAFIA_ADMIN.regular,
    color: COLORES_ADMIN.textoSecundario,
  },
  pieEstado: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: COLORES_ADMIN.bordeSuave,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  pieEstadoTexto: {
    fontSize: 11,
    fontFamily: TIPOGRAFIA_ADMIN.regular,
    color: COLORES_ADMIN.textoSecundario,
  },
});
