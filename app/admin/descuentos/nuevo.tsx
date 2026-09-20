import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { parsearPesos } from '@/core/dinero';
import type { Producto, Punto, TipoDescuento } from '@/core/tipos';
import { getDb } from '@/db/client';
import { crearDescuento } from '@/db/descuentos';
import { getDispositivoId } from '@/db/dispositivo';
import { listarProductos } from '@/db/productos';
import { listarPuntos } from '@/db/puntos';
import { COLORES } from '@/ui/colores';
import { ContenedorAncho } from '@/ui/ContenedorAncho';
import { useRequiereSesion } from '@/ui/useRequiereSesion';

const PATRON_FECHA = /^\d{4}-\d{2}-\d{2}$/;

/** "20260315" tecleado en number-pad → "2026-03-15", insertando guiones. */
function formatearEntradaFecha(texto: string): string {
  const digitos = texto.replace(/\D/g, '').slice(0, 8);
  const partes = [digitos.slice(0, 4), digitos.slice(4, 6), digitos.slice(6, 8)].filter(Boolean);
  return partes.join('-');
}

type PasoSelector = 'PRODUCTO' | 'PUNTO' | null;

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
  const [desdeTexto, setDesdeTexto] = useState('');
  const [hastaTexto, setHastaTexto] = useState('');
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const insets = useSafeAreaInsets();

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
  const fechasValidas =
    PATRON_FECHA.test(desdeTexto) && PATRON_FECHA.test(hastaTexto) && desdeTexto <= hastaTexto;
  const valorValido =
    valor > 0 && (tipo === 'MONTO_FIJO' || (valor <= 100 && Number.isInteger(valor)));
  const puedeGuardar = valorValido && fechasValidas && !guardando;

  async function confirmar() {
    if (!puedeGuardar) return;
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
      <View style={[styles.encabezado, { paddingTop: insets.top + 20 }]}>
        <ContenedorAncho anchoMaximo={600} style={styles.encabezadoContenido}>
          <Pressable onPress={() => (selector ? setSelector(null) : router.back())}>
            <Text style={styles.volver}>‹ {selector ? 'Cancelar' : 'Descuentos'}</Text>
          </Pressable>
          <Text style={styles.titulo}>Nuevo descuento</Text>
        </ContenedorAncho>
      </View>

      {cargando ? (
        <View style={styles.centrado}>
          <ActivityIndicator size="large" color={COLORES.oscuro} />
        </View>
      ) : selector === 'PRODUCTO' ? (
        <ContenedorAncho anchoMaximo={600} llenarAlto>
          <View style={styles.buscadorContenedor}>
            <TextInput
              style={styles.buscador}
              placeholder="Buscar producto..."
              placeholderTextColor="#999"
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
                  placeholderTextColor="#999"
                  value={valorTexto}
                  onChangeText={(texto) =>
                    setValorTexto(tipo === 'PORCENTAJE' ? texto.replace(/\D/g, '').slice(0, 3) : texto)
                  }
                  keyboardType="number-pad"
                />
              </View>

              <View style={styles.campo}>
                <Text style={styles.etiqueta}>Desde</Text>
                <TextInput
                  style={styles.input}
                  placeholder="AAAA-MM-DD"
                  placeholderTextColor="#999"
                  value={desdeTexto}
                  onChangeText={(texto) => setDesdeTexto(formatearEntradaFecha(texto))}
                  keyboardType="number-pad"
                  maxLength={10}
                />
              </View>

              <View style={styles.campo}>
                <Text style={styles.etiqueta}>Hasta</Text>
                <TextInput
                  style={styles.input}
                  placeholder="AAAA-MM-DD"
                  placeholderTextColor="#999"
                  value={hastaTexto}
                  onChangeText={(texto) => setHastaTexto(formatearEntradaFecha(texto))}
                  keyboardType="number-pad"
                  maxLength={10}
                />
                {desdeTexto.length === 10 && hastaTexto.length === 10 && desdeTexto > hastaTexto && (
                  <Text style={styles.error}>
                    La fecha &quot;hasta&quot; debe ser igual o posterior a &quot;desde&quot;.
                  </Text>
                )}
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
    </View>
  );
}

const styles = StyleSheet.create({
  contenedor: {
    flex: 1,
    backgroundColor: '#FBEDED',
  },
  encabezado: {
    backgroundColor: COLORES.oscuro,
    paddingHorizontal: 20,
    paddingBottom: 16,
  },
  encabezadoContenido: {
    gap: 4,
  },
  volver: {
    color: '#FFFFFF',
    fontSize: 14,
    textDecorationLine: 'underline',
  },
  titulo: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '700',
  },
  centrado: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  buscadorContenedor: {
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  buscador: {
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 14,
    borderWidth: 1,
    borderColor: '#EBD3D3',
  },
  lista: {
    padding: 20,
    gap: 8,
  },
  filaSelector: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 14,
  },
  filaSelectorTexto: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
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
    fontSize: 13,
    fontWeight: '600',
    color: '#555',
  },
  selectorBoton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: '#DDD',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: '#FFF',
  },
  selectorBotonTexto: {
    fontSize: 15,
    color: '#333',
    fontWeight: '600',
  },
  quitar: {
    fontSize: 12,
    color: '#B00020',
    fontWeight: '700',
  },
  tipoFila: {
    flexDirection: 'row',
    gap: 10,
  },
  tipoBoton: {
    flex: 1,
    borderWidth: 1.5,
    borderColor: '#DDD',
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
  },
  tipoBotonActivo: {
    backgroundColor: COLORES.oscuro,
    borderColor: COLORES.oscuro,
  },
  tipoBotonTexto: {
    fontSize: 13,
    fontWeight: '600',
    color: '#555',
  },
  tipoBotonTextoActivo: {
    color: '#FFF',
  },
  input: {
    borderWidth: 1,
    borderColor: '#DDD',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    backgroundColor: '#FFF',
  },
  error: {
    fontSize: 12,
    color: '#B00020',
  },
  botonGuardar: {
    backgroundColor: COLORES.oscuro,
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
    fontSize: 16,
    fontWeight: '700',
  },
});
