import Ionicons from '@expo/vector-icons/Ionicons';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { formatearRangoHoras } from '@/core/horas';
import type { Evento } from '@/core/tipos';
import { getDb } from '@/db/client';
import { getDispositivoId } from '@/db/dispositivo';
import {
  asignarPromotorAEvento,
  listarEventosPorRango,
  listarPromotoresDelDia,
  moverPromotorDeEvento,
  retirarPromotorDeEvento,
  type PromotorDelDia,
} from '@/db/eventos';

import { Insignia } from './Insignia';
import { COLORES_ADMIN, RADII_ADMIN, TEXTO_ADMIN, TIPOGRAFIA_ADMIN } from './tema';

type Accion =
  | { tipo: 'MOVER'; promotor: PromotorDelDia; desde: Evento }
  | { tipo: 'ASIGNAR'; promotor: PromotorDelDia }
  | { tipo: 'RETIRAR'; promotor: PromotorDelDia; evento: Evento };

function lugar(evento: Evento): string {
  return `${evento.empresaNombre} · ${evento.puntoNombre}`;
}

function horario(evento: Evento): string {
  return formatearRangoHoras(evento.horaInicio, evento.horaFin) ?? 'Todo el día';
}

/** Los promotores del día y los eventos no cancelados de ese día (destinos para mover o asignar), por hora. */
async function leerDia(fecha: string) {
  const db = await getDb();
  const [promotores, eventos] = await Promise.all([
    listarPromotoresDelDia(db, fecha),
    listarEventosPorRango(db, { desde: fecha, hasta: fecha }),
  ]);
  return {
    promotores,
    eventos: eventos
      .filter((e) => e.estado !== 'CANCELADO')
      .sort((a, b) => (a.horaInicio ?? '').localeCompare(b.horaInicio ?? '')),
  };
}

/**
 * "Promotores del día" en el calendario del admin: quién está en qué evento
 * ese día y quién no tiene ninguno (sin evento no puede vender). Desde aquí se
 * mueve a un promotor a otro evento (ej. se canceló el suyo a última hora y
 * pasa a acompañar a otro), se le asigna uno, o se le retira del suyo — con
 * motivo, y desde ese momento deja de poder vender.
 */
