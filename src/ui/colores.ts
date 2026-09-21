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
  textoSobreOscuro: '#3A2400',
  textoSecundario: '#6B5B3F',
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
  monoSemiNegrita: 'JetBrainsMono_600SemiBold',
} as const;
