import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import type { Rol } from '@/core/tipos';
import { getDb } from '@/db/client';
import { getDispositivoId } from '@/db/dispositivo';
import { crearPersona, PinDuplicadoError } from '@/db/personal';
import { ContenedorAncho } from '@/ui/ContenedorAncho';
import { Encabezado } from '@/ui/Encabezado';
import { FilterTabs } from '@/ui/FilterTabs';
import { FormularioPersona, type ValoresPersona } from '@/ui/FormularioPersona';
import { COLORES_ADMIN, ESPACIADO_ADMIN, TIPOGRAFIA_ADMIN } from '@/ui/tema';
import { useRequiereSesion } from '@/ui/useRequiereSesion';

const OPCIONES_ROL: { valor: Rol; etiqueta: string }[] = [
  { valor: 'PROMOTOR', etiqueta: 'Promotor' },
  { valor: 'CONDUCTOR', etiqueta: 'Conductor' },
  { valor: 'BODEGA', etiqueta: 'Bodega' },
  { valor: 'ADMIN', etiqueta: 'Administrador' },
];

const TITULO_BOTON: Record<Rol, string> = {
  PROMOTOR: 'Agregar promotor',
  CONDUCTOR: 'Agregar conductor',
  BODEGA: 'Agregar persona de bodega',
  ADMIN: 'Agregar administrador',
};

export default function NuevoPersonal() {
  const usuario = useRequiereSesion(['ADMIN']);
  const [rol, setRol] = useState<Rol | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [errorPin, setErrorPin] = useState<string | null>(null);

  if (!usuario) return null;
  const usuarioActual = usuario;

  async function guardar(valores: ValoresPersona, pinManual: string | null) {
    if (!rol) return;
    setGuardando(true);
    try {
      const db = await getDb();
      const dispositivoId = await getDispositivoId(db);
      await crearPersona(
        db,
        {
          nombre: valores.nombre,
          rol,
          cedula: valores.cedula || null,
          celular: valores.celular,
          direccion: valores.direccion,
          pinManual,
        },
        dispositivoId,
        usuarioActual.id
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
      <Encabezado titulo="Nueva persona" rutaVolverTexto="Personal" anchoMaximo={640} />

      <ContenedorAncho anchoMaximo={640} llenarAlto>
        <View style={styles.selectorRol}>
          <Text style={styles.selectorRolEtiqueta}>¿Qué rol va a tener?</Text>
          <FilterTabs opciones={OPCIONES_ROL} valorActivo={rol} onCambiar={setRol} />
        </View>

        {rol && (
          <FormularioPersona
            key={rol}
            rol={rol}
            valorInicial={{ nombre: '', cedula: '', celular: null, direccion: null }}
            colorAcento={COLORES_ADMIN.vino}
            guardando={guardando}
            errorPin={errorPin}
            onGuardar={guardar}
            textoBoton={TITULO_BOTON[rol]}
          />
        )}
      </ContenedorAncho>
    </View>
  );
}

const styles = StyleSheet.create({
  contenedor: {
    flex: 1,
    backgroundColor: COLORES_ADMIN.background,
  },
  selectorRol: {
    padding: ESPACIADO_ADMIN.xl,
    paddingBottom: 0,
    gap: ESPACIADO_ADMIN.md,
  },
  selectorRolEtiqueta: {
    fontSize: 13,
    fontFamily: TIPOGRAFIA_ADMIN.semiNegrita,
    color: COLORES_ADMIN.textoSecundario,
  },
});
