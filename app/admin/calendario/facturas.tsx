import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Image, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { calcularRangoDiaBogota } from '@/core/analitica';
import { formatearPesos } from '@/core/dinero';
import type { MetodoPago, Venta, VentaItem } from '@/core/tipos';
import { getDb } from '@/db/client';
import { obtenerComprobanteRemoto } from '@/db/comprobantesRemotos';
import { listarFacturasPromotor } from '@/db/ventas';
import { ContenedorAncho } from '@/ui/ContenedorAncho';
import { Encabezado } from '@/ui/Encabezado';
import { FilterTabs } from '@/ui/FilterTabs';
import { Insignia } from '@/ui/Insignia';
import { ANCHO_ADMIN, COLORES_ADMIN, RADII_ADMIN, TEXTO_ADMIN, TIPOGRAFIA_ADMIN } from '@/ui/tema';
import { useEsPantallaAncha } from '@/ui/useEsPantallaAncha';
import { useRequiereSesion } from '@/ui/useRequiereSesion';
import { useRecargarConDatosNuevos } from '@/ui/useVersionDatos';

type Factura = { venta: Venta; items: VentaItem[] };
type Filtro = 'TODAS' | MetodoPago;

const ETIQUETA_METODO: Record<MetodoPago, string> = {
  EFECTIVO: 'Efectivo',
  TRANSFERENCIA: 'Transferencia',
  LIBRANZA: 'Libranza',
};

function hora(tsCliente: string): string {
  return new Date(tsCliente).toLocaleTimeString('es-CO', {
    timeZone: 'America/Bogota',
    hour: 'numeric',
    minute: '2-digit',
  });
}

/**
 * Las facturas (ventas, de cualquier medio de pago) de un promotor en un día,
 * desde "Promotores del día" del calendario: cada una con su valor, hora,
 * recibo y productos, y las de transferencia con la foto del comprobante —
 * para que el admin compruebe que se cobró lo correcto. Las fotos de otro
 * dispositivo se traen de Supabase.
 */
