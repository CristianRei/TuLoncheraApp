import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { getDb } from '@/db/client';
import { getDispositivoId } from '@/db/dispositivo';
import { registrarEntradaBodega } from '@/db/entradasBodega';
import { buscarProductoPorCodigoBarras } from '@/db/productos';
import { COLORES } from './colores';
import { EscanerCodigoBarras } from './EscanerCodigoBarras';

interface Props {
  usuarioId: string;
}

interface LineaPedido {
  productoId: string;
  nombre: string;
  cantidad: number;
  fechaVencimiento: string | null;
}

const PATRON_FECHA = /^\d{4}-\d{2}-\d{2}$/;

/** "20260315" tecleado en number-pad → "2026-03-15", insertando guiones. */
function formatearEntradaFecha(texto: string): string {
  const digitos = texto.replace(/\D/g, '').slice(0, 8);
  const partes = [digitos.slice(0, 4), digitos.slice(4, 6), digitos.slice(6, 8)].filter(Boolean);
  return partes.join('-');
}

/**
 * Cuerpo de "ingresar pedido": escanear producto → teclear cantidad → se
 * agrega a la lista → confirmar todo al final. Las cantidades suelen ser
 * altas (+60), por eso se teclean en vez de usar un contador +/-. Cuerpo
 * compartido entre Bodega (app/bodega/index.tsx) y Admin
 * (app/admin/inventario/pedido.tsx) — mismo botón, mismo color de marca.
 */
