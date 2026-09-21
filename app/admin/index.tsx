import type Ionicons from '@expo/vector-icons/Ionicons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { calcularRangoHoyBogota } from '@/core/analitica';
import { obtenerResumenVentas } from '@/db/analitica';
import { getDb } from '@/db/client';
import { contarConteosConDescuadre } from '@/db/conteos';
import { getDispositivoId } from '@/db/dispositivo';
import { contarPromotoresConPuntoVigente } from '@/db/eventos';
import { contarNotificacionesNoLeidas, generarNotificaciones } from '@/db/notificaciones';
import { ContenedorAncho } from '@/ui/ContenedorAncho';
import { COLORES_ADMIN, TIPOGRAFIA_ADMIN } from '@/ui/tema';
import { TarjetaModulo } from '@/ui/TarjetaModulo';
import { useEsPantallaAncha } from '@/ui/useEsPantallaAncha';
import { useSesion } from '@/ui/SesionContext';
import { useRequiereSesion } from '@/ui/useRequiereSesion';

type NombreIcono = keyof typeof Ionicons.glyphMap;

const MODULOS: {
  ruta: string;
  titulo: string;
  descripcion: string;
  icono: NombreIcono;
  badge?: string;
  destacada?: boolean;
  soloPantallaAncha?: boolean;
}[] = [
  {
    ruta: '/admin/catalogo',
    titulo: 'Catálogo de productos',
    descripcion: 'Agregar, editar y eliminar productos y precios.',
    icono: 'pricetags-outline',
  },
  {
    ruta: '/admin/inventario',
    titulo: 'Inventario',
    descripcion: 'Ver el stock de bodega e ingresar pedidos.',
    icono: 'cube-outline',
  },
  {
    ruta: '/admin/cargue',
    titulo: 'Cargue a promotor',
    descripcion: 'Asignar productos del stock de bodega a un promotor.',
    icono: 'swap-horizontal-outline',
  },
  {
    ruta: '/admin/ventas',
    titulo: 'Ventas',
    descripcion: 'Ver las ventas registradas por los promotores.',
    icono: 'checkmark-done-outline',
  },
  {
    ruta: '/admin/conteos',
    titulo: 'Conteos de cierre',
    descripcion: 'Ver los conteos de cierre de los promotores y sus descuadres.',
    icono: 'clipboard-outline',
    badge: 'Auditoría',
  },
  {
    ruta: '/admin/empresas',
    titulo: 'Empresas y puntos',
    descripcion: 'Clientes y sus sedes (ej. Falabella Norte, Falabella Sur).',
    icono: 'business-outline',
  },
  {
    ruta: '/admin/calendario',
    titulo: 'Calendario de eventos',
    descripcion: 'Planear qué promotor va a cada empresa y punto, día a día.',
    icono: 'calendar-outline',
  },
  {
    ruta: '/admin/descuentos',
    titulo: 'Descuentos',
    descripcion: 'Crear y ver descuentos por producto y/o punto, con vigencia.',
    icono: 'pricetag-outline',
  },
  {
    ruta: '/admin/dashboard',
    titulo: 'Dashboard',
    descripcion: 'Ventas, productos top y saldo de bodega.',
    icono: 'bar-chart-outline',
    badge: 'Métricas clave',
    destacada: true,
    soloPantallaAncha: true,
  },
  {
    ruta: '/admin/notificaciones',
    titulo: 'Notificaciones',
    descripcion: 'Stock bajo, lotes por vencer y otras alertas del negocio.',
    icono: 'notifications-outline',
  },
  {
    ruta: '/admin/intentos-pin',
    titulo: 'Seguridad de acceso',
    descripcion: 'Dispositivos bloqueados e intentos fallidos de PIN.',
    icono: 'lock-closed-outline',
  },
];

interface Indicadores {
  promotoresConPunto: number;
  conteosConDescuadre: number;
  ventasHoy: number;
  notificacionesNoLeidas: number;
}