export default function FacturasDelDia() {
  const usuario = useRequiereSesion(['ADMIN']);
  const pantallaAncha = useEsPantallaAncha();
  const { promotorId, nombre, fecha } = useLocalSearchParams<{ promotorId: string; nombre: string; fecha: string }>();
  const [facturas, setFacturas] = useState<Factura[] | null>(null);
  const [fotos, setFotos] = useState<Map<string, string | null>>(new Map());
  const [filtro, setFiltro] = useState<Filtro>('TODAS');
  const [fotoGrande, setFotoGrande] = useState<string | null>(null);
  const [version, setVersion] = useState(0);

  const leer = useCallback(async () => {
    const db = await getDb();
    return listarFacturasPromotor(db, promotorId, calcularRangoDiaBogota(fecha));
  }, [promotorId, fecha]);

  useEffect(() => {
    let vigente = true;
    leer().then(async (lista) => {
      if (!vigente) return;
      setFacturas(lista);
      // Fotos: la local si la venta se hizo aquí; si no, la de Supabase (URL firmada).
      const transferencias = lista.filter((f) => f.venta.metodoPago === 'TRANSFERENCIA');
      const resueltas = await Promise.all(
        transferencias.map(async ({ venta }) => {
          if (venta.comprobanteUri) return [venta.id, venta.comprobanteUri] as const;
          try {
            return [venta.id, (await obtenerComprobanteRemoto(venta.id))?.comprobanteUri ?? null] as const;
          } catch {
            return [venta.id, null] as const; // sin red: se muestra "Sin foto disponible"
          }
        })
      );
      if (vigente) setFotos(new Map(resueltas));
    });
    return () => {
      vigente = false;
    };
  }, [leer, version]);

  useRecargarConDatosNuevos(() => setVersion((v) => v + 1));

  if (!usuario) return null;

  const activas = (facturas ?? []).filter((f) => !f.venta.anulada);
  const totalPor = (metodo: MetodoPago) =>
    activas.filter((f) => f.venta.metodoPago === metodo).reduce((s, f) => s + f.venta.total, 0);
  const visibles = (facturas ?? []).filter((f) => filtro === 'TODAS' || f.venta.metodoPago === filtro);
  const cuantas = (metodo: MetodoPago) => (facturas ?? []).filter((f) => f.venta.metodoPago === metodo).length;

  return (
    <View style={styles.contenedor}>
      <Encabezado titulo={`Facturas de ${nombre ?? 'promotor'}`} rutaVolverTexto="Calendario" anchoMaximo={ANCHO_ADMIN.tablero} />
      <ScrollView contentContainerStyle={styles.scroll}>
        <ContenedorAncho anchoMaximo={ANCHO_ADMIN.tablero}>
          <Text style={styles.subtitulo}>{fecha} · hora de Colombia</Text>

          {facturas === null ? (
            <ActivityIndicator color={COLORES_ADMIN.vino} style={{ marginTop: 24 }} />
          ) : (
            <>
              <View style={styles.totales}>
                <View style={[styles.total, styles.totalDestacado]}>
                  <Text style={[styles.totalEtiqueta, styles.totalEtiquetaDestacada]}>Facturado</Text>
                  <Text style={[styles.totalValor, styles.totalValorDestacado]}>
                    {formatearPesos(activas.reduce((s, f) => s + f.venta.total, 0))}
                  </Text>
                  <Text style={styles.totalDetalle}>
                    {activas.length} {activas.length === 1 ? 'factura' : 'facturas'}
                  </Text>
                </View>
                {(['EFECTIVO', 'TRANSFERENCIA', 'LIBRANZA'] as const).map((m) => (
                  <View key={m} style={styles.total}>
                    <Text style={styles.totalEtiqueta}>{ETIQUETA_METODO[m]}</Text>
                    <Text style={styles.totalValor}>{formatearPesos(totalPor(m))}</Text>
                  </View>
                ))}
              </View>

              <FilterTabs<Filtro>
                opciones={[
                  { valor: 'TODAS', etiqueta: `Todas (${facturas.length})` },
                  { valor: 'EFECTIVO', etiqueta: `Efectivo (${cuantas('EFECTIVO')})` },
                  { valor: 'TRANSFERENCIA', etiqueta: `Transferencia (${cuantas('TRANSFERENCIA')})` },
                  { valor: 'LIBRANZA', etiqueta: `Libranza (${cuantas('LIBRANZA')})` },
                ]}
                valorActivo={filtro}
                onCambiar={setFiltro}
              />

              {visibles.length === 0 ? (
                <Text style={styles.vacio}>No hay facturas con este filtro.</Text>
              ) : (
                <View style={styles.grilla}>
                  {visibles.map(({ venta, items }) => {
                    const foto = fotos.get(venta.id);
                    return (
                      <View key={venta.id} style={[styles.factura, pantallaAncha && styles.facturaAncha]}>
                        <View style={styles.facturaEncabezado}>
                          <View style={{ flex: 1 }}>
                            <Text style={styles.recibo}>{venta.numeroRecibo}</Text>
                            <Text style={styles.nota}>
                              {hora(venta.tsCliente)}
                              {venta.puntoNombre ? ` · ${venta.puntoNombre}` : ''}
                              {venta.clienteNombre ? ` · Cliente: ${venta.clienteNombre}` : ''}
                            </Text>
                          </View>
                          <Text style={[styles.valor, venta.anulada && styles.valorAnulado]}>
                            {formatearPesos(venta.total)}
                          </Text>
                        </View>
                        <View style={styles.insignias}>
                          <Insignia
                            texto={ETIQUETA_METODO[venta.metodoPago]}
                            estado={venta.metodoPago === 'TRANSFERENCIA' ? 'alerta' : 'neutro'}
                          />
                          {venta.anulada && <Insignia texto="Anulada" estado="error" />}
                        </View>
                        {venta.anulada && venta.motivoAnulacion && (
                          <Text style={styles.motivo}>Motivo: {venta.motivoAnulacion}</Text>
                        )}

                        <View style={styles.cuerpo}>
                          <View style={styles.items}>
                            {items.map((item) => (
                              <View key={item.productoId} style={styles.item}>
                                <Text style={styles.itemNombre} numberOfLines={2}>
                                  {item.cantidad} × {item.productoNombre}
                                </Text>
                                <Text style={styles.itemValor}>{formatearPesos(item.cantidad * item.precioUnitario)}</Text>
                              </View>
                            ))}
                          </View>
                          {venta.metodoPago === 'TRANSFERENCIA' &&
                            (foto === undefined ? (
                              <View style={styles.fotoVacia}>
                                <ActivityIndicator size="small" color={COLORES_ADMIN.vino} />
                              </View>
                            ) : foto ? (
                              <Pressable onPress={() => setFotoGrande(foto)} accessibilityRole="imagebutton" accessibilityLabel="Ver comprobante en grande">
                                <Image source={{ uri: foto }} style={styles.foto} resizeMode="cover" />
                                <Text style={styles.fotoPie}>Ver en grande</Text>
                              </Pressable>
                            ) : (
                              <View style={styles.fotoVacia}>
                                <Ionicons name="image-outline" size={22} color={COLORES_ADMIN.bordeSuave} />
                                <Text style={styles.fotoVaciaTexto}>Sin foto disponible</Text>
                              </View>
                            ))}
                        </View>

                        <Pressable onPress={() => router.push(`/admin/ventas/${venta.id}`)} accessibilityRole="link">
                          <Text style={styles.enlace}>Ver detalle de la venta ›</Text>
                        </Pressable>
                      </View>
                    );
                  })}
                </View>
              )}
            </>
          )}
        </ContenedorAncho>
      </ScrollView>

      <Modal visible={fotoGrande !== null} transparent animationType="fade" onRequestClose={() => setFotoGrande(null)}>
        <Pressable style={styles.fondoFoto} onPress={() => setFotoGrande(null)} accessibilityLabel="Cerrar foto">
          {fotoGrande && <Image source={{ uri: fotoGrande }} style={styles.fotoGrande} resizeMode="contain" />}
          <Text style={styles.cerrarFoto}>Toca para cerrar</Text>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  contenedor: { flex: 1, backgroundColor: COLORES_ADMIN.background },
  scroll: { padding: 16, paddingBottom: 40 },
  subtitulo: { ...TEXTO_ADMIN.cuerpoSecundario, marginBottom: 12 },
  nota: { ...TEXTO_ADMIN.nota },
  vacio: { ...TEXTO_ADMIN.cuerpoSecundario, textAlign: 'center', marginTop: 24 },
  totales: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  total: {
    flexGrow: 1,
    flexBasis: '22%',
    minWidth: 130,
    borderWidth: 1,
    borderColor: COLORES_ADMIN.bordeSuave,
    borderRadius: RADII_ADMIN.sm,
    backgroundColor: COLORES_ADMIN.superficieMasBaja,
    padding: 10,
    gap: 2,
  },
  totalDestacado: { backgroundColor: COLORES_ADMIN.vino, borderColor: COLORES_ADMIN.vino },
  totalEtiqueta: {
    fontSize: 10,
    fontFamily: TIPOGRAFIA_ADMIN.semiNegrita,
    color: COLORES_ADMIN.textoSecundario,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  totalEtiquetaDestacada: { color: COLORES_ADMIN.superficieAlta },
  totalValor: { fontSize: 16, fontFamily: TIPOGRAFIA_ADMIN.monoSemiNegrita, color: COLORES_ADMIN.texto },
  totalValorDestacado: { color: COLORES_ADMIN.textoInverso, fontSize: 18 },
  totalDetalle: { fontSize: 11, fontFamily: TIPOGRAFIA_ADMIN.regular, color: COLORES_ADMIN.dorado },
  grilla: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 12 },
  factura: {
    width: '100%',
    backgroundColor: COLORES_ADMIN.superficieMasBaja,
    borderWidth: 1,
    borderColor: COLORES_ADMIN.bordeSuave,
    borderRadius: RADII_ADMIN.md,
    padding: 12,
    gap: 8,
  },
  facturaAncha: { width: '49%', minWidth: 340 },
  facturaEncabezado: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  recibo: { fontSize: 14, fontFamily: TIPOGRAFIA_ADMIN.monoSemiNegrita, color: COLORES_ADMIN.texto },
  valor: { fontSize: 18, fontFamily: TIPOGRAFIA_ADMIN.monoSemiNegrita, color: COLORES_ADMIN.vino },
  valorAnulado: { textDecorationLine: 'line-through', color: COLORES_ADMIN.textoSecundario },
  insignias: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  motivo: { ...TEXTO_ADMIN.nota, color: COLORES_ADMIN.error },
  cuerpo: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  items: { flex: 1, gap: 4 },
  item: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  itemNombre: { ...TEXTO_ADMIN.cuerpoSecundario, flex: 1 },
  itemValor: { fontSize: 13, fontFamily: TIPOGRAFIA_ADMIN.monoMedio, color: COLORES_ADMIN.texto },
  foto: { width: 110, height: 146, borderRadius: RADII_ADMIN.sm, backgroundColor: COLORES_ADMIN.superficie },
  fotoPie: { fontSize: 11, fontFamily: TIPOGRAFIA_ADMIN.semiNegrita, color: COLORES_ADMIN.vino, textAlign: 'center', marginTop: 4 },
  fotoVacia: {
    width: 110,
    height: 146,
    borderRadius: RADII_ADMIN.sm,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: COLORES_ADMIN.bordeSuave,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    padding: 6,
  },
  fotoVaciaTexto: { fontSize: 11, fontFamily: TIPOGRAFIA_ADMIN.regular, color: COLORES_ADMIN.textoSecundario, textAlign: 'center' },
  enlace: { fontSize: 13, fontFamily: TIPOGRAFIA_ADMIN.semiNegrita, color: COLORES_ADMIN.vino },
  fondoFoto: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.85)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    gap: 12,
  },
  fotoGrande: { width: '100%', height: '85%' },
  cerrarFoto: { color: '#FFFFFF', fontSize: 13, fontFamily: TIPOGRAFIA_ADMIN.medio },
});
