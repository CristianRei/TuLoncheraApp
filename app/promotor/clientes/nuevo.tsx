import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { getDb } from '@/db/client';
import { crearCliente } from '@/db/clientes';
import { getDispositivoId } from '@/db/dispositivo';
import { COLORES, TIPOGRAFIA_PROMOTOR } from '@/ui/colores';
import { useRequiereSesion } from '@/ui/useRequiereSesion';

interface CampoProps {
  etiqueta: string;
  value: string;
  onChangeText: (texto: string) => void;
  placeholder?: string;
  keyboardType?: 'default' | 'phone-pad';
  multiline?: boolean;
  editable?: boolean;
}

function Campo({ etiqueta, value, onChangeText, placeholder, keyboardType, multiline, editable }: CampoProps) {
  return (
    <View style={styles.campo}>
      <Text style={styles.campoEtiqueta}>{etiqueta}</Text>
      <TextInput
        style={[styles.input, multiline && styles.inputMultilinea]}
        placeholder={placeholder}
        placeholderTextColor={COLORES.textoSecundario}
        value={value}
        onChangeText={onChangeText}
        keyboardType={keyboardType}
        multiline={multiline}
        numberOfLines={multiline ? 3 : 1}
        editable={editable}
      />
    </View>
  );
}

export default function NuevoClientePromotor() {
  const usuario = useRequiereSesion(['PROMOTOR']);

  const [nombreCompleto, setNombreCompleto] = useState('');
  const [telefono, setTelefono] = useState('');
  const [direccion, setDireccion] = useState('');
  const [ciudad, setCiudad] = useState('');
  const [empresa, setEmpresa] = useState('');
  const [nota, setNota] = useState('');
  const [guardando, setGuardando] = useState(false);

  if (!usuario) return null;

  const nombreValido = nombreCompleto.trim().length > 0;

  async function guardar() {
    if (!nombreValido || !usuario) return;
    setGuardando(true);
    try {
      const db = await getDb();
      const dispositivoId = await getDispositivoId(db);
      await crearCliente(
        db,
        {
          nombreCompleto: nombreCompleto.trim(),
          telefono: telefono.trim() || null,
          direccion: direccion.trim() || null,
          ciudad: ciudad.trim() || null,
          empresa: empresa.trim() || null,
          nota: nota.trim() || null,
        },
        usuario.id,
        dispositivoId
      );
      router.back();
    } finally {
      setGuardando(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.contenedor}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.encabezado}>
        <Pressable
          onPress={() => router.back()}
          style={styles.botonIcono}
          accessibilityRole="button"
          accessibilityLabel="Cancelar"
          disabled={guardando}
        >
          <Ionicons name="close" size={24} color={COLORES.textoSobreOscuro} />
        </Pressable>
        <Text style={styles.titulo}>Nuevo cliente</Text>
        <View style={styles.botonIcono} />
      </View>

      <ScrollView contentContainerStyle={styles.formulario} keyboardShouldPersistTaps="handled">
        <Campo
          etiqueta="Nombre completo *"
          value={nombreCompleto}
          onChangeText={setNombreCompleto}
          placeholder="Ej. Laura Gómez"
          editable={!guardando}
        />
        <Campo
          etiqueta="Teléfono"
          value={telefono}
          onChangeText={setTelefono}
          placeholder="Ej. 300 123 4567"
          keyboardType="phone-pad"
          editable={!guardando}
        />
        <Campo
          etiqueta="Dirección"
          value={direccion}
          onChangeText={setDireccion}
          placeholder="Ej. Calle 10 # 5-23"
          editable={!guardando}
        />
        <Campo etiqueta="Ciudad" value={ciudad} onChangeText={setCiudad} placeholder="Ej. Bogotá" editable={!guardando} />
        <Campo
          etiqueta="Empresa donde trabaja"
          value={empresa}
          onChangeText={setEmpresa}
          placeholder="Ej. Falabella"
          editable={!guardando}
        />
        <Campo
          etiqueta="Nota"
          value={nota}
          onChangeText={setNota}
          placeholder="Cualquier detalle adicional..."
          multiline
          editable={!guardando}
        />

        <Pressable
          style={[styles.botonGuardar, (!nombreValido || guardando) && styles.botonDeshabilitado]}
          onPress={guardar}
          disabled={!nombreValido || guardando}
        >
          {guardando ? <ActivityIndicator color="#FFF" /> : <Text style={styles.botonGuardarTexto}>Guardar cliente</Text>}
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
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
    paddingHorizontal: 12,
    paddingBottom: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  botonIcono: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  titulo: {
    fontSize: 17,
    fontFamily: TIPOGRAFIA_PROMOTOR.negrita,
    color: COLORES.textoSobreOscuro,
  },
  formulario: {
    padding: 20,
    gap: 16,
    paddingBottom: 48,
  },
  campo: {
    gap: 6,
  },
  campoEtiqueta: {
    fontSize: 12,
    fontFamily: TIPOGRAFIA_PROMOTOR.semiNegrita,
    color: COLORES.textoSecundario,
  },
  input: {
    backgroundColor: COLORES.superficie,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    fontFamily: TIPOGRAFIA_PROMOTOR.regular,
    color: COLORES.textoSobreOscuro,
    borderWidth: 1,
    borderColor: COLORES.borde,
  },
  inputMultilinea: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  botonGuardar: {
    backgroundColor: COLORES.oscuro,
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: 'center',
    marginTop: 6,
  },
  botonDeshabilitado: {
    opacity: 0.5,
  },
  botonGuardarTexto: {
    color: '#FFF',
    fontSize: 15,
    fontFamily: TIPOGRAFIA_PROMOTOR.negrita,
  },
});
