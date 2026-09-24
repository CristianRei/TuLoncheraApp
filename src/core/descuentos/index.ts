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

/**
 * De todas las reglas vigentes que le aplican a un producto (por producto,
 * por punto, por promotor, o generales), la que MÁS descuenta sobre ese
 * precio — nunca se suman (decisión del negocio, 2026-09-24). Comparar en
 * pesos y no por "valor" es lo que permite enfrentar un porcentaje con un
 * monto fijo: 10 % de $ 10.000 ($ 1.000) le gana a $ 500 fijos, pero no a
 * $ 1.500 fijos. En empate gana la primera de la lista (quien llama la
 * ordena de la más reciente a la más vieja). `null` si no hay ninguna o
 * ninguna descuenta nada.
 */
export function elegirMayorDescuento<T extends DescuentoVigente>(precio: Pesos, candidatos: T[]): T | null {
  let mejor: T | null = null;
  let mejorMonto = 0;
  for (const candidato of candidatos) {
    const monto = precio - aplicarDescuento(precio, candidato);
    if (monto > mejorMonto) {
      mejor = candidato;
      mejorMonto = monto;
    }
  }
  return mejor;
}
