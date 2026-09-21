import * as Crypto from 'expo-crypto';
import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { getDb } from '@/db/client';
import { getDispositivoId } from '@/db/dispositivo';
import { guardarFotoProducto } from '@/db/fotos';
import { crearProducto } from '@/db/productos';
import { COLORES } from '@/ui/colores';
import { ContenedorAncho } from '@/ui/ContenedorAncho';
import { FormularioProducto, type ValoresProducto } from '@/ui/FormularioProducto';
import { useRequiereSesion } from '@/ui/useRequiereSesion';

export default function NuevoProducto() {
  const usuario = useRequiereSesion(['ADMIN']);
  const [idNuevo] = useState(() => Crypto.randomUUID());
  const [guardando, setGuardando] = useState(false);
  const insets = useSafeAreaInsets();

  if (!usuario) return null;

  async function guardarFoto(uriOrigen: string): Promise<string> {
    return guardarFotoProducto(uriOrigen, idNuevo);
  }

  async function guardar(valores: ValoresProducto) {
    setGuardando(true);
    try {
      const db = await getDb();
      const dispositivoId = await getDispositivoId(db);
      await crearProducto(db, valores, dispositivoId, idNuevo);
      router.back();
    } finally {
      setGuardando(false);
    }
  }

  return (
    <View style={styles.contenedor}>
      <View style={[styles.encabezado, { paddingTop: insets.top + 20 }]}>
        <ContenedorAncho anchoMaximo={640}>
          <Text style={styles.titulo}>Nuevo producto</Text>
        </ContenedorAncho>
      </View>
      <ContenedorAncho anchoMaximo={640} llenarAlto>
        <FormularioProducto
          valorInicial={{ nombre: '', precio: 0, fotoUri: null, codigoBarras: null, marca: null, categoriaId: null }}
          colorAcento={COLORES.oscuro}
          guardando={guardando}
          onGuardar={guardar}
          onGuardarFoto={guardarFoto}
          textoBoton="Agregar al catálogo"
        />
      </ContenedorAncho>
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
  titulo: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '700',
  },
});