export function PromotoresDelDia({
  fecha,
  editable,
  adminId,
  recargarCon,
  onCambio,
}: {
  fecha: string;
  /** Falso en días pasados: solo se consulta. */
  editable: boolean;
  adminId: string;
  /** Cuando cambia (ej. los eventos del mes), la lista se vuelve a leer. */
  recargarCon: unknown;
  onCambio: () => void;
}) {
  const [filas, setFilas] = useState<PromotorDelDia[]>([]);
  const [eventosDelDia, setEventosDelDia] = useState<Evento[]>([]);
  const [cargando, setCargando] = useState(true);
  const [accion, setAccion] = useState<Accion | null>(null);
  const [destinoId, setDestinoId] = useState<string | null>(null);
  const [motivo, setMotivo] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const aplicar = useCallback((datos: Awaited<ReturnType<typeof leerDia>>) => {
    setFilas(datos.promotores);
    setEventosDelDia(datos.eventos);
    setCargando(false);
  }, []);

  const cargar = useCallback(async () => aplicar(await leerDia(fecha)), [aplicar, fecha]);

  useEffect(() => {
    let vigente = true;
    leerDia(fecha).then((datos) => {
      if (vigente) aplicar(datos);
    });
    return () => {
      vigente = false;
    };
  }, [aplicar, fecha, recargarCon]);

  function abrir(nueva: Accion) {
    setAccion(nueva);
    setDestinoId(null);
    setMotivo('');
    setError(null);
  }

  async function confirmar() {
    if (!accion) return;
    setGuardando(true);
    setError(null);
    try {
      const db = await getDb();
      const dispositivoId = await getDispositivoId(db);
      const promotorId = accion.promotor.promotorId;
      if (accion.tipo === 'RETIRAR') {
        await retirarPromotorDeEvento(db, { eventoId: accion.evento.id, promotorId, motivo }, dispositivoId, adminId);
      } else if (destinoId && accion.tipo === 'MOVER') {
        await moverPromotorDeEvento(
          db,
          { promotorId, desdeEventoId: accion.desde.id, haciaEventoId: destinoId },
          dispositivoId,
          adminId
        );
      } else if (destinoId) {
        await asignarPromotorAEvento(db, { eventoId: destinoId, promotorId }, dispositivoId, adminId);
      }
      setAccion(null);
      await cargar();
      onCambio();
    } catch (errorAccion) {
      setError(errorAccion instanceof Error ? errorAccion.message : 'No se pudo guardar el cambio.');
    } finally {
      setGuardando(false);
    }
  }

  const conEvento = filas.filter((f) => f.eventos.length > 0).length;
  const destinos = accion && accion.tipo !== 'RETIRAR'
    ? eventosDelDia.filter((e) => !e.promotorIds.includes(accion.promotor.promotorId))
    : [];
  const puedeConfirmar =
    !guardando && (accion?.tipo === 'RETIRAR' ? motivo.trim().length > 0 : destinoId !== null);

  return (
    <View style={styles.tarjeta}>
      <View style={styles.encabezado}>
        <View style={{ flex: 1 }}>
          <Text style={styles.titulo}>Promotores del día</Text>
          <Text style={styles.subtitulo}>
            {fecha} · {conEvento} con evento · {filas.length - conEvento} sin evento
          </Text>
        </View>
        <Ionicons name="people-outline" size={22} color={COLORES_ADMIN.vino} />
      </View>
      <Text style={styles.nota}>
        Un promotor sin evento ese día no puede vender. Un promotor no puede estar en dos eventos a la misma hora.
      </Text>

      {cargando ? (
        <ActivityIndicator color={COLORES_ADMIN.vino} />
      ) : filas.length === 0 ? (
        <Text style={styles.nota}>No hay promotores activos.</Text>
      ) : (
        filas.map((fila) => (
          <View key={fila.promotorId} style={styles.fila}>
            <View style={styles.filaEncabezado}>
              <Text style={styles.nombre}>{fila.promotorNombre}</Text>
              {fila.eventos.length === 0 && <Insignia texto="Sin evento · no puede vender" estado="error" />}
              {fila.horariosCruzados && <Insignia texto="Horarios cruzados" estado="alerta" />}
            </View>

            {fila.eventos.map((evento) => (
              <View key={evento.id} style={styles.evento}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.eventoLugar}>{lugar(evento)}</Text>
                  <Text style={styles.eventoDetalle}>
                    {horario(evento)}
                    {evento.promotorIds.length > 1
                      ? ` · Con ${evento.promotorNombres.filter((_, i) => evento.promotorIds[i] !== fila.promotorId).join(', ')}`
                      : ''}
                  </Text>
                </View>
                {editable && (
                  <View style={styles.acciones}>
                    <Pressable
                      style={styles.botonSecundario}
                      onPress={() => abrir({ tipo: 'MOVER', promotor: fila, desde: evento })}
                      accessibilityRole="button"
                      accessibilityLabel={`Mover a ${fila.promotorNombre} a otro evento`}
                    >
                      <Ionicons name="swap-horizontal" size={14} color={COLORES_ADMIN.vino} />
                      <Text style={styles.botonSecundarioTexto}>Mover</Text>
                    </Pressable>
                    <Pressable
                      style={styles.botonPeligro}
                      onPress={() => abrir({ tipo: 'RETIRAR', promotor: fila, evento })}
                      accessibilityRole="button"
                      accessibilityLabel={`Retirar a ${fila.promotorNombre} de ${lugar(evento)}`}
                    >
                      <Ionicons name="remove-circle-outline" size={14} color={COLORES_ADMIN.error} />
                      <Text style={styles.botonPeligroTexto}>Retirar</Text>
                    </Pressable>
                  </View>
                )}
              </View>
            ))}

            {editable && fila.eventos.length === 0 && (
              <Pressable
                style={[styles.botonSecundario, styles.botonAsignar]}
                onPress={() => abrir({ tipo: 'ASIGNAR', promotor: fila })}
                accessibilityRole="button"
              >
                <Ionicons name="add" size={14} color={COLORES_ADMIN.vino} />
                <Text style={styles.botonSecundarioTexto}>Asignar a un evento</Text>
              </Pressable>
            )}
          </View>
        ))
      )}

      {accion && (
        <Modal visible animationType="fade" transparent onRequestClose={() => setAccion(null)}>
          <View style={styles.fondoModal}>
            <View style={styles.tarjetaModal}>
              <ScrollView contentContainerStyle={{ gap: 10 }} keyboardShouldPersistTaps="handled">
                {accion.tipo === 'RETIRAR' ? (
                  <>
                    <Text style={styles.modalTitulo}>
                      Retirar a {accion.promotor.promotorNombre} de {lugar(accion.evento)}
                    </Text>
                    <Text style={styles.nota}>
                      {accion.promotor.eventos.length > 1
                        ? 'Sigue en su otro evento de este día.'
                        : 'Queda sin evento este día: no podrá seguir vendiendo desde que su celular reciba el cambio (al instante con conexión).'}{' '}
                      Lo que ya vendió queda registrado donde lo vendió.
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
                  </>
                ) : (
                  <>
                    <Text style={styles.modalTitulo}>
                      {accion.tipo === 'MOVER'
                        ? `Mover a ${accion.promotor.promotorNombre}`
                        : `Asignar a ${accion.promotor.promotorNombre}`}
                    </Text>
                    <Text style={styles.nota}>
                      {accion.tipo === 'MOVER'
                        ? `Sale de ${lugar(accion.desde)} y entra al evento que elijas. Lo que ya vendió queda registrado donde lo vendió.`
                        : 'Elige el evento de este día al que se une.'}
                    </Text>
                    {destinos.length === 0 ? (
                      <Text style={styles.nota}>
                        No hay otro evento este día. Créalo con &quot;Nuevo evento&quot; y vuelve aquí.
                      </Text>
                    ) : (
                      destinos.map((evento) => {
                        const elegido = destinoId === evento.id;
                        return (
                          <Pressable
                            key={evento.id}
                            style={[styles.destino, elegido && styles.destinoElegido]}
                            onPress={() => setDestinoId(evento.id)}
                            accessibilityRole="radio"
                            accessibilityState={{ selected: elegido }}
                          >
                            <Ionicons
                              name={elegido ? 'radio-button-on' : 'radio-button-off'}
                              size={18}
                              color={COLORES_ADMIN.vino}
                            />
                            <View style={{ flex: 1 }}>
                              <Text style={styles.eventoLugar}>{lugar(evento)}</Text>
                              <Text style={styles.eventoDetalle}>
                                {horario(evento)} ·{' '}
                                {evento.promotorNombres.length > 0
                                  ? `Con ${evento.promotorNombres.join(', ')}`
                                  : 'Sin promotor'}
                              </Text>
                            </View>
                          </Pressable>
                        );
                      })
                    )}
                  </>
                )}

                {error && <Text style={styles.error}>{error}</Text>}

                <View style={styles.modalAcciones}>
                  <Pressable onPress={() => setAccion(null)} disabled={guardando}>
                    <Text style={styles.modalCancelar}>Volver</Text>
                  </Pressable>
                  <Pressable
                    style={[
                      accion.tipo === 'RETIRAR' ? styles.botonConfirmarPeligro : styles.botonConfirmar,
                      !puedeConfirmar && styles.deshabilitado,
                    ]}
                    disabled={!puedeConfirmar}
                    onPress={confirmar}
                  >
                    {guardando ? (
                      <ActivityIndicator
                        size="small"
                        color={accion.tipo === 'RETIRAR' ? COLORES_ADMIN.textoInverso : COLORES_ADMIN.vino}
                      />
                    ) : (
                      <Text
                        style={accion.tipo === 'RETIRAR' ? styles.botonConfirmarPeligroTexto : styles.botonConfirmarTexto}
                      >
                        {accion.tipo === 'RETIRAR' ? 'Retirar' : accion.tipo === 'MOVER' ? 'Mover' : 'Asignar'}
                      </Text>
                    )}
                  </Pressable>
                </View>
              </ScrollView>
            </View>
          </View>
        </Modal>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  tarjeta: {
    backgroundColor: COLORES_ADMIN.superficieMasBaja,
    borderRadius: RADII_ADMIN.lg,
    borderWidth: 1,
    borderColor: COLORES_ADMIN.bordeSuave,
    padding: 16,
    gap: 10,
  },
  encabezado: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  titulo: { fontSize: 16, fontFamily: TIPOGRAFIA_ADMIN.negrita, color: COLORES_ADMIN.vino },
  subtitulo: { ...TEXTO_ADMIN.cuerpoSecundario, marginTop: 2 },
  nota: { ...TEXTO_ADMIN.nota },
  fila: {
    borderTopWidth: 1,
    borderTopColor: COLORES_ADMIN.bordeSuave,
    paddingTop: 10,
    gap: 6,
  },
  filaEncabezado: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 },
  nombre: { ...TEXTO_ADMIN.tituloTarjeta },
  evento: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
    backgroundColor: COLORES_ADMIN.superficieBaja,
    borderRadius: RADII_ADMIN.sm,
    padding: 10,
  },
  eventoLugar: { fontSize: 13, fontFamily: TIPOGRAFIA_ADMIN.semiNegrita, color: COLORES_ADMIN.texto },
  eventoDetalle: { fontSize: 12, fontFamily: TIPOGRAFIA_ADMIN.regular, color: COLORES_ADMIN.textoSecundario },
  acciones: { flexDirection: 'row', gap: 8 },
  botonSecundario: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    borderColor: COLORES_ADMIN.bordeSuave,
    backgroundColor: COLORES_ADMIN.superficieMasBaja,
    borderRadius: RADII_ADMIN.sm,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  botonSecundarioTexto: { fontSize: 12, fontFamily: TIPOGRAFIA_ADMIN.semiNegrita, color: COLORES_ADMIN.vino },
  botonAsignar: { alignSelf: 'flex-start' },
  botonPeligro: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    borderColor: COLORES_ADMIN.error,
    backgroundColor: COLORES_ADMIN.superficieMasBaja,
    borderRadius: RADII_ADMIN.sm,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  botonPeligroTexto: { fontSize: 12, fontFamily: TIPOGRAFIA_ADMIN.semiNegrita, color: COLORES_ADMIN.error },
  fondoModal: {
    flex: 1,
    backgroundColor: 'rgba(42,24,16,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  tarjetaModal: {
    width: '100%',
    maxWidth: 440,
    maxHeight: '85%',
    backgroundColor: COLORES_ADMIN.superficieMasBaja,
    borderRadius: RADII_ADMIN.lg,
    padding: 20,
  },
  modalTitulo: { fontSize: 16, fontFamily: TIPOGRAFIA_ADMIN.negrita, color: COLORES_ADMIN.texto },
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
  destino: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderColor: COLORES_ADMIN.bordeSuave,
    borderRadius: RADII_ADMIN.sm,
    padding: 10,
  },
  destinoElegido: { borderColor: COLORES_ADMIN.vino, backgroundColor: COLORES_ADMIN.superficieBaja },
  error: { ...TEXTO_ADMIN.nota, color: COLORES_ADMIN.error },
  modalAcciones: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: 16,
    marginTop: 6,
  },
  modalCancelar: { fontSize: 14, fontFamily: TIPOGRAFIA_ADMIN.medio, color: COLORES_ADMIN.textoSecundario },
  botonConfirmar: {
    backgroundColor: COLORES_ADMIN.dorado,
    borderRadius: RADII_ADMIN.sm,
    paddingHorizontal: 16,
    paddingVertical: 10,
    minWidth: 96,
    alignItems: 'center',
  },
  botonConfirmarTexto: { color: COLORES_ADMIN.vino, fontSize: 13, fontFamily: TIPOGRAFIA_ADMIN.negrita },
  botonConfirmarPeligro: {
    backgroundColor: COLORES_ADMIN.error,
    borderRadius: RADII_ADMIN.sm,
    paddingHorizontal: 16,
    paddingVertical: 10,
    minWidth: 96,
    alignItems: 'center',
  },
  botonConfirmarPeligroTexto: { color: COLORES_ADMIN.textoInverso, fontSize: 13, fontFamily: TIPOGRAFIA_ADMIN.semiNegrita },
  deshabilitado: { opacity: 0.5 },
});
