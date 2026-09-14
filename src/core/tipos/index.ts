// Tipos de dominio puros. Sin imports de React ni Expo — ver CLAUDE.md sección 6.

export type Rol = 'PROMOTOR' | 'CONDUCTOR' | 'BODEGA' | 'ADMIN';

export type TipoUbicacion = 'BODEGA' | 'CAMION' | 'PROMOTOR';

export type TipoMovimiento =
  | 'COMPRA_PROVEEDOR'
  | 'RECARGA'
  | 'VENTA'
  | 'TRASLADO'
  | 'RETIRO_ADMIN'
  | 'AJUSTE_CONTEO'
  | 'AVERIA'
  | 'DEGUSTACION'
  | 'OBSEQUIO'
  | 'DEVOLUCION_VENCIMIENTO';

export type EstadoEvento = 'PLANEADO' | 'EN_CURSO' | 'CERRADO';

export type EstadoConteo = 'ABIERTO' | 'PENDIENTE_APROBACION' | 'CERRADO';

export type MetodoPago = 'EFECTIVO' | 'NEQUI' | 'DAVIPLATA' | 'DATAFONO';

/**
 * Pesos colombianos, siempre entero. Nunca float — ver CLAUDE.md sección 8.
 */
export type Pesos = number;

export interface Usuario {
  id: string;
  nombre: string;
  rol: Rol;
  activo: boolean;
}

export interface Ubicacion {
  id: string;
  tipo: TipoUbicacion;
  nombre: string;
  responsableId: string | null;
}

export interface Producto {
  id: string;
  sku: string;
  codigoBarras: string | null;
  nombre: string;
  categoria: string;
  esLicor: boolean;
  esPerecedero: boolean;
  precio: Pesos;
  costo: Pesos;
  unidadEmpaque: number;
}

export interface Movimiento {
  id: string;
  tipo: TipoMovimiento;
  productoId: string;
  loteId: string | null;
  cantidad: number;
  ubicacionOrigenId: string | null;
  ubicacionDestinoId: string | null;
  eventoId: string | null;
  usuarioId: string;
  motivo: string | null;
  tsCliente: string;
  dispositivoId: string;
}
