import * as Crypto from 'expo-crypto';
import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { getDb } from '@/db/client';
import { getDispositivoId } from '@/db/dispositivo';
import { guardarFotoProducto } from '@/db/fotos';
import { crearProducto } from '@/db/productos';
import { COLORES } from '@/ui/colores';
import { FormularioProducto, type ValoresProducto } from '@/ui/FormularioProducto';
import { useRequiereSesion } from '@/ui/useRequiereSesion';

export default function NuevoProducto() {
  const usuario = useRequiereSesion(['ADMIN']);
  const [idNuevo] = useState(() => Crypto.randomUUID());
  const [guardando, setGuardando] = useState(false);

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
      <View style={styles.encabezado}>
        <Text style={styles.titulo}>Nuevo producto</Text>
      </View>
      <FormularioProducto
        valorInicial={{ nombre: '', precio: 0, fotoUri: null }}
        colorAcento={COLORES.oscuro}
        guardando={guardando}
        onGuardar={guardar}
        onGuardarFoto={guardarFoto}
        textoBoton="Agregar al catálogo"
      />
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
    paddingTop: 64,
    paddingHorizontal: 20,
    paddingBottom: 16,
  },
  titulo: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '700',
  },
});
