import { useWindowDimensions } from 'react-native';

/**
 * Admin y Bodega se usan tanto en celular (Expo Go) como en tablet/monitor
 * grande. 768px es el punto de corte habitual entre celular y tablet en
 * orientación vertical — a partir de ahí conviene grilla de 2+ columnas y
 * un ancho máximo de contenido en vez de estirar todo de borde a borde.
 */
const ANCHO_MINIMO_TABLET = 768;

export function useEsPantallaAncha(): boolean {
  const { width } = useWindowDimensions();
  return width >= ANCHO_MINIMO_TABLET;
}
