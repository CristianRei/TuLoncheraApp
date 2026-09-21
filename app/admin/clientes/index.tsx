import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { Cliente } from '@/core/tipos';
import { getDb } from '@/db/client';
import { crearCliente, listarClientes } from '@/db/clientes';
import { getDispositivoId } from '@/db/dispositivo';
import { COLORES } from '@/ui/colores';
import { ContenedorAncho } from '@/ui/ContenedorAncho';
import { useRequiereSesion } from '@/ui/useRequiereSesion';

export default function ClientesAdmin() {
  const usuario = useRequiereSesion(['ADMIN']);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [cargando, setCargando] = useState(true);
  const [busqueda, setBusqueda] = useState('');
  const [modalVisible, setModalVisible] = useState(false);
  const [nombreCompleto, setNombreCompleto] = useState('');
  const [telefono, setTelefono] = useState('');
  const [direccion, setDireccion] = useState('');
  const [ciudad, setCiudad] = useState('');
  const [empresa, setEmpresa] = useState('');
  const [nota, setNota] = useState('');
  const [guardando, setGuardando] = useState(false);
  const insets = useSafeAreaInsets();

  const cargar = useCallback(async (termino?: string) => {
    setCargando(true);
    try {
      const db = await getDb();
      setClientes(await listarClientes(db, termino));
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

  function buscar(texto: string) {
    setBusqueda(texto);
    cargar(texto);
  }

  function limpiarFormulario() {
    setNombreCompleto('');
    setTelefono('');
    setDireccion('');
    setCiudad('');
    setEmpresa('');
    setNota('');
  }

  async function confirmarCrear() {
    if (nombreCompleto.trim().length === 0 || !usuario) return;
    setGuardando(true);
    try {
      const db = await getDb();
      const dispositivoId = await getDispositivoId(db);
      await crearCliente(
        db,
        {
          nombreCompleto: nombreCompleto.trim(),
          telefono: telefono.trim() || null,
          direccion: direccion.trim() || null,
          ciudad: ciudad.trim() || null,
          empresa: empresa.trim() || null,
          nota: nota.trim() || null,
        },
        usuario.id,
        dispositivoId
      );
      setModalVisible(false);
      limpiarFormulario();
      await cargar(busqueda);
    } finally {
      setGuardando(false);
    }
  }

  return (
    <View style={styles.contenedor}>
      <View style={[styles.encabezado, { paddingTop: insets.top + 20 }]}>
        <ContenedorAncho anchoMaximo={720} style={styles.encabezadoContenido}>
          <View style={styles.encabezadoFila}>
            <Pressable onPress={() => router.back()}>
              <Text style={styles.volver}>‹ Admin</Text>
            </Pressable>
            <Text style={styles.titulo}>Clientes</Text>
            <Pressable onPress={() => setModalVisible(true)}>
              <Text style={styles.agregar}>+ Nuevo</Text>
            </Pressable>
          </View>
          <TextInput
            style={styles.busqueda}
            placeholder="Buscar por nombre, teléfono o empresa..."
            placeholderTextColor="rgba(255,255,255,0.6)"
            value={busqueda}
            onChangeText={buscar}
          />
        </ContenedorAncho>
      </View>

      {cargando ? (
        <View style={styles.centrado}>
          <ActivityIndicator size="large" color={COLORES.oscuro} />
        </View>
      ) : clientes.length === 0 ? (
        <View style={styles.centrado}>
          <Text style={styles.vacio}>
            {busqueda ? 'Ningún cliente coincide con la búsqueda.' : 'Todavía no hay clientes registrados.'}
          </Text>
        </View>
      ) : (
        <ContenedorAncho anchoMaximo={720} llenarAlto>
          <FlatList
            data={clientes}
            keyExtractor={(c) => c.id}
            contentContainerStyle={styles.lista}
            renderItem={({ item }) => (
              <Pressable style={styles.fila} onPress={() => router.push(`/admin/clientes/${item.id}`)}>
                <View style={styles.filaTexto}>
                  <Text style={styles.filaNombre}>{item.nombreCompleto}</Text>
                  <Text style={styles.filaDetalle}>
                    {[item.telefono, item.empresa, item.ciudad].filter(Boolean).join(' · ') || 'Sin datos adicionales'}
                  </Text>
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
            <Text style={styles.modalTitulo}>Nuevo cliente</Text>
            <ScrollView style={styles.modalScroll} keyboardShouldPersistTaps="handled">
              <TextInput
                style={styles.modalInput}
                placeholder="Nombre completo *"
                placeholderTextColor="#999"
                value={nombreCompleto}
                onChangeText={setNombreCompleto}
                editable={!guardando}
              />
              <TextInput
                style={styles.modalInput}
                placeholder="Teléfono"
                placeholderTextColor="#999"
                value={telefono}
                onChangeText={setTelefono}
                keyboardType="phone-pad"
                editable={!guardando}
              />
              <TextInput
                style={styles.modalInput}
                placeholder="Dirección"
                placeholderTextColor="#999"
                value={direccion}
                onChangeText={setDireccion}
                editable={!guardando}
              />
              <TextInput
                style={styles.modalInput}
                placeholder="Ciudad"
                placeholderTextColor="#999"
                value={ciudad}
                onChangeText={setCiudad}
                editable={!guardando}
              />
              <TextInput
                style={styles.modalInput}
                placeholder="Empresa donde trabaja"
                placeholderTextColor="#999"
                value={empresa}
                onChangeText={setEmpresa}
                editable={!guardando}
              />
              <TextInput
                style={[styles.modalInput, styles.modalInputMultilinea]}
                placeholder="Nota"
                placeholderTextColor="#999"
                value={nota}
                onChangeText={setNota}
                multiline
                editable={!guardando}
              />
            </ScrollView>
            <View style={styles.modalAcciones}>
              <Pressable
                onPress={() => {
                  setModalVisible(false);
                  limpiarFormulario();
                }}
                disabled={guardando}
              >
                <Text style={styles.modalCancelar}>Cancelar</Text>
              </Pressable>
              <Pressable
                style={[
                  styles.modalConfirmar,
                  (nombreCompleto.trim().length === 0 || guardando) && styles.botonDeshabilitado,
                ]}
                disabled={nombreCompleto.trim().length === 0 || guardando}
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
  encabezadoContenido: {
    gap: 12,
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
  busqueda: {
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
    color: '#FFFFFF',
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
    maxHeight: '85%',
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
  modalScroll: {
    gap: 12,
  },
  modalInput: {
    borderWidth: 1,
    borderColor: '#DDD',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    marginBottom: 12,
  },
  modalInputMultilinea: {
    minHeight: 70,
    textAlignVertical: 'top',
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
