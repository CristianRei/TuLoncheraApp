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

import { parsearPesos } from '@/core/dinero';
import type { Producto, Punto, TipoDescuento } from '@/core/tipos';
import { getDb } from '@/db/client';
import { crearDescuento } from '@/db/descuentos';
import { getDispositivoId } from '@/db/dispositivo';
import { listarProductos } from '@/db/productos';
import { listarPuntos } from '@/db/puntos';
import { CalendarioRango } from '@/ui/CalendarioRango';
import { ContenedorAncho } from '@/ui/ContenedorAncho';
import { Encabezado } from '@/ui/Encabezado';
import { COLORES_ADMIN, TIPOGRAFIA_ADMIN } from '@/ui/tema';
import { useRequiereSesion } from '@/ui/useRequiereSesion';

type PasoSelector = 'PRODUCTO' | 'PUNTO' | null;

function formatearFechaCorta(iso: string | null): string {
  if (!iso) return '';
  return new Date(`${iso}T00:00:00`).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' });
}

export default function NuevoDescuento() {
  const usuario = useRequiereSesion(['ADMIN']);
  const [productos, setProductos] = useState<Producto[]>([]);
  const [puntos, setPuntos] = useState<Punto[]>([]);
  const [producto, setProducto] = useState<Producto | null>(null);
  const [punto, setPunto] = useState<Punto | null>(null);
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
      const [listaProductos, listaPuntos] = await Promise.all([listarProductos(db), listarPuntos(db)]);
      setProductos(listaProductos);
      setPuntos(listaPuntos);
      setCargando(false);
    })();
  }, []);

  if (!usuario) return null;
  const usuarioActual = usuario;

  const valor = tipo === 'PORCENTAJE' ? parseInt(valorTexto, 10) || 0 : parsearPesos(valorTexto);
  const fechasValidas = !!desdeTexto && !!hastaTexto;
  const valorValido =
    valor > 0 && (tipo === 'MONTO_FIJO' || (valor <= 100 && Number.isInteger(valor)));
  const puedeGuardar = valorValido && fechasValidas && !guardando;

  async function confirmar() {
    if (!puedeGuardar || !desdeTexto || !hastaTexto) return;
    setGuardando(true);
    try {
      const db = await getDb();
      const dispositivoId = await getDispositivoId(db);
      await crearDescuento(
        db,
        {
          productoId: producto?.id ?? null,
          puntoId: punto?.id ?? null,
          tipo,
          valor,
          desde: new Date(`${desdeTexto}T00:00:00`).toISOString(),
          hasta: new Date(`${hastaTexto}T23:59:59`).toISOString(),
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
        rutaVolverTexto={selector ? 'Cancelar' : 'Descuentos'}
        onVolver={selector ? () => setSelector(null) : undefined}
        anchoMaximo={600}
      />

      {cargando ? (
        <View style={styles.centrado}>
          <ActivityIndicator size="large" color={COLORES_ADMIN.vino} />
        </View>
      ) : selector === 'PRODUCTO' ? (
        <ContenedorAncho anchoMaximo={600} llenarAlto>
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
      ) : selector === 'PUNTO' ? (
        <ContenedorAncho anchoMaximo={600} llenarAlto>
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
          <ContenedorAncho anchoMaximo={600}>
            <View style={styles.form}>
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
                <Pressable style={styles.selectorBoton} onPress={() => setCalendarioVisible(true)}>
                  <View style={styles.selectorBotonIconoTexto}>
                    <Ionicons name="calendar-outline" size={16} color={COLORES_ADMIN.dorado} />
                    <Text style={styles.selectorBotonTexto}>
                      {desdeTexto && hastaTexto
                        ? `${formatearFechaCorta(desdeTexto)} — ${formatearFechaCorta(hastaTexto)}`
                        : 'Elegir fechas'}
                    </Text>
                  </View>
                </Pressable>
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
    color: '#FFE9E2',
    fontSize: 14,
    fontFamily: TIPOGRAFIA_ADMIN.medio,
    textDecorationLine: 'underline',
  },
  volverAncho: {
    color: COLORES_ADMIN.vino,
    fontSize: 14,
    fontFamily: TIPOGRAFIA_ADMIN.medio,
    textDecorationLine: 'underline',
  },
  tituloAncho: {
    color: COLORES_ADMIN.vino,
    fontSize: 20,
    fontFamily: TIPOGRAFIA_ADMIN.negrita,
  },
  titulo: {
    color: '#FFFFFF',
    fontSize: 17,
    fontFamily: TIPOGRAFIA_ADMIN.semiNegrita,
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
    backgroundColor: COLORES_ADMIN.superficieMasBaja,
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 14,
    fontFamily: TIPOGRAFIA_ADMIN.regular,
    color: COLORES_ADMIN.texto,
    borderWidth: 1,
    borderColor: COLORES_ADMIN.bordeSuave,
  },
  lista: {
    padding: 20,
    gap: 8,
  },
  filaSelector: {
    backgroundColor: COLORES_ADMIN.superficieMasBaja,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORES_ADMIN.bordeSuave,
    padding: 14,
  },
  filaSelectorTexto: {
    fontSize: 14,
    fontFamily: TIPOGRAFIA_ADMIN.medio,
    color: COLORES_ADMIN.texto,
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
    fontSize: 12,
    fontFamily: TIPOGRAFIA_ADMIN.semiNegrita,
    color: COLORES_ADMIN.textoSecundario,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  selectorBoton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: COLORES_ADMIN.bordeSuave,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: COLORES_ADMIN.superficieMasBaja,
  },
  selectorBotonIconoTexto: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  selectorBotonTexto: {
    fontSize: 14,
    fontFamily: TIPOGRAFIA_ADMIN.semiNegrita,
    color: COLORES_ADMIN.texto,
  },
  quitar: {
    fontSize: 12,
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
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
  },
  tipoBotonActivo: {
    backgroundColor: COLORES_ADMIN.vino,
    borderColor: COLORES_ADMIN.vino,
  },
  tipoBotonTexto: {
    fontSize: 13,
    fontFamily: TIPOGRAFIA_ADMIN.medio,
    color: COLORES_ADMIN.textoSecundario,
  },
  tipoBotonTextoActivo: {
    color: '#FFF',
    fontFamily: TIPOGRAFIA_ADMIN.semiNegrita,
  },
  input: {
    borderWidth: 1,
    borderColor: COLORES_ADMIN.bordeSuave,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    fontFamily: TIPOGRAFIA_ADMIN.monoRegular,
    backgroundColor: COLORES_ADMIN.superficieMasBaja,
    color: COLORES_ADMIN.texto,
  },
  botonGuardar: {
    backgroundColor: COLORES_ADMIN.vino,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 8,
  },
  botonDeshabilitado: {
    opacity: 0.5,
  },
  botonGuardarTexto: {
    color: '#FFF',
    fontSize: 15,
    fontFamily: TIPOGRAFIA_ADMIN.semiNegrita,
  },
  fondoModal: {
    flex: 1,
    backgroundColor: 'rgba(41,23,15,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tarjetaModalCalendario: {
    backgroundColor: COLORES_ADMIN.background,
    borderRadius: 16,
    padding: 20,
    gap: 12,
  },
  modalCalendarioTitulo: {
    fontSize: 15,
    fontFamily: TIPOGRAFIA_ADMIN.semiNegrita,
    color: COLORES_ADMIN.vino,
    textAlign: 'center',
  },
  modalCalendarioConfirmar: {
    backgroundColor: COLORES_ADMIN.vino,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  modalCalendarioConfirmarTexto: {
    fontSize: 14,
    fontFamily: TIPOGRAFIA_ADMIN.semiNegrita,
    color: '#FFFFFF',
  },
  modalCerrar: {
    alignItems: 'center',
    paddingVertical: 12,
  },
  modalCerrarTexto: {
    fontSize: 14,
    fontFamily: TIPOGRAFIA_ADMIN.semiNegrita,
    color: COLORES_ADMIN.vino,
  },
});
