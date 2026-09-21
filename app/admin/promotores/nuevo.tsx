import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { getDb } from '@/db/client';
import { getDispositivoId } from '@/db/dispositivo';
import { crearPromotor, PinDuplicadoError } from '@/db/promotores';
import { COLORES } from '@/ui/colores';
import { ContenedorAncho } from '@/ui/ContenedorAncho';
import { FormularioPromotor, type ValoresPromotor } from '@/ui/FormularioPromotor';
import { useRequiereSesion } from '@/ui/useRequiereSesion';

export default function NuevoPromotor() {
  const usuario = useRequiereSesion(['ADMIN']);
  const [guardando, setGuardando] = useState(false);
  const [errorPin, setErrorPin] = useState<string | null>(null);
  const insets = useSafeAreaInsets();

  if (!usuario) return null;

  async function guardar(valores: ValoresPromotor, pinManual: string | null) {
    setGuardando(true);
    try {
      const db = await getDb();
      const dispositivoId = await getDispositivoId(db);
      await crearPromotor(
        db,
        {
          nombre: valores.nombre,
          cedula: valores.cedula,
          celular: valores.celular,
          direccion: valores.direccion,
          pinManual,
        },
        dispositivoId
      );
      router.back();
    } catch (error) {
      if (error instanceof PinDuplicadoError) {
        setErrorPin(error.pin);
      } else {
        throw error;
      }
    } finally {
      setGuardando(false);
    }
  }

  return (
    <View style={styles.contenedor}>
      <View style={[styles.encabezado, { paddingTop: insets.top + 20 }]}>
        <ContenedorAncho anchoMaximo={640}>
          <Text style={styles.titulo}>Nuevo promotor</Text>
        </ContenedorAncho>
      </View>
      <ContenedorAncho anchoMaximo={640} llenarAlto>
        <FormularioPromotor
          valorInicial={{ nombre: '', cedula: '', celular: null, direccion: null }}
          colorAcento={COLORES.oscuro}
          guardando={guardando}
          errorPin={errorPin}
          onGuardar={guardar}
          textoBoton="Agregar promotor"
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
