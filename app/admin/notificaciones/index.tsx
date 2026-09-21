import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { Notificacion, TipoNotificacion } from '@/core/tipos';
import { getDb } from '@/db/client';
import { getDispositivoId } from '@/db/dispositivo';
import {
  generarNotificaciones,
  listarNotificaciones,
  marcarNotificacionLeida,
} from '@/db/notificaciones';
import { ContenedorAncho } from '@/ui/ContenedorAncho';
import { COLORES_ADMIN, TIPOGRAFIA_ADMIN } from '@/ui/tema';
import { useRequiereSesion } from '@/ui/useRequiereSesion';

type Filtro = 'NO_LEIDAS' | 'TODAS';

const ETIQUETAS_TIPO: Record<TipoNotificacion, string> = {
  STOCK_BAJO: 'Stock bajo',
  LOTE_POR_VENCER: 'Vencimiento próximo',
  CARGUE_REVISAR: 'Cargue a revisar',
};

const ICONOS_TIPO: Record<TipoNotificacion, keyof typeof Ionicons.glyphMap> = {
  STOCK_BAJO: 'cube-outline',
  LOTE_POR_VENCER: 'time-outline',
  CARGUE_REVISAR: 'alert-circle-outline',
};

function formatearFechaRelativa(iso: string): string {
  const minutos = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (minutos < 1) return 'hace instantes';
  if (minutos < 60) return `hace ${minutos} min`;
  const horas = Math.floor(minutos / 60);
  if (horas < 24) return `hace ${horas} h`;
  const dias = Math.floor(horas / 24);
  return `hace ${dias} día${dias === 1 ? '' : 's'}`;
}

