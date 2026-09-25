import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { calcularRangoPeriodo, ETIQUETAS_PERIODO, type Periodo } from '@/core/analitica';
import type { Turno, UsuarioSesion } from '@/core/tipos';
import { getDb } from '@/db/client';
import { listarTurnos } from '@/db/turnos';
import { listarTurnosRemotos } from '@/db/turnosRemotos';
import { listarPromotores } from '@/db/usuarios';
import { CalendarioRango } from '@/ui/CalendarioRango';
import { ContenedorAncho } from '@/ui/ContenedorAncho';
import { Encabezado } from '@/ui/Encabezado';
import { EmptyState } from '@/ui/EmptyState';
import { FilterTabs } from '@/ui/FilterTabs';
import { ListRow } from '@/ui/ListRow';
import { COLORES_ADMIN, ESPACIADO_ADMIN, RADII_ADMIN, TIPOGRAFIA_ADMIN } from '@/ui/tema';
import { useRequiereSesion } from '@/ui/useRequiereSesion';
import { useRecargarConDatosNuevos } from '@/ui/useVersionDatos';

type FiltroEstado = 'TODOS' | 'EN_CURSO' | 'FINALIZADO';

const OPCIONES_ESTADO: { valor: FiltroEstado; etiqueta: string }[] = [
  { valor: 'TODOS', etiqueta: 'Todos' },
  { valor: 'EN_CURSO', etiqueta: 'En curso' },
  { valor: 'FINALIZADO', etiqueta: 'Finalizados' },
];

const OPCIONES_PERIODO: { valor: Exclude<Periodo, 'PERSONALIZADO'>; etiqueta: string }[] = (
  Object.keys(ETIQUETAS_PERIODO) as Exclude<Periodo, 'PERSONALIZADO'>[]
).map((valor) => ({ valor, etiqueta: ETIQUETAS_PERIODO[valor] }));

function formatearHora(ts: string): string {
  return new Date(ts).toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' });
}

/** Fusiona locales + remotos por id — se prefiere la fila local (más actualizada que lo último sincronizado). */
function fusionarTurnos(locales: Turno[], remotos: Turno[]): Turno[] {
  const porId = new Map(remotos.map((t) => [t.id, t]));
  for (const local of locales) porId.set(local.id, local);
  return [...porId.values()].sort((a, b) => b.horaInicio.localeCompare(a.horaInicio));
}

/** Modal de selección simple (lista de opciones + "Quitar filtro") — mismo patrón que app/admin/auditoria/index.tsx. */
function SelectorModal({
  visible,
  titulo,
  opciones,
  onElegir,
  onCerrar,
}: {
  visible: boolean;
  titulo: string;
  opciones: { id: string; etiqueta: string }[];
  onElegir: (id: string | null) => void;
  onCerrar: () => void;
}) {
  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onCerrar}>
      <View style={styles.fondoModal}>
        <View style={styles.tarjetaModal}>
          <Text style={styles.modalTitulo}>{titulo}</Text>
          <Pressable style={styles.opcionQuitar} onPress={() => onElegir(null)}>
            <Text style={styles.opcionQuitarTexto}>Quitar filtro</Text>
          </Pressable>
          <FlatList
            data={opciones}
            keyExtractor={(o) => o.id}
            style={styles.modalLista}
            renderItem={({ item }) => (
              <Pressable style={styles.opcion} onPress={() => onElegir(item.id)}>
                <Text style={styles.opcionTexto}>{item.etiqueta}</Text>
              </Pressable>
            )}
          />
          <Pressable onPress={onCerrar}>
            <Text style={styles.modalCancelar}>Cerrar</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

