import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import type { Empresa, Punto } from '@/core/tipos';
import { listarEmpresas } from '@/db/empresas';
import { getDb } from '@/db/client';
import { getDispositivoId } from '@/db/dispositivo';
import { crearPunto, listarPuntos } from '@/db/puntos';
import { ContenedorAncho } from '@/ui/ContenedorAncho';
import { Encabezado } from '@/ui/Encabezado';
import { EmptyState } from '@/ui/EmptyState';
import { ANCHO_ADMIN, COLORES_ADMIN, ESPACIADO_ADMIN, RADII_ADMIN, TIPOGRAFIA_ADMIN, TEXTO_ADMIN } from '@/ui/tema';
import { useRequiereSesion } from '@/ui/useRequiereSesion';

export default function DetalleEmpresa() {
  const usuario = useRequiereSesion(['ADMIN']);
  const { id } = useLocalSearchParams<{ id: string }>();
  const [empresa, setEmpresa] = useState<Empresa | null>(null);
  const [puntos, setPuntos] = useState<Punto[]>([]);
  const [cargando, setCargando] = useState(true);
  const [modalVisible, setModalVisible] = useState(false);
  const [nombre, setNombre] = useState('');
  const [direccion, setDireccion] = useState('');
  const [guardando, setGuardando] = useState(false);

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const db = await getDb();
      const [empresas, listaPuntos] = await Promise.all([
        listarEmpresas(db),
        listarPuntos(db, { empresaId: id }),
      ]);
      setEmpresa(empresas.find((e) => e.id === id) ?? null);
      setPuntos(listaPuntos);
    } finally {
      setCargando(false);
    }
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      cargar();
    }, [cargar])
  );

  if (!usuario) return null;

  async function confirmarCrear() {
    if (nombre.trim().length === 0) return;
    setGuardando(true);
    try {
      const db = await getDb();
      const dispositivoId = await getDispositivoId(db);
      await crearPunto(
        db,
        { empresaId: id, nombre: nombre.trim(), direccion: direccion.trim() || null },
        dispositivoId
      );
      setModalVisible(false);
      setNombre('');
      setDireccion('');
      await cargar();
    } finally {
      setGuardando(false);
    }
  }

  return (
    <View style={styles.contenedor}>
      <Encabezado
        titulo={empresa?.nombre ?? 'Puntos'}
        rutaVolverTexto="Empresas"
        accion={{ icono: 'add', texto: 'Punto', onPress: () => setModalVisible(true) }}
      />

      {cargando ? (
        <View style={styles.centrado}>
          <ActivityIndicator size="large" color={COLORES_ADMIN.vino} />
        </View>
      ) : puntos.length === 0 ? (
        <EmptyState icono="location-outline" mensaje="Esta empresa todavía no tiene puntos registrados." />
      ) : (
        <ContenedorAncho anchoMaximo={ANCHO_ADMIN.lista} llenarAlto>
          <FlatList
            data={puntos}
            keyExtractor={(p) => p.id}
            contentContainerStyle={styles.lista}
            renderItem={({ item }) => (
              <View style={styles.fila}>
                <View style={styles.filaTexto}>
                  <Text style={styles.filaNombre}>{item.nombre}</Text>
                  {item.direccion && <Text style={styles.filaDetalle}>{item.direccion}</Text>}
                </View>
              </View>
            )}
          />
        </ContenedorAncho>
      )}

      <Modal visible={modalVisible} animationType="fade" transparent>
        <View style={styles.fondoModal}>
          <View style={styles.tarjetaModal}>
            <Text style={styles.modalTitulo}>Nuevo punto</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="Nombre (ej. Norte)"
              placeholderTextColor={COLORES_ADMIN.textoSecundario}
              value={nombre}
              onChangeText={setNombre}
              editable={!guardando}
            />
            <TextInput
              style={styles.modalInput}
              placeholder="Dirección (opcional)"
              placeholderTextColor={COLORES_ADMIN.textoSecundario}
              value={direccion}
              onChangeText={setDireccion}
              editable={!guardando}
            />
            <View style={styles.modalAcciones}>
              <Pressable
                onPress={() => {
                  setModalVisible(false);
                  setNombre('');
                  setDireccion('');
                }}
                disabled={guardando}
              >
                <Text style={styles.modalCancelar}>Cancelar</Text>
              </Pressable>
              <Pressable
                style={[
                  styles.modalConfirmar,
                  (nombre.trim().length === 0 || guardando) && styles.botonDeshabilitado,
                ]}
                disabled={nombre.trim().length === 0 || guardando}
                onPress={confirmarCrear}
              >
                {guardando ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.modalConfirmarTexto}>Crear</Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
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
    padding: ESPACIADO_ADMIN.xxl,
  },
  lista: {
    padding: ESPACIADO_ADMIN.xl,
    gap: ESPACIADO_ADMIN.md,
  },
  fila: {
    backgroundColor: COLORES_ADMIN.superficieMasBaja,
    borderRadius: RADII_ADMIN.md,
    borderWidth: 1,
    borderColor: COLORES_ADMIN.bordeSuave,
    padding: ESPACIADO_ADMIN.md,
  },
  filaTexto: {
    gap: 2,
  },
  filaNombre: {
    ...TEXTO_ADMIN.tituloTarjeta,
  },
  filaDetalle: {
    ...TEXTO_ADMIN.nota,
  },
  fondoModal: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  tarjetaModal: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: COLORES_ADMIN.superficieMasBaja,
    borderRadius: RADII_ADMIN.lg,
    padding: 22,
    gap: 12,
  },
  modalTitulo: {
    ...TEXTO_ADMIN.tituloSeccion,
    fontFamily: TIPOGRAFIA_ADMIN.negrita,
  },
  modalInput: {
    ...TEXTO_ADMIN.cuerpo,
    borderWidth: 1,
    borderColor: COLORES_ADMIN.bordeSuave,
    borderRadius: RADII_ADMIN.md,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  modalAcciones: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: 20,
  },
  modalCancelar: {
    fontSize: 14,
    color: COLORES_ADMIN.textoSecundario,
  },
  modalConfirmar: {
    backgroundColor: COLORES_ADMIN.vino,
    borderRadius: RADII_ADMIN.md,
    paddingHorizontal: 20,
    paddingVertical: 10,
    minWidth: 90,
    alignItems: 'center',
  },
  modalConfirmarTexto: {
    ...TEXTO_ADMIN.cuerpo,
    color: COLORES_ADMIN.textoInverso,
    fontFamily: TIPOGRAFIA_ADMIN.negrita,
  },
  botonDeshabilitado: {
    opacity: 0.5,
  },
});
