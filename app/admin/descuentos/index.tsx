import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { Descuento } from '@/core/tipos';
import { getDb } from '@/db/client';
import { desactivarDescuento, listarDescuentos } from '@/db/descuentos';
import { ContenedorAncho } from '@/ui/ContenedorAncho';
import { ModalConfirmacion } from '@/ui/ModalConfirmacion';
import { COLORES_ADMIN, TIPOGRAFIA_ADMIN } from '@/ui/tema';
import { useEsPantallaAncha } from '@/ui/useEsPantallaAncha';
import { useRequiereSesion } from '@/ui/useRequiereSesion';

type Filtro = 'VIGENTES' | 'VENCIDOS';

function formatearFecha(iso: string): string {
  return new Date(iso).toLocaleDateString('es-CO', { dateStyle: 'medium' });
}

function describirValor(descuento: Descuento): string {
  return descuento.tipo === 'PORCENTAJE' ? `${descuento.valor}%` : `$ ${descuento.valor}`;
}

function describirAlcance(descuento: Descuento): string {
  const producto = descuento.productoNombre ?? 'Todos los productos';
  const punto = descuento.puntoNombre ?? 'Todos los puntos';
  return `${producto} · ${punto}`;
}

export default function Descuentos() {
  const usuario = useRequiereSesion(['ADMIN']);
  const [descuentos, setDescuentos] = useState<Descuento[]>([]);
  const [filtro, setFiltro] = useState<Filtro>('VIGENTES');
  const [cargando, setCargando] = useState(true);
  const [idParaDesactivar, setIdParaDesactivar] = useState<string | null>(null);
  const [desactivando, setDesactivando] = useState(false);
  const insets = useSafeAreaInsets();
  const anchaPantalla = useEsPantallaAncha();

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const db = await getDb();
      setDescuentos(await listarDescuentos(db));
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

  const ahora = new Date().toISOString();
  const filtrados = descuentos.filter((d) => {
    const vigente = d.activo && d.desde <= ahora && d.hasta >= ahora;
    return filtro === 'VIGENTES' ? vigente : !vigente;
  });

  async function confirmarDesactivar() {
    if (!idParaDesactivar) return;
    setDesactivando(true);
    try {
      const db = await getDb();
      await desactivarDescuento(db, idParaDesactivar);
      setIdParaDesactivar(null);
      await cargar();
    } finally {
      setDesactivando(false);
    }
  }

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
              <Pressable style={styles.volverBoton} onPress={() => router.back()}>
                <Ionicons name="chevron-back" size={16} color="#FFE9E2" />
                <Text style={styles.volverTexto}>Admin</Text>
              </Pressable>
            )}
            <Text style={anchaPantalla ? styles.tituloAncho : styles.titulo}>Descuentos</Text>
            <Pressable style={styles.agregarBoton} onPress={() => router.push('/admin/descuentos/nuevo')}>
              <Ionicons name="add" size={16} color={COLORES_ADMIN.vino} />
              <Text style={styles.agregarTexto}>Nuevo</Text>
            </Pressable>
          </View>
        </ContenedorAncho>
      </View>

      <ContenedorAncho anchoMaximo={720}>
        <View style={styles.tabs}>
          <Pressable
            style={[styles.tab, filtro === 'VIGENTES' && styles.tabActivo]}
            onPress={() => setFiltro('VIGENTES')}
          >
            <Text style={[styles.tabTexto, filtro === 'VIGENTES' && styles.tabTextoActivo]}>
              Vigentes
            </Text>
          </Pressable>
          <Pressable
            style={[styles.tab, filtro === 'VENCIDOS' && styles.tabActivo]}
            onPress={() => setFiltro('VENCIDOS')}
          >
            <Text style={[styles.tabTexto, filtro === 'VENCIDOS' && styles.tabTextoActivo]}>
              Vencidos / inactivos
            </Text>
          </Pressable>
        </View>
      </ContenedorAncho>

      {cargando ? (
        <View style={styles.centrado}>
          <ActivityIndicator size="large" color={COLORES_ADMIN.vino} />
        </View>
      ) : filtrados.length === 0 ? (
        <View style={styles.centrado}>
          <Text style={styles.vacio}>
            {filtro === 'VIGENTES' ? 'No hay descuentos vigentes.' : 'No hay descuentos vencidos o inactivos.'}
          </Text>
        </View>
      ) : (
        <ContenedorAncho anchoMaximo={720} llenarAlto>
          <FlatList
            data={filtrados}
            keyExtractor={(d) => d.id}
            contentContainerStyle={styles.lista}
            renderItem={({ item }) => (
              <View style={styles.fila}>
                <View style={styles.filaTexto}>
                  <View style={styles.filaEncabezado}>
                    <Text style={styles.filaValor}>{describirValor(item)}</Text>
                    {filtro === 'VIGENTES' ? (
                      <View style={styles.badgeVigente}>
                        <Text style={styles.badgeVigenteTexto}>Vigente</Text>
                      </View>
                    ) : (
                      <View style={styles.badgeInactivo}>
                        <Text style={styles.badgeInactivoTexto}>
                          {item.activo ? 'Vencido' : 'Desactivado'}
                        </Text>
                      </View>
                    )}
                  </View>
                  <Text style={styles.filaAlcance}>{describirAlcance(item)}</Text>
                  <Text style={styles.filaVigencia}>
                    {formatearFecha(item.desde)} — {formatearFecha(item.hasta)}
                  </Text>
                </View>
                {filtro === 'VIGENTES' && (
                  <Pressable style={styles.botonDesactivar} onPress={() => setIdParaDesactivar(item.id)}>
                    <Text style={styles.botonDesactivarTexto}>Desactivar</Text>
                  </Pressable>
                )}
              </View>
            )}
          />
        </ContenedorAncho>
      )}

      <ModalConfirmacion
        visible={idParaDesactivar !== null}
        titulo="Desactivar descuento"
        mensaje="Este descuento dejará de aplicarse de inmediato."
        textoConfirmar="Desactivar"
        destructivo
        cargando={desactivando}
        onConfirmar={confirmarDesactivar}
        onCancelar={() => setIdParaDesactivar(null)}
      />
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
  tituloAncho: {
    fontSize: 20,
    fontFamily: TIPOGRAFIA_ADMIN.negrita,
    color: COLORES_ADMIN.vino,
  },
  agregarBoton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: COLORES_ADMIN.dorado,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  agregarTexto: {
    fontSize: 13,
    fontFamily: TIPOGRAFIA_ADMIN.semiNegrita,
    color: COLORES_ADMIN.vino,
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
    gap: 12,
  },
  fila: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: COLORES_ADMIN.superficieMasBaja,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORES_ADMIN.bordeSuave,
    padding: 14,
    gap: 12,
  },
  filaTexto: {
    flex: 1,
    gap: 3,
  },
  filaEncabezado: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  filaValor: {
    fontSize: 17,
    fontFamily: TIPOGRAFIA_ADMIN.monoSemiNegrita,
    color: COLORES_ADMIN.vino,
  },
  badgeVigente: {
    backgroundColor: '#EAF5EA',
    borderWidth: 1,
    borderColor: '#C3E3C3',
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  badgeVigenteTexto: {
    fontSize: 10,
    fontFamily: TIPOGRAFIA_ADMIN.semiNegrita,
    color: COLORES_ADMIN.positivo,
    textTransform: 'uppercase',
  },
  badgeInactivo: {
    backgroundColor: COLORES_ADMIN.superficie,
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  badgeInactivoTexto: {
    fontSize: 10,
    fontFamily: TIPOGRAFIA_ADMIN.semiNegrita,
    color: COLORES_ADMIN.textoSecundario,
    textTransform: 'uppercase',
  },
  filaAlcance: {
    fontSize: 13,
    fontFamily: TIPOGRAFIA_ADMIN.medio,
    color: COLORES_ADMIN.texto,
  },
  filaVigencia: {
    fontSize: 12,
    fontFamily: TIPOGRAFIA_ADMIN.monoRegular,
    color: COLORES_ADMIN.textoSecundario,
  },
  botonDesactivar: {
    borderWidth: 1,
    borderColor: COLORES_ADMIN.error,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  botonDesactivarTexto: {
    fontSize: 12,
    fontFamily: TIPOGRAFIA_ADMIN.semiNegrita,
    color: COLORES_ADMIN.error,
  },
});
