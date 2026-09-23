/**
 * Aviso interno "llegaron datos nuevos de Supabase a la base local" — para que
 * las pantallas abiertas se refresquen solas sin que la persona toque nada.
 * Sin React a propósito (ver `useVersionDatos` en src/ui para el hook).
 */
type Oyente = () => void;

const oyentes = new Set<Oyente>();
let version = 0;

export function notificarDatosActualizados(): void {
  version++;
  for (const oyente of [...oyentes]) oyente();
}

export function suscribirDatosActualizados(oyente: Oyente): () => void {
  oyentes.add(oyente);
  return () => {
    oyentes.delete(oyente);
  };
}

export function versionDatos(): number {
  return version;
}
