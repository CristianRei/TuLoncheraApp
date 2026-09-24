import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import { formatearPesos } from '@/core/dinero';
import type { MetodoPago, Venta } from '@/core/tipos';
import { getDb } from '@/db/client';
import { obtenerProgresoMetasDiarias, type ProgresoMetaDiaria } from '@/db/metasDiarias';
import { obtenerTurnoAbiertoHoy } from '@/db/turnos';
import { listarVentasTurno } from '@/db/ventas';
import { BarraMetaDiaria } from '@/ui/BarraMetaDiaria';
import { COLORES, TIPOGRAFIA_PROMOTOR } from '@/ui/colores';
import { useRequiereSesion } from '@/ui/useRequiereSesion';
import { useRecargarConDatosNuevos } from '@/ui/useVersionDatos';

const ICONO_METODO: Record<MetodoPago, keyof typeof Ionicons.glyphMap> = {
  EFECTIVO: 'cash-outline',
  TRANSFERENCIA: 'phone-portrait-outline',
  LIBRANZA: 'document-text-outline',
};

const ETIQUETA_METODO: Record<MetodoPago, string> = {
  EFECTIVO: 'Efectivo',
  TRANSFERENCIA: 'Transferencia',
  LIBRANZA: 'Libranza',
};

function formatearHora(iso: string): string {
  return new Date(iso).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
}

