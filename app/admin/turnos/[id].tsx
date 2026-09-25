import { useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Image, Linking, Pressable, StyleSheet, Text, View } from 'react-native';

import { fechaBogota, fechaHoyBogota } from '@/core/analitica';
import { formatearPesos } from '@/core/dinero';
import type { ArqueoCaja, Evento, Turno } from '@/core/tipos';
import { obtenerArqueoPorTurno } from '@/db/arqueos';
import { obtenerArqueoRemotoPorTurno } from '@/db/arqueosRemotos';
import { getDb } from '@/db/client';
import { obtenerEventoDeHoyPromotor, obtenerTurno } from '@/db/turnos';
import { listarTurnosRemotos } from '@/db/turnosRemotos';
import { ContenedorAncho } from '@/ui/ContenedorAncho';
import { Encabezado } from '@/ui/Encabezado';
import { ANCHO_ADMIN, COLORES_ADMIN } from '@/ui/tema';
import { useRequiereSesion } from '@/ui/useRequiereSesion';
import { useRecargarConDatosNuevos } from '@/ui/useVersionDatos';

function formatearFecha(ts: string): string {
  return new Date(ts).toLocaleString('es-CO', { dateStyle: 'long', timeStyle: 'short' });
}

function urlGoogleMaps(latitud: number, longitud: number): string {
  return `https://www.google.com/maps?q=${latitud},${longitud}`;
}

function EnlaceUbicacion({ latitud, longitud }: { latitud: number; longitud: number }) {
  return (
    <Pressable onPress={() => Linking.openURL(urlGoogleMaps(latitud, longitud))}>
      <Text style={styles.resumenUbicacionLink}>
        Ver ubicación en Google Maps ({latitud.toFixed(5)}, {longitud.toFixed(5)})
      </Text>
    </Pressable>
  );
}

