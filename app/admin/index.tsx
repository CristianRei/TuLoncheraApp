import IonIcon from '@expo/vector-icons/Ionicons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { calcularRangoHoyBogota } from '@/core/analitica';
import { obtenerResumenVentas } from '@/db/analitica';
import { getDb } from '@/db/client';
import { contarConteosConDescuadre } from '@/db/conteos';
import { getDispositivoId } from '@/db/dispositivo';
import { contarPromotoresConPuntoVigente } from '@/db/eventos';
import { contarNotificacionesNoLeidas, generarNotificaciones } from '@/db/notificaciones';
import { ContenedorAncho } from '@/ui/ContenedorAncho';
import { MODULOS_ADMIN } from '@/ui/modulosAdmin';
import { ANCHO_ADMIN, COLORES_ADMIN, ESPACIADO_ADMIN, TIPOGRAFIA_ADMIN, ESTADO_ADMIN, RADII_ADMIN, TEXTO_ADMIN } from '@/ui/tema';
import { TarjetaModulo } from '@/ui/TarjetaModulo';
import { useEsPantallaAncha } from '@/ui/useEsPantallaAncha';
import { useSesion } from '@/ui/SesionContext';
import { contarTareasSyncConError } from '@/db/syncCola';
import { useRequiereSesion } from '@/ui/useRequiereSesion';

