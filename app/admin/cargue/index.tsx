import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import type { Cargue, Producto, Traslado, UsuarioSesion } from '@/core/tipos';
import { crearCargue, listarCargues, StockInsuficienteError } from '@/db/cargues';
import { getDb } from '@/db/client';
import { getDispositivoId } from '@/db/dispositivo';
import { listarInventarioPromotor, obtenerSaldosBodega } from '@/db/inventario';
import { listarProductos } from '@/db/productos';
import {
  crearTraslado,
  listarTraslados,
  StockInsuficienteError as StockInsuficienteTrasladoError,
} from '@/db/traslados';
import { listarPromotores } from '@/db/usuarios';
import { ContenedorAncho } from '@/ui/ContenedorAncho';
import { Encabezado } from '@/ui/Encabezado';
import { EmptyState } from '@/ui/EmptyState';
import { FilterTabs } from '@/ui/FilterTabs';
import { ListRow } from '@/ui/ListRow';
import { SelectorProductosConCantidad } from '@/ui/SelectorProductosConCantidad';
import { ANCHO_ADMIN, COLORES_ADMIN, ESPACIADO_ADMIN, TIPOGRAFIA_ADMIN, RADII_ADMIN, TEXTO_ADMIN } from '@/ui/tema';
import { useRequiereSesion } from '@/ui/useRequiereSesion';
import { useRecargarConDatosNuevos } from '@/ui/useVersionDatos';

type Pestana = 'NUEVO' | 'PLANEADOS' | 'TRASLADO';

const OPCIONES_PESTANA: { valor: Pestana; etiqueta: string }[] = [
  { valor: 'NUEVO', etiqueta: 'Nuevo cargue' },
  { valor: 'PLANEADOS', etiqueta: 'Cargues planeados' },
  { valor: 'TRASLADO', etiqueta: 'Traslado entre promotores' },
];

const ETIQUETAS_ESTADO: Record<Cargue['estado'], string> = {
  PLANEADO: 'Planeado',
  ENTREGADO: 'Entregado',
  CANCELADO: 'Cancelado',
};

function formatearFecha(ts: string): string {
  return new Date(ts).toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' });
}

