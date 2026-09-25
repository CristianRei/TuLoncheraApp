import { FlatList, Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import type { Cliente } from '@/core/tipos';
import { formatearPesos } from '@/core/dinero';
import { COLORES, TIPOGRAFIA_PROMOTOR, TEXTO_PROMOTOR } from '@/ui/colores';
import { RADII_ADMIN } from './tema';

import { etiquetaDescuento } from './etiquetaDescuento';
import type { ItemCarrito } from './useCarrito';

interface Props {
  visible: boolean;
  items: ItemCarrito[];
  total: number;
  /** Cuánto se descontó en total — si es mayor que 0, se muestra sobre el total. */
  ahorro?: number;
  colorAcento: string;
  onQuitarUno: (productoId: string) => void;
  onVaciar: () => void;
  onCerrar: () => void;
  onCobrar: () => void;
  /**
   * 'modal' (default): Modal nativo propio. 'superpuesto': sin Modal propio,
   * para usarlo ya dentro de otro Modal (ej. encima de la cámara del
   * escáner) — dos Modal nativos simultáneos con la cámara activa cuelgan
   * la pantalla en Android.
   */
  variante?: 'modal' | 'superpuesto';
  /** Cliente al que se facturará esta venta, si el promotor ya eligió uno (ver VentaEnCursoContext). */
  clienteVentaActual?: Cliente | null;
  onQuitarCliente?: () => void;
  /**
   * Navega a la pantalla de clientes para elegir uno — solo se pasa en el
   * Ticket "principal" (fuera del escáner): abrir una pantalla nueva con la
   * cámara activa detrás no es el mismo riesgo que apilar dos Modal, pero se
   * evita igual para no tocar ese flujo ya delicado (ver EscanerCodigoBarras).
   */
  onAsignarCliente?: () => void;
}

export function TicketModal({
  visible,
  items,
  total,
  ahorro = 0,
  colorAcento,
  onQuitarUno,
  onVaciar,
  onCerrar,
  onCobrar,
  variante = 'modal',
  clienteVentaActual,
  onQuitarCliente,
  onAsignarCliente,
}: Props) {
  if (variante === 'superpuesto' && !visible) return null;

  const contenido = (
    <View style={[StyleSheet.absoluteFill, styles.fondo]}>
      <View style={styles.hoja}>
        <View style={styles.encabezado}>
          <Text style={styles.titulo}>Ticket</Text>
          <Pressable onPress={onCerrar} accessibilityRole="button" accessibilityLabel="Cerrar ticket">
            <Text style={styles.cerrar}>Cerrar</Text>
          </Pressable>
        </View>

        {clienteVentaActual ? (
          <View style={styles.filaCliente}>
            <Text style={styles.filaClienteTexto} numberOfLines={1}>
              Facturando a: <Text style={styles.filaClienteNombre}>{clienteVentaActual.nombreCompleto}</Text>
            </Text>
            {onQuitarCliente && (
              <Pressable onPress={onQuitarCliente} accessibilityRole="button" accessibilityLabel="Quitar cliente">
                <Text style={styles.filaClienteQuitar}>Quitar</Text>
              </Pressable>
            )}
          </View>
        ) : (
          onAsignarCliente && (
            <Pressable
              style={styles.filaCliente}
              onPress={onAsignarCliente}
              accessibilityRole="button"
              accessibilityLabel="Asignar cliente a esta venta"
            >
              <Text style={styles.filaClienteAsignar}>+ Asignar a un cliente (opcional)</Text>
            </Pressable>
          )
        )}

        {items.length === 0 ? (
          <View style={styles.vacio}>
            <Text style={styles.vacioTexto}>Todavía no has agregado productos.</Text>
          </View>
        ) : (
          <>
            <FlatList
              data={items}
              keyExtractor={(item) => item.productoId}
              style={styles.lista}
              renderItem={({ item }) => (
                <View style={styles.fila}>
                  <View style={styles.filaTexto}>
                    <Text style={styles.filaNombre} numberOfLines={2}>
                      {item.nombre}
                    </Text>
                    <Text style={styles.filaDetalle}>
                      {item.cantidad} × {formatearPesos(item.precio)} ={' '}
                      {formatearPesos(item.precio * item.cantidad)}
                    </Text>
                    {item.descuento && item.precioLista > item.precio && (
                      <View style={styles.filaDescuento}>
                        <Text style={styles.filaPrecioLista}>{formatearPesos(item.precioLista)} c/u</Text>
                        <Text style={styles.filaDescuentoEtiqueta}>{etiquetaDescuento(item.descuento)}</Text>
                      </View>
                    )}
                  </View>
                  <Pressable
                    style={styles.botonQuitar}
                    onPress={() => onQuitarUno(item.productoId)}
                    accessibilityRole="button"
                    accessibilityLabel={`Quitar una unidad de ${item.nombre}`}
                  >
                    <Text style={styles.botonQuitarTexto}>−</Text>
                  </Pressable>
                </View>
              )}
            />

            <Pressable onPress={onVaciar} accessibilityRole="button" accessibilityLabel="Vaciar ticket">
              <Text style={styles.vaciar}>Vaciar ticket</Text>
            </Pressable>

            <View style={styles.pie}>
              {ahorro > 0 && (
                <View style={styles.totalFila}>
                  <Text style={styles.ahorroEtiqueta}>Descuento aplicado</Text>
                  <Text style={styles.ahorroValor}>-{formatearPesos(ahorro)}</Text>
                </View>
              )}
              <View style={styles.totalFila}>
                <Text style={styles.totalEtiqueta}>Total</Text>
                <Text style={styles.totalValor}>{formatearPesos(total)}</Text>
              </View>
              <Pressable
                style={[styles.botonCobrar, { backgroundColor: colorAcento }]}
                onPress={onCobrar}
                accessibilityRole="button"
                accessibilityLabel={`Cobrar ${formatearPesos(total)}`}
              >
                <Text style={styles.botonCobrarTexto}>Cobrar</Text>
              </Pressable>
            </View>
          </>
        )}
      </View>
    </View>
  );

  if (variante === 'superpuesto') return contenido;

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onCerrar}>
      {contenido}
    </Modal>
  );
}

