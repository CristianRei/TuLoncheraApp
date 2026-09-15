import { Directory, File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import * as XLSX from 'xlsx';

const CARPETA_EXPORTS = 'exports';

function asegurarCarpetaExports(): Directory {
  const carpeta = new Directory(Paths.cache, CARPETA_EXPORTS);
  if (!carpeta.exists) {
    carpeta.create({ intermediates: true });
  }
  return carpeta;
}

/**
 * Genera un .xlsx de una sola hoja a partir de un arreglo de objetos planos
 * (cada key se vuelve columna) y abre el diálogo nativo de compartir/guardar.
 * Solo para demo — no hay manejo de archivos grandes ni formato avanzado.
 */
export async function exportarAExcel(
  nombreHoja: string,
  filas: Record<string, unknown>[],
  nombreArchivo: string
): Promise<void> {
  const libro = XLSX.utils.book_new();
  const hoja = XLSX.utils.json_to_sheet(filas);
  XLSX.utils.book_append_sheet(libro, hoja, nombreHoja);

  const base64 = XLSX.write(libro, { bookType: 'xlsx', type: 'base64' });

  const carpeta = asegurarCarpetaExports();
  const archivo = new File(carpeta, `${nombreArchivo}.xlsx`);
  if (archivo.exists) archivo.delete();
  archivo.create();
  archivo.write(base64, { encoding: 'base64' });

  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(archivo.uri, {
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      dialogTitle: nombreHoja,
    });
  }
}