export default function HomeAdmin() {
  const usuario = useRequiereSesion(['ADMIN']);
  const { cerrarSesion } = useSesion();
  const insets = useSafeAreaInsets();
  const anchaPantalla = useEsPantallaAncha();
  const [indicadores, setIndicadores] = useState<Indicadores | null>(null);

  const cargarIndicadores = useCallback(async () => {
    const db = await getDb();
    const dispositivoId = await getDispositivoId(db);
    await generarNotificaciones(db, dispositivoId);
    const rangoHoy = calcularRangoHoyBogota();
    const [promotoresConPunto, conteosConDescuadre, resumenHoy, notificacionesNoLeidas] = await Promise.all([
      contarPromotoresConPuntoVigente(db),
      contarConteosConDescuadre(db, rangoHoy),
      obtenerResumenVentas(db, rangoHoy),
      contarNotificacionesNoLeidas(db),
    ]);
    setIndicadores({
      promotoresConPunto,
      conteosConDescuadre,
      ventasHoy: resumenHoy.cantidadVentas,
      notificacionesNoLeidas,
    });
  }, []);

  useFocusEffect(
    useCallback(() => {
      cargarIndicadores();
    }, [cargarIndicadores])
  );

  if (!usuario) return null;

  function salir() {
    cerrarSesion();
    router.replace('/');
  }

  return (
    <View style={styles.contenedor}>
      <View style={[styles.encabezado, { paddingTop: insets.top + 16 }]}>
        <ContenedorAncho anchoMaximo={960}>
          <View style={styles.encabezadoFila}>
            <View style={styles.marca}>
              <View style={styles.logo}>
                <Text style={styles.logoTexto}>TL</Text>
              </View>
              <View>
                <View style={styles.marcaEtiquetaFila}>
                  <Text style={styles.etiqueta}>Administración</Text>
                </View>
                <Text style={styles.nombreApp}>Tu Lonchera</Text>
              </View>
            </View>
            <View style={styles.encabezadoAcciones}>
              <View style={styles.indicadorLocal}>
                <View style={styles.puntoLocal} />
                <Text style={styles.indicadorLocalTexto}>Datos en este dispositivo</Text>
              </View>
              <Pressable onPress={salir}>
                <Text style={styles.cerrarSesion}>Cerrar sesión</Text>
              </Pressable>
            </View>
          </View>
        </ContenedorAncho>
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        <ContenedorAncho anchoMaximo={960}>
          <View style={styles.banner}>
            <View style={styles.bannerEyebrowFila}>
              <View style={styles.bannerPunto} />
              <Text style={styles.bannerEyebrow}>Panel operativo central</Text>
            </View>
            <Text style={styles.bannerTitulo}>Portal de módulos administrativos</Text>
            <Text style={styles.bannerDescripcion}>
              Gestiona el inventario de bodega, despachos a promotores, cobros en puntos de
              venta y cuadres diarios.
            </Text>

            {indicadores && (
              <View style={styles.indicadoresFila}>
                <View style={styles.indicador}>
                  <Text style={styles.indicadorEtiqueta}>Promotores con punto asignado</Text>
                  <Text style={styles.indicadorValor}>{indicadores.promotoresConPunto}</Text>
                </View>
                <View
                  style={[
                    styles.indicador,
                    indicadores.conteosConDescuadre > 0 && styles.indicadorAlerta,
                  ]}
                >
                  <Text style={styles.indicadorEtiqueta}>Conteos con descuadre hoy</Text>
                  <Text
                    style={[
                      styles.indicadorValor,
                      indicadores.conteosConDescuadre > 0 && styles.indicadorValorAlerta,
                    ]}
                  >
                    {indicadores.conteosConDescuadre}
                  </Text>
                </View>
                <View style={styles.indicador}>
                  <Text style={styles.indicadorEtiqueta}>Ventas registradas hoy</Text>
                  <Text style={styles.indicadorValor}>{indicadores.ventasHoy}</Text>
                </View>
              </View>
            )}
          </View>

          <View style={[styles.grilla, anchaPantalla && styles.grillaAncha]}>
            {MODULOS.filter((modulo) => !modulo.soloPantallaAncha || anchaPantalla).map(
              (modulo) => {
                const badge =
                  modulo.ruta === '/admin/notificaciones' && indicadores && indicadores.notificacionesNoLeidas > 0
                    ? `${indicadores.notificacionesNoLeidas} sin leer`
                    : modulo.badge;
                return (
                  <TarjetaModulo
                    key={modulo.ruta}
                    icono={modulo.icono}
                    titulo={modulo.titulo}
                    descripcion={modulo.descripcion}
                    badge={badge}
                    destacada={modulo.destacada}
                    ancha={anchaPantalla}
                    onPress={() => router.push(modulo.ruta as Parameters<typeof router.push>[0])}
                  />
                );
              }
            )}
          </View>
        </ContenedorAncho>
      </ScrollView>
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
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 10,
  },
  marca: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  logo: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: COLORES_ADMIN.dorado,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoTexto: {
    fontFamily: TIPOGRAFIA_ADMIN.negrita,
    fontSize: 15,
    color: COLORES_ADMIN.vino,
  },
  marcaEtiquetaFila: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  etiqueta: {
    fontSize: 10,
    fontFamily: TIPOGRAFIA_ADMIN.semiNegrita,
    color: COLORES_ADMIN.dorado,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  nombreApp: {
    fontSize: 16,
    fontFamily: TIPOGRAFIA_ADMIN.negrita,
    color: '#FFFFFF',
  },
  encabezadoAcciones: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  indicadorLocal: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  puntoLocal: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: COLORES_ADMIN.positivo,
  },
  indicadorLocalTexto: {
    fontSize: 11,
    fontFamily: TIPOGRAFIA_ADMIN.medio,
    color: '#FFE9E2',
  },
  cerrarSesion: {
    fontSize: 13,
    fontFamily: TIPOGRAFIA_ADMIN.medio,
    color: '#FFFFFF',
    textDecorationLine: 'underline',
  },
  scroll: {
    paddingBottom: 40,
  },
  banner: {
    backgroundColor: COLORES_ADMIN.superficieMasBaja,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORES_ADMIN.bordeSuave,
    margin: 20,
    marginBottom: 12,
    padding: 20,
    gap: 6,
  },
  bannerEyebrowFila: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  bannerPunto: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORES_ADMIN.dorado,
  },
  bannerEyebrow: {
    fontSize: 11,
    fontFamily: TIPOGRAFIA_ADMIN.semiNegrita,
    color: COLORES_ADMIN.textoSecundario,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  bannerTitulo: {
    fontSize: 24,
    fontFamily: TIPOGRAFIA_ADMIN.negrita,
    color: COLORES_ADMIN.vino,
  },
  bannerDescripcion: {
    fontSize: 14,
    fontFamily: TIPOGRAFIA_ADMIN.regular,
    color: COLORES_ADMIN.textoSecundario,
    lineHeight: 20,
    maxWidth: 600,
  },
  indicadoresFila: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 10,
  },
  indicador: {
    flex: 1,
    minWidth: 160,
    backgroundColor: COLORES_ADMIN.superficieBaja,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 2,
  },
  indicadorAlerta: {
    backgroundColor: '#FDECEC',
  },
  indicadorEtiqueta: {
    fontSize: 11,
    fontFamily: TIPOGRAFIA_ADMIN.medio,
    color: COLORES_ADMIN.textoSecundario,
  },
  indicadorValor: {
    fontSize: 20,
    fontFamily: TIPOGRAFIA_ADMIN.monoSemiNegrita,
    color: COLORES_ADMIN.vino,
  },
  indicadorValorAlerta: {
    color: COLORES_ADMIN.error,
  },
  grilla: {
    paddingHorizontal: 20,
    gap: 12,
  },
  grillaAncha: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
});
