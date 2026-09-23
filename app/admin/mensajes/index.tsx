import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { formatearPesos } from '@/core/dinero';
import { mensajeDeError } from '@/core/errores';
import type { Persona, Rol } from '@/core/tipos';
import { getDb } from '@/db/client';
import { enviarMensajes } from '@/db/mensajes';
import { obtenerProgresoMetasDiarias, type ProgresoMetaDiaria } from '@/db/metasDiarias';
import { listarPersonalCompleto } from '@/db/personal';
import { COLORES } from '@/ui/colores';
import { ContenedorAncho } from '@/ui/ContenedorAncho';
import { useEsPantallaAncha } from '@/ui/useEsPantallaAncha';
import { useRequiereSesion } from '@/ui/useRequiereSesion';

type RolDestino = 'PROMOTOR' | 'BODEGA';

const ETIQUETA_ROL: Record<RolDestino, string> = {
  PROMOTOR: 'Promotores',
  BODEGA: 'Bodega',
};

function mensajeProgreso(fila: ProgresoMetaDiaria): string {
  if (fila.progresoPct >= 100) {
    return `¡Felicitaciones! Ya cumpliste tu meta del día en ${fila.puntoNombre} (${formatearPesos(fila.totalVendidoHoy)} de ${formatearPesos(fila.metaDiaria)}).`;
  }
  return `Ánimo, vas en un ${fila.progresoPct}% de tu meta de hoy en ${fila.puntoNombre} (${formatearPesos(fila.totalVendidoHoy)} de ${formatearPesos(fila.metaDiaria)}) — ¡con esfuerzo la cumples!`;
}

