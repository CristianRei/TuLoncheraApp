import Ionicons from '@expo/vector-icons/Ionicons';
import { router, usePathname } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { MODULOS_ADMIN } from './modulosAdmin';
import { COLORES_ADMIN, TIPOGRAFIA_ADMIN } from './tema';

export const ANCHO_SIDEBAR_ADMIN = 248;

/**
 * Sidebar fijo de administración — solo en pantalla ancha (useEsPantallaAncha,
 * ≥768px), montado por app/admin/_layout.tsx para las 14 secciones reales
 * (src/ui/modulosAdmin.ts, misma lista que el menú principal). En celular no
 * se monta: no hay espacio para un panel de 248px, se sigue navegando como
 * antes (volver a Admin y tocar el módulo). Cuelga debajo de BarraSuperiorAdmin
 * (logo + cerrar sesión ya viven ahí, la barra global).
 */
export function SidebarAdmin() {
  const pathname = usePathname();

  return (
    <View style={styles.sidebar}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.seccionTitulo}>Módulos</Text>
        {MODULOS_ADMIN.map((modulo) => {
          const activo = pathname.startsWith(modulo.ruta);
          return (
            <Pressable
              key={modulo.ruta}
              style={[styles.enlace, activo && styles.enlaceActivo]}
              onPress={() => router.push(modulo.ruta as Parameters<typeof router.push>[0])}
            >
              <Ionicons
                name={modulo.icono}
                size={19}
                color={activo ? '#FFFFFF' : COLORES_ADMIN.textoSecundario}
              />
              <Text style={[styles.enlaceTexto, activo && styles.enlaceTextoActivo]} numberOfLines={1}>
                {modulo.titulo}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  sidebar: {
    width: ANCHO_SIDEBAR_ADMIN,
    backgroundColor: COLORES_ADMIN.superficieBaja,
    borderRightWidth: 1,
    borderRightColor: COLORES_ADMIN.bordeSuave,
    justifyContent: 'space-between',
  },
  scroll: {
    padding: 12,
    gap: 2,
  },
  seccionTitulo: {
    fontSize: 10,
    fontFamily: TIPOGRAFIA_ADMIN.semiNegrita,
    color: COLORES_ADMIN.textoSecundario,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    paddingHorizontal: 10,
    paddingBottom: 8,
    paddingTop: 4,
  },
  enlace: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 9,
  },
  enlaceActivo: {
    backgroundColor: COLORES_ADMIN.vino,
  },
  enlaceTexto: {
    flex: 1,
    fontSize: 13,
    fontFamily: TIPOGRAFIA_ADMIN.medio,
    color: COLORES_ADMIN.texto,
  },
  enlaceTextoActivo: {
    color: '#FFFFFF',
    fontFamily: TIPOGRAFIA_ADMIN.semiNegrita,
  },
});
