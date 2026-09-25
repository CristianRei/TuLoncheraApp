import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { COLORES_ADMIN, TIPOGRAFIA_ADMIN } from './tema';

export interface OpcionDesplegable {
  valor: string;
  etiqueta: string;
}

interface PropsBase {
  opciones: OpcionDesplegable[];
  placeholder: string;
  /** Texto cuando no hay ninguna opción (ej. "Esta empresa no tiene puntos todavía."). */
  vacio?: string;
  deshabilitado?: boolean;
}

type Props = PropsBase &
  (
    | { multiple?: false; valor: string | null; onCambiar: (valor: string) => void }
    | { multiple: true; valores: string[]; onCambiar: (valores: string[]) => void }
  );

/** Con más opciones que esto, el desplegable trae buscador. */
const MINIMO_PARA_BUSCAR = 6;

function normalizar(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
}

/**
 * Menú desplegable de admin: un campo que al tocarlo despliega la lista
 * debajo (no otro Modal — dentro de un Modal, dos Modal apilados cuelgan los
 * toques en Android). Con muchas opciones trae buscador, sin distinguir
 * tildes ni mayúsculas. `multiple` permite marcar varias (con "Listo").
 */
export function SelectorDesplegable(props: Props) {
  const { opciones, placeholder, vacio, deshabilitado } = props;
  const [abierto, setAbierto] = useState(false);
  const [busqueda, setBusqueda] = useState('');

  const seleccionados = props.multiple ? props.valores : props.valor ? [props.valor] : [];
  const etiquetas = opciones.filter((o) => seleccionados.includes(o.valor)).map((o) => o.etiqueta);
  const sinOpciones = opciones.length === 0;
  const texto = sinOpciones && vacio ? vacio : etiquetas.length > 0 ? etiquetas.join(', ') : placeholder;
  const termino = normalizar(busqueda);
  const filtradas = termino ? opciones.filter((o) => normalizar(o.etiqueta).includes(termino)) : opciones;

  function cerrar() {
    setAbierto(false);
    setBusqueda('');
  }

  function elegir(valor: string) {
    if (props.multiple) {
      props.onCambiar(
        props.valores.includes(valor) ? props.valores.filter((v) => v !== valor) : [...props.valores, valor]
      );
    } else {
      props.onCambiar(valor);
      cerrar();
    }
  }

  return (
    <View>
      <Pressable
        style={[styles.campo, abierto && styles.campoAbierto, (deshabilitado || sinOpciones) && styles.campoDeshabilitado]}
        onPress={() => (abierto ? cerrar() : setAbierto(true))}
        disabled={deshabilitado || sinOpciones}
        accessibilityRole="button"
        accessibilityState={{ expanded: abierto }}
      >
        <Text style={[styles.campoTexto, etiquetas.length === 0 && styles.campoPlaceholder]} numberOfLines={1}>
          {texto}
        </Text>
        {!sinOpciones && (
          <Ionicons name={abierto ? 'chevron-up' : 'chevron-down'} size={18} color={COLORES_ADMIN.textoSecundario} />
        )}
      </Pressable>

      {abierto && (
        <View style={styles.lista}>
          {opciones.length > MINIMO_PARA_BUSCAR && (
            <TextInput
              style={styles.buscador}
              placeholder="Buscar..."
              placeholderTextColor={COLORES_ADMIN.textoSecundario}
              value={busqueda}
              onChangeText={setBusqueda}
              autoFocus
            />
          )}
          <ScrollView style={styles.scroll} nestedScrollEnabled keyboardShouldPersistTaps="handled">
            {filtradas.length === 0 ? (
              <Text style={styles.sinResultados}>Ningún resultado para “{busqueda.trim()}”.</Text>
            ) : (
              filtradas.map((opcion) => {
                const marcada = seleccionados.includes(opcion.valor);
                return (
                  <Pressable
                    key={opcion.valor}
                    style={[styles.opcion, marcada && styles.opcionMarcada]}
                    onPress={() => elegir(opcion.valor)}
                    accessibilityRole={props.multiple ? 'checkbox' : 'radio'}
                    accessibilityState={{ checked: marcada }}
                  >
                    {props.multiple ? (
                      <View style={[styles.checkbox, marcada && styles.checkboxMarcado]}>
                        {marcada && <Ionicons name="checkmark" size={12} color="#FFFFFF" />}
                      </View>
                    ) : (
                      <Ionicons
                        name={marcada ? 'radio-button-on' : 'radio-button-off'}
                        size={18}
                        color={marcada ? COLORES_ADMIN.vino : COLORES_ADMIN.bordeSuave}
                      />
                    )}
                    <Text style={[styles.opcionTexto, marcada && styles.opcionTextoMarcada]}>{opcion.etiqueta}</Text>
                  </Pressable>
                );
              })
            )}
          </ScrollView>
          {props.multiple && (
            <Pressable style={styles.listo} onPress={cerrar} accessibilityRole="button">
              <Text style={styles.listoTexto}>Listo</Text>
            </Pressable>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  campo: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    borderWidth: 1,
    borderColor: COLORES_ADMIN.bordeSuave,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 11,
    backgroundColor: COLORES_ADMIN.superficieMasBaja,
  },
  campoAbierto: {
    borderColor: COLORES_ADMIN.vino,
  },
  campoDeshabilitado: {
    opacity: 0.6,
  },
  campoTexto: {
    flex: 1,
    fontSize: 14,
    fontFamily: TIPOGRAFIA_ADMIN.semiNegrita,
    color: COLORES_ADMIN.texto,
  },
  campoPlaceholder: {
    fontFamily: TIPOGRAFIA_ADMIN.regular,
    color: COLORES_ADMIN.textoSecundario,
  },
  lista: {
    marginTop: 4,
    borderWidth: 1,
    borderColor: COLORES_ADMIN.bordeSuave,
    borderRadius: 10,
    backgroundColor: COLORES_ADMIN.superficieMasBaja,
    padding: 6,
    gap: 6,
  },
  buscador: {
    borderWidth: 1,
    borderColor: COLORES_ADMIN.bordeSuave,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 14,
    fontFamily: TIPOGRAFIA_ADMIN.regular,
    color: COLORES_ADMIN.texto,
  },
  scroll: {
    maxHeight: 220,
  },
  sinResultados: {
    fontSize: 13,
    fontFamily: TIPOGRAFIA_ADMIN.regular,
    color: COLORES_ADMIN.textoSecundario,
    padding: 8,
  },
  opcion: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 8,
    paddingVertical: 9,
    borderRadius: 8,
  },
  opcionMarcada: {
    backgroundColor: COLORES_ADMIN.superficieBaja,
  },
  opcionTexto: {
    flex: 1,
    fontSize: 14,
    fontFamily: TIPOGRAFIA_ADMIN.medio,
    color: COLORES_ADMIN.texto,
  },
  opcionTextoMarcada: {
    fontFamily: TIPOGRAFIA_ADMIN.semiNegrita,
    color: COLORES_ADMIN.vino,
  },
  checkbox: {
    width: 18,
    height: 18,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: COLORES_ADMIN.bordeSuave,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxMarcado: {
    backgroundColor: COLORES_ADMIN.vino,
    borderColor: COLORES_ADMIN.vino,
  },
  listo: {
    alignSelf: 'flex-end',
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 8,
    backgroundColor: COLORES_ADMIN.vino,
  },
  listoTexto: {
    fontSize: 13,
    fontFamily: TIPOGRAFIA_ADMIN.semiNegrita,
    color: '#FFFFFF',
  },
});
