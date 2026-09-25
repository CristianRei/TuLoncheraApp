// Paleta de marca (primario/oscuro) — ver CLAUDE.md sección 13. El resto de
// tokens completan esa marca con colores semánticos consistentes para las
// pantallas de promotor/bodega — antes de esto, cada pantalla repetía sus
// propios valores hex sueltos y a veces divergentes (ej. dos verdes
// distintos para "positivo"). Deliberadamente cálido (nunca gris frío) para
// no desentonar con el dorado/vinotinto de marca.
export const COLORES = {
  primario: '#F3A712',
  primarioOscuro: '#C6810A',
  oscuro: '#541212',
  fondo: '#FFF8EC',
  superficie: '#FFFFFF',
  /** Fondo de agrupadores (buscador, control segmentado, filas resaltadas). */
  superficieBaja: '#FFF1D6',
  texto: '#29170F',
  /** Texto sobre el dorado (encabezado, botones primarios): café oscuro, no blanco — contraste AA. */
  textoSobreOscuro: '#3A2400',
  textoSecundario: '#6B5B3F',
  /** Texto sobre vino o sobre fotos oscuras (no sobre el dorado: ahí va textoSobreOscuro). */
  textoInverso: '#FFFFFF',
  positivo: '#2E7D32',
  error: '#B00020',
  borde: '#F0DDB8',
} as const;

/**
 * Hanken Grotesk (ya cargada en app/_layout.tsx, sin peso nuevo en el APK)
 * con una escala distinta a TIPOGRAFIA_ADMIN (src/ui/tema.ts): admin es
 * denso/tabular para lectura de datos sentado, promotor necesita jerarquía
 * grande para lectura rápida de pie, entre un cliente y el siguiente.
 * JetBrains Mono solo para cifras de dinero/cantidades — mismo criterio que
 * admin, alineación tabular para que un monto nunca "salte" al cambiar.
 */
export const TIPOGRAFIA_PROMOTOR = {
  regular: 'HankenGrotesk_400Regular',
  medio: 'HankenGrotesk_500Medium',
  semiNegrita: 'HankenGrotesk_600SemiBold',
  negrita: 'HankenGrotesk_700Bold',
  monoRegular: 'JetBrainsMono_400Regular',
  monoMedio: 'JetBrainsMono_500Medium',
  monoSemiNegrita: 'JetBrainsMono_600SemiBold',
} as const;

/**
 * Los mismos roles que TEXTO_ADMIN (src/ui/tema.ts), un par de puntos más
 * grandes: el promotor lee de pie, con el celular en la mano, entre un
 * cliente y el siguiente. Un estilo de texto es `...TEXTO_PROMOTOR.<rol>`.
 */
export const TEXTO_PROMOTOR = {
  tituloPantalla: { fontSize: 22, fontFamily: TIPOGRAFIA_PROMOTOR.negrita, color: COLORES.texto },
  tituloSeccion: { fontSize: 18, fontFamily: TIPOGRAFIA_PROMOTOR.semiNegrita, color: COLORES.texto },
  tituloTarjeta: { fontSize: 16, fontFamily: TIPOGRAFIA_PROMOTOR.semiNegrita, color: COLORES.texto },
  cuerpo: { fontSize: 15, fontFamily: TIPOGRAFIA_PROMOTOR.regular, color: COLORES.texto },
  cuerpoSecundario: { fontSize: 14, fontFamily: TIPOGRAFIA_PROMOTOR.regular, color: COLORES.textoSecundario },
  nota: { fontSize: 13, fontFamily: TIPOGRAFIA_PROMOTOR.regular, color: COLORES.textoSecundario },
  etiqueta: {
    fontSize: 12,
    fontFamily: TIPOGRAFIA_PROMOTOR.semiNegrita,
    color: COLORES.textoSecundario,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  boton: { fontSize: 15, fontFamily: TIPOGRAFIA_PROMOTOR.semiNegrita, color: COLORES.texto },
  datoGrande: { fontSize: 28, fontFamily: TIPOGRAFIA_PROMOTOR.monoSemiNegrita, color: COLORES.texto },
  dato: { fontSize: 15, fontFamily: TIPOGRAFIA_PROMOTOR.monoMedio, color: COLORES.texto },
  datoDestacado: { fontSize: 15, fontFamily: TIPOGRAFIA_PROMOTOR.monoSemiNegrita, color: COLORES.texto },
  datoSecundario: { fontSize: 13, fontFamily: TIPOGRAFIA_PROMOTOR.monoRegular, color: COLORES.textoSecundario },
} as const;
