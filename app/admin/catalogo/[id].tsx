import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { Producto } from '@/core/tipos';
import { getDb } from '@/db/client';
import { guardarFotoProducto } from '@/db/fotos';
import {
  actualizarProducto,
  eliminarProducto,
  obtenerProducto,
  restaurarProducto,
} from '@/db/productos';
import { COLORES } from '@/ui/colores';
import { ContenedorAncho } from '@/ui/ContenedorAncho';
import { FormularioProducto, type ValoresProducto } from '@/ui/FormularioProducto';
import { useRequiereSesion } from '@/ui/useRequiereSesion';

export default function EditarProducto() {
  const usuario = useRequiereSesion(['ADMIN']);
  const { id } = useLocalSearchParams<{ id: string }>();
  const [producto, setProducto] = useState<Producto | null>(null);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const insets = useSafeAreaInsets();

  useEffect(() => {
    (async () => {
      const db = await getDb();
      const encontrado = await obtenerProducto(db, id);
      setProducto(encontrado);
      setCargando(false);
    })();
  }, [id]);

  if (!usuario) return null;

  async function guardarFoto(uriOrigen: string): Promise<string> {
    return guardarFotoProducto(uriOrigen, id);
  }

  async function guardar(valores: ValoresProducto) {
    setGuardando(true);
    try {
      const db = await getDb();
      await actualizarProducto(db, id, valores);
      router.back();
    } finally {
      setGuardando(false);
    }
  }

  async function alternarActivo() {
    if (!producto) return;
    const db = await getDb();
    if (producto.activo) {
      await eliminarProducto(db, id);
    } else {
      await restaurarProducto(db, id);
    }
    router.back();
  }

  return (
    <View style={styles.contenedor}>
      <View style={[styles.encabezado, { paddingTop: insets.top + 20 }]}>
        <ContenedorAncho anchoMaximo={640} style={styles.encabezadoContenido}>
          <Pressable onPress={() => router.back()}>
            <Text style={styles.volver}>‹ Catálogo</Text>
          </Pressable>
          <Text style={styles.titulo}>Editar producto</Text>
        </ContenedorAncho>
      </View>

      {cargando ? (
        <View style={styles.centrado}>
          <ActivityIndicator size="large" color={COLORES.oscuro} />
        </View>
      ) : !producto ? (
        <View style={styles.centrado}>
          <Text style={styles.vacio}>Este producto ya no existe.</Text>
        </View>
      ) : (
        <ContenedorAncho anchoMaximo={640} llenarAlto>
          <FormularioProducto
            valorInicial={{
              nombre: producto.nombre,
              precio: producto.precio,
              fotoUri: producto.fotoUri,
              codigoBarras: producto.codigoBarras,
              marca: producto.marca,
              categoriaId: producto.categoriaId,
            }}
            colorAcento={COLORES.oscuro}
            guardando={guardando}
            onGuardar={guardar}
            onGuardarFoto={guardarFoto}
            textoBoton="Guardar cambios"
            extra={
              <Pressable
                style={[styles.botonEstado, producto.activo && styles.botonEliminar]}
                onPress={alternarActivo}
              >
                <Text
                  style={[
                    styles.botonEstadoTexto,
                    producto.activo && styles.botonEliminarTexto,
                  ]}
                >
                  {producto.activo ? 'Eliminar producto' : 'Restaurar producto'}
                </Text>
              </Pressable>
            }
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
  },
  encabezadoContenido: {
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
  },
  botonEstado: {
    marginTop: 4,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: COLORES.primario,
  },
  botonEstadoTexto: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORES.primario,
  },
  botonEliminar: {
    borderColor: '#B00020',
  },
  botonEliminarTexto: {
    color: '#B00020',
  },
});
