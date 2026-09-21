import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { DemasiadasOcurrenciasError } from '@/core/eventos';
import type { Empresa, Evento, EstadoEvento, Frecuencia, Punto, UsuarioSesion } from '@/core/tipos';
import { getDb } from '@/db/client';
import { getDispositivoId } from '@/db/dispositivo';
import { listarEmpresas } from '@/db/empresas';
import {
  cambiarEstadoEvento,
  cancelarEvento,
  crearEvento,
  crearSerieRecurrente,
  listarEventosPorRango,
  reasignarEvento,
} from '@/db/eventos';
import { listarPuntos } from '@/db/puntos';
import { listarPromotores } from '@/db/usuarios';
import { aClaveFecha, construirGrilla, NOMBRES_DIA, NOMBRES_MES } from '@/ui/calendarioGrilla';
import { ContenedorAncho } from '@/ui/ContenedorAncho';
import { COLORES_ADMIN, TIPOGRAFIA_ADMIN } from '@/ui/tema';
import { useRequiereSesion } from '@/ui/useRequiereSesion';

const ETIQUETAS_ESTADO: Record<EstadoEvento, string> = {
  PLANEADO: 'Planeado',
  EN_CURSO: 'En curso',
  CERRADO: 'Cerrado',
  CANCELADO: 'Cancelado',
};

const ETIQUETAS_FRECUENCIA: Record<Frecuencia, string> = {
  DIAS: 'días',
  SEMANAS: 'semanas',
  MESES: 'meses',
  ANIOS: 'años',
};

function colorEstado(estado: EstadoEvento): string {
  if (estado === 'CANCELADO') return COLORES_ADMIN.error;
  if (estado === 'CERRADO') return COLORES_ADMIN.textoSecundario;
  if (estado === 'EN_CURSO') return COLORES_ADMIN.positivo;
  return COLORES_ADMIN.dorado;
}

