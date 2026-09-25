import { useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import type { Traslado, TrasladoLinea } from '@/core/tipos';
import { getDb } from '@/db/client';
import { getDispositivoId } from '@/db/dispositivo';
import { obtenerTraslado, reducirLineaTraslado, resolverLineaEnRevisionTraslado } from '@/db/traslados';
import { ContenedorAncho } from '@/ui/ContenedorAncho';
import { Encabezado } from '@/ui/Encabezado';
import { EmptyState } from '@/ui/EmptyState';
import { ANCHO_ADMIN, COLORES_ADMIN, ESPACIADO_ADMIN, RADII_ADMIN, TIPOGRAFIA_ADMIN } from '@/ui/tema';
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
      <Encabezado titulo="Detalle del traslado" rutaVolverTexto="Cargue" />

      {cargando ? (
        <View style={styles.centrado}>
          <ActivityIndicator size="large" color={COLORES_ADMIN.vino} />
        </View>
      ) : !traslado ? (
        <EmptyState icono="swap-horizontal-outline" mensaje="Este traslado ya no existe." />
      ) : (
        <ContenedorAncho anchoMaximo={ANCHO_ADMIN.lista} llenarAlto>
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
  contenedor: { flex: 1, backgroundColor: COLORES_ADMIN.background },
  centrado: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: ESPACIADO_ADMIN.xxl },
  resumen: {
    backgroundColor: COLORES_ADMIN.superficieMasBaja,
    marginHorizontal: ESPACIADO_ADMIN.xl,
    marginTop: ESPACIADO_ADMIN.lg,
    borderRadius: RADII_ADMIN.lg,
    borderWidth: 1,
    borderColor: COLORES_ADMIN.bordeSuave,
    padding: ESPACIADO_ADMIN.lg,
    gap: ESPACIADO_ADMIN.xs,
  },
  resumenPromotor: { fontSize: 16, fontFamily: TIPOGRAFIA_ADMIN.semiNegrita, color: COLORES_ADMIN.texto },
  resumenDetalle: { fontSize: 13, fontFamily: TIPOGRAFIA_ADMIN.regular, color: COLORES_ADMIN.textoSecundario },
  lista: { padding: ESPACIADO_ADMIN.xl, gap: ESPACIADO_ADMIN.sm },
  fila: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: COLORES_ADMIN.superficieMasBaja,
    borderRadius: RADII_ADMIN.md,
    borderWidth: 1,
    borderColor: COLORES_ADMIN.bordeSuave,
    padding: ESPACIADO_ADMIN.md,
    gap: ESPACIADO_ADMIN.md,
  },
  filaRevisar: {
    borderColor: COLORES_ADMIN.dorado,
    backgroundColor: COLORES_ADMIN.superficieBaja,
  },
  filaTexto: { flex: 1, gap: 2 },
  filaNombre: { fontSize: 14, fontFamily: TIPOGRAFIA_ADMIN.semiNegrita, color: COLORES_ADMIN.texto },
  filaDetalle: { fontSize: 12, fontFamily: TIPOGRAFIA_ADMIN.regular, color: COLORES_ADMIN.textoSecundario },
  filaMotivo: { fontSize: 12, fontFamily: TIPOGRAFIA_ADMIN.medio, color: COLORES_ADMIN.error, marginTop: 2 },
  botonAccion: {
    borderWidth: 1.5,
    borderColor: COLORES_ADMIN.vino,
    borderRadius: RADII_ADMIN.sm,
    paddingHorizontal: ESPACIADO_ADMIN.md,
    paddingVertical: ESPACIADO_ADMIN.sm,
  },
  botonAccionTexto: { fontSize: 12, fontFamily: TIPOGRAFIA_ADMIN.semiNegrita, color: COLORES_ADMIN.vino },
  fondoModal: {
    flex: 1,
    backgroundColor: 'rgba(42,24,16,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: ESPACIADO_ADMIN.xl,
  },
  tarjetaModal: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: COLORES_ADMIN.superficieMasBaja,
    borderRadius: RADII_ADMIN.lg,
    padding: ESPACIADO_ADMIN.xl,
    gap: ESPACIADO_ADMIN.md,
  },
  modalTitulo: { fontSize: 16, fontFamily: TIPOGRAFIA_ADMIN.negrita, color: COLORES_ADMIN.texto },
  modalTexto: { fontSize: 13, fontFamily: TIPOGRAFIA_ADMIN.regular, color: COLORES_ADMIN.textoSecundario },
  modalInput: {
    borderWidth: 1,
    borderColor: COLORES_ADMIN.bordeSuave,
    borderRadius: RADII_ADMIN.md,
    paddingHorizontal: ESPACIADO_ADMIN.md,
    paddingVertical: ESPACIADO_ADMIN.md,
    fontSize: 16,
    fontFamily: TIPOGRAFIA_ADMIN.monoSemiNegrita,
    color: COLORES_ADMIN.texto,
    textAlign: 'center',
  },
  modalAcciones: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: ESPACIADO_ADMIN.xl,
  },
  modalCancelar: { fontSize: 14, fontFamily: TIPOGRAFIA_ADMIN.medio, color: COLORES_ADMIN.textoSecundario },
  modalConfirmar: {
    backgroundColor: COLORES_ADMIN.vino,
    borderRadius: RADII_ADMIN.md,
    paddingHorizontal: ESPACIADO_ADMIN.xl,
    paddingVertical: ESPACIADO_ADMIN.sm + 2,
    minWidth: 100,
    alignItems: 'center',
  },
  modalConfirmarTexto: { color: COLORES_ADMIN.textoInverso, fontSize: 14, fontFamily: TIPOGRAFIA_ADMIN.semiNegrita },
  botonDeshabilitado: { opacity: 0.5 },
});
