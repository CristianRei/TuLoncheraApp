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

import type { Cliente } from '@/core/tipos';
import { getDb } from '@/db/client';
import { crearCliente, listarClientes } from '@/db/clientes';
import { getDispositivoId } from '@/db/dispositivo';
import { ContenedorAncho } from '@/ui/ContenedorAncho';
import { Encabezado } from '@/ui/Encabezado';
import { EmptyState } from '@/ui/EmptyState';
import { ListRow } from '@/ui/ListRow';
import { SearchBar } from '@/ui/SearchBar';
import { ANCHO_ADMIN, COLORES_ADMIN, ESPACIADO_ADMIN, RADII_ADMIN, TIPOGRAFIA_ADMIN } from '@/ui/tema';
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
      <Encabezado
        titulo="Clientes"
        rutaVolverTexto="Admin"
        accion={{ icono: 'add', texto: 'Nuevo', onPress: () => setModalVisible(true) }}
      />

      <ContenedorAncho anchoMaximo={ANCHO_ADMIN.lista}>
        <View style={styles.controles}>
          <SearchBar valor={busqueda} onCambiar={buscar} placeholder="Buscar por nombre, teléfono o empresa..." />
        </View>
      </ContenedorAncho>

      {cargando ? (
        <View style={styles.centrado}>
          <ActivityIndicator size="large" color={COLORES_ADMIN.vino} />
        </View>
      ) : clientes.length === 0 ? (
        <EmptyState
          icono="people-outline"
          mensaje={busqueda ? 'Ningún cliente coincide con la búsqueda.' : 'Todavía no hay clientes registrados.'}
        />
      ) : (
        <ContenedorAncho anchoMaximo={ANCHO_ADMIN.lista} llenarAlto>
          <FlatList
            data={clientes}
            keyExtractor={(c) => c.id}
            contentContainerStyle={styles.lista}
            renderItem={({ item }) => (
              <ListRow
                titulo={item.nombreCompleto}
                subtitulo={
                  [item.telefono, item.empresa, item.ciudad].filter(Boolean).join(' · ') || 'Sin datos adicionales'
                }
                onPress={() => router.push(`/admin/clientes/${item.id}`)}
              />
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
                placeholderTextColor={COLORES_ADMIN.textoSecundario}
                value={nombreCompleto}
                onChangeText={setNombreCompleto}
                editable={!guardando}
              />
              <TextInput
                style={styles.modalInput}
                placeholder="Teléfono"
                placeholderTextColor={COLORES_ADMIN.textoSecundario}
                value={telefono}
                onChangeText={setTelefono}
                keyboardType="phone-pad"
                editable={!guardando}
              />
              <TextInput
                style={styles.modalInput}
                placeholder="Dirección"
                placeholderTextColor={COLORES_ADMIN.textoSecundario}
                value={direccion}
                onChangeText={setDireccion}
                editable={!guardando}
              />
              <TextInput
                style={styles.modalInput}
                placeholder="Ciudad"
                placeholderTextColor={COLORES_ADMIN.textoSecundario}
                value={ciudad}
                onChangeText={setCiudad}
                editable={!guardando}
              />
              <TextInput
                style={styles.modalInput}
                placeholder="Empresa donde trabaja"
                placeholderTextColor={COLORES_ADMIN.textoSecundario}
                value={empresa}
                onChangeText={setEmpresa}
                editable={!guardando}
              />
              <TextInput
                style={[styles.modalInput, styles.modalInputMultilinea]}
                placeholder="Nota"
                placeholderTextColor={COLORES_ADMIN.textoSecundario}
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
    backgroundColor: COLORES_ADMIN.background,
  },
  controles: {
    paddingTop: ESPACIADO_ADMIN.lg,
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
    maxHeight: '85%',
    backgroundColor: COLORES_ADMIN.superficieMasBaja,
    borderRadius: RADII_ADMIN.lg,
    padding: 22,
    gap: 12,
  },
  modalTitulo: {
    fontSize: 16,
    fontFamily: TIPOGRAFIA_ADMIN.negrita,
    color: COLORES_ADMIN.texto,
  },
  modalScroll: {
    gap: 12,
  },
  modalInput: {
    borderWidth: 1,
    borderColor: COLORES_ADMIN.bordeSuave,
    borderRadius: RADII_ADMIN.md,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    fontFamily: TIPOGRAFIA_ADMIN.regular,
    color: COLORES_ADMIN.texto,
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
    color: COLORES_ADMIN.textoInverso,
    fontSize: 14,
    fontFamily: TIPOGRAFIA_ADMIN.negrita,
  },
  botonDeshabilitado: {
    opacity: 0.5,
  },
});
