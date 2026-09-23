import * as ImagePicker from 'expo-image-picker';
import { type ReactNode, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { formatearPesos, parsearPesos } from '@/core/dinero';
import type { Categoria, Pesos } from '@/core/tipos';
import { getDb } from '@/db/client';
import { crearCategoria, listarCategorias } from '@/db/categorias';
import { getDispositivoId } from '@/db/dispositivo';
import { listarMarcasDistintas } from '@/db/productos';

import { EscanerCodigoBarras } from './EscanerCodigoBarras';

export interface ValoresProducto {
  nombre: string;
  precio: Pesos;
  fotoUri: string | null;
  codigoBarras: string | null;
  marca: string | null;
  categoriaId: string | null;
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
  const [marca, setMarca] = useState(valorInicial.marca ?? '');
  const [marcasSugeridas, setMarcasSugeridas] = useState<string[]>([]);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [categoriaId, setCategoriaId] = useState(valorInicial.categoriaId);
  const [modalCategoriaVisible, setModalCategoriaVisible] = useState(false);
  const [nombreCategoriaNueva, setNombreCategoriaNueva] = useState('');
  const [creandoCategoria, setCreandoCategoria] = useState(false);

  useEffect(() => {
    (async () => {
      const db = await getDb();
      const [listaCategorias, listaMarcas] = await Promise.all([
        listarCategorias(db),
        listarMarcasDistintas(db),
      ]);
      setCategorias(listaCategorias);
      setMarcasSugeridas(listaMarcas);
    })();
  }, []);

  async function confirmarCategoriaNueva() {
    if (nombreCategoriaNueva.trim().length === 0) return;
    setCreandoCategoria(true);
    try {
      const db = await getDb();
      const dispositivoId = await getDispositivoId(db);
      // Sin usuarioId: este formulario no recibe la sesión de admin como
      // prop, así que esta creación puntual queda sin auditar — el flujo
      // dedicado de app/admin/catalogo/categorias.tsx sí la audita.
      const categoria = await crearCategoria(db, nombreCategoriaNueva.trim(), dispositivoId);
      setCategorias((actual) =>
        actual.some((c) => c.id === categoria.id) ? actual : [...actual, categoria].sort((a, b) => a.nombre.localeCompare(b.nombre))
      );
      setCategoriaId(categoria.id);
      setNombreCategoriaNueva('');
      setModalCategoriaVisible(false);
    } finally {
      setCreandoCategoria(false);
    }
  }

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

      <View style={styles.campo}>
        <Text style={styles.etiqueta}>Categoría</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <Pressable
            style={[styles.chip, categoriaId === null && { backgroundColor: colorAcento, borderColor: colorAcento }]}
            onPress={() => setCategoriaId(null)}
          >
            <Text style={[styles.chipTexto, categoriaId === null && styles.chipTextoActivo]}>
              Sin categoría
            </Text>
          </Pressable>
          {categorias.map((c) => (
            <Pressable
              key={c.id}
              style={[styles.chip, categoriaId === c.id && { backgroundColor: colorAcento, borderColor: colorAcento }]}
              onPress={() => setCategoriaId(c.id)}
            >
              <Text style={[styles.chipTexto, categoriaId === c.id && styles.chipTextoActivo]}>
                {c.nombre}
              </Text>
            </Pressable>
          ))}
          <Pressable
            style={[styles.chip, { borderColor: colorAcento, borderStyle: 'dashed' }]}
            onPress={() => setModalCategoriaVisible(true)}
          >
            <Text style={[styles.chipTexto, { color: colorAcento }]}>+ Nueva</Text>
          </Pressable>
        </ScrollView>
      </View>

      <View style={styles.campo}>
        <Text style={styles.etiqueta}>Marca</Text>
        <TextInput
          style={styles.input}
          value={marca}
          onChangeText={setMarca}
          placeholder="Ej. Ramo"
          placeholderTextColor="#999"
        />
        {marcasSugeridas.length > 0 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.sugerenciasFila}>
            {marcasSugeridas.map((m) => (
              <Pressable key={m} style={styles.chip} onPress={() => setMarca(m)}>
                <Text style={styles.chipTexto}>{m}</Text>
              </Pressable>
            ))}
          </ScrollView>
        )}
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
            marca: marca.trim() || null,
            categoriaId,
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

      <Modal visible={modalCategoriaVisible} animationType="fade" transparent>
        <View style={styles.fondoModal}>
          <View style={styles.tarjetaModal}>
            <Text style={styles.modalTitulo}>Nueva categoría</Text>
            <TextInput
              style={styles.input}
              placeholder="Ej. Galletas"
              placeholderTextColor="#999"
              value={nombreCategoriaNueva}
              onChangeText={setNombreCategoriaNueva}
              editable={!creandoCategoria}
              autoFocus
            />
            <View style={styles.modalAcciones}>
              <Pressable
                onPress={() => {
                  setModalCategoriaVisible(false);
                  setNombreCategoriaNueva('');
                }}
                disabled={creandoCategoria}
              >
                <Text style={styles.modalCancelar}>Cancelar</Text>
              </Pressable>
              <Pressable
                style={[
                  styles.botonModalConfirmar,
                  { backgroundColor: colorAcento },
                  (nombreCategoriaNueva.trim().length === 0 || creandoCategoria) && styles.botonDeshabilitado,
                ]}
                disabled={nombreCategoriaNueva.trim().length === 0 || creandoCategoria}
                onPress={confirmarCategoriaNueva}
              >
                {creandoCategoria ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.botonGuardarTexto}>Crear</Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
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
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 16,
    backgroundColor: '#FFF',
    borderWidth: 1,
    borderColor: '#DDD',
    marginRight: 8,
  },
  chipTexto: {
    fontSize: 12.5,
    fontWeight: '600',
    color: '#666',
  },
  chipTextoActivo: {
    color: '#FFF',
  },
  sugerenciasFila: {
    marginTop: 8,
  },
  fondoModal: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  tarjetaModal: {
    width: '100%',
    maxWidth: 340,
    backgroundColor: '#FFF',
    borderRadius: 18,
    padding: 22,
    gap: 14,
  },
  modalTitulo: {
    fontSize: 16,
    fontWeight: '700',
    color: '#333',
  },
  modalAcciones: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: 20,
  },
  modalCancelar: {
    fontSize: 14,
    color: '#888',
  },
  botonModalConfirmar: {
    borderRadius: 10,
    paddingHorizontal: 20,
    paddingVertical: 10,
    minWidth: 90,
    alignItems: 'center',
  },
});
