import { Directory, File, Paths } from 'expo-file-system';

const CARPETA_FOTOS = 'productos';

function asegurarCarpetaFotos(): Directory {
  const carpeta = new Directory(Paths.document, CARPETA_FOTOS);
  if (!carpeta.exists) {
    carpeta.create({ intermediates: true });
  }
  return carpeta;
}

/**
 * Copia la foto elegida (cámara o galería, que puede vivir en un directorio
 * temporal) al almacenamiento persistente de la app y devuelve el URI final.
 * El nombre del archivo es el id del producto, así que una foto nueva
 * siempre reemplaza a la anterior de ese mismo producto.
 */
export async function guardarFotoProducto(uriOrigen: string, productoId: string): Promise<string> {
  const carpeta = asegurarCarpetaFotos();
  const destino = new File(carpeta, `${productoId}.jpg`);
  const origen = new File(uriOrigen);
  await origen.copy(destino, { overwrite: true });
  return destino.uri;
}
