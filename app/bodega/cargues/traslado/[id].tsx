import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import type { Traslado, TrasladoLinea } from '@/core/tipos';
import { getDb } from '@/db/client';
import { getDispositivoId } from '@/db/dispositivo';
import { confirmarLineaTraslado, obtenerTraslado } from '@/db/traslados';
import { buscarProductoPorCodigoBarras } from '@/db/productos';
import { ContenedorAncho } from '@/ui/ContenedorAncho';
import { Encabezado } from '@/ui/Encabezado';
import { EmptyState } from '@/ui/EmptyState';
import { EscanerCodigoBarras } from '@/ui/EscanerCodigoBarras';
import { Insignia } from '@/ui/Insignia';
import { ANCHO_ADMIN, COLORES_ADMIN, ESPACIADO_ADMIN, RADII_ADMIN, TEXTO_ADMIN } from '@/ui/tema';
import { useRequiereSesion } from '@/ui/useRequiereSesion';
import { useRecargarConDatosNuevos } from '@/ui/useVersionDatos';

export default function ConfirmarTraslado() {
  const usuario = useRequiereSesion(['BODEGA']);
  const { id } = useLocalSearchParams<{ id: string }>();
  const [traslado, setTraslado] = useState<Traslado | null>(null);
  const [lineas, setLineas] = useState<TrasladoLinea[]>([]);
  const [cargando, setCargando] = useState(true);
  const [escanerVisible, setEscanerVisible] = useState(false);
  const [lineaPendiente, setLineaPendiente] = useState<TrasladoLinea | null>(null);
  const [cantidadTexto, setCantidadTexto] = useState('');
  const [motivoTexto, setMotivoTexto] = useState('');
  const [guardando, setGuardando] = useState(false);

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const db = await getDb();
      const resultado = await obtenerTraslado(db, id);
      setTraslado(resultado?.traslado ?? null);
      setLineas(resultado?.lineas ?? []);
    } finally {
      setCargando(false);
    }
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      cargar();
    }, [cargar])
  );
  useRecargarConDatosNuevos(cargar);

  if (!usuario) return null;
  const usuarioActual = usuario;

  const pendientes = lineas.filter((l) => l.estado === 'PENDIENTE');

  async function manejarCodigoEscaneado(codigo: string) {
    const db = await getDb();
    const producto = await buscarProductoPorCodigoBarras(db, codigo);
    if (!producto) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert('Código no reconocido', 'Ningún producto del catálogo tiene ese código.');
      return;
    }
    const linea = pendientes.find((l) => l.productoId === producto.id);
    if (!linea) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert('No está en este traslado', `"${producto.nombre}" no está pendiente en este traslado.`);
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    abrirLinea(linea);
  }

  function abrirLinea(linea: TrasladoLinea) {
    setLineaPendiente(linea);
    setCantidadTexto(String(linea.cantidadPlaneada));
    setMotivoTexto('');
  }

  const cantidadIngresada = parseInt(cantidadTexto, 10);
  const faltaMotivo =
    lineaPendiente !== null &&
    Number.isFinite(cantidadIngresada) &&
    cantidadIngresada < lineaPendiente.cantidadPlaneada &&
    motivoTexto.trim().length === 0;

  async function confirmar() {
    if (!lineaPendiente) return;
    if (!Number.isFinite(cantidadIngresada) || cantidadIngresada < 0) return;
    if (faltaMotivo) return;

    setGuardando(true);
    try {
      const db = await getDb();
      const dispositivoId = await getDispositivoId(db);
      await confirmarLineaTraslado(
        db,
        {
          lineaId: lineaPendiente.id,
          cantidadEntregada: cantidadIngresada,
          motivoRevision: motivoTexto.trim() || undefined,
          ejecutorId: usuarioActual.id,
        },
        dispositivoId
      );
      setLineaPendiente(null);
      setEscanerVisible(false);
      await cargar();
    } catch (error) {
      Alert.alert('No se pudo confirmar', error instanceof Error ? error.message : 'Error inesperado.');
    } finally {
      setGuardando(false);
    }
  }

  return (
    <View style={styles.contenedor}>
      <Encabezado
        titulo={traslado ? `Traslado de ${traslado.promotorOrigenNombre} a ${traslado.promotorDestinoNombre}` : 'Traslado'}
        rutaVolverTexto="Cargues"
        anchoMaximo={ANCHO_ADMIN.formulario}
        sinMenuLateral
      />

      {cargando ? (
        <View style={styles.centrado}>
          <ActivityIndicator size="large" color={COLORES_ADMIN.vino} />
        </View>
      ) : !traslado ? (
        <EmptyState icono="cube-outline" mensaje="Este traslado ya no existe." />
      ) : (
        <ContenedorAncho anchoMaximo={ANCHO_ADMIN.formulario} llenarAlto>
          <Pressable style={styles.botonEscanear} onPress={() => setEscanerVisible(true)}>
            <Ionicons name="camera-outline" size={18} color={COLORES_ADMIN.textoInverso} />
            <Text style={styles.botonEscanearTexto}>Escanear producto</Text>
          </Pressable>

          {lineas.length === 0 ? (
            <EmptyState icono="cube-outline" mensaje="Este traslado no tiene productos." />
          ) : (
            <FlatList
              data={lineas}
              keyExtractor={(l) => l.id}
              contentContainerStyle={styles.lista}
              renderItem={({ item }) => (
                <Pressable
                  style={[styles.fila, item.estado !== 'PENDIENTE' && styles.filaCompletada]}
                  onPress={() => item.estado === 'PENDIENTE' && abrirLinea(item)}
                  disabled={item.estado !== 'PENDIENTE'}
                >
                  <View style={styles.filaTexto}>
                    <Text style={styles.filaNombre} numberOfLines={2}>
                      {item.productoNombre}
                    </Text>
                    <Text style={styles.filaCantidad}>
                      {item.estado === 'PENDIENTE'
                        ? `Planeado: ${item.cantidadPlaneada}`
                        : `Entregado: ${item.cantidadEntregada} de ${item.cantidadPlaneada}`}
                    </Text>
                  </View>
                  {item.estado === 'PENDIENTE' ? (
                    <Text style={styles.filaAccion}>Toca para confirmar</Text>
                  ) : (
                    <Insignia
                      texto={item.estado === 'ENTREGADA' ? 'Confirmado' : 'A revisar'}
                      estado={item.estado === 'ENTREGADA' ? 'exito' : 'error'}
                    />
                  )}
                </Pressable>
              )}
            />
          )}
        </ContenedorAncho>
      )}

      <EscanerCodigoBarras
        visible={escanerVisible}
        activa={!lineaPendiente}
        colorAcento={COLORES_ADMIN.vino}
        titulo="Escanear producto del traslado"
        onCerrar={() => setEscanerVisible(false)}
        onDetectado={manejarCodigoEscaneado}
        overlayEncimaDeCamara={
          lineaPendiente && (
            <View style={[StyleSheet.absoluteFill, styles.fondoModal]}>
              <View style={styles.tarjetaModal}>
                <Text style={styles.modalTitulo}>{lineaPendiente.productoNombre}</Text>
                <Text style={styles.modalTexto}>
                  Planeado: {lineaPendiente.cantidadPlaneada} — ¿cuántas se trasladan?
                </Text>
                <TextInput
                  style={styles.modalInput}
                  placeholder="0"
                  placeholderTextColor={COLORES_ADMIN.textoSecundario}
                  value={cantidadTexto}
                  onChangeText={(texto) => setCantidadTexto(texto.replace(/\D/g, ''))}
                  keyboardType="number-pad"
                  autoFocus
                />
                {Number.isFinite(cantidadIngresada) &&
                  cantidadIngresada < lineaPendiente.cantidadPlaneada && (
                    <>
                      <Text style={styles.modalTexto}>Falta explicar el faltante (obligatorio):</Text>
                      <TextInput
                        style={styles.modalInputMotivo}
                        placeholder="Ej. se dañó, no aparece..."
                        placeholderTextColor={COLORES_ADMIN.textoSecundario}
                        value={motivoTexto}
                        onChangeText={setMotivoTexto}
                        multiline
                      />
                    </>
                  )}
                <View style={styles.modalAcciones}>
                  <Pressable onPress={() => setLineaPendiente(null)} disabled={guardando}>
                    <Text style={styles.modalCancelar}>Cancelar</Text>
                  </Pressable>
                  <Pressable
                    style={[
                      styles.modalConfirmar,
                      (!cantidadTexto || faltaMotivo || guardando) && styles.botonDeshabilitado,
                    ]}
                    disabled={!cantidadTexto || faltaMotivo || guardando}
                    onPress={confirmar}
                  >
                    {guardando ? (
                      <ActivityIndicator color={COLORES_ADMIN.textoInverso} size="small" />
                    ) : (
                      <Text style={styles.modalConfirmarTexto}>Confirmar</Text>
                    )}
                  </Pressable>
                </View>
              </View>
            </View>
          )
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  contenedor: { flex: 1, backgroundColor: COLORES_ADMIN.background },
  centrado: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: ESPACIADO_ADMIN.xxl },
  botonEscanear: {
    flexDirection: 'row',
    margin: ESPACIADO_ADMIN.xl,
    marginBottom: ESPACIADO_ADMIN.md,
    backgroundColor: COLORES_ADMIN.vino,
    borderRadius: RADII_ADMIN.md,
    paddingVertical: ESPACIADO_ADMIN.lg,
    alignItems: 'center',
    justifyContent: 'center',
    gap: ESPACIADO_ADMIN.sm,
  },
  botonEscanearTexto: { ...TEXTO_ADMIN.tituloTarjeta, color: COLORES_ADMIN.textoInverso },
  lista: { paddingHorizontal: ESPACIADO_ADMIN.xl, paddingBottom: ESPACIADO_ADMIN.xl, gap: ESPACIADO_ADMIN.sm },
  fila: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: COLORES_ADMIN.superficieMasBaja,
    borderWidth: 1,
    borderColor: COLORES_ADMIN.bordeSuave,
    borderRadius: RADII_ADMIN.md,
    padding: ESPACIADO_ADMIN.lg,
    gap: ESPACIADO_ADMIN.md,
  },
  filaCompletada: { opacity: 0.6 },
  filaTexto: { flex: 1, gap: 2 },
  filaNombre: TEXTO_ADMIN.tituloTarjeta,
  filaCantidad: TEXTO_ADMIN.datoSecundario,
  filaAccion: { ...TEXTO_ADMIN.boton, color: COLORES_ADMIN.vino, textAlign: 'right' },
  fondoModal: {
    flex: 1,
    backgroundColor: 'rgba(41,23,15,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: ESPACIADO_ADMIN.xxl,
  },
  tarjetaModal: {
    width: '100%',
    maxWidth: 340,
    backgroundColor: COLORES_ADMIN.superficieMasBaja,
    borderWidth: 1,
    borderColor: COLORES_ADMIN.bordeSuave,
    borderRadius: RADII_ADMIN.lg,
    padding: ESPACIADO_ADMIN.xxl,
    gap: ESPACIADO_ADMIN.sm,
  },
  modalTitulo: TEXTO_ADMIN.tituloSeccion,
  modalTexto: TEXTO_ADMIN.cuerpoSecundario,
  modalInput: {
    ...TEXTO_ADMIN.datoGrande,
    borderWidth: 1,
    borderColor: COLORES_ADMIN.bordeSuave,
    borderRadius: RADII_ADMIN.md,
    paddingHorizontal: ESPACIADO_ADMIN.lg,
    paddingVertical: ESPACIADO_ADMIN.md,
    textAlign: 'center',
  },
  modalInputMotivo: {
    ...TEXTO_ADMIN.cuerpo,
    borderWidth: 1,
    borderColor: COLORES_ADMIN.bordeSuave,
    borderRadius: RADII_ADMIN.md,
    paddingHorizontal: ESPACIADO_ADMIN.lg,
    paddingVertical: ESPACIADO_ADMIN.sm,
    minHeight: 56,
    textAlignVertical: 'top',
  },
  modalAcciones: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: ESPACIADO_ADMIN.xl,
    marginTop: ESPACIADO_ADMIN.xs,
  },
  modalCancelar: TEXTO_ADMIN.boton,
  modalConfirmar: {
    backgroundColor: COLORES_ADMIN.vino,
    borderRadius: RADII_ADMIN.sm,
    paddingHorizontal: ESPACIADO_ADMIN.xl,
    paddingVertical: ESPACIADO_ADMIN.sm,
    minWidth: 100,
    alignItems: 'center',
  },
  modalConfirmarTexto: { ...TEXTO_ADMIN.boton, color: COLORES_ADMIN.textoInverso },
  botonDeshabilitado: { opacity: 0.5 },
});