export default function PantallaCargue() {
  const usuario = useRequiereSesion(['ADMIN']);
  const [pestana, setPestana] = useState<Pestana>('NUEVO');
  const [promotores, setPromotores] = useState<UsuarioSesion[]>([]);
  const [promotor, setPromotor] = useState<UsuarioSesion | null>(null);
  const [productos, setProductos] = useState<Producto[]>([]);
  const [disponibles, setDisponibles] = useState<Record<string, number>>({});
  const [cantidades, setCantidades] = useState<Record<string, number>>({});
  const [busqueda, setBusqueda] = useState('');
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [cargues, setCargues] = useState<Cargue[]>([]);

  // Traslado entre promotores: primero se elige origen, luego destino, y
  // recién ahí aparece el selector de productos — SOLO los que el origen
  // tiene en su inventario (saldo > 0), topados a ese saldo, nunca al de
  // bodega. Mismo flujo de "elegir promotor" del cargue normal, con un paso
  // extra.
  const [promotorOrigen, setPromotorOrigen] = useState<UsuarioSesion | null>(null);
  const [promotorDestino, setPromotorDestino] = useState<UsuarioSesion | null>(null);
  const [productosOrigen, setProductosOrigen] = useState<Producto[]>([]);
  const [disponiblesOrigen, setDisponiblesOrigen] = useState<Record<string, number>>({});
  const [cantidadesTraslado, setCantidadesTraslado] = useState<Record<string, number>>({});
  const [busquedaTraslado, setBusquedaTraslado] = useState('');
  const [guardandoTraslado, setGuardandoTraslado] = useState(false);
  const [traslados, setTraslados] = useState<Traslado[]>([]);

  const cargarBase = useCallback(async () => {
    const db = await getDb();
    const [listaPromotores, listaProductos, saldosBodega, listaCargues, listaTraslados] = await Promise.all([
      listarPromotores(db),
      listarProductos(db),
      obtenerSaldosBodega(db),
      listarCargues(db),
      listarTraslados(db),
    ]);
    setPromotores(listaPromotores);
    setProductos(listaProductos);
    setDisponibles(Object.fromEntries(saldosBodega));
    setCargues(listaCargues);
    setTraslados(listaTraslados);
    setCargando(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      cargarBase();
    }, [cargarBase])
  );
  useRecargarConDatosNuevos(cargarBase);

  if (!usuario) return null;
  const usuarioActual = usuario;

  function cambiarCantidad(productoId: string, delta: number) {
    setCantidades((actual) => {
      const disponible = disponibles[productoId] ?? 0;
      const nueva = Math.min(disponible, Math.max(0, (actual[productoId] ?? 0) + delta));
      return { ...actual, [productoId]: nueva };
    });
  }

  const totalUnidades = Object.values(cantidades).reduce((suma, c) => suma + c, 0);

  async function confirmar() {
    if (!promotor || totalUnidades === 0) return;
    setGuardando(true);
    try {
      const db = await getDb();
      const dispositivoId = await getDispositivoId(db);
      const items = Object.entries(cantidades)
        .filter(([, cantidad]) => cantidad > 0)
        .map(([productoId, cantidad]) => ({ productoId, cantidad }));

      await crearCargue(
        db,
        {
          promotorId: promotor.id,
          promotorNombre: promotor.nombre,
          items,
          creadoPor: usuarioActual.id,
        },
        dispositivoId
      );

      Alert.alert('Cargue planeado', `Bodega ya puede entregarle el cargue a ${promotor.nombre}.`);
      setCantidades({});
      setPromotor(null);
      await cargarBase();
    } catch (error) {
      if (error instanceof StockInsuficienteError) {
        Alert.alert('Stock insuficiente', error.message);
      } else {
        throw error;
      }
    } finally {
      setGuardando(false);
    }
  }

  async function elegirPromotorOrigen(elegido: UsuarioSesion) {
    // El inventario se carga ANTES de mostrar el siguiente paso, para no
    // mostrar por un instante "no tiene productos" mientras llega.
    const db = await getDb();
    const inventario = await listarInventarioPromotor(db, elegido.id);
    setProductosOrigen(inventario.map((i) => i.producto));
    setDisponiblesOrigen(Object.fromEntries(inventario.map((i) => [i.producto.id, i.saldo])));
    setPromotorOrigen(elegido);
  }

  function cerrarTraslado() {
    setPromotorOrigen(null);
    setPromotorDestino(null);
    setProductosOrigen([]);
    setDisponiblesOrigen({});
    setCantidadesTraslado({});
    setBusquedaTraslado('');
  }

  function cambiarCantidadTraslado(productoId: string, delta: number) {
    setCantidadesTraslado((actual) => {
      const disponible = disponiblesOrigen[productoId] ?? 0;
      const nueva = Math.min(disponible, Math.max(0, (actual[productoId] ?? 0) + delta));
      return { ...actual, [productoId]: nueva };
    });
  }

  const totalUnidadesTraslado = Object.values(cantidadesTraslado).reduce((suma, c) => suma + c, 0);
  const unidadesOrigen = Object.values(disponiblesOrigen).reduce((suma, c) => suma + c, 0);
  const todoMarcado =
    productosOrigen.length > 0 && productosOrigen.every((p) => cantidadesTraslado[p.id] === disponiblesOrigen[p.id]);

  // "Trasladar todo": marca el inventario COMPLETO del origen (cada producto
  // con todo su saldo) — el traslado igual se confirma con "Planear
  // traslado". Si ya estaba todo marcado, lo desmarca.
  function alternarTrasladarTodo() {
    setCantidadesTraslado(todoMarcado ? {} : { ...disponiblesOrigen });
  }

  async function confirmarTraslado() {
    if (!promotorOrigen || !promotorDestino || totalUnidadesTraslado === 0) return;
    setGuardandoTraslado(true);
    try {
      const db = await getDb();
      const dispositivoId = await getDispositivoId(db);
      const items = Object.entries(cantidadesTraslado)
        .filter(([, cantidad]) => cantidad > 0)
        .map(([productoId, cantidad]) => ({ productoId, cantidad }));

      await crearTraslado(
        db,
        {
          promotorOrigenId: promotorOrigen.id,
          promotorOrigenNombre: promotorOrigen.nombre,
          promotorDestinoId: promotorDestino.id,
          promotorDestinoNombre: promotorDestino.nombre,
          items,
          creadoPor: usuarioActual.id,
        },
        dispositivoId
      );

      Alert.alert(
        'Traslado planeado',
        `Bodega ya puede confirmar el traslado de ${promotorOrigen.nombre} a ${promotorDestino.nombre}.`
      );
      cerrarTraslado();
      await cargarBase();
    } catch (error) {
      if (error instanceof StockInsuficienteTrasladoError) {
        Alert.alert('Stock insuficiente', error.message);
      } else {
        throw error;
      }
    } finally {
      setGuardandoTraslado(false);
    }
  }

  const titulo = promotor
    ? `Cargue para ${promotor.nombre}`
    : promotorOrigen && promotorDestino
      ? `Traslado de ${promotorOrigen.nombre} a ${promotorDestino.nombre}`
      : promotorOrigen
        ? `Traslado desde ${promotorOrigen.nombre}`
        : 'Cargue a promotor';

  const textoVolver = promotor
    ? 'Elegir otro promotor'
    : promotorDestino
      ? 'Elegir otro destino'
      : promotorOrigen
        ? 'Elegir otro origen'
        : 'Admin';

  function volver() {
    if (promotor) setPromotor(null);
    else if (promotorDestino) setPromotorDestino(null);
    else if (promotorOrigen) cerrarTraslado();
    else router.back();
  }

  return (
    <View style={styles.contenedor}>
      <Encabezado titulo={titulo} rutaVolverTexto={textoVolver} onVolver={volver} />

      {!promotor && !promotorOrigen && (
        <ContenedorAncho anchoMaximo={ANCHO_ADMIN.lista}>
          <View style={styles.pestanas}>
            <FilterTabs opciones={OPCIONES_PESTANA} valorActivo={pestana} onCambiar={setPestana} />
          </View>
        </ContenedorAncho>
      )}

      {cargando ? (
        <View style={styles.centrado}>
          <ActivityIndicator size="large" color={COLORES_ADMIN.vino} />
        </View>
      ) : promotor ? (
        <ContenedorAncho anchoMaximo={ANCHO_ADMIN.lista} llenarAlto>
          <SelectorProductosConCantidad
            productos={productos}
            cantidades={cantidades}
            disponibles={disponibles}
            onCambiarCantidad={cambiarCantidad}
            busqueda={busqueda}
            onCambiarBusqueda={setBusqueda}
            colorAcento={COLORES_ADMIN.vino}
          />

          <View style={styles.pie}>
            <Pressable
              style={[
                styles.botonConfirmar,
                (totalUnidades === 0 || guardando) && styles.botonDeshabilitado,
              ]}
              disabled={totalUnidades === 0 || guardando}
              onPress={confirmar}
            >
              {guardando ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.botonConfirmarTexto}>
                  Planear cargue{totalUnidades > 0 ? ` (${totalUnidades} unidades)` : ''}
                </Text>
              )}
            </Pressable>
          </View>
        </ContenedorAncho>
      ) : promotorOrigen && promotorDestino ? (
        <ContenedorAncho anchoMaximo={ANCHO_ADMIN.lista} llenarAlto>
          <View style={styles.resumenOrigen}>
            <Text style={styles.resumenOrigenTexto}>
              Inventario de {promotorOrigen.nombre}:{' '}
              <Text style={styles.resumenOrigenCifra}>
                {productosOrigen.length} {productosOrigen.length === 1 ? 'producto' : 'productos'} ·{' '}
                {unidadesOrigen} {unidadesOrigen === 1 ? 'unidad' : 'unidades'}
              </Text>
            </Text>
            <Pressable
              style={[styles.botonTodo, todoMarcado && styles.botonTodoActivo]}
              onPress={alternarTrasladarTodo}
              accessibilityRole="button"
            >
              <Ionicons
                name={todoMarcado ? 'close-circle-outline' : 'checkmark-done-outline'}
                size={18}
                color={todoMarcado ? COLORES_ADMIN.vino : COLORES_ADMIN.textoInverso}
              />
              <Text style={[styles.botonTodoTexto, todoMarcado && styles.botonTodoTextoActivo]}>
                {todoMarcado ? 'Quitar todo' : 'Trasladar todo'}
              </Text>
            </Pressable>
          </View>

          <SelectorProductosConCantidad
            productos={productosOrigen}
            cantidades={cantidadesTraslado}
            disponibles={disponiblesOrigen}
            onCambiarCantidad={cambiarCantidadTraslado}
            busqueda={busquedaTraslado}
            onCambiarBusqueda={setBusquedaTraslado}
            colorAcento={COLORES_ADMIN.vino}
          />

          <View style={styles.pie}>
            <Pressable
              style={[
                styles.botonConfirmar,
                (totalUnidadesTraslado === 0 || guardandoTraslado) && styles.botonDeshabilitado,
              ]}
              disabled={totalUnidadesTraslado === 0 || guardandoTraslado}
              onPress={confirmarTraslado}
            >
              {guardandoTraslado ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.botonConfirmarTexto}>
                  Planear traslado{totalUnidadesTraslado > 0 ? ` (${totalUnidadesTraslado} unidades)` : ''}
                </Text>
              )}
            </Pressable>
          </View>
        </ContenedorAncho>
      ) : promotorOrigen && productosOrigen.length === 0 ? (
        <EmptyState
          icono="cube-outline"
          mensaje={`${promotorOrigen.nombre} no tiene productos en su inventario para trasladar.`}
        />
      ) : promotorOrigen ? (
        <ContenedorAncho anchoMaximo={ANCHO_ADMIN.lista} llenarAlto>
          <FlatList
            data={promotores.filter((p) => p.id !== promotorOrigen.id)}
            keyExtractor={(p) => p.id}
            contentContainerStyle={styles.lista}
            renderItem={({ item }) => (
              <ListRow titulo={item.nombre} onPress={() => setPromotorDestino(item)} />
            )}
          />
        </ContenedorAncho>
      ) : pestana === 'NUEVO' ? (
        promotores.length === 0 ? (
          <EmptyState icono="person-outline" mensaje="No hay promotores activos." />
        ) : (
          <ContenedorAncho anchoMaximo={ANCHO_ADMIN.lista} llenarAlto>
            <FlatList
              data={promotores}
              keyExtractor={(p) => p.id}
              contentContainerStyle={styles.lista}
              renderItem={({ item }) => <ListRow titulo={item.nombre} onPress={() => setPromotor(item)} />}
            />
          </ContenedorAncho>
        )
      ) : pestana === 'TRASLADO' ? (
        promotores.length < 2 ? (
          <EmptyState
            icono="swap-horizontal-outline"
            mensaje="Hace falta al menos dos promotores activos para trasladar entre ellos."
          />
        ) : (
          <ContenedorAncho anchoMaximo={ANCHO_ADMIN.lista} llenarAlto>
            <FlatList
              data={promotores}
              keyExtractor={(p) => p.id}
              contentContainerStyle={styles.lista}
              renderItem={({ item }) => (
                <ListRow titulo={item.nombre} onPress={() => elegirPromotorOrigen(item)} />
              )}
            />
          </ContenedorAncho>
        )
      ) : cargues.length === 0 && traslados.length === 0 ? (
        <EmptyState icono="cube-outline" mensaje="Todavía no se ha planeado ningún cargue ni traslado." />
      ) : (
        <ContenedorAncho anchoMaximo={ANCHO_ADMIN.lista} llenarAlto>
          <FlatList
            data={[
              ...(cargues.length > 0 ? [{ tipo: 'ENCABEZADO_CARGUES' as const }] : []),
              ...cargues.map((c) => ({ tipo: 'CARGUE' as const, item: c })),
              ...(traslados.length > 0 ? [{ tipo: 'ENCABEZADO_TRASLADOS' as const }] : []),
              ...traslados.map((t) => ({ tipo: 'TRASLADO' as const, item: t })),
            ]}
            keyExtractor={(fila, i) =>
              fila.tipo === 'ENCABEZADO_CARGUES' || fila.tipo === 'ENCABEZADO_TRASLADOS'
                ? `${fila.tipo}-${i}`
                : fila.item.id
            }
            contentContainerStyle={styles.lista}
            renderItem={({ item: fila }) => {
              if (fila.tipo === 'ENCABEZADO_CARGUES') {
                return <Text style={styles.subtituloSeccion}>Cargues planeados</Text>;
              }
              if (fila.tipo === 'ENCABEZADO_TRASLADOS') {
                return <Text style={styles.subtituloSeccion}>Traslados planeados</Text>;
              }
              if (fila.tipo === 'CARGUE') {
                return (
                  <ListRow
                    titulo={fila.item.promotorNombre}
                    subtitulo={formatearFecha(fila.item.tsCliente)}
                    badge={ETIQUETAS_ESTADO[fila.item.estado]}
                    onPress={() => router.push(`/admin/cargue/${fila.item.id}`)}
                  />
                );
              }
              return (
                <ListRow
                  titulo={`${fila.item.promotorOrigenNombre} → ${fila.item.promotorDestinoNombre}`}
                  subtitulo={formatearFecha(fila.item.tsCliente)}
                  badge={ETIQUETAS_ESTADO[fila.item.estado]}
                  onPress={() => router.push(`/admin/cargue/traslado/${fila.item.id}`)}
                />
              );
            }}
          />
        </ContenedorAncho>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  contenedor: {
    flex: 1,
    backgroundColor: COLORES_ADMIN.background,
  },
  pestanas: {
    paddingTop: ESPACIADO_ADMIN.lg,
  },
  centrado: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: ESPACIADO_ADMIN.xxl,
  },
  lista: {
    padding: ESPACIADO_ADMIN.xl,
    gap: ESPACIADO_ADMIN.sm,
  },
  subtituloSeccion: {
    ...TEXTO_ADMIN.boton,
    color: COLORES_ADMIN.textoSecundario,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    paddingTop: ESPACIADO_ADMIN.xs,
  },
  pie: {
    padding: ESPACIADO_ADMIN.xl,
  },
  resumenOrigen: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: ESPACIADO_ADMIN.sm,
    marginHorizontal: ESPACIADO_ADMIN.xl,
    marginTop: ESPACIADO_ADMIN.lg,
    padding: ESPACIADO_ADMIN.md,
    borderRadius: RADII_ADMIN.md,
    backgroundColor: COLORES_ADMIN.superficieBaja,
    borderWidth: 1,
    borderColor: COLORES_ADMIN.bordeSuave,
  },
  resumenOrigenTexto: {
    ...TEXTO_ADMIN.cuerpoSecundario,
    flexShrink: 1,
  },
  resumenOrigenCifra: {
    fontFamily: TIPOGRAFIA_ADMIN.monoSemiNegrita,
    color: COLORES_ADMIN.texto,
  },
  botonTodo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: COLORES_ADMIN.vino,
    borderRadius: RADII_ADMIN.lg,
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  botonTodoActivo: {
    backgroundColor: COLORES_ADMIN.superficieMasBaja,
    borderWidth: 1,
    borderColor: COLORES_ADMIN.vino,
  },
  botonTodoTexto: {
    ...TEXTO_ADMIN.boton,
    color: COLORES_ADMIN.textoInverso,
  },
  botonTodoTextoActivo: {
    color: COLORES_ADMIN.vino,
  },
  botonConfirmar: {
    backgroundColor: COLORES_ADMIN.vino,
    borderRadius: RADII_ADMIN.md,
    paddingVertical: 14,
    alignItems: 'center',
  },
  botonDeshabilitado: {
    opacity: 0.5,
  },
  botonConfirmarTexto: {
    ...TEXTO_ADMIN.tituloTarjeta,
    color: COLORES_ADMIN.textoInverso,
  },
});
