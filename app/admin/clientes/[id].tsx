import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { Cliente } from '@/core/tipos';
import { getDb } from '@/db/client';
import { eliminarCliente, obtenerCliente } from '@/db/clientes';
import { COLORES } from '@/ui/colores';
import { ContenedorAncho } from '@/ui/ContenedorAncho';
import { ModalConfirmacion } from '@/ui/ModalConfirmacion';
import { useEsPantallaAncha } from '@/ui/useEsPantallaAncha';
import { useRequiereSesion } from '@/ui/useRequiereSesion';

function formatearFecha(iso: string): string {
  return new Date(iso).toLocaleDateString('es-CO', { dateStyle: 'long' });
}

export default function DetalleCliente() {
  const usuario = useRequiereSesion(['ADMIN']);
  const { id } = useLocalSearchParams<{ id: string }>();
  const [cliente, setCliente] = useState<Cliente | null>(null);
  const [cargando, setCargando] = useState(true);
  const [eliminando, setEliminando] = useState(false);
  const [modalEliminarVisible, setModalEliminarVisible] = useState(false);
  const insets = useSafeAreaInsets();
  const anchaPantalla = useEsPantallaAncha();

  const cargar = useCallback(async () => {
    if (!id) return;
    setCargando(true);
    try {
      const db = await getDb();
      setCliente(await obtenerCliente(db, id));
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

  async function confirmarEliminar() {
    if (!cliente) return;
    setEliminando(true);
    try {
      const db = await getDb();
      await eliminarCliente(db, cliente.id);
      setModalEliminarVisible(false);
      router.back();
    } finally {
      setEliminando(false);
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
        <ContenedorAncho anchoMaximo={720} style={styles.encabezadoContenido}>
          {!anchaPantalla && (
            <Pressable onPress={() => router.back()}>
              <Text style={styles.volver}>‹ Clientes</Text>
            </Pressable>
          )}
          <Text style={anchaPantalla ? styles.tituloAncho : styles.titulo}>
            {cliente?.nombreCompleto ?? 'Cliente'}
          </Text>
        </ContenedorAncho>
      </View>

      {cargando ? (
        <View style={styles.centrado}>
          <ActivityIndicator size="large" color={COLORES.oscuro} />
        </View>
      ) : !cliente ? (
        <View style={styles.centrado}>
          <Text style={styles.vacio}>Este cliente ya no existe.</Text>
        </View>
      ) : (
        <ContenedorAncho anchoMaximo={720} llenarAlto>
          <ScrollView contentContainerStyle={styles.scroll}>
            <View style={styles.tarjeta}>
              <Campo etiqueta="Nombre completo" valor={cliente.nombreCompleto} />
              <Campo etiqueta="Teléfono" valor={cliente.telefono} />
              <Campo etiqueta="Dirección" valor={cliente.direccion} />
              <Campo etiqueta="Ciudad" valor={cliente.ciudad} />
              <Campo etiqueta="Empresa donde trabaja" valor={cliente.empresa} />
              <Campo etiqueta="Nota" valor={cliente.nota} />
              <Campo etiqueta="Registrado el" valor={formatearFecha(cliente.tsCliente)} />
            </View>

            <Pressable
              style={[styles.botonEliminar, eliminando && styles.botonDeshabilitado]}
              onPress={() => setModalEliminarVisible(true)}
              disabled={eliminando}
            >
              {eliminando ? (
                <ActivityIndicator color="#B00020" size="small" />
              ) : (
                <Text style={styles.botonEliminarTexto}>Eliminar cliente</Text>
              )}
            </Pressable>
          </ScrollView>
        </ContenedorAncho>
      )}

      {cliente && (
        <ModalConfirmacion
          visible={modalEliminarVisible}
          titulo="Eliminar cliente"
          mensaje={`¿Seguro que quieres eliminar a "${cliente.nombreCompleto}"? Esta acción no se puede deshacer. Las ventas que tenía asignadas quedarán sin cliente.`}
          textoConfirmar="Eliminar"
          destructivo
          cargando={eliminando}
          onConfirmar={confirmarEliminar}
          onCancelar={() => setModalEliminarVisible(false)}
        />
      )}
    </View>
  );
}

function Campo({ etiqueta, valor }: { etiqueta: string; valor: string | null }) {
  return (
    <View style={styles.campo}>
      <Text style={styles.campoEtiqueta}>{etiqueta}</Text>
      <Text style={styles.campoValor}>{valor || '—'}</Text>
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
    gap: 8,
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
  tituloAncho: {
    color: COLORES.oscuro,
    fontSize: 20,
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
    textAlign: 'center',
  },
  scroll: {
    padding: 20,
    gap: 16,
  },
  tarjeta: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 18,
    gap: 14,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  campo: {
    gap: 2,
  },
  campoEtiqueta: {
    fontSize: 11,
    color: '#999',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  campoValor: {
    fontSize: 15,
    color: '#333',
    fontWeight: '600',
  },
  botonEliminar: {
    borderWidth: 1.5,
    borderColor: '#B00020',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  botonEliminarTexto: {
    color: '#B00020',
    fontSize: 15,
    fontWeight: '700',
  },
  botonDeshabilitado: {
    opacity: 0.5,
  },
});
