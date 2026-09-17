import Ionicons from '@expo/vector-icons/Ionicons';
import { CameraView, useCameraPermissions, type CameraType } from 'expo-camera';
import { useAudioPlayer } from 'expo-audio';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import { Pressable, Modal, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Defs, Mask, Rect } from 'react-native-svg';

import { COLORES } from './colores';

interface Props {
  visible: boolean;
  onDetectado: (codigo: string) => void;
  onCerrar: () => void;
  titulo?: string;
  colorAcento: string;
  /** Pausa la cámara sin desmontarla (ej. mientras un modal tapa la pantalla). Default: true. */
  activa?: boolean;
  /** Botones extra al final del header (ej. el ticket con su contador). */
  accionesHeaderExtra?: ReactNode;
  /** Contenido fijo abajo, debajo del recuadro guía (ej. el botón "Cobrar"). */
  piePersonalizado?: ReactNode;
  /**
   * Contenido que tapa TODA la cámara (ej. el ticket o el modal de cobro).
   * Va dentro de este mismo Modal — nunca abras otro `<Modal>` de RN encima
   * de la cámara: dos Modal nativos simultáneos con la cámara activa
   * cuelgan la pantalla en Android.
   */
  overlayEncimaDeCamara?: ReactNode;
}

const TIPOS_CODIGO = ['ean13', 'ean8', 'upc_a', 'upc_e', 'code128'] as const;
// Después de una lectura, ignora nuevas detecciones un momento — evita que
// el mismo código se cuente varias veces mientras la cámara sigue enfocada
// en él, sin dejar de escuchar para el siguiente producto (escaneo continuo).
const PAUSA_TRAS_LECTURA_MS = 1200;
const TAMANO_GUIA = 260;
const RADIO_GUIA = 24;
const COLOR_SOMBRA = 'rgba(0,0,0,0.55)';

/**
 * Une el recuadro guía con la sombra recta de alrededor. Las bandas rectas
 * (arriba/abajo/izquierda/derecha) tapan casi todo; esta pieza tapa solo la
 * esquina de RADIO_GUIA×RADIO_GUIA que las bandas rectas no cubren porque el
 * marco es redondeado. Es un tamaño fijo (no depende de medir la pantalla),
 * así que no hay ambigüedad de layout: la máscara recorta un círculo de
 * radio RADIO_GUIA centrado en la esquina de ESTA cajita que da hacia el
 * centro del recuadro — fuera de ese círculo (hacia la esquina real) queda
 * sombreado; dentro (hacia el recuadro) se ve la cámara.
 */
function EsquinaSombra({ estilo, cx, cy, id }: { estilo: object; cx: number; cy: number; id: string }) {
  return (
    <Svg width={RADIO_GUIA} height={RADIO_GUIA} style={estilo} pointerEvents="none">
      <Defs>
        <Mask id={id}>
          <Rect x={0} y={0} width={RADIO_GUIA} height={RADIO_GUIA} fill="#FFFFFF" />
          <Circle cx={cx} cy={cy} r={RADIO_GUIA} fill="#000000" />
        </Mask>
      </Defs>
      <Rect x={0} y={0} width={RADIO_GUIA} height={RADIO_GUIA} fill={COLOR_SOMBRA} mask={`url(#${id})`} />
    </Svg>
  );
}

/**
 * Cámara + lectura de código de barras, en un Modal de pantalla completa.
 * Queda abierta entre lecturas (escaneo continuo) — quien la use decide
 * cuándo cerrarla vía `onCerrar`. Componente genérico: no sabe qué hacer
 * con el código detectado ni qué hay en `accionesHeaderExtra`/
 * `piePersonalizado`/`overlayEncimaDeCamara` — lo usan el catálogo,
 * "ingresar pedido" de bodega y la venta del promotor, cada uno con sus
 * propios slots.
 */
