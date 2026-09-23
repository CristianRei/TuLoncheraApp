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

import { parsearPesos } from '@/core/dinero';
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
  establecerMetaDiaria,
  EventoEnFechaPasadaError,
  listarEventosPorRango,
  obtenerEvento,
  reasignarEvento,
} from '@/db/eventos';
import { listarPuntos } from '@/db/puntos';
import { listarPromotores } from '@/db/usuarios';
import { aClaveFecha, construirGrilla, NOMBRES_DIA, NOMBRES_MES } from '@/ui/calendarioGrilla';
import { ContenedorAncho } from '@/ui/ContenedorAncho';
import { COLORES_ADMIN, TIPOGRAFIA_ADMIN } from '@/ui/tema';
import { useEsPantallaAncha } from '@/ui/useEsPantallaAncha';
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

const NOMBRES_DIA_LARGO = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
const NOMBRES_DIA_SEMANA_LARGO = [
  'Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado',
];

function numeroSemanaISO(fecha: Date): number {
  const d = new Date(Date.UTC(fecha.getFullYear(), fecha.getMonth(), fecha.getDate()));
  const diaSemana = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - diaSemana);
  const inicioAnio = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - inicioAnio.getTime()) / 86400000 + 1) / 7);
}

function formatearFechaLarga(clave: string): { diaSemana: string; fechaCorta: string; semana: number } {
  const [anio, mes, dia] = clave.split('-').map(Number);
  const fecha = new Date(anio, mes - 1, dia);
  return {
    diaSemana: NOMBRES_DIA_SEMANA_LARGO[fecha.getDay()],
    fechaCorta: clave,
    semana: numeroSemanaISO(fecha),
  };
}

/** Compara claves AAAA-MM-DD como texto: mismo formato, orden lexicográfico = orden cronológico. */
function esFechaPasada(clave: string, hoyClave: string): boolean {
  return clave < hoyClave;
}