interface Indicadores {
  promotoresConPunto: number;
  conteosConDescuadre: number;
  ventasHoy: number;
  notificacionesNoLeidas: number;
  tareasSyncConError: number;
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
    const [promotoresConPunto, conteosConDescuadre, resumenHoy, notificacionesNoLeidas, tareasSyncConError] = await Promise.all([
      contarPromotoresConPuntoVigente(db),
      contarConteosConDescuadre(db, rangoHoy),
      obtenerResumenVentas(db, rangoHoy),
      contarNotificacionesNoLeidas(db),
      contarTareasSyncConError(db),
    ]);
    setIndicadores({
      promotoresConPunto,
      conteosConDescuadre,
      ventasHoy: resumenHoy.cantidadVentas,
      notificacionesNoLeidas,
      tareasSyncConError,
    });
  }, []);

  useFocusEffect(
    useCallback(() => {
      cargarIndicadores();
    }, [cargarIndicadores])
  );

  // En pantalla ancha el Dashboard es la home real de admin — este portal
  // de tarjetas ya no se muestra ahí, se navega por SidebarAdmin. En
  // celular (sin sidebar, Dashboard sigue "soloPantallaAncha") el portal
  // sigue siendo la única forma de llegar a los módulos.
  useEffect(() => {
    if (anchaPantalla) router.replace('/admin/dashboard');
  }, [anchaPantalla]);

  if (!usuario || anchaPantalla) return null;

  function salir() {
    cerrarSesion();
    router.replace('/');
  }

  return (
    <View style={styles.contenedor}>
      <View style={[styles.encabezado, { paddingTop: insets.top + 16 }]}>
        <ContenedorAncho anchoMaximo={ANCHO_ADMIN.tablero}>
          <View style={styles.encabezadoFila}>
            <View style={styles.marca}>
              <View style={styles.logo}>
                <Image
                  source={require('@/assets/images/logo-tu-lonchera.png')}
                  style={styles.logoImagen}
                  resizeMode="contain"
                />
              </View>
              <View>
                <View style={styles.marcaEtiquetaFila}>
                  <Text style={styles.etiqueta}>Administración</Text>
                </View>
                <Text style={styles.nombreApp}>Tu Lonchera</Text>
              </View>
            </View>
            <View style={styles.encabezadoAcciones}>
              <Pressable style={styles.botonCerrarSesion} onPress={salir}>
                <IonIcon name="log-out-outline" size={15} color="#FFFFFF" />
                <Text style={styles.cerrarSesion}>Cerrar sesión</Text>
              </Pressable>
            </View>
          </View>
        </ContenedorAncho>
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        <ContenedorAncho anchoMaximo={ANCHO_ADMIN.tablero}>
          <View style={styles.banner}>
            <View style={styles.bannerEyebrowFila}>
              <View style={styles.bannerPunto} />
              <Text style={styles.bannerEyebrow}>Hoy en la operación</Text>
            </View>

            {indicadores && (
              <View style={styles.indicadoresFila}>
                <View style={styles.indicador}>
                  <Text style={styles.indicadorValor}>{indicadores.ventasHoy}</Text>
                  <Text style={styles.indicadorEtiqueta}>Ventas</Text>
                </View>
                <View style={styles.indicador}>
                  <Text style={styles.indicadorValor}>{indicadores.promotoresConPunto}</Text>
                  <Text style={styles.indicadorEtiqueta}>Promotores en punto</Text>
                </View>
                <View
                  style={[
                    styles.indicador,
                    indicadores.conteosConDescuadre > 0 && styles.indicadorAlerta,
                  ]}
                >
                  <Text
                    style={[
                      styles.indicadorValor,
                      indicadores.conteosConDescuadre > 0 && styles.indicadorValorAlerta,
                    ]}
                  >
                    {indicadores.conteosConDescuadre}
                  </Text>
                  <Text style={styles.indicadorEtiqueta}>Descuadres</Text>
                </View>
              </View>
            )}
          </View>

          <Text style={styles.seccionTitulo}>Módulos</Text>
          <View style={styles.grilla}>
            {MODULOS_ADMIN.filter((modulo) => !modulo.soloPantallaAncha || anchaPantalla).map(
              (modulo) => {
                const badge =
                  modulo.ruta === '/admin/notificaciones' && indicadores && indicadores.notificacionesNoLeidas > 0
                    ? `${indicadores.notificacionesNoLeidas} sin leer`
                    : modulo.ruta === '/admin/sync' && indicadores && indicadores.tareasSyncConError > 0
                      ? `${indicadores.tareasSyncConError} con error`
                      : modulo.badge;
                return (
                  <TarjetaModulo
                    key={modulo.ruta}
                    icono={modulo.icono}
                    titulo={modulo.titulo}
                    descripcion={modulo.descripcion}
                    badge={badge}
                    destacada={modulo.destacada}
                    compacta
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
  seccionTitulo: {
    ...TEXTO_ADMIN.etiqueta,
    marginHorizontal: ESPACIADO_ADMIN.lg,
    marginTop: ESPACIADO_ADMIN.xl,
    marginBottom: ESPACIADO_ADMIN.sm,
  },
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
    width: 40,
    height: 40,
    borderRadius: RADII_ADMIN.sm,
    backgroundColor: COLORES_ADMIN.superficieMasBaja,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 4,
  },
  logoImagen: {
    width: '100%',
    height: '100%',
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
    ...TEXTO_ADMIN.tituloSeccion,
    color: COLORES_ADMIN.textoInverso,
  },
  encabezadoAcciones: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  botonCerrarSesion: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
    borderRadius: RADII_ADMIN.pill,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  cerrarSesion: {
    ...TEXTO_ADMIN.boton,
    color: COLORES_ADMIN.textoInverso,
  },
  scroll: {
    paddingBottom: 40,
  },
  banner: {
    backgroundColor: COLORES_ADMIN.superficieMasBaja,
    borderRadius: RADII_ADMIN.lg,
    borderWidth: 1,
    borderColor: COLORES_ADMIN.bordeSuave,
    marginHorizontal: ESPACIADO_ADMIN.lg,
    marginTop: ESPACIADO_ADMIN.lg,
    padding: ESPACIADO_ADMIN.lg,
    gap: ESPACIADO_ADMIN.md,
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
    ...TEXTO_ADMIN.etiqueta,
    letterSpacing: 1,
  },
  indicadoresFila: {
    flexDirection: 'row',
    gap: ESPACIADO_ADMIN.sm,
  },
  indicador: {
    flex: 1,
    backgroundColor: COLORES_ADMIN.superficieBaja,
    borderRadius: RADII_ADMIN.sm,
    paddingHorizontal: ESPACIADO_ADMIN.sm,
    paddingVertical: ESPACIADO_ADMIN.md,
    alignItems: 'center',
    gap: 2,
  },
  indicadorAlerta: {
    backgroundColor: ESTADO_ADMIN.error.fondo,
  },
  indicadorEtiqueta: {
    ...TEXTO_ADMIN.nota,
    fontSize: 11,
    textAlign: 'center',
  },
  indicadorValor: {
    ...TEXTO_ADMIN.datoGrande,
    fontSize: 22,
    color: COLORES_ADMIN.vino,
  },
  indicadorValorAlerta: {
    color: COLORES_ADMIN.error,
  },
  grilla: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: ESPACIADO_ADMIN.md,
    paddingHorizontal: ESPACIADO_ADMIN.lg,
  },
});
