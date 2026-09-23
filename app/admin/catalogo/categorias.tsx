import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import type { Categoria } from '@/core/tipos';
import { getDb } from '@/db/client';
import {
  contarProductosPorCategoria,
  crearCategoria,
  desactivarCategoria,
  listarCategorias,
  reactivarCategoria,
} from '@/db/categorias';
import { getDispositivoId } from '@/db/dispositivo';
import { ContenedorAncho } from '@/ui/ContenedorAncho';
import { Encabezado } from '@/ui/Encabezado';
import { EmptyState } from '@/ui/EmptyState';
import { COLORES_ADMIN, ESPACIADO_ADMIN, RADII_ADMIN, TIPOGRAFIA_ADMIN } from '@/ui/tema';
import { useRequiereSesion } from '@/ui/useRequiereSesion';

export default function CategoriasCatalogo() {
  const usuario = useRequiereSesion(['ADMIN']);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [conteos, setConteos] = useState<Map<string, number>>(new Map());
  const [cargando, setCargando] = useState(true);
  const [nombreNuevo, setNombreNuevo] = useState('');
  const [guardando, setGuardando] = useState(false);

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const db = await getDb();
      const [lista, mapaConteos] = await Promise.all([
        listarCategorias(db, { incluirInactivas: true }),
        contarProductosPorCategoria(db),
      ]);
      setCategorias(lista);
      setConteos(mapaConteos);
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
  const usuarioActual = usuario;

  async function agregar() {
    if (nombreNuevo.trim().length === 0) return;
    setGuardando(true);
    try {
      const db = await getDb();
      const dispositivoId = await getDispositivoId(db);
      await crearCategoria(db, nombreNuevo.trim(), dispositivoId, { creadoPorId: usuarioActual.id });
      setNombreNuevo('');
      await cargar();
    } finally {
      setGuardando(false);
    }
  }

  async function alternar(categoria: Categoria) {
    const db = await getDb();
    if (categoria.activo) await desactivarCategoria(db, categoria.id);
    else await reactivarCategoria(db, categoria.id);
    await cargar();
  }

  return (
    <View style={styles.contenedor}>
      <Encabezado titulo="Categorías" rutaVolverTexto="Catálogo" />
      <ContenedorAncho anchoMaximo={720}>
        <Text style={styles.subtitulo}>
          Solo se puede elegir entre estas — para evitar categorías repetidas por mayúsculas o
          espacios, agrégalas aquí.
        </Text>
      </ContenedorAncho>

      <ContenedorAncho anchoMaximo={720}>
        <View style={styles.formulario}>
          <TextInput
            style={styles.input}
            placeholder="Nombre de la categoría nueva (ej. Galletas)"
            placeholderTextColor={COLORES_ADMIN.textoSecundario}
            value={nombreNuevo}
            onChangeText={setNombreNuevo}
            editable={!guardando}
            onSubmitEditing={agregar}
          />
          <Pressable
            style={[styles.botonAgregar, (nombreNuevo.trim().length === 0 || guardando) && styles.botonDeshabilitado]}
            onPress={agregar}
            disabled={nombreNuevo.trim().length === 0 || guardando}
          >
            {guardando ? <ActivityIndicator color="#FFF" size="small" /> : <Text style={styles.botonAgregarTexto}>Agregar</Text>}
          </Pressable>
        </View>
      </ContenedorAncho>

      {cargando ? (
        <View style={styles.centrado}>
          <ActivityIndicator size="large" color={COLORES_ADMIN.vino} />
        </View>
      ) : categorias.length === 0 ? (
        <EmptyState icono="pricetag-outline" mensaje="Todavía no hay categorías." />
      ) : (
        <ContenedorAncho anchoMaximo={720} llenarAlto>
          <FlatList
            data={categorias}
            keyExtractor={(c) => c.id}
            contentContainerStyle={styles.lista}
            renderItem={({ item }) => (
              <View style={[styles.fila, !item.activo && styles.filaInactiva]}>
                <View style={styles.filaTexto}>
                  <Text style={[styles.filaNombre, !item.activo && styles.filaNombreInactivo]}>
                    {item.nombre}
                  </Text>
                  <Text style={styles.filaDetalle}>
                    {conteos.get(item.id) ?? 0} producto{(conteos.get(item.id) ?? 0) === 1 ? '' : 's'}
                    {!item.activo ? ' · Desactivada' : ''}
                  </Text>
                </View>
                <Pressable style={styles.botonAlternar} onPress={() => alternar(item)}>
                  <Text style={styles.botonAlternarTexto}>{item.activo ? 'Desactivar' : 'Reactivar'}</Text>
                </Pressable>
              </View>
            )}
          />
        </ContenedorAncho>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  contenedor: {
    flex: 1,
    backgroundColor: COLORES_ADMIN.background,
  },
  subtitulo: {
    fontSize: 12,
    fontFamily: TIPOGRAFIA_ADMIN.regular,
    color: COLORES_ADMIN.textoSecundario,
    paddingTop: ESPACIADO_ADMIN.xs,
  },
  formulario: {
    flexDirection: 'row',
    gap: ESPACIADO_ADMIN.sm,
    paddingTop: ESPACIADO_ADMIN.lg,
  },
  input: {
    flex: 1,
    backgroundColor: COLORES_ADMIN.superficieMasBaja,
    borderRadius: RADII_ADMIN.md,
    paddingHorizontal: ESPACIADO_ADMIN.lg,
    paddingVertical: 11,
    fontSize: 14,
    fontFamily: TIPOGRAFIA_ADMIN.regular,
    color: COLORES_ADMIN.texto,
    borderWidth: 1,
    borderColor: COLORES_ADMIN.bordeSuave,
  },
  botonAgregar: {
    backgroundColor: COLORES_ADMIN.vino,
    borderRadius: RADII_ADMIN.md,
    paddingHorizontal: ESPACIADO_ADMIN.xl,
    alignItems: 'center',
    justifyContent: 'center',
  },
  botonDeshabilitado: {
    opacity: 0.5,
  },
  botonAgregarTexto: {
    color: '#FFF',
    fontSize: 14,
    fontFamily: TIPOGRAFIA_ADMIN.negrita,
  },
  centrado: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: ESPACIADO_ADMIN.xxl,
  },
  lista: {
    padding: ESPACIADO_ADMIN.xl,
    gap: ESPACIADO_ADMIN.sm,
  },
  fila: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: COLORES_ADMIN.superficieMasBaja,
    borderRadius: RADII_ADMIN.md,
    borderWidth: 1,
    borderColor: COLORES_ADMIN.bordeSuave,
    padding: ESPACIADO_ADMIN.md,
  },
  filaInactiva: {
    opacity: 0.55,
  },
  filaTexto: {
    flex: 1,
    gap: 2,
  },
  filaNombre: {
    fontSize: 15,
    fontFamily: TIPOGRAFIA_ADMIN.semiNegrita,
    color: COLORES_ADMIN.texto,
  },
  filaNombreInactivo: {
    textDecorationLine: 'line-through',
  },
  filaDetalle: {
    fontSize: 12,
    fontFamily: TIPOGRAFIA_ADMIN.regular,
    color: COLORES_ADMIN.textoSecundario,
  },
  botonAlternar: {
    borderWidth: 1,
    borderColor: COLORES_ADMIN.vino,
    borderRadius: RADII_ADMIN.sm,
    paddingHorizontal: ESPACIADO_ADMIN.md,
    paddingVertical: 7,
  },
  botonAlternarTexto: {
    fontSize: 12,
    fontFamily: TIPOGRAFIA_ADMIN.negrita,
    color: COLORES_ADMIN.vino,
  },
});
