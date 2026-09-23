import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, View } from 'react-native';

import type { Turno } from '@/core/tipos';
import { getDb } from '@/db/client';
import { listarTurnos } from '@/db/turnos';
import { listarTurnosRemotos } from '@/db/turnosRemotos';
import { ContenedorAncho } from '@/ui/ContenedorAncho';
import { Encabezado } from '@/ui/Encabezado';
import { EmptyState } from '@/ui/EmptyState';
import { ListRow } from '@/ui/ListRow';
import { COLORES_ADMIN, ESPACIADO_ADMIN } from '@/ui/tema';
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
      <Encabezado
        titulo="Turnos"
        rutaVolverTexto="Admin"
        accion={{ icono: 'refresh', onPress: actualizar }}
      />

      {actualizando && (
        <View style={styles.actualizandoAviso}>
          <ActivityIndicator size="small" color={COLORES_ADMIN.vino} />
        </View>
      )}

      {cargando ? (
        <View style={styles.centrado}>
          <ActivityIndicator size="large" color={COLORES_ADMIN.vino} />
        </View>
      ) : turnos.length === 0 ? (
        <EmptyState icono="time-outline" mensaje="Todavía no se ha registrado ningún turno." />
      ) : (
        <ContenedorAncho anchoMaximo={720} llenarAlto>
          <FlatList
            data={turnos}
            keyExtractor={(t) => t.id}
            contentContainerStyle={styles.lista}
            renderItem={({ item }) => (
              <ListRow
                titulo={item.promotorNombre}
                subtitulo={`Inicio: ${formatearHora(item.horaInicio)}${
                  item.horaFin ? ` · Fin: ${formatearHora(item.horaFin)}` : ''
                }`}
                badge={!item.horaFin ? 'En curso' : undefined}
                onPress={() => router.push(`/admin/turnos/${item.id}`)}
              />
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
  actualizandoAviso: {
    paddingHorizontal: ESPACIADO_ADMIN.xl,
    paddingTop: ESPACIADO_ADMIN.sm,
  },
  centrado: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: ESPACIADO_ADMIN.xxl,
  },
  lista: {
    padding: ESPACIADO_ADMIN.xl,
    gap: ESPACIADO_ADMIN.md,
  },
});