export default function Notificaciones() {
  const usuario = useRequiereSesion(['ADMIN']);
  const [notificaciones, setNotificaciones] = useState<Notificacion[]>([]);
  const [filtro, setFiltro] = useState<Filtro>('NO_LEIDAS');
  const [cargando, setCargando] = useState(true);
  const insets = useSafeAreaInsets();

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const db = await getDb();
      const dispositivoId = await getDispositivoId(db);
      await generarNotificaciones(db, dispositivoId);
      setNotificaciones(await listarNotificaciones(db));
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

  const filtradas = notificaciones.filter((n) => (filtro === 'NO_LEIDAS' ? !n.leida : true));

  async function marcarLeida(id: string) {
    const db = await getDb();
    await marcarNotificacionLeida(db, id);
    setNotificaciones((actual) => actual.map((n) => (n.id === id ? { ...n, leida: true } : n)));
  }

  return (
    <View style={styles.contenedor}>
      <View style={[styles.encabezado, { paddingTop: insets.top + 20 }]}>
        <ContenedorAncho anchoMaximo={720}>
          <View style={styles.encabezadoFila}>
            <Pressable style={styles.volverBoton} onPress={() => router.back()}>
              <Ionicons name="chevron-back" size={16} color="#FFE9E2" />
              <Text style={styles.volverTexto}>Admin</Text>
            </Pressable>
            <Text style={styles.titulo}>Notificaciones</Text>
            <View style={{ width: 60 }} />
          </View>
        </ContenedorAncho>
      </View>

      <ContenedorAncho anchoMaximo={720}>
        <View style={styles.tabs}>
          <Pressable
            style={[styles.tab, filtro === 'NO_LEIDAS' && styles.tabActivo]}
            onPress={() => setFiltro('NO_LEIDAS')}
          >
            <Text style={[styles.tabTexto, filtro === 'NO_LEIDAS' && styles.tabTextoActivo]}>
              No leídas
            </Text>
          </Pressable>
          <Pressable
            style={[styles.tab, filtro === 'TODAS' && styles.tabActivo]}
            onPress={() => setFiltro('TODAS')}
          >
            <Text style={[styles.tabTexto, filtro === 'TODAS' && styles.tabTextoActivo]}>Todas</Text>
          </Pressable>
        </View>
      </ContenedorAncho>

      {cargando ? (
        <View style={styles.centrado}>
          <ActivityIndicator size="large" color={COLORES_ADMIN.vino} />
        </View>
      ) : filtradas.length === 0 ? (
        <View style={styles.centrado}>
          <Text style={styles.vacio}>
            {filtro === 'NO_LEIDAS' ? 'No hay notificaciones sin leer.' : 'No hay notificaciones.'}
          </Text>
        </View>
      ) : (
        <ContenedorAncho anchoMaximo={720} llenarAlto>
          <FlatList
            data={filtradas}
            keyExtractor={(n) => n.id}
            contentContainerStyle={styles.lista}
            renderItem={({ item }) => (
              <View style={[styles.fila, !item.leida && styles.filaNoLeida]}>
                <View
                  style={[
                    styles.icono,
                    item.nivel === 'CRITICO' && styles.iconoCritico,
                    item.nivel === 'ALERTA' && styles.iconoAlerta,
                  ]}
                >
                  <Ionicons
                    name={ICONOS_TIPO[item.tipo]}
                    size={18}
                    color={
                      item.nivel === 'CRITICO'
                        ? COLORES_ADMIN.error
                        : item.nivel === 'ALERTA'
                          ? COLORES_ADMIN.vino
                          : COLORES_ADMIN.textoSecundario
                    }
                  />
                </View>
                <View style={styles.filaTexto}>
                  <View style={styles.filaEncabezado}>
                    <Text style={styles.filaTipo}>{ETIQUETAS_TIPO[item.tipo]}</Text>
                    <Text style={styles.filaTiempo}>{formatearFechaRelativa(item.tsCliente)}</Text>
                  </View>
                  <Text style={styles.filaTitulo}>{item.titulo}</Text>
                  <Text style={styles.filaDetalle}>{item.detalle}</Text>
                </View>
                {!item.leida && (
                  <Pressable style={styles.botonLeida} onPress={() => marcarLeida(item.id)}>
                    <Text style={styles.botonLeidaTexto}>Marcar leída</Text>
                  </Pressable>
                )}
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
    backgroundColor: COLORES_ADMIN.background,
  },
  encabezado: {
    backgroundColor: COLORES_ADMIN.vino,
    paddingHorizontal: 20,
    paddingBottom: 16,
  },
  encabezadoFila: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  volverBoton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  volverTexto: {
    fontSize: 13,
    fontFamily: TIPOGRAFIA_ADMIN.medio,
    color: '#FFE9E2',
  },
  titulo: {
    fontSize: 17,
    fontFamily: TIPOGRAFIA_ADMIN.semiNegrita,
    color: '#FFFFFF',
  },
  tabs: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  tab: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: COLORES_ADMIN.superficieMasBaja,
    borderWidth: 1,
    borderColor: COLORES_ADMIN.bordeSuave,
  },
  tabActivo: {
    backgroundColor: COLORES_ADMIN.vino,
    borderColor: COLORES_ADMIN.vino,
  },
  tabTexto: {
    fontSize: 13,
    fontFamily: TIPOGRAFIA_ADMIN.medio,
    color: COLORES_ADMIN.textoSecundario,
  },
  tabTextoActivo: {
    color: '#FFFFFF',
    fontFamily: TIPOGRAFIA_ADMIN.semiNegrita,
  },
  centrado: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  vacio: {
    fontSize: 14,
    fontFamily: TIPOGRAFIA_ADMIN.regular,
    color: COLORES_ADMIN.textoSecundario,
    textAlign: 'center',
  },
  lista: {
    padding: 20,
    gap: 10,
  },
  fila: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    backgroundColor: COLORES_ADMIN.superficieMasBaja,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORES_ADMIN.bordeSuave,
    padding: 14,
  },
  filaNoLeida: {
    borderColor: COLORES_ADMIN.dorado,
  },
  icono: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: COLORES_ADMIN.superficie,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  iconoCritico: {
    backgroundColor: '#FDECEC',
  },
  iconoAlerta: {
    backgroundColor: COLORES_ADMIN.superficieMasAlta,
  },
  filaTexto: {
    flex: 1,
    gap: 3,
  },
  filaEncabezado: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  filaTipo: {
    fontSize: 10.5,
    fontFamily: TIPOGRAFIA_ADMIN.semiNegrita,
    color: COLORES_ADMIN.textoSecundario,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  filaTiempo: {
    fontSize: 11,
    fontFamily: TIPOGRAFIA_ADMIN.monoRegular,
    color: COLORES_ADMIN.textoSecundario,
  },
  filaTitulo: {
    fontSize: 14,
    fontFamily: TIPOGRAFIA_ADMIN.semiNegrita,
    color: COLORES_ADMIN.texto,
  },
  filaDetalle: {
    fontSize: 12.5,
    fontFamily: TIPOGRAFIA_ADMIN.regular,
    color: COLORES_ADMIN.textoSecundario,
    lineHeight: 17,
  },
  botonLeida: {
    alignSelf: 'center',
    borderWidth: 1,
    borderColor: COLORES_ADMIN.bordeSuave,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  botonLeidaTexto: {
    fontSize: 11,
    fontFamily: TIPOGRAFIA_ADMIN.semiNegrita,
    color: COLORES_ADMIN.vino,
  },
});
