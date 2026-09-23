import type { ArqueoCaja } from '@/core/tipos';
import { getSupabaseClient } from '@/sync/supabaseClient';

interface FilaArqueoRemoto {
  id: string;
  turno_id: string;
  promotor_id: string;
  promotor_nombre: string;
  efectivo_teorico: number;
  efectivo_contado: number;
  diferencia: number;
  total_transferencia: number;
  total_libranza: number;
  ts_cliente: string;
}

/**
 * El arqueo de un turno, subido desde CUALQUIER dispositivo (mismo patrón
 * que `listarTurnosRemotos`) — para cuando el admin ve el detalle de un
 * turno que no se abrió en su propio celular.
 */
export async function obtenerArqueoRemotoPorTurno(turnoId: string): Promise<ArqueoCaja | null> {
  const supabase = await getSupabaseClient();
  const { data, error } = await supabase
    .from('arqueos_caja')
    .select(
      'id, turno_id, promotor_id, promotor_nombre, efectivo_teorico, efectivo_contado, diferencia, total_transferencia, total_libranza, ts_cliente'
    )
    .eq('turno_id', turnoId)
    .maybeSingle()
    .returns<FilaArqueoRemoto | null>();
  if (error) throw error;
  if (!data) return null;

  return {
    id: data.id,
    turnoId: data.turno_id,
    promotorId: data.promotor_id,
    promotorNombre: data.promotor_nombre,
    efectivoTeorico: data.efectivo_teorico,
    efectivoContado: data.efectivo_contado,
    diferencia: data.diferencia,
    totalTransferencia: data.total_transferencia,
    totalLibranza: data.total_libranza,
    tsCliente: data.ts_cliente,
  };
}
