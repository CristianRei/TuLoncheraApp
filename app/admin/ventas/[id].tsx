import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { formatearPesos } from '@/core/dinero';
import type { Venta, VentaItem } from '@/core/tipos';
import { getDb } from '@/db/client';
import { obtenerComprobanteRemoto } from '@/db/comprobantesRemotos';
import { getDispositivoId } from '@/db/dispositivo';
import { anularVenta, obtenerVenta, VentaYaAnuladaError } from '@/db/ventas';
import { COLORES } from '@/ui/colores';
import { ContenedorAncho } from '@/ui/ContenedorAncho';
import { useEsPantallaAncha } from '@/ui/useEsPantallaAncha';
import { useRequiereSesion } from '@/ui/useRequiereSesion';

function formatearFecha(tsCliente: string): string {
  const fecha = new Date(tsCliente);
  return fecha.toLocaleString('es-CO', { dateStyle: 'long', timeStyle: 'short' });
}

const ETIQUETAS_METODO: Record<string, string> = {
  EFECTIVO: 'Efectivo',
  TRANSFERENCIA: 'Transferencia',
  LIBRANZA: 'Libranza',
};

export default function DetalleVenta() {
  const usuario = useRequiereSesion(['ADMIN']);
  const { id } = useLocalSearchParams<{ id: string }>();
  const [venta, setVenta] = useState<Venta | null>(null);
  const [items, setItems] = useState<VentaItem[]>([]);
  const [cargando, setCargando] = useState(true);
  const [modalVisible, setModalVisible] = useState(false);
  const [motivo, setMotivo] = useState('');
  const [anulando, setAnulando] = useState(false);
  const insets = useSafeAreaInsets();
  const anchaPantalla = useEsPantallaAncha();

  async function cargar() {
    setCargando(true);
    const db = await getDb();
    const resultado = await obtenerVenta(db, id);
    let ventaResuelta = resultado?.venta ?? null;

    // Si es transferencia y este dispositivo no tiene el comprobante local
    // (la venta pudo registrarse en otro dispositivo), intenta completarlo
    // con lo ya sincronizado a Supabase.
    if (ventaResuelta && ventaResuelta.metodoPago === 'TRANSFERENCIA' && !ventaResuelta.comprobanteUri) {
      try {
        const remoto = await obtenerComprobanteRemoto(ventaResuelta.id);
        if (remoto) ventaResuelta = { ...ventaResuelta, comprobanteUri: remoto.comprobanteUri };
      } catch {
        // Sin red o Supabase no disponible — se queda sin comprobante, sin error visible.
      }
    }

    setVenta(ventaResuelta);
    setItems(resultado?.items ?? []);
    setCargando(false);
  }

  useEffect(() => {
    (async () => {
      await cargar();
    })();
  }, [id]);

  if (!usuario) return null;
  const usuarioActual = usuario;

  async function confirmarAnulacion() {
    if (motivo.trim().length === 0) return;
    setAnulando(true);
    try {
      const db = await getDb();
      const dispositivoId = await getDispositivoId(db);
      await anularVenta(
        db,
        { ventaId: id, adminId: usuarioActual.id, motivo: motivo.trim() },
        dispositivoId
      );
      setModalVisible(false);
      setMotivo('');
      await cargar();
      Alert.alert('Venta anulada', 'El producto volvió al inventario del promotor.');
    } catch (error) {
      if (error instanceof VentaYaAnuladaError) {
        Alert.alert('Ya estaba anulada', error.message);
        setModalVisible(false);
        await cargar();
      } else {
        throw error;
      }
    } finally {
      setAnulando(false);
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
              <Text style={styles.volver}>‹ Ventas</Text>
            </Pressable>
          )}
          <Text style={anchaPantalla ? styles.tituloAncho : styles.titulo}>Detalle de venta</Text>
        </ContenedorAncho>
      </View>

      {cargando ? (
        <View style={styles.centrado}>
          <ActivityIndicator size="large" color={COLORES.oscuro} />
        </View>
      ) : !venta ? (
        <View style={styles.centrado}>
          <Text style={styles.vacio}>Esta venta ya no existe.</Text>
        </View>
      ) : (
        <ContenedorAncho anchoMaximo={720} llenarAlto>
          <View style={styles.resumen}>
            <Text style={styles.resumenPromotor}>{venta.promotorNombre}</Text>
            <Text style={styles.resumenDetalle}>
              {venta.numeroRecibo} · {formatearFecha(venta.tsCliente)}
            </Text>
            <Text style={styles.resumenDetalle}>
              Pagado con {ETIQUETAS_METODO[venta.metodoPago] ?? venta.metodoPago}
            </Text>
          </View>

          {venta.metodoPago === 'TRANSFERENCIA' && (
            <View style={styles.bloqueComprobante}>
              <Text style={styles.comprobanteTitulo}>Comprobante de transferencia</Text>
              {venta.comprobanteUri ? (
                <Image source={{ uri: venta.comprobanteUri }} style={styles.comprobanteImagen} />
              ) : (
                <Text style={styles.comprobanteFaltante}>Sin comprobante</Text>
              )}
            </View>
          )}

          {venta.anulada && (
            <View style={styles.avisoAnulada}>
              <Text style={styles.avisoAnuladaTitulo}>Venta anulada</Text>
              <Text style={styles.avisoAnuladaMotivo}>{venta.motivoAnulacion}</Text>
            </View>
          )}

          <FlatList
            data={items}
            keyExtractor={(item) => item.productoId}
            contentContainerStyle={styles.lista}
            renderItem={({ item }) => (
              <View style={styles.fila}>
                <View style={styles.filaTexto}>
                  <Text style={styles.filaNombre} numberOfLines={2}>
                    {item.productoNombre}
                  </Text>
                  <Text style={styles.filaDetalle}>
                    {item.cantidad} × {formatearPesos(item.precioUnitario)}
                  </Text>
                </View>
                <Text style={styles.filaSubtotal}>
                  {formatearPesos(item.cantidad * item.precioUnitario)}
                </Text>
              </View>
            )}
          />

          <View style={styles.pie}>
            <View style={styles.totalFila}>
              <Text style={styles.totalEtiqueta}>Total</Text>
              <Text style={styles.totalValor}>{formatearPesos(venta.total)}</Text>
            </View>
            {!venta.anulada && (
              <Pressable style={styles.botonAnular} onPress={() => setModalVisible(true)}>
                <Text style={styles.botonAnularTexto}>Anular venta</Text>
              </Pressable>
            )}
          </View>
        </ContenedorAncho>
      )}

      <Modal visible={modalVisible} animationType="fade" transparent>
        <View style={styles.fondoModal}>
          <View style={styles.tarjetaModal}>
            <Text style={styles.modalTitulo}>Anular venta</Text>
            <Text style={styles.modalTexto}>
              El producto vuelve al inventario del promotor. Esta acción queda registrada.
            </Text>
            <TextInput
              style={styles.modalInput}
              placeholder="Motivo (obligatorio)"
              placeholderTextColor="#999"
              value={motivo}
              onChangeText={setMotivo}
              multiline
              editable={!anulando}
            />
            <View style={styles.modalAcciones}>
              <Pressable
                onPress={() => {
                  setModalVisible(false);
                  setMotivo('');
                }}
                disabled={anulando}
              >
                <Text style={styles.modalCancelar}>Cancelar</Text>
              </Pressable>
              <Pressable
                style={[
                  styles.modalConfirmar,
                  (motivo.trim().length === 0 || anulando) && styles.botonDeshabilitado,
                ]}
                disabled={motivo.trim().length === 0 || anulando}
                onPress={confirmarAnulacion}
              >
                {anulando ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.modalConfirmarTexto}>Confirmar</Text>
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
  encabezadoContenido: {
    gap: 4,
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
  },
  resumen: {
    backgroundColor: '#FFFFFF',
    margin: 20,
    marginBottom: 0,
    borderRadius: 14,
    padding: 16,
    gap: 4,
  },
  resumenPromotor: {
    fontSize: 16,
    fontWeight: '700',
    color: '#333',
  },
  resumenDetalle: {
    fontSize: 13,
    color: '#777',
  },
  bloqueComprobante: {
    backgroundColor: '#FFFFFF',
    marginHorizontal: 20,
    marginTop: 12,
    borderRadius: 14,
    padding: 16,
    gap: 8,
  },
  comprobanteTitulo: {
    fontSize: 13,
    fontWeight: '700',
    color: '#555',
  },
  comprobanteImagen: {
    width: '100%',
    height: 220,
    borderRadius: 10,
    backgroundColor: '#F0F0F0',
  },
  comprobanteFaltante: {
    fontSize: 13,
    color: '#B00020',
  },
  avisoAnulada: {
    backgroundColor: '#FBE4E4',
    borderWidth: 1,
    borderColor: '#B00020',
    marginHorizontal: 20,
    marginTop: 12,
    borderRadius: 12,
    padding: 14,
    gap: 4,
  },
  avisoAnuladaTitulo: {
    fontSize: 14,
    fontWeight: '700',
    color: '#B00020',
  },
  avisoAnuladaMotivo: {
    fontSize: 13,
    color: '#7A1420',
  },
  lista: {
    padding: 20,
    gap: 10,
  },
  fila: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 12,
  },
  filaTexto: {
    flex: 1,
    gap: 2,
  },
  filaNombre: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
  },
  filaDetalle: {
    fontSize: 13,
    color: '#888',
  },
  filaSubtotal: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORES.oscuro,
  },
  pie: {
    backgroundColor: '#FFFFFF',
    marginHorizontal: 20,
    marginBottom: 20,
    padding: 16,
    borderRadius: 14,
    gap: 12,
  },
  totalFila: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  totalEtiqueta: {
    fontSize: 15,
    fontWeight: '600',
    color: '#555',
  },
  totalValor: {
    fontSize: 20,
    fontWeight: '800',
    color: COLORES.oscuro,
  },
  botonAnular: {
    borderWidth: 1.5,
    borderColor: '#B00020',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  botonAnularTexto: {
    color: '#B00020',
    fontSize: 14,
    fontWeight: '700',
  },
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
  modalTitulo: {
    fontSize: 17,
    fontWeight: '700',
    color: '#333',
  },
  modalTexto: {
    fontSize: 13,
    color: '#777',
  },
  modalInput: {
    borderWidth: 1,
    borderColor: '#DDD',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    minHeight: 70,
    textAlignVertical: 'top',
  },
  modalAcciones: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: 20,
  },
  modalCancelar: {
    fontSize: 14,
    color: '#888',
  },
  modalConfirmar: {
    backgroundColor: '#B00020',
    borderRadius: 10,
    paddingHorizontal: 20,
    paddingVertical: 10,
    minWidth: 100,
    alignItems: 'center',
  },
  modalConfirmarTexto: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '700',
  },
  botonDeshabilitado: {
    opacity: 0.5,
  },
});
