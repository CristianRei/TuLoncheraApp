import { Directory, File, Paths } from 'expo-file-system';

function asegurarCarpeta(nombre: string): Directory {
  const carpeta = new Directory(Paths.document, nombre);
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
  const carpeta = asegurarCarpeta('productos');
  const destino = new File(carpeta, `${productoId}.jpg`);
  const origen = new File(uriOrigen);
  await origen.copy(destino, { overwrite: true });
  return destino.uri;
}

/** Foto del comprobante de transferencia, con el id de la venta ya generado en el cliente (R3). */
export async function guardarFotoComprobante(uriOrigen: string, ventaId: string): Promise<string> {
  const carpeta = asegurarCarpeta('comprobantes');
  const destino = new File(carpeta, `${ventaId}.jpg`);
  const origen = new File(uriOrigen);
  await origen.copy(destino, { overwrite: true });
  return destino.uri;
}

/** Selfie de apertura de turno, con el id del turno ya generado en el cliente (R3). */
export async function guardarFotoSelfie(uriOrigen: string, turnoId: string): Promise<string> {
  const carpeta = asegurarCarpeta('turnos');
  const destino = new File(carpeta, `${turnoId}.jpg`);
  const origen = new File(uriOrigen);
  await origen.copy(destino, { overwrite: true });
  return destino.uri;
}
