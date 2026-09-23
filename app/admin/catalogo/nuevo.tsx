import * as Crypto from 'expo-crypto';
import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { getDb } from '@/db/client';
import { getDispositivoId } from '@/db/dispositivo';
import { guardarFotoProducto } from '@/db/fotos';
import { crearProducto } from '@/db/productos';
import { ContenedorAncho } from '@/ui/ContenedorAncho';
import { Encabezado } from '@/ui/Encabezado';
import { FormularioProducto, type ValoresProducto } from '@/ui/FormularioProducto';
import { COLORES_ADMIN } from '@/ui/tema';
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
    <View style={{ flex: 1, backgroundColor: COLORES_ADMIN.background }}>
      <Encabezado titulo="Nuevo producto" rutaVolverTexto="Catálogo" anchoMaximo={640} />
      <ContenedorAncho anchoMaximo={640} llenarAlto>
        <FormularioProducto
          valorInicial={{ nombre: '', precio: 0, fotoUri: null, codigoBarras: null, marca: null, categoriaId: null }}
          colorAcento={COLORES_ADMIN.vino}
          guardando={guardando}
          onGuardar={guardar}
          onGuardarFoto={guardarFoto}
          textoBoton="Agregar al catálogo"
        />
      </ContenedorAncho>
    </View>
  );
}
