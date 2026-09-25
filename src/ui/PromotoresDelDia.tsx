import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { formatearPesos } from '@/core/dinero';
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
import { obtenerProgresoMetasDiarias, type ProgresoMetaDiaria } from '@/db/metasDiarias';
import {
  obtenerCierresDelDia,
  obtenerCifrasPromotoresDelDia,
  type CierreDelDia,
  type CierresDelDia,
  type CifrasVentas,
} from '@/db/tableroPromotores';

import { BarraAvanceMeta } from './BarraAvanceMeta';
import { Insignia } from './Insignia';
import { ResumenEventoModal } from './ResumenEventoModal';
import { COLORES_ADMIN, RADII_ADMIN, TEXTO_ADMIN, TIPOGRAFIA_ADMIN } from './tema';
import { useEsPantallaAncha } from './useEsPantallaAncha';
import { useRecargarConDatosNuevos } from './useVersionDatos';

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

/**
 * Los promotores del día (con evento primero), los eventos no cancelados de
 * ese día (destinos para mover o asignar), lo que lleva facturado cada
 * promotor y el avance de la meta de cada evento. Todo de la base local: las
 * ventas de los celulares ya llegan al admin con Realtime.
 */
async function leerDia(fecha: string) {
  const db = await getDb();
  const [promotores, eventos, cifras, progresos] = await Promise.all([
    listarPromotoresDelDia(db, fecha),
    listarEventosPorRango(db, { desde: fecha, hasta: fecha }),
    obtenerCifrasPromotoresDelDia(db, fecha),
    obtenerProgresoMetasDiarias(db, fecha),
  ]);
  return {
    promotores: [...promotores].sort((a, b) => Number(b.eventos.length > 0) - Number(a.eventos.length > 0)),
    eventos: eventos
      .filter((e) => e.estado !== 'CANCELADO')
      .sort((a, b) => (a.horaInicio ?? '').localeCompare(b.horaInicio ?? '')),
    cifras,
    progresos: new Map(progresos.map((p) => [p.eventoId, p])),
  };
}

/** Arqueo y conteo de cierre de cada promotor (en Supabase; best-effort). */
async function leerCierres(fecha: string, promotores: PromotorDelDia[]) {
  return obtenerCierresDelDia(await getDb(), fecha, promotores);
}

function Cifra({ etiqueta, valor, detalle, destacada = false }: { etiqueta: string; valor: string; detalle?: string; destacada?: boolean }) {
  return (
    <View style={[styles.cifra, destacada && styles.cifraDestacada]}>
      <Text style={[styles.cifraEtiqueta, destacada && styles.cifraEtiquetaDestacada]}>{etiqueta}</Text>
      <Text style={[styles.cifraValor, destacada && styles.cifraValorDestacado]}>{valor}</Text>
      {detalle ? <Text style={styles.cifraDetalle}>{detalle}</Text> : null}
    </View>
  );
}

function EstadoCierre({ cierre, sinConexion }: { cierre: CierreDelDia | undefined; sinConexion: boolean }) {
  if (!cierre) return <Text style={styles.nota}>Consultando arqueo y conteo…</Text>;
  const { arqueo, conteoHecho } = cierre;
  return (
    <View style={styles.cierre}>
      {arqueo ? (
        <Insignia
          texto={
            arqueo.diferencia === 0
              ? `Arqueo: contó ${formatearPesos(arqueo.efectivoContado)} · cuadra`
              : `Arqueo: contó ${formatearPesos(arqueo.efectivoContado)} · ${arqueo.diferencia > 0 ? 'sobran' : 'faltan'} ${formatearPesos(Math.abs(arqueo.diferencia))}`
          }
          estado={arqueo.diferencia === 0 ? 'exito' : 'error'}
        />
      ) : (
        <Insignia texto={sinConexion ? 'Arqueo: sin conexión' : 'Arqueo pendiente'} estado="neutro" />
      )}
      {conteoHecho ? (
        <Insignia texto="Conteo de cierre hecho" estado="exito" />
      ) : (
        <Insignia texto={sinConexion ? 'Conteo: sin conexión' : 'Conteo pendiente'} estado="neutro" />
      )}
    </View>
  );
}

/**
 * "Promotores del día" en el calendario del admin: una tarjeta por promotor
 * con su evento, la barra de la meta del día, lo que lleva facturado (total,
 * efectivo, transferencia, libranza), su arqueo de caja y su conteo de
 * cierre, y un botón a sus facturas (con la foto de las transferencias). Al
 * tocar el evento se abre su resumen (editar o cancelar). Quien no tiene
 * evento no puede vender. Desde aquí se mueve a un promotor a otro evento
 * (ej. se canceló el suyo a última hora y pasa a acompañar a otro), se le
 * asigna uno, o se le retira del suyo — con motivo.
 */
