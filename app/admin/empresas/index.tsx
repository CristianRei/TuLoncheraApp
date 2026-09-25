import { router, useFocusEffect } from 'expo-router';
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

import type { Empresa } from '@/core/tipos';
import { crearEmpresa, listarEmpresas } from '@/db/empresas';
import { getDb } from '@/db/client';
import { getDispositivoId } from '@/db/dispositivo';
import { ContenedorAncho } from '@/ui/ContenedorAncho';
import { Encabezado } from '@/ui/Encabezado';
import { EmptyState } from '@/ui/EmptyState';
import { ListRow } from '@/ui/ListRow';
import { ANCHO_ADMIN, COLORES_ADMIN, ESPACIADO_ADMIN, RADII_ADMIN, TEXTO_ADMIN } from '@/ui/tema';
import { useRequiereSesion } from '@/ui/useRequiereSesion';

export default function Empresas() {
  const usuario = useRequiereSesion(['ADMIN']);
  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [cargando, setCargando] = useState(true);
  const [modalVisible, setModalVisible] = useState(false);
  const [nombre, setNombre] = useState('');
  const [direccion, setDireccion] = useState('');
  const [guardando, setGuardando] = useState(false);

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const db = await getDb();
      setEmpresas(await listarEmpresas(db));
    } finally {
      setCargando(false);
    }
  }, []);

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
      await crearEmpresa(
        db,
        { nombre: nombre.trim(), direccion: direccion.trim() || null },
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
        titulo="Empresas y puntos"
        rutaVolverTexto="Admin"
        accion={{ icono: 'add', texto: 'Nueva', onPress: () => setModalVisible(true) }}
      />

      {cargando ? (
        <View style={styles.centrado}>
          <ActivityIndicator size="large" color={COLORES_ADMIN.vino} />
        </View>
      ) : empresas.length === 0 ? (
        <EmptyState icono="business-outline" mensaje="Todavía no hay empresas registradas." />
      ) : (
        <ContenedorAncho anchoMaximo={ANCHO_ADMIN.lista} llenarAlto>
          <FlatList
            data={empresas}
            keyExtractor={(e) => e.id}
            contentContainerStyle={styles.lista}
            renderItem={({ item }) => (
              <ListRow
                titulo={item.nombre}
                subtitulo={item.direccion ?? undefined}
                onPress={() => router.push(`/admin/empresas/${item.id}`)}
              />
            )}
          />
        </ContenedorAncho>
      )}

      <Modal visible={modalVisible} animationType="fade" transparent>
        <View style={styles.fondoModal}>
          <View style={styles.tarjetaModal}>
            <Text style={styles.modalTitulo}>Nueva empresa</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="Nombre (ej. Falabella)"
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
    ...TEXTO_ADMIN.boton,
    color: COLORES_ADMIN.textoInverso,
  },
  botonDeshabilitado: {
    opacity: 0.5,
  },
});