export function PantallaIngresarPedido({ usuarioId }: Props) {
  const [items, setItems] = useState<LineaPedido[]>([]);
  const [escanerVisible, setEscanerVisible] = useState(false);
  const [productoPendiente, setProductoPendiente] = useState<{
    id: string;
    nombre: string;
  } | null>(null);
  const [cantidadTexto, setCantidadTexto] = useState('');
  const [fechaTexto, setFechaTexto] = useState('');
  const [guardando, setGuardando] = useState(false);

  async function manejarCodigoEscaneado(codigo: string) {
    const db = await getDb();
    const producto = await buscarProductoPorCodigoBarras(db, codigo);
    if (!producto) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert(
        'Código no reconocido',
        'Ningún producto del catálogo tiene ese código. Regístralo primero en Catálogo.'
      );
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setProductoPendiente({ id: producto.id, nombre: producto.nombre });
    setCantidadTexto('');
    setFechaTexto('');
  }

  function confirmarCantidad() {
    if (!productoPendiente) return;
    const cantidad = parseInt(cantidadTexto, 10);
    if (!Number.isFinite(cantidad) || cantidad <= 0) return;
    if (fechaTexto && !PATRON_FECHA.test(fechaTexto)) return;
    const fechaVencimiento = fechaTexto || null;

    setItems((actual) => {
      const existente = actual.find(
        (item) => item.productoId === productoPendiente.id && item.fechaVencimiento === fechaVencimiento
      );
      if (existente) {
        return actual.map((item) =>
          item === existente ? { ...item, cantidad: item.cantidad + cantidad } : item
        );
      }
      return [
        ...actual,
        { productoId: productoPendiente.id, nombre: productoPendiente.nombre, cantidad, fechaVencimiento },
      ];
    });
    setProductoPendiente(null);
    setCantidadTexto('');
    setFechaTexto('');
  }

  function quitarLinea(indice: number) {
    setItems((actual) => actual.filter((_, i) => i !== indice));
  }

  const totalUnidades = items.reduce((suma, item) => suma + item.cantidad, 0);

  async function confirmarPedido() {
    if (items.length === 0) return;
    setGuardando(true);
    try {
      const db = await getDb();
      const dispositivoId = await getDispositivoId(db);
      await registrarEntradaBodega(
        db,
        {
          usuarioId,
          items: items.map(({ productoId, cantidad, fechaVencimiento }) => ({
            productoId,
            cantidad,
            fechaVencimiento,
          })),
        },
        dispositivoId
      );
      setItems([]);
      Alert.alert('Pedido ingresado', 'El stock de bodega quedó actualizado.');
    } finally {
      setGuardando(false);
    }
  }

  return (
    <View style={styles.contenedor}>
      <Pressable style={styles.botonEscanear} onPress={() => setEscanerVisible(true)}>
        <Ionicons name="camera-outline" size={18} color="#FFF" />
        <Text style={styles.botonEscanearTexto}>Escanear producto</Text>
      </Pressable>

      {items.length === 0 ? (
        <View style={styles.centrado}>
          <Text style={styles.vacio}>Escanea un producto para empezar a armar el pedido.</Text>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item, indice) => `${item.productoId}-${item.fechaVencimiento ?? 'sin-fecha'}-${indice}`}
          contentContainerStyle={styles.lista}
          renderItem={({ item, index }) => (
            <View style={styles.fila}>
              <View style={styles.filaTexto}>
                <Text style={styles.filaNombre} numberOfLines={2}>
                  {item.nombre}
                </Text>
                <Text style={styles.filaCantidad}>{item.cantidad} unidades</Text>
                {item.fechaVencimiento && (
                  <Text style={styles.filaVencimiento}>Vence: {item.fechaVencimiento}</Text>
                )}
              </View>
              <Pressable style={styles.botonQuitar} onPress={() => quitarLinea(index)}>
                <Text style={styles.botonQuitarTexto}>×</Text>
              </Pressable>
            </View>
          )}
        />
      )}

      {items.length > 0 && (
        <View style={styles.pie}>
          <Pressable
            style={[styles.botonConfirmar, guardando && styles.botonDeshabilitado]}
            disabled={guardando}
            onPress={confirmarPedido}
          >
            {guardando ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.botonConfirmarTexto}>
                Confirmar pedido ({totalUnidades} unidades)
              </Text>
            )}
          </Pressable>
        </View>
      )}

      <EscanerCodigoBarras
        visible={escanerVisible}
        activa={!productoPendiente}
        colorAcento={COLORES.oscuro}
        titulo="Escanear producto del pedido"
        onCerrar={() => setEscanerVisible(false)}
        onDetectado={manejarCodigoEscaneado}
        overlayEncimaDeCamara={
          productoPendiente && (
            <View style={[StyleSheet.absoluteFill, styles.fondoModal]}>
              <View style={styles.tarjetaModal}>
                <Text style={styles.modalTitulo}>{productoPendiente.nombre}</Text>
                <Text style={styles.modalTexto}>¿Cuántas unidades llegaron?</Text>
                <TextInput
                  style={styles.modalInput}
                  placeholder="0"
                  placeholderTextColor="#999"
                  value={cantidadTexto}
                  onChangeText={(texto) => setCantidadTexto(texto.replace(/\D/g, ''))}
                  keyboardType="number-pad"
                  autoFocus
                />
                <Text style={styles.modalTexto}>Fecha de vencimiento (opcional)</Text>
                <TextInput
                  style={styles.modalInputFecha}
                  placeholder="AAAA-MM-DD"
                  placeholderTextColor="#999"
                  value={fechaTexto}
                  onChangeText={(texto) => setFechaTexto(formatearEntradaFecha(texto))}
                  keyboardType="number-pad"
                  maxLength={10}
                />
                {fechaTexto.length > 0 && !PATRON_FECHA.test(fechaTexto) && (
                  <Text style={styles.modalErrorFecha}>Formato: AAAA-MM-DD</Text>
                )}
                <View style={styles.modalAcciones}>
                  <Pressable
                    onPress={() => {
                      setProductoPendiente(null);
                      setCantidadTexto('');
                      setFechaTexto('');
                    }}
                  >
                    <Text style={styles.modalCancelar}>Cancelar</Text>
                  </Pressable>
                  <Pressable
                    style={[
                      styles.modalConfirmar,
                      (!cantidadTexto ||
                        parseInt(cantidadTexto, 10) <= 0 ||
                        (fechaTexto.length > 0 && !PATRON_FECHA.test(fechaTexto))) &&
                        styles.botonDeshabilitado,
                    ]}
                    disabled={
                      !cantidadTexto ||
                      parseInt(cantidadTexto, 10) <= 0 ||
                      (fechaTexto.length > 0 && !PATRON_FECHA.test(fechaTexto))
                    }
                    onPress={confirmarCantidad}
                  >
                    <Text style={styles.modalConfirmarTexto}>Agregar</Text>
                  </Pressable>
                </View>
              </View>
            </View>
          )
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  contenedor: {
    flex: 1,
  },
  botonEscanear: {
    flexDirection: 'row',
    margin: 20,
    marginBottom: 12,
    backgroundColor: COLORES.oscuro,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  botonEscanearTexto: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '700',
  },
  centrado: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  vacio: {
    fontSize: 14,
    color: '#888',
    textAlign: 'center',
  },
  lista: {
    paddingHorizontal: 20,
    paddingBottom: 20,
    gap: 10,
  },
  fila: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 14,
    gap: 12,
  },
  filaTexto: {
    flex: 1,
    gap: 2,
  },
  filaNombre: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
  },
  filaCantidad: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORES.oscuro,
  },
  filaVencimiento: {
    fontSize: 12,
    color: '#888',
  },
  botonQuitar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#F0F0F0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  botonQuitarTexto: {
    fontSize: 16,
    fontWeight: '700',
    color: '#888',
    lineHeight: 18,
  },
  pie: {
    padding: 20,
  },
  botonConfirmar: {
    backgroundColor: COLORES.oscuro,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  botonDeshabilitado: {
    opacity: 0.5,
  },
  botonConfirmarTexto: {
    color: '#FFF',
    fontSize: 15,
    fontWeight: '700',
  },
  fondoModal: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  tarjetaModal: {
    width: '100%',
    maxWidth: 340,
    backgroundColor: '#FFF',
    borderRadius: 18,
    padding: 22,
    gap: 10,
  },
  modalTitulo: {
    fontSize: 16,
    fontWeight: '700',
    color: '#333',
  },
  modalTexto: {
    fontSize: 13,
    color: '#777',
  },
  modalInput: {
    borderWidth: 1,
    borderColor: '#DDD',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 22,
    fontWeight: '700',
    textAlign: 'center',
  },
  modalInputFecha: {
    borderWidth: 1,
    borderColor: '#DDD',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
  },
  modalErrorFecha: {
    fontSize: 12,
    color: '#B00020',
    textAlign: 'center',
  },
  modalAcciones: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: 20,
    marginTop: 4,
  },
  modalCancelar: {
    fontSize: 14,
    color: '#888',
  },
  modalConfirmar: {
    backgroundColor: COLORES.oscuro,
    borderRadius: 10,
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  modalConfirmarTexto: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '700',
  },
});
