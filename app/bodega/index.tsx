import { router } from 'expo-router';
import { ScrollView, StyleSheet, View } from 'react-native';

import { ContenedorAncho } from '@/ui/ContenedorAncho';
import { EncabezadoInicio } from '@/ui/EncabezadoInicio';
import { useSesion } from '@/ui/SesionContext';
import { TarjetaModulo } from '@/ui/TarjetaModulo';
import { ANCHO_ADMIN, COLORES_ADMIN, ESPACIADO_ADMIN } from '@/ui/tema';
import { useEsPantallaAncha } from '@/ui/useEsPantallaAncha';
import { useRequiereSesion } from '@/ui/useRequiereSesion';

export default function HomeBodega() {
  const usuario = useRequiereSesion(['BODEGA']);
  const { cerrarSesion } = useSesion();
  const anchaPantalla = useEsPantallaAncha();

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