export default function Mensajes() {
  const usuario = useRequiereSesion(['ADMIN']);
  const insets = useSafeAreaInsets();
  const anchaPantalla = useEsPantallaAncha();

  const [rol, setRol] = useState<RolDestino>('PROMOTOR');
  const [personal, setPersonal] = useState<Persona[]>([]);
  const [seleccionados, setSeleccionados] = useState<Set<string>>(new Set());
  const [cuerpo, setCuerpo] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [aviso, setAviso] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null);

  const [progresoMetas, setProgresoMetas] = useState<ProgresoMetaDiaria[]>([]);
  const [cargandoMetas, setCargandoMetas] = useState(true);
  const [enviandoMetas, setEnviandoMetas] = useState(false);

  const cargar = useCallback(async (rolActual: RolDestino) => {
    const db = await getDb();
    const lista = await listarPersonalCompleto(db, { rol: rolActual as Rol });
    setPersonal(lista);
    setSeleccionados(new Set(lista.map((p) => p.id))); // todos marcados por defecto
  }, []);

  const cargarMetas = useCallback(async () => {
    setCargandoMetas(true);
    try {
      const db = await getDb();
      setProgresoMetas(await obtenerProgresoMetasDiarias(db));
    } finally {
      setCargandoMetas(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      cargar(rol);
      cargarMetas();
    }, [cargar, cargarMetas, rol])
  );

  if (!usuario) return null;

  function alternarSeleccion(id: string) {
    setSeleccionados((actual) => {
      const nuevo = new Set(actual);
      if (nuevo.has(id)) nuevo.delete(id);
      else nuevo.add(id);
      return nuevo;
    });
  }

  async function enviar() {
    if (cuerpo.trim().length === 0 || seleccionados.size === 0 || !usuario) return;
    setEnviando(true);
    setAviso(null);
    try {
      const destinatarios = personal
        .filter((p) => seleccionados.has(p.id))
        .map((p) => ({ id: p.id, nombre: p.nombre }));
      await enviarMensajes(
        [{ cuerpo: cuerpo.trim(), tipo: 'MANUAL', destinatarios }],
        { id: usuario.id, nombre: usuario.nombre }
      );
      setCuerpo('');
      setAviso({ tipo: 'ok', texto: `Mensaje enviado a ${destinatarios.length} persona(s).` });
    } catch (error) {
      setAviso({ tipo: 'error', texto: mensajeDeError(error) });
    } finally {
      setEnviando(false);
    }
  }

  async function enviarProgresoDeMetas() {
    if (!usuario || progresoMetas.length === 0) return;
    setEnviandoMetas(true);
    setAviso(null);
    try {
      await enviarMensajes(
        progresoMetas.map((fila) => ({
          cuerpo: mensajeProgreso(fila),
          tipo: 'META_PROGRESO',
          destinatarios: [{ id: fila.promotorId, nombre: fila.promotorNombre }],
        })),
        { id: usuario.id, nombre: usuario.nombre }
      );
      setAviso({ tipo: 'ok', texto: `Progreso enviado a ${progresoMetas.length} promotor(es).` });
    } catch (error) {
      setAviso({ tipo: 'error', texto: mensajeDeError(error) });
    } finally {
      setEnviandoMetas(false);
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
              <Pressable onPress={() => router.back()}>
                <Text style={styles.volver}>‹ Admin</Text>
              </Pressable>
            )}
            <Text style={anchaPantalla ? styles.tituloAncho : styles.titulo}>Mensajes</Text>
            <View style={{ width: 40 }} />
          </View>
        </ContenedorAncho>
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        <ContenedorAncho anchoMaximo={720} style={{ gap: 16 }}>
          {aviso && (
            <View style={[styles.aviso, aviso.tipo === 'error' && styles.avisoError]}>
              <Text style={[styles.avisoTexto, aviso.tipo === 'error' && styles.avisoTextoError]}>{aviso.texto}</Text>
            </View>
          )}

          <View style={styles.tarjeta}>
            <Text style={styles.tarjetaTitulo}>Progreso de la meta del día</Text>
            <Text style={styles.tarjetaDescripcion}>
              Envía a cada promotor con meta asignada hoy un mensaje personalizado con su % de avance.
            </Text>
            {cargandoMetas ? (
              <ActivityIndicator color={COLORES.oscuro} style={{ marginTop: 8 }} />
            ) : progresoMetas.length === 0 ? (
              <Text style={styles.vacio}>Ningún promotor tiene una meta diaria asignada hoy (Calendario de eventos).</Text>
            ) : (
              <>
                {progresoMetas.map((fila) => (
                  <View key={`${fila.eventoId}-${fila.promotorId}`} style={styles.filaProgreso}>
                    <Text style={styles.filaProgresoNombre}>{fila.promotorNombre}</Text>
                    <Text style={styles.filaProgresoPct}>{fila.progresoPct}%</Text>
                  </View>
                ))}
                <Pressable
                  style={[styles.boton, enviandoMetas && styles.botonDeshabilitado]}
                  disabled={enviandoMetas}
                  onPress={enviarProgresoDeMetas}
                >
                  {enviandoMetas ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <Text style={styles.botonTexto}>Enviar progreso a {progresoMetas.length} promotor(es)</Text>
                  )}
                </Pressable>
              </>
            )}
          </View>

          <View style={styles.tarjeta}>
            <Text style={styles.tarjetaTitulo}>Enviar un mensaje</Text>
            <Text style={styles.tarjetaDescripcion}>
              Llega como notificación push al celular de cada persona seleccionada.
            </Text>

            <View style={styles.tabsRol}>
              {(['PROMOTOR', 'BODEGA'] as RolDestino[]).map((opcion) => (
                <Pressable
                  key={opcion}
                  style={[styles.chipRol, rol === opcion && styles.chipRolActivo]}
                  onPress={() => setRol(opcion)}
                >
                  <Text style={[styles.chipRolTexto, rol === opcion && styles.chipRolTextoActivo]}>
                    {ETIQUETA_ROL[opcion]}
                  </Text>
                </Pressable>
              ))}
            </View>

            <View style={styles.filaSeleccionTodos}>
              <Text style={styles.etiquetaSeleccion}>
                {seleccionados.size} de {personal.length} seleccionados
              </Text>
              <Pressable onPress={() => setSeleccionados(new Set(personal.map((p) => p.id)))}>
                <Text style={styles.enlaceSeleccion}>Todos</Text>
              </Pressable>
              <Pressable onPress={() => setSeleccionados(new Set())}>
                <Text style={styles.enlaceSeleccion}>Ninguno</Text>
              </Pressable>
            </View>

            {personal.length === 0 ? (
              <Text style={styles.vacio}>No hay {ETIQUETA_ROL[rol].toLowerCase()} activos.</Text>
            ) : (
              personal.map((p) => {
                const marcado = seleccionados.has(p.id);
                return (
                  <Pressable key={p.id} style={styles.filaCheckbox} onPress={() => alternarSeleccion(p.id)}>
                    <View style={[styles.checkbox, marcado && styles.checkboxMarcado]}>
                      {marcado && <Text style={styles.checkboxMarca}>✓</Text>}
                    </View>
                    <Text style={styles.filaCheckboxTexto}>{p.nombre}</Text>
                  </Pressable>
                );
              })
            )}

            <TextInput
              style={styles.textoMensaje}
              placeholder="Escribe el mensaje..."
              placeholderTextColor="#999"
              value={cuerpo}
              onChangeText={setCuerpo}
              multiline
            />

            <Pressable
              style={[
                styles.boton,
                (enviando || cuerpo.trim().length === 0 || seleccionados.size === 0) && styles.botonDeshabilitado,
              ]}
              disabled={enviando || cuerpo.trim().length === 0 || seleccionados.size === 0}
              onPress={enviar}
            >
              {enviando ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={styles.botonTexto}>Enviar mensaje</Text>
              )}
            </Pressable>
          </View>

          <Text style={styles.notaConductor}>
            Nota: Conductor no tiene todavía una pantalla propia en la app, así que no puede recibir mensajes por ahora.
          </Text>
        </ContenedorAncho>
      </ScrollView>
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
  scroll: { padding: 20, paddingBottom: 40 },
  aviso: {
    backgroundColor: '#EAF5EA',
    borderWidth: 1,
    borderColor: '#C3E3C3',
    borderRadius: 10,
    padding: 12,
  },
  avisoError: { backgroundColor: '#FBEAEA', borderColor: '#E3B3B3' },
  avisoTexto: { fontSize: 13, color: '#2E6B2E', fontWeight: '600' },
  avisoTextoError: { color: '#B00020' },
  tarjeta: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 16,
    gap: 10,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  tarjetaTitulo: { fontSize: 16, fontWeight: '700', color: '#333' },
  tarjetaDescripcion: { fontSize: 13, color: '#888' },
  vacio: { fontSize: 13, color: '#888', fontStyle: 'italic' },
  filaProgreso: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#F0E0E0',
  },
  filaProgresoNombre: { fontSize: 14, color: '#333' },
  filaProgresoPct: { fontSize: 14, fontWeight: '700', color: COLORES.oscuro },
  tabsRol: { flexDirection: 'row', gap: 8 },
  chipRol: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 18,
    backgroundColor: '#FBEDED',
    borderWidth: 1,
    borderColor: '#EBD3D3',
  },
  chipRolActivo: { backgroundColor: COLORES.oscuro, borderColor: COLORES.oscuro },
  chipRolTexto: { fontSize: 13, fontWeight: '600', color: '#666' },
  chipRolTextoActivo: { color: '#FFFFFF' },
  filaSeleccionTodos: { flexDirection: 'row', alignItems: 'center', gap: 14, marginTop: 4 },
  etiquetaSeleccion: { fontSize: 12, color: '#888', flex: 1 },
  enlaceSeleccion: { fontSize: 12, color: COLORES.oscuro, fontWeight: '600', textDecorationLine: 'underline' },
  filaCheckbox: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: '#B89999',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxMarcado: { backgroundColor: COLORES.oscuro, borderColor: COLORES.oscuro },
  checkboxMarca: { color: '#FFFFFF', fontSize: 12, fontWeight: '700' },
  filaCheckboxTexto: { fontSize: 14, color: '#333' },
  textoMensaje: {
    borderWidth: 1,
    borderColor: '#EBD3D3',
    borderRadius: 10,
    padding: 12,
    fontSize: 14,
    minHeight: 80,
    textAlignVertical: 'top',
    marginTop: 6,
  },
  boton: {
    backgroundColor: COLORES.oscuro,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 4,
  },
  botonDeshabilitado: { opacity: 0.5 },
  botonTexto: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
  notaConductor: { fontSize: 11, color: '#A88', fontStyle: 'italic', textAlign: 'center' },
});
