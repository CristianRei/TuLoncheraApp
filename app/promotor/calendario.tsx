import Ionicons from '@expo/vector-icons/Ionicons';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { formatearPesos } from '@/core/dinero';
import { formatearRangoHoras } from '@/core/horas';
import type { Evento } from '@/core/tipos';
import { getDb } from '@/db/client';
import { listarEventosPromotor } from '@/db/eventos';
import { aClaveFecha, construirGrilla, NOMBRES_DIA, NOMBRES_MES } from '@/ui/calendarioGrilla';
import { COLORES, TIPOGRAFIA_PROMOTOR, TEXTO_PROMOTOR } from '@/ui/colores';
import { RADII_ADMIN } from '@/ui/tema';
import { EncabezadoPromotor } from '@/ui/EncabezadoPromotor';
import { ContenedorAncho } from '@/ui/ContenedorAncho';
import { useEsPantallaAncha } from '@/ui/useEsPantallaAncha';
import { useRequiereSesion } from '@/ui/useRequiereSesion';
import { useRecargarConDatosNuevos } from '@/ui/useVersionDatos';

function colorEstado(estado: Evento['estado']): string {
  if (estado === 'CANCELADO') return COLORES.error;
  if (estado === 'CERRADO') return COLORES.textoSecundario;
  if (estado === 'EN_CURSO') return COLORES.positivo;
  return COLORES.primario;
}

const ETIQUETAS_ESTADO: Record<Evento['estado'], string> = {
  PLANEADO: 'Planeado',
  EN_CURSO: 'En curso',
  CERRADO: 'Cerrado',
  CANCELADO: 'Cancelado',
};

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

function formatearFechaLarga(clave: string): { diaSemana: string; semana: number } {
  const [anio, mes, dia] = clave.split('-').map(Number);
  const fecha = new Date(anio, mes - 1, dia);
  return { diaSemana: NOMBRES_DIA_SEMANA_LARGO[fecha.getDay()], semana: numeroSemanaISO(fecha) };
}

