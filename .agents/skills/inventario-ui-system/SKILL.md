---
name: inventario-ui-system
description: >-
  Estándares del Sistema de Diseño Stitch y Windows 11 Fluent Mica: variables CSS, modales con Frosted Glass,
  micro-tarjetas KPI, diseño responsivo y convenciones visuales en Inventario Pro.
---

# Sistema de Diseño y Guía de Componentes UI: Inventario Pro

Este documento define las pautas visuales, clases de utilidad y estándares de maquetación que cualquier programador o agente de IA debe emplear para preservar la consistencia gráfica del sistema.

---

## 🎨 1. Paleta de Colores y Tokens Principales

El sistema utiliza variables CSS centralizadas en [`src/index.css`](file:///c:/Proyectos%20IA/INVENTARIO/inventario/src/index.css) con soporte reactivo para tema claro y oscuro (`data-theme`):

| Variable CSS | Propósito | Tono Claro | Tono Oscuro |
| :--- | :--- | :--- | :--- |
| `--color-primary` | Acento institucional (Azul Rey) | `#0067c0` | `#0078d4` |
| `--color-bg` | Lienzo general de la aplicación | `#f3f3f3` | `#111827` |
| `--color-card` | Superficie elevada de tarjetas/modales | `#ffffff` | `#1f2937` |
| `--color-surface` | Contenedores intermedios y tablas | `#f9f9fb` | `#1e293b` |
| `--color-border` | Bordes sutiles y separadores | `rgba(0,0,0,0.08)` | `rgba(255,255,255,0.12)` |
| `--color-text` | Texto principal de alto contraste | `#1b1b1b` | `#f9fafb` |
| `--color-text-muted`| Subtítulos, etiquetas y placeholders | `#64748b` | `#94a3b8` |
| `--color-danger` | Acciones destructivas o alertas | `#c42b1c` | `#ef4444` |
| `--color-success` | Confirmaciones y montos monetarios | `#10b981` | `#34d399` |

---

## 🪟 2. Estándar para Ventanas Modales (Popups)

Toda ventana modal debe implementar el efecto **Frosted Glass (Mica)** nativo del sistema:

```jsx
<div className="modal-overlay" onClick={onClose} style={{ zIndex: 1200 }}>
  <div 
    className="modal-content large" 
    style={{ 
      maxWidth: '1060px', 
      width: '100%', 
      maxHeight: '92vh', 
      display: 'flex', 
      flexDirection: 'column',
      padding: 0,
      overflow: 'hidden'
    }}
    onClick={(e) => e.stopPropagation()}
  >
    {/* 1. Header con isotipo en gradiente */}
    <div className="modal-header">...</div>

    {/* 2. Cuerpo desplazable */}
    <div style={{ flex: 1, overflowY: 'auto', padding: '1rem 1.75rem' }}>...</div>

    {/* 3. Footer fijo */}
    <div className="modal-footer">...</div>
  </div>
</div>
```

### Reglas Clave:
- Usar siempre `.modal-overlay` (aplica `backdrop-filter: blur(8px)` y fondo semitransparente).
- Usar siempre `.modal-content` (aplica `box-shadow: var(--shadow-lg)` y animación suave `modalPop`).
- Soporte para cierre con la tecla **Escape** y clic en el backdrop.

---

## 📊 3. Micro-Tarjetas de Métricas KPI

Para encabezados de resúmenes, auditorías o dashboards:
- Contenedor con `display: grid; grid-template-columns: repeat(auto-fit, minmax(210px, 1fr)); gap: 0.85rem;`.
- Cada tarjeta contiene:
  - Icono dentro de un contenedor redondeado con fondo transparente (`rgba(..., 0.12)`).
  - Etiqueta en mayúsculas pequeñas (`font-size: 0.7rem`, `font-weight: 600`, `letter-spacing: 0.04em`).
  - Número destacado con `font-family: var(--font-headline)` y `font-weight: 800`.

---

## 🏷️ 4. Píldoras de Filtro (Chips)

Para alternar estados sin recargar ni alterar rutas:
- Bordes redondeados `border-radius: 20px`.
- Estado activo con fondo de acento al 10% y borde sólido de 1px.
- Estado inactivo con fondo transparente y texto tenue (`--color-text-muted`).

---

## 📱 5. Adaptabilidad Móvil

En pantallas menores a 768px (`@media (max-width: 768px)`):
- Los modales adoptan automáticamente la forma de **Bottom Sheet** (`align-items: flex-end`, `border-radius: 20px 20px 0 0`, `max-height: 94dvh`).
- Las tablas se envuelven en `.table-container` con `overflow-x: auto`.
