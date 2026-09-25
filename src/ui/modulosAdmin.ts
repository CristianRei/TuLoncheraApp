import type Ionicons from '@expo/vector-icons/Ionicons';

export type NombreIconoAdmin = keyof typeof Ionicons.glyphMap;

export interface ModuloAdmin {
  ruta: string;
  titulo: string;
  descripcion: string;
  icono: NombreIconoAdmin;
  badge?: string;
  destacada?: boolean;
  soloPantallaAncha?: boolean;
}

/**
 * Los módulos reales de administración — única fuente de verdad, usada
 * por el menú principal (app/admin/index.tsx) y por el sidebar fijo de
 * pantalla ancha (src/ui/SidebarAdmin.tsx). Agregar un módulo nuevo aquí
 * lo agrega automáticamente en ambos lugares.
 */
export const MODULOS_ADMIN: ModuloAdmin[] = [
  {
    ruta: '/admin/dashboard',
    titulo: 'Dashboard',
    descripcion: 'Ventas, productos top y saldo de bodega.',
    icono: 'bar-chart-outline',
    badge: 'Métricas clave',
    destacada: true,
  },
  {
    ruta: '/admin/calendario',
    titulo: 'Calendario de eventos',
    descripcion: 'Planear qué promotor va a cada empresa y punto, día a día.',
    icono: 'calendar-outline',
  },
  {
    ruta: '/admin/cargue',
    titulo: 'Cargue a promotor',
    descripcion: 'Asignar productos del stock de bodega a un promotor.',
    icono: 'swap-horizontal-outline',
  },
  {
    ruta: '/admin/turnos',
    titulo: 'Turnos',
    descripcion: 'Selfie, hora y ubicación de inicio/fin de turno de cada promotor.',
    icono: 'time-outline',
  },
  {
    ruta: '/admin/ventas',
    titulo: 'Ventas',
    descripcion: 'Ver las ventas registradas por los promotores.',
    icono: 'checkmark-done-outline',
  },
  {
    ruta: '/admin/conteos',
    titulo: 'Conteos de cierre',
    descripcion: 'Ver los conteos de cierre de los promotores y sus descuadres.',
    icono: 'clipboard-outline',
    badge: 'Auditoría',
  },
  {
    ruta: '/admin/inventario',
    titulo: 'Inventario',
    descripcion: 'Ver el stock de bodega e ingresar pedidos.',
    icono: 'cube-outline',
  },
  {
    ruta: '/admin/catalogo',
    titulo: 'Catálogo de productos',
    descripcion: 'Agregar, editar y eliminar productos y precios.',
    icono: 'pricetags-outline',
  },
  {
    ruta: '/admin/empresas',
    titulo: 'Empresas y puntos',
    descripcion: 'Clientes y sus sedes (ej. Falabella Norte, Falabella Sur).',
    icono: 'business-outline',
  },
  {
    ruta: '/admin/clientes',
    titulo: 'Clientes',
    descripcion: 'Clientes finales registrados por los promotores en campo.',
    icono: 'people-outline',
  },
  {
    ruta: '/admin/descuentos',
    titulo: 'Descuentos',
    descripcion: 'Crear y ver descuentos por producto y/o punto, con vigencia.',
    icono: 'pricetag-outline',
  },
  {
    ruta: '/admin/analisis',
    titulo: 'Análisis',
    descripcion: 'Qué se repite por punto, cómo rinde cada promotor, y qué cruces valen la pena.',
    icono: 'analytics-outline',
    soloPantallaAncha: true,
  },
  {
    ruta: '/admin/notificaciones',
    titulo: 'Notificaciones',
    descripcion: 'Alertas del sistema (stock bajo, lotes por vencer) y mensajes a promotores o bodega.',
    icono: 'notifications-outline',
  },
  {
    ruta: '/admin/auditoria',
    titulo: 'Bitácora y auditoría',
    descripcion: 'Quién hizo qué: personal, clientes, categorías, eventos y accesos.',
    icono: 'document-text-outline',
  },
  {
    ruta: '/admin/personal',
    titulo: 'Gestionar personal',
    descripcion: 'Contratar, editar y dar de baja promotores, conductores, bodega y administradores.',
    icono: 'people-outline',
  },
];
