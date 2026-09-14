import { useState } from 'react';

import type { Pesos } from '@/core/tipos';

export interface ItemCarrito {
  productoId: string;
  nombre: string;
  precio: Pesos;
  fotoUri: string | null;
  cantidad: number;
}

interface ProductoParaAgregar {
  id: string;
  nombre: string;
  precio: Pesos;
  fotoUri: string | null;
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

  const total = items.reduce((suma, item) => suma + item.precio * item.cantidad, 0);
  const cantidadTotal = items.reduce((suma, item) => suma + item.cantidad, 0);

  return { items, agregar, quitarUno, vaciar, total, cantidadTotal };
}
