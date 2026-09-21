import { Asset } from 'expo-asset';
import { File } from 'expo-file-system';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';

import { formatearPesos } from '@/core/dinero';
import type { Evento, Turno } from '@/core/tipos';

import type { ResumenVentasPeriodo } from './analitica';
import type { ItemInventario } from './inventario';

const ETIQUETAS_METODO: Record<string, string> = {
  EFECTIVO: 'Efectivo',
  TRANSFERENCIA: 'Transferencia',
  LIBRANZA: 'Libranza',
};

function formatearFecha(iso: string): string {
  return new Date(iso).toLocaleString('es-CO', { dateStyle: 'long', timeStyle: 'short' });
}

function urlGoogleMaps(latitud: number, longitud: number): string {
  return `https://www.google.com/maps?q=${latitud},${longitud}`;
}

function escaparHtml(texto: string): string {
  return texto.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Sin Buffer global en React Native — conversión manual de bytes a base64. */
function arrayBufferABase64(buffer: ArrayBuffer): string {
  const ALFABETO = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const bytes = new Uint8Array(buffer);
  let resultado = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i];
    const b1 = bytes[i + 1];
    const b2 = bytes[i + 2];
    resultado += ALFABETO[b0 >> 2];
    resultado += ALFABETO[((b0 & 0x03) << 4) | (b1 >> 4)];
    resultado += b1 !== undefined ? ALFABETO[((b1 & 0x0f) << 2) | (b2 >> 6)] : '=';
    resultado += b2 !== undefined ? ALFABETO[b2 & 0x3f] : '=';
  }
  return resultado;
}

/**
 * El HTML que renderiza expo-print no puede resolver un `require()` de
 * imagen — se incrusta como `data:` URI. `expo-asset` resuelve el archivo
 * empacado a una ruta local real; de ahí se lee como bytes y se convierte.
 */
async function logoComoDataUri(): Promise<string | null> {
  try {
    const asset = Asset.fromModule(require('../../assets/images/logo-tu-lonchera.png'));
    await asset.downloadAsync();
    if (!asset.localUri) return null;
    const bytes = await new File(asset.localUri).arrayBuffer();
    return `data:image/png;base64,${arrayBufferABase64(bytes)}`;
  } catch {
    return null;
  }
}

