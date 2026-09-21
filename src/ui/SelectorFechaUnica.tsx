import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { aClaveFecha, construirGrilla, NOMBRES_DIA, NOMBRES_MES } from './calendarioGrilla';

interface Props {
  /** "AAAA-MM-DD" o null si no hay selección todavía. */
  valor: string | null;
  onCambiar: (valor: string | null) => void;
  colorAcento: string;
}

const TAMANO_CELDA = 36;

/**
 * Calendario de mes para elegir un solo día — variante de un solo valor de
 * CalendarioRango (comparten la grilla en src/ui/calendarioGrilla.ts). Recibe
 * `colorAcento` en vez de usar tema.ts directamente porque lo comparten
 * pantallas que no tienen el rediseño de admin (Bodega también usa
 * PantallaIngresarPedido, con su propio color de marca).
 */
export function SelectorFechaUnica({ valor, onCambiar, colorAcento }: Props) {
  const hoy = new Date();
  const [mesVisible, setMesVisible] = useState({ anio: hoy.getFullYear(), mes: hoy.getMonth() });

  const semanas = construirGrilla(mesVisible.anio, mesVisible.mes);
  const hoyClave = aClaveFecha(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());

  function irMesAnterior() {
    setMesVisible((actual) => {
      const mes = actual.mes === 0 ? 11 : actual.mes - 1;
      const anio = actual.mes === 0 ? actual.anio - 1 : actual.anio;
      return { anio, mes };
    });
  }

  function irMesSiguiente() {
    setMesVisible((actual) => {
      const mes = actual.mes === 11 ? 0 : actual.mes + 1;
      const anio = actual.mes === 11 ? actual.anio + 1 : actual.anio;
      return { anio, mes };
    });
  }

  return (
    <View style={styles.contenedor}>
      <View style={styles.encabezado}>
        <Pressable style={styles.navBoton} onPress={irMesAnterior}>
          <Ionicons name="chevron-back" size={18} color={colorAcento} />
        </Pressable>
        <Text style={[styles.mesTexto, { color: colorAcento }]}>
          {NOMBRES_MES[mesVisible.mes]} {mesVisible.anio}
        </Text>
        <Pressable style={styles.navBoton} onPress={irMesSiguiente}>
          <Ionicons name="chevron-forward" size={18} color={colorAcento} />
        </Pressable>
      </View>

      <View style={styles.filaDias}>
        {NOMBRES_DIA.map((nombre) => (
          <Text key={nombre} style={styles.diaEtiqueta}>
            {nombre}
          </Text>
        ))}
      </View>

      {semanas.map((semana, indiceSemana) => (
        <View key={indiceSemana} style={styles.filaDias}>
          {semana.map((dia, indiceDia) => {
            if (dia === null) return <View key={indiceDia} style={styles.celda} />;
            const clave = aClaveFecha(mesVisible.anio, mesVisible.mes, dia);
            const esHoy = clave === hoyClave;
            const seleccionado = clave === valor;

            return (
              <Pressable
                key={indiceDia}
                style={styles.celda}
                onPress={() => onCambiar(seleccionado ? null : clave)}
              >
                <View
                  style={[
                    styles.diaCirculo,
                    seleccionado && { backgroundColor: colorAcento },
                    esHoy && !seleccionado && { borderWidth: 1.5, borderColor: colorAcento },
                  ]}
                >
                  <Text
                    style={[
                      styles.diaTexto,
                      seleccionado && styles.diaTextoSeleccionado,
                      esHoy && !seleccionado && { color: colorAcento, fontWeight: '700' },
                    ]}
                  >
                    {dia}
                  </Text>
                </View>
              </Pressable>
            );
          })}
        </View>
      ))}

      <View style={styles.pie}>
        <Text style={styles.pieTexto}>{valor ?? 'Sin fecha seleccionada'}</Text>
        {valor && (
          <Pressable onPress={() => onCambiar(null)}>
            <Text style={styles.pieLimpiar}>Limpiar</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  contenedor: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#EADFD7',
    padding: 14,
    gap: 8,
    maxWidth: 320,
  },
  encabezado: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  navBoton: {
    width: 30,
    height: 30,
    borderRadius: 8,
    backgroundColor: '#F5EFEB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  mesTexto: {
    fontSize: 14,
    fontWeight: '700',
  },
  filaDias: {
    flexDirection: 'row',
  },
  diaEtiqueta: {
    width: TAMANO_CELDA,
    textAlign: 'center',
    fontSize: 11,
    fontWeight: '700',
    color: '#888',
  },
  celda: {
    width: TAMANO_CELDA,
    height: TAMANO_CELDA,
    alignItems: 'center',
    justifyContent: 'center',
  },
  diaCirculo: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  diaTexto: {
    fontSize: 12.5,
    color: '#333',
  },
  diaTextoSeleccionado: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  pie: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 6,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#F0F0F0',
  },
  pieTexto: {
    fontSize: 12,
    color: '#888',
  },
  pieLimpiar: {
    fontSize: 12,
    fontWeight: '700',
    color: '#B00020',
  },
});
