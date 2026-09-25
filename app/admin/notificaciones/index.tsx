import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { formatearPesos } from '@/core/dinero';
import { mensajeDeError } from '@/core/errores';
import type { Notificacion, Persona, Rol, TipoNotificacion } from '@/core/tipos';
import { getDb } from '@/db/client';
import { getDispositivoId } from '@/db/dispositivo';
import { enviarMensajes } from '@/db/mensajes';
import { obtenerProgresoMetasDiarias, type ProgresoMetaDiaria } from '@/db/metasDiarias';
import {
  generarNotificaciones,
  listarNotificaciones,
  marcarNotificacionLeida,
} from '@/db/notificaciones';
import { listarPersonalCompleto } from '@/db/personal';
import { ContenedorAncho } from '@/ui/ContenedorAncho';
import { ANCHO_ADMIN, COLORES_ADMIN, TIPOGRAFIA_ADMIN, ESTADO_ADMIN, RADII_ADMIN } from '@/ui/tema';
import { useEsPantallaAncha } from '@/ui/useEsPantallaAncha';
import { useRequiereSesion } from '@/ui/useRequiereSesion';

type Pestana = 'ALERTAS' | 'MENSAJES';

type FiltroAlertas = 'NO_LEIDAS' | 'TODAS';

type RolDestino = 'PROMOTOR' | 'BODEGA';

const ETIQUETAS_TIPO: Record<TipoNotificacion, string> = {
  STOCK_BAJO: 'Stock bajo',
  LOTE_POR_VENCER: 'Vencimiento próximo',
  CARGUE_REVISAR: 'Cargue a revisar',
  DESBLOQUEO_PIN: 'Desbloqueo de PIN',
};

const ICONOS_TIPO: Record<TipoNotificacion, keyof typeof Ionicons.glyphMap> = {
  STOCK_BAJO: 'cube-outline',
  LOTE_POR_VENCER: 'time-outline',
  CARGUE_REVISAR: 'alert-circle-outline',
  DESBLOQUEO_PIN: 'lock-open-outline',
};

const ETIQUETA_ROL: Record<RolDestino, string> = {
  PROMOTOR: 'Promotores',
  BODEGA: 'Bodega',
};

function formatearFechaRelativa(iso: string): string {
  const minutos = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (minutos < 1) return 'hace instantes';
  if (minutos < 60) return `hace ${minutos} min`;
  const horas = Math.floor(minutos / 60);
  if (horas < 24) return `hace ${horas} h`;
  const dias = Math.floor(horas / 24);
  return `hace ${dias} día${dias === 1 ? '' : 's'}`;
}

/** La meta es del equipo del evento: con varios promotores, el mensaje habla en plural. */
function mensajeProgreso(fila: ProgresoMetaDiaria): string {
  const cifras = `${formatearPesos(fila.totalVendidoHoy)} de ${formatearPesos(fila.metaDiaria)}`;
  const equipo = fila.promotorIds.length > 1;
  if (fila.progresoPct >= 100) {
    return equipo
      ? `¡Felicitaciones! Ya cumplieron la meta del día en ${fila.puntoNombre} (${cifras}).`
      : `¡Felicitaciones! Ya cumpliste tu meta del día en ${fila.puntoNombre} (${cifras}).`;
  }
  return equipo
    ? `Ánimo, entre todos van en un ${fila.progresoPct}% de la meta de hoy en ${fila.puntoNombre} (${cifras}) — ¡con esfuerzo la cumplen!`
    : `Ánimo, vas en un ${fila.progresoPct}% de tu meta de hoy en ${fila.puntoNombre} (${cifras}) — ¡con esfuerzo la cumples!`;
}

