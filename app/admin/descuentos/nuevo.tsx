import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { fechaHoyBogota } from '@/core/analitica';
import { parsearPesos } from '@/core/dinero';
import { parsearHora } from '@/core/horas';
import type { Producto, Punto, TipoDescuento, UsuarioSesion } from '@/core/tipos';
import { getDb } from '@/db/client';
import { crearDescuento } from '@/db/descuentos';
import { getDispositivoId } from '@/db/dispositivo';
import { listarProductos } from '@/db/productos';
import { listarPuntos } from '@/db/puntos';
import { listarPromotores } from '@/db/usuarios';
import { CalendarioRango } from '@/ui/CalendarioRango';
import { ContenedorAncho } from '@/ui/ContenedorAncho';
import { Encabezado } from '@/ui/Encabezado';
import { ANCHO_ADMIN, COLORES_ADMIN, TIPOGRAFIA_ADMIN, RADII_ADMIN, TEXTO_ADMIN } from '@/ui/tema';
import { useRequiereSesion } from '@/ui/useRequiereSesion';

type PasoSelector = 'PRODUCTO' | 'PUNTO' | 'PROMOTOR' | null;

function formatearFechaCorta(iso: string | null): string {
  if (!iso) return '';
  return new Date(`${iso}T00:00:00`).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' });
}

function formatearFechaHora(iso: string): string {
  return new Date(iso).toLocaleString('es-CO', { day: '2-digit', month: 'short', hour: 'numeric', minute: '2-digit' });
}

/**
 * Instante (ISO) de una fecha + hora de Colombia (UTC-5 fijo, sin horario de
 * verano) — así "8:00" es 8 am en Bogotá sin importar la zona del computador.
 */
function instanteBogota(fecha: string, hora: string, segundos: string): string {
  return new Date(`${fecha}T${hora}:${segundos}-05:00`).toISOString();
}

