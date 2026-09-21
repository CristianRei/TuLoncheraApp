import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { Turno } from '@/core/tipos';
import { getDb } from '@/db/client';
import { listarTurnos } from '@/db/turnos';
import { listarTurnosRemotos } from '@/db/turnosRemotos';
import { COLORES } from '@/ui/colores';
import { ContenedorAncho } from '@/ui/ContenedorAncho';
import { useRequiereSesion } from '@/ui/useRequiereSesion';

function formatearHora(ts: string): string {
  return new Date(ts).toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' });
}

/** Fusiona locales + remotos por id — se prefiere la fila local (más actualizada que lo último sincronizado). */
function fusionarTurnos(locales: Turno[], remotos: Turno[]): Turno[] {
  const porId = new Map(remotos.map((t) => [t.id, t]));
  for (const local of locales) porId.set(local.id, local);
  return [...porId.values()].sort((a, b) => b.horaInicio.localeCompare(a.horaInicio));
}

export default function Turnos() {
  const usuario = useRequiereSesion(['ADMIN']);
  const [turnos, setTurnos] = useState<Turno[]>([]);
  const [cargando, setCargando] = useState(true);
  const [actualizando, setActualizando] = useState(false);
  const insets = useSafeAreaInsets();

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const db = await getDb();
      const locales = await listarTurnos(db);
      setTurnos(locales);
      try {
        const remotos = await listarTurnosRemotos();
        setTurnos(fusionarTurnos(locales, remotos));
      } catch {
        // Sin red o Supabase no disponible — se queda con lo local, sin error visible.
      }
    } finally {
      setCargando(false);
    }
  }, []);

  async function actualizar() {
    setActualizando(true);
    try {
      await cargar();
    } finally {
      setActualizando(false);
    }
  }

  useFocusEffect(
    useCallback(() => {
      cargar();
    }, [cargar])
  );

  if (!usuario) return null;

  return (
    <View style={styles.contenedor}>
      <View style={[styles.encabezado, { paddingTop: insets.top + 20 }]}>
        <ContenedorAncho anchoMaximo={720}>
          <View style={styles.encabezadoFila}>
            <Pressable onPress={() => router.back()}>
              <Text style={styles.volver}>‹ Admin</Text>
            </Pressable>
            <Text style={styles.titulo}>Turnos</Text>
            <Pressable onPress={actualizar} disabled={actualizando}>
              {actualizando ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Text style={styles.volver}>Actualizar</Text>
              )}
            </Pressable>
          </View>
        </ContenedorAncho>
      </View>

      {cargando ? (
        <View style={styles.centrado}>
          <ActivityIndicator size="large" color={COLORES.oscuro} />
        </View>
      ) : turnos.length === 0 ? (
        <View style={styles.centrado}>
          <Text style={styles.vacio}>Todavía no se ha registrado ningún turno.</Text>
        </View>
      ) : (
        <ContenedorAncho anchoMaximo={720} llenarAlto>
          <FlatList
            data={turnos}
            keyExtractor={(t) => t.id}
            contentContainerStyle={styles.lista}
            renderItem={({ item }) => (
              <Pressable style={styles.fila} onPress={() => router.push(`/admin/turnos/${item.id}`)}>
                <View style={styles.filaTexto}>
                  <Text style={styles.filaPromotor}>{item.promotorNombre}</Text>
                  <Text style={styles.filaDetalle}>
                    Inicio: {formatearHora(item.horaInicio)}
                    {item.horaFin ? ` · Fin: ${formatearHora(item.horaFin)}` : ''}
                  </Text>
                </View>
                {!item.horaFin && (
                  <View style={styles.badgeEnCurso}>
                    <Text style={styles.badgeEnCursoTexto}>En curso</Text>
                  </View>
                )}
                <Text style={styles.filaFlecha}>›</Text>
              </Pressable>
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
    backgroundColor: '#FBEDED',
  },
  encabezado: {
    backgroundColor: COLORES.oscuro,
    paddingHorizontal: 20,
    paddingBottom: 16,
  },
  encabezadoFila: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  volver: {
    color: '#FFFFFF',
    fontSize: 14,
    textDecorationLine: 'underline',
  },
  titulo: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '700',
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
    textAlign: 'center',
  },
  lista: {
    padding: 20,
    gap: 12,
  },
  fila: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 14,
    gap: 10,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  filaTexto: {
    flex: 1,
    gap: 2,
  },
  filaPromotor: {
    fontSize: 14,
    fontWeight: '700',
    color: '#333',
  },
  filaDetalle: {
    fontSize: 12,
    color: '#888',
  },
  badgeEnCurso: {
    backgroundColor: '#EAF5EA',
    borderWidth: 1,
    borderColor: '#C3E3C3',
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  badgeEnCursoTexto: {
    fontSize: 11,
    fontWeight: '700',
    color: '#2E7D32',
  },
  filaFlecha: {
    fontSize: 20,
    color: COLORES.oscuro,
  },
});