export function EscanerCodigoBarras({
  visible,
  onDetectado,
  onCerrar,
  titulo = 'Escanear código',
  colorAcento,
  activa = true,
  accionesHeaderExtra,
  piePersonalizado,
  overlayEncimaDeCamara,
}: Props) {
  const [permiso, solicitarPermiso] = useCameraPermissions();
  const [bloqueado, setBloqueado] = useState(false);
  const [linterna, setLinterna] = useState(false);
  const [camaraFrontal, setCamaraFrontal] = useState(false);
  const yaEscaneado = useRef(false);
  const insets = useSafeAreaInsets();
  const sonidoBeep = useAudioPlayer(require('../../assets/sounds/beep.wav'));

  // Reinicia candado/linterna/cámara cada vez que se cierra — ajuste de
  // estado durante el render en respuesta a un cambio de prop, en vez de un
  // efecto (evita el round-trip de un render extra que causaría un efecto).
  const [visibleAnterior, setVisibleAnterior] = useState(visible);
  if (visible !== visibleAnterior) {
    setVisibleAnterior(visible);
    if (!visible) {
      setBloqueado(false);
      setLinterna(false);
      setCamaraFrontal(false);
    }
  }

  useEffect(() => {
    if (visible && activa) yaEscaneado.current = false;
  }, [visible, activa]);

  function manejarEscaneo(resultado: { data: string }) {
    if (yaEscaneado.current) return;
    yaEscaneado.current = true;
    sonidoBeep.seekTo(0);
    sonidoBeep.play();
    onDetectado(resultado.data);
    setTimeout(() => {
      yaEscaneado.current = false;
    }, PAUSA_TRAS_LECTURA_MS);
  }

  const facing: CameraType = camaraFrontal ? 'front' : 'back';

  return (
    <Modal
      visible={visible}
      animationType="slide"
      onRequestClose={() => {
        if (!bloqueado) onCerrar();
      }}
    >
      <View style={styles.contenedor}>
        {!permiso ? (
          <View style={styles.centrado} />
        ) : !permiso.granted ? (
          <View style={styles.centrado}>
            <Text style={styles.mensaje}>Se necesita permiso de cámara para escanear.</Text>
            <Pressable
              style={[styles.boton, { backgroundColor: colorAcento }]}
              onPress={solicitarPermiso}
            >
              <Text style={styles.botonTexto}>Dar permiso</Text>
            </Pressable>
            <Pressable onPress={onCerrar}>
              <Text style={styles.cerrarTextoAlterno}>Cerrar</Text>
            </Pressable>
          </View>
        ) : (
          <>
            <CameraView
              style={StyleSheet.absoluteFill}
              facing={facing}
              active={activa}
              enableTorch={linterna && !camaraFrontal}
              barcodeScannerSettings={{ barcodeTypes: [...TIPOS_CODIGO] }}
              onBarcodeScanned={manejarEscaneo}
            />

            <View
              style={[styles.header, { paddingTop: insets.top + 10 }]}
              pointerEvents={bloqueado ? 'none' : 'box-none'}
            >
              <Pressable style={styles.botonIcono} onPress={onCerrar}>
                <Ionicons name="close" size={26} color="#FFF" />
              </Pressable>
              <View style={styles.headerDerecha}>
                {!camaraFrontal && (
                  <Pressable style={styles.botonIcono} onPress={() => setLinterna((v) => !v)}>
                    <Ionicons name={linterna ? 'flash' : 'flash-off'} size={22} color="#FFF" />
                  </Pressable>
                )}
                <Pressable style={styles.botonIcono} onPress={() => setCamaraFrontal((v) => !v)}>
                  <Ionicons name="camera-reverse-outline" size={24} color="#FFF" />
                </Pressable>
                {accionesHeaderExtra}
              </View>
            </View>

            {/* Máscara: bandas oscuras alrededor + una fila central de altura
                exacta TAMANO_GUIA. El espacio sobrante se reparte igual
                arriba y abajo (flex:1 en ambos lados), así el recuadro
                siempre queda centrado sin importar el alto de pantalla. */}
            <View style={styles.zonaCentral} pointerEvents="box-none">
              <View style={styles.bandaSombra} pointerEvents="box-none">
                {titulo && (
                  <View style={styles.chipTitulo}>
                    <Text style={styles.tituloTexto}>{titulo}</Text>
                  </View>
                )}
                <Pressable
                  style={[styles.botonCandado, bloqueado && styles.botonCandadoActivo]}
                  onPress={() => setBloqueado((v) => !v)}
                >
                  <Ionicons
                    name={bloqueado ? 'lock-closed' : 'lock-open-outline'}
                    size={22}
                    color="#FFF"
                  />
                </Pressable>
              </View>

              <View style={styles.filaGuia}>
                <View style={styles.bandaSombra} pointerEvents="none" />
                <View style={styles.marcoGuia} pointerEvents="none">
                  <View style={styles.recuadroGuia} />
                  <EsquinaSombra estilo={styles.esquinaSI} cx={RADIO_GUIA} cy={RADIO_GUIA} id="esquinaSI" />
                  <EsquinaSombra estilo={styles.esquinaSD} cx={0} cy={RADIO_GUIA} id="esquinaSD" />
                  <EsquinaSombra estilo={styles.esquinaII} cx={RADIO_GUIA} cy={0} id="esquinaII" />
                  <EsquinaSombra estilo={styles.esquinaID} cx={0} cy={0} id="esquinaID" />
                </View>
                <View style={styles.bandaSombra} pointerEvents="none" />
              </View>

              <View style={styles.bandaSombra} pointerEvents="none" />
            </View>

            {piePersonalizado && (
              <View
                style={[styles.pie, { paddingBottom: insets.bottom + 16 }]}
                pointerEvents={bloqueado ? 'none' : 'box-none'}
              >
                {piePersonalizado}
              </View>
            )}

            {overlayEncimaDeCamara}
          </>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  contenedor: {
    flex: 1,
    backgroundColor: '#000',
  },
  header: {
    backgroundColor: COLORES.primario,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 10,
  },
  headerDerecha: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  botonIcono: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  zonaCentral: {
    flex: 1,
  },
  bandaSombra: {
    flex: 1,
    backgroundColor: COLOR_SOMBRA,
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 10,
    paddingBottom: 14,
  },
  filaGuia: {
    flexDirection: 'row',
    height: TAMANO_GUIA,
  },
  marcoGuia: {
    width: TAMANO_GUIA,
    height: TAMANO_GUIA,
  },
  esquinaSI: {
    position: 'absolute',
    top: 0,
    left: 0,
  },
  esquinaSD: {
    position: 'absolute',
    top: 0,
    right: 0,
  },
  esquinaII: {
    position: 'absolute',
    bottom: 0,
    left: 0,
  },
  esquinaID: {
    position: 'absolute',
    bottom: 0,
    right: 0,
  },
  chipTitulo: {
    backgroundColor: 'rgba(0,0,0,0.4)',
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 7,
  },
  tituloTexto: {
    color: '#FFF',
    fontSize: 13,
    fontWeight: '600',
  },
  botonCandado: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  botonCandadoActivo: {
    backgroundColor: COLORES.primario,
  },
  recuadroGuia: {
    width: TAMANO_GUIA,
    height: TAMANO_GUIA,
    borderRadius: RADIO_GUIA,
    borderWidth: 4,
    borderColor: COLORES.primario,
  },
  pie: {
    paddingHorizontal: 20,
    paddingTop: 12,
  },
  centrado: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 16,
  },
  mensaje: {
    color: '#FFF',
    fontSize: 14,
    textAlign: 'center',
  },
  boton: {
    borderRadius: 10,
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  botonTexto: {
    color: '#FFF',
    fontWeight: '700',
  },
  cerrarTextoAlterno: {
    color: '#CCC',
    fontSize: 14,
    textDecorationLine: 'underline',
  },
});
