// Registro cronológico maestro y automático de versiones del sistema
export const SYSTEM_CHANGELOG = [
  {
    id: 'v2.6.0',
    version: 'v2.6.0',
    description: 'Sistema de Diseño Stitch ("The Luminous Engine") y Auto-Actualizador en Tiempo Real',
    author: 'Ing. Raúl Sosa',
    date: '2026-08-18',
    time: '22:30',
    isOfficial: true,
    changes: [
      {
        type: 'feature',
        text: 'Sistema de Diseño Stitch: Renovación visual completa con tipografía Space Grotesk, arquitectura tonal sin líneas duras y centro de control con dial circular luminoso.'
      },
      {
        type: 'feature',
        text: 'Cápsula de Versión en Footer: Nuevo badge interactivo con numeración auto-incrementable por commit y enlace directo a novedades.'
      },
      {
        type: 'feature',
        text: 'Auto-Actualizador en Tiempo Real: Detección inteligente de nuevos commits en segundo plano con notificación Toast para actualizar con un solo clic.'
      },
      {
        type: 'fix',
        text: 'Desplazamiento en Móviles: Corrección de scroll vertical fluido en pantallas pequeñas y dispositivos móviles.'
      }
    ]
  },
  {
    id: 'v2.5.1',
    version: 'v2.5.1',
    description: 'Selector de Calendario Visual y Atajos de Fecha en Resumen Diario',
    author: 'Ing. Raúl Sosa',
    date: '2026-08-18',
    time: '20:10',
    isOfficial: true,
    changes: [
      {
        type: 'feature',
        text: 'Resumen Diario y Reportes: Incorporación de calendario visual interactivo desplegable para seleccionar Fecha Inicio y Fecha Fin con un solo clic.'
      },
      {
        type: 'feature',
        text: 'Atajos Rápidos de Rango: Botones directos para seleccionar automáticamente Mes Actual, Mes Anterior, Últimos 7 Días, Últimos 30 Días, Esta Semana y Hoy.'
      },
      {
        type: 'improvement',
        text: 'Sincronización automática de rangos de fecha y contador visual de días seleccionados para evitar errores de digitación.'
      }
    ]
  },
  {
    id: 'v2.5.0',
    version: 'v2.5.0',
    description: 'Control Granular de Exportación y Optimización de Rendimiento',
    author: 'Ing. Raúl Sosa',
    date: '2026-08-18',
    time: '15:10',
    isOfficial: true,
    changes: [
      {
        type: 'security',
        text: 'Matriz de Accesos: Añadida columna de control para habilitar o deshabilitar la Descarga / Exportación de archivos (Excel, CSV, PDF) por rol o usuario específico.'
      },
      {
        type: 'improvement',
        text: 'Ocultamiento y protección automática de botones de exportación en todas las pantallas si el usuario no tiene los permisos otorgados.'
      },
      {
        type: 'fix',
        text: 'Optimización crítica de red: Eliminado ciclo de dependencias en React que disparaba peticiones infinitas en segundo plano.'
      },
      {
        type: 'fix',
        text: 'Corrección de excepción en exportación de Excel al calcular totales y manipulación segura de objetos Blob en navegadores modernos.'
      },
      {
        type: 'feature',
        text: 'Historial de versiones y cambios automático: Integración de bitácora de versiones auto-cargada con novedades del sistema.'
      }
    ]
  },
  {
    id: 'v2.4.0',
    version: 'v2.4.0',
    description: 'Liquidación Cuarto Frío San Martín y Contrato 2025-2026',
    author: 'Ing. Raúl Sosa',
    date: '2026-08-18',
    time: '12:30',
    isOfficial: true,
    changes: [
      {
        type: 'feature',
        text: 'Módulo de Cuadro Cliente Cuarto Frío (Resumen Diario): Formato idéntico al cuadro oficial de liquidación de almacenamiento congelado (-18°C).'
      },
      {
        type: 'feature',
        text: 'Motor de cobros contractuales 2025-2026: Tarifa de almacenamiento de $0.001/lb, cestas a $0.038/cesta, maniobras de rastra ($54/$95), camiones ($30/$60) y recargo por horas extras.'
      },
      {
        type: 'feature',
        text: 'Escala de penalización automática por temperatura en recepción (-13°C a +6°C) según cláusulas contractuales de Avícola Salvadoreña.'
      },
      {
        type: 'improvement',
        text: 'Exportación a Microsoft Excel nativo (.xlsx) y CSV con enunciados institucionales, subtotales, IVA (13%) y liquidación final.'
      }
    ]
  },
  {
    id: 'v2.3.0',
    version: 'v2.3.0',
    description: 'Módulo de Corte de Seguro y Póliza de Mercaderías',
    author: 'Ing. Raúl Sosa',
    date: '2026-08-17',
    time: '18:00',
    isOfficial: true,
    changes: [
      {
        type: 'feature',
        text: 'Corte de Seguro: Cálculo automatizado de valor CIF asegurado y prima al 0.10% para Almacenadora Lil y clientes depositantes.'
      },
      {
        type: 'improvement',
        text: 'Generación y exportación de cartas y reportes de póliza en formatos Excel, CSV y PDF oficial.'
      }
    ]
  },
  {
    id: 'v2.2.0',
    version: 'v2.2.0',
    description: 'Seguridad Integral, Matriz RBAC y Auditoría en Tiempo Real',
    author: 'Sistema',
    date: '2026-08-16',
    time: '14:20',
    isOfficial: true,
    changes: [
      {
        type: 'security',
        text: 'Control de Acceso Basado en Roles (RBAC): Matriz de permisos con privilegios independientes de Ver, Crear, Editar y Eliminar por módulo.'
      },
      {
        type: 'feature',
        text: 'Monitor de Usuarios Conectados: Seguimiento de sesiones activas en tiempo real con capacidad de desconexión remota por Administrador.'
      },
      {
        type: 'feature',
        text: 'Bitácora y Auditoría del Sistema: Registro cronológico inmutable de logins, creaciones, modificaciones y eliminaciones.'
      }
    ]
  },
  {
    id: 'v2.1.0',
    version: 'v2.1.0',
    description: 'Toma de Inventario Físico y Ajustes Transaccionales',
    author: 'Sistema',
    date: '2026-08-15',
    time: '10:00',
    isOfficial: true,
    changes: [
      {
        type: 'feature',
        text: 'Módulo de Toma de Inventario (Conteo Ciego): Registro de existencias físicas en piso versus existencias teóricas del sistema.'
      },
      {
        type: 'improvement',
        text: 'Generación automática de ajustes de inventario con bitácora de justificación y conciliación contable.'
      }
    ]
  },
  {
    id: 'v2.0.0',
    version: 'v2.0.0',
    description: 'Arquitectura Cloud MySQL y Soporte PWA Multi-dispositivo',
    author: 'Sistema',
    date: '2026-08-10',
    time: '08:00',
    isOfficial: true,
    changes: [
      {
        type: 'improvement',
        text: 'Migración a base de datos centralizada MySQL con alta disponibilidad y concurrencia multi-usuario.'
      },
      {
        type: 'feature',
        text: 'Aplicación Web Progresiva (PWA): Instalación nativa en PC, tablets y móviles con Service Worker y caché inteligente.'
      }
    ]
  },
  {
    id: 'v1.0.0',
    version: 'v1.0.0',
    description: 'Lanzamiento Inicial del Sistema de Control de Inventario',
    author: 'Sistema',
    date: '2026-08-01',
    time: '08:00',
    isOfficial: true,
    changes: [
      {
        type: 'feature',
        text: 'Catálogo maestro de productos con soporte para Libras, Cestas y Unidades.'
      },
      {
        type: 'feature',
        text: 'Registro de movimientos de entrada y salida con transportistas, marchamos y placas.'
      },
      {
        type: 'feature',
        text: 'Dashboard con indicadores clave de existencias y valorización total.'
      }
    ]
  }
];
