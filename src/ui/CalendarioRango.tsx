import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { COLORES_ADMIN, TIPOGRAFIA_ADMIN } from './tema';

interface Props {
  /** "AAAA-MM-DD" o null si no hay selección todavía. */
  desde: string | null;
  hasta: string | null;
  onCambiar: (desde: string | null, hasta: string | null) => void;
}

const NOMBRES_MES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];
const NOMBRES_DIA = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];

function aClaveFecha(anio: number, mes: number, dia: number): string {
  return `${anio}-${String(mes + 1).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
}

/** Días del mes en celdas de semana (lunes a domingo), con null para relleno fuera de mes. */
function construirGrilla(anio: number, mes: number): (number | null)[][] {
  const primerDia = new Date(anio, mes, 1).getDay();
  // getDay(): 0=domingo..6=sábado → convertir a offset lunes=0..domingo=6
  const offsetLunes = (primerDia + 6) % 7;
  const diasEnMes = new Date(anio, mes + 1, 0).getDate();

  const celdas: (number | null)[] = [
    ...Array(offsetLunes).fill(null),
    ...Array.from({ length: diasEnMes }, (_, i) => i + 1),
  ];
  while (celdas.length % 7 !== 0) celdas.push(null);

  const semanas: (number | null)[][] = [];
  for (let i = 0; i < celdas.length; i += 7) {
    semanas.push(celdas.slice(i, i + 7));
  }
  return semanas;
}

/**
 * Calendario de mes con selección de rango: el primer toque fija "desde",
 * el segundo fija "hasta" (o reinicia si es anterior). Sin dependencias
 * externas — usa el sistema de diseño de src/ui/tema.ts.
 */
export function CalendarioRango({ desde, hasta, onCambiar }: Props) {
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

  function tocarDia(dia: number) {
    const clave = aClaveFecha(mesVisible.anio, mesVisible.mes, dia);
    if (!desde || (desde && hasta)) {
      onCambiar(clave, null);
      return;
    }
    if (clave < desde) {
      onCambiar(clave, desde);
      return;
    }
    onCambiar(desde, clave);
  }

  return (
    <View style={styles.contenedor}>
      <View style={styles.encabezado}>
        <Pressable style={styles.navBoton} onPress={irMesAnterior}>
          <Ionicons name="chevron-back" size={18} color={COLORES_ADMIN.vino} />
        </Pressable>
        <Text style={styles.mesTexto}>
          {NOMBRES_MES[mesVisible.mes]} {mesVisible.anio}
        </Text>
        <Pressable style={styles.navBoton} onPress={irMesSiguiente}>
          <Ionicons name="chevron-forward" size={18} color={COLORES_ADMIN.vino} />
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
            const esDesde = clave === desde;
            const esHasta = clave === hasta;
            const enRango = desde && hasta && clave > desde && clave < hasta;
            const seleccionado = esDesde || esHasta;

            return (
              <Pressable
                key={indiceDia}
                style={[styles.celda, enRango && styles.celdaEnRango]}
                onPress={() => tocarDia(dia)}
              >
                <View
                  style={[
                    styles.diaCirculo,
                    seleccionado && styles.diaCirculoSeleccionado,
                    esHoy && !seleccionado && styles.diaCirculoHoy,
                  ]}
                >
                  <Text
                    style={[
                      styles.diaTexto,
                      seleccionado && styles.diaTextoSeleccionado,
                      esHoy && !seleccionado && styles.diaTextoHoy,
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
        <Text style={styles.pieTexto}>
          {desde && hasta ? `${desde} — ${hasta}` : desde ? `${desde} — elige el final` : 'Elige la fecha inicial'}
        </Text>
        {(desde || hasta) && (
          <Pressable onPress={() => onCambiar(null, null)}>
            <Text style={styles.pieLimpiar}>Limpiar</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

const TAMANO_CELDA = 36;

const styles = StyleSheet.create({
  contenedor: {
    backgroundColor: COLORES_ADMIN.superficieMasBaja,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORES_ADMIN.bordeSuave,
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
    backgroundColor: COLORES_ADMIN.superficieBaja,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mesTexto: {
    fontSize: 14,
    fontFamily: TIPOGRAFIA_ADMIN.semiNegrita,
    color: COLORES_ADMIN.vino,
  },
  filaDias: {
    flexDirection: 'row',
  },
  diaEtiqueta: {
    width: TAMANO_CELDA,
    textAlign: 'center',
    fontSize: 11,
    fontFamily: TIPOGRAFIA_ADMIN.semiNegrita,
    color: COLORES_ADMIN.textoSecundario,
  },
  celda: {
    width: TAMANO_CELDA,
    height: TAMANO_CELDA,
    alignItems: 'center',
    justifyContent: 'center',
  },
  celdaEnRango: {
    backgroundColor: COLORES_ADMIN.superficieBaja,
  },
  diaCirculo: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  diaCirculoSeleccionado: {
    backgroundColor: COLORES_ADMIN.vino,
  },
  diaCirculoHoy: {
    borderWidth: 1.5,
    borderColor: COLORES_ADMIN.dorado,
  },
  diaTexto: {
    fontSize: 12.5,
    fontFamily: TIPOGRAFIA_ADMIN.monoRegular,
    color: COLORES_ADMIN.texto,
  },
  diaTextoSeleccionado: {
    color: '#FFFFFF',
    fontFamily: TIPOGRAFIA_ADMIN.monoSemiNegrita,
  },
  diaTextoHoy: {
    color: COLORES_ADMIN.vino,
    fontFamily: TIPOGRAFIA_ADMIN.monoSemiNegrita,
  },
  pie: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 6,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: COLORES_ADMIN.superficie,
  },
  pieTexto: {
    fontSize: 11.5,
    fontFamily: TIPOGRAFIA_ADMIN.monoRegular,
    color: COLORES_ADMIN.textoSecundario,
  },
  pieLimpiar: {
    fontSize: 12,
    fontFamily: TIPOGRAFIA_ADMIN.semiNegrita,
    color: COLORES_ADMIN.error,
  },
});
