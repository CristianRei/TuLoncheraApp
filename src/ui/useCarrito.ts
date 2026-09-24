import { useCallback, useState } from 'react';

import type { DescuentoVigente } from '@/core/descuentos';
import type { Pesos } from '@/core/tipos';

export interface ItemCarrito {
  productoId: string;
  nombre: string;
  /** Lo que se cobra por unidad: ya con el descuento vigente aplicado. */
  precio: Pesos;
  /** Precio de catálogo, para mostrarlo tachado cuando hay descuento. */
  precioLista: Pesos;
  descuento: DescuentoVigente | null;
  fotoUri: string | null;
  cantidad: number;
}

interface ProductoParaAgregar {
  id: string;
  nombre: string;
  precio: Pesos;
  precioLista: Pesos;
  descuento: DescuentoVigente | null;
  fotoUri: string | null;
}

/** Precio vigente de un producto (ver `resolverPreciosConDescuento`, src/db/descuentos.ts). */
export interface PrecioVigente {
  precioLista: Pesos;
  precioFinal: Pesos;
  descuento: DescuentoVigente | null;
}

/**
 * El "ticket" del promotor: estado de UI efímero, no es inventario. Se
 * pierde si sale de la pantalla o al cobrar — a propósito, ver
 * docs/03-decisiones/0002-ventas-sin-evento.md.
 */
export function useCarrito() {
  const [items, setItems] = useState<ItemCarrito[]>([]);

  function agregar(producto: ProductoParaAgregar) {
    setItems((actual) => {
      const existente = actual.find((item) => item.productoId === producto.id);
      if (existente) {
        return actual.map((item) =>
          item.productoId === producto.id ? { ...item, cantidad: item.cantidad + 1 } : item
        );
      }
      return [
        ...actual,
        {
          productoId: producto.id,
          nombre: producto.nombre,
          precio: producto.precio,
          precioLista: producto.precioLista,
          descuento: producto.descuento,
          fotoUri: producto.fotoUri,
          cantidad: 1,
        },
      ];
    });
  }

  function quitarUno(productoId: string) {
    setItems((actual) =>
      actual
        .map((item) => (item.productoId === productoId ? { ...item, cantidad: item.cantidad - 1 } : item))
        .filter((item) => item.cantidad > 0)
    );
  }

  function vaciar() {
    setItems([]);
  }

  /**
   * Pone al día el precio de lo que ya está en el ticket — un horario de
   * descuento pudo empezar o terminar con el ticket abierto. Se llama al
   * abrir el ticket, antes de cobrar y cada minuto, así lo que el promotor
   * ve es lo que cobra. Estable entre renders (solo usa `setItems`).
   */
  const actualizarPrecios = useCallback((precios: Map<string, PrecioVigente>) => {
    setItems((actual) =>
      actual.map((item) => {
        const vigente = precios.get(item.productoId);
        if (!vigente) return item;
        return { ...item, precio: vigente.precioFinal, precioLista: vigente.precioLista, descuento: vigente.descuento };
      })
    );
  }, []);

  const total = items.reduce((suma, item) => suma + item.precio * item.cantidad, 0);
  const totalSinDescuento = items.reduce((suma, item) => suma + item.precioLista * item.cantidad, 0);
  const cantidadTotal = items.reduce((suma, item) => suma + item.cantidad, 0);

  return {
    items,
    agregar,
    quitarUno,
    vaciar,
    actualizarPrecios,
    total,
    /** Cuánto se descontó en total (0 si nada tiene descuento). */
    ahorro: totalSinDescuento - total,
    cantidadTotal,
  };
}
