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

function escaparHtml(texto: string): string {
  return texto.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function construirHtml(datos: {
  turno: Turno;
  eventoHoy: Evento | null;
  inventario: ItemInventario[];
  resumenVentas: ResumenVentasPeriodo;
}): string {
  const { turno, eventoHoy, inventario, resumenVentas } = datos;

  const filasInventario = inventario
    .map(
      (item) =>
        `<tr><td>${escaparHtml(item.producto.nombre)}</td><td class="num">${item.saldo}</td></tr>`
    )
    .join('');

  const filasMetodoPago = resumenVentas.porMetodoPago
    .map(
      (fila) =>
        `<tr><td>${ETIQUETAS_METODO[fila.metodoPago] ?? fila.metodoPago}</td><td class="num">${fila.cantidadVentas}</td><td class="num">${formatearPesos(fila.total)}</td></tr>`
    )
    .join('');

  return `
    <html>
      <head>
        <meta charset="utf-8" />
        <style>
          body { font-family: Helvetica, Arial, sans-serif; color: #2A1810; padding: 24px; }
          h1 { font-size: 20px; margin-bottom: 4px; }
          h2 { font-size: 15px; margin-top: 28px; margin-bottom: 8px; border-bottom: 1px solid #EADFD7; padding-bottom: 4px; }
          .subtitulo { color: #735D54; font-size: 13px; margin-bottom: 20px; }
          table { width: 100%; border-collapse: collapse; font-size: 13px; }
          th { text-align: left; background: #F5EFEB; padding: 6px 8px; font-size: 11px; text-transform: uppercase; color: #735D54; }
          td { padding: 6px 8px; border-bottom: 1px solid #F0F0F0; }
          .num { text-align: right; }
          .ficha p { margin: 4px 0; font-size: 13px; }
          .ficha strong { color: #735D54; font-weight: 600; }
          .total-fila td { font-weight: 700; border-top: 2px solid #2A1810; }
        </style>
      </head>
      <body>
        <h1>Cierre de turno</h1>
        <p class="subtitulo">${escaparHtml(turno.promotorNombre)}</p>

        <h2>Datos del turno</h2>
        <div class="ficha">
          <p><strong>Inicio:</strong> ${formatearFecha(turno.horaInicio)}</p>
          <p><strong>Fin:</strong> ${turno.horaFin ? formatearFecha(turno.horaFin) : '—'}</p>
          <p><strong>Ubicación:</strong> ${
            turno.latitud !== null && turno.longitud !== null
              ? `${turno.latitud.toFixed(5)}, ${turno.longitud.toFixed(5)}`
              : 'Sin registrar'
          }</p>
          ${
            eventoHoy
              ? `<p><strong>Evento del día:</strong> ${escaparHtml(eventoHoy.empresaNombre)} · ${escaparHtml(eventoHoy.puntoNombre)}</p>`
              : ''
          }
        </div>

        <h2>Ventas del turno</h2>
        ${
          resumenVentas.cantidadVentas === 0
            ? '<p class="subtitulo">Sin ventas registradas en este turno.</p>'
            : `<table>
                <thead><tr><th>Método de pago</th><th class="num">Ventas</th><th class="num">Total</th></tr></thead>
                <tbody>
                  ${filasMetodoPago}
                  <tr class="total-fila"><td>Total</td><td class="num">${resumenVentas.cantidadVentas}</td><td class="num">${formatearPesos(resumenVentas.totalVendido)}</td></tr>
                </tbody>
              </table>`
        }

        <h2>Inventario final</h2>
        ${
          inventario.length === 0
            ? '<p class="subtitulo">Sin productos en inventario.</p>'
            : `<table>
                <thead><tr><th>Producto</th><th class="num">Saldo</th></tr></thead>
                <tbody>${filasInventario}</tbody>
              </table>`
        }
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
  const html = construirHtml(datos);
  const { uri } = await Print.printToFileAsync({ html });

  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, {
      mimeType: 'application/pdf',
      dialogTitle: 'Cierre de turno',
    });
  }
}
