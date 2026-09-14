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

export type MetodoPago = 'EFECTIVO' | 'TRANSFERENCIA' | 'LIBRANZA';

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

/**
 * Usuario autenticado en la sesión actual. Subconjunto de Usuario — solo lo
 * que la UI necesita una vez hizo login.
 */
export interface UsuarioSesion {
  id: string;
  nombre: string;
  rol: Rol;
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
  categoria: string | null;
  esLicor: boolean;
  esPerecedero: boolean;
  precio: Pesos;
  costo: Pesos | null;
  unidadEmpaque: number;
  fotoUri: string | null;
  activo: boolean;
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

export interface Venta {
  id: string;
  numeroRecibo: string;
  promotorId: string;
  promotorNombre: string;
  tsCliente: string;
  metodoPago: MetodoPago;
  total: Pesos;
}

export interface VentaItem {
  productoId: string;
  productoNombre: string;
  cantidad: number;
  precioUnitario: Pesos;
}
