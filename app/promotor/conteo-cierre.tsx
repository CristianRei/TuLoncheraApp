import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { obtenerTeoricoParaConteo, registrarConteo } from '@/db/conteos';
import { getDb } from '@/db/client';
import { getDispositivoId } from '@/db/dispositivo';
import { COLORES, TIPOGRAFIA_PROMOTOR } from '@/ui/colores';
import { useRequiereSesion } from '@/ui/useRequiereSesion';

interface LineaEnEdicion {
  productoId: string;
  productoNombre: string;
  teorico: number;
  contadoTexto: string;
}

export default function ConteoCierre() {
  const usuario = useRequiereSesion(['PROMOTOR']);
  const [lineas, setLineas] = useState<LineaEnEdicion[]>([]);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);

  const cargar = useCallback(async (promotorId: string) => {
    setCargando(true);
    try {
      const db = await getDb();
      const teorico = await obtenerTeoricoParaConteo(db, promotorId);
      setLineas(
        teorico.map((item) => ({
          productoId: item.productoId,
          productoNombre: item.productoNombre,
          teorico: item.teorico,
          contadoTexto: '',
        }))
      );
    } finally {
      setCargando(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (usuario) cargar(usuario.id);
    }, [usuario, cargar])
  );

  if (!usuario) return null;
  const usuarioActual = usuario;

  function cambiarContado(productoId: string, texto: string) {
    const limpio = texto.replace(/\D/g, '');
    setLineas((actual) =>
      actual.map((linea) =>
        linea.productoId === productoId ? { ...linea, contadoTexto: limpio } : linea
      )
    );
  }

  const faltanPorContar = lineas.some((linea) => linea.contadoTexto === '');
  const conDiferencia = lineas.filter(
    (linea) => linea.contadoTexto !== '' && parseInt(linea.contadoTexto, 10) !== linea.teorico
  ).length;

  async function confirmar() {
    if (faltanPorContar) {
      Alert.alert('Faltan productos', 'Cuenta todos los productos antes de confirmar el cierre.');
      return;
    }
    setGuardando(true);
    try {
      const db = await getDb();
      const dispositivoId = await getDispositivoId(db);
      await registrarConteo(
        db,
        {
          promotorId: usuarioActual.id,
          promotorNombre: usuarioActual.nombre,
          lineas: lineas.map((linea) => ({
            productoId: linea.productoId,
            contado: parseInt(linea.contadoTexto, 10),
          })),
        },
        dispositivoId
      );
      Alert.alert('Conteo registrado', 'El cierre quedó guardado correctamente.', [
        { text: 'OK', onPress: () => router.back() },
      ]);
    } finally {
      setGuardando(false);
    }
  }

  return (
    <View style={styles.contenedor}>
      <View style={styles.encabezado}>
        <Pressable onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Volver">
          <Text style={styles.volver}>‹ Volver</Text>
        </Pressable>
        <Text style={styles.titulo}>Conteo de cierre</Text>
        <Text style={styles.subtitulo}>
          Cuenta físicamente lo que te queda de cada producto.
        </Text>
      </View>

      {cargando ? (
        <View style={styles.centrado}>
          <ActivityIndicator size="large" color={COLORES.primario} />
        </View>
      ) : lineas.length === 0 ? (
        <View style={styles.centrado}>
          <Text style={styles.vacio}>No tienes productos asignados para contar.</Text>
        </View>
      ) : (
        <FlatList
          data={lineas}
          keyExtractor={(item) => item.productoId}
          contentContainerStyle={styles.lista}
          renderItem={({ item }) => {
            const contado = item.contadoTexto === '' ? null : parseInt(item.contadoTexto, 10);
            const diferencia = contado === null ? null : contado - item.teorico;
            return (
              <View style={styles.fila}>
                <View style={styles.filaTexto}>
                  <Text style={styles.filaNombre} numberOfLines={2}>
                    {item.productoNombre}
                  </Text>
                  <Text style={styles.filaTeorico}>Teórico: {item.teorico}</Text>
                  {diferencia !== null && diferencia !== 0 && (
                    <Text
                      style={[
                        styles.filaDiferencia,
                        diferencia > 0 ? styles.diferenciaPositiva : styles.diferenciaNegativa,
                      ]}
                    >
                      {diferencia > 0 ? `Sobran ${diferencia}` : `Faltan ${Math.abs(diferencia)}`}
                    </Text>
                  )}
                </View>
                <TextInput
                  style={styles.input}
                  placeholder="0"
                  placeholderTextColor={COLORES.textoSecundario}
                  value={item.contadoTexto}
                  onChangeText={(texto) => cambiarContado(item.productoId, texto)}
                  keyboardType="number-pad"
                />
              </View>
            );
          }}
        />
      )}

      {lineas.length > 0 && (
        <View style={styles.pie}>
          {conDiferencia > 0 && (
            <Text style={styles.avisoDescuadre}>
              {conDiferencia} producto{conDiferencia === 1 ? '' : 's'} con descuadre
            </Text>
          )}
          <Pressable
            style={[
              styles.botonConfirmar,
              (guardando || faltanPorContar) && styles.botonDeshabilitado,
            ]}
            disabled={guardando || faltanPorContar}
            onPress={confirmar}
            accessibilityRole="button"
            accessibilityLabel="Confirmar cierre"
          >
            {guardando ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.botonConfirmarTexto}>Confirmar cierre</Text>
            )}
          </Pressable>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  contenedor: {
    flex: 1,
    backgroundColor: COLORES.fondo,
  },
  encabezado: {
    backgroundColor: COLORES.primario,
    paddingTop: 64,
    paddingHorizontal: 20,
    paddingBottom: 16,
    gap: 4,
  },
  volver: {
    fontSize: 14,
    fontFamily: TIPOGRAFIA_PROMOTOR.negrita,
    color: COLORES.textoSobreOscuro,
    marginBottom: 6,
  },
  titulo: {
    fontSize: 20,
    fontFamily: TIPOGRAFIA_PROMOTOR.negrita,
    color: COLORES.textoSobreOscuro,
  },
  subtitulo: {
    fontSize: 13,
    fontFamily: TIPOGRAFIA_PROMOTOR.regular,
    color: COLORES.textoSobreOscuro,
  },
  centrado: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  vacio: {
    fontSize: 14,
    fontFamily: TIPOGRAFIA_PROMOTOR.regular,
    color: COLORES.textoSecundario,
    textAlign: 'center',
  },
  lista: {
    padding: 20,
    gap: 10,
  },
  fila: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: COLORES.superficie,
    borderRadius: 14,
    padding: 14,
    gap: 12,
  },
  filaTexto: {
    flex: 1,
    gap: 2,
  },
  filaNombre: {
    fontSize: 14,
    fontFamily: TIPOGRAFIA_PROMOTOR.semiNegrita,
    color: COLORES.textoSobreOscuro,
  },
  filaTeorico: {
    fontSize: 12,
    fontFamily: TIPOGRAFIA_PROMOTOR.monoSemiNegrita,
    color: COLORES.textoSecundario,
  },
  filaDiferencia: {
    fontSize: 12,
    fontFamily: TIPOGRAFIA_PROMOTOR.monoSemiNegrita,
  },
  diferenciaPositiva: {
    color: COLORES.positivo,
  },
  diferenciaNegativa: {
    color: COLORES.error,
  },
  input: {
    width: 64,
    borderWidth: 1,
    borderColor: COLORES.borde,
    borderRadius: 10,
    paddingVertical: 10,
    fontSize: 18,
    fontFamily: TIPOGRAFIA_PROMOTOR.monoSemiNegrita,
    color: COLORES.textoSobreOscuro,
    textAlign: 'center',
  },
  pie: {
    padding: 20,
    gap: 10,
  },
  avisoDescuadre: {
    fontSize: 13,
    fontFamily: TIPOGRAFIA_PROMOTOR.semiNegrita,
    color: COLORES.error,
    textAlign: 'center',
  },
  botonConfirmar: {
    backgroundColor: COLORES.oscuro,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  botonDeshabilitado: {
    opacity: 0.5,
  },
  botonConfirmarTexto: {
    color: '#FFF',
    fontSize: 15,
    fontFamily: TIPOGRAFIA_PROMOTOR.negrita,
  },
});