export function PromotoresDelDia({
  fecha,
  editable,
  adminId,
  recargarCon,
  onCambio,
  onEditarEvento,
}: {
  fecha: string;
  /** Falso en días pasados: solo se consulta. */
  editable: boolean;
  adminId: string;
  /** Cuando cambia (ej. los eventos del mes), la lista se vuelve a leer. */
  recargarCon: unknown;
  onCambio: () => void;
  /** Abre el detalle del evento del calendario (horario, meta, promotores). */
  onEditarEvento: (evento: Evento) => void;
}) {
  const pantallaAncha = useEsPantallaAncha();
  const [filas, setFilas] = useState<PromotorDelDia[]>([]);
  const [eventosDelDia, setEventosDelDia] = useState<Evento[]>([]);
  const [cifras, setCifras] = useState<Map<string, CifrasVentas>>(new Map());
  const [progresos, setProgresos] = useState<Map<string, ProgresoMetaDiaria>>(new Map());
  const [cierres, setCierres] = useState<(CierresDelDia & { fecha: string }) | null>(null);
  const [cargando, setCargando] = useState(true);
  const [eventoResumen, setEventoResumen] = useState<Evento | null>(null);
  const [accion, setAccion] = useState<Accion | null>(null);
  const [destinoId, setDestinoId] = useState<string | null>(null);
  const [motivo, setMotivo] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [versionLocal, setVersionLocal] = useState(0);

  const aplicar = useCallback((datos: Awaited<ReturnType<typeof leerDia>>) => {
    setFilas(datos.promotores);
    setEventosDelDia(datos.eventos);
    setCifras(datos.cifras);
    setProgresos(datos.progresos);
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
  }, [aplicar, fecha, recargarCon, versionLocal]);

  // Arqueo y conteo van aparte (Supabase): las tarjetas no esperan a la red.
  useEffect(() => {
    if (filas.length === 0) return;
    let vigente = true;
    leerCierres(fecha, filas).then((resultado) => {
      if (vigente) setCierres({ ...resultado, fecha });
    });
    return () => {
      vigente = false;
    };
  }, [fecha, filas]);

  // Una venta nueva de un celular (o un arqueo/conteo, vía Realtime) recarga las tarjetas.
  useRecargarConDatosNuevos(() => setVersionLocal((v) => v + 1));

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
        <View style={styles.grilla}>
        {filas.map((fila) => {
          const suyas = cifras.get(fila.promotorId);
          const cierresVigentes = cierres?.fecha === fecha ? cierres : null;
          return (
          <View key={fila.promotorId} style={[styles.tarjetaPromotor, pantallaAncha && styles.tarjetaPromotorAncha]}>
            <View style={styles.filaEncabezado}>
              <Text style={styles.nombre}>{fila.promotorNombre}</Text>
              {fila.eventos.length === 0 && <Insignia texto="Sin evento · no puede vender" estado="error" />}
              {fila.horariosCruzados && <Insignia texto="Horarios cruzados" estado="alerta" />}
            </View>

            {fila.eventos.map((evento) => {
              const progreso = progresos.get(evento.id);
              return (
              <View key={evento.id} style={styles.evento}>
                <Pressable
                  style={styles.eventoTocable}
                  onPress={() => setEventoResumen(evento)}
                  accessibilityRole="button"
                  accessibilityLabel={`Ver resumen del evento en ${lugar(evento)}`}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={styles.eventoLugar}>{lugar(evento)}</Text>
                    <Text style={styles.eventoDetalle}>
                      {horario(evento)}
                      {evento.promotorIds.length > 1
                        ? ` · Con ${evento.promotorNombres.filter((_, i) => evento.promotorIds[i] !== fila.promotorId).join(', ')}`
                        : ''}
                    </Text>
                  </View>
                  <Text style={styles.verResumen}>Resumen</Text>
                  <Ionicons name="chevron-forward" size={16} color={COLORES_ADMIN.vino} />
                </Pressable>
                {progreso ? (
                  <BarraAvanceMeta
                    vendido={progreso.totalVendidoHoy}
                    meta={progreso.metaDiaria}
                    etiqueta={evento.promotorIds.length > 1 ? 'Meta del equipo' : 'Meta del día'}
                  />
                ) : (
                  <Text style={styles.nota}>Este evento no tiene meta del día.</Text>
                )}
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
              );
            })}

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

            <View style={styles.cifras}>
              <Cifra
                etiqueta="Facturado"
                valor={formatearPesos(suyas?.totalVendido ?? 0)}
                detalle={`${suyas?.facturas ?? 0} ${suyas?.facturas === 1 ? 'factura' : 'facturas'}${suyas?.anuladas ? ` · ${suyas.anuladas} anulada${suyas.anuladas === 1 ? '' : 's'}` : ''}`}
                destacada
              />
              <Cifra etiqueta="Efectivo" valor={formatearPesos(suyas?.porMetodo.EFECTIVO ?? 0)} />
              <Cifra etiqueta="Transferencia" valor={formatearPesos(suyas?.porMetodo.TRANSFERENCIA ?? 0)} />
              <Cifra etiqueta="Libranza" valor={formatearPesos(suyas?.porMetodo.LIBRANZA ?? 0)} />
            </View>

            <EstadoCierre
              cierre={cierresVigentes?.porPromotor.get(fila.promotorId)}
              sinConexion={cierresVigentes?.sinConexion ?? false}
            />

            <Pressable
              style={[styles.botonFacturas, !(suyas?.facturas || suyas?.anuladas) && styles.deshabilitado]}
              disabled={!(suyas?.facturas || suyas?.anuladas)}
              onPress={() =>
                router.push({
                  pathname: '/admin/calendario/facturas',
                  params: { promotorId: fila.promotorId, nombre: fila.promotorNombre, fecha },
                })
              }
              accessibilityRole="button"
            >
              <Ionicons name="receipt-outline" size={16} color={COLORES_ADMIN.vino} />
              <Text style={styles.botonSecundarioTexto}>
                {suyas?.facturas || suyas?.anuladas ? 'Ver facturas y comprobantes' : 'Sin facturas este día'}
              </Text>
            </Pressable>
          </View>
          );
        })}
        </View>
      )}

      {eventoResumen && (
        <ResumenEventoModal
          evento={eventoResumen}
          progreso={progresos.get(eventoResumen.id) ?? null}
          editable={editable}
          adminId={adminId}
          onCerrar={() => setEventoResumen(null)}
          onEditar={() => {
            const evento = eventoResumen;
            setEventoResumen(null);
            onEditarEvento(evento);
          }}
          onCancelado={async () => {
            setEventoResumen(null);
            await cargar();
            onCambio();
          }}
        />
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
  grilla: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  tarjetaPromotor: {
    width: '100%',
    borderWidth: 1,
    borderColor: COLORES_ADMIN.bordeSuave,
    borderRadius: RADII_ADMIN.md,
    padding: 12,
    gap: 10,
    backgroundColor: COLORES_ADMIN.superficieMasBaja,
  },
  // Dos columnas en pantalla ancha (la sección ocupa todo el ancho del tablero).
  tarjetaPromotorAncha: { width: '49%', minWidth: 340 },
  filaEncabezado: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 },
  nombre: { ...TEXTO_ADMIN.tituloTarjeta },
  evento: {
    gap: 10,
    backgroundColor: COLORES_ADMIN.superficieBaja,
    borderRadius: RADII_ADMIN.sm,
    padding: 10,
  },
  eventoTocable: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  verResumen: { fontSize: 12, fontFamily: TIPOGRAFIA_ADMIN.semiNegrita, color: COLORES_ADMIN.vino },
  cifras: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  // 2 × 2: Facturado y Efectivo arriba, Transferencia y Libranza abajo.
  cifra: {
    flexGrow: 1,
    flexBasis: '46%',
    borderWidth: 1,
    borderColor: COLORES_ADMIN.bordeSuave,
    borderRadius: RADII_ADMIN.sm,
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 2,
  },
  cifraDestacada: { backgroundColor: COLORES_ADMIN.vino, borderColor: COLORES_ADMIN.vino },
  cifraEtiqueta: {
    fontSize: 10,
    fontFamily: TIPOGRAFIA_ADMIN.semiNegrita,
    color: COLORES_ADMIN.textoSecundario,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  cifraEtiquetaDestacada: { color: COLORES_ADMIN.superficieAlta },
  cifraValor: { fontSize: 15, fontFamily: TIPOGRAFIA_ADMIN.monoSemiNegrita, color: COLORES_ADMIN.texto },
  cifraValorDestacado: { color: COLORES_ADMIN.textoInverso, fontSize: 17 },
  cifraDetalle: { fontSize: 11, fontFamily: TIPOGRAFIA_ADMIN.regular, color: COLORES_ADMIN.dorado },
  cierre: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  botonFacturas: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: COLORES_ADMIN.dorado,
    backgroundColor: COLORES_ADMIN.superficieBaja,
    borderRadius: RADII_ADMIN.sm,
    paddingVertical: 10,
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
