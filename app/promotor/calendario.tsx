import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import type { Evento } from '@/core/tipos';
import { getDb } from '@/db/client';
import { listarEventosPromotor } from '@/db/eventos';
import { aClaveFecha, construirGrilla, NOMBRES_DIA, NOMBRES_MES } from '@/ui/calendarioGrilla';
import { COLORES } from '@/ui/colores';
import { useRequiereSesion } from '@/ui/useRequiereSesion';

const TAMANO_CELDA = 40;

function colorEstado(estado: Evento['estado']): string {
  if (estado === 'CANCELADO') return '#B00020';
  if (estado === 'CERRADO') return '#888';
  if (estado === 'EN_CURSO') return '#2E7D32';
  return COLORES.oscuro;
}

const ETIQUETAS_ESTADO: Record<Evento['estado'], string> = {
  PLANEADO: 'Planeado',
  EN_CURSO: 'En curso',
  CERRADO: 'Cerrado',
  CANCELADO: 'Cancelado',
};

export default function CalendarioPromotor() {
  const usuario = useRequiereSesion(['PROMOTOR']);
  const hoy = new Date();
  const [mesVisible, setMesVisible] = useState({ anio: hoy.getFullYear(), mes: hoy.getMonth() });
  const [eventos, setEventos] = useState<Evento[]>([]);
  const [cargando, setCargando] = useState(true);
  const [diaSeleccionado, setDiaSeleccionado] = useState<string | null>(null);

  const hoyClave = aClaveFecha(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());

  const cargar = useCallback(async () => {
    if (!usuario) return;
    setCargando(true);
    try {
      const db = await getDb();
      const desde = aClaveFecha(mesVisible.anio, mesVisible.mes, 1);
      const ultimoDia = new Date(mesVisible.anio, mesVisible.mes + 1, 0).getDate();
      const hasta = aClaveFecha(mesVisible.anio, mesVisible.mes, ultimoDia);
      setEventos(await listarEventosPromotor(db, usuario.id, { desde, hasta }));
    } finally {
      setCargando(false);
    }
  }, [usuario, mesVisible]);

  useFocusEffect(
    useCallback(() => {
      cargar();
    }, [cargar])
  );

  if (!usuario) return null;

  function irMesAnterior() {
    setMesVisible((actual) => {
      const mes = actual.mes === 0 ? 11 : actual.mes - 1;
      const anio = actual.mes === 0 ? actual.anio - 1 : actual.anio;
      return { anio, mes };
    });
  }

  function irMesSiguiente() {
    setMesVisible((actual) => {
      const mes = actual.mes === 11 ? 0 : actual.mes + 1;
      const anio = actual.mes === 11 ? actual.anio + 1 : actual.anio;
      return { anio, mes };
    });
  }

  const semanas = construirGrilla(mesVisible.anio, mesVisible.mes);
  const eventosPorDia = new Map<string, Evento[]>();
  for (const evento of eventos) {
    const lista = eventosPorDia.get(evento.fecha) ?? [];
    lista.push(evento);
    eventosPorDia.set(evento.fecha, lista);
  }
  const eventosDelDia = diaSeleccionado ? (eventosPorDia.get(diaSeleccionado) ?? []) : [];

  return (
    <View style={styles.contenedor}>
      <View style={styles.encabezado}>
        <Pressable onPress={() => router.back()}>
          <Text style={styles.volver}>‹ Volver</Text>
        </Pressable>
        <Text style={styles.titulo}>Mi calendario</Text>
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.calendario}>
          <View style={styles.mesEncabezado}>
            <Pressable style={styles.navBoton} onPress={irMesAnterior}>
              <Ionicons name="chevron-back" size={18} color={COLORES.oscuro} />
            </Pressable>
            <Text style={styles.mesTexto}>
              {NOMBRES_MES[mesVisible.mes]} {mesVisible.anio}
            </Text>
            <Pressable style={styles.navBoton} onPress={irMesSiguiente}>
              <Ionicons name="chevron-forward" size={18} color={COLORES.oscuro} />
            </Pressable>
          </View>

          <View style={styles.filaDias}>
            {NOMBRES_DIA.map((nombre) => (
              <Text key={nombre} style={styles.diaEtiqueta}>
                {nombre}
              </Text>
            ))}
          </View>

          {semanas.map((semana, indiceSemana) => (
            <View key={indiceSemana} style={styles.filaDias}>
              {semana.map((dia, indiceDia) => {
                if (dia === null) return <View key={indiceDia} style={styles.celda} />;
                const clave = aClaveFecha(mesVisible.anio, mesVisible.mes, dia);
                const esHoy = clave === hoyClave;
                const seleccionado = clave === diaSeleccionado;
                const eventosDia = eventosPorDia.get(clave) ?? [];
                const tieneCancelado = eventosDia.some((e) => e.estado === 'CANCELADO');
                const tieneActivo = eventosDia.some((e) => e.estado !== 'CANCELADO');

                return (
                  <Pressable
                    key={indiceDia}
                    style={styles.celda}
                    onPress={() => setDiaSeleccionado(seleccionado ? null : clave)}
                  >
                    <View
                      style={[
                        styles.diaCirculo,
                        seleccionado && styles.diaCirculoSeleccionado,
                        esHoy && !seleccionado && styles.diaCirculoHoy,
                      ]}
                    >
                      <Text
                        style={[
                          styles.diaTexto,
                          seleccionado && styles.diaTextoSeleccionado,
                          esHoy && !seleccionado && styles.diaTextoHoy,
                        ]}
                      >
                        {dia}
                      </Text>
                    </View>
                    {(tieneActivo || tieneCancelado) && (
                      <View
                        style={[
                          styles.punto,
                          tieneActivo && styles.puntoActivo,
                          !tieneActivo && tieneCancelado && styles.puntoCancelado,
                        ]}
                      />
                    )}
                  </Pressable>
                );
              })}
            </View>
          ))}
        </View>

        {cargando ? (
          <ActivityIndicator color={COLORES.oscuro} style={{ marginTop: 20 }} />
        ) : diaSeleccionado ? (
          <View style={styles.detalleDia}>
            <Text style={styles.detalleDiaTitulo}>{diaSeleccionado}</Text>
            {eventosDelDia.length === 0 ? (
              <Text style={styles.vacio}>Sin eventos asignados este día.</Text>
            ) : (
              eventosDelDia.map((evento) => (
                <View
                  key={evento.id}
                  style={[styles.filaEvento, evento.estado === 'CANCELADO' && styles.filaEventoCancelada]}
                >
                  <View style={styles.filaEventoTexto}>
                    <Text
                      style={[
                        styles.filaEventoEmpresa,
                        evento.estado === 'CANCELADO' && styles.textoTachado,
                      ]}
                    >
                      {evento.empresaNombre}
                    </Text>
                    <Text
                      style={[styles.filaEventoPunto, evento.estado === 'CANCELADO' && styles.textoTachado]}
                    >
                      {evento.puntoNombre}
                    </Text>
                    {evento.estado === 'CANCELADO' && evento.motivoCancelacion && (
                      <Text style={styles.filaEventoMotivo}>Motivo: {evento.motivoCancelacion}</Text>
                    )}
                  </View>
                  <Text style={[styles.badgeEstado, { color: colorEstado(evento.estado) }]}>
                    {ETIQUETAS_ESTADO[evento.estado]}
                  </Text>
                </View>
              ))
            )}
          </View>
        ) : (
          <Text style={styles.vacio}>Toca un día para ver dónde estás asignado.</Text>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  contenedor: { flex: 1, backgroundColor: '#FFF8EC' },
  encabezado: {
    backgroundColor: COLORES.primario,
    paddingTop: 64,
    paddingHorizontal: 20,
    paddingBottom: 16,
    gap: 4,
  },
  volver: { fontSize: 13, color: '#3A2400', textDecorationLine: 'underline' },
  titulo: { fontSize: 18, fontWeight: '700', color: '#3A2400' },
  scroll: { padding: 16, gap: 14 },
  calendario: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#F0DDB8',
    padding: 14,
    gap: 8,
  },
  mesEncabezado: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  navBoton: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: '#FFF8EC',
    alignItems: 'center',
    justifyContent: 'center',
  },
  mesTexto: { fontSize: 15, fontWeight: '700', color: COLORES.oscuro },
  filaDias: { flexDirection: 'row' },
  diaEtiqueta: { width: TAMANO_CELDA, textAlign: 'center', fontSize: 11, fontWeight: '700', color: '#888' },
  celda: { width: TAMANO_CELDA, height: TAMANO_CELDA, alignItems: 'center', justifyContent: 'center', gap: 2 },
  diaCirculo: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  diaCirculoSeleccionado: { backgroundColor: COLORES.oscuro },
  diaCirculoHoy: { borderWidth: 1.5, borderColor: COLORES.primario },
  diaTexto: { fontSize: 13, color: '#333' },
  diaTextoSeleccionado: { color: '#FFFFFF', fontWeight: '700' },
  diaTextoHoy: { color: COLORES.oscuro, fontWeight: '700' },
  punto: { width: 5, height: 5, borderRadius: 3 },
  puntoActivo: { backgroundColor: COLORES.primario },
  puntoCancelado: { backgroundColor: '#B00020' },
  vacio: { fontSize: 13, color: '#888', marginTop: 8, textAlign: 'center' },
  detalleDia: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#F0DDB8',
    padding: 16,
    gap: 10,
  },
  detalleDiaTitulo: { fontSize: 15, fontWeight: '700', color: COLORES.oscuro },
  filaEvento: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#FFF8EC',
    borderRadius: 10,
    padding: 12,
  },
  filaEventoCancelada: { opacity: 0.6 },
  filaEventoTexto: { gap: 2, flex: 1 },
  filaEventoEmpresa: { fontSize: 14, fontWeight: '700', color: '#333' },
  filaEventoPunto: { fontSize: 13, color: '#777' },
  filaEventoMotivo: { fontSize: 12, color: '#B00020', marginTop: 2 },
  textoTachado: { textDecorationLine: 'line-through' },
  badgeEstado: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase' },
});
