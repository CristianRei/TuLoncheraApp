import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import { calcularRangoDiaBogota } from '@/core/analitica';
import { formatearPesos } from '@/core/dinero';
import type { MetodoPago, Venta } from '@/core/tipos';
import { getDb } from '@/db/client';
import { obtenerProgresoMetaDelPromotor, type ProgresoMetaDiaria } from '@/db/metasDiarias';
import { obtenerEventoDeHoyPromotor, obtenerTurnoAbiertoHoy } from '@/db/turnos';
import { listarVentasEquipoHoy, listarVentasTurno } from '@/db/ventas';
import { BarraMetaDiaria } from '@/ui/BarraMetaDiaria';
import { EncabezadoPromotor } from '@/ui/EncabezadoPromotor';
import { FiltroSegmentado } from '@/ui/FiltroSegmentado';
import { COLORES, TIPOGRAFIA_PROMOTOR, TEXTO_PROMOTOR } from '@/ui/colores';
import { RADII_ADMIN } from '@/ui/tema';
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

type Pestana = 'MIAS' | 'EQUIPO';

export default function VentasTurno() {
  const usuario = useRequiereSesion(['PROMOTOR']);
  const [ventas, setVentas] = useState<Venta[]>([]);
  const [cargando, setCargando] = useState(true);
  const [sinTurno, setSinTurno] = useState(false);
  const [meta, setMeta] = useState<ProgresoMetaDiaria | null>(null);
  // Compañeros del evento de hoy (si hay más de uno): comparten la meta del
  // día y cada uno puede ver lo que venden los demás.
  const [equipo, setEquipo] = useState<{ ids: string[]; nombres: string[] } | null>(null);
  const [ventasEquipo, setVentasEquipo] = useState<Venta[]>([]);
  const [pestana, setPestana] = useState<Pestana>('MIAS');

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

  // La meta es del EVENTO y del DÍA (todas las ventas de hoy de todo el
  // equipo), no solo de este turno — misma cifra que "Cierre de jornada"
  // (src/db/metasDiarias.ts). Se recarga sin parpadeo cuando llegan ventas
  // de los compañeros.
  const cargarEquipoYMeta = useCallback(async (promotorId: string) => {
    const db = await getDb();
    const [progreso, evento] = await Promise.all([
      obtenerProgresoMetaDelPromotor(db, promotorId),
      obtenerEventoDeHoyPromotor(db, promotorId),
    ]);
    setMeta(progreso);
    if (evento && evento.promotorIds.length > 1) {
      setEquipo({ ids: evento.promotorIds, nombres: evento.promotorNombres });
      setVentasEquipo(await listarVentasEquipoHoy(db, evento.promotorIds, calcularRangoDiaBogota(evento.fecha)));
    } else {
      setEquipo(null);
      setVentasEquipo([]);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (usuario) {
        cargar(usuario.id);
        cargarEquipoYMeta(usuario.id);
      }
    }, [usuario, cargar, cargarEquipoYMeta])
  );
  // Si admin cambia la meta, o un compañero vende, con la pantalla abierta,
  // todo se actualiza solo — ver src/ui/useVersionDatos.ts.
  useRecargarConDatosNuevos(() => {
    if (usuario) cargarEquipoYMeta(usuario.id);
  });

  if (!usuario) return null;

  const viendoEquipo = pestana === 'EQUIPO' && equipo !== null;
  const lista = viendoEquipo ? ventasEquipo : ventas;
  const activas = lista.filter((v) => !v.anulada);
  const totalLista = activas.reduce((suma, v) => suma + v.total, 0);
  const totalPorPromotor = equipo
    ? equipo.ids.map((id, i) => ({
        nombre: equipo.nombres[i],
        total: ventasEquipo.filter((v) => v.promotorId === id && !v.anulada).reduce((suma, v) => suma + v.total, 0),
      }))
    : [];

  return (
    <View style={styles.contenedor}>
      <EncabezadoPromotor titulo="Ventas del turno" />

      {equipo && !sinTurno && (
        <View style={styles.pestanas}>
          <FiltroSegmentado
            variante="promotor"
            opciones={[
              { valor: 'MIAS' as Pestana, etiqueta: 'Mis ventas' },
              { valor: 'EQUIPO' as Pestana, etiqueta: 'Todo el equipo' },
            ]}
            valorActivo={pestana}
            onCambiar={setPestana}
          />
        </View>
      )}

      {!cargando && !sinTurno && activas.length > 0 && (
        <View style={styles.resumen}>
          <View style={styles.resumenFila}>
            <View>
              <Text style={styles.resumenEtiqueta}>{viendoEquipo ? 'Vendido hoy por el equipo' : 'Total vendido'}</Text>
              <Text style={styles.resumenValor}>{formatearPesos(totalLista)}</Text>
            </View>
            <View style={styles.resumenDivisor} />
            <View>
              <Text style={styles.resumenEtiqueta}>Ventas</Text>
              <Text style={styles.resumenValor}>{activas.length}</Text>
            </View>
          </View>
          {viendoEquipo && (
            <View style={styles.desglose}>
              {totalPorPromotor.map((fila) => (
                <Text key={fila.nombre} style={styles.desgloseTexto}>
                  {fila.nombre}: <Text style={styles.desgloseCifra}>{formatearPesos(fila.total)}</Text>
                </Text>
              ))}
            </View>
          )}
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
      ) : lista.length === 0 ? (
        <View style={styles.centrado}>
          <Text style={styles.vacio}>
            {viendoEquipo
              ? 'Todavía nadie del equipo ha registrado ventas hoy.'
              : 'Todavía no has registrado ventas en este turno.'}
          </Text>
        </View>
      ) : (
        <FlatList
          data={lista}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.lista}
          renderItem={({ item }) => {
            const propia = item.promotorId === usuario.id;
            const contenido = (
              <>
                <View style={[styles.icono, item.anulada && styles.iconoAnulado]}>
                  <Ionicons
                    name={ICONO_METODO[item.metodoPago]}
                    size={20}
                    color={item.anulada ? COLORES.textoSecundario : COLORES.oscuro}
                  />
                </View>
                <View style={styles.tarjetaTexto}>
                  <Text style={styles.tarjetaRecibo}>{item.numeroRecibo}</Text>
                  {viendoEquipo && (
                    <Text style={styles.tarjetaPromotor}>{propia ? 'Tú' : item.promotorNombre}</Text>
                  )}
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
              </>
            );
            // Las ventas de los compañeros solo se consultan: el detalle (y
            // asignarles cliente) es de quien las hizo.
            return propia ? (
              <Pressable style={styles.tarjeta} onPress={() => router.push(`/promotor/ventas-turno/${item.id}`)}>
                {contenido}
              </Pressable>
            ) : (
              <View style={styles.tarjeta}>{contenido}</View>
            );
          }}
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
  pestanas: {
    marginHorizontal: 16,
    marginTop: 14,
  },
  resumenFila: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 20,
  },
  desglose: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: COLORES.borde,
  },
  desgloseTexto: {
    ...TEXTO_PROMOTOR.nota,
  },
  desgloseCifra: {
    fontFamily: TIPOGRAFIA_PROMOTOR.monoSemiNegrita,
    color: COLORES.oscuro,
  },
  tarjetaPromotor: {
    fontSize: 12,
    fontFamily: TIPOGRAFIA_PROMOTOR.semiNegrita,
    color: COLORES.oscuro,
  },
  resumen: {
    backgroundColor: COLORES.superficie,
    marginHorizontal: 16,
    marginTop: 16,
    borderRadius: RADII_ADMIN.lg,
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderWidth: 1,
    borderColor: COLORES.borde,
  },
  resumenDivisor: {
    width: 1,
    height: 30,
    backgroundColor: COLORES.borde,
  },
  resumenEtiqueta: {
    ...TEXTO_PROMOTOR.nota,
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
    ...TEXTO_PROMOTOR.cuerpoSecundario,
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
    borderTopLeftRadius: RADII_ADMIN.lg,
    borderTopRightRadius: RADII_ADMIN.lg,
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
    borderRadius: RADII_ADMIN.md,
    padding: 12,
    gap: 12,
    borderWidth: 1,
    borderColor: COLORES.borde,
  },
  icono: {
    width: 40,
    height: 40,
    borderRadius: RADII_ADMIN.lg,
    backgroundColor: 'rgba(243,167,18,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconoAnulado: {
    backgroundColor: COLORES.superficieBaja,
  },
  tarjetaTexto: {
    flex: 1,
    gap: 2,
  },
  tarjetaRecibo: {
    ...TEXTO_PROMOTOR.tituloTarjeta,
    color: COLORES.textoSobreOscuro,
  },
  tarjetaDetalle: {
    ...TEXTO_PROMOTOR.nota,
  },
  tarjetaClienteFila: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 1,
  },
  tarjetaCliente: {
    ...TEXTO_PROMOTOR.nota,
    color: COLORES.primario,
    flexShrink: 1,
  },
  tarjetaDerecha: {
    alignItems: 'flex-end',
    gap: 3,
  },
  tarjetaTotal: {
    ...TEXTO_PROMOTOR.datoDestacado,
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
    borderRadius: RADII_ADMIN.sm,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
});
