// Master list of all screens and modules in the system
export const SYSTEM_MODULES = [
  // 1. Operaciones
  {
    id: 'dashboard',
    name: 'Dashboard Principal',
    group: 'Operaciones',
    desc: 'Métricas, KPIs y accesos rápidos',
    actions: ['view']
  },
  {
    id: 'products',
    name: 'Catálogo de Productos',
    group: 'Operaciones',
    desc: 'Existencias, precios, categorías y SKU',
    actions: ['view', 'create', 'edit', 'delete']
  },
  {
    id: 'inventory-count',
    name: 'Toma de Inventario',
    group: 'Operaciones',
    desc: 'Conteo físico y ajustes transaccionales',
    actions: ['view', 'create', 'edit', 'delete']
  },
  {
    id: 'movements',
    name: 'Movimientos de Almacén',
    group: 'Operaciones',
    desc: 'Entradas, salidas, transporte y remisiones',
    actions: ['view', 'create', 'edit', 'delete']
  },

  // 2. Reportes
  {
    id: 'insurance',
    name: 'Corte de Seguro',
    group: 'Reportes',
    desc: 'Reporte valorizado de póliza asegurada',
    actions: ['view']
  },
  {
    id: 'summary',
    name: 'Resumen Detallado',
    group: 'Reportes',
    desc: 'Kardex consolidado de existencias y flujo',
    actions: ['view']
  },
  {
    id: 'summary2',
    name: 'Resumen Diario',
    group: 'Reportes',
    desc: 'Volumen diario y operaciones de almacén',
    actions: ['view']
  },

  // 3. Seguridad
  {
    id: 'security-users',
    name: 'Usuarios del Sistema',
    group: 'Seguridad',
    desc: 'Crear, editar, desactivar y resetear usuarios',
    actions: ['view', 'create', 'edit', 'delete']
  },
  {
    id: 'security-access',
    name: 'Accesos y Permisos',
    group: 'Seguridad',
    desc: 'Matriz granular de permisos por usuario',
    actions: ['view', 'edit']
  },
  {
    id: 'security-roles',
    name: 'Roles del Sistema',
    group: 'Seguridad',
    desc: 'Definición de roles y perfiles de acceso',
    actions: ['view', 'create', 'edit', 'delete']
  },
  {
    id: 'security-logs',
    name: 'Bitácora del Sistema',
    group: 'Seguridad',
    desc: 'Auditoría y registro de actividad en tiempo real',
    actions: ['view']
  },
  {
    id: 'security-sessions',
    name: 'Usuarios Conectados',
    group: 'Seguridad',
    desc: 'Monitor de sesiones activas y desconexión remota',
    actions: ['view', 'delete']
  },
  {
    id: 'security-changelog',
    name: 'Historial de Cambios',
    group: 'Seguridad',
    desc: 'Registro de versiones del sistema y mejoras',
    actions: ['view', 'create', 'delete']
  },
  {
    id: 'security-notifications',
    name: 'Bandeja de Notificaciones',
    group: 'Seguridad',
    desc: 'Alertas y notificaciones internas del sistema',
    actions: ['view', 'create', 'delete']
  },
  {
    id: 'security-manual',
    name: 'Manual de Usuario',
    group: 'Seguridad',
    desc: 'Guía operativa de uso y documentación',
    actions: ['view']
  },

  // 4. Configuración
  {
    id: 'settings',
    name: 'Configuración del Sistema',
    group: 'Configuración',
    desc: 'Personalización, temas, categorías y documentos',
    actions: ['view', 'edit']
  }
];

export const GROUPS_ORDER = ['Operaciones', 'Reportes', 'Seguridad', 'Configuración'];
