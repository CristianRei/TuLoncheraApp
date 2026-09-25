import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, Text, View } from 'react-native';

import { getDb } from '@/db/client';
import { listarColaSync, type TablaSync, type TareaSyncVista } from '@/db/syncCola';
import { obtenerUltimoCiclo, type EstadoUltimoCiclo } from '@/sync/estado';
import { ContenedorAncho } from '@/ui/ContenedorAncho';
import { Encabezado } from '@/ui/Encabezado';
import { EmptyState } from '@/ui/EmptyState';
import { ANCHO_ADMIN, COLORES_ADMIN, ESPACIADO_ADMIN, RADII_ADMIN, TIPOGRAFIA_ADMIN } from '@/ui/tema';
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
  empresas: 'Empresa',
  puntos: 'Punto',
  eventos: 'Evento del calendario',
  descuentos: 'Descuento',
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
      <Encabezado titulo="Sincronización" rutaVolverTexto="Admin" />

      <ContenedorAncho anchoMaximo={ANCHO_ADMIN.lista} llenarAlto>
        <View style={styles.resumen}>
          <Text style={styles.resumenTexto}>
            {pendientes === 0 ? 'Todo sincronizado' : `${pendientes} tarea(s) pendiente(s)`}
          </Text>
        </View>

        {ultimoCiclo && (
          <View style={[styles.ultimoCiclo, !ultimoCiclo.ok && styles.ultimoCicloError]}>
            <Text style={styles.ultimoCicloTitulo}>Último intento: {formatearHora(ultimoCiclo.ts)}</Text>
            <Text style={[styles.ultimoCicloTexto, !ultimoCiclo.ok && styles.ultimoCicloTextoError]}>
              {ultimoCiclo.mensaje}
            </Text>
          </View>
        )}

        {cargando ? (
          <View style={styles.centrado}>
            <ActivityIndicator size="large" color={COLORES_ADMIN.vino} />
          </View>
        ) : tareas.length === 0 ? (
          <EmptyState icono="cloud-done-outline" mensaje="Nada por sincronizar todavía." />
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
                    style={[styles.filaEstado, item.completadoTs ? styles.filaEstadoOk : styles.filaEstadoPendiente]}
                  >
                    {item.completadoTs ? 'Sincronizado' : `Pendiente (${item.intentos} intento(s))`}
                  </Text>
                </View>
                <Text style={styles.filaDetalle}>Creado: {formatearHora(item.creadoTs)}</Text>
                {item.ultimoError && !item.completadoTs && <Text style={styles.filaError}>{item.ultimoError}</Text>}
              </View>
            )}
          />
        )}
      </ContenedorAncho>
    </View>
  );
}

const styles = StyleSheet.create({
  contenedor: { flex: 1, backgroundColor: COLORES_ADMIN.background },
  resumen: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: COLORES_ADMIN.superficieMasBaja,
    marginTop: ESPACIADO_ADMIN.lg,
    borderRadius: RADII_ADMIN.lg,
    borderWidth: 1,
    borderColor: COLORES_ADMIN.bordeSuave,
    padding: ESPACIADO_ADMIN.lg,
  },
  resumenTexto: { fontSize: 14, fontFamily: TIPOGRAFIA_ADMIN.semiNegrita, color: COLORES_ADMIN.texto },
  ultimoCiclo: {
    backgroundColor: COLORES_ADMIN.superficieMasBaja,
    marginTop: ESPACIADO_ADMIN.md,
    borderRadius: RADII_ADMIN.md,
    borderWidth: 1,
    borderColor: COLORES_ADMIN.bordeSuave,
    padding: ESPACIADO_ADMIN.md,
    gap: 2,
  },
  ultimoCicloError: {
    borderColor: COLORES_ADMIN.dorado,
    backgroundColor: COLORES_ADMIN.superficieBaja,
  },
  ultimoCicloTitulo: {
    fontSize: 11,
    fontFamily: TIPOGRAFIA_ADMIN.semiNegrita,
    color: COLORES_ADMIN.textoSecundario,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  ultimoCicloTexto: { fontSize: 13, fontFamily: TIPOGRAFIA_ADMIN.regular, color: COLORES_ADMIN.texto },
  ultimoCicloTextoError: { color: COLORES_ADMIN.error },
  centrado: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: ESPACIADO_ADMIN.xxl },
  lista: { paddingVertical: ESPACIADO_ADMIN.xl, gap: ESPACIADO_ADMIN.sm },
  fila: {
    backgroundColor: COLORES_ADMIN.superficieMasBaja,
    borderRadius: RADII_ADMIN.md,
    borderWidth: 1,
    borderColor: COLORES_ADMIN.bordeSuave,
    padding: ESPACIADO_ADMIN.md,
    gap: ESPACIADO_ADMIN.xs,
  },
  filaConError: {
    borderColor: COLORES_ADMIN.dorado,
    backgroundColor: COLORES_ADMIN.superficieBaja,
  },
  filaEncabezado: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  filaTitulo: { fontSize: 14, fontFamily: TIPOGRAFIA_ADMIN.semiNegrita, color: COLORES_ADMIN.texto },
  filaEstado: {
    fontSize: 11,
    fontFamily: TIPOGRAFIA_ADMIN.semiNegrita,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  filaEstadoOk: { color: COLORES_ADMIN.positivo },
  filaEstadoPendiente: { color: COLORES_ADMIN.dorado },
  filaDetalle: { fontSize: 12, fontFamily: TIPOGRAFIA_ADMIN.regular, color: COLORES_ADMIN.textoSecundario },
  filaError: { fontSize: 12, fontFamily: TIPOGRAFIA_ADMIN.medio, color: COLORES_ADMIN.error, marginTop: 2 },
});
