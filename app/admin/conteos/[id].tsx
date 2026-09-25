import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, Text, View } from 'react-native';

import type { Conteo, ConteoLinea } from '@/core/tipos';
import { getDb } from '@/db/client';
import { obtenerConteo } from '@/db/conteos';
import { ContenedorAncho } from '@/ui/ContenedorAncho';
import { Encabezado } from '@/ui/Encabezado';
import { ANCHO_ADMIN, COLORES_ADMIN, ESTADO_ADMIN, RADII_ADMIN } from '@/ui/tema';
import { useRequiereSesion } from '@/ui/useRequiereSesion';

function formatearFecha(tsCliente: string): string {
  const fecha = new Date(tsCliente);
  return fecha.toLocaleString('es-CO', { dateStyle: 'long', timeStyle: 'short' });
}

export default function DetalleConteo() {
  const usuario = useRequiereSesion(['ADMIN']);
  const { id } = useLocalSearchParams<{ id: string }>();
  const [conteo, setConteo] = useState<Conteo | null>(null);
  const [lineas, setLineas] = useState<ConteoLinea[]>([]);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    (async () => {
      const db = await getDb();
      const resultado = await obtenerConteo(db, id);
      setConteo(resultado?.conteo ?? null);
      setLineas(resultado?.lineas ?? []);
      setCargando(false);
    })();
  }, [id]);

  if (!usuario) return null;

  const conDescuadre = lineas.filter((linea) => linea.diferencia !== 0).length;

  return (
    <View style={styles.contenedor}>
      <Encabezado titulo="Detalle del conteo" rutaVolverTexto="Conteos" />

      {cargando ? (
        <View style={styles.centrado}>
          <ActivityIndicator size="large" color={COLORES_ADMIN.vino} />
        </View>
      ) : !conteo ? (
        <View style={styles.centrado}>
          <Text style={styles.vacio}>Este conteo ya no existe.</Text>
        </View>
      ) : (
        <ContenedorAncho anchoMaximo={ANCHO_ADMIN.lista} llenarAlto>
          <View style={styles.resumen}>
            <Text style={styles.resumenPromotor}>{conteo.promotorNombre}</Text>
            <Text style={styles.resumenDetalle}>{formatearFecha(conteo.tsCliente)}</Text>
            <Text style={styles.resumenDetalle}>
              {conDescuadre === 0
                ? 'Sin descuadres.'
                : `${conDescuadre} producto${conDescuadre === 1 ? '' : 's'} con descuadre.`}
            </Text>
          </View>

          <FlatList
            data={lineas}
            keyExtractor={(item) => item.productoId}
            contentContainerStyle={styles.lista}
            renderItem={({ item }) => (
              <View style={styles.fila}>
                <View style={styles.filaTexto}>
                  <Text style={styles.filaNombre} numberOfLines={2}>
                    {item.productoNombre}
                  </Text>
                  <Text style={styles.filaDetalle}>
                    Teórico: {item.teorico} · Contado: {item.contado}
                  </Text>
                </View>
                {item.diferencia !== 0 && (
                  <Text
                    style={[
                      styles.filaDiferencia,
                      item.diferencia > 0 ? styles.diferenciaPositiva : styles.diferenciaNegativa,
                    ]}
                  >
                    {item.diferencia > 0 ? `+${item.diferencia}` : item.diferencia}
                  </Text>
                )}
              </View>
            )}
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
  centrado: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  vacio: {
    fontSize: 14,
    color: COLORES_ADMIN.textoSecundario,
  },
  resumen: {
    backgroundColor: COLORES_ADMIN.superficieMasBaja,
    margin: 20,
    marginBottom: 0,
    borderRadius: RADII_ADMIN.md,
    padding: 16,
    gap: 4,
  },
  resumenPromotor: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORES_ADMIN.texto,
  },
  resumenDetalle: {
    fontSize: 13,
    color: COLORES_ADMIN.textoSecundario,
  },
  lista: {
    padding: 20,
    gap: 10,
  },
  fila: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: COLORES_ADMIN.superficieMasBaja,
    borderRadius: RADII_ADMIN.md,
    padding: 12,
    gap: 12,
  },
  filaTexto: {
    flex: 1,
    gap: 2,
  },
  filaNombre: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORES_ADMIN.texto,
  },
  filaDetalle: {
    fontSize: 13,
    color: COLORES_ADMIN.textoSecundario,
  },
  filaDiferencia: {
    fontSize: 15,
    fontWeight: '800',
  },
  diferenciaPositiva: {
    color: ESTADO_ADMIN.exito.texto,
  },
  diferenciaNegativa: {
    color: ESTADO_ADMIN.error.texto,
  },
});
