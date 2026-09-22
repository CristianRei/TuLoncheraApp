import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { modoPinParaRol, pinManualValido } from '@/core/pin';
import type { Persona, Rol } from '@/core/tipos';
import { getDb } from '@/db/client';
import {
  actualizarPersona,
  cambiarRolPersona,
  CedulaRequeridaError,
  eliminarPersona,
  eliminarPersonaPermanente,
  obtenerPersona,
  PersonaConHistorialError,
  PinDuplicadoError,
} from '@/db/personal';
import { COLORES } from '@/ui/colores';
import { ContenedorAncho } from '@/ui/ContenedorAncho';
import { FormularioPersona, type ValoresPersona } from '@/ui/FormularioPersona';
import { ModalConfirmacion } from '@/ui/ModalConfirmacion';
import { useEsPantallaAncha } from '@/ui/useEsPantallaAncha';
import { useRequiereSesion } from '@/ui/useRequiereSesion';

const ETIQUETA_ROL: Record<Rol, string> = {
  PROMOTOR: 'Promotor',
  CONDUCTOR: 'Conductor',
  BODEGA: 'Bodega',
  ADMIN: 'Administrador',
};

const OPCIONES_ROL: Rol[] = ['PROMOTOR', 'CONDUCTOR', 'BODEGA', 'ADMIN'];

