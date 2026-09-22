import { type ReactNode, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { modoPinParaRol, pinDesdeCedula, pinManualValido } from '@/core/pin';
import type { Rol } from '@/core/tipos';

export interface ValoresPersona {
  nombre: string;
  cedula: string;
  celular: string | null;
  direccion: string | null;
}

interface Props {
  /** Determina el modo de PIN a mostrar (src/core/pin.ts) — fijo, no se elige aquí. */
  rol: Rol;
  valorInicial: ValoresPersona;
  /** Solo en modo edición — el PIN que tiene hoy, antes de cualquier cambio. */
  pinVigente?: string | null;
  colorAcento: string;
  guardando: boolean;
  /**
   * Distinto de null cuando el padre intentó guardar y `crearPersona`/
   * `actualizarPersona` lanzó PinDuplicadoError — revela el campo de PIN
   * manual (roles DESDE_CEDULA) para que el admin resuelva el choque sin
   * perder lo ya escrito. Para ADMIN el campo de PIN ya está siempre
   * visible, así que este error solo cambia el mensaje mostrado.
   */
  errorPin: string | null;
  onGuardar: (valores: ValoresPersona, pinManual: string | null) => void;
  textoBoton?: string;
  extra?: ReactNode;
}

export function FormularioPersona({
  rol,
  valorInicial,
  pinVigente,
  colorAcento,
  guardando,
  errorPin,
  onGuardar,
  textoBoton = 'Guardar',
  extra,
}: Props) {
  const modo = modoPinParaRol(rol);
  const [nombre, setNombre] = useState(valorInicial.nombre);
  const [cedula, setCedula] = useState(valorInicial.cedula);
  const [celular, setCelular] = useState(valorInicial.celular ?? '');
  const [direccion, setDireccion] = useState(valorInicial.direccion ?? '');
  const [pinManual, setPinManual] = useState('');

  const pinCalculado = pinDesdeCedula(cedula);
  const cedulaValida = pinCalculado.length === 4;
  const cambioCedula = cedula.trim() !== valorInicial.cedula.trim();
  const necesitaPinManualColision = modo === 'DESDE_CEDULA' && errorPin !== null;

  const puedeGuardar =
    nombre.trim().length > 0 &&
    !guardando &&
    (modo === 'DESDE_CEDULA'
      ? cedulaValida &&
        (!necesitaPinManualColision || pinDesdeCedula(pinManual).length === 4 || pinManual.trim().length === 4)
      : pinManualValido(pinManual) || (pinVigente !== undefined && pinVigente !== null && pinManual.trim() === ''));

  function guardar() {
    const pinAEnviar =
      modo === 'MANUAL_6_DIGITOS'
        ? pinManual.trim() || null
        : necesitaPinManualColision
          ? pinManual.trim()
          : null;
    onGuardar(
      {
        nombre: nombre.trim(),
        cedula: cedula.trim(),
        celular: celular.trim() || null,
        direccion: direccion.trim() || null,
      },
      pinAEnviar
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
        <Text style={styles.etiqueta}>Cédula{modo === 'MANUAL_6_DIGITOS' ? ' (opcional)' : ''}</Text>
        <TextInput
          style={styles.input}
          value={cedula}
          onChangeText={setCedula}
          placeholder="Ej. 1020304050"
          placeholderTextColor="#999"
          keyboardType="number-pad"
          editable={!guardando}
        />
        {modo === 'DESDE_CEDULA' &&
          (pinVigente && !cambioCedula ? (
            <Text style={styles.pinAviso}>PIN actual: {pinVigente}</Text>
          ) : cedulaValida ? (
            <Text style={styles.pinAviso}>
              {pinVigente ? 'El PIN va a cambiar a: ' : 'PIN que le va a quedar: '}
              <Text style={styles.pinValor}>{pinCalculado}</Text>
            </Text>
          ) : (
            <Text style={styles.pinAvisoTenue}>Escribe la cédula completa para ver el PIN.</Text>
          ))}
      </View>

      {modo === 'DESDE_CEDULA' && necesitaPinManualColision && (
        <View style={styles.campo}>
          <Text style={styles.etiquetaError}>
            El PIN {errorPin} ya lo tiene otra persona. Escribe uno distinto (4 dígitos) para esta persona:
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

      {modo === 'MANUAL_6_DIGITOS' && (
        <View style={styles.campo}>
          <Text style={styles.etiqueta}>PIN de acceso (6 dígitos)</Text>
          <TextInput
            style={[styles.input, errorPin && styles.inputError]}
            value={pinManual}
            onChangeText={setPinManual}
            placeholder={pinVigente ? `PIN actual: ${pinVigente} (deja vacío para no cambiarlo)` : 'Ej. 482913'}
            placeholderTextColor="#999"
            keyboardType="number-pad"
            maxLength={6}
            editable={!guardando}
          />
          {errorPin && (
            <Text style={styles.etiquetaError}>El PIN {errorPin} ya lo tiene otra persona. Elige otro.</Text>
          )}
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
