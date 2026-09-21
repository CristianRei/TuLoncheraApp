import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { Promotor } from '@/core/tipos';
import { getDb } from '@/db/client';
import {
  actualizarPromotor,
  eliminarPromotor,
  eliminarPromotorPermanente,
  obtenerPromotor,
  PinDuplicadoError,
  PromotorConHistorialError,
} from '@/db/promotores';
import { COLORES } from '@/ui/colores';
import { ContenedorAncho } from '@/ui/ContenedorAncho';
import { FormularioPromotor, type ValoresPromotor } from '@/ui/FormularioPromotor';
import { useRequiereSesion } from '@/ui/useRequiereSesion';

export default function EditarPromotor() {
  const usuario = useRequiereSesion(['ADMIN']);
  const { id } = useLocalSearchParams<{ id: string }>();
  const [promotor, setPromotor] = useState<Promotor | null>(null);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [eliminando, setEliminando] = useState(false);
  const [eliminandoPermanente, setEliminandoPermanente] = useState(false);
  const [errorPin, setErrorPin] = useState<string | null>(null);
  const insets = useSafeAreaInsets();

  useEffect(() => {
    (async () => {
      const db = await getDb();
      setPromotor(await obtenerPromotor(db, id));
      setCargando(false);
    })();
  }, [id]);

  if (!usuario) return null;

  async function guardar(valores: ValoresPromotor, pinManual: string | null) {
    setGuardando(true);
    try {
      const db = await getDb();
      await actualizarPromotor(db, id, {
        nombre: valores.nombre,
        cedula: valores.cedula,
        celular: valores.celular,
        direccion: valores.direccion,
        pinManual,
      });
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

  function confirmarEliminar() {
    if (!promotor) return;
    Alert.alert(
      'Dar de baja al promotor',
      `¿Seguro que quieres dar de baja a "${promotor.nombre}"? Ya no va a poder iniciar sesión, pero sus ventas y movimientos pasados se conservan. Puedes revertirlo desde soporte si fue un error.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Dar de baja',
          style: 'destructive',
          onPress: async () => {
            setEliminando(true);
            try {
              const db = await getDb();
              await eliminarPromotor(db, promotor.id);
              router.back();
            } finally {
              setEliminando(false);
            }
          },
        },
      ]
    );
  }

  function confirmarEliminarPermanente() {
    if (!promotor) return;
    Alert.alert(
      'Eliminar definitivamente',
      `Esto borra a "${promotor.nombre}" por completo de la base de datos, incluyendo su cédula y su PIN — no se puede deshacer. Solo funciona si nunca tuvo ventas, turnos, cargues ni otro movimiento registrado.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar para siempre',
          style: 'destructive',
          onPress: async () => {
            setEliminandoPermanente(true);
            try {
              const db = await getDb();
              await eliminarPromotorPermanente(db, promotor.id);
              router.back();
            } catch (error) {
              if (error instanceof PromotorConHistorialError) {
                Alert.alert('No se pudo eliminar', error.message);
              } else {
                throw error;
              }
            } finally {
              setEliminandoPermanente(false);
            }
          },
        },
      ]
    );
  }

  return (
    <View style={styles.contenedor}>
      <View style={[styles.encabezado, { paddingTop: insets.top + 20 }]}>
        <ContenedorAncho anchoMaximo={640} style={styles.encabezadoContenido}>
          <Pressable onPress={() => router.back()}>
            <Text style={styles.volver}>‹ Promotores</Text>
          </Pressable>
          <Text style={styles.titulo}>Editar promotor</Text>
        </ContenedorAncho>
      </View>

      {cargando ? (
        <View style={styles.centrado}>
          <ActivityIndicator size="large" color={COLORES.oscuro} />
        </View>
      ) : !promotor ? (
        <View style={styles.centrado}>
          <Text style={styles.vacio}>Este promotor ya no existe.</Text>
        </View>
      ) : (
        <ContenedorAncho anchoMaximo={640} llenarAlto>
          <FormularioPromotor
            valorInicial={{
              nombre: promotor.nombre,
              cedula: promotor.cedula ?? '',
              celular: promotor.celular,
              direccion: promotor.direccion,
            }}
            pinVigente={promotor.pin}
            colorAcento={COLORES.oscuro}
            guardando={guardando}
            errorPin={errorPin}
            onGuardar={guardar}
            textoBoton="Guardar cambios"
            extra={
              !promotor.activo ? (
                <>
                  <Text style={styles.avisoInactivo}>Este promotor está dado de baja.</Text>
                  <Pressable
                    style={[styles.botonEliminarPermanente, eliminandoPermanente && styles.botonDeshabilitado]}
                    onPress={confirmarEliminarPermanente}
                    disabled={eliminandoPermanente}
                  >
                    {eliminandoPermanente ? (
                      <ActivityIndicator color="#FFFFFF" size="small" />
                    ) : (
                      <Text style={styles.botonEliminarPermanenteTexto}>Eliminar definitivamente</Text>
                    )}
                  </Pressable>
                </>
              ) : (
                <Pressable
                  style={[styles.botonEliminar, eliminando && styles.botonDeshabilitado]}
                  onPress={confirmarEliminar}
                  disabled={eliminando}
                >
                  {eliminando ? (
                    <ActivityIndicator color="#B00020" size="small" />
                  ) : (
                    <Text style={styles.botonEliminarTexto}>Dar de baja</Text>
                  )}
                </Pressable>
              )
            }
          />
        </ContenedorAncho>
      )}
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
  encabezadoContenido: {
    gap: 4,
  },
  volver: {
    color: '#FFFFFF',
    fontSize: 14,
    textDecorationLine: 'underline',
  },
  titulo: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '700',
  },
  centrado: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  vacio: {
    fontSize: 14,
    color: '#888',
  },
  botonEliminar: {
    marginTop: 4,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#B00020',
  },
  botonEliminarTexto: {
    fontSize: 14,
    fontWeight: '700',
    color: '#B00020',
  },
  botonDeshabilitado: {
    opacity: 0.5,
  },
  avisoInactivo: {
    marginTop: 4,
    fontSize: 13,
    color: '#888',
    fontStyle: 'italic',
    textAlign: 'center',
  },
  botonEliminarPermanente: {
    marginTop: 10,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    backgroundColor: '#B00020',
  },
  botonEliminarPermanenteTexto: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});