export default function VentasTurno() {
  const usuario = useRequiereSesion(['PROMOTOR']);
  const [ventas, setVentas] = useState<Venta[]>([]);
  const [cargando, setCargando] = useState(true);
  const [sinTurno, setSinTurno] = useState(false);
  const [meta, setMeta] = useState<ProgresoMetaDiaria | null>(null);

  const cargar = useCallback(async (promotorId: string) => {
    setCargando(true);
    try {
      const db = await getDb();
      const turno = await obtenerTurnoAbiertoHoy(db, promotorId);
      if (!turno) {
        setSinTurno(true);
        setVentas([]);
        return;
      }
      setSinTurno(false);
      setVentas(await listarVentasTurno(db, promotorId, turno));
    } finally {
      setCargando(false);
    }
  }, []);

  // La meta es del DÍA (todas las ventas de hoy en Bogotá), no solo del turno
  // — misma cifra que "Cierre de jornada" (src/db/metasDiarias.ts).
  const cargarMeta = useCallback(async (promotorId: string) => {
    const db = await getDb();
    const metas = await obtenerProgresoMetasDiarias(db);
    setMeta(metas.find((m) => m.promotorId === promotorId) ?? null);
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (usuario) {
        cargar(usuario.id);
        cargarMeta(usuario.id);
      }
    }, [usuario, cargar, cargarMeta])
  );
  // Si admin le asigna o cambia la meta de hoy con la pantalla abierta, la
  // barra se actualiza sola — ver src/ui/useVersionDatos.ts.
  useRecargarConDatosNuevos(() => {
    if (usuario) cargarMeta(usuario.id);
  });

  if (!usuario) return null;

  const activas = ventas.filter((v) => !v.anulada);
  const totalTurno = activas.reduce((suma, v) => suma + v.total, 0);

  return (
    <View style={styles.contenedor}>
      <View style={styles.encabezado}>
        <Pressable
          onPress={() => router.back()}
          style={styles.botonIcono}
          accessibilityRole="button"
          accessibilityLabel="Volver"
        >
          <Ionicons name="chevron-back" size={22} color={COLORES.textoSobreOscuro} />
        </Pressable>
        <Text style={styles.titulo}>Ventas del turno</Text>
        <View style={styles.botonIcono} />
      </View>

      {!cargando && !sinTurno && activas.length > 0 && (
        <View style={styles.resumen}>
          <View>
            <Text style={styles.resumenEtiqueta}>Total vendido</Text>
            <Text style={styles.resumenValor}>{formatearPesos(totalTurno)}</Text>
          </View>
          <View style={styles.resumenDivisor} />
          <View>
            <Text style={styles.resumenEtiqueta}>Ventas</Text>
            <Text style={styles.resumenValor}>{activas.length}</Text>
          </View>
        </View>
      )}

      {cargando ? (
        <View style={styles.centrado}>
          <ActivityIndicator size="large" color={COLORES.primario} />
        </View>
      ) : sinTurno ? (
        <View style={styles.centrado}>
          <Text style={styles.vacio}>No tienes un turno abierto.</Text>
        </View>
      ) : ventas.length === 0 ? (
        <View style={styles.centrado}>
          <Text style={styles.vacio}>Todavía no has registrado ventas en este turno.</Text>
        </View>
      ) : (
        <FlatList
          data={ventas}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.lista}
          renderItem={({ item }) => (
            <Pressable
              style={styles.tarjeta}
              onPress={() => router.push(`/promotor/ventas-turno/${item.id}`)}
            >
              <View style={[styles.icono, item.anulada && styles.iconoAnulado]}>
                <Ionicons
                  name={ICONO_METODO[item.metodoPago]}
                  size={20}
                  color={item.anulada ? COLORES.textoSecundario : COLORES.oscuro}
                />
              </View>
              <View style={styles.tarjetaTexto}>
                <Text style={styles.tarjetaRecibo}>{item.numeroRecibo}</Text>
                <Text style={styles.tarjetaDetalle}>
                  {ETIQUETA_METODO[item.metodoPago]} · {formatearHora(item.tsCliente)}
                </Text>
                {item.clienteNombre && (
                  <View style={styles.tarjetaClienteFila}>
                    <Ionicons name="person-outline" size={11} color={COLORES.textoSecundario} />
                    <Text style={styles.tarjetaCliente} numberOfLines={1}>
                      {item.clienteNombre}
                    </Text>
                  </View>
                )}
              </View>
              <View style={styles.tarjetaDerecha}>
                <Text style={[styles.tarjetaTotal, item.anulada && styles.tarjetaTotalAnulado]}>
                  {formatearPesos(item.total)}
                </Text>
                {item.anulada && <Text style={styles.chipAnulada}>Anulada</Text>}
              </View>
            </Pressable>
          )}
        />
      )}

      {!cargando && (
        <View style={styles.panelMeta}>
          <BarraMetaDiaria meta={meta} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  contenedor: {
    flex: 1,
    backgroundColor: COLORES.fondo,
  },
  encabezado: {
    backgroundColor: COLORES.primario,
    paddingTop: 64,
    paddingHorizontal: 12,
    paddingBottom: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  botonIcono: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  titulo: {
    fontSize: 17,
    fontFamily: TIPOGRAFIA_PROMOTOR.negrita,
    color: COLORES.textoSobreOscuro,
  },
  resumen: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORES.superficie,
    marginHorizontal: 16,
    marginTop: 16,
    borderRadius: 16,
    paddingVertical: 16,
    paddingHorizontal: 20,
    gap: 20,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  resumenDivisor: {
    width: 1,
    height: 30,
    backgroundColor: COLORES.borde,
  },
  resumenEtiqueta: {
    fontSize: 11,
    fontFamily: TIPOGRAFIA_PROMOTOR.medio,
    color: COLORES.textoSecundario,
    marginBottom: 2,
  },
  resumenValor: {
    fontSize: 18,
    fontFamily: TIPOGRAFIA_PROMOTOR.monoSemiNegrita,
    color: COLORES.oscuro,
  },
  centrado: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  vacio: {
    fontSize: 14,
    fontFamily: TIPOGRAFIA_PROMOTOR.regular,
    color: COLORES.textoSecundario,
    textAlign: 'center',
  },
  lista: {
    padding: 16,
    gap: 10,
  },
  // Fija al final de la pantalla (fuera de la lista): siempre a la vista,
  // aunque haya muchas ventas.
  panelMeta: {
    backgroundColor: COLORES.superficie,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 28,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: -3 },
    elevation: 8,
  },
  tarjeta: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORES.superficie,
    borderRadius: 14,
    padding: 12,
    gap: 12,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  icono: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(243,167,18,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconoAnulado: {
    backgroundColor: '#F0F0F0',
  },
  tarjetaTexto: {
    flex: 1,
    gap: 2,
  },
  tarjetaRecibo: {
    fontSize: 14,
    fontFamily: TIPOGRAFIA_PROMOTOR.semiNegrita,
    color: COLORES.textoSobreOscuro,
  },
  tarjetaDetalle: {
    fontSize: 12,
    fontFamily: TIPOGRAFIA_PROMOTOR.regular,
    color: COLORES.textoSecundario,
  },
  tarjetaClienteFila: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 1,
  },
  tarjetaCliente: {
    fontSize: 12,
    fontFamily: TIPOGRAFIA_PROMOTOR.medio,
    color: COLORES.primario,
    flexShrink: 1,
  },
  tarjetaDerecha: {
    alignItems: 'flex-end',
    gap: 3,
  },
  tarjetaTotal: {
    fontSize: 15,
    fontFamily: TIPOGRAFIA_PROMOTOR.monoSemiNegrita,
    color: COLORES.textoSobreOscuro,
  },
  tarjetaTotalAnulado: {
    color: COLORES.textoSecundario,
    textDecorationLine: 'line-through',
  },
  chipAnulada: {
    fontSize: 10,
    fontFamily: TIPOGRAFIA_PROMOTOR.semiNegrita,
    color: COLORES.error,
    backgroundColor: 'rgba(220,53,69,0.1)',
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
});
