import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { getDb } from '@/db/client';
import { listarColaSync, type TablaSync, type TareaSyncVista } from '@/db/syncCola';
import { obtenerUltimoCiclo, type EstadoUltimoCiclo } from '@/sync/estado';
import { COLORES } from '@/ui/colores';
import { ContenedorAncho } from '@/ui/ContenedorAncho';
import { useEsPantallaAncha } from '@/ui/useEsPantallaAncha';
import { useRequiereSesion } from '@/ui/useRequiereSesion';

const ETIQUETA_TABLA: Record<TablaSync, string> = {
  turnos: 'Turno',
  comprobantes_venta: 'Comprobante',
  ventas: 'Venta',
  movimientos: 'Movimiento',
  lotes: 'Lote',
  cargues: 'Cargue',
  traslados: 'Traslado entre promotores',
  conteos: 'Conteo',
  arqueos_caja: 'Arqueo de caja',
  usuarios: 'Personal',
  productos: 'Producto',
  categorias: 'Categoría',
  intentos_pin_fallidos: 'Intento fallido de PIN',
  desbloqueos_pin: 'Desbloqueo de PIN',
  logins_exitosos_pin: 'Login exitoso',
};

function formatearHora(ts: string): string {
  return new Date(ts).toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'medium' });
}

/**
 * Diagnóstico de la cola de sincronización (ver ADR 0006 y la extensión de
 * la sección 10 "Sincronización del motor de inventario/ventas" en
 * CLAUDE.md) — muestra qué hay pendiente, qué se completó, y el último
 * error de cada tarea, con un botón para forzar un ciclo ahora mismo. No hay
 * acceso a logs de consola en el celular de un promotor/admin en campo, así
 * que esta pantalla es la única forma práctica de ver por qué algo no subió.
 */
export default function DiagnosticoSync() {
  const usuario = useRequiereSesion(['ADMIN']);
  const [tareas, setTareas] = useState<TareaSyncVista[]>([]);
  const [ultimoCiclo, setUltimoCiclo] = useState<EstadoUltimoCiclo | null>(null);
  const [cargando, setCargando] = useState(true);
  const insets = useSafeAreaInsets();
  const anchaPantalla = useEsPantallaAncha();

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const db = await getDb();
      setTareas(await listarColaSync(db));
      setUltimoCiclo(obtenerUltimoCiclo());
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

  const pendientes = tareas.filter((t) => !t.completadoTs).length;

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
            <Text style={anchaPantalla ? styles.tituloAncho : styles.titulo}>Sincronización</Text>
            {!anchaPantalla && <View style={{ width: 60 }} />}
          </View>
        </ContenedorAncho>
      </View>

      <ContenedorAncho anchoMaximo={720} llenarAlto>
        <View style={styles.resumen}>
          <Text style={styles.resumenTexto}>
            {pendientes === 0 ? 'Todo sincronizado' : `${pendientes} tarea(s) pendiente(s)`}
          </Text>
        </View>

        {ultimoCiclo && (
          <View style={[styles.ultimoCiclo, !ultimoCiclo.ok && styles.ultimoCicloError]}>
            <Text style={styles.ultimoCicloTitulo}>
              Último intento: {formatearHora(ultimoCiclo.ts)}
            </Text>
            <Text style={[styles.ultimoCicloTexto, !ultimoCiclo.ok && styles.ultimoCicloTextoError]}>
              {ultimoCiclo.mensaje}
            </Text>
          </View>
        )}

        {cargando ? (
          <View style={styles.centrado}>
            <ActivityIndicator size="large" color={COLORES.oscuro} />
          </View>
        ) : tareas.length === 0 ? (
          <View style={styles.centrado}>
            <Text style={styles.vacio}>Nada por sincronizar todavía.</Text>
          </View>
        ) : (
          <FlatList
            data={tareas}
            keyExtractor={(t) => t.id}
            contentContainerStyle={styles.lista}
            renderItem={({ item }) => (
              <View style={[styles.fila, item.ultimoError && !item.completadoTs && styles.filaConError]}>
                <View style={styles.filaEncabezado}>
                  <Text style={styles.filaTitulo}>
                    {ETIQUETA_TABLA[item.tabla]} · {item.tipoTarea}
                  </Text>
                  <Text
                    style={[
                      styles.filaEstado,
                      item.completadoTs ? styles.filaEstadoOk : styles.filaEstadoPendiente,
                    ]}
                  >
                    {item.completadoTs ? 'Sincronizado' : `Pendiente (${item.intentos} intento(s))`}
                  </Text>
                </View>
                <Text style={styles.filaDetalle}>Creado: {formatearHora(item.creadoTs)}</Text>
                {item.ultimoError && !item.completadoTs && (
                  <Text style={styles.filaError}>{item.ultimoError}</Text>
                )}
              </View>
            )}
          />
        )}
      </ContenedorAncho>
    </View>
  );
}

const styles = StyleSheet.create({
  contenedor: { flex: 1, backgroundColor: '#FBEDED' },
  encabezado: { backgroundColor: COLORES.oscuro, paddingHorizontal: 20, paddingBottom: 16 },
  encabezadoAncho: { backgroundColor: 'transparent', paddingHorizontal: 20, paddingBottom: 16 },
  encabezadoFila: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  volver: { color: '#FFFFFF', fontSize: 14, textDecorationLine: 'underline' },
  titulo: { color: '#FFFFFF', fontSize: 17, fontWeight: '700' },
  tituloAncho: { color: COLORES.oscuro, fontSize: 20, fontWeight: '700' },
  resumen: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    margin: 20,
    marginBottom: 0,
    borderRadius: 14,
    padding: 16,
  },
  resumenTexto: { fontSize: 14, fontWeight: '600', color: '#333' },
  ultimoCiclo: {
    backgroundColor: '#FFFFFF',
    marginHorizontal: 20,
    marginTop: 10,
    borderRadius: 12,
    padding: 14,
    gap: 2,
  },
  ultimoCicloError: {
    borderWidth: 1,
    borderColor: '#F8C8C8',
    backgroundColor: '#FDF2F2',
  },
  ultimoCicloTitulo: { fontSize: 11, fontWeight: '700', color: '#888', textTransform: 'uppercase' },
  ultimoCicloTexto: { fontSize: 13, color: '#333' },
  ultimoCicloTextoError: { color: '#B00020' },
  centrado: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  vacio: { fontSize: 14, color: '#888', textAlign: 'center' },
  lista: { padding: 20, gap: 10 },
  fila: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 14,
    gap: 4,
  },
  filaConError: {
    borderWidth: 1,
    borderColor: '#F8C8C8',
    backgroundColor: '#FDF2F2',
  },
  filaEncabezado: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  filaTitulo: { fontSize: 14, fontWeight: '700', color: '#333' },
  filaEstado: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase' },
  filaEstadoOk: { color: '#2E7D32' },
  filaEstadoPendiente: { color: '#976200' },
  filaDetalle: { fontSize: 12, color: '#888' },
  filaError: { fontSize: 12, color: '#B00020', marginTop: 2 },
});
