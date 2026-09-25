import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { listarCarguesPendientes } from '@/db/cargues';
import { getDb } from '@/db/client';
import { listarTrasladosPendientes } from '@/db/traslados';
import { ContenedorAncho } from '@/ui/ContenedorAncho';
import { EncabezadoInicio } from '@/ui/EncabezadoInicio';
import { useSesion } from '@/ui/SesionContext';
import { TarjetaModulo } from '@/ui/TarjetaModulo';
import { ANCHO_ADMIN, COLORES_ADMIN, ESPACIADO_ADMIN } from '@/ui/tema';
import { useEsPantallaAncha } from '@/ui/useEsPantallaAncha';
import { useRequiereSesion } from '@/ui/useRequiereSesion';
import { useRecargarConDatosNuevos } from '@/ui/useVersionDatos';

export default function HomeBodega() {
  const usuario = useRequiereSesion(['BODEGA']);
  const { cerrarSesion } = useSesion();
  const anchaPantalla = useEsPantallaAncha();
  const [pendientes, setPendientes] = useState<number | null>(null);

  const contarPendientes = useCallback(async () => {
    const db = await getDb();
    const [cargues, traslados] = await Promise.all([listarCarguesPendientes(db), listarTrasladosPendientes(db)]);
    setPendientes(cargues.length + traslados.length);
  }, []);

  useFocusEffect(
    useCallback(() => {
      contarPendientes();
    }, [contarPendientes])
  );
  useRecargarConDatosNuevos(contarPendientes);

  if (!usuario) return null;

  function salir() {
    cerrarSesion();
    router.replace('/');
  }

  return (
    <View style={styles.contenedor}>
      <EncabezadoInicio rol="Bodega" titulo={usuario.nombre} onCerrarSesion={salir} anchoMaximo={ANCHO_ADMIN.lista} />

      <ScrollView contentContainerStyle={styles.scroll}>
        <ContenedorAncho anchoMaximo={ANCHO_ADMIN.lista}>
          <View style={[styles.grilla, anchaPantalla && styles.grillaAncha]}>
            <TarjetaModulo
              icono="arrow-down-circle-outline"
              titulo="Ingresar pedido"
              descripcion="Registra lo que llegó a bodega."
              ancha={anchaPantalla}
              onPress={() => router.push('/bodega/pedido')}
            />
            <TarjetaModulo
              icono="arrow-up-circle-outline"
              titulo="Entregar cargues"
              descripcion="Entrega a cada promotor lo que admin ya planeó."
              badge={pendientes ? `${pendientes} por entregar` : undefined}
              destacada
              ancha={anchaPantalla}
              onPress={() => router.push('/bodega/cargues')}
            />
            <TarjetaModulo
              icono="notifications-outline"
              titulo="Notificaciones"
              descripcion="Mensajes que te envió el administrador."
              ancha={anchaPantalla}
              onPress={() => router.push('/bodega/notificaciones')}
            />
          </View>
        </ContenedorAncho>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  contenedor: {
    flex: 1,
    backgroundColor: COLORES_ADMIN.background,
  },
  scroll: {
    paddingTop: ESPACIADO_ADMIN.xl,
    paddingBottom: 40,
  },
  grilla: {
    paddingHorizontal: ESPACIADO_ADMIN.xl,
    gap: ESPACIADO_ADMIN.md,
  },
  grillaAncha: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
});
