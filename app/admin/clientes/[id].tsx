import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import type { Cliente } from '@/core/tipos';
import { getDb } from '@/db/client';
import { eliminarCliente, obtenerCliente } from '@/db/clientes';
import { getDispositivoId } from '@/db/dispositivo';
import { ContenedorAncho } from '@/ui/ContenedorAncho';
import { Encabezado } from '@/ui/Encabezado';
import { EmptyState } from '@/ui/EmptyState';
import { ModalConfirmacion } from '@/ui/ModalConfirmacion';
import { ANCHO_ADMIN, COLORES_ADMIN, ESPACIADO_ADMIN, RADII_ADMIN, TIPOGRAFIA_ADMIN } from '@/ui/tema';
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
    if (!cliente || !usuario) return;
    setEliminando(true);
    try {
      const db = await getDb();
      const dispositivoId = await getDispositivoId(db);
      await eliminarCliente(db, cliente.id, dispositivoId, usuario.id);
      setModalEliminarVisible(false);
      router.back();
    } finally {
      setEliminando(false);
    }
  }

  return (
    <View style={styles.contenedor}>
      <Encabezado titulo={cliente?.nombreCompleto ?? 'Cliente'} rutaVolverTexto="Clientes" />

      {cargando ? (
        <View style={styles.centrado}>
          <ActivityIndicator size="large" color={COLORES_ADMIN.vino} />
        </View>
      ) : !cliente ? (
        <EmptyState mensaje="Este cliente ya no existe." />
      ) : (
        <ContenedorAncho anchoMaximo={ANCHO_ADMIN.lista} llenarAlto>
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
                <ActivityIndicator color={COLORES_ADMIN.error} size="small" />
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
    backgroundColor: COLORES_ADMIN.background,
  },
  centrado: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: ESPACIADO_ADMIN.xxl,
  },
  scroll: {
    padding: ESPACIADO_ADMIN.xl,
    gap: ESPACIADO_ADMIN.lg,
  },
  tarjeta: {
    backgroundColor: COLORES_ADMIN.superficieMasBaja,
    borderRadius: RADII_ADMIN.lg,
    borderWidth: 1,
    borderColor: COLORES_ADMIN.bordeSuave,
    padding: 18,
    gap: ESPACIADO_ADMIN.lg,
  },
  campo: {
    gap: 2,
  },
  campoEtiqueta: {
    fontSize: 11,
    fontFamily: TIPOGRAFIA_ADMIN.medio,
    color: COLORES_ADMIN.textoSecundario,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  campoValor: {
    fontSize: 15,
    fontFamily: TIPOGRAFIA_ADMIN.semiNegrita,
    color: COLORES_ADMIN.texto,
  },
  botonEliminar: {
    borderWidth: 1.5,
    borderColor: COLORES_ADMIN.error,
    borderRadius: RADII_ADMIN.lg,
    paddingVertical: 14,
    alignItems: 'center',
  },
  botonEliminarTexto: {
    color: COLORES_ADMIN.error,
    fontSize: 15,
    fontFamily: TIPOGRAFIA_ADMIN.negrita,
  },
  botonDeshabilitado: {
    opacity: 0.5,
  },
});