const styles = StyleSheet.create({
  fondo: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  hoja: {
    backgroundColor: COLORES.superficie,
    borderTopLeftRadius: RADII_ADMIN.lg,
    borderTopRightRadius: RADII_ADMIN.lg,
    maxHeight: '80%',
    padding: 20,
  },
  encabezado: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  titulo: {
    ...TEXTO_PROMOTOR.tituloSeccion,
    color: COLORES.textoSobreOscuro,
  },
  filaCliente: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: COLORES.fondo,
    borderRadius: RADII_ADMIN.sm,
    paddingHorizontal: 12,
    paddingVertical: 9,
    marginBottom: 12,
  },
  filaClienteTexto: {
    ...TEXTO_PROMOTOR.cuerpoSecundario,
    flex: 1,
    marginRight: 8,
  },
  filaClienteNombre: {
    fontFamily: TIPOGRAFIA_PROMOTOR.semiNegrita,
    color: COLORES.textoSobreOscuro,
  },
  filaClienteQuitar: {
    ...TEXTO_PROMOTOR.boton,
    color: COLORES.error,
  },
  filaClienteAsignar: {
    ...TEXTO_PROMOTOR.boton,
    color: COLORES.primario,
  },
  cerrar: {
    ...TEXTO_PROMOTOR.cuerpoSecundario,
    textDecorationLine: 'underline',
  },
  vacio: {
    paddingVertical: 40,
    alignItems: 'center',
  },
  vacioTexto: {
    ...TEXTO_PROMOTOR.cuerpoSecundario,
  },
  lista: {
    maxHeight: 320,
  },
  fila: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: COLORES.borde,
    gap: 12,
  },
  filaTexto: {
    flex: 1,
    gap: 2,
  },
  filaNombre: {
    ...TEXTO_PROMOTOR.tituloTarjeta,
    color: COLORES.textoSobreOscuro,
  },
  filaDetalle: {
    ...TEXTO_PROMOTOR.datoDestacado,
    color: COLORES.textoSecundario,
  },
  filaDescuento: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 2,
  },
  filaPrecioLista: {
    ...TEXTO_PROMOTOR.datoSecundario,
    textDecorationLine: 'line-through',
  },
  filaDescuentoEtiqueta: {
    fontSize: 11,
    fontFamily: TIPOGRAFIA_PROMOTOR.negrita,
    color: COLORES.textoInverso,
    backgroundColor: COLORES.positivo,
    borderRadius: RADII_ADMIN.sm,
    paddingHorizontal: 6,
    paddingVertical: 1,
    overflow: 'hidden',
  },
  ahorroEtiqueta: {
    ...TEXTO_PROMOTOR.tituloTarjeta,
    color: COLORES.positivo,
  },
  ahorroValor: {
    ...TEXTO_PROMOTOR.datoDestacado,
    color: COLORES.positivo,
  },
  botonQuitar: {
    width: 32,
    height: 32,
    borderRadius: RADII_ADMIN.lg,
    backgroundColor: COLORES.superficieBaja,
    alignItems: 'center',
    justifyContent: 'center',
  },
  botonQuitarTexto: {
    ...TEXTO_PROMOTOR.boton,
    color: COLORES.textoSecundario,
  },
  vaciar: {
    ...TEXTO_PROMOTOR.boton,
    color: COLORES.error,
    textAlign: 'center',
    marginTop: 10,
  },
  pie: {
    marginTop: 16,
    gap: 12,
  },
  totalFila: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  totalEtiqueta: {
    ...TEXTO_PROMOTOR.tituloTarjeta,
    color: COLORES.textoSobreOscuro,
  },
  totalValor: {
    fontSize: 20,
    fontFamily: TIPOGRAFIA_PROMOTOR.monoSemiNegrita,
    color: COLORES.textoSobreOscuro,
  },
  botonCobrar: {
    borderRadius: RADII_ADMIN.md,
    paddingVertical: 14,
    alignItems: 'center',
  },
  botonCobrarTexto: {
    ...TEXTO_PROMOTOR.boton,
    color: COLORES.textoInverso,
  },
});
