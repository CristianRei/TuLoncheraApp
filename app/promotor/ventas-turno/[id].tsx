import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { formatearPesos } from '@/core/dinero';
import type { MetodoPago, Venta, VentaItem } from '@/core/tipos';
import { getDb } from '@/db/client';
import { obtenerVenta } from '@/db/ventas';
import { EncabezadoPromotor } from '@/ui/EncabezadoPromotor';
import { COLORES, TIPOGRAFIA_PROMOTOR, TEXTO_PROMOTOR } from '@/ui/colores';
import { RADII_ADMIN } from '@/ui/tema';
import { useRequiereSesion } from '@/ui/useRequiereSesion';

const ETIQUETA_METODO: Record<MetodoPago, string> = {
  EFECTIVO: 'Efectivo',
  TRANSFERENCIA: 'Transferencia',
  LIBRANZA: 'Libranza',
};

function formatearFechaHora(iso: string): string {
  return new Date(iso).toLocaleString('es-CO', { dateStyle: 'long', timeStyle: 'short' });
}

export default function DetalleVentaTurno() {
  const usuario = useRequiereSesion(['PROMOTOR']);
  const { id } = useLocalSearchParams<{ id: string }>();

  const [venta, setVenta] = useState<Venta | null>(null);
  const [items, setItems] = useState<VentaItem[]>([]);
  const [cargando, setCargando] = useState(true);

  const cargar = useCallback(async () => {
    if (!id) return;
    setCargando(true);
    try {
      const db = await getDb();
      const encontrada = await obtenerVenta(db, id);
      setVenta(encontrada?.venta ?? null);
      setItems(encontrada?.items ?? []);
    } finally {
      setCargando(false);
    }
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      cargar();
    }, [cargar])
  );

  if (!usuario) return null;

  return (
    <View style={styles.contenedor}>
      <EncabezadoPromotor titulo="Detalle de venta" />

      {cargando ? (
        <View style={styles.centrado}>
          <ActivityIndicator size="large" color={COLORES.primario} />
        </View>
      ) : !venta ? (
        <View style={styles.centrado}>
          <Text style={styles.vacio}>Esta venta ya no existe.</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.scroll}>
          <View style={styles.tarjeta}>
            <View style={styles.filaEntreTitulo}>
              <Text style={styles.numeroRecibo}>{venta.numeroRecibo}</Text>
              {venta.anulada && <Text style={styles.chipAnulada}>Anulada</Text>}
            </View>
            <Text style={styles.fecha}>{formatearFechaHora(venta.tsCliente)}</Text>

            <View style={styles.separador} />

            <View style={styles.filaDato}>
              <Text style={styles.etiquetaDato}>Método de pago</Text>
              <Text style={styles.valorDato}>{ETIQUETA_METODO[venta.metodoPago]}</Text>
            </View>
            {venta.puntoNombre && (
              <View style={styles.filaDato}>
                <Text style={styles.etiquetaDato}>Punto</Text>
                <Text style={styles.valorDato}>{venta.puntoNombre}</Text>
              </View>
            )}
            {venta.anulada && venta.motivoAnulacion && (
              <View style={styles.filaDato}>
                <Text style={styles.etiquetaDato}>Motivo de anulación</Text>
                <Text style={styles.valorDato}>{venta.motivoAnulacion}</Text>
              </View>
            )}

            {venta.comprobanteUri && (
              <>
                <View style={styles.separador} />
                <Text style={styles.etiquetaDato}>Comprobante de transferencia</Text>
                <Image source={{ uri: venta.comprobanteUri }} style={styles.comprobante} resizeMode="cover" />
              </>
            )}
          </View>

          <View style={styles.tarjeta}>
            <View style={styles.filaEntreTitulo}>
              <Text style={styles.tituloSeccion}>Cliente asignado</Text>
              <Pressable
                onPress={() => router.push(`/promotor/clientes?paraVentaId=${venta.id}`)}
                accessibilityRole="button"
                accessibilityLabel={venta.clienteNombre ? 'Cambiar cliente asignado' : 'Asignar cliente'}
              >
                <Text style={styles.enlace}>{venta.clienteNombre ? 'Cambiar' : 'Asignar'}</Text>
              </Pressable>
            </View>
            {venta.clienteNombre ? (
              <View style={styles.filaCliente}>
                <View style={styles.avatarCliente}>
                  <Ionicons name="person" size={16} color={COLORES.oscuro} />
                </View>
                <Text style={styles.valorDato}>{venta.clienteNombre}</Text>
              </View>
            ) : (
              <Text style={styles.vacioTexto}>Sin cliente asignado todavía.</Text>
            )}
          </View>

          <View style={styles.tarjeta}>
            <Text style={styles.tituloSeccion}>Productos</Text>
            {items.map((item) => (
              <View key={item.productoId} style={styles.filaProducto}>
                <View style={styles.filaProductoTexto}>
                  <Text style={styles.productoNombre} numberOfLines={2}>
                    {item.productoNombre}
                  </Text>
                  <Text style={styles.productoDetalle}>
                    {item.cantidad} × {formatearPesos(item.precioUnitario)}
                  </Text>
                </View>
                <Text style={styles.productoSubtotal}>
                  {formatearPesos(item.cantidad * item.precioUnitario)}
                </Text>
              </View>
            ))}
            <View style={styles.separador} />
            <View style={styles.filaEntreTitulo}>
              <Text style={styles.totalEtiqueta}>Total</Text>
              <Text style={styles.totalValor}>{formatearPesos(venta.total)}</Text>
            </View>
          </View>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  contenedor: {
    flex: 1,
    backgroundColor: COLORES.fondo,
  },
  centrado: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  vacio: {
    ...TEXTO_PROMOTOR.cuerpoSecundario,
    textAlign: 'center',
  },
  scroll: {
    padding: 16,
    gap: 14,
    paddingBottom: 40,
  },
  tarjeta: {
    backgroundColor: COLORES.superficie,
    borderRadius: RADII_ADMIN.lg,
    padding: 16,
    gap: 10,
    borderWidth: 1,
    borderColor: COLORES.borde,
  },
  filaEntreTitulo: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  numeroRecibo: {
    ...TEXTO_PROMOTOR.datoDestacado,
    color: COLORES.textoSobreOscuro,
  },
  fecha: {
    ...TEXTO_PROMOTOR.cuerpoSecundario,
  },
  chipAnulada: {
    fontSize: 11,
    fontFamily: TIPOGRAFIA_PROMOTOR.semiNegrita,
    color: COLORES.error,
    backgroundColor: 'rgba(220,53,69,0.1)',
    borderRadius: RADII_ADMIN.sm,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  separador: {
    height: 1,
    backgroundColor: COLORES.borde,
    marginVertical: 4,
  },
  filaDato: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  etiquetaDato: {
    ...TEXTO_PROMOTOR.cuerpoSecundario,
  },
  valorDato: {
    ...TEXTO_PROMOTOR.tituloTarjeta,
    color: COLORES.textoSobreOscuro,
  },
  comprobante: {
    width: '100%',
    height: 220,
    borderRadius: RADII_ADMIN.md,
    backgroundColor: COLORES.fondo,
  },
  tituloSeccion: {
    ...TEXTO_PROMOTOR.tituloTarjeta,
    color: COLORES.textoSobreOscuro,
  },
  enlace: {
    ...TEXTO_PROMOTOR.boton,
    color: COLORES.primario,
  },
  vacioTexto: {
    ...TEXTO_PROMOTOR.cuerpoSecundario,
  },
  filaCliente: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  avatarCliente: {
    width: 30,
    height: 30,
    borderRadius: RADII_ADMIN.md,
    backgroundColor: 'rgba(243,167,18,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  filaProducto: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
  },
  filaProductoTexto: {
    flex: 1,
    gap: 2,
    marginRight: 10,
  },
  productoNombre: {
    ...TEXTO_PROMOTOR.tituloTarjeta,
    color: COLORES.textoSobreOscuro,
  },
  productoDetalle: {
    ...TEXTO_PROMOTOR.datoSecundario,
  },
  productoSubtotal: {
    ...TEXTO_PROMOTOR.datoDestacado,
    color: COLORES.textoSobreOscuro,
  },
  totalEtiqueta: {
    ...TEXTO_PROMOTOR.tituloTarjeta,
    color: COLORES.textoSobreOscuro,
  },
  totalValor: {
    fontSize: 20,
    fontFamily: TIPOGRAFIA_PROMOTOR.monoSemiNegrita,
    color: COLORES.primario,
  },
});