export default function CalendarioAdmin() {
  const usuario = useRequiereSesion(['ADMIN']);
  const insets = useSafeAreaInsets();
  const pantallaAncha = useEsPantallaAncha();

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
  const [metaDiariaTexto, setMetaDiariaTexto] = useState<Record<string, string>>({});
  const [guardandoMetaDe, setGuardandoMetaDe] = useState<string | null>(null);

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

  // Abre el detalle y siembra el buffer de texto de "meta del día" una sola
  // vez, al abrir — las actualizaciones posteriores del mismo evento (ej. al
  // (des)asignar un promotor) van directo por setDetalleEvento, sin tocar
  // este buffer, para no perder lo que el admin ya tecleó.
  function abrirDetalleEvento(evento: Evento) {
    const inicial: Record<string, string> = {};
    for (const promotorId of evento.promotorIds) {
      const meta = evento.metaDiariaPorPromotor[promotorId];
      inicial[promotorId] = meta ? String(meta) : '';
    }
    setMetaDiariaTexto(inicial);
    setDetalleEvento(evento);
  }

  async function guardarMetaDiaria(promotorId: string) {
    if (!detalleEvento) return;
    const texto = metaDiariaTexto[promotorId] ?? '';
    const monto = texto.trim() === '' ? null : parsearPesos(texto);
    setGuardandoMetaDe(promotorId);
    try {
      const db = await getDb();
      await establecerMetaDiaria(db, { eventoId: detalleEvento.id, promotorId, montoObjetivo: monto });
      setDetalleEvento(await obtenerEvento(db, detalleEvento.id));
    } finally {
      setGuardandoMetaDe(null);
    }
  }

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

  function irAHoy() {
    setMesVisible({ anio: hoy.getFullYear(), mes: hoy.getMonth() });
    setDiaSeleccionado(hoyClave);
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
    if (diaSeleccionado && esFechaPasada(diaSeleccionado, hoyClave)) {
      Alert.alert('Fecha pasada', 'No se pueden crear eventos en un día anterior a hoy.');
      return;
    }
    if (empresas.length === 0) {
      Alert.alert('Sin empresas', 'Crea una empresa y un punto primero en "Empresas y puntos".');
      return;
    }
    setFormVisible(true);
  }

  async function recargar() {
    await cargarEventos();
  }

  const totalEventosMes = eventos.filter((e) => e.estado !== 'CANCELADO').length;
  const fechaSeleccionadaInfo = diaSeleccionado ? formatearFechaLarga(diaSeleccionado) : null;

  return (
    <View style={styles.contenedor}>
      <View
        style={[
          pantallaAncha ? styles.encabezadoAncho : styles.encabezado,
          { paddingTop: pantallaAncha ? 16 : insets.top + 16 },
        ]}
      >
        <ContenedorAncho anchoMaximo={1200} style={styles.encabezadoContenido}>
          {!pantallaAncha && (
            <Pressable onPress={() => router.back()}>
              <Text style={styles.volver}>‹ Admin</Text>
            </Pressable>
          )}
          <Text style={pantallaAncha ? styles.tituloAncho : styles.titulo}>Calendario de eventos</Text>
        </ContenedorAncho>
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        <ContenedorAncho anchoMaximo={1200}>
          <View style={pantallaAncha ? styles.layoutAncho : styles.layoutAngosto}>
            <View style={[styles.columnaCalendario, pantallaAncha && styles.columnaCalendarioAncha]}>
              <View style={styles.calendario}>
                <View style={styles.mesEncabezado}>
                  <View style={styles.mesEncabezadoIzquierda}>
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
                  <Pressable style={styles.botonHoy} onPress={irAHoy}>
                    <Text style={styles.botonHoyTexto}>Ir a hoy ({hoy.getDate()})</Text>
                  </Pressable>
                </View>

                <View style={styles.filaDias}>
                  {NOMBRES_DIA_LARGO.map((nombre, indice) => (
                    <Text
                      key={nombre}
                      style={[
                        styles.diaEtiqueta,
                        indice === 5 && styles.diaEtiquetaSabado,
                        indice === 6 && styles.diaEtiquetaDomingo,
                      ]}
                    >
                      {pantallaAncha ? nombre : NOMBRES_DIA[indice]}
                    </Text>
                  ))}
                </View>

                {semanas.map((semana, indiceSemana) => (
                  <View key={indiceSemana} style={styles.filaDias}>
                    {semana.map((dia, indiceDia) => {
                      if (dia === null) return <View key={indiceDia} style={styles.celdaVacia} />;
                      const clave = aClaveFecha(mesVisible.anio, mesVisible.mes, dia);
                      const esHoy = clave === hoyClave;
                      const seleccionado = clave === diaSeleccionado;
                      const eventosDia = eventosPorDia.get(clave) ?? [];
                      const coloresDia = [...new Set(eventosDia.map((e) => colorEstado(e.estado)))].slice(0, 3);

                      return (
                        <Pressable
                          key={indiceDia}
                          style={[
                            styles.celda,
                            seleccionado && styles.celdaSeleccionada,
                            esHoy && !seleccionado && styles.celdaHoy,
                          ]}
                          onPress={() => setDiaSeleccionado(seleccionado ? null : clave)}
                        >
                          <Text
                            style={[
                              styles.diaNumero,
                              seleccionado && styles.diaNumeroSeleccionado,
                              esHoy && !seleccionado && styles.diaNumeroHoy,
                            ]}
                          >
                            {dia}
                          </Text>
                          {coloresDia.length > 0 && (
                            <View style={styles.puntosFila}>
                              {coloresDia.map((color) => (
                                <View key={color} style={[styles.punto, { backgroundColor: color }]} />
                              ))}
                            </View>
                          )}
                        </Pressable>
                      );
                    })}
                  </View>
                ))}

                <View style={styles.leyenda}>
                  <Text style={styles.leyendaTitulo}>Convención:</Text>
                  <View style={styles.leyendaItems}>
                    <View style={styles.leyendaItem}>
                      <View style={[styles.leyendaPunto, { backgroundColor: COLORES_ADMIN.dorado }]} />
                      <Text style={styles.leyendaTexto}>Planeado</Text>
                    </View>
                    <View style={styles.leyendaItem}>
                      <View style={[styles.leyendaPunto, { backgroundColor: COLORES_ADMIN.positivo }]} />
                      <Text style={styles.leyendaTexto}>En curso</Text>
                    </View>
                    <View style={styles.leyendaItem}>
                      <View style={[styles.leyendaPunto, { backgroundColor: COLORES_ADMIN.textoSecundario }]} />
                      <Text style={styles.leyendaTexto}>Cerrado</Text>
                    </View>
                    <View style={styles.leyendaItem}>
                      <View style={[styles.leyendaPunto, { backgroundColor: COLORES_ADMIN.error }]} />
                      <Text style={styles.leyendaTexto}>Cancelado</Text>
                    </View>
                  </View>
                  <Text style={styles.leyendaTotal}>
                    Total eventos mes: <Text style={styles.leyendaTotalNumero}>{totalEventosMes}</Text>
                  </Text>
                </View>
              </View>
            </View>

            <View style={[styles.columnaDetalle, pantallaAncha && styles.columnaDetalleAncha]}>
              {cargando ? (
                <ActivityIndicator color={COLORES_ADMIN.vino} style={{ marginTop: 20 }} />
              ) : diaSeleccionado && fechaSeleccionadaInfo ? (
                <View style={styles.detalleDia}>
                  <View style={styles.detalleDiaEncabezado}>
                    <View style={{ flex: 1 }}>
                      <View style={styles.detalleDiaBadges}>
                        <Text style={styles.badgeDiaSeleccionado}>Día seleccionado</Text>
                        {eventosDelDia.length > 0 && (
                          <Text style={styles.badgeConteoEventos}>
                            {eventosDelDia.length} {eventosDelDia.length === 1 ? 'evento' : 'eventos'}
                          </Text>
                        )}
                      </View>
                      <Text style={styles.detalleDiaTitulo}>{fechaSeleccionadaInfo.fechaCorta}</Text>
                      <Text style={styles.detalleDiaSubtitulo}>
                        {fechaSeleccionadaInfo.diaSemana} · Semana {fechaSeleccionadaInfo.semana}
                      </Text>
                    </View>
                    {!esFechaPasada(diaSeleccionado, hoyClave) && (
                      <Pressable style={styles.botonNuevo} onPress={abrirNuevoEvento}>
                        <Ionicons name="add" size={16} color="#FFFFFF" />
                        <Text style={styles.botonNuevoTexto}>Nuevo evento</Text>
                      </Pressable>
                    )}
                  </View>

                  <Text style={styles.itinerarioTitulo}>Itinerario del día</Text>

                  {eventosDelDia.length === 0 ? (
                    <View style={styles.vacioContenedor}>
                      <Ionicons name="calendar-outline" size={28} color={COLORES_ADMIN.bordeSuave} />
                      <Text style={styles.vacio}>Sin eventos este día.</Text>
                    </View>
                  ) : (
                    eventosDelDia.map((evento) => (
                      <Pressable
                        key={evento.id}
                        style={[styles.tarjetaEvento, { borderLeftColor: colorEstado(evento.estado) }]}
                        onPress={() => abrirDetalleEvento(evento)}
                      >
                        <View style={styles.tarjetaEventoEncabezado}>
                          <View
                            style={[
                              styles.badgeEstadoPill,
                              { backgroundColor: colorEstado(evento.estado) },
                            ]}
                          >
                            <Text style={styles.badgeEstadoPillTexto}>{ETIQUETAS_ESTADO[evento.estado]}</Text>
                          </View>
                        </View>
                        <Text style={styles.filaEventoEmpresa}>{evento.empresaNombre}</Text>
                        <Text style={styles.filaEventoPunto}>{evento.puntoNombre}</Text>
                        <View style={styles.tarjetaEventoPie}>
                          <View style={styles.tarjetaEventoPieItem}>
                            <Ionicons name="people-outline" size={13} color={COLORES_ADMIN.textoSecundario} />
                            <Text style={styles.filaEventoPromotores}>
                              {evento.promotorNombres.length > 0
                                ? evento.promotorNombres.join(', ')
                                : 'Sin promotor asignado'}
                            </Text>
                          </View>
                        </View>
                      </Pressable>
                    ))
                  )}
                </View>
              ) : (
                <View style={styles.detalleDia}>
                  <View style={styles.vacioContenedor}>
                    <Ionicons name="calendar-outline" size={28} color={COLORES_ADMIN.bordeSuave} />
                    <Text style={styles.vacio}>Toca un día para ver o crear eventos.</Text>
                  </View>
                </View>
              )}
            </View>
          </View>
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
              {esFechaPasada(detalleEvento.fecha, hoyClave) && (
                <Text style={styles.modalTextoAviso}>
                  Este evento ya pasó — no se puede editar, solo consultar.
                </Text>
              )}

              <Text style={styles.modalSubtitulo}>Promotores asignados</Text>
              {promotores.map((p) => {
                const asignado = detalleEvento.promotorIds.includes(p.id);
                return (
                  <View key={p.id}>
                    <Pressable
                      style={styles.filaCheckbox}
                      disabled={
                        guardando ||
                        detalleEvento.estado === 'CANCELADO' ||
                        esFechaPasada(detalleEvento.fecha, hoyClave)
                      }
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
                        } catch (error) {
                          if (error instanceof EventoEnFechaPasadaError) {
                            Alert.alert('Evento pasado', error.message);
                          } else {
                            Alert.alert('No se pudo actualizar', error instanceof Error ? error.message : 'Error inesperado.');
                          }
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
                    {asignado && !esFechaPasada(detalleEvento.fecha, hoyClave) && (
                      <View style={styles.filaMetaDiaria}>
                        <Text style={styles.filaMetaDiariaEtiqueta}>Meta del día</Text>
                        <TextInput
                          style={styles.inputMetaDiaria}
                          value={metaDiariaTexto[p.id] ?? ''}
                          onChangeText={(texto) =>
                            setMetaDiariaTexto((actual) => ({ ...actual, [p.id]: texto.replace(/\D/g, '') }))
                          }
                          onBlur={() => guardarMetaDiaria(p.id)}
                          keyboardType="number-pad"
                          placeholder="Sin meta"
                          placeholderTextColor="#A8988F"
                          editable={guardandoMetaDe !== p.id}
                        />
                        {guardandoMetaDe === p.id ? (
                          <ActivityIndicator size="small" color={COLORES_ADMIN.vino} />
                        ) : (
                          <Pressable
                            style={styles.botonGuardarMeta}
                            onPress={() => guardarMetaDiaria(p.id)}
                            accessibilityLabel="Guardar meta del día"
                          >
                            <Ionicons name="checkmark" size={16} color={COLORES_ADMIN.vino} />
                          </Pressable>
                        )}
                      </View>
                    )}
                  </View>
                );
              })}

              {detalleEvento.estado !== 'CANCELADO' && !esFechaPasada(detalleEvento.fecha, hoyClave) && (
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
                {detalleEvento.estado !== 'CANCELADO' && !esFechaPasada(detalleEvento.fecha, hoyClave) && (
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

const styles = StyleSheet.create({
  contenedor: { flex: 1, backgroundColor: COLORES_ADMIN.background },
  encabezado: {
    backgroundColor: COLORES_ADMIN.vino,
    paddingHorizontal: 20,
    paddingBottom: 16,
  },
  encabezadoAncho: {
    backgroundColor: 'transparent',
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
  tituloAncho: { color: COLORES_ADMIN.vino, fontSize: 20, fontFamily: TIPOGRAFIA_ADMIN.negrita },
  scroll: { padding: 20, gap: 16 },
  layoutAngosto: { gap: 16 },
  layoutAncho: { flexDirection: 'row', alignItems: 'flex-start', gap: 20 },
  columnaCalendario: { width: '100%' },
  columnaCalendarioAncha: { flex: 7 },
  columnaDetalle: { width: '100%' },
  columnaDetalleAncha: { flex: 5 },
  calendario: {
    backgroundColor: COLORES_ADMIN.superficieMasBaja,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORES_ADMIN.bordeSuave,
    padding: 16,
    gap: 6,
  },
  mesEncabezado: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 8,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORES_ADMIN.bordeSuave,
  },
  mesEncabezadoIzquierda: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  navBoton: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: COLORES_ADMIN.superficieBaja,
    borderWidth: 1,
    borderColor: COLORES_ADMIN.bordeSuave,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mesTexto: { fontSize: 17, fontFamily: TIPOGRAFIA_ADMIN.negrita, color: COLORES_ADMIN.vino },
  botonHoy: {
    backgroundColor: COLORES_ADMIN.superficieBaja,
    borderWidth: 1,
    borderColor: COLORES_ADMIN.dorado,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  botonHoyTexto: { fontSize: 12, fontFamily: TIPOGRAFIA_ADMIN.semiNegrita, color: COLORES_ADMIN.vino },
  filaDias: { flexDirection: 'row' },
  diaEtiqueta: {
    flex: 1,
    textAlign: 'center',
    fontSize: 10,
    fontFamily: TIPOGRAFIA_ADMIN.semiNegrita,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    color: COLORES_ADMIN.textoSecundario,
    paddingBottom: 8,
  },
  diaEtiquetaSabado: { color: COLORES_ADMIN.dorado },
  diaEtiquetaDomingo: { color: COLORES_ADMIN.error },
  celdaVacia: { flex: 1, minHeight: 52, margin: 2 },
  celda: {
    flex: 1,
    minHeight: 52,
    margin: 2,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORES_ADMIN.bordeSuave,
    padding: 6,
    justifyContent: 'space-between',
  },
  celdaSeleccionada: {
    backgroundColor: COLORES_ADMIN.vino,
    borderColor: COLORES_ADMIN.vino,
  },
  celdaHoy: {
    borderWidth: 1.5,
    borderColor: COLORES_ADMIN.dorado,
    backgroundColor: COLORES_ADMIN.superficieBaja,
  },
  diaNumero: { fontSize: 12, fontFamily: TIPOGRAFIA_ADMIN.monoMedio, color: COLORES_ADMIN.texto },
  diaNumeroSeleccionado: { color: '#FFFFFF', fontFamily: TIPOGRAFIA_ADMIN.monoSemiNegrita },
  diaNumeroHoy: { color: COLORES_ADMIN.vino, fontFamily: TIPOGRAFIA_ADMIN.monoSemiNegrita },
  puntosFila: { flexDirection: 'row', gap: 3 },
  punto: { width: 6, height: 6, borderRadius: 3 },
  leyenda: {
    marginTop: 10,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: COLORES_ADMIN.bordeSuave,
    gap: 8,
  },
  leyendaTitulo: { fontSize: 11, fontFamily: TIPOGRAFIA_ADMIN.semiNegrita, color: COLORES_ADMIN.texto },
  leyendaItems: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  leyendaItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  leyendaPunto: { width: 8, height: 8, borderRadius: 4 },
  leyendaTexto: { fontSize: 11, fontFamily: TIPOGRAFIA_ADMIN.regular, color: COLORES_ADMIN.textoSecundario },
  leyendaTotal: { fontSize: 11, fontFamily: TIPOGRAFIA_ADMIN.regular, color: COLORES_ADMIN.textoSecundario },
  leyendaTotalNumero: { fontFamily: TIPOGRAFIA_ADMIN.monoSemiNegrita, color: COLORES_ADMIN.texto },
  vacio: {
    fontSize: 13,
    fontFamily: TIPOGRAFIA_ADMIN.regular,
    color: COLORES_ADMIN.textoSecundario,
    textAlign: 'center',
  },
  vacioContenedor: { alignItems: 'center', gap: 8, paddingVertical: 24 },
  detalleDia: {
    backgroundColor: COLORES_ADMIN.superficieMasBaja,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORES_ADMIN.bordeSuave,
    padding: 16,
    gap: 10,
  },
  detalleDiaEncabezado: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 10,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORES_ADMIN.bordeSuave,
  },
  detalleDiaBadges: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  badgeDiaSeleccionado: {
    fontSize: 10,
    fontFamily: TIPOGRAFIA_ADMIN.semiNegrita,
    color: '#FFFFFF',
    backgroundColor: COLORES_ADMIN.vino,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
    overflow: 'hidden',
  },
  badgeConteoEventos: {
    fontSize: 11,
    fontFamily: TIPOGRAFIA_ADMIN.semiNegrita,
    color: COLORES_ADMIN.positivo,
    backgroundColor: '#EAF5EA',
    borderWidth: 1,
    borderColor: '#C3E3C3',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
    overflow: 'hidden',
  },
  detalleDiaTitulo: {
    fontSize: 19,
    fontFamily: TIPOGRAFIA_ADMIN.negrita,
    color: COLORES_ADMIN.texto,
    marginTop: 4,
  },
  detalleDiaSubtitulo: {
    fontSize: 12,
    fontFamily: TIPOGRAFIA_ADMIN.semiNegrita,
    color: COLORES_ADMIN.textoSecundario,
    textTransform: 'capitalize',
  },
  itinerarioTitulo: {
    fontSize: 11,
    fontFamily: TIPOGRAFIA_ADMIN.semiNegrita,
    color: COLORES_ADMIN.vino,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  botonNuevo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: COLORES_ADMIN.vino,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  botonNuevoTexto: { color: '#FFFFFF', fontSize: 12, fontFamily: TIPOGRAFIA_ADMIN.semiNegrita },
  tarjetaEvento: {
    backgroundColor: COLORES_ADMIN.superficieBaja,
    borderRadius: 10,
    borderLeftWidth: 3,
    padding: 12,
    gap: 4,
  },
  tarjetaEventoEncabezado: { flexDirection: 'row', justifyContent: 'flex-end' },
  badgeEstadoPill: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  badgeEstadoPillTexto: {
    fontSize: 10,
    fontFamily: TIPOGRAFIA_ADMIN.semiNegrita,
    color: '#FFFFFF',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  filaEventoEmpresa: { fontSize: 14, fontFamily: TIPOGRAFIA_ADMIN.semiNegrita, color: COLORES_ADMIN.texto },
  filaEventoPunto: { fontSize: 12, fontFamily: TIPOGRAFIA_ADMIN.regular, color: COLORES_ADMIN.textoSecundario },
  tarjetaEventoPie: { flexDirection: 'row', marginTop: 4 },
  tarjetaEventoPieItem: { flexDirection: 'row', alignItems: 'center', gap: 4, flex: 1 },
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
  modalTextoAviso: {
    fontSize: 12,
    fontFamily: TIPOGRAFIA_ADMIN.medio,
    color: COLORES_ADMIN.textoSecundario,
    backgroundColor: COLORES_ADMIN.superficieBaja,
    borderRadius: 8,
    padding: 8,
  },
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
  filaMetaDiaria: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingLeft: 26,
    paddingBottom: 8,
  },
  filaMetaDiariaEtiqueta: {
    fontSize: 11,
    fontFamily: TIPOGRAFIA_ADMIN.regular,
    color: COLORES_ADMIN.textoSecundario,
  },
  inputMetaDiaria: {
    flex: 1,
    borderWidth: 1,
    borderColor: COLORES_ADMIN.bordeSuave,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    fontSize: 12,
    fontFamily: TIPOGRAFIA_ADMIN.monoRegular,
    maxWidth: 120,
  },
  botonGuardarMeta: {
    width: 26,
    height: 26,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: COLORES_ADMIN.vino,
    alignItems: 'center',
    justifyContent: 'center',
  },
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
