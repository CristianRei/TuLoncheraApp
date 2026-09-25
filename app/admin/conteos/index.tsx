import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, View } from 'react-native';

import type { Conteo } from '@/core/tipos';
import { getDb } from '@/db/client';
import { listarConteos } from '@/db/conteos';
import { ContenedorAncho } from '@/ui/ContenedorAncho';
import { Encabezado } from '@/ui/Encabezado';
import { EmptyState } from '@/ui/EmptyState';
import { ListRow } from '@/ui/ListRow';
import { ANCHO_ADMIN, COLORES_ADMIN, ESPACIADO_ADMIN } from '@/ui/tema';
import { useRequiereSesion } from '@/ui/useRequiereSesion';

function formatearFecha(tsCliente: string): string {
  const fecha = new Date(tsCliente);
  return fecha.toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' });
}

export default function Conteos() {
  const usuario = useRequiereSesion(['ADMIN']);
  const [conteos, setConteos] = useState<Conteo[]>([]);
  const [cargando, setCargando] = useState(true);

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const db = await getDb();
      setConteos(await listarConteos(db));
    } finally {
      setCargando(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      cargar();
    }, [cargar])
  );

  if (!usuario) return null;

  return (
    <View style={styles.contenedor}>
      <Encabezado titulo="Conteos de cierre" rutaVolverTexto="Admin" />

      {cargando ? (
        <View style={styles.centrado}>
          <ActivityIndicator size="large" color={COLORES_ADMIN.vino} />
        </View>
      ) : conteos.length === 0 ? (
        <EmptyState icono="clipboard-outline" mensaje="Todavía no se ha registrado ningún conteo de cierre." />
      ) : (
        <ContenedorAncho anchoMaximo={ANCHO_ADMIN.lista} llenarAlto>
          <FlatList
            data={conteos}
            keyExtractor={(c) => c.id}
            contentContainerStyle={styles.lista}
            renderItem={({ item }) => (
              <ListRow
                titulo={item.promotorNombre}
                subtitulo={formatearFecha(item.tsCliente)}
                onPress={() => router.push(`/admin/conteos/${item.id}`)}
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
