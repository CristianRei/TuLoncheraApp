import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { COLORES } from '@/ui/colores';
import { useSesion } from '@/ui/SesionContext';
import { useRequiereSesion } from '@/ui/useRequiereSesion';

const MODULOS = [
  {
    ruta: '/admin/catalogo',
    titulo: 'Catálogo de productos',
    descripcion: 'Agregar, editar y eliminar productos y precios.',
  },
  {
    ruta: '/admin/inventario',
    titulo: 'Inventario',
    descripcion: 'Ver el stock de bodega e ingresar pedidos.',
  },
  {
    ruta: '/admin/cargue',
    titulo: 'Cargue a promotor',
    descripcion: 'Asignar productos del stock de bodega a un promotor.',
  },
  {
    ruta: '/admin/ventas',
    titulo: 'Ventas',
    descripcion: 'Ver las ventas registradas por los promotores.',
  },
] as const;

export default function HomeAdmin() {
  const usuario = useRequiereSesion(['ADMIN']);
  const { cerrarSesion } = useSesion();

  if (!usuario) return null;

  function salir() {
    cerrarSesion();
    router.replace('/');
  }

  return (
    <View style={styles.contenedor}>
      <View style={styles.encabezado}>
        <View>
          <Text style={styles.etiqueta}>Administración</Text>
          <Text style={styles.saludo}>{usuario.nombre}</Text>
        </View>
        <Pressable onPress={salir}>
          <Text style={styles.cerrarSesion}>Cerrar sesión</Text>
        </Pressable>
      </View>
      <View style={styles.cuerpo}>
        {MODULOS.map((modulo) => (
          <Pressable
            key={modulo.ruta}
            style={styles.tarjeta}
            onPress={() => router.push(modulo.ruta)}
          >
            <View style={styles.tarjetaTexto}>
              <Text style={styles.tarjetaTitulo}>{modulo.titulo}</Text>
              <Text style={styles.tarjetaDescripcion}>{modulo.descripcion}</Text>
            </View>
            <Text style={styles.tarjetaFlecha}>›</Text>
          </Pressable>
        ))}
      </View>
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
    paddingTop: 64,
    paddingHorizontal: 20,
    paddingBottom: 24,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  etiqueta: {
    fontSize: 12,
    color: '#F3D6D6',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  saludo: {
    fontSize: 20,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  cerrarSesion: {
    fontSize: 13,
    color: '#FFFFFF',
    textDecorationLine: 'underline',
  },
  cuerpo: {
    padding: 20,
    gap: 12,
  },
  tarjeta: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 16,
    gap: 12,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  tarjetaTexto: {
    flex: 1,
    gap: 4,
  },
  tarjetaTitulo: {
    fontSize: 16,
    fontWeight: '700',
    color: '#333',
  },
  tarjetaDescripcion: {
    fontSize: 13,
    color: '#777',
  },
  tarjetaFlecha: {
    fontSize: 22,
    color: COLORES.oscuro,
  },
});