export default function EditarPersona() {
  const usuario = useRequiereSesion(['ADMIN']);
  const { id } = useLocalSearchParams<{ id: string }>();
  const [promotor, setPromotor] = useState<Persona | null>(null);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [eliminando, setEliminando] = useState(false);
  const [eliminandoPermanente, setEliminandoPermanente] = useState(false);
  const [errorPin, setErrorPin] = useState<string | null>(null);
  const [modalBajaVisible, setModalBajaVisible] = useState(false);
  const [modalPermanenteVisible, setModalPermanenteVisible] = useState(false);
  const [errorEliminarPermanente, setErrorEliminarPermanente] = useState<string | null>(null);
  const [rolPropuesto, setRolPropuesto] = useState<Rol | null>(null);
  const [cedulaCambioRol, setCedulaCambioRol] = useState('');
  const [pinCambioRol, setPinCambioRol] = useState('');
  const [errorCambioRol, setErrorCambioRol] = useState<string | null>(null);
  const [cambiandoRol, setCambiandoRol] = useState(false);
  const insets = useSafeAreaInsets();
  const anchaPantalla = useEsPantallaAncha();

  async function recargar() {
    const db = await getDb();
    setPromotor(await obtenerPersona(db, id));
  }

  useEffect(() => {
    (async () => {
      await recargar();
      setCargando(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (!usuario) return null;

  function abrirCambioRol(nuevoRol: Rol) {
    if (!promotor || nuevoRol === promotor.rol) return;
    setRolPropuesto(nuevoRol);
    setCedulaCambioRol(promotor.cedula ?? '');
    setPinCambioRol('');
    setErrorCambioRol(null);
  }

  async function confirmarCambioRol() {
    if (!promotor || !rolPropuesto) return;
    setCambiandoRol(true);
    setErrorCambioRol(null);
    try {
      const db = await getDb();
      await cambiarRolPersona(db, promotor.id, rolPropuesto, {
        cedula: cedulaCambioRol.trim() || null,
        nuevoPinManual: pinCambioRol.trim() || null,
      });
      setRolPropuesto(null);
      await recargar();
    } catch (error) {
      if (error instanceof CedulaRequeridaError || error instanceof PinDuplicadoError) {
        setErrorCambioRol(error.message);
      } else {
        throw error;
      }
    } finally {
      setCambiandoRol(false);
    }
  }

  async function guardar(valores: ValoresPersona, pinManual: string | null) {
    setGuardando(true);
    try {
      const db = await getDb();
      await actualizarPersona(db, id, {
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

  async function confirmarBaja() {
    if (!promotor) return;
    setEliminando(true);
    try {
      const db = await getDb();
      await eliminarPersona(db, promotor.id);
      setModalBajaVisible(false);
      router.back();
    } finally {
      setEliminando(false);
    }
  }

  async function confirmarEliminarPermanente() {
    if (!promotor) return;
    setEliminandoPermanente(true);
    try {
      const db = await getDb();
      await eliminarPersonaPermanente(db, promotor.id);
      setModalPermanenteVisible(false);
      router.back();
    } catch (error) {
      if (error instanceof PersonaConHistorialError) {
        setModalPermanenteVisible(false);
        setErrorEliminarPermanente(error.message);
      } else {
        throw error;
      }
    } finally {
      setEliminandoPermanente(false);
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
        <ContenedorAncho anchoMaximo={640} style={styles.encabezadoContenido}>
          {!anchaPantalla && (
            <Pressable onPress={() => router.back()}>
              <Text style={styles.volver}>‹ Personal</Text>
            </Pressable>
          )}
          <Text style={anchaPantalla ? styles.tituloAncho : styles.titulo}>Editar persona</Text>
        </ContenedorAncho>
      </View>

      {cargando ? (
        <View style={styles.centrado}>
          <ActivityIndicator size="large" color={COLORES.oscuro} />
        </View>
      ) : !promotor ? (
        <View style={styles.centrado}>
          <Text style={styles.vacio}>Esta persona ya no existe.</Text>
        </View>
      ) : (
        <ContenedorAncho anchoMaximo={640} llenarAlto>
          <View style={styles.selectorRol}>
            <Text style={styles.selectorRolEtiqueta}>Rol</Text>
            <View style={styles.chipsRol}>
              {OPCIONES_ROL.map((opcion) => (
                <Pressable
                  key={opcion}
                  style={[styles.chipRol, promotor.rol === opcion && styles.chipRolActivo]}
                  onPress={() => abrirCambioRol(opcion)}
                >
                  <Text style={[styles.chipRolTexto, promotor.rol === opcion && styles.chipRolTextoActivo]}>
                    {ETIQUETA_ROL[opcion]}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>

          <FormularioPersona
            key={promotor.rol}
            rol={promotor.rol}
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
                  <Text style={styles.avisoInactivo}>Esta persona está dada de baja.</Text>
                  <Pressable
                    style={[styles.botonEliminarPermanente, eliminandoPermanente && styles.botonDeshabilitado]}
                    onPress={() => setModalPermanenteVisible(true)}
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
                  onPress={() => setModalBajaVisible(true)}
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

      {promotor && (
        <>
          <ModalConfirmacion
            visible={modalBajaVisible}
            titulo="Dar de baja al promotor"
            mensaje={`¿Seguro que quieres dar de baja a "${promotor.nombre}"? Ya no va a poder iniciar sesión, pero sus ventas y movimientos pasados se conservan.`}
            textoConfirmar="Dar de baja"
            destructivo
            cargando={eliminando}
            onConfirmar={confirmarBaja}
            onCancelar={() => setModalBajaVisible(false)}
          />
          <ModalConfirmacion
            visible={modalPermanenteVisible}
            titulo="Eliminar definitivamente"
            mensaje={`Esto borra a "${promotor.nombre}" por completo de la base de datos, incluyendo su cédula y su PIN — no se puede deshacer. Solo funciona si nunca tuvo ventas, turnos, cargues ni otro movimiento registrado.`}
            textoConfirmar="Eliminar para siempre"
            destructivo
            cargando={eliminandoPermanente}
            onConfirmar={confirmarEliminarPermanente}
            onCancelar={() => setModalPermanenteVisible(false)}
          />
        </>
      )}

      {errorEliminarPermanente && (
        <ModalConfirmacion
          visible
          titulo="No se pudo eliminar"
          mensaje={errorEliminarPermanente}
          textoConfirmar="Entendido"
          onConfirmar={() => setErrorEliminarPermanente(null)}
          onCancelar={() => setErrorEliminarPermanente(null)}
        />
      )}

      {promotor && rolPropuesto && (
        <Modal visible animationType="fade" transparent>
          <View style={styles.fondoModal}>
            <View style={styles.tarjetaModal}>
              <Text style={styles.modalTitulo}>Cambiar rol a {ETIQUETA_ROL[rolPropuesto]}</Text>
              <Text style={styles.modalTexto}>
                Esto puede cambiar el PIN de acceso de &quot;{promotor.nombre}&quot;. Avísale antes de confirmar.
              </Text>

              {modoPinParaRol(rolPropuesto) === 'DESDE_CEDULA' ? (
                <View style={styles.modalCampo}>
                  <Text style={styles.modalEtiqueta}>Cédula (de ahí sale el PIN nuevo)</Text>
                  <TextInput
                    style={styles.modalInput}
                    value={cedulaCambioRol}
                    onChangeText={setCedulaCambioRol}
                    placeholder="Ej. 1020304050"
                    placeholderTextColor="#999"
                    keyboardType="number-pad"
                    editable={!cambiandoRol}
                  />
                </View>
              ) : (
                <View style={styles.modalCampo}>
                  <Text style={styles.modalEtiqueta}>PIN de acceso (6 dígitos)</Text>
                  <TextInput
                    style={styles.modalInput}
                    value={pinCambioRol}
                    onChangeText={setPinCambioRol}
                    placeholder="Ej. 482913"
                    placeholderTextColor="#999"
                    keyboardType="number-pad"
                    maxLength={6}
                    editable={!cambiandoRol}
                  />
                </View>
              )}

              {errorCambioRol && <Text style={styles.modalError}>{errorCambioRol}</Text>}

              <View style={styles.modalAcciones}>
                <Pressable onPress={() => setRolPropuesto(null)} disabled={cambiandoRol}>
                  <Text style={styles.modalCancelar}>Cancelar</Text>
                </Pressable>
                <Pressable
                  style={[
                    styles.botonConfirmarRol,
                    (cambiandoRol ||
                      (modoPinParaRol(rolPropuesto) === 'MANUAL_6_DIGITOS' &&
                        !pinManualValido(pinCambioRol))) &&
                      styles.botonDeshabilitado,
                  ]}
                  disabled={
                    cambiandoRol ||
                    (modoPinParaRol(rolPropuesto) === 'MANUAL_6_DIGITOS' && !pinManualValido(pinCambioRol))
                  }
                  onPress={confirmarCambioRol}
                >
                  {cambiandoRol ? (
                    <ActivityIndicator color="#FFFFFF" size="small" />
                  ) : (
                    <Text style={styles.botonConfirmarRolTexto}>Confirmar</Text>
                  )}
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>
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
  encabezadoAncho: {
    backgroundColor: 'transparent',
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
  tituloAncho: {
    color: COLORES.oscuro,
    fontSize: 20,
    fontWeight: '700',
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
  selectorRol: {
    paddingHorizontal: 20,
    paddingTop: 20,
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
  fondoModal: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  tarjetaModal: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    gap: 10,
  },
  modalTitulo: {
    fontSize: 16,
    fontWeight: '700',
    color: '#333',
  },
  modalTexto: {
    fontSize: 13,
    color: '#666',
  },
  modalCampo: {
    gap: 6,
  },
  modalEtiqueta: {
    fontSize: 13,
    fontWeight: '600',
    color: '#555',
  },
  modalInput: {
    borderWidth: 1,
    borderColor: '#DDD',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    backgroundColor: '#FFF',
  },
  modalError: {
    fontSize: 13,
    fontWeight: '600',
    color: '#B00020',
  },
  modalAcciones: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: 16,
    marginTop: 8,
  },
  modalCancelar: {
    fontSize: 14,
    fontWeight: '600',
    color: '#777',
  },
  botonConfirmarRol: {
    backgroundColor: COLORES.oscuro,
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    minWidth: 100,
    alignItems: 'center',
  },
  botonConfirmarRolTexto: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
});