export default function DetalleTurno() {
  const usuario = useRequiereSesion(['ADMIN']);
  const { id } = useLocalSearchParams<{ id: string }>();
  const [turno, setTurno] = useState<Turno | null>(null);
  const [eventoDelDia, setEventoDelDia] = useState<Evento | null>(null);
  const [arqueo, setArqueo] = useState<ArqueoCaja | null>(null);
  const [cargando, setCargando] = useState(true);

  const cargar = useCallback(async () => {
    const db = await getDb();
    let encontrado: Turno | null = await obtenerTurno(db, id);
    if (!encontrado) {
      // No está en este dispositivo — puede ser un turno originado en otro.
      try {
        const remotos = await listarTurnosRemotos();
        encontrado = remotos.find((t) => t.id === id) ?? null;
      } catch {
        encontrado = null;
      }
    }
    setTurno(encontrado);

    // Solo se cruza con el calendario si el turno es de hoy — no hay
    // forma de resolver "evento de una fecha pasada" sin construir una
    // función nueva, fuera de alcance de esta rebanada informativa.
    if (encontrado && fechaBogota(encontrado.horaInicio) === fechaHoyBogota()) {
      setEventoDelDia(await obtenerEventoDeHoyPromotor(db, encontrado.promotorId));
    }

    if (encontrado?.horaFin) {
      let arqueoEncontrado = await obtenerArqueoPorTurno(db, id);
      if (!arqueoEncontrado) {
        try {
          arqueoEncontrado = await obtenerArqueoRemotoPorTurno(id);
        } catch {
          arqueoEncontrado = null;
        }
      }
      setArqueo(arqueoEncontrado);
    }
    setCargando(false);
  }, [id]);

  useEffect(() => {
    (async () => {
      await cargar();
    })();
  }, [cargar]);
  // Si el turno sigue en curso, el admin ve el cierre y el arqueo de caja
  // aparecer solos apenas el promotor cierra desde su celular (Realtime).
  useRecargarConDatosNuevos(cargar);

  if (!usuario) return null;

  return (
    <View style={styles.contenedor}>
      <Encabezado titulo="Detalle del turno" rutaVolverTexto="Turnos" />

      {cargando ? (
        <View style={styles.centrado}>
          <ActivityIndicator size="large" color={COLORES_ADMIN.vino} />
        </View>
      ) : !turno ? (
        <View style={styles.centrado}>
          <Text style={styles.vacio}>Este turno ya no existe.</Text>
        </View>
      ) : (
        <ContenedorAncho anchoMaximo={ANCHO_ADMIN.lista} llenarAlto>
          <View style={styles.contenido}>
            <Image source={{ uri: turno.selfieUri }} style={styles.selfie} />

            <View style={styles.resumen}>
              <Text style={styles.resumenPromotor}>{turno.promotorNombre}</Text>
              <Text style={styles.resumenDetalle}>Inicio: {formatearFecha(turno.horaInicio)}</Text>
              <Text style={styles.resumenDetalle}>
                {turno.horaFin ? `Fin: ${formatearFecha(turno.horaFin)}` : 'Turno en curso'}
              </Text>
              {turno.latitud !== null && turno.longitud !== null ? (
                <EnlaceUbicacion latitud={turno.latitud} longitud={turno.longitud} />
              ) : (
                <Text style={styles.resumenDetalle}>Sin ubicación registrada</Text>
              )}
            </View>

            {eventoDelDia && (
              <View style={styles.chipEvento}>
                <Text style={styles.chipEventoTitulo}>Evento del calendario hoy</Text>
                <Text style={styles.chipEventoTexto}>
                  {eventoDelDia.empresaNombre} · {eventoDelDia.puntoNombre}
                </Text>
              </View>
            )}

            {arqueo && (
              <View style={styles.resumen}>
                <Text style={styles.resumenPromotor}>Arqueo de caja</Text>
                <View style={styles.filaArqueo}>
                  <Text style={styles.resumenDetalle}>Transferencia</Text>
                  <Text style={styles.filaArqueoValor}>{formatearPesos(arqueo.totalTransferencia)}</Text>
                </View>
                <View style={styles.filaArqueo}>
                  <Text style={styles.resumenDetalle}>Libranza</Text>
                  <Text style={styles.filaArqueoValor}>{formatearPesos(arqueo.totalLibranza)}</Text>
                </View>
                <View style={styles.filaArqueo}>
                  <Text style={styles.resumenDetalle}>Efectivo esperado</Text>
                  <Text style={styles.filaArqueoValor}>{formatearPesos(arqueo.efectivoTeorico)}</Text>
                </View>
                <View style={styles.filaArqueo}>
                  <Text style={styles.resumenDetalle}>Efectivo contado</Text>
                  <Text style={styles.filaArqueoValor}>{formatearPesos(arqueo.efectivoContado)}</Text>
                </View>
                <View style={styles.filaArqueo}>
                  <Text style={[styles.resumenDetalle, styles.filaArqueoEtiquetaDestacada]}>Diferencia</Text>
                  <Text
                    style={[
                      styles.filaArqueoValor,
                      styles.filaArqueoValorDestacado,
                      arqueo.diferencia !== 0 && styles.filaArqueoValorDescuadre,
                    ]}
                  >
                    {arqueo.diferencia === 0 ? 'Cuadrado' : formatearPesos(arqueo.diferencia)}
                  </Text>
                </View>
              </View>
            )}
          </View>
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
    color: '#888',
  },
  contenido: {
    padding: 20,
    gap: 16,
  },
  selfie: {
    width: '100%',
    height: 320,
    borderRadius: 16,
    backgroundColor: '#F0F0F0',
  },
  resumen: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 16,
    gap: 4,
  },
  resumenPromotor: {
    fontSize: 16,
    fontWeight: '700',
    color: '#333',
  },
  resumenDetalle: {
    fontSize: 13,
    color: '#777',
  },
  resumenUbicacionLink: {
    fontSize: 13,
    color: COLORES_ADMIN.vino,
    fontWeight: '600',
    textDecorationLine: 'underline',
  },
  filaArqueo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  filaArqueoValor: {
    fontSize: 13,
    fontWeight: '600',
    color: '#333',
  },
  filaArqueoEtiquetaDestacada: {
    fontWeight: '700',
    color: '#333',
  },
  filaArqueoValorDestacado: {
    fontSize: 14,
    fontWeight: '700',
  },
  filaArqueoValorDescuadre: {
    color: '#B00020',
  },
  chipEvento: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 16,
    gap: 2,
  },
  chipEventoTitulo: {
    fontSize: 11,
    fontWeight: '700',
    color: '#888',
    textTransform: 'uppercase',
  },
  chipEventoTexto: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
  },
});
