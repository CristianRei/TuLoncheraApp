import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import type { Producto } from '@/core/tipos';
import { getDb } from '@/db/client';
import { guardarFotoProducto } from '@/db/fotos';
import {
  actualizarProducto,
  eliminarProducto,
  obtenerProducto,
  restaurarProducto,
} from '@/db/productos';
import { ContenedorAncho } from '@/ui/ContenedorAncho';
import { Encabezado } from '@/ui/Encabezado';
import { EmptyState } from '@/ui/EmptyState';
import { FormularioProducto, type ValoresProducto } from '@/ui/FormularioProducto';
import { ANCHO_ADMIN, COLORES_ADMIN, ESPACIADO_ADMIN, TIPOGRAFIA_ADMIN, RADII_ADMIN, TEXTO_ADMIN } from '@/ui/tema';
import { useRequiereSesion } from '@/ui/useRequiereSesion';

export default function EditarProducto() {
  const usuario = useRequiereSesion(['ADMIN']);
  const { id } = useLocalSearchParams<{ id: string }>();
  const [producto, setProducto] = useState<Producto | null>(null);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);

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
      <Encabezado titulo="Editar producto" rutaVolverTexto="Catálogo" anchoMaximo={ANCHO_ADMIN.formulario} />

      {cargando ? (
        <View style={styles.centrado}>
          <ActivityIndicator size="large" color={COLORES_ADMIN.vino} />
        </View>
      ) : !producto ? (
        <EmptyState mensaje="Este producto ya no existe." />
      ) : (
        <ContenedorAncho anchoMaximo={ANCHO_ADMIN.formulario} llenarAlto>
          <FormularioProducto
            valorInicial={{
              nombre: producto.nombre,
              precio: producto.precio,
              fotoUri: producto.fotoUri,
              codigoBarras: producto.codigoBarras,
              marca: producto.marca,
              categoriaId: producto.categoriaId,
            }}
            colorAcento={COLORES_ADMIN.vino}
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
    backgroundColor: COLORES_ADMIN.background,
  },
  centrado: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: ESPACIADO_ADMIN.xxl,
  },
  botonEstado: {
    marginTop: 4,
    borderRadius: RADII_ADMIN.md,
    paddingVertical: 12,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: COLORES_ADMIN.dorado,
  },
  botonEstadoTexto: {
    ...TEXTO_ADMIN.cuerpo,
    fontFamily: TIPOGRAFIA_ADMIN.negrita,
    color: COLORES_ADMIN.dorado,
  },
  botonEliminar: {
    borderColor: COLORES_ADMIN.error,
  },
  botonEliminarTexto: {
    color: COLORES_ADMIN.error,
  },
});
