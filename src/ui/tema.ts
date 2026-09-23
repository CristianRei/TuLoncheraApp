// Sistema de diseño de las pantallas de Admin rediseñadas (menú y
// dashboard) — generado a partir de mockups de Google Stitch, adaptado a
// datos y funcionalidad reales de Tu Lonchera. Ver docs/03-decisiones para
// el porqué de no extender esto a las demás pantallas de admin todavía.
export const COLORES_ADMIN = {
  background: '#FFF8F6',
  superficieMasBaja: '#FFFFFF',
  superficieBaja: '#FFF1EC',
  superficie: '#FFE9E2',
  superficieAlta: '#FFE2D7',
  superficieMasAlta: '#FEDBCE',
  texto: '#29170F',
  textoSecundario: '#554241',
  borde: '#877270',
  bordeSuave: '#DAC1BE',
  vino: '#541212',
  dorado: '#FCAF1E',
  positivo: '#54A353',
  error: '#BA1A1A',
} as const;

/**
 * Nombres de fuente tal como los expone @expo-google-fonts, cargados en
 * app/_layout.tsx. Hanken Grotesk para texto general, JetBrains Mono para
 * cualquier cifra (dinero, cantidades, porcentajes) — ver DESIGN.md del
 * mockup de Stitch: "tabular alignment... sin columnas que se desalinean".
 */
export const TIPOGRAFIA_ADMIN = {
  regular: 'HankenGrotesk_400Regular',
  medio: 'HankenGrotesk_500Medium',
  semiNegrita: 'HankenGrotesk_600SemiBold',
  negrita: 'HankenGrotesk_700Bold',
  monoRegular: 'JetBrainsMono_400Regular',
  monoMedio: 'JetBrainsMono_500Medium',
  monoSemiNegrita: 'JetBrainsMono_600SemiBold',
} as const;

/**
 * Escala única de radios de borde para admin — antes cada pantalla elegía
 * su propio valor suelto (4, 6, 8, 10, 12, 14, 16, 18, 20, 24...). Los 5
 * componentes compartidos (Encabezado, ListRow, SearchBar, FilterTabs,
 * EmptyState) y cualquier pantalla nueva deben usar esta escala en vez de
 * un número literal.
 */
export const RADII_ADMIN = {
  sm: 8, // badges, chips pequeños
  md: 12, // inputs, filas de lista
  lg: 16, // tarjetas, modales
  pill: 999, // tabs, search bar, botones pill
} as const;

export const ESPACIADO_ADMIN = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
} as const;
