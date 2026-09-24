import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { Traslado, TrasladoLinea } from '@/core/tipos';
import { getDb } from '@/db/client';
import { getDispositivoId } from '@/db/dispositivo';
import { obtenerTraslado, reducirLineaTraslado, resolverLineaEnRevisionTraslado } from '@/db/traslados';
import { COLORES } from '@/ui/colores';
import { ContenedorAncho } from '@/ui/ContenedorAncho';
import { useEsPantallaAncha } from '@/ui/useEsPantallaAncha';
import { useRequiereSesion } from '@/ui/useRequiereSesion';
import { useRecargarConDatosNuevos } from '@/ui/useVersionDatos';

function formatearFecha(tsCliente: string): string {
  return new Date(tsCliente).toLocaleString('es-CO', { dateStyle: 'long', timeStyle: 'short' });
}

export default function DetalleTraslado() {
  const usuario = useRequiereSesion(['ADMIN']);
  const { id } = useLocalSearchParams<{ id: string }>();
  const [traslado, setTraslado] = useState<Traslado | null>(null);
  const [lineas, setLineas] = useState<TrasladoLinea[]>([]);
  const [cargando, setCargando] = useState(true);
  const [lineaEnEdicion, setLineaEnEdicion] = useState<TrasladoLinea | null>(null);
  const [modo, setModo] = useState<'reducir' | 'resolver'>('reducir');
  const [valorTexto, setValorTexto] = useState('');
  const [guardando, setGuardando] = useState(false);
  const insets = useSafeAreaInsets();
  const anchaPantalla = useEsPantallaAncha();

  const cargar = useCallback(async () => {
    const db = await getDb();
    const resultado = await obtenerTraslado(db, id);
    setTraslado(resultado?.traslado ?? null);
    setLineas(resultado?.lineas ?? []);
    setCargando(false);
  }, [id]);

  useEffect(() => {
    (async () => {
      await cargar();
    })();
  }, [cargar]);
  useRecargarConDatosNuevos(cargar);

  if (!usuario) return null;
  const usuarioActual = usuario;

  function abrirReducir(linea: TrasladoLinea) {
    setLineaEnEdicion(linea);
    setModo('reducir');
    setValorTexto(String(linea.cantidadPlaneada));
  }

  function abrirResolver(linea: TrasladoLinea) {
    setLineaEnEdicion(linea);
    setModo('resolver');
    setValorTexto(String(linea.cantidadPlaneada - linea.cantidadEntregada));
  }

  async function confirmarModal() {
    if (!lineaEnEdicion) return;
    const valor = parseInt(valorTexto, 10);
    if (!Number.isFinite(valor) || valor < 0) return;

    setGuardando(true);
    try {
      const db = await getDb();
      const dispositivoId = await getDispositivoId(db);
      if (modo === 'reducir') {
        await reducirLineaTraslado(db, { lineaId: lineaEnEdicion.id, nuevaCantidad: valor });
      } else {
        await resolverLineaEnRevisionTraslado(
          db,
          { lineaId: lineaEnEdicion.id, cantidadAdicional: valor, ejecutorId: usuarioActual.id },
          dispositivoId
        );
      }
      setLineaEnEdicion(null);
      await cargar();
    } catch (error) {
      Alert.alert('No se pudo actualizar', error instanceof Error ? error.message : 'Error inesperado.');
    } finally {
      setGuardando(false);
    }
  }

  return (
    <View style={styles.contenedor}>
      <View
        style={[
          anchaPantalla ? styles.encabezadoAncho : styles.encabezado,
          { paddingTop: anchaPantalla ? 20 : insets.top + 20 },
        ]}
      >
        <ContenedorAncho anchoMaximo={720} style={styles.encabezadoContenido}>
          {!anchaPantalla && (
            <Pressable onPress={() => router.back()}>
              <Text style={styles.volver}>‹ Cargue</Text>
            </Pressable>
          )}
          <Text style={anchaPantalla ? styles.tituloAncho : styles.titulo}>Detalle del traslado</Text>
        </ContenedorAncho>
      </View>

      {cargando ? (
        <View style={styles.centrado}>
          <ActivityIndicator size="large" color={COLORES.oscuro} />
        </View>
      ) : !traslado ? (
        <View style={styles.centrado}>
          <Text style={styles.vacio}>Este traslado ya no existe.</Text>
        </View>
      ) : (
        <ContenedorAncho anchoMaximo={720} llenarAlto>
          <View style={styles.resumen}>
            <Text style={styles.resumenPromotor}>
              {traslado.promotorOrigenNombre} → {traslado.promotorDestinoNombre}
            </Text>
            <Text style={styles.resumenDetalle}>{formatearFecha(traslado.tsCliente)}</Text>
            <Text style={styles.resumenDetalle}>Estado: {traslado.estado}</Text>
          </View>

          <FlatList
            data={lineas}
            keyExtractor={(l) => l.id}
            contentContainerStyle={styles.lista}
            renderItem={({ item }) => (
              <View style={[styles.fila, item.estado === 'REVISAR' && styles.filaRevisar]}>
                <View style={styles.filaTexto}>
                  <Text style={styles.filaNombre} numberOfLines={2}>
                    {item.productoNombre}
                  </Text>
                  <Text style={styles.filaDetalle}>
                    Planeado: {item.cantidadPlaneada} · Entregado: {item.cantidadEntregada}
                  </Text>
                  {item.estado === 'REVISAR' && item.motivoRevision && (
                    <Text style={styles.filaMotivo}>Motivo: {item.motivoRevision}</Text>
                  )}
                </View>
                {item.estado === 'PENDIENTE' && (
                  <Pressable style={styles.botonAccion} onPress={() => abrirReducir(item)}>
                    <Text style={styles.botonAccionTexto}>Reducir</Text>
                  </Pressable>
                )}
                {item.estado === 'REVISAR' && (
                  <Pressable style={styles.botonAccion} onPress={() => abrirResolver(item)}>
                    <Text style={styles.botonAccionTexto}>Resolver</Text>
                  </Pressable>
                )}
              </View>
            )}
          />
        </ContenedorAncho>
      )}

      <Modal visible={lineaEnEdicion !== null} animationType="fade" transparent>
        <View style={styles.fondoModal}>
          <View style={styles.tarjetaModal}>
            <Text style={styles.modalTitulo}>
              {modo === 'reducir' ? 'Reducir cantidad planeada' : 'Entregar el faltante'}
            </Text>
            <Text style={styles.modalTexto}>{lineaEnEdicion?.productoNombre}</Text>
            <TextInput
              style={styles.modalInput}
              keyboardType="number-pad"
              value={valorTexto}
              onChangeText={setValorTexto}
              editable={!guardando}
            />
            <View style={styles.modalAcciones}>
              <Pressable onPress={() => setLineaEnEdicion(null)} disabled={guardando}>
                <Text style={styles.modalCancelar}>Cancelar</Text>
              </Pressable>
              <Pressable
                style={[styles.modalConfirmar, guardando && styles.botonDeshabilitado]}
                disabled={guardando}
                onPress={confirmarModal}
              >
                {guardando ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.modalConfirmarTexto}>Guardar</Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  contenedor: { flex: 1, backgroundColor: '#FBEDED' },
  encabezado: { backgroundColor: COLORES.oscuro, paddingHorizontal: 20, paddingBottom: 16 },
  encabezadoAncho: { backgroundColor: 'transparent', paddingHorizontal: 20, paddingBottom: 16 },
  encabezadoContenido: { gap: 4 },
  volver: { color: '#FFFFFF', fontSize: 14, textDecorationLine: 'underline' },
  titulo: { color: '#FFFFFF', fontSize: 17, fontWeight: '700' },
  tituloAncho: { color: COLORES.oscuro, fontSize: 20, fontWeight: '700' },
  centrado: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  vacio: { fontSize: 14, color: '#888' },
  resumen: {
    backgroundColor: '#FFFFFF',
    margin: 20,
    marginBottom: 0,
    borderRadius: 14,
    padding: 16,
    gap: 4,
  },
  resumenPromotor: { fontSize: 16, fontWeight: '700', color: '#333' },
  resumenDetalle: { fontSize: 13, color: '#777' },
  lista: { padding: 20, gap: 10 },
  fila: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 12,
    gap: 12,
  },
  filaRevisar: {
    borderWidth: 1,
    borderColor: '#F8C8C8',
    backgroundColor: '#FDF2F2',
  },
  filaTexto: { flex: 1, gap: 2 },
  filaNombre: { fontSize: 14, fontWeight: '600', color: '#333' },
  filaDetalle: { fontSize: 12, color: '#888' },
  filaMotivo: { fontSize: 12, color: '#B00020', marginTop: 2 },
  botonAccion: {
    borderWidth: 1.5,
    borderColor: COLORES.oscuro,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  botonAccionTexto: { fontSize: 12, fontWeight: '700', color: COLORES.oscuro },
  fondoModal: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  tarjetaModal: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: '#FFF',
    borderRadius: 18,
    padding: 22,
    gap: 12,
  },
  modalTitulo: { fontSize: 17, fontWeight: '700', color: '#333' },
  modalTexto: { fontSize: 13, color: '#777' },
  modalInput: {
    borderWidth: 1,
    borderColor: '#DDD',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'center',
  },
  modalAcciones: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: 20,
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
