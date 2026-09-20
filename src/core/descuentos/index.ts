import type { Pesos, TipoDescuento } from '../tipos';

export interface DescuentoVigente {
  tipo: TipoDescuento;
  valor: number;
}

/**
 * Aplica un descuento vigente a un precio. Dinero siempre entero (CLAUDE.md
 * sección 8) — un PORCENTAJE redondea, nunca queda en centavos. Nunca deja
 * el precio en negativo, aunque el valor configurado sea inconsistente.
 */
export function aplicarDescuento(precio: Pesos, descuento: DescuentoVigente | null): Pesos {
  if (!descuento) return precio;
  if (descuento.tipo === 'MONTO_FIJO') return Math.max(0, precio - descuento.valor);
  return Math.max(0, Math.round(precio * (1 - descuento.valor / 100)));
}
