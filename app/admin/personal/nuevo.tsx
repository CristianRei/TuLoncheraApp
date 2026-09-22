import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { Rol } from '@/core/tipos';
import { getDb } from '@/db/client';
import { getDispositivoId } from '@/db/dispositivo';
import { crearPersona, PinDuplicadoError } from '@/db/personal';
import { COLORES } from '@/ui/colores';
import { ContenedorAncho } from '@/ui/ContenedorAncho';
import { FormularioPersona, type ValoresPersona } from '@/ui/FormularioPersona';
import { useEsPantallaAncha } from '@/ui/useEsPantallaAncha';
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
  const insets = useSafeAreaInsets();
  const anchaPantalla = useEsPantallaAncha();

  if (!usuario) return null;

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
      <View
        style={[
          anchaPantalla ? styles.encabezadoAncho : styles.encabezado,
          { paddingTop: anchaPantalla ? 20 : insets.top + 20 },
        ]}
      >
        <ContenedorAncho anchoMaximo={640}>
          <Text style={anchaPantalla ? styles.tituloAncho : styles.titulo}>Nueva persona</Text>
        </ContenedorAncho>
      </View>

      <ContenedorAncho anchoMaximo={640} llenarAlto>
        <View style={styles.selectorRol}>
          <Text style={styles.selectorRolEtiqueta}>¿Qué rol va a tener?</Text>
          <View style={styles.chipsRol}>
            {OPCIONES_ROL.map((opcion) => (
              <Pressable
                key={opcion.valor}
                style={[styles.chipRol, rol === opcion.valor && styles.chipRolActivo]}
                onPress={() => setRol(opcion.valor)}
              >
                <Text style={[styles.chipRolTexto, rol === opcion.valor && styles.chipRolTextoActivo]}>
                  {opcion.etiqueta}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        {rol && (
          <FormularioPersona
            key={rol}
            rol={rol}
            valorInicial={{ nombre: '', cedula: '', celular: null, direccion: null }}
            colorAcento={COLORES.oscuro}
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
    backgroundColor: '#FBEDED',
  },
  encabezado: {
    backgroundColor: COLORES.oscuro,
    paddingHorizontal: 20,
    paddingBottom: 16,
  },
  encabezadoAncho: {
    backgroundColor: 'transparent',
    paddingHorizontal: 20,
    paddingBottom: 16,
  },
  titulo: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '700',
  },
  tituloAncho: {
    color: COLORES.oscuro,
    fontSize: 20,
    fontWeight: '700',
  },
  selectorRol: {
    padding: 20,
    paddingBottom: 0,
    gap: 10,
  },
  selectorRolEtiqueta: {
    fontSize: 13,
    fontWeight: '600',
    color: '#555',
  },
  chipsRol: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chipRol: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#EBD3D3',
  },
  chipRolActivo: {
    backgroundColor: COLORES.oscuro,
    borderColor: COLORES.oscuro,
  },
  chipRolTexto: {
    fontSize: 13,
    fontWeight: '600',
    color: '#666',
  },
  chipRolTextoActivo: {
    color: '#FFFFFF',
  },
});
