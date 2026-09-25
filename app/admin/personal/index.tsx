import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, View } from 'react-native';

import type { Persona, Rol } from '@/core/tipos';
import { getDb } from '@/db/client';
import { listarPersonalCompleto } from '@/db/personal';
import { ContenedorAncho } from '@/ui/ContenedorAncho';
import { Encabezado } from '@/ui/Encabezado';
import { EmptyState } from '@/ui/EmptyState';
import { FiltroSegmentado } from '@/ui/FiltroSegmentado';
import { CampoFiltro, FilaFiltrosSuperior, FilaSelectores, FiltrosAplicados, PanelFiltros, SelectorFiltro, type FiltroAplicado } from '@/ui/PanelFiltros';
import { SelectorModal } from '@/ui/SelectorModal';
import { ListRow } from '@/ui/ListRow';
import { SearchBar } from '@/ui/SearchBar';
import { ANCHO_ADMIN, COLORES_ADMIN, ESPACIADO_ADMIN } from '@/ui/tema';
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
  const [selectorRolVisible, setSelectorRolVisible] = useState(false);
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

  const etiquetaRol = OPCIONES_ROL.find((o) => o.valor === filtroRol)?.etiqueta ?? '';

  return (
    <View style={styles.contenedor}>
      <Encabezado
        titulo="Personal"
        rutaVolverTexto="Admin"
        accion={{ icono: 'add', onPress: () => router.push('/admin/personal/nuevo') }}
      />

      <ContenedorAncho anchoMaximo={ANCHO_ADMIN.lista}>
        <View style={styles.controles}>
          <PanelFiltros>
            <FilaFiltrosSuperior>
              <FiltroSegmentado opciones={OPCIONES_FILTRO} valorActivo={filtro} onCambiar={setFiltro} />
            </FilaFiltrosSuperior>
            <FilaSelectores activos={filtroRol !== 'TODOS' ? 1 : 0}>
              <CampoFiltro icono="search-outline" etiqueta="Buscar">
                <SearchBar valor={busqueda} onCambiar={setBusqueda} placeholder="Nombre o cédula..." />
              </CampoFiltro>
              <SelectorFiltro
                icono="briefcase-outline"
                etiqueta="Rol"
                valorTexto={filtroRol === 'TODOS' ? 'Todos los roles' : etiquetaRol}
                onPress={() => setSelectorRolVisible(true)}
              />
            </FilaSelectores>
            <FiltrosAplicados
              filtros={[
                busqueda.trim() !== '' && {
                  clave: 'busqueda',
                  texto: `Búsqueda: ${busqueda.trim()}`,
                  onQuitar: () => setBusqueda(''),
                },
                filtroRol !== 'TODOS' && {
                  clave: 'rol',
                  texto: `Rol: ${etiquetaRol}`,
                  onQuitar: () => setFiltroRol('TODOS'),
                },
              ].filter((f): f is FiltroAplicado => !!f)}
              onLimpiar={() => {
                setBusqueda('');
                setFiltroRol('TODOS');
              }}
            />
          </PanelFiltros>
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
        <ContenedorAncho anchoMaximo={ANCHO_ADMIN.lista} llenarAlto>
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
      <SelectorModal
        visible={selectorRolVisible}
        titulo="Filtrar por rol"
        opciones={OPCIONES_ROL.filter((o) => o.valor !== 'TODOS').map((o) => ({ id: o.valor, etiqueta: o.etiqueta }))}
        onElegir={(id) => {
          setFiltroRol((id as FiltroRol | null) ?? 'TODOS');
          setSelectorRolVisible(false);
        }}
        onCerrar={() => setSelectorRolVisible(false)}
      />
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
    paddingBottom: ESPACIADO_ADMIN.sm,
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
