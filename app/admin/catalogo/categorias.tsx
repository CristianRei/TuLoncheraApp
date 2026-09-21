import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

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
import { COLORES } from '@/ui/colores';
import { ContenedorAncho } from '@/ui/ContenedorAncho';
import { useRequiereSesion } from '@/ui/useRequiereSesion';

export default function CategoriasCatalogo() {
  const usuario = useRequiereSesion(['ADMIN']);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [conteos, setConteos] = useState<Map<string, number>>(new Map());
  const [cargando, setCargando] = useState(true);
  const [nombreNuevo, setNombreNuevo] = useState('');
  const [guardando, setGuardando] = useState(false);
  const insets = useSafeAreaInsets();

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

  async function agregar() {
    if (nombreNuevo.trim().length === 0) return;
    setGuardando(true);
    try {
      const db = await getDb();
      const dispositivoId = await getDispositivoId(db);
      await crearCategoria(db, nombreNuevo.trim(), dispositivoId);
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
      <View style={[styles.encabezado, { paddingTop: insets.top + 20 }]}>
        <ContenedorAncho anchoMaximo={720}>
          <Pressable onPress={() => router.back()}>
            <Text style={styles.volver}>‹ Catálogo</Text>
          </Pressable>
          <Text style={styles.titulo}>Categorías</Text>
          <Text style={styles.subtitulo}>
            Solo se puede elegir entre estas — para evitar categorías repetidas por mayúsculas o
            espacios, agrégalas aquí.
          </Text>
        </ContenedorAncho>
      </View>

      <ContenedorAncho anchoMaximo={720}>
        <View style={styles.formulario}>
          <TextInput
            style={styles.input}
            placeholder="Nombre de la categoría nueva (ej. Galletas)"
            placeholderTextColor="#999"
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
          <ActivityIndicator size="large" color={COLORES.oscuro} />
        </View>
      ) : categorias.length === 0 ? (
        <View style={styles.centrado}>
          <Text style={styles.vacio}>Todavía no hay categorías.</Text>
        </View>
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
    backgroundColor: '#FBEDED',
  },
  encabezado: {
    backgroundColor: COLORES.oscuro,
    paddingHorizontal: 20,
    paddingBottom: 16,
    gap: 4,
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
    marginTop: 4,
  },
  subtitulo: {
    color: '#FFE9E2',
    fontSize: 12,
    marginTop: 2,
  },
  formulario: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  input: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 11,
    fontSize: 14,
    borderWidth: 1,
    borderColor: '#EBD3D3',
  },
  botonAgregar: {
    backgroundColor: COLORES.oscuro,
    borderRadius: 12,
    paddingHorizontal: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  botonDeshabilitado: {
    opacity: 0.5,
  },
  botonAgregarTexto: {
    color: '#FFF',
    fontSize: 14,
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
  lista: {
    padding: 20,
    gap: 10,
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
  filaInactiva: {
    opacity: 0.55,
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
  filaNombreInactivo: {
    textDecorationLine: 'line-through',
  },
  filaDetalle: {
    fontSize: 12,
    color: '#888',
  },
  botonAlternar: {
    borderWidth: 1,
    borderColor: COLORES.oscuro,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  botonAlternarTexto: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORES.oscuro,
  },
});
