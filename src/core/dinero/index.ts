import type { Pesos } from '../tipos';

/**
 * "12500" → "$ 12.500". Formato colombiano: punto como separador de miles,
 * siempre entero (CLAUDE.md sección 8: dinero nunca en float).
 */
export function formatearPesos(pesos: Pesos): string {
  const entero = Math.round(pesos);
  const conSeparadores = Math.abs(entero).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return entero < 0 ? `-$ ${conSeparadores}` : `$ ${conSeparadores}`;
}

/**
 * Texto de un input ("$ 12.500", "12500", "") → entero de pesos. Cualquier
 * caracter que no sea dígito se descarta.
 */
export function parsearPesos(texto: string): Pesos {
  const soloDigitos = texto.replace(/\D/g, '');
  return soloDigitos === '' ? 0 : parseInt(soloDigitos, 10);
}
