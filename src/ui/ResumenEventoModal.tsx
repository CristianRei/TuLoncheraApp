import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { formatearPesos } from '@/core/dinero';
import { formatearRangoHoras } from '@/core/horas';
import type { Evento } from '@/core/tipos';
import { getDb } from '@/db/client';
import { getDispositivoId } from '@/db/dispositivo';
import { cancelarEvento } from '@/db/eventos';
import type { ProgresoMetaDiaria } from '@/db/metasDiarias';
import { obtenerResumenVentasEvento, type ResumenVentasEvento } from '@/db/tableroPromotores';

import { BarraAvanceMeta } from './BarraAvanceMeta';
import { Insignia } from './Insignia';
import { COLORES_ADMIN, RADII_ADMIN, TEXTO_ADMIN, TIPOGRAFIA_ADMIN } from './tema';

/**
 * Resumen de un evento, desde "Promotores del día": avance de la meta, lo
 * vendido en su punto ese día (total, por medio de pago y por integrante —
 * también quien ya no está, si vendió aquí) y las acciones "Editar evento"
 * (el detalle de siempre del calendario) y "Cancelar evento" (motivo
 * obligatorio; nadie del equipo puede seguir vendiendo en él).
 */
export function ResumenEventoModal({
  evento,
  progreso,
  editable,
  adminId,
  onCerrar,
  onEditar,
  onCancelado,
}: {
  evento: Evento;
  progreso: ProgresoMetaDiaria | null;
  editable: boolean;
  adminId: string;
  onCerrar: () => void;
  onEditar: () => void;
  onCancelado: () => void;
}) {
  const [resumen, setResumen] = useState<ResumenVentasEvento | null>(null);
  const [cancelando, setCancelando] = useState(false);
  const [motivo, setMotivo] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let vigente = true;
    getDb()
      .then((db) => obtenerResumenVentasEvento(db, evento))
      .then((r) => {
        if (vigente) setResumen(r);
      });
    return () => {
      vigente = false;
    };
  }, [evento]);

  async function confirmarCancelacion() {
    setGuardando(true);
    setError(null);
    try {
      const db = await getDb();
      await cancelarEvento(db, { eventoId: evento.id, motivo: motivo.trim() }, await getDispositivoId(db), adminId);
      onCancelado();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo cancelar el evento.');
    } finally {
      setGuardando(false);
    }
  }

  const activo = editable && evento.estado !== 'CANCELADO';

  return (
    <Modal visible animationType="fade" transparent onRequestClose={onCerrar}>
      <View style={styles.fondo}>
        <View style={styles.tarjeta}>
          <ScrollView contentContainerStyle={styles.contenido} keyboardShouldPersistTaps="handled">
            <View style={styles.encabezado}>
              <View style={{ flex: 1 }}>
                <Text style={styles.titulo}>
                  {evento.empresaNombre} · {evento.puntoNombre}
                </Text>
                <Text style={styles.subtitulo}>
                  {evento.fecha} · {formatearRangoHoras(evento.horaInicio, evento.horaFin) ?? 'Todo el día'}
                </Text>
              </View>
              {evento.estado === 'CANCELADO' && <Insignia texto="Cancelado" estado="error" />}
            </View>

            {progreso ? (
              <BarraAvanceMeta
                vendido={progreso.totalVendidoHoy}
                meta={progreso.metaDiaria}
                etiqueta={evento.promotorIds.length > 1 ? 'Meta del equipo' : 'Meta del día'}
                grande
              />
            ) : (
              <Text style={styles.nota}>Este evento no tiene meta del día.</Text>
            )}

            {!resumen ? (
              <ActivityIndicator color={COLORES_ADMIN.vino} />
            ) : (
              <>
                <Text style={styles.seccion}>Vendido en el evento</Text>
                <View style={styles.totales}>
                  <View style={[styles.total, styles.totalDestacado]}>
                    <Text style={[styles.totalEtiqueta, styles.totalEtiquetaDestacada]}>Total</Text>
                    <Text style={[styles.totalValor, styles.totalValorDestacado]}>{formatearPesos(resumen.totalVendido)}</Text>
                    <Text style={styles.totalDetalle}>
                      {resumen.facturas} {resumen.facturas === 1 ? 'factura' : 'facturas'}
                    </Text>
                  </View>
                  {(['EFECTIVO', 'TRANSFERENCIA', 'LIBRANZA'] as const).map((metodo) => (
                    <View key={metodo} style={styles.total}>
                      <Text style={styles.totalEtiqueta}>
                        {metodo === 'EFECTIVO' ? 'Efectivo' : metodo === 'TRANSFERENCIA' ? 'Transferencia' : 'Libranza'}
                      </Text>
                      <Text style={styles.totalValor}>{formatearPesos(resumen.porMetodo[metodo])}</Text>
                    </View>
                  ))}
                </View>

                <Text style={styles.seccion}>Equipo</Text>
                {resumen.porPromotor.length === 0 ? (
                  <Text style={styles.nota}>Sin promotores asignados.</Text>
                ) : (
                  resumen.porPromotor.map((p) => {
                    const participacion = resumen.totalVendido > 0 ? p.cifras.totalVendido / resumen.totalVendido : 0;
                    return (
                      <View key={p.promotorId} style={styles.integrante}>
                        <View style={styles.integranteFila}>
                          <Text style={styles.integranteNombre}>{p.promotorNombre}</Text>
                          {!evento.promotorIds.includes(p.promotorId) && <Insignia texto="Ya no está" estado="neutro" />}
                          <Text style={styles.integranteTotal}>{formatearPesos(p.cifras.totalVendido)}</Text>
                        </View>
                        <View style={styles.participacionPista}>
                          <View style={[styles.participacion, { width: `${Math.round(participacion * 100)}%` }]} />
                        </View>
                        <Text style={styles.nota}>
                          {p.cifras.facturas} {p.cifras.facturas === 1 ? 'factura' : 'facturas'} · efectivo{' '}
                          {formatearPesos(p.cifras.porMetodo.EFECTIVO)} · transferencia{' '}
                          {formatearPesos(p.cifras.porMetodo.TRANSFERENCIA)} · libranza{' '}
                          {formatearPesos(p.cifras.porMetodo.LIBRANZA)}
                        </Text>
                      </View>
                    );
                  })
                )}
              </>
            )}

            {evento.motivoCancelacion && <Text style={styles.error}>Motivo de cancelación: {evento.motivoCancelacion}</Text>}

            {cancelando && (
              <View style={styles.bloqueCancelar}>
                <Text style={styles.nota}>
                  Se cancela para todo el equipo: desde que sus celulares reciban el cambio, nadie podrá seguir vendiendo en
                  este evento. Lo ya vendido queda registrado. No se puede deshacer.
                </Text>
                <TextInput
                  style={styles.input}
                  placeholder="Motivo (obligatorio)"
                  placeholderTextColor="#A8988F"
                  value={motivo}
                  onChangeText={setMotivo}
                  multiline
                  editable={!guardando}
                />
              </View>
            )}
            {error && <Text style={styles.error}>{error}</Text>}

            <View style={styles.acciones}>
              <Pressable onPress={cancelando ? () => setCancelando(false) : onCerrar} disabled={guardando}>
                <Text style={styles.cerrar}>{cancelando ? 'Volver' : 'Cerrar'}</Text>
              </Pressable>
              {activo && !cancelando && (
                <>
                  <Pressable style={styles.botonSecundario} onPress={onEditar} accessibilityRole="button">
                    <Ionicons name="create-outline" size={15} color={COLORES_ADMIN.vino} />
                    <Text style={styles.botonSecundarioTexto}>Editar evento</Text>
                  </Pressable>
                  <Pressable style={styles.botonPeligro} onPress={() => setCancelando(true)} accessibilityRole="button">
                    <Text style={styles.botonPeligroTexto}>Cancelar evento</Text>
                  </Pressable>
                </>
              )}
              {cancelando && (
                <Pressable
                  style={[styles.botonPeligro, (!motivo.trim() || guardando) && styles.deshabilitado]}
                  disabled={!motivo.trim() || guardando}
                  onPress={confirmarCancelacion}
                  accessibilityRole="button"
                >
                  {guardando ? (
                    <ActivityIndicator size="small" color={COLORES_ADMIN.textoInverso} />
                  ) : (
                    <Text style={styles.botonPeligroTexto}>Confirmar cancelación</Text>
                  )}
                </Pressable>
              )}
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fondo: {
    flex: 1,
    backgroundColor: 'rgba(42,24,16,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  tarjeta: {
    width: '100%',
    maxWidth: 520,
    maxHeight: '90%',
    backgroundColor: COLORES_ADMIN.superficieMasBaja,
    borderRadius: RADII_ADMIN.lg,
  },
  contenido: { padding: 20, gap: 12 },
  encabezado: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  titulo: { fontSize: 17, fontFamily: TIPOGRAFIA_ADMIN.negrita, color: COLORES_ADMIN.texto },
  subtitulo: { ...TEXTO_ADMIN.cuerpoSecundario, marginTop: 2 },
  seccion: { ...TEXTO_ADMIN.etiqueta, color: COLORES_ADMIN.vino, marginTop: 4 },
  nota: { ...TEXTO_ADMIN.nota },
  totales: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  total: {
    flexGrow: 1,
    flexBasis: '22%',
    minWidth: 100,
    borderWidth: 1,
    borderColor: COLORES_ADMIN.bordeSuave,
    borderRadius: RADII_ADMIN.sm,
    padding: 8,
    gap: 2,
  },
  totalDestacado: { backgroundColor: COLORES_ADMIN.vino, borderColor: COLORES_ADMIN.vino },
  totalEtiqueta: {
    fontSize: 10,
    fontFamily: TIPOGRAFIA_ADMIN.semiNegrita,
    color: COLORES_ADMIN.textoSecundario,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  totalEtiquetaDestacada: { color: COLORES_ADMIN.superficieAlta },
  totalValor: { fontSize: 14, fontFamily: TIPOGRAFIA_ADMIN.monoSemiNegrita, color: COLORES_ADMIN.texto },
  totalValorDestacado: { color: COLORES_ADMIN.textoInverso, fontSize: 16 },
  totalDetalle: { fontSize: 11, fontFamily: TIPOGRAFIA_ADMIN.regular, color: COLORES_ADMIN.dorado },
  integrante: {
    gap: 4,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: COLORES_ADMIN.bordeSuave,
  },
  integranteFila: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  integranteNombre: { ...TEXTO_ADMIN.tituloTarjeta, flex: 1 },
  integranteTotal: { fontSize: 14, fontFamily: TIPOGRAFIA_ADMIN.monoSemiNegrita, color: COLORES_ADMIN.texto },
  participacionPista: { height: 6, borderRadius: 3, backgroundColor: COLORES_ADMIN.superficie, overflow: 'hidden' },
  participacion: { height: '100%', backgroundColor: COLORES_ADMIN.dorado, borderRadius: 3 },
  bloqueCancelar: { gap: 8 },
  input: {
    borderWidth: 1,
    borderColor: COLORES_ADMIN.bordeSuave,
    borderRadius: RADII_ADMIN.sm,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    fontFamily: TIPOGRAFIA_ADMIN.regular,
    color: COLORES_ADMIN.texto,
    minHeight: 64,
    textAlignVertical: 'top',
  },
  error: { ...TEXTO_ADMIN.nota, color: COLORES_ADMIN.error },
  acciones: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: 12,
    marginTop: 4,
  },
  cerrar: { fontSize: 14, fontFamily: TIPOGRAFIA_ADMIN.medio, color: COLORES_ADMIN.textoSecundario },
  botonSecundario: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: COLORES_ADMIN.dorado,
    backgroundColor: COLORES_ADMIN.superficieBaja,
    borderRadius: RADII_ADMIN.sm,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  botonSecundarioTexto: { fontSize: 13, fontFamily: TIPOGRAFIA_ADMIN.semiNegrita, color: COLORES_ADMIN.vino },
  botonPeligro: {
    backgroundColor: COLORES_ADMIN.error,
    borderRadius: RADII_ADMIN.sm,
    paddingHorizontal: 14,
    paddingVertical: 10,
    alignItems: 'center',
  },
  botonPeligroTexto: { color: COLORES_ADMIN.textoInverso, fontSize: 13, fontFamily: TIPOGRAFIA_ADMIN.semiNegrita },
  deshabilitado: { opacity: 0.5 },
});
