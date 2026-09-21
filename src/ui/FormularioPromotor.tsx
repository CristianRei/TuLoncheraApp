import { type ReactNode, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { pinDesdeCedula } from '@/db/promotores';

export interface ValoresPromotor {
  nombre: string;
  cedula: string;
  celular: string | null;
  direccion: string | null;
}

interface Props {
  valorInicial: ValoresPromotor;
  /** Solo en modo edición — el PIN que tiene hoy, antes de cualquier cambio de cédula. */
  pinVigente?: string | null;
  colorAcento: string;
  guardando: boolean;
  /**
   * Distinto de null cuando el padre intentó guardar y `crearPromotor`/
   * `actualizarPromotor` lanzó PinDuplicadoError — revela el campo de PIN
   * manual para que el admin resuelva el choque sin perder lo ya escrito.
   */
  errorPin: string | null;
  onGuardar: (valores: ValoresPromotor, pinManual: string | null) => void;
  textoBoton?: string;
  extra?: ReactNode;
}

export function FormularioPromotor({
  valorInicial,
  pinVigente,
  colorAcento,
  guardando,
  errorPin,
  onGuardar,
  textoBoton = 'Guardar',
  extra,
}: Props) {
  const [nombre, setNombre] = useState(valorInicial.nombre);
  const [cedula, setCedula] = useState(valorInicial.cedula);
  const [celular, setCelular] = useState(valorInicial.celular ?? '');
  const [direccion, setDireccion] = useState(valorInicial.direccion ?? '');
  const [pinManual, setPinManual] = useState('');

  const pinCalculado = pinDesdeCedula(cedula);
  const cedulaValida = pinCalculado.length === 4;
  const cambioCedula = cedula.trim() !== valorInicial.cedula.trim();
  const necesitaPinManual = errorPin !== null;
  const puedeGuardar =
    nombre.trim().length > 0 &&
    cedulaValida &&
    !guardando &&
    (!necesitaPinManual || pinDesdeCedula(pinManual).length === 4 || pinManual.trim().length === 4);

  function guardar() {
    onGuardar(
      {
        nombre: nombre.trim(),
        cedula: cedula.trim(),
        celular: celular.trim() || null,
        direccion: direccion.trim() || null,
      },
      necesitaPinManual ? pinManual.trim() : null
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.contenedor}>
      <View style={styles.campo}>
        <Text style={styles.etiqueta}>Nombre completo</Text>
        <TextInput
          style={styles.input}
          value={nombre}
          onChangeText={setNombre}
          placeholder="Ej. Laura Gómez"
          placeholderTextColor="#999"
          editable={!guardando}
        />
      </View>

      <View style={styles.campo}>
        <Text style={styles.etiqueta}>Cédula</Text>
        <TextInput
          style={styles.input}
          value={cedula}
          onChangeText={setCedula}
          placeholder="Ej. 1020304050"
          placeholderTextColor="#999"
          keyboardType="number-pad"
          editable={!guardando}
        />
        {pinVigente && !cambioCedula ? (
          <Text style={styles.pinAviso}>PIN actual: {pinVigente}</Text>
        ) : cedulaValida ? (
          <Text style={styles.pinAviso}>
            {pinVigente ? 'El PIN va a cambiar a: ' : 'PIN que le va a quedar: '}
            <Text style={styles.pinValor}>{pinCalculado}</Text>
          </Text>
        ) : (
          <Text style={styles.pinAvisoTenue}>Escribe la cédula completa para ver el PIN.</Text>
        )}
      </View>

      {necesitaPinManual && (
        <View style={styles.campo}>
          <Text style={styles.etiquetaError}>
            El PIN {errorPin} ya lo tiene otra persona. Escribe uno distinto (4 dígitos) para este promotor:
          </Text>
          <TextInput
            style={[styles.input, styles.inputError]}
            value={pinManual}
            onChangeText={setPinManual}
            placeholder="Nuevo PIN (4 dígitos)"
            placeholderTextColor="#999"
            keyboardType="number-pad"
            maxLength={4}
            editable={!guardando}
          />
        </View>
      )}

      <View style={styles.campo}>
        <Text style={styles.etiqueta}>Celular</Text>
        <TextInput
          style={styles.input}
          value={celular}
          onChangeText={setCelular}
          placeholder="Ej. 300 123 4567"
          placeholderTextColor="#999"
          keyboardType="phone-pad"
          editable={!guardando}
        />
      </View>

      <View style={styles.campo}>
        <Text style={styles.etiqueta}>Dirección</Text>
        <TextInput
          style={styles.input}
          value={direccion}
          onChangeText={setDireccion}
          placeholder="Ej. Calle 10 # 5-23"
          placeholderTextColor="#999"
          editable={!guardando}
        />
      </View>

      <Pressable
        style={[styles.botonGuardar, { backgroundColor: colorAcento }, !puedeGuardar && styles.botonDeshabilitado]}
        disabled={!puedeGuardar}
        onPress={guardar}
      >
        {guardando ? <ActivityIndicator color="#fff" /> : <Text style={styles.botonGuardarTexto}>{textoBoton}</Text>}
      </Pressable>

      {extra}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  contenedor: {
    padding: 20,
    gap: 18,
    paddingBottom: 48,
  },
  campo: {
    gap: 6,
  },
  etiqueta: {
    fontSize: 13,
    fontWeight: '600',
    color: '#555',
  },
  etiquetaError: {
    fontSize: 13,
    fontWeight: '600',
    color: '#B00020',
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
  inputError: {
    borderColor: '#B00020',
  },
  pinAviso: {
    fontSize: 12.5,
    color: '#666',
  },
  pinValor: {
    fontWeight: '700',
    color: '#333',
  },
  pinAvisoTenue: {
    fontSize: 12,
    color: '#AAA',
    fontStyle: 'italic',
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
