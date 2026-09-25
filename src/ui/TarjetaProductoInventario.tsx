import { Image, Pressable, StyleSheet, Text, View } from 'react-native';

import type { DescuentoVigente } from '@/core/descuentos';
import { formatearPesos } from '@/core/dinero';
import { COLORES, TIPOGRAFIA_PROMOTOR, TEXTO_PROMOTOR } from '@/ui/colores';
import { RADII_ADMIN } from './tema';

import { etiquetaDescuento } from './etiquetaDescuento';

interface Props {
  nombre: string;
  /** Lo que se cobra: con el descuento vigente ya aplicado. */
  precio: number;
  /** Precio de catálogo — si es mayor que `precio`, se muestra tachado. */
  precioLista?: number;
  descuento?: DescuentoVigente | null;
  fotoUri: string | null;
  saldo: number;
  colorAcento: string;
  onPress: () => void;
}

export function TarjetaProductoInventario({
  nombre,
  precio,
  precioLista,
  descuento,
  fotoUri,
  saldo,
  colorAcento,
  onPress,
}: Props) {
  const conDescuento = !!descuento && precioLista !== undefined && precioLista > precio;
  return (
    <Pressable
      style={styles.tarjeta}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Agregar ${nombre}, ${formatearPesos(precio)}${
        conDescuento ? ` con descuento, antes ${formatearPesos(precioLista)}` : ''
      }, ${saldo} disponibles`}
    >
      <View style={styles.fotoContenedor}>
        {fotoUri ? (
          <Image source={{ uri: fotoUri }} style={styles.foto} />
        ) : (
          <Text style={styles.fotoPlaceholder}>Sin foto</Text>
        )}
        <View style={[styles.saldoBadge, { backgroundColor: colorAcento }]}>
          <Text style={styles.saldoTexto}>x{saldo}</Text>
        </View>
        {conDescuento && (
          <View style={styles.descuentoBadge}>
            <Text style={styles.descuentoTexto}>{etiquetaDescuento(descuento)}</Text>
          </View>
        )}
      </View>
      <Text style={styles.nombre} numberOfLines={2}>
        {nombre}
      </Text>
      {conDescuento && <Text style={styles.precioLista}>{formatearPesos(precioLista)}</Text>}
      <Text style={[styles.precio, { color: conDescuento ? COLORES.positivo : colorAcento }]}>
        {formatearPesos(precio)}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  tarjeta: {
    flex: 1,
    backgroundColor: COLORES.superficie,
    borderRadius: RADII_ADMIN.md,
    padding: 8,
    gap: 4,
    borderWidth: 1,
    borderColor: COLORES.borde,
  },
  fotoContenedor: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: RADII_ADMIN.sm,
    backgroundColor: COLORES.superficieBaja,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  foto: {
    width: '100%',
    height: '100%',
  },
  fotoPlaceholder: {
    fontSize: 10,
    fontFamily: TIPOGRAFIA_PROMOTOR.regular,
    color: COLORES.textoSecundario,
  },
  saldoBadge: {
    position: 'absolute',
    top: 6,
    right: 6,
    borderRadius: RADII_ADMIN.sm,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  saldoTexto: {
    fontSize: 10,
    fontFamily: TIPOGRAFIA_PROMOTOR.negrita,
    color: COLORES.textoInverso,
  },
  descuentoBadge: {
    position: 'absolute',
    bottom: 6,
    left: 6,
    borderRadius: RADII_ADMIN.sm,
    paddingHorizontal: 6,
    paddingVertical: 2,
    backgroundColor: COLORES.positivo,
  },
  descuentoTexto: {
    fontSize: 10,
    fontFamily: TIPOGRAFIA_PROMOTOR.negrita,
    color: COLORES.textoInverso,
  },
  nombre: {
    fontSize: 12,
    fontFamily: TIPOGRAFIA_PROMOTOR.semiNegrita,
    color: COLORES.textoSobreOscuro,
    minHeight: 32,
  },
  precioLista: {
    ...TEXTO_PROMOTOR.datoSecundario,
    textDecorationLine: 'line-through',
  },
  precio: {
    fontSize: 13,
    fontFamily: TIPOGRAFIA_PROMOTOR.monoSemiNegrita,
  },
});
