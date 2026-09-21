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

export type EstadoEvento = 'PLANEADO' | 'EN_CURSO' | 'CERRADO' | 'CANCELADO';

export type Frecuencia = 'DIAS' | 'SEMANAS' | 'MESES' | 'ANIOS';

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
  marca: string | null;
  esLicor: boolean;
  esPerecedero: boolean;
  precio: Pesos;
  costo: Pesos | null;
  unidadEmpaque: number;
  fotoUri: string | null;
  activo: boolean;
}

export interface Empresa {
  id: string;
  nombre: string;
  direccion: string | null;
  sector: string | null;
  contacto: string | null;
}

export interface Punto {
  id: string;
  empresaId: string;
  empresaNombre: string;
  nombre: string;
  direccion: string | null;
  activo: boolean;
}

export interface Evento {
  id: string;
  empresaId: string;
  empresaNombre: string;
  puntoId: string;
  puntoNombre: string;
  fecha: string;
  promotorIds: string[];
  promotorNombres: string[];
  estado: EstadoEvento;
  motivoCancelacion: string | null;
  serieId: string | null;
}

export interface SerieRecurrencia {
  id: string;
  frecuencia: Frecuencia;
  intervalo: number;
  fechaDesde: string;
  fechaHasta: string;
}

export interface Turno {
  id: string;
  promotorId: string;
  promotorNombre: string;
  selfieUri: string;
  latitud: number | null;
  longitud: number | null;
  horaInicio: string;
  horaFin: string | null;
}

export type TipoDescuento = 'PORCENTAJE' | 'MONTO_FIJO';

export interface Descuento {
  id: string;
  productoId: string | null;
  productoNombre: string | null;
  puntoId: string | null;
  puntoNombre: string | null;
  tipo: TipoDescuento;
  valor: number;
  desde: string;
  hasta: string;
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
  puntoId: string | null;
  puntoNombre: string | null;
  tsCliente: string;
  metodoPago: MetodoPago;
  total: Pesos;
  anulada: boolean;
  motivoAnulacion: string | null;
  comprobanteUri: string | null;
}

export interface VentaItem {
  productoId: string;
  productoNombre: string;
  cantidad: number;
  precioUnitario: Pesos;
}

export interface Conteo {
  id: string;
  promotorId: string;
  promotorNombre: string;
  tsCliente: string;
  estado: EstadoConteo;
}

export interface ConteoLinea {
  productoId: string;
  productoNombre: string;
  teorico: number;
  contado: number;
  diferencia: number;
  motivo: string | null;
}

export type EstadoCargue = 'PLANEADO' | 'ENTREGADO' | 'CANCELADO';
export type EstadoLineaCargue = 'PENDIENTE' | 'ENTREGADA' | 'REVISAR';

export interface Cargue {
  id: string;
  promotorId: string;
  promotorNombre: string;
  estado: EstadoCargue;
  tsCliente: string;
}

export interface CargueLinea {
  id: string;
  productoId: string;
  productoNombre: string;
  cantidadPlaneada: number;
  cantidadEntregada: number;
  estado: EstadoLineaCargue;
  motivoRevision: string | null;
}

export type TipoNotificacion = 'STOCK_BAJO' | 'LOTE_POR_VENCER';
export type NivelNotificacion = 'INFO' | 'ALERTA' | 'CRITICO';

export interface Notificacion {
  id: string;
  tipo: TipoNotificacion;
  nivel: NivelNotificacion;
  titulo: string;
  detalle: string;
  productoId: string | null;
  loteId: string | null;
  leida: boolean;
  tsCliente: string;
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
