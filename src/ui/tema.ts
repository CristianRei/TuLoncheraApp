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
  /** Texto sobre fondo vino o dorado sólido (botones primarios, chips activos). */
  textoInverso: '#FFFFFF',
  borde: '#877270',
  bordeSuave: '#DAC1BE',
  vino: '#541212',
  dorado: '#FCAF1E',
  positivo: '#54A353',
  error: '#BA1A1A',
} as const;

/**
 * Tríos de color por estado (fondo + borde + texto) para insignias, avisos y
 * filas resaltadas — antes cada pantalla hardcodeaba su propia versión
 * (#EAF5EA/#C3E3C3 aquí, #FEF6E7/#FBDCA3 allá, #B00020 en vez de
 * COLORES_ADMIN.error), así que el mismo estado se veía distinto según la
 * pantalla. Valores tomados de TemDesing/DESIGN.md ("Status Badges").
 */
export const ESTADO_ADMIN = {
  exito: { fondo: '#EAF5EA', borde: '#C3E3C3', texto: '#2E7D32' },
  alerta: { fondo: '#FEF6E7', borde: '#FBDCA3', texto: '#976200' },
  error: { fondo: '#FDF2F2', borde: '#F8C8C8', texto: '#941B1B' },
  neutro: {
    fondo: COLORES_ADMIN.superficieBaja,
    borde: COLORES_ADMIN.bordeSuave,
    texto: COLORES_ADMIN.textoSecundario,
  },
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

/**
 * Ancho máximo del contenido por TIPO de pantalla — antes cada una elegía el
 * suyo (720, 1200, 960, 860, 640, 600) sin criterio, así que dos listas
 * iguales ocupaban anchos distintos y saltaban al navegar entre módulos.
 *
 * El ancho lo decide la forma del contenido, no la pantalla:
 * - `formulario`: una columna de campos. Más ancho solo alarga las líneas.
 * - `lista`: filas de lectura o detalle. Aprovecha la pantalla sin que el ojo
 *   tenga que recorrer de un extremo al otro entre la etiqueta y el dato.
 * - `tablero`: gráficas y grillas de varias columnas, que sí necesitan aire.
 */
export const ANCHO_ADMIN = {
  formulario: 640,
  lista: 860,
  tablero: 1200,
} as const;

/**
 * Escala tipográfica por ROL, no por tamaño suelto — antes cada pantalla
 * elegía su propio `fontSize` (llegó a haber 18 valores distintos en admin,
 * con decimales sueltos como 12.5/10.5/15.5 para la misma jerarquía). Cada
 * entrada ya trae familia + tamaño + color, así que un estilo de texto es
 * `...TEXTO_ADMIN.tituloSeccion` en vez de repetir las tres propiedades.
 *
 * Los valores siguen la escala de TemDesing/DESIGN.md (headline-lg 30 /
 * headline-md 22 / headline-sm 18 / body-lg 16 / body-md 14 / body-sm 12 /
 * label-sm 11), ajustada a los tamaños que la app ya usaba de hecho para no
 * cambiar la densidad de pantallas enteras de golpe.
 *
 * `dato*` usa JetBrains Mono: cualquier cifra (dinero, cantidades,
 * porcentajes) va en monoespaciada para que las columnas no se desalineen.
 */
export const TEXTO_ADMIN = {
  /** Título de la pantalla en el encabezado (ej. "Análisis"). */
  tituloPantalla: {
    fontSize: 20,
    fontFamily: TIPOGRAFIA_ADMIN.negrita,
    color: COLORES_ADMIN.texto,
  },
  /** Título de una sección dentro de la pantalla (ej. "Qué se repite por punto"). */
  tituloSeccion: {
    fontSize: 16,
    fontFamily: TIPOGRAFIA_ADMIN.semiNegrita,
    color: COLORES_ADMIN.texto,
  },
  /** Bajada explicativa debajo de un título de sección. */
  subtituloSeccion: {
    fontSize: 13,
    fontFamily: TIPOGRAFIA_ADMIN.regular,
    color: COLORES_ADMIN.textoSecundario,
  },
  /** Título dentro de una tarjeta o fila de lista. */
  tituloTarjeta: {
    fontSize: 15,
    fontFamily: TIPOGRAFIA_ADMIN.semiNegrita,
    color: COLORES_ADMIN.texto,
  },
  /** Texto de lectura normal. */
  cuerpo: {
    fontSize: 14,
    fontFamily: TIPOGRAFIA_ADMIN.regular,
    color: COLORES_ADMIN.texto,
  },
  /** Texto secundario: metadatos, ayudas, estados vacíos. */
  cuerpoSecundario: {
    fontSize: 13,
    fontFamily: TIPOGRAFIA_ADMIN.regular,
    color: COLORES_ADMIN.textoSecundario,
  },
  /** Texto pequeño de apoyo: pie de tarjeta, aclaraciones, fechas en texto. */
  nota: {
    fontSize: 12,
    fontFamily: TIPOGRAFIA_ADMIN.regular,
    color: COLORES_ADMIN.textoSecundario,
  },
  /** Etiqueta de campo o encabezado de columna — va en MAYÚSCULAS. */
  etiqueta: {
    fontSize: 11,
    fontFamily: TIPOGRAFIA_ADMIN.semiNegrita,
    color: COLORES_ADMIN.textoSecundario,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  /** Texto de un botón o pestaña. */
  boton: {
    fontSize: 13,
    fontFamily: TIPOGRAFIA_ADMIN.semiNegrita,
    color: COLORES_ADMIN.texto,
  },
  /** Cifra destacada (KPI). */
  datoGrande: {
    fontSize: 24,
    fontFamily: TIPOGRAFIA_ADMIN.monoSemiNegrita,
    color: COLORES_ADMIN.texto,
  },
  /** Cifra dentro de una fila o tarjeta. */
  dato: {
    fontSize: 13,
    fontFamily: TIPOGRAFIA_ADMIN.monoMedio,
    color: COLORES_ADMIN.texto,
  },
  /** Total o monto que cierra una fila (ej. total de la venta, monto del ranking). */
  datoDestacado: {
    fontSize: 13,
    fontFamily: TIPOGRAFIA_ADMIN.monoSemiNegrita,
    color: COLORES_ADMIN.texto,
  },
  /** Cifra secundaria o unidad, en gris. */
  datoSecundario: {
    fontSize: 12,
    fontFamily: TIPOGRAFIA_ADMIN.monoRegular,
    color: COLORES_ADMIN.textoSecundario,
  },
} as const;
