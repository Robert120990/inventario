# Reglas de Proyecto y Guía de Arquitectura: Inventario Pro

Este documento define la visión del producto, las reglas de arquitectura, las directrices de codificación y los estándares de negocio para cualquier programador o agente de inteligencia artificial que trabaje en el proyecto **Inventario Pro**.

---

## 📌 1. Visión y Propósito del Proyecto

**Inventario Pro** es un sistema integral de gestión de almacén e inventarios especializado en productos perecederos, secos y de cadena de frío.

### Objetivos Clave:
1. **Control de Existencias Multi-Unidad**: Seguimiento simultáneo y atómico de tres dimensiones físicas por producto:
   - **Unidades / Bultos**: Conteo entero de cajas o piezas físicas (`stockUnits`).
   - **Libras / Peso Neto**: Control de peso continuo (`stockPounds`, `DECIMAL(15,3)`).
   - **Cestas / Tarimas**: Control de contenedores y embalajes físicos reutilizables (`stockBaskets`).
2. **Trazabilidad Total de Movimientos**:
   - Entradas (`in`) y Salidas (`out`) con registro de transportista, número de sello/precinto, equipo y documento de referencia.
   - Monitoreo de temperatura por producto para control de calidad en cadena de frío.
   - Registro de servicios adicionales facturables (maniobras, emplaye, refrigeración, flete).
3. **Toma de Inventario Física y Cuadre**:
   - Módulo de reconteo físico con cálculo inmediato de discrepancias.
   - Ajustes atómicos en base de datos (`inventory_adjustments`) con justificación obligatoria y registro del auditor.
4. **Reportes Financieros y de Control**:
   - **Corte de Seguro**: Valoración monetaria del inventario activo para pólizas.
   - **Resumen 1 & Resumen 2**: Conciliación detallada (saldos iniciales, entradas, salidas y saldos finales) y flujo diario.
5. **Seguridad Integral y Control de Acceso Granular (RBAC)**:
   - Autenticación JWT + contraseñas cifradas con `bcrypt`.
   - Matriz granular de permisos (`view`, `create`, `edit`, `delete`, `export`) por submódulo.
   - Bitácora inmutable de auditoría (`system_logs`) y monitoreo de sesiones en tiempo real (`active_sessions`).

---

## 🏗️ 2. Arquitectura Tecnológica

El proyecto está estructurado como un stack moderno y reactivo:

```text
INVENTARIO/
└── inventario/
    ├── api/                     # Backend Node.js + Express
    │   ├── db.js                # Conexión MySQL2 Pool + Auto-migraciones (ensureSchema)
    │   ├── index.js             # Endpoints RESTful y lógica de negocio
    │   └── middleware/
    │       └── auth.js          # JWT verifyToken y generateToken
    ├── src/                     # Frontend React 19 + Vite 8
    │   ├── components/          # Módulos organizados por dominio
    │   │   ├── Common/          # Componentes reutilizables y notificadores
    │   │   ├── Dashboard.jsx    # Tablero principal de métricas y accesos rápidos
    │   │   ├── Products/        # Catálogo, formulario, código de barras e importación Excel
    │   │   ├── Movements/       # Entradas/Salidas, formulario térmico y reportes PDF
    │   │   ├── Inventory/       # Toma física y cuadre transaccional
    │   │   ├── Summary/         # Resumen detallado y diario
    │   │   ├── Insurance/       # Corte de Seguro
    │   │   ├── Security/        # Usuarios, Roles, Accesos, Bitácora, Sesiones, Changelog
    │   │   ├── Settings/        # Configuración general y branding
    │   │   └── Theme/           # Selector y persistencia de temas visuales
    │   ├── context/
    │   │   └── InventoryContext.jsx # Estado global, sincronización y helpers RBAC
    │   ├── config/
    │   │   └── version.json     # Metadatos de versión y compilación
    │   ├── App.jsx              # Enrutador principal y lazy loading de submódulos
    │   └── index.css            # Sistema de diseño, temas y animaciones
    └── scripts/
        ├── update-version.js    # Auto-incremento de versión semántica
        └── hash-passwords.js    # Migración de hashes de contraseñas
```

---

## 🔒 3. Principios de Seguridad y Permisos (RBAC)

1. **Nunca omitir la verificación de permisos**:
   - En el frontend, utiliza siempre las funciones del contexto: `canView(module)`, `canCreate(module)`, `canEdit(module)`, `canDelete(module)` y `canExport(module)`.
   - Si el usuario es Administrador (`isAdmin`), tiene acceso total por defecto.
2. **Auditoría Obligatoria (`system_logs`)**:
   - Cada operación destructiva o de cambio relevante (crear producto, ajuste de inventario, cambio de rol, borrado de movimiento) debe registrar un evento en `system_logs` con `userId`, `username`, `action`, `module`, `details` e `ip_address`.
3. **Manejo Seguro de Credenciales**:
   - Nunca expongas hashes o contraseñas en respuestas API para usuarios que no sean el propio administrador al cambiar credenciales.

---

## ⚖️ 4. Reglas del Dominio de Inventario

1. **Consistencia de la Triple Unidad**:
   - Cada movimiento o ajuste debe tratar las tres unidades de forma consistente:
     - `units`: Entero (`INT DEFAULT 0`).
     - `pounds`: Flotante/Decimal con 3 decimales (`DECIMAL(15,3)`).
     - `baskets`: Entero (`INT DEFAULT 0`).
2. **Atomicidad en Ajustes de Existencias**:
   - Un movimiento de entrada **suma** a las existencias del producto.
   - Un movimiento de salida **resta** a las existencias del producto.
   - Un ajuste de inventario **reemplaza** las existencias actuales y deja constancia en `inventory_adjustments`.
3. **Cálculo de Precios y Valoraciones**:
   - La valoración del inventario para seguros se calcula sobre el precio unitario vigente (`price * stockPounds` o `price * stockUnits` según la categoría/configuración).

---

## 🎨 5. Estándares de Diseño y UI

1. **Estética Moderna y Profesional**:
   - Utilizar el sistema de variables CSS (`--color-primary`, `--color-bg`, `--color-surface`, `--color-text`, etc.).
   - Soporte fluido para modo oscuro y modo claro mediante data-theme.
   - Microanimaciones suaves en transiciones de vista, botones y modales.
   - No usar bibliotecas pesadas de UI no declaradas; mantener el diseño consistente con CSS puro y componentes React limpios.

---

## 🚀 6. Flujo de Trabajo y Comandos

- **Instalación**: `npm install`
- **Desarrollo completo**: `npm run dev` (Inicia Vite en puerto 5173 + Express en puerto 3000 con concurrently).
- **Compilación de Producción**: `npm run build` (Actualiza versión automáticamente y genera bundle en `dist/`).
- **Verificación de Código**: `npm run lint`
- **Incremento de Versión**: `npm run version:update`