export default function Turnos() {
  const usuario = useRequiereSesion(['ADMIN']);
  const [turnos, setTurnos] = useState<Turno[]>([]);
  const [promotores, setPromotores] = useState<UsuarioSesion[]>([]);
  const [cargando, setCargando] = useState(true);
  const [actualizando, setActualizando] = useState(false);

  const [periodo, setPeriodo] = useState<Periodo>('SEMANA');
  const [desdePersonalizado, setDesdePersonalizado] = useState<string | null>(null);
  const [hastaPersonalizado, setHastaPersonalizado] = useState<string | null>(null);
  const [calendarioVisible, setCalendarioVisible] = useState(false);
  const [filtroEstado, setFiltroEstado] = useState<FiltroEstado>('TODOS');
  const [promotorId, setPromotorId] = useState<string | null>(null);
  const [selectorPromotorVisible, setSelectorPromotorVisible] = useState(false);

  const rango = useMemo(() => {
    if (periodo === 'PERSONALIZADO') {
      if (!desdePersonalizado || !hastaPersonalizado) return null;
      return {
        desde: new Date(`${desdePersonalizado}T00:00:00-05:00`).toISOString(),
        hasta: new Date(`${hastaPersonalizado}T23:59:59-05:00`).toISOString(),
      };
    }
    return calcularRangoPeriodo(periodo);
  }, [periodo, desdePersonalizado, hastaPersonalizado]);

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const db = await getDb();
      const [locales, listaPromotores] = await Promise.all([listarTurnos(db), listarPromotores(db)]);
      setPromotores(listaPromotores);
      setTurnos(locales);
      try {
        const remotos = await listarTurnosRemotos();
        setTurnos(fusionarTurnos(locales, remotos));
      } catch {
        // Sin red o Supabase no disponible — se queda con lo local, sin error visible.
      }
    } finally {
      setCargando(false);
    }
  }, []);

  async function actualizar() {
    setActualizando(true);
    try {
      await cargar();
    } finally {
      setActualizando(false);
    }
  }

  useFocusEffect(
    useCallback(() => {
      cargar();
    }, [cargar])
  );
  // Un check-in, cierre de turno o arqueo de caja en otro celular llega solo
  // (Realtime, ver app/admin/_layout.tsx y src/ui/useSincronizacionEnVivo.ts).
  useRecargarConDatosNuevos(cargar);

  // Período/Estado/Promotor se combinan (AND) — mismo criterio que Bitácora
  // y auditoría. El volumen de turnos es bajo, así que se filtra en memoria
  // sobre lo ya fusionado (local + remoto) en vez de re-consultar por rango.
  const turnosFiltrados = turnos.filter((t) => {
    if (rango && (t.horaInicio < rango.desde || t.horaInicio > rango.hasta)) return false;
    if (filtroEstado === 'EN_CURSO' && t.horaFin) return false;
    if (filtroEstado === 'FINALIZADO' && !t.horaFin) return false;
    if (promotorId && t.promotorId !== promotorId) return false;
    return true;
  });

  // Detecta promotores con más de un turno EN CURSO a la vez — no tiene
  // sentido, casi siempre es el rastro de un bug de sincronización entre
  // dispositivos de antes del fix (ver src/db/turnos.ts, `iniciarTurno`).
  // Se calcula sobre TODOS los turnos en curso, sin importar los filtros de
  // arriba, para no ocultar el aviso si el admin ya filtró por otra cosa.
  const promotoresConVariosEnCurso = useMemo(() => {
    const porPromotor = new Map<string, number>();
    for (const t of turnos) {
      if (t.horaFin) continue;
      porPromotor.set(t.promotorId, (porPromotor.get(t.promotorId) ?? 0) + 1);
    }
    return [...porPromotor.values()].filter((n) => n > 1).length;
  }, [turnos]);

  if (!usuario) return null;

  const etiquetaPeriodo =
    periodo === 'PERSONALIZADO'
      ? desdePersonalizado && hastaPersonalizado
        ? `${desdePersonalizado} a ${hastaPersonalizado}`
        : 'Elige un rango'
      : ETIQUETAS_PERIODO[periodo];

  const promotorFiltrado = promotores.find((p) => p.id === promotorId);

  return (
    <View style={styles.contenedor}>
      <Encabezado
        titulo="Turnos"
        rutaVolverTexto="Admin"
        accion={{ icono: 'refresh', onPress: actualizar }}
      />

      {actualizando && (
        <View style={styles.actualizandoAviso}>
          <ActivityIndicator size="small" color={COLORES_ADMIN.vino} />
        </View>
      )}

      <ContenedorAncho anchoMaximo={720} llenarAlto>
        <View style={styles.panelFiltros}>
          <View style={styles.periodoSegmentado}>
            {OPCIONES_PERIODO.map((op) => {
              const activo = periodo === op.valor;
              return (
                <Pressable
                  key={op.valor}
                  style={[styles.periodoBoton, activo && styles.periodoBotonActivo]}
                  onPress={() => setPeriodo(op.valor)}
                >
                  <Text style={[styles.periodoBotonTexto, activo && styles.periodoBotonTextoActivo]}>
                    {op.etiqueta}
                  </Text>
                </Pressable>
              );
            })}
            <Pressable
              style={[styles.periodoBoton, periodo === 'PERSONALIZADO' && styles.periodoBotonActivo]}
              onPress={() => {
                setPeriodo('PERSONALIZADO');
                setCalendarioVisible(true);
              }}
            >
              <Ionicons
                name="calendar-outline"
                size={13}
                color={periodo === 'PERSONALIZADO' ? '#FFFFFF' : COLORES_ADMIN.textoSecundario}
              />
              <Text
                style={[
                  styles.periodoBotonTexto,
                  periodo === 'PERSONALIZADO' && styles.periodoBotonTextoActivo,
                ]}
              >
                {periodo === 'PERSONALIZADO' ? etiquetaPeriodo : 'Personalizado'}
              </Text>
            </Pressable>
          </View>

          <FilterTabs opciones={OPCIONES_ESTADO} valorActivo={filtroEstado} onCambiar={setFiltroEstado} />

          <Pressable style={styles.dropdown} onPress={() => setSelectorPromotorVisible(true)}>
            <Text style={styles.dropdownEtiqueta}>Promotor</Text>
            <View style={styles.dropdownValor}>
              <Ionicons name="person-outline" size={14} color={COLORES_ADMIN.textoSecundario} />
              <Text style={styles.dropdownValorTexto} numberOfLines={1}>
                {promotorFiltrado?.nombre ?? 'Todos'}
              </Text>
              <Ionicons name="chevron-down" size={14} color={COLORES_ADMIN.textoSecundario} />
            </View>
          </Pressable>
        </View>

        {promotoresConVariosEnCurso > 0 && (
          <View style={styles.avisoDuplicado}>
            <Ionicons name="warning-outline" size={16} color="#976200" />
            <Text style={styles.avisoDuplicadoTexto}>
              {promotoresConVariosEnCurso === 1
                ? '1 promotor tiene más de un turno en curso a la vez.'
                : `${promotoresConVariosEnCurso} promotores tienen más de un turno en curso a la vez.`}
            </Text>
          </View>
        )}

        {cargando ? (
          <View style={styles.centrado}>
            <ActivityIndicator size="large" color={COLORES_ADMIN.vino} />
          </View>
        ) : turnosFiltrados.length === 0 ? (
          <EmptyState icono="time-outline" mensaje="Ningún turno coincide con estos filtros." />
        ) : (
          <FlatList
            data={turnosFiltrados}
            keyExtractor={(t) => t.id}
            contentContainerStyle={styles.lista}
            renderItem={({ item }) => (
              <ListRow
                titulo={item.promotorNombre}
                subtitulo={`Inicio: ${formatearHora(item.horaInicio)}${
                  item.horaFin ? ` · Fin: ${formatearHora(item.horaFin)}` : ''
                }`}
                badge={!item.horaFin ? 'En curso' : undefined}
                onPress={() => router.push(`/admin/turnos/${item.id}`)}
              />
            )}
          />
        )}
      </ContenedorAncho>

      <Modal visible={calendarioVisible} animationType="fade" transparent>
        <View style={styles.fondoModal}>
          <View style={styles.tarjetaModal}>
            <Text style={styles.modalTitulo}>Elige el rango de fechas</Text>
            <CalendarioRango
              desde={desdePersonalizado}
              hasta={hastaPersonalizado}
              onCambiar={(desde, hasta) => {
                setDesdePersonalizado(desde);
                setHastaPersonalizado(hasta);
              }}
            />
            <Pressable
              style={[styles.botonAplicar, (!desdePersonalizado || !hastaPersonalizado) && styles.botonDeshabilitado]}
              disabled={!desdePersonalizado || !hastaPersonalizado}
              onPress={() => setCalendarioVisible(false)}
            >
              <Text style={styles.botonAplicarTexto}>Aplicar rango</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <SelectorModal
        visible={selectorPromotorVisible}
        titulo="Filtrar por promotor"
        opciones={promotores.map((p) => ({ id: p.id, etiqueta: p.nombre }))}
        onElegir={(id) => {
          setPromotorId(id);
          setSelectorPromotorVisible(false);
        }}
        onCerrar={() => setSelectorPromotorVisible(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  contenedor: {
    flex: 1,
    backgroundColor: COLORES_ADMIN.background,
  },
  actualizandoAviso: {
    paddingHorizontal: ESPACIADO_ADMIN.xl,
    paddingTop: ESPACIADO_ADMIN.sm,
  },
  panelFiltros: {
    gap: ESPACIADO_ADMIN.md,
    paddingHorizontal: ESPACIADO_ADMIN.xl,
    paddingTop: ESPACIADO_ADMIN.md,
    paddingBottom: ESPACIADO_ADMIN.sm,
  },
  periodoSegmentado: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 2,
    backgroundColor: COLORES_ADMIN.superficieBaja,
    padding: 3,
    borderRadius: RADII_ADMIN.sm,
    borderWidth: 1,
    borderColor: COLORES_ADMIN.bordeSuave,
    alignSelf: 'flex-start',
  },
  periodoBoton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: ESPACIADO_ADMIN.md,
    paddingVertical: ESPACIADO_ADMIN.xs + 2,
    borderRadius: RADII_ADMIN.sm - 2,
  },
  periodoBotonActivo: {
    backgroundColor: COLORES_ADMIN.vino,
  },
  periodoBotonTexto: {
    fontSize: 12,
    fontFamily: TIPOGRAFIA_ADMIN.medio,
    color: COLORES_ADMIN.textoSecundario,
  },
  periodoBotonTextoActivo: {
    color: '#FFFFFF',
    fontFamily: TIPOGRAFIA_ADMIN.semiNegrita,
  },
  dropdown: {
    gap: 2,
  },
  dropdownEtiqueta: {
    fontSize: 10,
    fontFamily: TIPOGRAFIA_ADMIN.semiNegrita,
    color: COLORES_ADMIN.textoSecundario,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  dropdownValor: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: ESPACIADO_ADMIN.xs,
    backgroundColor: COLORES_ADMIN.superficieMasBaja,
    borderWidth: 1,
    borderColor: COLORES_ADMIN.bordeSuave,
    borderRadius: RADII_ADMIN.sm,
    paddingHorizontal: ESPACIADO_ADMIN.sm,
    paddingVertical: ESPACIADO_ADMIN.sm,
    alignSelf: 'flex-start',
    minWidth: 180,
  },
  dropdownValorTexto: {
    flex: 1,
    fontSize: 12,
    fontFamily: TIPOGRAFIA_ADMIN.medio,
    color: COLORES_ADMIN.texto,
  },
  avisoDuplicado: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: ESPACIADO_ADMIN.sm,
    backgroundColor: '#FEF6E7',
    borderWidth: 1,
    borderColor: '#FBDCA3',
    borderRadius: RADII_ADMIN.sm,
    marginHorizontal: ESPACIADO_ADMIN.xl,
    marginBottom: ESPACIADO_ADMIN.sm,
    paddingHorizontal: ESPACIADO_ADMIN.md,
    paddingVertical: ESPACIADO_ADMIN.sm,
  },
  avisoDuplicadoTexto: {
    flex: 1,
    fontSize: 12,
    fontFamily: TIPOGRAFIA_ADMIN.medio,
    color: '#976200',
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
  fondoModal: {
    flex: 1,
    backgroundColor: 'rgba(42,24,16,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: ESPACIADO_ADMIN.xl,
  },
  tarjetaModal: {
    width: '100%',
    maxWidth: 420,
    maxHeight: '80%',
    backgroundColor: '#FFFFFF',
    borderRadius: RADII_ADMIN.lg,
    padding: ESPACIADO_ADMIN.xl,
    gap: ESPACIADO_ADMIN.md,
  },
  modalTitulo: {
    fontSize: 16,
    fontFamily: TIPOGRAFIA_ADMIN.negrita,
    color: COLORES_ADMIN.texto,
  },
  modalLista: {
    flexGrow: 0,
  },
  modalCancelar: {
    fontSize: 14,
    fontFamily: TIPOGRAFIA_ADMIN.medio,
    color: COLORES_ADMIN.textoSecundario,
    textAlign: 'center',
  },
  opcion: {
    paddingVertical: ESPACIADO_ADMIN.sm,
    borderBottomWidth: 1,
    borderBottomColor: COLORES_ADMIN.bordeSuave,
  },
  opcionTexto: {
    fontSize: 14,
    fontFamily: TIPOGRAFIA_ADMIN.regular,
    color: COLORES_ADMIN.texto,
  },
  opcionQuitar: {
    paddingVertical: ESPACIADO_ADMIN.sm,
    borderBottomWidth: 1,
    borderBottomColor: COLORES_ADMIN.bordeSuave,
  },
  opcionQuitarTexto: {
    fontSize: 14,
    fontFamily: TIPOGRAFIA_ADMIN.semiNegrita,
    color: COLORES_ADMIN.error,
  },
  botonAplicar: {
    backgroundColor: COLORES_ADMIN.vino,
    borderRadius: RADII_ADMIN.sm,
    paddingVertical: ESPACIADO_ADMIN.md,
    alignItems: 'center',
  },
  botonDeshabilitado: {
    opacity: 0.5,
  },
  botonAplicarTexto: {
    color: '#FFFFFF',
    fontSize: 14,
    fontFamily: TIPOGRAFIA_ADMIN.semiNegrita,
  },
});
