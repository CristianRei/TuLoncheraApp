import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { Persona, Rol } from '@/core/tipos';
import { getDb } from '@/db/client';
import { listarPersonalCompleto } from '@/db/personal';
import { COLORES } from '@/ui/colores';
import { ContenedorAncho } from '@/ui/ContenedorAncho';
import { useEsPantallaAncha } from '@/ui/useEsPantallaAncha';
import { useRequiereSesion } from '@/ui/useRequiereSesion';

type Filtro = 'ACTIVOS' | 'INACTIVOS';
type FiltroRol = 'TODOS' | Rol;

const ETIQUETA_ROL: Record<Rol, string> = {
  PROMOTOR: 'Promotor',
  CONDUCTOR: 'Conductor',
  BODEGA: 'Bodega',
  ADMIN: 'Administrador',
};

const OPCIONES_ROL: { valor: FiltroRol; etiqueta: string }[] = [
  { valor: 'TODOS', etiqueta: 'Todos' },
  { valor: 'PROMOTOR', etiqueta: 'Promotores' },
  { valor: 'CONDUCTOR', etiqueta: 'Conductores' },
  { valor: 'BODEGA', etiqueta: 'Bodega' },
  { valor: 'ADMIN', etiqueta: 'Admins' },
];

export default function Personal() {
  const usuario = useRequiereSesion(['ADMIN']);
  const [personal, setPersonal] = useState<Persona[]>([]);
  const [filtro, setFiltro] = useState<Filtro>('ACTIVOS');
  const [filtroRol, setFiltroRol] = useState<FiltroRol>('TODOS');
  const [busqueda, setBusqueda] = useState('');
  const [cargando, setCargando] = useState(true);
  const insets = useSafeAreaInsets();
  const anchaPantalla = useEsPantallaAncha();

  const cargar = useCallback(async (filtroActual: Filtro, rolActual: FiltroRol) => {
    setCargando(true);
    try {
      const db = await getDb();
      setPersonal(
        await listarPersonalCompleto(db, {
          incluirInactivos: filtroActual === 'INACTIVOS',
          rol: rolActual === 'TODOS' ? undefined : rolActual,
        })
      );
    } finally {
      setCargando(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      cargar(filtro, filtroRol);
    }, [cargar, filtro, filtroRol])
  );

  if (!usuario) return null;

  const filtrados = personal.filter((p) => {
    const termino = busqueda.trim().toLowerCase();
    if (!termino) return true;
    return p.nombre.toLowerCase().includes(termino) || (p.cedula ?? '').includes(termino);
  });

  return (
    <View style={styles.contenedor}>
      <View
        style={[
          anchaPantalla ? styles.encabezadoAncho : styles.encabezado,
          { paddingTop: anchaPantalla ? 20 : insets.top + 20 },
        ]}
      >
        <ContenedorAncho anchoMaximo={720}>
          <View style={styles.encabezadoFila}>
            {!anchaPantalla && (
              <Pressable onPress={() => router.back()}>
                <Text style={styles.volver}>‹ Admin</Text>
              </Pressable>
            )}
            <Text style={anchaPantalla ? styles.tituloAncho : styles.titulo}>Personal</Text>
            <Pressable style={styles.botonNuevo} onPress={() => router.push('/admin/personal/nuevo')}>
              <Text style={styles.botonNuevoTexto}>+</Text>
            </Pressable>
          </View>
        </ContenedorAncho>
      </View>

      <ContenedorAncho anchoMaximo={720}>
        <View style={styles.controles}>
          <TextInput
            style={styles.busqueda}
            placeholder="Buscar por nombre o cédula..."
            placeholderTextColor="#999"
            value={busqueda}
            onChangeText={setBusqueda}
          />
          <View style={styles.tabs}>
            <Pressable
              style={[styles.tab, filtro === 'ACTIVOS' && styles.tabActivo]}
              onPress={() => setFiltro('ACTIVOS')}
            >
              <Text style={[styles.tabTexto, filtro === 'ACTIVOS' && styles.tabTextoActivo]}>Activos</Text>
            </Pressable>
            <Pressable
              style={[styles.tab, filtro === 'INACTIVOS' && styles.tabActivo]}
              onPress={() => setFiltro('INACTIVOS')}
            >
              <Text style={[styles.tabTexto, filtro === 'INACTIVOS' && styles.tabTextoActivo]}>Inactivos</Text>
            </Pressable>
          </View>
          <View style={styles.tabsRol}>
            {OPCIONES_ROL.map((opcion) => (
              <Pressable
                key={opcion.valor}
                style={[styles.chipRol, filtroRol === opcion.valor && styles.chipRolActivo]}
                onPress={() => setFiltroRol(opcion.valor)}
              >
                <Text style={[styles.chipRolTexto, filtroRol === opcion.valor && styles.chipRolTextoActivo]}>
                  {opcion.etiqueta}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
      </ContenedorAncho>

      {cargando ? (
        <View style={styles.centrado}>
          <ActivityIndicator size="large" color={COLORES.oscuro} />
        </View>
      ) : filtrados.length === 0 ? (
        <View style={styles.centrado}>
          <Text style={styles.vacio}>
            {busqueda
              ? 'Nadie coincide con la búsqueda.'
              : filtro === 'ACTIVOS'
                ? 'Todavía no hay personal registrado.'
                : 'No hay nadie dado de baja.'}
          </Text>
        </View>
      ) : (
        <ContenedorAncho anchoMaximo={720} llenarAlto>
          <FlatList
            data={filtrados}
            keyExtractor={(p) => p.id}
            contentContainerStyle={styles.lista}
            renderItem={({ item }) => (
              <Pressable style={styles.fila} onPress={() => router.push(`/admin/personal/${item.id}`)}>
                <View style={styles.filaTexto}>
                  <View style={styles.filaNombreFila}>
                    <Text style={styles.filaNombre}>{item.nombre}</Text>
                    <View style={styles.badgeRol}>
                      <Text style={styles.badgeRolTexto}>{ETIQUETA_ROL[item.rol]}</Text>
                    </View>
                  </View>
                  <Text style={styles.filaDetalle}>
                    {[item.cedula, item.celular].filter(Boolean).join(' · ') || 'Sin datos adicionales'}
                  </Text>
                </View>
                <Text style={styles.filaFlecha}>›</Text>
              </Pressable>
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
  },
  encabezadoAncho: {
    backgroundColor: 'transparent',
    paddingHorizontal: 20,
    paddingBottom: 16,
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
  tituloAncho: {
    color: COLORES.oscuro,
    fontSize: 20,
    fontWeight: '700',
  },
  botonNuevo: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: COLORES.primario,
    alignItems: 'center',
    justifyContent: 'center',
  },
  botonNuevoTexto: {
    color: '#3A2400',
    fontSize: 20,
    fontWeight: '700',
    lineHeight: 22,
  },
  controles: {
    paddingHorizontal: 20,
    paddingTop: 16,
    gap: 12,
  },
  busqueda: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    paddingHorizontal: 18,
    paddingVertical: 10,
    fontSize: 15,
    borderWidth: 1,
    borderColor: '#EBD3D3',
  },
  tabs: {
    flexDirection: 'row',
    gap: 8,
  },
  tab: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#EBD3D3',
  },
  tabActivo: {
    backgroundColor: COLORES.oscuro,
    borderColor: COLORES.oscuro,
  },
  tabTexto: {
    fontSize: 13,
    fontWeight: '600',
    color: '#666',
  },
  tabTextoActivo: {
    color: '#FFFFFF',
  },
  tabsRol: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  chipRol: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#EBD3D3',
  },
  chipRolActivo: {
    backgroundColor: COLORES.primario,
    borderColor: COLORES.primario,
  },
  chipRolTexto: {
    fontSize: 12,
    fontWeight: '600',
    color: '#666',
  },
  chipRolTextoActivo: {
    color: '#3A2400',
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
  filaNombreFila: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
  },
  filaNombre: {
    fontSize: 15,
    fontWeight: '700',
    color: '#333',
  },
  badgeRol: {
    backgroundColor: '#FBEDED',
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  badgeRolTexto: {
    fontSize: 10,
    fontWeight: '700',
    color: COLORES.oscuro,
    textTransform: 'uppercase',
  },
  filaDetalle: {
    fontSize: 12,
    color: '#888',
  },
  filaFlecha: {
    fontSize: 20,
    color: COLORES.oscuro,
  },
});
