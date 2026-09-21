import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import type { Cliente } from '@/core/tipos';
import { getDb } from '@/db/client';
import { listarClientes } from '@/db/clientes';
import { asignarClienteAVenta } from '@/db/ventas';
import { COLORES, TIPOGRAFIA_PROMOTOR } from '@/ui/colores';
import { useRequiereSesion } from '@/ui/useRequiereSesion';
import { useVentaEnCurso } from '@/ui/VentaEnCursoContext';

export default function ClientesPromotor() {
  const usuario = useRequiereSesion(['PROMOTOR']);
  const { paraVentaId } = useLocalSearchParams<{ paraVentaId?: string }>();
  const modoSeleccion = typeof paraVentaId === 'string' && paraVentaId.length > 0;
  const { setClienteVentaActual } = useVentaEnCurso();

  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [cargando, setCargando] = useState(true);
  const [busqueda, setBusqueda] = useState('');
  const [clienteVerDetalle, setClienteVerDetalle] = useState<Cliente | null>(null);
  const [procesando, setProcesando] = useState(false);

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

  async function elegirCliente(cliente: Cliente) {
    if (!modoSeleccion) {
      setClienteVerDetalle(cliente);
      return;
    }
    setProcesando(true);
    try {
      const db = await getDb();
      await asignarClienteAVenta(db, paraVentaId as string, cliente.id);
      router.back();
    } finally {
      setProcesando(false);
    }
  }

  async function quitarCliente() {
    setProcesando(true);
    try {
      const db = await getDb();
      await asignarClienteAVenta(db, paraVentaId as string, null);
      router.back();
    } finally {
      setProcesando(false);
    }
  }

  function facturarAEsteCliente(cliente: Cliente) {
    setClienteVentaActual(cliente);
    setClienteVerDetalle(null);
    router.back();
  }

  return (
    <View style={styles.contenedor}>
      <View style={styles.encabezado}>
        <Pressable
          onPress={() => router.back()}
          style={styles.botonIcono}
          accessibilityRole="button"
          accessibilityLabel="Volver"
        >
          <Ionicons name="chevron-back" size={22} color={COLORES.textoSobreOscuro} />
        </Pressable>
        <Text style={styles.titulo}>{modoSeleccion ? 'Elegir cliente' : 'Clientes'}</Text>
        <Pressable
          onPress={() => router.push('/promotor/clientes/nuevo')}
          style={styles.botonIcono}
          accessibilityRole="button"
          accessibilityLabel="Nuevo cliente"
        >
          <Ionicons name="add" size={26} color={COLORES.textoSobreOscuro} />
        </Pressable>
      </View>

      <View style={styles.barraBusqueda}>
        <Ionicons name="search-outline" size={18} color={COLORES.textoSecundario} />
        <TextInput
          style={styles.inputBusqueda}
          placeholder="Buscar por nombre, teléfono o empresa..."
          placeholderTextColor={COLORES.textoSecundario}
          value={busqueda}
          onChangeText={buscar}
        />
      </View>

      {modoSeleccion && (
        <Pressable style={styles.filaQuitar} onPress={quitarCliente} disabled={procesando}>
          <Ionicons name="close-circle-outline" size={18} color={COLORES.textoSecundario} />
          <Text style={styles.filaQuitarTexto}>Dejar sin cliente asignado</Text>
        </Pressable>
      )}

      {cargando ? (
        <View style={styles.centrado}>
          <ActivityIndicator size="large" color={COLORES.primario} />
        </View>
      ) : clientes.length === 0 ? (
        <View style={styles.centrado}>
          <Text style={styles.vacio}>
            {busqueda ? 'Ningún cliente coincide con la búsqueda.' : 'Todavía no hay clientes registrados.'}
          </Text>
        </View>
      ) : (
        <FlatList
          data={clientes}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.lista}
          renderItem={({ item }) => (
            <Pressable style={styles.tarjeta} onPress={() => elegirCliente(item)} disabled={procesando}>
              <View style={styles.avatar}>
                <Text style={styles.avatarTexto}>{item.nombreCompleto.charAt(0).toUpperCase()}</Text>
              </View>
              <View style={styles.tarjetaTexto}>
                <Text style={styles.tarjetaNombre} numberOfLines={1}>
                  {item.nombreCompleto}
                </Text>
                <Text style={styles.tarjetaDetalle} numberOfLines={1}>
                  {[item.telefono, item.empresa].filter(Boolean).join(' · ') || 'Sin datos adicionales'}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={COLORES.textoSecundario} />
            </Pressable>
          )}
        />
      )}

      <Modal
        visible={clienteVerDetalle !== null}
        animationType="slide"
        transparent
        onRequestClose={() => setClienteVerDetalle(null)}
      >
        <View style={styles.fondoModal}>
          <View style={styles.hoja}>
            {clienteVerDetalle && (
              <>
                <View style={styles.hojaEncabezado}>
                  <Text style={styles.hojaNombre}>{clienteVerDetalle.nombreCompleto}</Text>
                  <Pressable onPress={() => setClienteVerDetalle(null)}>
                    <Text style={styles.cerrar}>Cerrar</Text>
                  </Pressable>
                </View>
                <CampoDetalle etiqueta="Teléfono" valor={clienteVerDetalle.telefono} />
                <CampoDetalle etiqueta="Dirección" valor={clienteVerDetalle.direccion} />
                <CampoDetalle etiqueta="Ciudad" valor={clienteVerDetalle.ciudad} />
                <CampoDetalle etiqueta="Empresa" valor={clienteVerDetalle.empresa} />
                <CampoDetalle etiqueta="Nota" valor={clienteVerDetalle.nota} />
                <Pressable
                  style={styles.botonFacturar}
                  onPress={() => facturarAEsteCliente(clienteVerDetalle)}
                  accessibilityRole="button"
                  accessibilityLabel={`Facturar la venta actual a ${clienteVerDetalle.nombreCompleto}`}
                >
                  <Ionicons name="receipt-outline" size={18} color="#FFF" />
                  <Text style={styles.botonFacturarTexto}>Facturar a este cliente</Text>
                </Pressable>
              </>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

function CampoDetalle({ etiqueta, valor }: { etiqueta: string; valor: string | null }) {
  return (
    <View style={styles.campoDetalle}>
      <Text style={styles.campoEtiqueta}>{etiqueta}</Text>
      <Text style={styles.campoValor}>{valor || '—'}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  contenedor: {
    flex: 1,
    backgroundColor: COLORES.fondo,
  },
  encabezado: {
    backgroundColor: COLORES.primario,
    paddingTop: 64,
    paddingHorizontal: 12,
    paddingBottom: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  botonIcono: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  titulo: {
    fontSize: 17,
    fontFamily: TIPOGRAFIA_PROMOTOR.negrita,
    color: COLORES.textoSobreOscuro,
  },
  barraBusqueda: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: COLORES.superficie,
    marginHorizontal: 16,
    marginTop: 14,
    borderRadius: 22,
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderWidth: 1,
    borderColor: COLORES.borde,
  },
  inputBusqueda: {
    flex: 1,
    fontSize: 14,
    fontFamily: TIPOGRAFIA_PROMOTOR.regular,
    color: COLORES.textoSobreOscuro,
  },
  filaQuitar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 16,
    marginTop: 12,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: COLORES.superficie,
    borderWidth: 1,
    borderColor: COLORES.borde,
    alignSelf: 'flex-start',
  },
  filaQuitarTexto: {
    fontSize: 13,
    fontFamily: TIPOGRAFIA_PROMOTOR.semiNegrita,
    color: COLORES.textoSecundario,
  },
  centrado: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  vacio: {
    fontSize: 14,
    fontFamily: TIPOGRAFIA_PROMOTOR.regular,
    color: COLORES.textoSecundario,
    textAlign: 'center',
  },
  lista: {
    padding: 16,
    gap: 10,
  },
  tarjeta: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORES.superficie,
    borderRadius: 14,
    padding: 12,
    gap: 12,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORES.oscuro,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarTexto: {
    fontSize: 16,
    fontFamily: TIPOGRAFIA_PROMOTOR.negrita,
    color: '#FFF',
  },
  tarjetaTexto: {
    flex: 1,
    gap: 2,
  },
  tarjetaNombre: {
    fontSize: 14,
    fontFamily: TIPOGRAFIA_PROMOTOR.semiNegrita,
    color: COLORES.textoSobreOscuro,
  },
  tarjetaDetalle: {
    fontSize: 12,
    fontFamily: TIPOGRAFIA_PROMOTOR.regular,
    color: COLORES.textoSecundario,
  },
  fondoModal: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  hoja: {
    backgroundColor: COLORES.superficie,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    gap: 12,
  },
  hojaEncabezado: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  hojaNombre: {
    fontSize: 17,
    fontFamily: TIPOGRAFIA_PROMOTOR.negrita,
    color: COLORES.textoSobreOscuro,
    flexShrink: 1,
    marginRight: 12,
  },
  cerrar: {
    fontSize: 14,
    fontFamily: TIPOGRAFIA_PROMOTOR.regular,
    color: COLORES.textoSecundario,
    textDecorationLine: 'underline',
  },
  campoDetalle: {
    gap: 2,
  },
  campoEtiqueta: {
    fontSize: 11,
    fontFamily: TIPOGRAFIA_PROMOTOR.medio,
    color: COLORES.textoSecundario,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  campoValor: {
    fontSize: 14,
    fontFamily: TIPOGRAFIA_PROMOTOR.regular,
    color: COLORES.textoSobreOscuro,
  },
  botonFacturar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: COLORES.primario,
    borderRadius: 14,
    paddingVertical: 14,
    marginTop: 8,
  },
  botonFacturarTexto: {
    color: '#FFF',
    fontSize: 14,
    fontFamily: TIPOGRAFIA_PROMOTOR.negrita,
  },
});
