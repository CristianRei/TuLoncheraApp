import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { obtenerResumenVentas } from '@/db/analitica';
import { registrarArqueoCaja } from '@/db/arqueos';
import { getDb } from '@/db/client';
import { existeConteoHoy } from '@/db/conteos';
import { getDispositivoId } from '@/db/dispositivo';
import { generarPdfCierreTurno } from '@/db/exportarCierreTurno';
import { listarInventarioPromotor } from '@/db/inventario';
import { obtenerProgresoMetaDelPromotor, type ProgresoMetaDiaria } from '@/db/metasDiarias';
import { finalizarTurno, obtenerEventoDeHoyPromotor, obtenerTurnoAbiertoHoy } from '@/db/turnos';
import { formatearPesos, parsearPesos } from '@/core/dinero';
import type { Evento, Turno } from '@/core/tipos';
import { EncabezadoPromotor } from '@/ui/EncabezadoPromotor';
import { COLORES, TIPOGRAFIA_PROMOTOR, TEXTO_PROMOTOR } from '@/ui/colores';
import { ESTADO_ADMIN, RADII_ADMIN } from '@/ui/tema';
import { useRequiereSesion } from '@/ui/useRequiereSesion';

interface ResumenJornada {
  totalTransferencia: number;
  totalLibranza: number;
  efectivoTeorico: number;
}

