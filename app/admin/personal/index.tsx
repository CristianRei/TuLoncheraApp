import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, View } from 'react-native';

import type { Persona, Rol } from '@/core/tipos';
import { getDb } from '@/db/client';
import { listarPersonalCompleto } from '@/db/personal';
import { ContenedorAncho } from '@/ui/ContenedorAncho';
import { Encabezado } from '@/ui/Encabezado';
import { EmptyState } from '@/ui/EmptyState';
import { FilterTabs } from '@/ui/FilterTabs';
import { ListRow } from '@/ui/ListRow';
import { SearchBar } from '@/ui/SearchBar';
import { COLORES_ADMIN, ESPACIADO_ADMIN } from '@/ui/tema';
import { useRequiereSesion } from '@/ui/useRequiereSesion';

type Filtro = 'ACTIVOS' | 'INACTIVOS';
type FiltroRol = 'TODOS' | Rol;

const ETIQUETA_ROL: Record<Rol, string> = {
  PROMOTOR: 'Promotor',
  CONDUCTOR: 'Conductor',
  BODEGA: 'Bodega',
  ADMIN: 'Administrador',
};

const OPCIONES_FILTRO: { valor: Filtro; etiqueta: string }[] = [
  { valor: 'ACTIVOS', etiqueta: 'Activos' },
  { valor: 'INACTIVOS', etiqueta: 'Inactivos' },
];

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
      <Encabezado
        titulo="Personal"
        rutaVolverTexto="Admin"
        accion={{ icono: 'add', onPress: () => router.push('/admin/personal/nuevo') }}
      />

      <ContenedorAncho anchoMaximo={720}>
        <View style={styles.controles}>
          <SearchBar valor={busqueda} onCambiar={setBusqueda} placeholder="Buscar por nombre o cédula..." />
          <FilterTabs opciones={OPCIONES_FILTRO} valorActivo={filtro} onCambiar={setFiltro} />
          <FilterTabs opciones={OPCIONES_ROL} valorActivo={filtroRol} onCambiar={setFiltroRol} />
        </View>
      </ContenedorAncho>

      {cargando ? (
        <View style={styles.centrado}>
          <ActivityIndicator size="large" color={COLORES_ADMIN.vino} />
        </View>
      ) : filtrados.length === 0 ? (
        <EmptyState
          icono="people-outline"
          mensaje={
            busqueda
              ? 'Nadie coincide con la búsqueda.'
              : filtro === 'ACTIVOS'
                ? 'Todavía no hay personal registrado.'
                : 'No hay nadie dado de baja.'
          }
        />
      ) : (
        <ContenedorAncho anchoMaximo={720} llenarAlto>
          <FlatList
            data={filtrados}
            keyExtractor={(p) => p.id}
            contentContainerStyle={styles.lista}
            renderItem={({ item }) => (
              <ListRow
                titulo={item.nombre}
                subtitulo={
                  [item.cedula, item.celular].filter(Boolean).join(' · ') || 'Sin datos adicionales'
                }
                badge={ETIQUETA_ROL[item.rol]}
                onPress={() => router.push(`/admin/personal/${item.id}`)}
              />
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
  controles: {
    paddingHorizontal: ESPACIADO_ADMIN.xl,
    paddingTop: ESPACIADO_ADMIN.lg,
    gap: ESPACIADO_ADMIN.md,
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
});
