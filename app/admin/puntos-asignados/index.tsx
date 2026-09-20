import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { Punto, UsuarioSesion } from '@/core/tipos';
import { getDb } from '@/db/client';
import { getDispositivoId } from '@/db/dispositivo';
import { asignarPromotorAPunto, obtenerPuntoVigentePromotor } from '@/db/eventos';
import { listarPuntos } from '@/db/puntos';
import { listarPromotores } from '@/db/usuarios';
import { COLORES } from '@/ui/colores';
import { ContenedorAncho } from '@/ui/ContenedorAncho';
import { useRequiereSesion } from '@/ui/useRequiereSesion';

export default function PuntosAsignados() {
  const usuario = useRequiereSesion(['ADMIN']);
  const [promotores, setPromotores] = useState<UsuarioSesion[]>([]);
  const [promotor, setPromotor] = useState<UsuarioSesion | null>(null);
  const [puntos, setPuntos] = useState<Punto[]>([]);
  const [puntoVigenteId, setPuntoVigenteId] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);
  const [asignando, setAsignando] = useState<string | null>(null);
  const insets = useSafeAreaInsets();

  useEffect(() => {
    (async () => {
      const db = await getDb();
      const [listaPromotores, listaPuntos] = await Promise.all([listarPromotores(db), listarPuntos(db)]);
      setPromotores(listaPromotores);
      setPuntos(listaPuntos);
      setCargando(false);
    })();
  }, []);

  useEffect(() => {
    if (!promotor) return;
    (async () => {
      const db = await getDb();
      const vigente = await obtenerPuntoVigentePromotor(db, promotor.id);
      setPuntoVigenteId(vigente?.puntoId ?? null);
    })();
  }, [promotor]);

  if (!usuario) return null;

  async function asignar(punto: Punto) {
    if (!promotor) return;
    setAsignando(punto.id);
    try {
      const db = await getDb();
      const dispositivoId = await getDispositivoId(db);
      await asignarPromotorAPunto(
        db,
        { promotorId: promotor.id, puntoId: punto.id, empresaId: punto.empresaId },
        dispositivoId
      );
      setPuntoVigenteId(punto.id);
      Alert.alert('Punto asignado', `${promotor.nombre} quedó asignado a ${punto.empresaNombre} · ${punto.nombre}.`);
    } finally {
      setAsignando(null);
    }
  }

  return (
    <View style={styles.contenedor}>
      <View style={[styles.encabezado, { paddingTop: insets.top + 20 }]}>
        <ContenedorAncho anchoMaximo={720} style={styles.encabezadoContenido}>
          <Pressable onPress={() => (promotor ? setPromotor(null) : router.back())}>
            <Text style={styles.volver}>‹ {promotor ? 'Elegir otro promotor' : 'Admin'}</Text>
          </Pressable>
          <Text style={styles.titulo}>
            {promotor ? `Asignar punto a ${promotor.nombre}` : 'Asignar punto a promotor'}
          </Text>
        </ContenedorAncho>
      </View>

      {cargando ? (
        <View style={styles.centrado}>
          <ActivityIndicator size="large" color={COLORES.oscuro} />
        </View>
      ) : !promotor ? (
        promotores.length === 0 ? (
          <View style={styles.centrado}>
            <Text style={styles.vacio}>No hay promotores activos.</Text>
          </View>
        ) : (
          <ContenedorAncho anchoMaximo={720} llenarAlto>
            <FlatList
              data={promotores}
              keyExtractor={(p) => p.id}
              contentContainerStyle={styles.lista}
              renderItem={({ item }) => (
                <Pressable style={styles.filaPromotor} onPress={() => setPromotor(item)}>
                  <Text style={styles.filaPromotorNombre}>{item.nombre}</Text>
                  <Text style={styles.filaPromotorFlecha}>›</Text>
                </Pressable>
              )}
            />
          </ContenedorAncho>
        )
      ) : puntos.length === 0 ? (
        <View style={styles.centrado}>
          <Text style={styles.vacio}>
            No hay puntos registrados todavía. Créalos primero en Empresas y puntos.
          </Text>
        </View>
      ) : (
        <ContenedorAncho anchoMaximo={720} llenarAlto>
          <FlatList
            data={puntos}
            keyExtractor={(p) => p.id}
            contentContainerStyle={styles.lista}
            renderItem={({ item }) => {
              const esVigente = item.id === puntoVigenteId;
              return (
                <Pressable
                  style={[styles.filaPunto, esVigente && styles.filaPuntoVigente]}
                  onPress={() => asignar(item)}
                  disabled={asignando !== null}
                >
                  <View style={styles.filaPuntoTexto}>
                    <Text style={styles.filaPuntoEmpresa}>{item.empresaNombre}</Text>
                    <Text style={styles.filaPuntoNombre}>{item.nombre}</Text>
                  </View>
                  {asignando === item.id ? (
                    <ActivityIndicator color={COLORES.oscuro} size="small" />
                  ) : esVigente ? (
                    <Text style={styles.filaPuntoVigenteTexto}>Vigente</Text>
                  ) : null}
                </Pressable>
              );
            }}
          />
        </ContenedorAncho>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  contenedor: {
    flex: 1,
    backgroundColor: '#FBEDED',
  },
  encabezado: {
    backgroundColor: COLORES.oscuro,
    paddingHorizontal: 20,
    paddingBottom: 16,
  },
  encabezadoContenido: {
    gap: 4,
  },
  volver: {
    color: '#FFFFFF',
    fontSize: 14,
    textDecorationLine: 'underline',
  },
  titulo: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '700',
  },
  centrado: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  vacio: {
    fontSize: 14,
    color: '#888',
    textAlign: 'center',
  },
  lista: {
    padding: 20,
    gap: 10,
  },
  filaPromotor: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 16,
  },
  filaPromotorNombre: {
    fontSize: 15,
    fontWeight: '700',
    color: '#333',
  },
  filaPromotorFlecha: {
    fontSize: 20,
    color: COLORES.oscuro,
  },
  filaPunto: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 16,
  },
  filaPuntoVigente: {
    borderWidth: 1.5,
    borderColor: COLORES.oscuro,
  },
  filaPuntoTexto: {
    gap: 2,
  },
  filaPuntoEmpresa: {
    fontSize: 12,
    color: '#888',
    fontWeight: '600',
  },
  filaPuntoNombre: {
    fontSize: 15,
    fontWeight: '700',
    color: '#333',
  },
  filaPuntoVigenteTexto: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORES.oscuro,
  },
});