export default function CalendarioAdmin() {
  const usuario = useRequiereSesion(['ADMIN']);
  const insets = useSafeAreaInsets();

  const hoy = new Date();
  const [mesVisible, setMesVisible] = useState({ anio: hoy.getFullYear(), mes: hoy.getMonth() });
  const [eventos, setEventos] = useState<Evento[]>([]);
  const [cargando, setCargando] = useState(true);
  const [diaSeleccionado, setDiaSeleccionado] = useState<string | null>(null);

  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [promotores, setPromotores] = useState<UsuarioSesion[]>([]);

  const [formVisible, setFormVisible] = useState(false);
  const [detalleEvento, setDetalleEvento] = useState<Evento | null>(null);
  const [modalCancelar, setModalCancelar] = useState(false);
  const [motivoCancelacion, setMotivoCancelacion] = useState('');
  const [guardando, setGuardando] = useState(false);

  const hoyClave = aClaveFecha(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());

  const cargarEventos = useCallback(async () => {
    setCargando(true);
    try {
      const db = await getDb();
      const desde = aClaveFecha(mesVisible.anio, mesVisible.mes, 1);
      const ultimoDia = new Date(mesVisible.anio, mesVisible.mes + 1, 0).getDate();
      const hasta = aClaveFecha(mesVisible.anio, mesVisible.mes, ultimoDia);
      setEventos(await listarEventosPorRango(db, { desde, hasta }));
    } finally {
      setCargando(false);
    }
  }, [mesVisible]);

  useFocusEffect(
    useCallback(() => {
      cargarEventos();
    }, [cargarEventos])
  );

  useEffect(() => {
    (async () => {
      const db = await getDb();
      const [listaEmpresas, listaPromotores] = await Promise.all([listarEmpresas(db), listarPromotores(db)]);
      setEmpresas(listaEmpresas);
      setPromotores(listaPromotores);
    })();
  }, []);

  if (!usuario) return null;
  const usuarioActual = usuario;

  function irMesAnterior() {
    setMesVisible((actual) => {
      const mes = actual.mes === 0 ? 11 : actual.mes - 1;
      const anio = actual.mes === 0 ? actual.anio - 1 : actual.anio;
      return { anio, mes };
    });
  }

  function irMesSiguiente() {
    setMesVisible((actual) => {
      const mes = actual.mes === 11 ? 0 : actual.mes + 1;
      const anio = actual.mes === 11 ? actual.anio + 1 : actual.anio;
      return { anio, mes };
    });
  }

  const semanas = construirGrilla(mesVisible.anio, mesVisible.mes);
  const eventosPorDia = new Map<string, Evento[]>();
  for (const evento of eventos) {
    const lista = eventosPorDia.get(evento.fecha) ?? [];
    lista.push(evento);
    eventosPorDia.set(evento.fecha, lista);
  }
  const eventosDelDia = diaSeleccionado ? (eventosPorDia.get(diaSeleccionado) ?? []) : [];

  function abrirNuevoEvento() {
    if (empresas.length === 0) {
      Alert.alert('Sin empresas', 'Crea una empresa y un punto primero en "Empresas y puntos".');
      return;
    }
    setFormVisible(true);
  }

  async function recargar() {
    await cargarEventos();
  }

  return (
    <View style={styles.contenedor}>
      <View style={[styles.encabezado, { paddingTop: insets.top + 16 }]}>
        <ContenedorAncho anchoMaximo={720} style={styles.encabezadoContenido}>
          <Pressable onPress={() => router.back()}>
            <Text style={styles.volver}>‹ Admin</Text>
          </Pressable>
          <Text style={styles.titulo}>Calendario de eventos</Text>
        </ContenedorAncho>
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        <ContenedorAncho anchoMaximo={720}>
          <View style={styles.calendario}>
            <View style={styles.mesEncabezado}>
              <Pressable style={styles.navBoton} onPress={irMesAnterior}>
                <Ionicons name="chevron-back" size={18} color={COLORES_ADMIN.vino} />
              </Pressable>
              <Text style={styles.mesTexto}>
                {NOMBRES_MES[mesVisible.mes]} {mesVisible.anio}
              </Text>
              <Pressable style={styles.navBoton} onPress={irMesSiguiente}>
                <Ionicons name="chevron-forward" size={18} color={COLORES_ADMIN.vino} />
              </Pressable>
            </View>

            <View style={styles.filaDias}>
              {NOMBRES_DIA.map((nombre) => (
                <Text key={nombre} style={styles.diaEtiqueta}>
                  {nombre}
                </Text>
              ))}
            </View>

            {semanas.map((semana, indiceSemana) => (
              <View key={indiceSemana} style={styles.filaDias}>
                {semana.map((dia, indiceDia) => {
                  if (dia === null) return <View key={indiceDia} style={styles.celda} />;
                  const clave = aClaveFecha(mesVisible.anio, mesVisible.mes, dia);
                  const esHoy = clave === hoyClave;
                  const seleccionado = clave === diaSeleccionado;
                  const cantidadEventos = eventosPorDia.get(clave)?.length ?? 0;

                  return (
                    <Pressable
                      key={indiceDia}
                      style={styles.celda}
                      onPress={() => setDiaSeleccionado(seleccionado ? null : clave)}
                    >
                      <View
                        style={[
                          styles.diaCirculo,
                          seleccionado && styles.diaCirculoSeleccionado,
                          esHoy && !seleccionado && styles.diaCirculoHoy,
                        ]}
                      >
                        <Text
                          style={[
                            styles.diaTexto,
                            seleccionado && styles.diaTextoSeleccionado,
                            esHoy && !seleccionado && styles.diaTextoHoy,
                          ]}
                        >
                          {dia}
                        </Text>
                      </View>
                      {cantidadEventos > 0 && (
                        <View style={[styles.punto, seleccionado && styles.puntoSeleccionado]} />
                      )}
                    </Pressable>
                  );
                })}
              </View>
            ))}
          </View>

          {cargando ? (
            <ActivityIndicator color={COLORES_ADMIN.vino} style={{ marginTop: 20 }} />
          ) : diaSeleccionado ? (
            <View style={styles.detalleDia}>
              <View style={styles.detalleDiaEncabezado}>
                <Text style={styles.detalleDiaTitulo}>{diaSeleccionado}</Text>
                <Pressable style={styles.botonNuevo} onPress={abrirNuevoEvento}>
                  <Ionicons name="add" size={16} color="#FFFFFF" />
                  <Text style={styles.botonNuevoTexto}>Nuevo evento</Text>
                </Pressable>
              </View>

              {eventosDelDia.length === 0 ? (
                <Text style={styles.vacio}>Sin eventos este día.</Text>
              ) : (
                eventosDelDia.map((evento) => (
                  <Pressable
                    key={evento.id}
                    style={styles.filaEvento}
                    onPress={() => setDetalleEvento(evento)}
                  >
                    <View style={styles.filaEventoTexto}>
                      <Text style={styles.filaEventoEmpresa}>{evento.empresaNombre}</Text>
                      <Text style={styles.filaEventoPunto}>{evento.puntoNombre}</Text>
                      <Text style={styles.filaEventoPromotores}>
                        {evento.promotorNombres.length > 0
                          ? evento.promotorNombres.join(', ')
                          : 'Sin promotor asignado'}
                      </Text>
                    </View>
                    <Text style={[styles.badgeEstado, { color: colorEstado(evento.estado) }]}>
                      {ETIQUETAS_ESTADO[evento.estado]}
                    </Text>
                  </Pressable>
                ))
              )}
            </View>
          ) : (
            <Text style={styles.vacio}>Toca un día para ver o crear eventos.</Text>
          )}
        </ContenedorAncho>
      </ScrollView>

      {formVisible && diaSeleccionado && (
        <FormularioEvento
          fecha={diaSeleccionado}
          empresas={empresas}
          promotores={promotores}
          adminId={usuarioActual.id}
          onCerrar={() => setFormVisible(false)}
          onCreado={async () => {
            setFormVisible(false);
            await recargar();
          }}
        />
      )}

      {detalleEvento && (
        <Modal visible animationType="fade" transparent>
          <View style={styles.fondoModal}>
            <View style={styles.tarjetaModal}>
              <Text style={styles.modalTitulo}>
                {detalleEvento.empresaNombre} · {detalleEvento.puntoNombre}
              </Text>
              <Text style={styles.modalTexto}>{detalleEvento.fecha}</Text>
              <Text style={[styles.badgeEstado, { color: colorEstado(detalleEvento.estado) }]}>
                {ETIQUETAS_ESTADO[detalleEvento.estado]}
              </Text>
              {detalleEvento.motivoCancelacion && (
                <Text style={styles.modalTextoMotivo}>Motivo: {detalleEvento.motivoCancelacion}</Text>
              )}

              <Text style={styles.modalSubtitulo}>Promotores asignados</Text>
              {promotores.map((p) => {
                const asignado = detalleEvento.promotorIds.includes(p.id);
                return (
                  <Pressable
                    key={p.id}
                    style={styles.filaCheckbox}
                    disabled={guardando || detalleEvento.estado === 'CANCELADO'}
                    onPress={async () => {
                      const nuevos = asignado
                        ? detalleEvento.promotorIds.filter((id) => id !== p.id)
                        : [...detalleEvento.promotorIds, p.id];
                      setGuardando(true);
                      try {
                        const db = await getDb();
                        const actualizado = await reasignarEvento(db, {
                          eventoId: detalleEvento.id,
                          promotorIds: nuevos,
                        });
                        setDetalleEvento(actualizado);
                        await recargar();
                      } finally {
                        setGuardando(false);
                      }
                    }}
                  >
                    <View style={[styles.checkbox, asignado && styles.checkboxMarcado]}>
                      {asignado && <Ionicons name="checkmark" size={12} color="#FFFFFF" />}
                    </View>
                    <Text style={styles.filaCheckboxTexto}>{p.nombre}</Text>
                  </Pressable>
                );
              })}

              {detalleEvento.estado !== 'CANCELADO' && (
                <View style={styles.modalEstadosFila}>
                  {(['PLANEADO', 'EN_CURSO', 'CERRADO'] as const).map((estado) => (
                    <Pressable
                      key={estado}
                      style={[
                        styles.chipEstado,
                        detalleEvento.estado === estado && styles.chipEstadoActivo,
                      ]}
                      disabled={guardando}
                      onPress={async () => {
                        setGuardando(true);
                        try {
                          const db = await getDb();
                          await cambiarEstadoEvento(db, { eventoId: detalleEvento.id, estado });
                          setDetalleEvento({ ...detalleEvento, estado });
                          await recargar();
                        } finally {
                          setGuardando(false);
                        }
                      }}
                    >
                      <Text
                        style={[
                          styles.chipEstadoTexto,
                          detalleEvento.estado === estado && styles.chipEstadoTextoActivo,
                        ]}
                      >
                        {ETIQUETAS_ESTADO[estado]}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              )}

              <View style={styles.modalAcciones}>
                <Pressable onPress={() => setDetalleEvento(null)} disabled={guardando}>
                  <Text style={styles.modalCancelar}>Cerrar</Text>
                </Pressable>
                {detalleEvento.estado !== 'CANCELADO' && (
                  <Pressable
                    style={styles.botonCancelarEvento}
                    disabled={guardando}
                    onPress={() => setModalCancelar(true)}
                  >
                    <Text style={styles.botonCancelarEventoTexto}>Cancelar evento</Text>
                  </Pressable>
                )}
              </View>
            </View>
          </View>
        </Modal>
      )}

      <Modal visible={modalCancelar} animationType="fade" transparent>
        <View style={styles.fondoModal}>
          <View style={styles.tarjetaModal}>
            <Text style={styles.modalTitulo}>Cancelar evento</Text>
            <Text style={styles.modalTexto}>
              Esta acción queda registrada y no se puede deshacer. Explica el motivo.
            </Text>
            <TextInput
              style={styles.modalInput}
              placeholder="Motivo (obligatorio)"
              placeholderTextColor="#A8988F"
              value={motivoCancelacion}
              onChangeText={setMotivoCancelacion}
              multiline
              editable={!guardando}
            />
            <View style={styles.modalAcciones}>
              <Pressable
                onPress={() => {
                  setModalCancelar(false);
                  setMotivoCancelacion('');
                }}
                disabled={guardando}
              >
                <Text style={styles.modalCancelar}>Volver</Text>
              </Pressable>
              <Pressable
                style={[
                  styles.botonCancelarEvento,
                  (motivoCancelacion.trim().length === 0 || guardando) && styles.botonDeshabilitado,
                ]}
                disabled={motivoCancelacion.trim().length === 0 || guardando}
                onPress={async () => {
                  if (!detalleEvento) return;
                  setGuardando(true);
                  try {
                    const db = await getDb();
                    await cancelarEvento(db, { eventoId: detalleEvento.id, motivo: motivoCancelacion.trim() });
                    setModalCancelar(false);
                    setMotivoCancelacion('');
                    setDetalleEvento(null);
                    await recargar();
                  } finally {
                    setGuardando(false);
                  }
                }}
              >
                {guardando ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.botonCancelarEventoTexto}>Confirmar cancelación</Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function FormularioEvento({
  fecha,
  empresas,
  promotores,
  adminId,
  onCerrar,
  onCreado,
}: {
  fecha: string;
  empresas: Empresa[];
  promotores: UsuarioSesion[];
  adminId: string;
  onCerrar: () => void;
  onCreado: () => void;
}) {
  const [empresaId, setEmpresaId] = useState(empresas[0]?.id ?? '');
  const [puntos, setPuntos] = useState<Punto[]>([]);
  const [puntoId, setPuntoId] = useState<string | null>(null);
  const [promotorIds, setPromotorIds] = useState<string[]>([]);
  const [repetir, setRepetir] = useState(false);
  const [frecuencia, setFrecuencia] = useState<Frecuencia>('DIAS');
  const [intervalo, setIntervalo] = useState('15');
  const [fechaHasta, setFechaHasta] = useState('');
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    (async () => {
      if (!empresaId) return;
      const db = await getDb();
      const lista = await listarPuntos(db, { empresaId });
      setPuntos(lista);
      setPuntoId(lista[0]?.id ?? null);
    })();
  }, [empresaId]);

  function alternarPromotor(id: string) {
    setPromotorIds((actual) => (actual.includes(id) ? actual.filter((p) => p !== id) : [...actual, id]));
  }

  async function guardar() {
    if (!puntoId) return;
    setGuardando(true);
    try {
      const db = await getDb();
      const dispositivoId = await getDispositivoId(db);
      if (repetir) {
        const intervaloNumero = Number(intervalo);
        if (!fechaHasta) {
          Alert.alert('Falta la fecha límite', 'Elige hasta cuándo se repite el evento.');
          return;
        }
        await crearSerieRecurrente(
          db,
          {
            empresaId,
            puntoId,
            promotorIds,
            frecuencia,
            intervalo: intervaloNumero,
            fechaDesde: fecha,
            fechaHasta,
            creadoPor: adminId,
          },
          dispositivoId
        );
      } else {
        await crearEvento(db, { empresaId, puntoId, fecha, promotorIds, creadoPor: adminId }, dispositivoId);
      }
      onCreado();
    } catch (error) {
      if (error instanceof DemasiadasOcurrenciasError) {
        Alert.alert('Demasiadas ocurrencias', error.message);
      } else {
        Alert.alert('No se pudo crear el evento', error instanceof Error ? error.message : 'Error inesperado.');
      }
    } finally {
      setGuardando(false);
    }
  }

  return (
    <Modal visible animationType="slide" transparent>
      <View style={styles.fondoModal}>
        <View style={styles.tarjetaModal}>
          <ScrollView>
            <Text style={styles.modalTitulo}>Nuevo evento · {fecha}</Text>

            <Text style={styles.modalSubtitulo}>Empresa</Text>
            {empresas.map((e) => (
              <Pressable
                key={e.id}
                style={styles.filaCheckbox}
                onPress={() => setEmpresaId(e.id)}
              >
                <View style={[styles.radio, empresaId === e.id && styles.radioMarcado]} />
                <Text style={styles.filaCheckboxTexto}>{e.nombre}</Text>
              </Pressable>
            ))}

            <Text style={styles.modalSubtitulo}>Punto</Text>
            {puntos.length === 0 ? (
              <Text style={styles.vacio}>Esta empresa no tiene puntos todavía.</Text>
            ) : (
              puntos.map((p) => (
                <Pressable key={p.id} style={styles.filaCheckbox} onPress={() => setPuntoId(p.id)}>
                  <View style={[styles.radio, puntoId === p.id && styles.radioMarcado]} />
                  <Text style={styles.filaCheckboxTexto}>{p.nombre}</Text>
                </Pressable>
              ))
            )}

            <Text style={styles.modalSubtitulo}>Promotores</Text>
            {promotores.length === 0 ? (
              <Text style={styles.vacio}>No hay promotores activos.</Text>
            ) : (
              promotores.map((p) => {
                const marcado = promotorIds.includes(p.id);
                return (
                  <Pressable key={p.id} style={styles.filaCheckbox} onPress={() => alternarPromotor(p.id)}>
                    <View style={[styles.checkbox, marcado && styles.checkboxMarcado]}>
                      {marcado && <Ionicons name="checkmark" size={12} color="#FFFFFF" />}
                    </View>
                    <Text style={styles.filaCheckboxTexto}>{p.nombre}</Text>
                  </Pressable>
                );
              })
            )}

            <Pressable style={styles.filaCheckbox} onPress={() => setRepetir(!repetir)}>
              <View style={[styles.checkbox, repetir && styles.checkboxMarcado]}>
                {repetir && <Ionicons name="checkmark" size={12} color="#FFFFFF" />}
              </View>
              <Text style={styles.filaCheckboxTexto}>Repetir este evento</Text>
            </Pressable>

            {repetir && (
              <View style={styles.bloqueRepetir}>
                <Text style={styles.modalSubtitulo}>Cada</Text>
                <View style={styles.filaRepetir}>
                  <TextInput
                    style={styles.inputIntervalo}
                    value={intervalo}
                    onChangeText={setIntervalo}
                    keyboardType="number-pad"
                  />
                  {(['DIAS', 'SEMANAS', 'MESES', 'ANIOS'] as const).map((f) => (
                    <Pressable
                      key={f}
                      style={[styles.chipEstado, frecuencia === f && styles.chipEstadoActivo]}
                      onPress={() => setFrecuencia(f)}
                    >
                      <Text
                        style={[styles.chipEstadoTexto, frecuencia === f && styles.chipEstadoTextoActivo]}
                      >
                        {ETIQUETAS_FRECUENCIA[f]}
                      </Text>
                    </Pressable>
                  ))}
                </View>
                <Text style={styles.modalSubtitulo}>Hasta (AAAA-MM-DD)</Text>
                <TextInput
                  style={styles.modalInputCorto}
                  value={fechaHasta}
                  onChangeText={setFechaHasta}
                  placeholder="2026-12-31"
                  placeholderTextColor="#A8988F"
                />
              </View>
            )}

            <View style={styles.modalAcciones}>
              <Pressable onPress={onCerrar} disabled={guardando}>
                <Text style={styles.modalCancelar}>Cancelar</Text>
              </Pressable>
              <Pressable
                style={[styles.botonNuevo, (!puntoId || guardando) && styles.botonDeshabilitado]}
                disabled={!puntoId || guardando}
                onPress={guardar}
              >
                {guardando ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.botonNuevoTexto}>Crear evento</Text>
                )}
              </Pressable>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const TAMANO_CELDA = 40;

const styles = StyleSheet.create({
  contenedor: { flex: 1, backgroundColor: COLORES_ADMIN.background },
  encabezado: {
    backgroundColor: COLORES_ADMIN.vino,
    paddingHorizontal: 20,
    paddingBottom: 16,
  },
  encabezadoContenido: { gap: 4 },
  volver: {
    color: '#FFFFFF',
    fontSize: 14,
    fontFamily: TIPOGRAFIA_ADMIN.medio,
    textDecorationLine: 'underline',
  },
  titulo: { color: '#FFFFFF', fontSize: 18, fontFamily: TIPOGRAFIA_ADMIN.negrita },
  scroll: { padding: 20, gap: 16 },
  calendario: {
    backgroundColor: COLORES_ADMIN.superficieMasBaja,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORES_ADMIN.bordeSuave,
    padding: 16,
    gap: 8,
  },
  mesEncabezado: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  navBoton: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: COLORES_ADMIN.superficieBaja,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mesTexto: { fontSize: 15, fontFamily: TIPOGRAFIA_ADMIN.semiNegrita, color: COLORES_ADMIN.vino },
  filaDias: { flexDirection: 'row' },
  diaEtiqueta: {
    width: TAMANO_CELDA,
    textAlign: 'center',
    fontSize: 11,
    fontFamily: TIPOGRAFIA_ADMIN.semiNegrita,
    color: COLORES_ADMIN.textoSecundario,
  },
  celda: { width: TAMANO_CELDA, height: TAMANO_CELDA, alignItems: 'center', justifyContent: 'center', gap: 2 },
  diaCirculo: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  diaCirculoSeleccionado: { backgroundColor: COLORES_ADMIN.vino },
  diaCirculoHoy: { borderWidth: 1.5, borderColor: COLORES_ADMIN.dorado },
  diaTexto: { fontSize: 13, fontFamily: TIPOGRAFIA_ADMIN.monoRegular, color: COLORES_ADMIN.texto },
  diaTextoSeleccionado: { color: '#FFFFFF', fontFamily: TIPOGRAFIA_ADMIN.monoSemiNegrita },
  diaTextoHoy: { color: COLORES_ADMIN.vino, fontFamily: TIPOGRAFIA_ADMIN.monoSemiNegrita },
  punto: { width: 5, height: 5, borderRadius: 3, backgroundColor: COLORES_ADMIN.dorado },
  puntoSeleccionado: { backgroundColor: '#FFFFFF' },
  vacio: { fontSize: 13, fontFamily: TIPOGRAFIA_ADMIN.regular, color: COLORES_ADMIN.textoSecundario, marginTop: 8 },
  detalleDia: {
    backgroundColor: COLORES_ADMIN.superficieMasBaja,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORES_ADMIN.bordeSuave,
    padding: 16,
    gap: 10,
  },
  detalleDiaEncabezado: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  detalleDiaTitulo: { fontSize: 15, fontFamily: TIPOGRAFIA_ADMIN.monoSemiNegrita, color: COLORES_ADMIN.vino },
  botonNuevo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: COLORES_ADMIN.vino,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  botonNuevoTexto: { color: '#FFFFFF', fontSize: 13, fontFamily: TIPOGRAFIA_ADMIN.semiNegrita },
  filaEvento: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: COLORES_ADMIN.superficieBaja,
    borderRadius: 10,
    padding: 12,
  },
  filaEventoTexto: { gap: 2, flex: 1 },
  filaEventoEmpresa: { fontSize: 13, fontFamily: TIPOGRAFIA_ADMIN.semiNegrita, color: COLORES_ADMIN.texto },
  filaEventoPunto: { fontSize: 12, fontFamily: TIPOGRAFIA_ADMIN.regular, color: COLORES_ADMIN.textoSecundario },
  filaEventoPromotores: { fontSize: 12, fontFamily: TIPOGRAFIA_ADMIN.regular, color: COLORES_ADMIN.textoSecundario },
  badgeEstado: { fontSize: 11, fontFamily: TIPOGRAFIA_ADMIN.semiNegrita, textTransform: 'uppercase' },
  fondoModal: { flex: 1, backgroundColor: 'rgba(42,24,16,0.45)', alignItems: 'center', justifyContent: 'center', padding: 20 },
  tarjetaModal: {
    width: '100%',
    maxWidth: 420,
    maxHeight: '85%',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    gap: 10,
  },
  modalTitulo: { fontSize: 16, fontFamily: TIPOGRAFIA_ADMIN.negrita, color: COLORES_ADMIN.texto },
  modalSubtitulo: {
    fontSize: 12,
    fontFamily: TIPOGRAFIA_ADMIN.semiNegrita,
    color: COLORES_ADMIN.textoSecundario,
    marginTop: 8,
    textTransform: 'uppercase',
  },
  modalTexto: { fontSize: 13, fontFamily: TIPOGRAFIA_ADMIN.regular, color: COLORES_ADMIN.textoSecundario },
  modalTextoMotivo: { fontSize: 13, fontFamily: TIPOGRAFIA_ADMIN.medio, color: COLORES_ADMIN.error },
  modalInput: {
    borderWidth: 1,
    borderColor: COLORES_ADMIN.bordeSuave,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    fontFamily: TIPOGRAFIA_ADMIN.regular,
    minHeight: 64,
    textAlignVertical: 'top',
  },
  modalInputCorto: {
    borderWidth: 1,
    borderColor: COLORES_ADMIN.bordeSuave,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    fontFamily: TIPOGRAFIA_ADMIN.monoRegular,
  },
  filaCheckbox: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6 },
  filaCheckboxTexto: { fontSize: 13, fontFamily: TIPOGRAFIA_ADMIN.regular, color: COLORES_ADMIN.texto },
  checkbox: {
    width: 18,
    height: 18,
    borderRadius: 3,
    borderWidth: 1.5,
    borderColor: COLORES_ADMIN.textoSecundario,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxMarcado: { backgroundColor: COLORES_ADMIN.vino, borderColor: COLORES_ADMIN.vino },
  radio: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: COLORES_ADMIN.textoSecundario,
  },
  radioMarcado: { backgroundColor: COLORES_ADMIN.vino, borderColor: COLORES_ADMIN.vino },
  modalEstadosFila: { flexDirection: 'row', gap: 8, marginTop: 8, flexWrap: 'wrap' },
  chipEstado: {
    borderWidth: 1,
    borderColor: COLORES_ADMIN.bordeSuave,
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  chipEstadoActivo: { backgroundColor: COLORES_ADMIN.vino, borderColor: COLORES_ADMIN.vino },
  chipEstadoTexto: { fontSize: 12, fontFamily: TIPOGRAFIA_ADMIN.medio, color: COLORES_ADMIN.texto },
  chipEstadoTextoActivo: { color: '#FFFFFF' },
  bloqueRepetir: { gap: 6 },
  filaRepetir: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  inputIntervalo: {
    width: 56,
    borderWidth: 1,
    borderColor: COLORES_ADMIN.bordeSuave,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 14,
    fontFamily: TIPOGRAFIA_ADMIN.monoRegular,
    textAlign: 'center',
  },
  modalAcciones: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: 16,
    marginTop: 12,
  },
  modalCancelar: { fontSize: 14, fontFamily: TIPOGRAFIA_ADMIN.medio, color: COLORES_ADMIN.textoSecundario },
  botonCancelarEvento: {
    backgroundColor: COLORES_ADMIN.error,
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    minWidth: 100,
    alignItems: 'center',
  },
  botonCancelarEventoTexto: { color: '#FFFFFF', fontSize: 13, fontFamily: TIPOGRAFIA_ADMIN.semiNegrita },
  botonDeshabilitado: { opacity: 0.5 },
});