function construirHtml(datos: {
  turno: Turno;
  eventoHoy: Evento | null;
  inventario: ItemInventario[];
  resumenVentas: ResumenVentasPeriodo;
  logoDataUri: string | null;
}): string {
  const { turno, eventoHoy, inventario, resumenVentas, logoDataUri } = datos;

  const totalUnidades = inventario.reduce((suma, item) => suma + item.saldo, 0);

  const filasInventario = inventario
    .map(
      (item, indice) =>
        `<tr class="${indice % 2 === 1 ? 'zebra' : ''}"><td>${escaparHtml(item.producto.nombre)}</td><td class="num">${item.saldo}</td></tr>`
    )
    .join('');

  const filasMetodoPago = resumenVentas.porMetodoPago
    .map(
      (fila) =>
        `<tr><td>${ETIQUETAS_METODO[fila.metodoPago] ?? fila.metodoPago}</td><td class="num">${fila.cantidadVentas}</td><td class="num">${formatearPesos(fila.total)}</td></tr>`
    )
    .join('');

  const enlaceUbicacion =
    turno.latitud !== null && turno.longitud !== null
      ? `<a class="link-mapa" href="${urlGoogleMaps(turno.latitud, turno.longitud)}">Ver ubicación en Google Maps →</a>`
      : '<span class="dato-vacio">Sin registrar</span>';

  return `
    <html>
      <head>
        <meta charset="utf-8" />
        <style>
          @page { margin: 0; }
          * { box-sizing: border-box; }
          body {
            font-family: -apple-system, Helvetica, Arial, sans-serif;
            color: #2A1810;
            margin: 0;
            padding: 0 32px 32px;
          }
          .encabezado {
            display: flex;
            align-items: center;
            gap: 16px;
            background: #541212;
            color: #FFFFFF;
            padding: 28px 32px;
            margin: 0 -32px 28px;
          }
          .encabezado img { width: 56px; height: 56px; border-radius: 12px; background: #FFFFFF; object-fit: contain; padding: 4px; }
          .encabezado-texto h1 { font-size: 20px; margin: 0 0 2px; font-weight: 700; }
          .encabezado-texto p { font-size: 12px; margin: 0; color: #F0DDD9; letter-spacing: 0.4px; text-transform: uppercase; }
          .titulo-doc { font-size: 22px; font-weight: 700; margin: 0 0 4px; }
          .subtitulo { color: #735D54; font-size: 13px; margin: 0 0 24px; }
          h2 {
            font-size: 13px;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 0.6px;
            color: #541212;
            margin: 28px 0 12px;
            padding-bottom: 6px;
            border-bottom: 2px solid #F3A712;
          }
          .tarjeta {
            background: #FFF8F6;
            border: 1px solid #EADFD7;
            border-radius: 12px;
            padding: 16px 18px;
          }
          .ficha { display: grid; grid-template-columns: 1fr 1fr; gap: 12px 24px; }
          .ficha-item .etiqueta { font-size: 10px; text-transform: uppercase; letter-spacing: 0.4px; color: #A8988F; margin: 0 0 2px; }
          .ficha-item .valor { font-size: 13.5px; color: #2A1810; font-weight: 600; margin: 0; }
          .link-mapa { color: #541212; font-weight: 600; font-size: 13.5px; text-decoration: none; border-bottom: 1px solid #F3A712; }
          .dato-vacio { color: #A8988F; font-size: 13px; font-style: italic; }
          table { width: 100%; border-collapse: collapse; font-size: 13px; }
          th { text-align: left; background: #541212; color: #FFFFFF; padding: 9px 12px; font-size: 10.5px; text-transform: uppercase; letter-spacing: 0.4px; }
          th:first-child { border-radius: 8px 0 0 8px; }
          th:last-child { border-radius: 0 8px 8px 0; }
          td { padding: 8px 12px; border-bottom: 1px solid #EADFD7; }
          .zebra td { background: #FFF8F6; }
          .num { text-align: right; font-variant-numeric: tabular-nums; }
          .total-fila td { font-weight: 700; border-top: 2px solid #541212; border-bottom: none; background: #FFF1EC; }
          .vacio { color: #A8988F; font-size: 13px; font-style: italic; padding: 14px 0; }
          .pie {
            margin-top: 36px;
            padding-top: 14px;
            border-top: 1px solid #EADFD7;
            font-size: 10.5px;
            color: #A8988F;
            display: flex;
            justify-content: space-between;
          }
        </style>
      </head>
      <body>
        <div class="encabezado">
          ${logoDataUri ? `<img src="${logoDataUri}" />` : ''}
          <div class="encabezado-texto">
            <h1>Tu Lonchera</h1>
            <p>Comprobante de cierre de turno</p>
          </div>
        </div>

        <p class="titulo-doc">${escaparHtml(turno.promotorNombre)}</p>
        <p class="subtitulo">Generado el ${formatearFecha(new Date().toISOString())}</p>

        <h2>Datos del turno</h2>
        <div class="tarjeta ficha">
          <div class="ficha-item">
            <p class="etiqueta">Inicio</p>
            <p class="valor">${formatearFecha(turno.horaInicio)}</p>
          </div>
          <div class="ficha-item">
            <p class="etiqueta">Fin</p>
            <p class="valor">${turno.horaFin ? formatearFecha(turno.horaFin) : '—'}</p>
          </div>
          <div class="ficha-item">
            <p class="etiqueta">Ubicación de inicio</p>
            <p class="valor">${enlaceUbicacion}</p>
          </div>
          <div class="ficha-item">
            <p class="etiqueta">Evento del día</p>
            <p class="valor">${
              eventoHoy
                ? `${escaparHtml(eventoHoy.empresaNombre)} · ${escaparHtml(eventoHoy.puntoNombre)}`
                : '<span class="dato-vacio">Sin evento asignado</span>'
            }</p>
          </div>
        </div>

        <h2>Ventas del turno</h2>
        ${
          resumenVentas.cantidadVentas === 0
            ? '<p class="vacio">Sin ventas registradas en este turno.</p>'
            : `<table>
                <thead><tr><th>Método de pago</th><th class="num">Ventas</th><th class="num">Total</th></tr></thead>
                <tbody>
                  ${filasMetodoPago}
                  <tr class="total-fila"><td>Total</td><td class="num">${resumenVentas.cantidadVentas}</td><td class="num">${formatearPesos(resumenVentas.totalVendido)}</td></tr>
                </tbody>
              </table>`
        }

        <h2>Inventario final (${totalUnidades} unidades en ${inventario.length} producto${inventario.length === 1 ? '' : 's'})</h2>
        ${
          inventario.length === 0
            ? '<p class="vacio">Sin productos en inventario.</p>'
            : `<table>
                <thead><tr><th>Producto</th><th class="num">Saldo</th></tr></thead>
                <tbody>${filasInventario}</tbody>
              </table>`
        }

        <div class="pie">
          <span>Tu Lonchera — comprobante interno, sin valor fiscal</span>
          <span>${escaparHtml(turno.promotorNombre)}</span>
        </div>
      </body>
    </html>
  `;
}

/**
 * Genera el PDF de cierre de turno del promotor (inventario final + ventas
 * del turno + datos del check-in/check-out, sin la selfie) y abre el
 * diálogo nativo de compartir/guardar — mismo patrón que
 * `exportarAExcel` (src/db/exportarExcel.ts): generar archivo local +
 * `Sharing.shareAsync`.
 */
export async function generarPdfCierreTurno(datos: {
  turno: Turno;
  eventoHoy: Evento | null;
  inventario: ItemInventario[];
  resumenVentas: ResumenVentasPeriodo;
}): Promise<void> {
  const logoDataUri = await logoComoDataUri();
  const html = construirHtml({ ...datos, logoDataUri });
  const { uri } = await Print.printToFileAsync({ html });

  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, {
      mimeType: 'application/pdf',
      dialogTitle: 'Cierre de turno',
    });
  }
}
