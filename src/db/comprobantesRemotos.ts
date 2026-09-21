import { getSupabaseClient } from '@/sync/supabaseClient';

export interface ComprobanteRemoto {
  ventaId: string;
  comprobanteUri: string;
}

interface FilaComprobanteRemoto {
  venta_id: string;
  comprobante_path: string;
}

const DURACION_URL_FIRMADA_SEGUNDOS = 60 * 60;

/**
 * Comprobantes de transferencia subidos desde cualquier dispositivo. Solo
 * trae lo mínimo (venta_id + URL firmada) — el resto de la venta sigue
 * siendo 100% local; se usa para rellenar `comprobanteUri` cuando la fila
 * local no lo tiene (venta hecha en otro dispositivo).
 */
export async function obtenerComprobanteRemoto(ventaId: string): Promise<ComprobanteRemoto | null> {
  const supabase = await getSupabaseClient();
  const { data, error } = await supabase
    .from('comprobantes_venta')
    .select('venta_id, comprobante_path')
    .eq('venta_id', ventaId)
    .maybeSingle<FilaComprobanteRemoto>();
  if (error) throw error;
  if (!data) return null;

  const { data: firmada } = await supabase.storage
    .from('comprobantes-venta')
    .createSignedUrl(data.comprobante_path, DURACION_URL_FIRMADA_SEGUNDOS);
  if (!firmada?.signedUrl) return null;

  return { ventaId: data.venta_id, comprobanteUri: firmada.signedUrl };
}
