import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import { formatearPesos } from '@/core/dinero';
import type { Descuento } from '@/core/tipos';
import { getDb } from '@/db/client';
import { desactivarDescuento, listarDescuentos } from '@/db/descuentos';
import { ContenedorAncho } from '@/ui/ContenedorAncho';
import { Encabezado } from '@/ui/Encabezado';
import { EmptyState } from '@/ui/EmptyState';
import { FilterTabs } from '@/ui/FilterTabs';
import { ModalConfirmacion } from '@/ui/ModalConfirmacion';
import { ANCHO_ADMIN, COLORES_ADMIN, ESPACIADO_ADMIN, TIPOGRAFIA_ADMIN, ESTADO_ADMIN, RADII_ADMIN, TEXTO_ADMIN } from '@/ui/tema';
import { useRequiereSesion } from '@/ui/useRequiereSesion';

type Filtro = 'VIGENTES' | 'VENCIDOS';

const OPCIONES_FILTRO: { valor: Filtro; etiqueta: string }[] = [
  { valor: 'VIGENTES', etiqueta: 'Vigentes y próximos' },
  { valor: 'VENCIDOS', etiqueta: 'Vencidos / inactivos' },
];

/** Hora de Bogotá "HH:MM" de un instante (UTC-5 fijo). */
function horaBogota(iso: string): string {
  return new Date(new Date(iso).getTime() - 5 * 3600 * 1000).toISOString().slice(11, 16);
}

function formatearFecha(iso: string): string {
  return new Date(iso).toLocaleDateString('es-CO', { dateStyle: 'medium' });
}

function formatearFechaHora(iso: string): string {
  return new Date(iso).toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short' });
}

/**
 * "24 sept 2026 — 30 sept 2026" para un descuento de días completos;
 * con fecha y hora si tiene horario ("24 sept 2026, 8:00 a. m. — ...").
 */
function describirVigencia(descuento: Descuento): string {
  const diasCompletos = horaBogota(descuento.desde) === '00:00' && horaBogota(descuento.hasta) === '23:59';
  return diasCompletos
    ? `${formatearFecha(descuento.desde)} — ${formatearFecha(descuento.hasta)}`
    : `${formatearFechaHora(descuento.desde)} — ${formatearFechaHora(descuento.hasta)}`;
}

function describirValor(descuento: Descuento): string {
  return descuento.tipo === 'PORCENTAJE' ? `${descuento.valor}%` : formatearPesos(descuento.valor);
}

function describirAlcance(descuento: Descuento): string {
  const promotor = descuento.promotorNombre ?? 'Todos los promotores';
  const producto = descuento.productoNombre ?? 'Todos los productos';
  const punto = descuento.puntoNombre ?? 'Todos los puntos';
  return `${promotor} · ${producto} · ${punto}`;
}

export default function Descuentos() {
  const usuario = useRequiereSesion(['ADMIN']);
  const [descuentos, setDescuentos] = useState<Descuento[]>([]);
  const [filtro, setFiltro] = useState<Filtro>('VIGENTES');
  const [cargando, setCargando] = useState(true);
  const [idParaDesactivar, setIdParaDesactivar] = useState<string | null>(null);
  const [desactivando, setDesactivando] = useState(false);

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
  // Un descuento programado para más tarde (ej. hoy desde las 8 am) todavía
  // no aplica, pero tampoco está vencido: va con los vigentes.
  const vigenteOProximo = (d: Descuento) => d.activo && d.hasta >= ahora;
  const filtrados = descuentos.filter((d) => (filtro === 'VIGENTES' ? vigenteOProximo(d) : !vigenteOProximo(d)));

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
      <Encabezado
        titulo="Descuentos"
        rutaVolverTexto="Admin"
        accion={{ icono: 'add', texto: 'Nuevo', onPress: () => router.push('/admin/descuentos/nuevo') }}
      />

      <ContenedorAncho anchoMaximo={ANCHO_ADMIN.lista}>
        <View style={styles.controles}>
          <FilterTabs opciones={OPCIONES_FILTRO} valorActivo={filtro} onCambiar={setFiltro} />
        </View>
      </ContenedorAncho>

      {cargando ? (
        <View style={styles.centrado}>
          <ActivityIndicator size="large" color={COLORES_ADMIN.vino} />
        </View>
      ) : filtrados.length === 0 ? (
        <EmptyState
          icono="pricetag-outline"
          mensaje={
            filtro === 'VIGENTES' ? 'No hay descuentos vigentes ni programados.' : 'No hay descuentos vencidos o inactivos.'
          }
        />
      ) : (
        <ContenedorAncho anchoMaximo={ANCHO_ADMIN.lista} llenarAlto>
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
                      item.desde > ahora ? (
                        <View style={styles.badgeProgramado}>
                          <Text style={styles.badgeProgramadoTexto}>Programado</Text>
                        </View>
                      ) : (
                        <View style={styles.badgeVigente}>
                          <Text style={styles.badgeVigenteTexto}>Vigente</Text>
                        </View>
                      )
                    ) : (
                      <View style={styles.badgeInactivo}>
                        <Text style={styles.badgeInactivoTexto}>
                          {item.activo ? 'Vencido' : 'Desactivado'}
                        </Text>
                      </View>
                    )}
                  </View>
                  <Text style={styles.filaAlcance}>{describirAlcance(item)}</Text>
                  <Text style={styles.filaVigencia}>{describirVigencia(item)}</Text>
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
  controles: {
    paddingTop: ESPACIADO_ADMIN.lg,
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
  fila: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: COLORES_ADMIN.superficieMasBaja,
    borderRadius: RADII_ADMIN.md,
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
    fontSize: 16,
    fontFamily: TIPOGRAFIA_ADMIN.monoSemiNegrita,
    color: COLORES_ADMIN.vino,
  },
  badgeVigente: {
    backgroundColor: ESTADO_ADMIN.exito.fondo,
    borderWidth: 1,
    borderColor: ESTADO_ADMIN.exito.borde,
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
  badgeProgramado: {
    backgroundColor: ESTADO_ADMIN.alerta.fondo,
    borderWidth: 1,
    borderColor: ESTADO_ADMIN.alerta.borde,
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  badgeProgramadoTexto: {
    fontSize: 10,
    fontFamily: TIPOGRAFIA_ADMIN.semiNegrita,
    color: ESTADO_ADMIN.alerta.texto,
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
    ...TEXTO_ADMIN.cuerpo,
  },
  filaVigencia: {
    ...TEXTO_ADMIN.datoSecundario,
  },
  botonDesactivar: {
    borderWidth: 1,
    borderColor: COLORES_ADMIN.error,
    borderRadius: RADII_ADMIN.sm,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  botonDesactivarTexto: {
    ...TEXTO_ADMIN.boton,
    color: COLORES_ADMIN.error,
  },
});
