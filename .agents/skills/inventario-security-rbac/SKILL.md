---
name: inventario-security-rbac
description: >-
  Guía de arquitectura de seguridad, roles, matriz de permisos granulares,
  autenticación JWT y auditoría de eventos en Inventario Pro.
---

# Seguridad y Control de Acceso Granular (RBAC): Inventario Pro

Este documento describe la arquitectura de seguridad, la estructura de la matriz de permisos y los estándares de auditoría implementados en el sistema **Inventario Pro**.

---

## 🛡️ 1. Arquitectura de Roles y Permisos Granulares

El sistema implementa un modelo de control de acceso basado en roles (RBAC) con soporte para personalización de permisos por usuario individual:

```text
[ Usuario ] ──> [ Rol Base (Admin, Supervisor, Almacenista, Auditor) ]
      │
      └──> [ Sobrescritura de Permisos Granulares (users.permissions) ]
```

### Roles Predefinidos del Sistema:

1. **Administrador (`admin`)**:
   - Acceso total sin restricciones a todos los módulos y acciones del sistema (`isAdmin === true`).
2. **Supervisor**:
   - Gestión operativa completa de productos, movimientos, tomas de inventario y reportes financieros (sin acceso al módulo de seguridad).
3. **Almacenista**:
   - Captura y edición de entradas/salidas y toma de inventario físico.
4. **Auditor**:
   - Consulta y verificación de movimientos, existencias, bitácora de auditoría (`system_logs`) y sesiones activas, en modo de solo lectura y exportación.

---

## 🗂️ 2. Matriz de Permisos por Módulo

Cada usuario o rol almacena un objeto JSON estructurado con las siguientes acciones por submódulo:

| Clave de Módulo | Acciones Soportadas | Descripción |
| :--- | :--- | :--- |
| `dashboard` | `view` | Panel principal de indicadores. |
| `products` | `view`, `create`, `edit`, `delete`, `export` | Catálogo de productos y precios. |
| `inventory-count` | `view`, `create`, `edit`, `delete`, `export` | Conteo físico y ajustes de stock. |
| `movements` | `view`, `create`, `edit`, `delete`, `export` | Entradas y salidas de almacén. |
| `insurance` | `view`, `export` | Corte de Seguro y pólizas. |
| `summary` | `view`, `export` | Resumen detallado de saldos. |
| `summary2` | `view`, `export` | Resumen de volumen diario. |
| `security-users` | `view`, `create`, `edit`, `delete`, `export` | Gestión de cuentas de usuario. |
| `security-access` | `view`, `edit` | Configuración de matriz de permisos por usuario. |
| `security-roles` | `view`, `create`, `edit`, `delete` | Configuración de perfiles y roles. |
| `security-logs` | `view`, `export` | Consulta de bitácora inmutable. |
| `security-sessions` | `view`, `delete` | Monitor de sesiones activas y cierre remoto. |
| `security-changelog` | `view`, `create`, `delete` | Historial de versiones y cambios. |
| `security-notifications` | `view`, `create`, `delete` | Emisión y lectura de alertas globales. |
| `security-manual` | `view` | Manual de usuario integrado. |
| `settings` | `view`, `edit` | Nombre de empresa, branding y logotipo. |

---

## 💻 3. Uso en el Frontend (`InventoryContext.jsx`)

Para proteger vistas y botones de acción en la interfaz React, utiliza los helpers expuestos por [`InventoryContext.jsx`](file:///c:/Proyectos%20IA/INVENTARIO/inventario/src/context/InventoryContext.jsx):

```jsx
import { useInventory } from '../../context/InventoryContext';

function MiComponente() {
  const { canView, canCreate, canEdit, canDelete, canExport, isAdmin } = useInventory();

  if (!canView('products')) {
    return <UnauthorizedView />;
  }

  return (
    <div>
      {(isAdmin || canCreate('products')) && (
        <button onClick={handleCreateProduct}>Nuevo Producto</button>
      )}
      {(isAdmin || canExport('products')) && (
        <button onClick={handleExportExcel}>Exportar Excel</button>
      )}
    </div>
  );
}
```

---

## 📜 4. Estándar de Auditoría (`system_logs`)

Cualquier cambio de estado sensible debe registrarse en la tabla `system_logs`:

```javascript
await pool.query(
  `INSERT INTO system_logs (id, userId, username, action, module, details, ip_address) 
   VALUES (?, ?, ?, ?, ?, ?, ?)`,
  [
    randomUUID(),
    req.user?.id || null,
    req.user?.username || 'Sistema',
    'EDIT_PRODUCT', // Acción en mayúsculas
    'products',     // Módulo estándar
    `Producto modificado: SKU ${sku}`,
    req.ip || '127.0.0.1'
  ]
);
```

---

## 🔐 5. Autenticación y Cifrado

- **Hasheo de Contraseñas**: Se utiliza `bcrypt` con 10 rondas de salt.
- **Tokens de Sesión**: JWT firmado con `JWT_SECRET`, incluyendo expiración y validación en [`api/middleware/auth.js`](file:///c:/Proyectos%20IA/INVENTARIO/inventario/api/middleware/auth.js).
- **Sesiones Activas**: Se registra el inicio de sesión en `active_sessions` para permitir al administrador revocar accesos en tiempo real.