export default function NuevoDescuento() {
  const usuario = useRequiereSesion(['ADMIN']);
  const [productos, setProductos] = useState<Producto[]>([]);
  const [puntos, setPuntos] = useState<Punto[]>([]);
  const [promotores, setPromotores] = useState<UsuarioSesion[]>([]);
  const [producto, setProducto] = useState<Producto | null>(null);
  const [punto, setPunto] = useState<Punto | null>(null);
  const [promotor, setPromotor] = useState<UsuarioSesion | null>(null);
  // Horario continuo: empieza el primer día a `horaDesde` y termina el último
  // día a `horaHasta` (decisión del negocio). "Todo el día" = 00:00 a 23:59.
  const [conHorario, setConHorario] = useState(false);
  const [horaDesdeTexto, setHoraDesdeTexto] = useState('08:00');
  const [horaHastaTexto, setHoraHastaTexto] = useState('16:00');
  const [selector, setSelector] = useState<PasoSelector>(null);
  const [busqueda, setBusqueda] = useState('');
  const [tipo, setTipo] = useState<TipoDescuento>('PORCENTAJE');
  const [valorTexto, setValorTexto] = useState('');
  const [desdeTexto, setDesdeTexto] = useState<string | null>(null);
  const [hastaTexto, setHastaTexto] = useState<string | null>(null);
  const [calendarioVisible, setCalendarioVisible] = useState(false);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    (async () => {
      const db = await getDb();
      const [listaProductos, listaPuntos, listaPromotores] = await Promise.all([
        listarProductos(db),
        listarPuntos(db),
        listarPromotores(db),
      ]);
      setProductos(listaProductos);
      setPuntos(listaPuntos);
      setPromotores(listaPromotores);
      setCargando(false);
    })();
  }, []);

  if (!usuario) return null;
  const usuarioActual = usuario;

  const valor = tipo === 'PORCENTAJE' ? parseInt(valorTexto, 10) || 0 : parsearPesos(valorTexto);
  const horaDesde = conHorario ? parsearHora(horaDesdeTexto) : '00:00';
  const horaHasta = conHorario ? parsearHora(horaHastaTexto) : '23:59';
  const desdeIso = desdeTexto && horaDesde ? instanteBogota(desdeTexto, horaDesde, '00') : null;
  const hastaIso = hastaTexto && horaHasta ? instanteBogota(hastaTexto, horaHasta, conHorario ? '00' : '59') : null;
  const errorHorario =
    conHorario && (!horaDesde || !horaHasta)
      ? 'Escribe las horas como 8:00 o 16:30.'
      : desdeIso && hastaIso && desdeIso >= hastaIso
        ? 'La hora de fin debe ser después de la de inicio.'
        : null;
  const fechasValidas = !!desdeIso && !!hastaIso && !errorHorario;
  const valorValido =
    valor > 0 && (tipo === 'MONTO_FIJO' || (valor <= 100 && Number.isInteger(valor)));
  const puedeGuardar = valorValido && fechasValidas && !guardando;

  async function confirmar() {
    if (!puedeGuardar || !desdeIso || !hastaIso) return;
    setGuardando(true);
    try {
      const db = await getDb();
      const dispositivoId = await getDispositivoId(db);
      await crearDescuento(
        db,
        {
          productoId: producto?.id ?? null,
          puntoId: punto?.id ?? null,
          promotorId: promotor?.id ?? null,
          tipo,
          valor,
          desde: desdeIso,
          hasta: hastaIso,
          creadoPor: usuarioActual.id,
        },
        dispositivoId
      );
      Alert.alert('Descuento creado', 'El descuento quedó activo.', [
        { text: 'OK', onPress: () => router.back() },
      ]);
    } finally {
      setGuardando(false);
    }
  }

  const productosFiltrados = productos.filter((p) =>
    p.nombre.toLowerCase().includes(busqueda.trim().toLowerCase())
  );

  return (
    <View style={styles.contenedor}>
      <Encabezado
        titulo="Nuevo descuento"
        anchoMaximo={ANCHO_ADMIN.formulario}
        rutaVolverTexto={selector ? 'Cancelar' : 'Descuentos'}
        onVolver={selector ? () => setSelector(null) : undefined}
      />

      {cargando ? (
        <View style={styles.centrado}>
          <ActivityIndicator size="large" color={COLORES_ADMIN.vino} />
        </View>
      ) : selector === 'PRODUCTO' ? (
        <ContenedorAncho anchoMaximo={ANCHO_ADMIN.formulario} llenarAlto>
          <View style={styles.buscadorContenedor}>
            <TextInput
              style={styles.buscador}
              placeholder="Buscar producto..."
              placeholderTextColor={COLORES_ADMIN.textoSecundario}
              value={busqueda}
              onChangeText={setBusqueda}
            />
          </View>
          <FlatList
            data={productosFiltrados}
            keyExtractor={(p) => p.id}
            contentContainerStyle={styles.lista}
            renderItem={({ item }) => (
              <Pressable
                style={styles.filaSelector}
                onPress={() => {
                  setProducto(item);
                  setSelector(null);
                  setBusqueda('');
                }}
              >
                <Text style={styles.filaSelectorTexto}>{item.nombre}</Text>
              </Pressable>
            )}
          />
        </ContenedorAncho>
      ) : selector === 'PROMOTOR' ? (
        <ContenedorAncho anchoMaximo={ANCHO_ADMIN.formulario} llenarAlto>
          <FlatList
            data={promotores}
            keyExtractor={(p) => p.id}
            contentContainerStyle={styles.lista}
            renderItem={({ item }) => (
              <Pressable
                style={styles.filaSelector}
                onPress={() => {
                  setPromotor(item);
                  setSelector(null);
                }}
              >
                <Text style={styles.filaSelectorTexto}>{item.nombre}</Text>
              </Pressable>
            )}
          />
        </ContenedorAncho>
      ) : selector === 'PUNTO' ? (
        <ContenedorAncho anchoMaximo={ANCHO_ADMIN.formulario} llenarAlto>
          <FlatList
            data={puntos}
            keyExtractor={(p) => p.id}
            contentContainerStyle={styles.lista}
            renderItem={({ item }) => (
              <Pressable
                style={styles.filaSelector}
                onPress={() => {
                  setPunto(item);
                  setSelector(null);
                }}
              >
                <Text style={styles.filaSelectorTexto}>
                  {item.empresaNombre} · {item.nombre}
                </Text>
              </Pressable>
            )}
          />
        </ContenedorAncho>
      ) : (
        <ScrollView contentContainerStyle={{ flexGrow: 1 }}>
          <ContenedorAncho anchoMaximo={ANCHO_ADMIN.formulario}>
            <View style={styles.form}>
              <View style={styles.campo}>
                <Text style={styles.etiqueta}>Promotor (vacío = todos)</Text>
                <Pressable style={styles.selectorBoton} onPress={() => setSelector('PROMOTOR')}>
                  <Text style={styles.selectorBotonTexto}>{promotor?.nombre ?? 'Todos los promotores'}</Text>
                  {promotor && (
                    <Pressable onPress={() => setPromotor(null)}>
                      <Text style={styles.quitar}>Quitar</Text>
                    </Pressable>
                  )}
                </Pressable>
              </View>

              <View style={styles.campo}>
                <Text style={styles.etiqueta}>Producto (vacío = todos)</Text>
                <Pressable style={styles.selectorBoton} onPress={() => setSelector('PRODUCTO')}>
                  <Text style={styles.selectorBotonTexto}>
                    {producto?.nombre ?? 'Todos los productos'}
                  </Text>
                  {producto && (
                    <Pressable onPress={() => setProducto(null)}>
                      <Text style={styles.quitar}>Quitar</Text>
                    </Pressable>
                  )}
                </Pressable>
              </View>

              <View style={styles.campo}>
                <Text style={styles.etiqueta}>Punto (vacío = todos)</Text>
                <Pressable style={styles.selectorBoton} onPress={() => setSelector('PUNTO')}>
                  <Text style={styles.selectorBotonTexto}>
                    {punto ? `${punto.empresaNombre} · ${punto.nombre}` : 'Todos los puntos'}
                  </Text>
                  {punto && (
                    <Pressable onPress={() => setPunto(null)}>
                      <Text style={styles.quitar}>Quitar</Text>
                    </Pressable>
                  )}
                </Pressable>
              </View>

              <View style={styles.campo}>
                <Text style={styles.etiqueta}>Tipo de descuento</Text>
                <View style={styles.tipoFila}>
                  <Pressable
                    style={[styles.tipoBoton, tipo === 'PORCENTAJE' && styles.tipoBotonActivo]}
                    onPress={() => {
                      setTipo('PORCENTAJE');
                      setValorTexto('');
                    }}
                  >
                    <Text
                      style={[
                        styles.tipoBotonTexto,
                        tipo === 'PORCENTAJE' && styles.tipoBotonTextoActivo,
                      ]}
                    >
                      Porcentaje
                    </Text>
                  </Pressable>
                  <Pressable
                    style={[styles.tipoBoton, tipo === 'MONTO_FIJO' && styles.tipoBotonActivo]}
                    onPress={() => {
                      setTipo('MONTO_FIJO');
                      setValorTexto('');
                    }}
                  >
                    <Text
                      style={[
                        styles.tipoBotonTexto,
                        tipo === 'MONTO_FIJO' && styles.tipoBotonTextoActivo,
                      ]}
                    >
                      Monto fijo
                    </Text>
                  </Pressable>
                </View>
              </View>

              <View style={styles.campo}>
                <Text style={styles.etiqueta}>
                  {tipo === 'PORCENTAJE' ? 'Porcentaje (1-100)' : 'Monto a descontar'}
                </Text>
                <TextInput
                  style={styles.input}
                  placeholder={tipo === 'PORCENTAJE' ? '0' : '$ 0'}
                  placeholderTextColor={COLORES_ADMIN.textoSecundario}
                  value={valorTexto}
                  onChangeText={(texto) =>
                    setValorTexto(tipo === 'PORCENTAJE' ? texto.replace(/\D/g, '').slice(0, 3) : texto)
                  }
                  keyboardType="number-pad"
                />
              </View>

              <View style={styles.campo}>
                <Text style={styles.etiqueta}>Vigencia</Text>
                <View style={styles.filaVigencia}>
                  <Pressable style={[styles.selectorBoton, styles.selectorFechas]} onPress={() => setCalendarioVisible(true)}>
                    <View style={styles.selectorBotonIconoTexto}>
                      <Ionicons name="calendar-outline" size={16} color={COLORES_ADMIN.dorado} />
                      <Text style={styles.selectorBotonTexto}>
                        {desdeTexto && hastaTexto
                          ? desdeTexto === hastaTexto
                            ? formatearFechaCorta(desdeTexto)
                            : `${formatearFechaCorta(desdeTexto)} — ${formatearFechaCorta(hastaTexto)}`
                          : 'Elegir fechas'}
                      </Text>
                    </View>
                  </Pressable>
                  <Pressable
                    style={styles.botonHoy}
                    onPress={() => {
                      const hoy = fechaHoyBogota();
                      setDesdeTexto(hoy);
                      setHastaTexto(hoy);
                    }}
                  >
                    <Text style={styles.botonHoyTexto}>Solo hoy</Text>
                  </Pressable>
                </View>
              </View>

              <View style={styles.campo}>
                <Text style={styles.etiqueta}>Horario</Text>
                <View style={styles.tipoFila}>
                  <Pressable
                    style={[styles.tipoBoton, !conHorario && styles.tipoBotonActivo]}
                    onPress={() => setConHorario(false)}
                  >
                    <Text style={[styles.tipoBotonTexto, !conHorario && styles.tipoBotonTextoActivo]}>Todo el día</Text>
                  </Pressable>
                  <Pressable
                    style={[styles.tipoBoton, conHorario && styles.tipoBotonActivo]}
                    onPress={() => setConHorario(true)}
                  >
                    <Text style={[styles.tipoBotonTexto, conHorario && styles.tipoBotonTextoActivo]}>
                      Horario específico
                    </Text>
                  </Pressable>
                </View>
                {conHorario && (
                  <View style={styles.filaHoras}>
                    <View style={styles.campoHora}>
                      <Text style={styles.etiquetaHora}>Desde las</Text>
                      <TextInput
                        style={styles.input}
                        value={horaDesdeTexto}
                        onChangeText={(t) => setHoraDesdeTexto(t.replace(/[^\d:]/g, '').slice(0, 5))}
                        placeholder="08:00"
                        placeholderTextColor={COLORES_ADMIN.textoSecundario}
                        keyboardType="numbers-and-punctuation"
                      />
                    </View>
                    <View style={styles.campoHora}>
                      <Text style={styles.etiquetaHora}>Hasta las</Text>
                      <TextInput
                        style={styles.input}
                        value={horaHastaTexto}
                        onChangeText={(t) => setHoraHastaTexto(t.replace(/[^\d:]/g, '').slice(0, 5))}
                        placeholder="16:00"
                        placeholderTextColor={COLORES_ADMIN.textoSecundario}
                        keyboardType="numbers-and-punctuation"
                      />
                    </View>
                  </View>
                )}
                {errorHorario ? (
                  <Text style={styles.errorTexto}>{errorHorario}</Text>
                ) : desdeIso && hastaIso ? (
                  <Text style={styles.resumenVigencia}>
                    Aplica desde el {formatearFechaHora(desdeIso)} hasta el {formatearFechaHora(hastaIso)}
                    {conHorario && desdeTexto !== hastaTexto ? ', sin interrupción' : ''}
                  </Text>
                ) : null}
              </View>

              <Pressable
                style={[styles.botonGuardar, !puedeGuardar && styles.botonDeshabilitado]}
                disabled={!puedeGuardar}
                onPress={confirmar}
              >
                {guardando ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.botonGuardarTexto}>Crear descuento</Text>
                )}
              </Pressable>
            </View>
          </ContenedorAncho>
        </ScrollView>
      )}

      <Modal visible={calendarioVisible} animationType="fade" transparent>
        <View style={styles.fondoModal}>
          <View style={styles.tarjetaModalCalendario}>
            <Text style={styles.modalCalendarioTitulo}>Elige la vigencia del descuento</Text>
            <CalendarioRango
              desde={desdeTexto}
              hasta={hastaTexto}
              onCambiar={(desde, hasta) => {
                setDesdeTexto(desde);
                setHastaTexto(hasta);
              }}
            />
            <Pressable
              style={[styles.modalCalendarioConfirmar, (!desdeTexto || !hastaTexto) && styles.botonDeshabilitado]}
              disabled={!desdeTexto || !hastaTexto}
              onPress={() => setCalendarioVisible(false)}
            >
              <Text style={styles.modalCalendarioConfirmarTexto}>Aplicar vigencia</Text>
            </Pressable>
            <Pressable style={styles.modalCerrar} onPress={() => setCalendarioVisible(false)}>
              <Text style={styles.modalCerrarTexto}>Cerrar</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
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
  encabezadoContenido: {
    gap: 4,
  },
  volver: {
    ...TEXTO_ADMIN.cuerpo,
    color: COLORES_ADMIN.superficie,
    fontFamily: TIPOGRAFIA_ADMIN.medio,
    textDecorationLine: 'underline',
  },
  volverAncho: {
    ...TEXTO_ADMIN.cuerpo,
    color: COLORES_ADMIN.vino,
    fontFamily: TIPOGRAFIA_ADMIN.medio,
    textDecorationLine: 'underline',
  },
  tituloAncho: {
    ...TEXTO_ADMIN.tituloPantalla,
    color: COLORES_ADMIN.vino,
  },
  titulo: {
    ...TEXTO_ADMIN.tituloSeccion,
    color: COLORES_ADMIN.textoInverso,
  },
  centrado: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buscadorContenedor: {
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  buscador: {
    ...TEXTO_ADMIN.cuerpo,
    backgroundColor: COLORES_ADMIN.superficieMasBaja,
    borderRadius: RADII_ADMIN.sm,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: COLORES_ADMIN.bordeSuave,
  },
  lista: {
    padding: 20,
    gap: 8,
  },
  filaSelector: {
    backgroundColor: COLORES_ADMIN.superficieMasBaja,
    borderRadius: RADII_ADMIN.sm,
    borderWidth: 1,
    borderColor: COLORES_ADMIN.bordeSuave,
    padding: 14,
  },
  filaSelectorTexto: {
    ...TEXTO_ADMIN.cuerpo,
    fontFamily: TIPOGRAFIA_ADMIN.medio,
  },
  form: {
    padding: 20,
    gap: 18,
    paddingBottom: 48,
  },
  campo: {
    gap: 6,
  },
  etiqueta: {
    ...TEXTO_ADMIN.nota,
    fontFamily: TIPOGRAFIA_ADMIN.semiNegrita,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  selectorBoton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: COLORES_ADMIN.bordeSuave,
    borderRadius: RADII_ADMIN.sm,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: COLORES_ADMIN.superficieMasBaja,
  },
  filaVigencia: {
    flexDirection: 'row',
    gap: 8,
  },
  selectorFechas: {
    flex: 1,
  },
  botonHoy: {
    borderWidth: 1,
    borderColor: COLORES_ADMIN.vino,
    borderRadius: RADII_ADMIN.sm,
    paddingHorizontal: 14,
    justifyContent: 'center',
    backgroundColor: COLORES_ADMIN.superficieMasBaja,
  },
  botonHoyTexto: {
    ...TEXTO_ADMIN.boton,
    color: COLORES_ADMIN.vino,
  },
  filaHoras: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
  },
  campoHora: {
    flex: 1,
    gap: 4,
  },
  etiquetaHora: {
    ...TEXTO_ADMIN.nota,
    fontFamily: TIPOGRAFIA_ADMIN.medio,
  },
  errorTexto: {
    ...TEXTO_ADMIN.nota,
    fontFamily: TIPOGRAFIA_ADMIN.semiNegrita,
    color: COLORES_ADMIN.error,
  },
  resumenVigencia: {
    ...TEXTO_ADMIN.nota,
    fontFamily: TIPOGRAFIA_ADMIN.medio,
  },
  selectorBotonIconoTexto: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  selectorBotonTexto: {
    ...TEXTO_ADMIN.cuerpo,
    fontFamily: TIPOGRAFIA_ADMIN.semiNegrita,
  },
  quitar: {
    ...TEXTO_ADMIN.nota,
    fontFamily: TIPOGRAFIA_ADMIN.semiNegrita,
    color: COLORES_ADMIN.error,
  },
  tipoFila: {
    flexDirection: 'row',
    gap: 10,
  },
  tipoBoton: {
    flex: 1,
    borderWidth: 1.5,
    borderColor: COLORES_ADMIN.bordeSuave,
    borderRadius: RADII_ADMIN.sm,
    paddingVertical: 10,
    alignItems: 'center',
  },
  tipoBotonActivo: {
    backgroundColor: COLORES_ADMIN.vino,
    borderColor: COLORES_ADMIN.vino,
  },
  tipoBotonTexto: {
    ...TEXTO_ADMIN.cuerpoSecundario,
    fontFamily: TIPOGRAFIA_ADMIN.medio,
  },
  tipoBotonTextoActivo: {
    color: COLORES_ADMIN.textoInverso,
    fontFamily: TIPOGRAFIA_ADMIN.semiNegrita,
  },
  input: {
    borderWidth: 1,
    borderColor: COLORES_ADMIN.bordeSuave,
    borderRadius: RADII_ADMIN.sm,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    fontFamily: TIPOGRAFIA_ADMIN.monoRegular,
    backgroundColor: COLORES_ADMIN.superficieMasBaja,
    color: COLORES_ADMIN.texto,
  },
  botonGuardar: {
    backgroundColor: COLORES_ADMIN.vino,
    borderRadius: RADII_ADMIN.md,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 8,
  },
  botonDeshabilitado: {
    opacity: 0.5,
  },
  botonGuardarTexto: {
    ...TEXTO_ADMIN.tituloTarjeta,
    color: COLORES_ADMIN.textoInverso,
  },
  fondoModal: {
    flex: 1,
    backgroundColor: 'rgba(41,23,15,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tarjetaModalCalendario: {
    backgroundColor: COLORES_ADMIN.background,
    borderRadius: RADII_ADMIN.lg,
    padding: 20,
    gap: 12,
  },
  modalCalendarioTitulo: {
    ...TEXTO_ADMIN.tituloTarjeta,
    color: COLORES_ADMIN.vino,
    textAlign: 'center',
  },
  modalCalendarioConfirmar: {
    backgroundColor: COLORES_ADMIN.vino,
    borderRadius: RADII_ADMIN.sm,
    paddingVertical: 12,
    alignItems: 'center',
  },
  modalCalendarioConfirmarTexto: {
    ...TEXTO_ADMIN.cuerpo,
    fontFamily: TIPOGRAFIA_ADMIN.semiNegrita,
    color: COLORES_ADMIN.textoInverso,
  },
  modalCerrar: {
    alignItems: 'center',
    paddingVertical: 12,
  },
  modalCerrarTexto: {
    ...TEXTO_ADMIN.cuerpo,
    fontFamily: TIPOGRAFIA_ADMIN.semiNegrita,
    color: COLORES_ADMIN.vino,
  },
});