export default function NotificacionesYMensajes() {
  const usuario = useRequiereSesion(['ADMIN']);
  const insets = useSafeAreaInsets();
  const anchaPantalla = useEsPantallaAncha();

  const [pestana, setPestana] = useState<Pestana>('ALERTAS');

  // --- Alertas del sistema ---
  const [notificaciones, setNotificaciones] = useState<Notificacion[]>([]);
  const [filtroAlertas, setFiltroAlertas] = useState<FiltroAlertas>('NO_LEIDAS');
  const [cargandoAlertas, setCargandoAlertas] = useState(true);

  // --- Mensajes a promotores/bodega ---
  const [rol, setRol] = useState<RolDestino>('PROMOTOR');
  const [personal, setPersonal] = useState<Persona[]>([]);
  const [seleccionados, setSeleccionados] = useState<Set<string>>(new Set());
  const [cuerpo, setCuerpo] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [aviso, setAviso] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null);
  const [progresoMetas, setProgresoMetas] = useState<ProgresoMetaDiaria[]>([]);
  const [cargandoMetas, setCargandoMetas] = useState(true);
  const [enviandoMetas, setEnviandoMetas] = useState(false);

  const cargarAlertas = useCallback(async () => {
    setCargandoAlertas(true);
    try {
      const db = await getDb();
      const dispositivoId = await getDispositivoId(db);
      await generarNotificaciones(db, dispositivoId);
      setNotificaciones(await listarNotificaciones(db));
    } finally {
      setCargandoAlertas(false);
    }
  }, []);

  const cargarPersonal = useCallback(async (rolActual: RolDestino) => {
    const db = await getDb();
    const lista = await listarPersonalCompleto(db, { rol: rolActual as Rol });
    setPersonal(lista);
    setSeleccionados(new Set(lista.map((p) => p.id))); // todos marcados por defecto
  }, []);

  const cargarMetas = useCallback(async () => {
    setCargandoMetas(true);
    try {
      const db = await getDb();
      setProgresoMetas(await obtenerProgresoMetasDiarias(db));
    } finally {
      setCargandoMetas(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      cargarAlertas();
      cargarPersonal(rol);
      cargarMetas();
    }, [cargarAlertas, cargarPersonal, cargarMetas, rol])
  );

  if (!usuario) return null;

  const alertasFiltradas = notificaciones.filter((n) => (filtroAlertas === 'NO_LEIDAS' ? !n.leida : true));
  const noLeidas = notificaciones.filter((n) => !n.leida).length;

  async function marcarLeida(id: string) {
    const db = await getDb();
    await marcarNotificacionLeida(db, id);
    setNotificaciones((actual) => actual.map((n) => (n.id === id ? { ...n, leida: true } : n)));
  }

  function alternarSeleccion(id: string) {
    setSeleccionados((actual) => {
      const nuevo = new Set(actual);
      if (nuevo.has(id)) nuevo.delete(id);
      else nuevo.add(id);
      return nuevo;
    });
  }

  async function enviar() {
    if (cuerpo.trim().length === 0 || seleccionados.size === 0 || !usuario) return;
    setEnviando(true);
    setAviso(null);
    try {
      const destinatarios = personal
        .filter((p) => seleccionados.has(p.id))
        .map((p) => ({ id: p.id, nombre: p.nombre }));
      await enviarMensajes(
        [{ cuerpo: cuerpo.trim(), tipo: 'MANUAL', destinatarios }],
        { id: usuario.id, nombre: usuario.nombre }
      );
      setCuerpo('');
      setAviso({ tipo: 'ok', texto: `Mensaje enviado a ${destinatarios.length} persona(s).` });
    } catch (error) {
      setAviso({ tipo: 'error', texto: mensajeDeError(error) });
    } finally {
      setEnviando(false);
    }
  }

  const totalPromotoresConMeta = progresoMetas.reduce((suma, fila) => suma + fila.promotorIds.length, 0);

  async function enviarProgresoDeMetas() {
    if (!usuario || progresoMetas.length === 0) return;
    setEnviandoMetas(true);
    setAviso(null);
    try {
      await enviarMensajes(
        progresoMetas.map((fila) => ({
          cuerpo: mensajeProgreso(fila),
          tipo: 'META_PROGRESO',
          destinatarios: fila.promotorIds.map((id, i) => ({ id, nombre: fila.promotorNombres[i] })),
        })),
        { id: usuario.id, nombre: usuario.nombre }
      );
      setAviso({ tipo: 'ok', texto: `Progreso enviado a ${totalPromotoresConMeta} promotor(es).` });
    } catch (error) {
      setAviso({ tipo: 'error', texto: mensajeDeError(error) });
    } finally {
      setEnviandoMetas(false);
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
        <ContenedorAncho anchoMaximo={ANCHO_ADMIN.lista}>
          <View style={styles.encabezadoFila}>
            {!anchaPantalla && (
              <Pressable style={styles.volverBoton} onPress={() => router.back()}>
                <Ionicons name="chevron-back" size={16} color="#FFE9E2" />
                <Text style={styles.volverTexto}>Admin</Text>
              </Pressable>
            )}
            <Text style={anchaPantalla ? styles.tituloAncho : styles.titulo}>Notificaciones</Text>
            {!anchaPantalla && <View style={{ width: 60 }} />}
          </View>
        </ContenedorAncho>
      </View>

      <ContenedorAncho anchoMaximo={ANCHO_ADMIN.lista}>
        <View style={styles.pestanas}>
          <Pressable
            style={[styles.pestana, pestana === 'ALERTAS' && styles.pestanaActiva]}
            onPress={() => setPestana('ALERTAS')}
          >
            <Text style={[styles.pestanaTexto, pestana === 'ALERTAS' && styles.pestanaTextoActiva]}>
              Alertas del sistema{noLeidas > 0 ? ` (${noLeidas})` : ''}
            </Text>
          </Pressable>
          <Pressable
            style={[styles.pestana, pestana === 'MENSAJES' && styles.pestanaActiva]}
            onPress={() => setPestana('MENSAJES')}
          >
            <Text style={[styles.pestanaTexto, pestana === 'MENSAJES' && styles.pestanaTextoActiva]}>
              Mensajes
            </Text>
          </Pressable>
        </View>
      </ContenedorAncho>

      {pestana === 'ALERTAS' ? (
        <>
          <ContenedorAncho anchoMaximo={ANCHO_ADMIN.lista}>
            <View style={styles.tabsFiltro}>
              <Pressable
                style={[styles.tabFiltro, filtroAlertas === 'NO_LEIDAS' && styles.tabFiltroActivo]}
                onPress={() => setFiltroAlertas('NO_LEIDAS')}
              >
                <Text style={[styles.tabFiltroTexto, filtroAlertas === 'NO_LEIDAS' && styles.tabFiltroTextoActivo]}>
                  No leídas
                </Text>
              </Pressable>
              <Pressable
                style={[styles.tabFiltro, filtroAlertas === 'TODAS' && styles.tabFiltroActivo]}
                onPress={() => setFiltroAlertas('TODAS')}
              >
                <Text style={[styles.tabFiltroTexto, filtroAlertas === 'TODAS' && styles.tabFiltroTextoActivo]}>
                  Todas
                </Text>
              </Pressable>
            </View>
          </ContenedorAncho>

          {cargandoAlertas ? (
            <View style={styles.centrado}>
              <ActivityIndicator size="large" color={COLORES_ADMIN.vino} />
            </View>
          ) : alertasFiltradas.length === 0 ? (
            <View style={styles.centrado}>
              <Text style={styles.vacio}>
                {filtroAlertas === 'NO_LEIDAS' ? 'No hay notificaciones sin leer.' : 'No hay notificaciones.'}
              </Text>
            </View>
          ) : (
            <ContenedorAncho anchoMaximo={ANCHO_ADMIN.lista} llenarAlto>
              <FlatList
                data={alertasFiltradas}
                keyExtractor={(n) => n.id}
                contentContainerStyle={styles.lista}
                renderItem={({ item }) => (
                  <View style={[styles.fila, !item.leida && styles.filaNoLeida]}>
                    <View
                      style={[
                        styles.icono,
                        item.nivel === 'CRITICO' && styles.iconoCritico,
                        item.nivel === 'ALERTA' && styles.iconoAlerta,
                      ]}
                    >
                      <Ionicons
                        name={ICONOS_TIPO[item.tipo]}
                        size={18}
                        color={
                          item.nivel === 'CRITICO'
                            ? COLORES_ADMIN.error
                            : item.nivel === 'ALERTA'
                              ? COLORES_ADMIN.vino
                              : COLORES_ADMIN.textoSecundario
                        }
                      />
                    </View>
                    <View style={styles.filaTexto}>
                      <View style={styles.filaEncabezado}>
                        <Text style={styles.filaTipo}>{ETIQUETAS_TIPO[item.tipo]}</Text>
                        <Text style={styles.filaTiempo}>{formatearFechaRelativa(item.tsCliente)}</Text>
                      </View>
                      <Text style={styles.filaTitulo}>{item.titulo}</Text>
                      <Text style={styles.filaDetalle}>{item.detalle}</Text>
                    </View>
                    {!item.leida && (
                      <Pressable style={styles.botonLeida} onPress={() => marcarLeida(item.id)}>
                        <Text style={styles.botonLeidaTexto}>Marcar leída</Text>
                      </Pressable>
                    )}
                  </View>
                )}
              />
            </ContenedorAncho>
          )}
        </>
      ) : (
        <ScrollView contentContainerStyle={styles.scroll}>
          <ContenedorAncho anchoMaximo={ANCHO_ADMIN.lista} style={{ gap: 16 }}>
            {aviso && (
              <View style={[styles.aviso, aviso.tipo === 'error' && styles.avisoError]}>
                <Text style={[styles.avisoTexto, aviso.tipo === 'error' && styles.avisoTextoError]}>
                  {aviso.texto}
                </Text>
              </View>
            )}

            <View style={styles.tarjeta}>
              <Text style={styles.tarjetaTitulo}>Progreso de la meta del día</Text>
              <Text style={styles.tarjetaDescripcion}>
                Envía a cada promotor con meta asignada hoy un mensaje personalizado con su % de avance.
              </Text>
              {cargandoMetas ? (
                <ActivityIndicator color={COLORES_ADMIN.vino} style={{ marginTop: 8 }} />
              ) : progresoMetas.length === 0 ? (
                <Text style={styles.vacio}>Ningún promotor tiene una meta diaria asignada hoy (Calendario de eventos).</Text>
              ) : (
                <>
                  {progresoMetas.map((fila) => (
                    <View key={fila.eventoId} style={styles.filaProgreso}>
                      <Text style={styles.filaProgresoNombre}>
                        {fila.promotorNombres.join(', ')} · {fila.puntoNombre}
                      </Text>
                      <Text style={styles.filaProgresoPct}>{fila.progresoPct}%</Text>
                    </View>
                  ))}
                  <Pressable
                    style={[styles.boton, enviandoMetas && styles.botonDeshabilitado]}
                    disabled={enviandoMetas}
                    onPress={enviarProgresoDeMetas}
                  >
                    {enviandoMetas ? (
                      <ActivityIndicator color="#fff" size="small" />
                    ) : (
                      <Text style={styles.botonTexto}>Enviar progreso a {totalPromotoresConMeta} promotor(es)</Text>
                    )}
                  </Pressable>
                </>
              )}
            </View>

            <View style={styles.tarjeta}>
              <Text style={styles.tarjetaTitulo}>Enviar un mensaje</Text>
              <Text style={styles.tarjetaDescripcion}>
                Llega como notificación push al celular de cada persona seleccionada.
              </Text>

              <View style={styles.tabsRol}>
                {(['PROMOTOR', 'BODEGA'] as RolDestino[]).map((opcion) => (
                  <Pressable
                    key={opcion}
                    style={[styles.chipRol, rol === opcion && styles.chipRolActivo]}
                    onPress={() => setRol(opcion)}
                  >
                    <Text style={[styles.chipRolTexto, rol === opcion && styles.chipRolTextoActivo]}>
                      {ETIQUETA_ROL[opcion]}
                    </Text>
                  </Pressable>
                ))}
              </View>

              <View style={styles.filaSeleccionTodos}>
                <Text style={styles.etiquetaSeleccion}>
                  {seleccionados.size} de {personal.length} seleccionados
                </Text>
                <Pressable onPress={() => setSeleccionados(new Set(personal.map((p) => p.id)))}>
                  <Text style={styles.enlaceSeleccion}>Todos</Text>
                </Pressable>
                <Pressable onPress={() => setSeleccionados(new Set())}>
                  <Text style={styles.enlaceSeleccion}>Ninguno</Text>
                </Pressable>
              </View>

              {personal.length === 0 ? (
                <Text style={styles.vacio}>No hay {ETIQUETA_ROL[rol].toLowerCase()} activos.</Text>
              ) : (
                personal.map((p) => {
                  const marcado = seleccionados.has(p.id);
                  return (
                    <Pressable key={p.id} style={styles.filaCheckbox} onPress={() => alternarSeleccion(p.id)}>
                      <View style={[styles.checkbox, marcado && styles.checkboxMarcado]}>
                        {marcado && <Text style={styles.checkboxMarca}>✓</Text>}
                      </View>
                      <Text style={styles.filaCheckboxTexto}>{p.nombre}</Text>
                    </Pressable>
                  );
                })
              )}

              <TextInput
                style={styles.textoMensaje}
                placeholder="Escribe el mensaje..."
                placeholderTextColor="#999"
                value={cuerpo}
                onChangeText={setCuerpo}
                multiline
              />

              <Pressable
                style={[
                  styles.boton,
                  (enviando || cuerpo.trim().length === 0 || seleccionados.size === 0) && styles.botonDeshabilitado,
                ]}
                disabled={enviando || cuerpo.trim().length === 0 || seleccionados.size === 0}
                onPress={enviar}
              >
                {enviando ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.botonTexto}>Enviar mensaje</Text>
                )}
              </Pressable>
            </View>

            <Text style={styles.notaConductor}>
              Nota: Conductor no tiene todavía una pantalla propia en la app, así que no puede recibir mensajes por ahora.
            </Text>
          </ContenedorAncho>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  contenedor: {
    flex: 1,
    backgroundColor: COLORES_ADMIN.background,
  },
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
  encabezadoFila: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  volverBoton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: RADII_ADMIN.sm,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  volverTexto: {
    fontSize: 13,
    fontFamily: TIPOGRAFIA_ADMIN.medio,
    color: COLORES_ADMIN.superficie,
  },
  titulo: {
    fontSize: 16,
    fontFamily: TIPOGRAFIA_ADMIN.semiNegrita,
    color: COLORES_ADMIN.textoInverso,
  },
  tituloAncho: {
    fontSize: 20,
    fontFamily: TIPOGRAFIA_ADMIN.negrita,
    color: COLORES_ADMIN.vino,
  },
  pestanas: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  pestana: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: RADII_ADMIN.sm,
    backgroundColor: COLORES_ADMIN.superficieMasBaja,
    borderWidth: 1,
    borderColor: COLORES_ADMIN.bordeSuave,
    alignItems: 'center',
  },
  pestanaActiva: {
    backgroundColor: COLORES_ADMIN.vino,
    borderColor: COLORES_ADMIN.vino,
  },
  pestanaTexto: {
    fontSize: 13,
    fontFamily: TIPOGRAFIA_ADMIN.semiNegrita,
    color: COLORES_ADMIN.textoSecundario,
  },
  pestanaTextoActiva: {
    color: COLORES_ADMIN.textoInverso,
  },
  tabsFiltro: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  tabFiltro: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: RADII_ADMIN.lg,
    backgroundColor: COLORES_ADMIN.superficieMasBaja,
    borderWidth: 1,
    borderColor: COLORES_ADMIN.bordeSuave,
  },
  tabFiltroActivo: {
    backgroundColor: COLORES_ADMIN.vino,
    borderColor: COLORES_ADMIN.vino,
  },
  tabFiltroTexto: {
    fontSize: 13,
    fontFamily: TIPOGRAFIA_ADMIN.medio,
    color: COLORES_ADMIN.textoSecundario,
  },
  tabFiltroTextoActivo: {
    color: COLORES_ADMIN.textoInverso,
    fontFamily: TIPOGRAFIA_ADMIN.semiNegrita,
  },
  centrado: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  vacio: {
    fontSize: 14,
    fontFamily: TIPOGRAFIA_ADMIN.regular,
    color: COLORES_ADMIN.textoSecundario,
    textAlign: 'center',
  },
  lista: {
    padding: 20,
    gap: 10,
  },
  fila: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    backgroundColor: COLORES_ADMIN.superficieMasBaja,
    borderRadius: RADII_ADMIN.md,
    borderWidth: 1,
    borderColor: COLORES_ADMIN.bordeSuave,
    padding: 14,
  },
  filaNoLeida: {
    borderColor: COLORES_ADMIN.dorado,
  },
  icono: {
    width: 36,
    height: 36,
    borderRadius: RADII_ADMIN.sm,
    backgroundColor: COLORES_ADMIN.superficie,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  iconoCritico: {
    backgroundColor: ESTADO_ADMIN.error.fondo,
  },
  iconoAlerta: {
    backgroundColor: COLORES_ADMIN.superficieMasAlta,
  },
  filaTexto: {
    flex: 1,
    gap: 3,
  },
  filaEncabezado: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  filaTipo: {
    fontSize: 11,
    fontFamily: TIPOGRAFIA_ADMIN.semiNegrita,
    color: COLORES_ADMIN.textoSecundario,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  filaTiempo: {
    fontSize: 11,
    fontFamily: TIPOGRAFIA_ADMIN.monoRegular,
    color: COLORES_ADMIN.textoSecundario,
  },
  filaTitulo: {
    fontSize: 14,
    fontFamily: TIPOGRAFIA_ADMIN.semiNegrita,
    color: COLORES_ADMIN.texto,
  },
  filaDetalle: {
    fontSize: 13,
    fontFamily: TIPOGRAFIA_ADMIN.regular,
    color: COLORES_ADMIN.textoSecundario,
    lineHeight: 17,
  },
  botonLeida: {
    alignSelf: 'center',
    borderWidth: 1,
    borderColor: COLORES_ADMIN.bordeSuave,
    borderRadius: RADII_ADMIN.sm,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  botonLeidaTexto: {
    fontSize: 11,
    fontFamily: TIPOGRAFIA_ADMIN.semiNegrita,
    color: COLORES_ADMIN.vino,
  },
  scroll: {
    padding: 20,
    paddingBottom: 40,
  },
  aviso: {
    backgroundColor: ESTADO_ADMIN.exito.fondo,
    borderWidth: 1,
    borderColor: ESTADO_ADMIN.exito.borde,
    borderRadius: RADII_ADMIN.sm,
    padding: 12,
  },
  avisoError: {
    backgroundColor: ESTADO_ADMIN.error.fondo,
    borderColor: ESTADO_ADMIN.error.borde,
  },
  avisoTexto: {
    fontSize: 13,
    fontFamily: TIPOGRAFIA_ADMIN.semiNegrita,
    color: ESTADO_ADMIN.exito.texto,
  },
  avisoTextoError: {
    color: COLORES_ADMIN.error,
  },
  tarjeta: {
    backgroundColor: COLORES_ADMIN.superficieMasBaja,
    borderRadius: RADII_ADMIN.md,
    borderWidth: 1,
    borderColor: COLORES_ADMIN.bordeSuave,
    padding: 16,
    gap: 10,
  },
  tarjetaTitulo: {
    fontSize: 16,
    fontFamily: TIPOGRAFIA_ADMIN.semiNegrita,
    color: COLORES_ADMIN.texto,
  },
  tarjetaDescripcion: {
    fontSize: 13,
    fontFamily: TIPOGRAFIA_ADMIN.regular,
    color: COLORES_ADMIN.textoSecundario,
  },
  filaProgreso: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: COLORES_ADMIN.bordeSuave,
  },
  filaProgresoNombre: {
    fontSize: 14,
    fontFamily: TIPOGRAFIA_ADMIN.regular,
    color: COLORES_ADMIN.texto,
  },
  filaProgresoPct: {
    fontSize: 14,
    fontFamily: TIPOGRAFIA_ADMIN.semiNegrita,
    color: COLORES_ADMIN.vino,
  },
  tabsRol: {
    flexDirection: 'row',
    gap: 8,
  },
  chipRol: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: RADII_ADMIN.lg,
    backgroundColor: COLORES_ADMIN.superficieBaja,
    borderWidth: 1,
    borderColor: COLORES_ADMIN.bordeSuave,
  },
  chipRolActivo: {
    backgroundColor: COLORES_ADMIN.vino,
    borderColor: COLORES_ADMIN.vino,
  },
  chipRolTexto: {
    fontSize: 13,
    fontFamily: TIPOGRAFIA_ADMIN.medio,
    color: COLORES_ADMIN.textoSecundario,
  },
  chipRolTextoActivo: {
    color: COLORES_ADMIN.textoInverso,
    fontFamily: TIPOGRAFIA_ADMIN.semiNegrita,
  },
  filaSeleccionTodos: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginTop: 4,
  },
  etiquetaSeleccion: {
    fontSize: 12,
    fontFamily: TIPOGRAFIA_ADMIN.regular,
    color: COLORES_ADMIN.textoSecundario,
    flex: 1,
  },
  enlaceSeleccion: {
    fontSize: 12,
    fontFamily: TIPOGRAFIA_ADMIN.semiNegrita,
    color: COLORES_ADMIN.vino,
    textDecorationLine: 'underline',
  },
  filaCheckbox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 6,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: COLORES_ADMIN.borde,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxMarcado: {
    backgroundColor: COLORES_ADMIN.vino,
    borderColor: COLORES_ADMIN.vino,
  },
  checkboxMarca: {
    color: COLORES_ADMIN.textoInverso,
    fontSize: 12,
    fontFamily: TIPOGRAFIA_ADMIN.semiNegrita,
  },
  filaCheckboxTexto: {
    fontSize: 14,
    fontFamily: TIPOGRAFIA_ADMIN.regular,
    color: COLORES_ADMIN.texto,
  },
  textoMensaje: {
    borderWidth: 1,
    borderColor: COLORES_ADMIN.bordeSuave,
    borderRadius: RADII_ADMIN.sm,
    padding: 12,
    fontSize: 14,
    fontFamily: TIPOGRAFIA_ADMIN.regular,
    minHeight: 80,
    textAlignVertical: 'top',
    marginTop: 6,
    color: COLORES_ADMIN.texto,
  },
  boton: {
    backgroundColor: COLORES_ADMIN.vino,
    borderRadius: RADII_ADMIN.sm,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 4,
  },
  botonDeshabilitado: {
    opacity: 0.5,
  },
  botonTexto: {
    color: COLORES_ADMIN.textoInverso,
    fontSize: 14,
    fontFamily: TIPOGRAFIA_ADMIN.semiNegrita,
  },
  notaConductor: {
    fontSize: 11,
    fontFamily: TIPOGRAFIA_ADMIN.regular,
    color: COLORES_ADMIN.textoSecundario,
    fontStyle: 'italic',
    textAlign: 'center',
  },
});