export default function CierreJornada() {
  const usuario = useRequiereSesion(['PROMOTOR']);
  const [cargando, setCargando] = useState(true);
  const [turno, setTurno] = useState<Turno | null>(null);
  const [eventoHoy, setEventoHoy] = useState<Evento | null>(null);
  const [resumen, setResumen] = useState<ResumenJornada | null>(null);
  const [meta, setMeta] = useState<ProgresoMetaDiaria | null>(null);
  const [sinConteoHoy, setSinConteoHoy] = useState(false);
  const [efectivoContadoTexto, setEfectivoContadoTexto] = useState('');
  const [cerrando, setCerrando] = useState(false);

  const cargar = useCallback(async (promotorId: string) => {
    setCargando(true);
    try {
      const db = await getDb();
      const turnoAbierto = await obtenerTurnoAbiertoHoy(db, promotorId);
      setTurno(turnoAbierto);
      if (!turnoAbierto) return;

      const [evento, resumenVentas, metaDelEvento, yaConto] = await Promise.all([
        obtenerEventoDeHoyPromotor(db, promotorId),
        obtenerResumenVentas(
          db,
          { desde: turnoAbierto.horaInicio, hasta: new Date().toISOString() },
          { promotorId }
        ),
        obtenerProgresoMetaDelPromotor(db, promotorId),
        existeConteoHoy(db, promotorId),
      ]);

      setEventoHoy(evento);
      const porMetodo = (metodo: string) =>
        resumenVentas.porMetodoPago.find((p) => p.metodoPago === metodo)?.total ?? 0;
      setResumen({
        totalTransferencia: porMetodo('TRANSFERENCIA'),
        totalLibranza: porMetodo('LIBRANZA'),
        efectivoTeorico: porMetodo('EFECTIVO'),
      });
      setMeta(metaDelEvento);
      setSinConteoHoy(!yaConto);
    } finally {
      setCargando(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (usuario) cargar(usuario.id);
    }, [usuario, cargar])
  );

  if (!usuario) return null;
  const usuarioActual = usuario;

  const efectivoContado = efectivoContadoTexto.trim() === '' ? null : parsearPesos(efectivoContadoTexto);
  const diferencia = efectivoContado !== null && resumen ? efectivoContado - resumen.efectivoTeorico : null;

  async function cerrarTurno() {
    if (!turno || efectivoContado === null || !resumen) return;

    Alert.alert('Cerrar turno', '¿Confirmas que quieres cerrar tu turno de hoy?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Cerrar turno',
        style: 'destructive',
        onPress: async () => {
          setCerrando(true);
          try {
            const db = await getDb();
            const dispositivoId = await getDispositivoId(db);
            const horaFin = new Date().toISOString();

            await finalizarTurno(db, { turnoId: turno.id });
            await registrarArqueoCaja(
              db,
              {
                turnoId: turno.id,
                promotorId: usuarioActual.id,
                efectivoTeorico: resumen.efectivoTeorico,
                efectivoContado,
                totalTransferencia: resumen.totalTransferencia,
                totalLibranza: resumen.totalLibranza,
              },
              dispositivoId
            );

            ofrecerDescargarPdf(db, { ...turno, horaFin }, eventoHoy);
            router.replace('/promotor');
          } finally {
            setCerrando(false);
          }
        },
      },
    ]);
  }

  function ofrecerDescargarPdf(db: Awaited<ReturnType<typeof getDb>>, turnoCerrado: Turno, evento: Evento | null) {
    Alert.alert('Turno cerrado', '¿Quieres descargar el comprobante en PDF?', [
      { text: 'Ahora no', style: 'cancel' },
      {
        text: 'Descargar PDF',
        onPress: async () => {
          try {
            const [inventarioFinal, resumenVentas] = await Promise.all([
              listarInventarioPromotor(db, turnoCerrado.promotorId),
              obtenerResumenVentas(
                db,
                { desde: turnoCerrado.horaInicio, hasta: turnoCerrado.horaFin ?? new Date().toISOString() },
                { promotorId: turnoCerrado.promotorId }
              ),
            ]);
            await generarPdfCierreTurno({
              turno: turnoCerrado,
              eventoHoy: evento,
              inventario: inventarioFinal,
              resumenVentas,
            });
          } catch {
            Alert.alert('No se pudo generar el PDF', 'Intenta de nuevo en un momento.');
          }
        },
      },
    ]);
  }

  return (
    <View style={styles.contenedor}>
      <EncabezadoPromotor titulo="Cierre de jornada" />

      {cargando ? (
        <View style={styles.centrado}>
          <ActivityIndicator size="large" color={COLORES.primario} />
        </View>
      ) : !turno || !resumen ? (
        <View style={styles.centrado}>
          <Text style={styles.vacio}>No tienes un turno abierto hoy.</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.scroll}>
          {meta && (
            <View style={styles.tarjeta}>
              <Text style={styles.tarjetaTitulo}>
                {meta.promotorIds.length > 1 ? 'Meta del día (entre todo el equipo)' : 'Meta del día'}
              </Text>
              <Text style={styles.metaPct}>{meta.progresoPct}%</Text>
              <Text style={styles.metaDetalle}>
                {formatearPesos(meta.totalVendidoHoy)} de {formatearPesos(meta.metaDiaria)} · {meta.puntoNombre}
              </Text>
            </View>
          )}

          <View style={styles.tarjeta}>
            <Text style={styles.tarjetaTitulo}>Resumen del día</Text>
            <View style={styles.filaResumen}>
              <Text style={styles.filaResumenEtiqueta}>Transferencia</Text>
              <Text style={styles.filaResumenValor}>{formatearPesos(resumen.totalTransferencia)}</Text>
            </View>
            <View style={styles.filaResumen}>
              <Text style={styles.filaResumenEtiqueta}>Libranza</Text>
              <Text style={styles.filaResumenValor}>{formatearPesos(resumen.totalLibranza)}</Text>
            </View>
            <View style={[styles.filaResumen, styles.filaResumenDestacada]}>
              <Text style={styles.filaResumenEtiquetaDestacada}>Efectivo esperado</Text>
              <Text style={styles.filaResumenValorDestacado}>{formatearPesos(resumen.efectivoTeorico)}</Text>
            </View>
          </View>

          <View style={styles.tarjeta}>
            <Text style={styles.tarjetaTitulo}>Efectivo contado</Text>
            <Text style={styles.tarjetaDescripcion}>
              Cuenta el efectivo que tienes en tus manos ahora mismo y escríbelo aquí.
            </Text>
            <TextInput
              style={styles.inputEfectivo}
              value={efectivoContadoTexto}
              onChangeText={(texto) => setEfectivoContadoTexto(texto.replace(/\D/g, ''))}
              keyboardType="number-pad"
              placeholder="$ 0"
              placeholderTextColor={COLORES.textoSecundario}
            />
            {diferencia !== null && (
              <Text
                style={[
                  styles.diferenciaTexto,
                  diferencia === 0 ? styles.diferenciaOk : styles.diferenciaError,
                ]}
              >
                {diferencia === 0
                  ? 'Cuadra exacto.'
                  : diferencia > 0
                    ? `Sobran ${formatearPesos(diferencia)}.`
                    : `Faltan ${formatearPesos(Math.abs(diferencia))}.`}
              </Text>
            )}
          </View>

          {sinConteoHoy && (
            <View style={styles.avisoConteo}>
              <Ionicons name="alert-circle-outline" size={16} color={ESTADO_ADMIN.alerta.texto} />
              <Text style={styles.avisoConteoTexto}>Todavía no has hecho tu conteo de cierre hoy.</Text>
            </View>
          )}

          <Pressable
            style={[styles.botonCerrar, (efectivoContado === null || cerrando) && styles.botonDeshabilitado]}
            disabled={efectivoContado === null || cerrando}
            onPress={cerrarTurno}
          >
            {cerrando ? (
              <ActivityIndicator color={COLORES.textoInverso} size="small" />
            ) : (
              <Text style={styles.botonCerrarTexto}>Cerrar turno</Text>
            )}
          </Pressable>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  contenedor: { flex: 1, backgroundColor: COLORES.fondo },
  centrado: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  vacio: {
    ...TEXTO_PROMOTOR.cuerpoSecundario,
    textAlign: 'center',
  },
  scroll: { padding: 16, gap: 12, paddingBottom: 40 },
  tarjeta: {
    backgroundColor: COLORES.superficie,
    borderRadius: RADII_ADMIN.lg,
    padding: 16,
    gap: 8,
    borderWidth: 1,
    borderColor: COLORES.borde,
  },
  tarjetaTitulo: {
    ...TEXTO_PROMOTOR.tituloTarjeta,
    color: COLORES.oscuro,
  },
  tarjetaDescripcion: {
    ...TEXTO_PROMOTOR.nota,
  },
  metaPct: {
    ...TEXTO_PROMOTOR.datoGrande,
    color: COLORES.oscuro,
  },
  metaDetalle: {
    ...TEXTO_PROMOTOR.nota,
  },
  filaResumen: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: COLORES.borde,
  },
  filaResumenDestacada: { borderBottomWidth: 0, paddingTop: 10 },
  filaResumenEtiqueta: {
    ...TEXTO_PROMOTOR.cuerpoSecundario,
  },
  filaResumenValor: {
    ...TEXTO_PROMOTOR.datoDestacado,
    color: COLORES.textoSobreOscuro,
  },
  filaResumenEtiquetaDestacada: {
    ...TEXTO_PROMOTOR.tituloTarjeta,
    color: COLORES.oscuro,
  },
  filaResumenValorDestacado: {
    fontSize: 17,
    fontFamily: TIPOGRAFIA_PROMOTOR.monoSemiNegrita,
    color: COLORES.oscuro,
  },
  inputEfectivo: {
    borderWidth: 1.5,
    borderColor: COLORES.primario,
    borderRadius: RADII_ADMIN.sm,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 18,
    fontFamily: TIPOGRAFIA_PROMOTOR.monoSemiNegrita,
    color: COLORES.textoSobreOscuro,
  },
  diferenciaTexto: { fontSize: 13, fontFamily: TIPOGRAFIA_PROMOTOR.medio },
  diferenciaOk: { color: ESTADO_ADMIN.exito.texto },
  diferenciaError: { color: COLORES.error },
  avisoConteo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: ESTADO_ADMIN.alerta.fondo,
    borderRadius: RADII_ADMIN.sm,
    padding: 12,
  },
  avisoConteoTexto: {
    ...TEXTO_PROMOTOR.nota,
    color: ESTADO_ADMIN.alerta.texto,
    flex: 1,
  },
  botonCerrar: {
    backgroundColor: COLORES.oscuro,
    borderRadius: RADII_ADMIN.md,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 4,
  },
  botonDeshabilitado: { opacity: 0.5 },
  botonCerrarTexto: {
    ...TEXTO_PROMOTOR.boton,
    color: COLORES.textoInverso,
  },
});
