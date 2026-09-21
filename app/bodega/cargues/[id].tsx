import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
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
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { Cargue, CargueLinea } from '@/core/tipos';
import { getDb } from '@/db/client';
import { getDispositivoId } from '@/db/dispositivo';
import { confirmarLineaCargue, obtenerCargue } from '@/db/cargues';
import { buscarProductoPorCodigoBarras } from '@/db/productos';
import { COLORES } from '@/ui/colores';
import { ContenedorAncho } from '@/ui/ContenedorAncho';
import { EscanerCodigoBarras } from '@/ui/EscanerCodigoBarras';
import { useRequiereSesion } from '@/ui/useRequiereSesion';

export default function EntregarCargue() {
  const usuario = useRequiereSesion(['BODEGA']);
  const { id } = useLocalSearchParams<{ id: string }>();
  const [cargue, setCargue] = useState<Cargue | null>(null);
  const [lineas, setLineas] = useState<CargueLinea[]>([]);
  const [cargando, setCargando] = useState(true);
  const [escanerVisible, setEscanerVisible] = useState(false);
  const [lineaPendiente, setLineaPendiente] = useState<CargueLinea | null>(null);
  const [cantidadTexto, setCantidadTexto] = useState('');
  const [motivoTexto, setMotivoTexto] = useState('');
  const [guardando, setGuardando] = useState(false);
  const insets = useSafeAreaInsets();

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const db = await getDb();
      const resultado = await obtenerCargue(db, id);
      setCargue(resultado?.cargue ?? null);
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
      Alert.alert('No está en este cargue', `"${producto.nombre}" no está pendiente en este cargue.`);
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    abrirLinea(linea);
  }

  function abrirLinea(linea: CargueLinea) {
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
      await confirmarLineaCargue(
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
      <View style={[styles.encabezado, { paddingTop: insets.top + 20 }]}>
        <ContenedorAncho anchoMaximo={640} style={styles.encabezadoContenido}>
          <Pressable onPress={() => router.back()}>
            <Text style={styles.volver}>‹ Cargues</Text>
          </Pressable>
          <Text style={styles.titulo}>{cargue ? `Cargue de ${cargue.promotorNombre}` : 'Cargue'}</Text>
        </ContenedorAncho>
      </View>

      {cargando ? (
        <View style={styles.centrado}>
          <ActivityIndicator size="large" color={COLORES.oscuro} />
        </View>
      ) : !cargue ? (
        <View style={styles.centrado}>
          <Text style={styles.vacio}>Este cargue ya no existe.</Text>
        </View>
      ) : (
        <ContenedorAncho anchoMaximo={640} llenarAlto>
          <Pressable style={styles.botonEscanear} onPress={() => setEscanerVisible(true)}>
            <Ionicons name="camera-outline" size={18} color="#FFF" />
            <Text style={styles.botonEscanearTexto}>Escanear producto</Text>
          </Pressable>

          {lineas.length === 0 ? (
            <View style={styles.centrado}>
              <Text style={styles.vacio}>Este cargue no tiene productos.</Text>
            </View>
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
                  <Text
                    style={[
                      styles.filaEstado,
                      item.estado === 'ENTREGADA' && styles.filaEstadoEntregada,
                      item.estado === 'REVISAR' && styles.filaEstadoRevisar,
                    ]}
                  >
                    {item.estado === 'PENDIENTE'
                      ? 'Toca para entregar'
                      : item.estado === 'ENTREGADA'
                        ? 'Entregado'
                        : 'A revisar'}
                  </Text>
                </Pressable>
              )}
            />
          )}
        </ContenedorAncho>
      )}

      <EscanerCodigoBarras
        visible={escanerVisible}
        activa={!lineaPendiente}
        colorAcento={COLORES.oscuro}
        titulo="Escanear producto del cargue"
        onCerrar={() => setEscanerVisible(false)}
        onDetectado={manejarCodigoEscaneado}
        overlayEncimaDeCamara={
          lineaPendiente && (
            <View style={[StyleSheet.absoluteFill, styles.fondoModal]}>
              <View style={styles.tarjetaModal}>
                <Text style={styles.modalTitulo}>{lineaPendiente.productoNombre}</Text>
                <Text style={styles.modalTexto}>
                  Planeado: {lineaPendiente.cantidadPlaneada} — ¿cuántas entregas?
                </Text>
                <TextInput
                  style={styles.modalInput}
                  placeholder="0"
                  placeholderTextColor="#999"
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
                        placeholderTextColor="#999"
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
                      <ActivityIndicator color="#fff" size="small" />
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
  contenedor: { flex: 1, backgroundColor: '#FBEDED' },
  encabezado: { backgroundColor: COLORES.oscuro, paddingHorizontal: 20, paddingBottom: 16 },
  encabezadoContenido: { gap: 4 },
  volver: { color: '#FFFFFF', fontSize: 14, textDecorationLine: 'underline' },
  titulo: { color: '#FFFFFF', fontSize: 17, fontWeight: '700' },
  centrado: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  vacio: { fontSize: 14, color: '#888', textAlign: 'center' },
  botonEscanear: {
    flexDirection: 'row',
    margin: 20,
    marginBottom: 12,
    backgroundColor: COLORES.oscuro,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  botonEscanearTexto: { color: '#FFF', fontSize: 16, fontWeight: '700' },
  lista: { paddingHorizontal: 20, paddingBottom: 20, gap: 10 },
  fila: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 14,
    gap: 12,
  },
  filaCompletada: {
    opacity: 0.6,
  },
  filaTexto: { flex: 1, gap: 2 },
  filaNombre: { fontSize: 14, fontWeight: '600', color: '#333' },
  filaCantidad: { fontSize: 13, color: '#777' },
  filaEstado: { fontSize: 11, fontWeight: '700', color: COLORES.oscuro, textAlign: 'right' },
  filaEstadoEntregada: { color: '#2E7D32' },
  filaEstadoRevisar: { color: '#B00020' },
  fondoModal: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  tarjetaModal: {
    width: '100%',
    maxWidth: 340,
    backgroundColor: '#FFF',
    borderRadius: 18,
    padding: 22,
    gap: 10,
  },
  modalTitulo: { fontSize: 16, fontWeight: '700', color: '#333' },
  modalTexto: { fontSize: 13, color: '#777' },
  modalInput: {
    borderWidth: 1,
    borderColor: '#DDD',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 22,
    fontWeight: '700',
    textAlign: 'center',
  },
  modalInputMotivo: {
    borderWidth: 1,
    borderColor: '#DDD',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
    minHeight: 56,
    textAlignVertical: 'top',
  },
  modalAcciones: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: 20,
    marginTop: 4,
  },
  modalCancelar: { fontSize: 14, color: '#888' },
  modalConfirmar: {
    backgroundColor: COLORES.oscuro,
    borderRadius: 10,
    paddingHorizontal: 20,
    paddingVertical: 10,
    minWidth: 100,
    alignItems: 'center',
  },
  modalConfirmarTexto: { color: '#FFF', fontSize: 14, fontWeight: '700' },
  botonDeshabilitado: { opacity: 0.5 },
});
