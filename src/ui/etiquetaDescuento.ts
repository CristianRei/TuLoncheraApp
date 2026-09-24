import type { DescuentoVigente } from '@/core/descuentos';
import { formatearPesos } from '@/core/dinero';

/** Etiqueta corta para mostrar junto al precio: "-10 %" o "-$ 500". */
export function etiquetaDescuento(descuento: DescuentoVigente): string {
  return descuento.tipo === 'PORCENTAJE' ? `-${descuento.valor} %` : `-${formatearPesos(descuento.valor)}`;
}
