import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { formatearPesos } from '@/core/dinero';
import type { Venta, VentaItem } from '@/core/tipos';
import { getDb } from '@/db/client';
import { obtenerComprobanteRemoto } from '@/db/comprobantesRemotos';
import { getDispositivoId } from '@/db/dispositivo';
import { anularVenta, obtenerVenta, VentaYaAnuladaError } from '@/db/ventas';
import { ContenedorAncho } from '@/ui/ContenedorAncho';
import { Encabezado } from '@/ui/Encabezado';
import { ModalConfirmacion } from '@/ui/ModalConfirmacion';
import { ANCHO_ADMIN, COLORES_ADMIN, ESTADO_ADMIN, RADII_ADMIN } from '@/ui/tema';
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
  const [avisoVisible, setAvisoVisible] = useState<{ titulo: string; mensaje: string } | null>(null);

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
      setAvisoVisible({ titulo: 'Venta anulada', mensaje: 'El producto volvió al inventario del promotor.' });
    } catch (error) {
      if (error instanceof VentaYaAnuladaError) {
        setAvisoVisible({ titulo: 'Ya estaba anulada', mensaje: error.message });
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
      <Encabezado titulo="Detalle de venta" rutaVolverTexto="Ventas" />

      {cargando ? (
        <View style={styles.centrado}>
          <ActivityIndicator size="large" color={COLORES_ADMIN.vino} />
        </View>
      ) : !venta ? (
        <View style={styles.centrado}>
          <Text style={styles.vacio}>Esta venta ya no existe.</Text>
        </View>
      ) : (
        <ContenedorAncho anchoMaximo={ANCHO_ADMIN.lista} llenarAlto>
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

      {avisoVisible && (
        <ModalConfirmacion
          visible
          titulo={avisoVisible.titulo}
          mensaje={avisoVisible.mensaje}
          textoConfirmar="Entendido"
          onConfirmar={() => setAvisoVisible(null)}
          onCancelar={() => setAvisoVisible(null)}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  contenedor: {
    flex: 1,
    backgroundColor: COLORES_ADMIN.background,
  },
  centrado: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  vacio: {
    fontSize: 14,
    color: COLORES_ADMIN.textoSecundario,
  },
  resumen: {
    backgroundColor: COLORES_ADMIN.superficieMasBaja,
    margin: 20,
    marginBottom: 0,
    borderRadius: RADII_ADMIN.md,
    padding: 16,
    gap: 4,
  },
  resumenPromotor: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORES_ADMIN.texto,
  },
  resumenDetalle: {
    fontSize: 13,
    color: COLORES_ADMIN.textoSecundario,
  },
  bloqueComprobante: {
    backgroundColor: COLORES_ADMIN.superficieMasBaja,
    marginHorizontal: 20,
    marginTop: 12,
    borderRadius: RADII_ADMIN.md,
    padding: 16,
    gap: 8,
  },
  comprobanteTitulo: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORES_ADMIN.textoSecundario,
  },
  comprobanteImagen: {
    width: '100%',
    height: 220,
    borderRadius: RADII_ADMIN.sm,
    backgroundColor: COLORES_ADMIN.superficieBaja,
  },
  comprobanteFaltante: {
    fontSize: 13,
    color: ESTADO_ADMIN.error.texto,
  },
  avisoAnulada: {
    backgroundColor: ESTADO_ADMIN.error.fondo,
    borderWidth: 1,
    borderColor: ESTADO_ADMIN.error.texto,
    marginHorizontal: 20,
    marginTop: 12,
    borderRadius: RADII_ADMIN.md,
    padding: 14,
    gap: 4,
  },
  avisoAnuladaTitulo: {
    fontSize: 14,
    fontWeight: '700',
    color: ESTADO_ADMIN.error.texto,
  },
  avisoAnuladaMotivo: {
    fontSize: 13,
    color: ESTADO_ADMIN.error.texto,
  },
  lista: {
    padding: 20,
    gap: 10,
  },
  fila: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: COLORES_ADMIN.superficieMasBaja,
    borderRadius: RADII_ADMIN.md,
    padding: 12,
  },
  filaTexto: {
    flex: 1,
    gap: 2,
  },
  filaNombre: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORES_ADMIN.texto,
  },
  filaDetalle: {
    fontSize: 13,
    color: COLORES_ADMIN.textoSecundario,
  },
  filaSubtotal: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORES_ADMIN.vino,
  },
  pie: {
    backgroundColor: COLORES_ADMIN.superficieMasBaja,
    marginHorizontal: 20,
    marginBottom: 20,
    padding: 16,
    borderRadius: RADII_ADMIN.md,
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
    color: COLORES_ADMIN.textoSecundario,
  },
  totalValor: {
    fontSize: 20,
    fontWeight: '800',
    color: COLORES_ADMIN.vino,
  },
  botonAnular: {
    borderWidth: 1.5,
    borderColor: ESTADO_ADMIN.error.texto,
    borderRadius: RADII_ADMIN.md,
    paddingVertical: 12,
    alignItems: 'center',
  },
  botonAnularTexto: {
    color: ESTADO_ADMIN.error.texto,
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
    backgroundColor: COLORES_ADMIN.superficieMasBaja,
    borderRadius: RADII_ADMIN.lg,
    padding: 22,
    gap: 12,
  },
  modalTitulo: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORES_ADMIN.texto,
  },
  modalTexto: {
    fontSize: 13,
    color: COLORES_ADMIN.textoSecundario,
  },
  modalInput: {
    borderWidth: 1,
    borderColor: COLORES_ADMIN.bordeSuave,
    borderRadius: RADII_ADMIN.sm,
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
    color: COLORES_ADMIN.textoSecundario,
  },
  modalConfirmar: {
    backgroundColor: ESTADO_ADMIN.error.texto,
    borderRadius: RADII_ADMIN.sm,
    paddingHorizontal: 20,
    paddingVertical: 10,
    minWidth: 100,
    alignItems: 'center',
  },
  modalConfirmarTexto: {
    color: COLORES_ADMIN.textoInverso,
    fontSize: 14,
    fontWeight: '700',
  },
  botonDeshabilitado: {
    opacity: 0.5,
  },
});