export default function CalendarioPromotor() {
  const usuario = useRequiereSesion(['PROMOTOR']);
  const pantallaAncha = useEsPantallaAncha();
  const hoy = new Date();
  const [mesVisible, setMesVisible] = useState({ anio: hoy.getFullYear(), mes: hoy.getMonth() });
  const [eventos, setEventos] = useState<Evento[]>([]);
  const [cargando, setCargando] = useState(true);
  const [diaSeleccionado, setDiaSeleccionado] = useState<string | null>(null);

  const hoyClave = aClaveFecha(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());

  const cargar = useCallback(async (silencioso = false) => {
    if (!usuario) return;
    if (!silencioso) setCargando(true);
    try {
      const db = await getDb();
      const desde = aClaveFecha(mesVisible.anio, mesVisible.mes, 1);
      const ultimoDia = new Date(mesVisible.anio, mesVisible.mes + 1, 0).getDate();
      const hasta = aClaveFecha(mesVisible.anio, mesVisible.mes, ultimoDia);
      setEventos(await listarEventosPromotor(db, usuario.id, { desde, hasta }));
    } finally {
      setCargando(false);
    }
  }, [usuario, mesVisible]);

  useFocusEffect(
    useCallback(() => {
      cargar();
    }, [cargar])
  );
  // Un evento que admin planea o cambia llega solo, sin parpadeo de carga —
  // ver src/ui/useVersionDatos.ts.
  useRecargarConDatosNuevos(() => cargar(true));

  if (!usuario) return null;

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

  const fechaSeleccionadaInfo = diaSeleccionado ? formatearFechaLarga(diaSeleccionado) : null;

  return (
    <View style={styles.contenedor}>
      <EncabezadoPromotor titulo="Mi calendario" />

      <ScrollView contentContainerStyle={styles.scroll}>
        <ContenedorAncho anchoMaximo={1100}>
          <View style={pantallaAncha ? styles.layoutAncho : styles.layoutAngosto}>
            <View style={[styles.columnaCalendario, pantallaAncha && styles.columnaCalendarioAncha]}>
              <View style={styles.calendario}>
                <View style={styles.mesEncabezado}>
                  <View style={styles.mesEncabezadoIzquierda}>
                    <Pressable
                      style={styles.navBoton}
                      onPress={irMesAnterior}
                      accessibilityRole="button"
                      accessibilityLabel="Mes anterior"
                    >
                      <Ionicons name="chevron-back" size={18} color={COLORES.oscuro} />
                    </Pressable>
                    <Text style={styles.mesTexto}>
                      {NOMBRES_MES[mesVisible.mes]} {mesVisible.anio}
                    </Text>
                    <Pressable
                      style={styles.navBoton}
                      onPress={irMesSiguiente}
                      accessibilityRole="button"
                      accessibilityLabel="Mes siguiente"
                    >
                      <Ionicons name="chevron-forward" size={18} color={COLORES.oscuro} />
                    </Pressable>
                  </View>
                  <Pressable style={styles.botonHoy} onPress={irAHoy}>
                    <Text style={styles.botonHoyTexto}>Ir a hoy ({hoy.getDate()})</Text>
                  </Pressable>
                </View>

                <View style={styles.filaDias}>
                  {NOMBRES_DIA_LARGO.map((nombre, indice) => (
                    <Text key={nombre} style={styles.diaEtiqueta}>
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
                      <View style={[styles.leyendaPunto, { backgroundColor: COLORES.primario }]} />
                      <Text style={styles.leyendaTexto}>Planeado</Text>
                    </View>
                    <View style={styles.leyendaItem}>
                      <View style={[styles.leyendaPunto, { backgroundColor: COLORES.positivo }]} />
                      <Text style={styles.leyendaTexto}>En curso</Text>
                    </View>
                    <View style={styles.leyendaItem}>
                      <View style={[styles.leyendaPunto, { backgroundColor: COLORES.textoSecundario }]} />
                      <Text style={styles.leyendaTexto}>Cerrado</Text>
                    </View>
                    <View style={styles.leyendaItem}>
                      <View style={[styles.leyendaPunto, { backgroundColor: COLORES.error }]} />
                      <Text style={styles.leyendaTexto}>Cancelado</Text>
                    </View>
                  </View>
                </View>
              </View>
            </View>

            <View style={[styles.columnaDetalle, pantallaAncha && styles.columnaDetalleAncha]}>
              {cargando ? (
                <ActivityIndicator color={COLORES.oscuro} style={{ marginTop: 20 }} />
              ) : diaSeleccionado && fechaSeleccionadaInfo ? (
                <View style={styles.detalleDia}>
                  <Text style={styles.badgeDiaSeleccionado}>Día seleccionado</Text>
                  <Text style={styles.detalleDiaTitulo}>{diaSeleccionado}</Text>
                  <Text style={styles.detalleDiaSubtitulo}>
                    {fechaSeleccionadaInfo.diaSemana} · Semana {fechaSeleccionadaInfo.semana}
                  </Text>

                  {eventosDelDia.length === 0 ? (
                    <View style={styles.vacioContenedor}>
                      <Ionicons name="calendar-outline" size={28} color={COLORES.borde} />
                      <Text style={styles.vacio}>Sin eventos asignados este día.</Text>
                    </View>
                  ) : (
                    eventosDelDia.map((evento) => (
                      <View
                        key={evento.id}
                        style={[
                          styles.tarjetaEvento,
                          { borderLeftColor: colorEstado(evento.estado) },
                          evento.estado === 'CANCELADO' && styles.tarjetaEventoCancelada,
                        ]}
                      >
                        <View style={styles.tarjetaEventoEncabezado}>
                          <View
                            style={[styles.badgeEstadoPill, { backgroundColor: colorEstado(evento.estado) }]}
                          >
                            <Text style={styles.badgeEstadoPillTexto}>{ETIQUETAS_ESTADO[evento.estado]}</Text>
                          </View>
                        </View>
                        <Text
                          style={[
                            styles.filaEventoEmpresa,
                            evento.estado === 'CANCELADO' && styles.textoTachado,
                          ]}
                        >
                          {evento.empresaNombre}
                        </Text>
                        <Text
                          style={[styles.filaEventoPunto, evento.estado === 'CANCELADO' && styles.textoTachado]}
                        >
                          {evento.puntoNombre}
                        </Text>
                        {evento.estado !== 'CANCELADO' && (
                          <View style={styles.datosEvento}>
                            {evento.horaInicio && (
                              <View style={styles.datoEvento}>
                                <Ionicons name="time-outline" size={14} color={COLORES.oscuro} />
                                <Text style={styles.datoEventoTexto}>
                                  {formatearRangoHoras(evento.horaInicio, evento.horaFin)}
                                </Text>
                              </View>
                            )}
                            {evento.metaDiaria !== null && (
                              <View style={styles.datoEvento}>
                                <Ionicons name="flag-outline" size={14} color={COLORES.oscuro} />
                                <Text style={styles.datoEventoTexto}>
                                  {evento.promotorIds.length > 1 ? 'Meta del equipo: ' : 'Tu meta: '}
                                  <Text style={styles.datoEventoCifra}>{formatearPesos(evento.metaDiaria)}</Text>
                                </Text>
                              </View>
                            )}
                            {evento.promotorIds.length > 1 && (
                              <View style={styles.datoEvento}>
                                <Ionicons name="people-outline" size={14} color={COLORES.oscuro} />
                                <Text style={styles.datoEventoTexto}>
                                  Con {evento.promotorNombres.filter((_, i) => evento.promotorIds[i] !== usuario.id).join(', ')}
                                </Text>
                              </View>
                            )}
                          </View>
                        )}
                        {evento.estado === 'CANCELADO' && evento.motivoCancelacion && (
                          <Text style={styles.filaEventoMotivo}>Motivo: {evento.motivoCancelacion}</Text>
                        )}
                      </View>
                    ))
                  )}
                </View>
              ) : (
                <View style={styles.detalleDia}>
                  <View style={styles.vacioContenedor}>
                    <Ionicons name="calendar-outline" size={28} color={COLORES.borde} />
                    <Text style={styles.vacio}>Toca un día para ver dónde estás asignado.</Text>
                  </View>
                </View>
              )}
            </View>
          </View>
        </ContenedorAncho>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  contenedor: { flex: 1, backgroundColor: COLORES.fondo },
  scroll: { padding: 16, gap: 14 },
  layoutAngosto: { gap: 14 },
  layoutAncho: { flexDirection: 'row', alignItems: 'flex-start', gap: 18 },
  columnaCalendario: { width: '100%' },
  columnaCalendarioAncha: { flex: 7 },
  columnaDetalle: { width: '100%' },
  columnaDetalleAncha: { flex: 5 },
  calendario: {
    backgroundColor: COLORES.superficie,
    borderRadius: RADII_ADMIN.lg,
    borderWidth: 1,
    borderColor: COLORES.borde,
    padding: 14,
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
    borderBottomColor: COLORES.borde,
  },
  mesEncabezadoIzquierda: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  navBoton: {
    width: 32,
    height: 32,
    borderRadius: RADII_ADMIN.sm,
    backgroundColor: COLORES.fondo,
    borderWidth: 1,
    borderColor: COLORES.borde,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mesTexto: {
    ...TEXTO_PROMOTOR.tituloTarjeta,
    color: COLORES.oscuro,
  },
  botonHoy: {
    backgroundColor: COLORES.fondo,
    borderWidth: 1,
    borderColor: COLORES.primario,
    borderRadius: RADII_ADMIN.sm,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  botonHoyTexto: {
    ...TEXTO_PROMOTOR.boton,
    color: COLORES.oscuro,
  },
  filaDias: { flexDirection: 'row' },
  diaEtiqueta: {
    flex: 1,
    textAlign: 'center',
    fontSize: 10,
    fontFamily: TIPOGRAFIA_PROMOTOR.semiNegrita,
    textTransform: 'uppercase',
    color: COLORES.textoSecundario,
    paddingBottom: 8,
  },
  celdaVacia: { width: '13.4%', minHeight: 48, margin: '0.43%' },
  celda: {
    width: '13.4%',
    minHeight: 48,
    margin: '0.43%',
    borderRadius: RADII_ADMIN.sm,
    borderWidth: 1,
    borderColor: COLORES.borde,
    padding: 6,
    justifyContent: 'space-between',
  },
  celdaSeleccionada: { backgroundColor: COLORES.oscuro, borderColor: COLORES.oscuro },
  celdaHoy: { borderWidth: 1.5, borderColor: COLORES.primario, backgroundColor: COLORES.fondo },
  diaNumero: { fontSize: 12, fontFamily: TIPOGRAFIA_PROMOTOR.medio, color: COLORES.textoSobreOscuro },
  diaNumeroSeleccionado: { color: COLORES.textoInverso, fontFamily: TIPOGRAFIA_PROMOTOR.negrita },
  diaNumeroHoy: { color: COLORES.oscuro, fontFamily: TIPOGRAFIA_PROMOTOR.negrita },
  puntosFila: { flexDirection: 'row', gap: 3 },
  punto: { width: 6, height: 6, borderRadius: 3 },
  leyenda: { marginTop: 10, paddingTop: 12, borderTopWidth: 1, borderTopColor: COLORES.borde, gap: 8 },
  leyendaTitulo: { fontSize: 11, fontFamily: TIPOGRAFIA_PROMOTOR.semiNegrita, color: COLORES.textoSobreOscuro },
  leyendaItems: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  leyendaItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  leyendaPunto: { width: 8, height: 8, borderRadius: 4 },
  leyendaTexto: {
    ...TEXTO_PROMOTOR.nota,
  },
  vacio: {
    ...TEXTO_PROMOTOR.cuerpoSecundario,
    textAlign: 'center',
  },
  vacioContenedor: { alignItems: 'center', gap: 8, paddingVertical: 24 },
  detalleDia: {
    backgroundColor: COLORES.superficie,
    borderRadius: RADII_ADMIN.lg,
    borderWidth: 1,
    borderColor: COLORES.borde,
    padding: 16,
    gap: 8,
  },
  badgeDiaSeleccionado: {
    fontSize: 10,
    fontFamily: TIPOGRAFIA_PROMOTOR.semiNegrita,
    color: COLORES.textoInverso,
    backgroundColor: COLORES.oscuro,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
    alignSelf: 'flex-start',
    overflow: 'hidden',
  },
  detalleDiaTitulo: {
    ...TEXTO_PROMOTOR.tituloSeccion,
    color: COLORES.oscuro,
  },
  detalleDiaSubtitulo: {
    fontSize: 12,
    fontFamily: TIPOGRAFIA_PROMOTOR.semiNegrita,
    color: COLORES.textoSecundario,
    textTransform: 'capitalize',
    marginBottom: 4,
  },
  tarjetaEvento: {
    backgroundColor: COLORES.fondo,
    borderRadius: RADII_ADMIN.sm,
    borderLeftWidth: 3,
    padding: 12,
    gap: 4,
  },
  tarjetaEventoCancelada: { opacity: 0.6 },
  tarjetaEventoEncabezado: { flexDirection: 'row', justifyContent: 'flex-end' },
  badgeEstadoPill: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4 },
  badgeEstadoPillTexto: {
    fontSize: 10,
    fontFamily: TIPOGRAFIA_PROMOTOR.semiNegrita,
    color: COLORES.textoInverso,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  filaEventoEmpresa: {
    ...TEXTO_PROMOTOR.tituloTarjeta,
    color: COLORES.textoSobreOscuro,
  },
  filaEventoPunto: {
    ...TEXTO_PROMOTOR.cuerpoSecundario,
  },
  filaEventoMotivo: {
    ...TEXTO_PROMOTOR.nota,
    color: COLORES.error,
    marginTop: 2,
  },
  datosEvento: { gap: 4, marginTop: 6 },
  datoEvento: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  datoEventoTexto: {
    ...TEXTO_PROMOTOR.cuerpo,
    color: COLORES.textoSobreOscuro,
    flexShrink: 1,
  },
  datoEventoCifra: { fontFamily: TIPOGRAFIA_PROMOTOR.monoSemiNegrita, color: COLORES.oscuro },
  textoTachado: { textDecorationLine: 'line-through' },
});
