---
name: inventario-domain-guide
description: >-
  Guía de reglas de negocio, cálculo de existencias multi-unidad (unidades, libras, cestas),
  toma física de inventario, trazabilidad de movimientos y reportes financieros en Inventario Pro.
---

# Guía del Dominio de Negocio: Inventario Pro

Este documento detalla las especificaciones de negocio, fórmulas de cálculo y flujos operativos para el manejo de inventario en almacenes de perecederos y secos.

---

## 📦 1. Modelo de Triple Unidad de Existencias

Cada producto registrado en el sistema mantiene tres métricas de inventario concurrentes e independientes:

| Dimensión | Campo en BD | Tipo de Dato | Propósito |
| :--- | :--- | :--- | :--- |
| **Unidades** | `stockUnits` | `INT DEFAULT 0` | Cantidad entera de cajas, bultos o piezas individuales. |
| **Libras** | `stockPounds` | `DECIMAL(15,3)` | Peso neto con precisión de hasta 3 decimales (esencial para perecederos y productos a granel). |
| **Cestas** | `stockBaskets` | `INT DEFAULT 0` | Cantidad de contenedores físicos, tarimas o recipientes retornables. |

### Reglas de Integridad:
- **No se permite redondeo truncado** en el peso en libras; debe conservarse la precisión `DECIMAL(15,3)`.
- Si un producto pertenece a una categoría sin peso continuo (ej. Abarrotes en piezas), el campo `stockPounds` puede ser `0.000` pero no debe ser `NULL`.

---

## 🚚 2. Flujo de Movimientos (Entradas y Salidas)

El módulo de movimientos [`Movements/`](file:///c:/Proyectos%20IA/INVENTARIO/inventario/src/components/Movements/) registra los flujos de mercancía entrante y saliente.

### Datos del Embarque y Trazabilidad:
- **Tipo de Movimiento**: `in` (Recepción de proveedor) o `out` (Despacho a cliente).
- **Transporte y Custodia**:
  - `carrier`: Nombre de la empresa transportista.
  - `equipment`: Placa o número de camión/remolque.
  - `seal`: Número de precinto/sello de seguridad.
- **Documentación de Referencia**:
  - `refType`: Tipo de documento (Factura, Remisión, Orden de Compra).
  - `refNumber`: Folio o número de guía.
- **Cadena de Frío**:
  - Cada partida (`movement_items`) incluye el campo `temperature` (`DECIMAL(5,2)` en °C o °F) para asegurar el cumplimiento de la cadena de frío.
- **Servicios Adicionales**:
  - Partidas anexas en la tabla `services` para facturar conceptos de maniobras, emplaye, flete o enfriamiento especial.

---

## 📋 3. Toma de Inventario y Cuadre Físico

El módulo [`InventoryCount.jsx`](file:///c:/Proyectos%20IA/INVENTARIO/inventario/src/components/Inventory/InventoryCount.jsx) permite conciliar el stock físico contra el stock del sistema:

1. **Captura Física**: El auditor ingresa las cantidades contadas (`countedUnits`, `countedPounds`, `countedBaskets`).
2. **Cálculo de Diferencias en Tiempo Real**:
   $$\Delta \text{Unidades} = \text{Contadas} - \text{Sistema}$$
   $$\Delta \text{Libras} = \text{Contadas} - \text{Sistema}$$
   $$\Delta \text{Cestas} = \text{Contadas} - \text{Sistema}$$
3. **Justificación Obligatoria**: Si existe alguna diferencia ($\Delta \neq 0$), es mandatorio registrar el motivo (`reason`), ej. "Merma por descomposición", "Rotura de empaque", "Reconteo físico".
4. **Transacción Atómica**:
   - Se crea un registro en `inventory_adjustments` con los valores previos, contados, motivo y `auditUser`.
   - Se actualizan las existencias en la tabla `products`.
   - Se genera una entrada en `system_logs`.

---

## 📊 4. Reportes Financieros y de Control

### A. Corte de Seguro ([`InsuranceReport.jsx`](file:///c:/Proyectos%20IA/INVENTARIO/inventario/src/components/Insurance/InsuranceReport.jsx))
- **Objetivo**: Determinar el valor total asegurable de las existencias en almacén.
- **Fórmula de Valoración**:
  $$\text{Valor Total} = \sum (\text{stockPounds} \times \text{precio}) \quad \text{o} \quad \sum (\text{stockUnits} \times \text{precio})$$
- **Filtro Automático**: Excluye automáticamente ítems con existencias en cero o sin precio asignado para generar un reporte limpio para aseguradoras.

### B. Resumen Detallado ([`Summary.jsx`](file:///c:/Proyectos%20IA/INVENTARIO/inventario/src/components/Summary/Summary.jsx))
- Conciliación por SKU en un rango de fechas:
  $$\text{Saldo Final} = \text{Saldo Inicial} + \sum \text{Entradas} - \sum \text{Salidas}$$

### C. Resumen Diario ([`Summary2.jsx`](file:///c:/Proyectos%20IA/INVENTARIO/inventario/src/components/Summary/Summary2.jsx))
- Matriz diaria de volumen de operaciones para supervisores de turno y directores de operaciones.
