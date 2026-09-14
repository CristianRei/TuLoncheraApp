import * as ImagePicker from 'expo-image-picker';
import { type ReactNode, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { formatearPesos, parsearPesos } from '@/core/dinero';
import type { Pesos } from '@/core/tipos';

import { EscanerCodigoBarras } from './EscanerCodigoBarras';

export interface ValoresProducto {
  nombre: string;
  precio: Pesos;
  fotoUri: string | null;
  codigoBarras: string | null;
}

interface Props {
  valorInicial: ValoresProducto;
  colorAcento: string;
  guardando: boolean;
  onGuardar: (valores: ValoresProducto) => void;
  onGuardarFoto: (uriOrigen: string) => Promise<string>;
  textoBoton?: string;
  extra?: ReactNode;
}

export function FormularioProducto({
  valorInicial,
  colorAcento,
  guardando,
  onGuardar,
  onGuardarFoto,
  textoBoton = 'Guardar',
  extra,
}: Props) {
  const [nombre, setNombre] = useState(valorInicial.nombre);
  const [precioTexto, setPrecioTexto] = useState(
    valorInicial.precio > 0 ? formatearPesos(valorInicial.precio) : ''
  );
  const [fotoUri, setFotoUri] = useState(valorInicial.fotoUri);
  const [procesandoFoto, setProcesandoFoto] = useState(false);
  const [codigoBarras, setCodigoBarras] = useState(valorInicial.codigoBarras ?? '');
  const [escaneando, setEscaneando] = useState(false);

  const precio = parsearPesos(precioTexto);
  const puedeGuardar = nombre.trim().length > 0 && !guardando && !procesandoFoto;

  async function elegirFoto(desdeCamara: boolean) {
    const permiso = desdeCamara
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permiso.granted) return;

    const resultado = desdeCamara
      ? await ImagePicker.launchCameraAsync({ mediaTypes: 'images', quality: 0.7 })
      : await ImagePicker.launchImageLibraryAsync({ mediaTypes: 'images', quality: 0.7 });

    if (resultado.canceled || !resultado.assets[0]) return;

    setProcesandoFoto(true);
    try {
      const uriGuardado = await onGuardarFoto(resultado.assets[0].uri);
      setFotoUri(uriGuardado);
    } finally {
      setProcesandoFoto(false);
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.contenedor}>
      <Pressable style={styles.foto} onPress={() => elegirFoto(false)}>
        {fotoUri ? (
          <Image source={{ uri: fotoUri }} style={styles.fotoImagen} />
        ) : (
          <Text style={styles.fotoPlaceholder}>Sin foto</Text>
        )}
        {procesandoFoto && (
          <View style={styles.fotoCargando}>
            <ActivityIndicator color="#fff" />
          </View>
        )}
      </Pressable>

      <View style={styles.accionesFoto}>
        <Pressable
          style={[styles.botonFoto, { borderColor: colorAcento }]}
          onPress={() => elegirFoto(true)}
          disabled={procesandoFoto}
        >
          <Text style={[styles.botonFotoTexto, { color: colorAcento }]}>Tomar foto</Text>
        </Pressable>
        <Pressable
          style={[styles.botonFoto, { borderColor: colorAcento }]}
          onPress={() => elegirFoto(false)}
          disabled={procesandoFoto}
        >
          <Text style={[styles.botonFotoTexto, { color: colorAcento }]}>Elegir de galería</Text>
        </Pressable>
      </View>

      <View style={styles.campo}>
        <Text style={styles.etiqueta}>Nombre</Text>
        <TextInput
          style={styles.input}
          value={nombre}
          onChangeText={setNombre}
          placeholder="Nombre del producto"
          placeholderTextColor="#999"
        />
      </View>

      <View style={styles.campo}>
        <Text style={styles.etiqueta}>Precio</Text>
        <TextInput
          style={styles.input}
          value={precioTexto}
          onChangeText={(texto) => setPrecioTexto(formatearPesos(parsearPesos(texto)))}
          placeholder="$ 0"
          placeholderTextColor="#999"
          keyboardType="number-pad"
        />
      </View>

      <View style={styles.campo}>
        <Text style={styles.etiqueta}>Código de barras</Text>
        <View style={styles.filaCodigoBarras}>
          <TextInput
            style={[styles.input, styles.inputCodigoBarras]}
            value={codigoBarras}
            onChangeText={setCodigoBarras}
            placeholder="Sin código — escanéalo o escríbelo"
            placeholderTextColor="#999"
          />
          <Pressable
            style={[styles.botonEscanear, { borderColor: colorAcento }]}
            onPress={() => setEscaneando(true)}
          >
            <Text style={[styles.botonEscanearTexto, { color: colorAcento }]}>Escanear</Text>
          </Pressable>
        </View>
      </View>

      <Pressable
        style={[
          styles.botonGuardar,
          { backgroundColor: colorAcento },
          !puedeGuardar && styles.botonDeshabilitado,
        ]}
        disabled={!puedeGuardar}
        onPress={() =>
          onGuardar({
            nombre: nombre.trim(),
            precio,
            fotoUri,
            codigoBarras: codigoBarras.trim() || null,
          })
        }
      >
        {guardando ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.botonGuardarTexto}>{textoBoton}</Text>
        )}
      </Pressable>

      {extra}

      <EscanerCodigoBarras
        visible={escaneando}
        colorAcento={colorAcento}
        titulo="Escanear código del producto"
        onCerrar={() => setEscaneando(false)}
        onDetectado={(codigo) => {
          setCodigoBarras(codigo);
          setEscaneando(false);
        }}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  contenedor: {
    padding: 20,
    gap: 18,
    paddingBottom: 48,
  },
  foto: {
    width: '100%',
    aspectRatio: 1.4,
    maxHeight: 220,
    borderRadius: 16,
    backgroundColor: '#F0F0F0',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  fotoImagen: {
    width: '100%',
    height: '100%',
  },
  fotoPlaceholder: {
    color: '#999',
    fontSize: 14,
  },
  fotoCargando: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  accionesFoto: {
    flexDirection: 'row',
    gap: 12,
  },
  botonFoto: {
    flex: 1,
    borderWidth: 1.5,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
  },
  botonFotoTexto: {
    fontSize: 13,
    fontWeight: '600',
  },
  campo: {
    gap: 6,
  },
  etiqueta: {
    fontSize: 13,
    fontWeight: '600',
    color: '#555',
  },
  input: {
    borderWidth: 1,
    borderColor: '#DDD',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    backgroundColor: '#FFF',
  },
  filaCodigoBarras: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'stretch',
  },
  inputCodigoBarras: {
    flex: 1,
  },
  botonEscanear: {
    borderWidth: 1.5,
    borderRadius: 10,
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  botonEscanearTexto: {
    fontSize: 13,
    fontWeight: '600',
  },
  botonGuardar: {
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 8,
  },
  botonDeshabilitado: {
    opacity: 0.5,
  },
  botonGuardarTexto: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '700',
  },
});
