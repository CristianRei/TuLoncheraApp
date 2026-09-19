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
  | 'DEVOLUCION_VENCIMIENTO'
  | 'ANULACION_VENTA';

export type EstadoEvento = 'PLANEADO' | 'EN_CURSO' | 'CERRADO';

export type EstadoConteo = 'ABIERTO' | 'PENDIENTE_APROBACION' | 'CERRADO';

export type MetodoPago = 'EFECTIVO' | 'TRANSFERENCIA' | 'LIBRANZA';

/**
 * Modo de la pantalla de login. Ver docs/03-decisiones/0001-metodo-autenticacion.md:
 * un solo campo de PIN, acotado por rol a través del modo elegido.
 */
export type ModoLogin = 'PROMOTOR' | 'ADMIN' | 'BODEGA';

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
  anulada: boolean;
  motivoAnulacion: string | null;
}

export interface VentaItem {
  productoId: string;
  productoNombre: string;
  cantidad: number;
  precioUnitario: Pesos;
}

/**
 * Estado del backoff/bloqueo de PIN para una combinación dispositivo+modo,
 * a mostrar en la pantalla de login.
 */
export type EstadoIntentosPin =
  | { estado: 'NORMAL' }
  | { estado: 'ESPERANDO'; segundosRestantes: number }
  | { estado: 'BLOQUEADO' };

/** Fila agregada para el panel de admin: una combinación dispositivo+modo. */
export interface ResumenIntentosPin {
  dispositivoId: string;
  modo: ModoLogin;
  fallosConsecutivos: number;
  bloqueado: boolean;
  ultimoIntentoTs: string | null;
}
