import { StyleSheet, View } from 'react-native';

import { ContenedorAncho } from '@/ui/ContenedorAncho';
import { Encabezado } from '@/ui/Encabezado';
import { PantallaIngresarPedido } from '@/ui/PantallaIngresarPedido';
import { ANCHO_ADMIN, COLORES_ADMIN } from '@/ui/tema';
import { useRequiereSesion } from '@/ui/useRequiereSesion';

export default function IngresarPedidoBodega() {
  const usuario = useRequiereSesion(['BODEGA']);

  if (!usuario) return null;

  return (
    <View style={styles.contenedor}>
      <Encabezado titulo="Ingresar pedido" rutaVolverTexto="Bodega" anchoMaximo={ANCHO_ADMIN.formulario} sinMenuLateral />
      <ContenedorAncho anchoMaximo={ANCHO_ADMIN.formulario} llenarAlto>
        <PantallaIngresarPedido usuarioId={usuario.id} />
      </ContenedorAncho>
    </View>
  );
}

const styles = StyleSheet.create({
  contenedor: {
    flex: 1,
    backgroundColor: COLORES_ADMIN.background,
  },
});
