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

import { modoPinParaRol, pinManualValido } from '@/core/pin';
import type { Persona, Rol } from '@/core/tipos';
import { getDb } from '@/db/client';
import { getDispositivoId } from '@/db/dispositivo';
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
import { ContenedorAncho } from '@/ui/ContenedorAncho';
import { Encabezado } from '@/ui/Encabezado';
import { FilterTabs } from '@/ui/FilterTabs';
import { FormularioPersona, type ValoresPersona } from '@/ui/FormularioPersona';
import { ModalConfirmacion } from '@/ui/ModalConfirmacion';
import { ANCHO_ADMIN, COLORES_ADMIN, ESPACIADO_ADMIN, ESTADO_ADMIN, RADII_ADMIN, TEXTO_ADMIN } from '@/ui/tema';
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
  const usuarioActual = usuario;

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
      const dispositivoId = await getDispositivoId(db);
      await cambiarRolPersona(
        db,
        promotor.id,
        rolPropuesto,
        { cedula: cedulaCambioRol.trim() || null, nuevoPinManual: pinCambioRol.trim() || null },
        dispositivoId,
        usuarioActual.id
      );
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
      const dispositivoId = await getDispositivoId(db);
      await actualizarPersona(
        db,
        id,
        {
          nombre: valores.nombre,
          cedula: valores.cedula,
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

  async function confirmarBaja() {
    if (!promotor) return;
    setEliminando(true);
    try {
      const db = await getDb();
      const dispositivoId = await getDispositivoId(db);
      await eliminarPersona(db, promotor.id, dispositivoId, usuarioActual.id);
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
      <Encabezado titulo="Editar persona" rutaVolverTexto="Personal" anchoMaximo={ANCHO_ADMIN.formulario} />

      {cargando ? (
        <View style={styles.centrado}>
          <ActivityIndicator size="large" color={COLORES_ADMIN.vino} />
        </View>
      ) : !promotor ? (
        <View style={styles.centrado}>
          <Text style={styles.vacio}>Esta persona ya no existe.</Text>
        </View>
      ) : (
        <ContenedorAncho anchoMaximo={ANCHO_ADMIN.formulario} llenarAlto>
          <View style={styles.selectorRol}>
            <Text style={styles.selectorRolEtiqueta}>Rol</Text>
            <FilterTabs
              opciones={OPCIONES_ROL.map((r) => ({ valor: r, etiqueta: ETIQUETA_ROL[r] }))}
              valorActivo={promotor.rol}
              onCambiar={abrirCambioRol}
            />
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
            colorAcento={COLORES_ADMIN.vino}
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
    backgroundColor: COLORES_ADMIN.background,
  },
  centrado: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  vacio: {
    fontSize: 14,
    color: COLORES_ADMIN.textoSecundario,
  },
  botonEliminar: {
    marginTop: 4,
    borderRadius: RADII_ADMIN.md,
    paddingVertical: 12,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: ESTADO_ADMIN.error.texto,
  },
  botonEliminarTexto: {
    fontSize: 14,
    fontWeight: '700',
    color: ESTADO_ADMIN.error.texto,
  },
  botonDeshabilitado: {
    opacity: 0.5,
  },
  avisoInactivo: {
    marginTop: 4,
    fontSize: 13,
    color: COLORES_ADMIN.textoSecundario,
    fontStyle: 'italic',
    textAlign: 'center',
  },
  botonEliminarPermanente: {
    marginTop: 10,
    borderRadius: RADII_ADMIN.md,
    paddingVertical: 12,
    alignItems: 'center',
    backgroundColor: ESTADO_ADMIN.error.texto,
  },
  botonEliminarPermanenteTexto: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORES_ADMIN.textoInverso,
  },
  selectorRol: {
    paddingHorizontal: ESPACIADO_ADMIN.xl,
    paddingTop: ESPACIADO_ADMIN.xl,
    gap: ESPACIADO_ADMIN.md,
  },
  selectorRolEtiqueta: {
    ...TEXTO_ADMIN.boton,
    color: COLORES_ADMIN.textoSecundario,
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
    backgroundColor: COLORES_ADMIN.superficieMasBaja,
    borderRadius: RADII_ADMIN.lg,
    padding: 20,
    gap: 10,
  },
  modalTitulo: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORES_ADMIN.texto,
  },
  modalTexto: {
    fontSize: 13,
    color: COLORES_ADMIN.textoSecundario,
  },
  modalCampo: {
    gap: 6,
  },
  modalEtiqueta: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORES_ADMIN.textoSecundario,
  },
  modalInput: {
    borderWidth: 1,
    borderColor: COLORES_ADMIN.bordeSuave,
    borderRadius: RADII_ADMIN.sm,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    backgroundColor: COLORES_ADMIN.superficieMasBaja,
  },
  modalError: {
    fontSize: 13,
    fontWeight: '600',
    color: ESTADO_ADMIN.error.texto,
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
    color: COLORES_ADMIN.textoSecundario,
  },
  botonConfirmarRol: {
    backgroundColor: COLORES_ADMIN.vino,
    borderRadius: RADII_ADMIN.sm,
    paddingHorizontal: 16,
    paddingVertical: 10,
    minWidth: 100,
    alignItems: 'center',
  },
  botonConfirmarRolTexto: {
    color: COLORES_ADMIN.textoInverso,
    fontSize: 13,
    fontWeight: '700',
  },
});
