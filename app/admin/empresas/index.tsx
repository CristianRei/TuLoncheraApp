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
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { Empresa } from '@/core/tipos';
import { crearEmpresa, listarEmpresas } from '@/db/empresas';
import { getDb } from '@/db/client';
import { getDispositivoId } from '@/db/dispositivo';
import { COLORES } from '@/ui/colores';
import { ContenedorAncho } from '@/ui/ContenedorAncho';
import { useRequiereSesion } from '@/ui/useRequiereSesion';

export default function Empresas() {
  const usuario = useRequiereSesion(['ADMIN']);
  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [cargando, setCargando] = useState(true);
  const [modalVisible, setModalVisible] = useState(false);
  const [nombre, setNombre] = useState('');
  const [direccion, setDireccion] = useState('');
  const [guardando, setGuardando] = useState(false);
  const insets = useSafeAreaInsets();

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
      <View style={[styles.encabezado, { paddingTop: insets.top + 20 }]}>
        <ContenedorAncho anchoMaximo={720}>
          <View style={styles.encabezadoFila}>
            <Pressable onPress={() => router.back()}>
              <Text style={styles.volver}>‹ Admin</Text>
            </Pressable>
            <Text style={styles.titulo}>Empresas y puntos</Text>
            <Pressable onPress={() => setModalVisible(true)}>
              <Text style={styles.agregar}>+ Nueva</Text>
            </Pressable>
          </View>
        </ContenedorAncho>
      </View>

      {cargando ? (
        <View style={styles.centrado}>
          <ActivityIndicator size="large" color={COLORES.oscuro} />
        </View>
      ) : empresas.length === 0 ? (
        <View style={styles.centrado}>
          <Text style={styles.vacio}>Todavía no hay empresas registradas.</Text>
        </View>
      ) : (
        <ContenedorAncho anchoMaximo={720} llenarAlto>
          <FlatList
            data={empresas}
            keyExtractor={(e) => e.id}
            contentContainerStyle={styles.lista}
            renderItem={({ item }) => (
              <Pressable
                style={styles.fila}
                onPress={() => router.push(`/admin/empresas/${item.id}`)}
              >
                <View style={styles.filaTexto}>
                  <Text style={styles.filaNombre}>{item.nombre}</Text>
                  {item.direccion && <Text style={styles.filaDetalle}>{item.direccion}</Text>}
                </View>
                <Text style={styles.filaFlecha}>›</Text>
              </Pressable>
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
              placeholderTextColor="#999"
              value={nombre}
              onChangeText={setNombre}
              editable={!guardando}
            />
            <TextInput
              style={styles.modalInput}
              placeholder="Dirección (opcional)"
              placeholderTextColor="#999"
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
    backgroundColor: '#FBEDED',
  },
  encabezado: {
    backgroundColor: COLORES.oscuro,
    paddingHorizontal: 20,
    paddingBottom: 16,
  },
  encabezadoFila: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
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
  agregar: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
    textDecorationLine: 'underline',
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
    textAlign: 'center',
  },
  lista: {
    padding: 20,
    gap: 12,
  },
  fila: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 14,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  filaTexto: {
    flex: 1,
    gap: 2,
  },
  filaNombre: {
    fontSize: 15,
    fontWeight: '700',
    color: '#333',
  },
  filaDetalle: {
    fontSize: 12,
    color: '#888',
  },
  filaFlecha: {
    fontSize: 20,
    color: COLORES.oscuro,
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
    backgroundColor: '#FFF',
    borderRadius: 18,
    padding: 22,
    gap: 12,
  },
  modalTitulo: {
    fontSize: 17,
    fontWeight: '700',
    color: '#333',
  },
  modalInput: {
    borderWidth: 1,
    borderColor: '#DDD',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
  },
  modalAcciones: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: 20,
  },
  modalCancelar: {
    fontSize: 14,
    color: '#888',
  },
  modalConfirmar: {
    backgroundColor: COLORES.oscuro,
    borderRadius: 10,
    paddingHorizontal: 20,
    paddingVertical: 10,
    minWidth: 90,
    alignItems: 'center',
  },
  modalConfirmarTexto: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '700',
  },
  botonDeshabilitado: {
    opacity: 0.5,
  },
});
