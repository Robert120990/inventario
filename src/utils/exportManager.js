import * as XLSX from 'xlsx';
import { formatDate, formatCurrency } from './formatUtils.js';

/**
 * Agrega el Byte Order Mark (BOM) para que Excel abra UTF-8 con tildes y eñes sin problemas
 */
const downloadFile = (blob, filename) => {
  const link = document.createElement('a');
  if (link.download !== undefined) {
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }
};

/**
 * Exporta un libro XLSX
 */
export const downloadXLSX = (workbook, filename) => {
  const wbout = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
  const blob = new Blob([wbout], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  downloadFile(blob, filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`);
};

/**
 * Convierte un arreglo de filas de texto a CSV con BOM UTF-8 y descarga
 */
export const downloadCSV = (csvRows, filename) => {
  const csvContent = '\uFEFF' + csvRows.join('\r\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  downloadFile(blob, filename.endsWith('.csv') ? filename : `${filename}.csv`);
};

/**
 * Escapa valores para CSV
 */
export const escapeCsvCell = (val) => {
  if (val === null || val === undefined) return '';
  const str = String(val);
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r') || str.includes(';')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
};

/**
 * EXPORTADOR ESPECIALIZADO: CUADRO CLIENTE CUARTO FRÍO (Resumen Diario)
 * Reproduce fielmente la estructura del archivo de referencia "Cuadro cliente cuarto frio .xlsx"
 */
export const exportCuadroClienteCuartoFrio = ({
  clientName = 'Avícola Salvadoreña S.A. DE C.V.',
  startDate,
  endDate,
  dailyRows = [],
  extraServices = [],
  totals = {},
  format = 'xlsx' // 'xlsx' | 'csv'
}) => {
  const formattedStart = formatDate(startDate);
  const formattedEnd = formatDate(endDate);
  const title = 'PROCESO DE FACTURACION POR ALMACENAMIENTO CONGELADO(-18°) Y SERVICIOS EXTRA-ORDINARIOS';
  const subtitle = `Movimientos diarios entre: ${formattedStart} Hasta ${formattedEnd}`;

  // Totales de almacenamiento
  const totalInvInicial = dailyRows.reduce((acc, r) => acc + Number(r.stockInicial || 0), 0);
  const totalEntradas = dailyRows.reduce((acc, r) => acc + Number(r.entradas || 0), 0);
  const totalSalidas = dailyRows.reduce((acc, r) => acc + Number(r.salidas || 0), 0);
  const totalLibrasAcum = dailyRows.reduce((acc, r) => acc + Number(r.stockFinal || 0), 0);
  const totalAlmacenaje = dailyRows.reduce((acc, r) => acc + Number(r.totalMonto || 0), 0);

  // Totales de servicios
  const totalServiciosQty = extraServices.reduce((acc, s) => acc + Number(s.quantity || (s.value > 0 ? 1 : 0)), 0);
  const totalServiciosValor = extraServices.reduce((acc, s) => acc + Number(s.value || 0), 0);

  const subtotal = totals.subtotal ?? (totalAlmacenaje + totalServiciosValor);
  const iva = totals.iva ?? (subtotal * 0.13);
  const totalGeneral = totals.totalGeneral ?? (subtotal + iva);

  if (format === 'xlsx') {
    const wsData = [];
    
    // Fila 1: Espacio
    wsData.push([]);
    // Fila 2: Título principal
    wsData.push(['', title]);
    // Fila 3: Cliente
    wsData.push(['', 'Cliente:', clientName]);
    // Fila 4: Espacio
    wsData.push([]);
    // Fila 5: Rango de fechas
    wsData.push(['', 'Movimientos diarios entre:', formattedStart, 'Hasta', formattedEnd]);
    // Fila 6: Espacio
    wsData.push([]);
    // Fila 7: Encabezados de tabla de almacenamiento
    wsData.push(['', 'FECHA', 'DESCRIPCION', 'INV-INICIAL', 'ENTRADA', 'SALIDA', 'TOTAL LIBRAS', 'PRECIO', 'Total $']);

    // Filas de datos diarios
    dailyRows.forEach(row => {
      wsData.push([
        '',
        formatDate(row.fecha),
        row.descripcion || `Mantenimiento congelado (${row.categoria || 'General'})`,
        Number(row.stockInicial || 0),
        Number(row.entradas || 0),
        Number(row.salidas || 0),
        Number(row.stockFinal || 0),
        Number(row.precio || 0.001),
        Number(row.totalMonto || 0)
      ]);
    });

    // Fila de Totales de Almacenamiento
    wsData.push([
      '',
      '',
      'Totales',
      totalInvInicial,
      totalEntradas,
      totalSalidas,
      totalLibrasAcum,
      '',
      totalAlmacenaje
    ]);

    // Fila separadora
    wsData.push([]);
    // Encabezado de Servicios Extraordinarios
    wsData.push(['', 'SERVICIOS EXTRA-ORDINARIOS']);
    wsData.push(['', 'FECHA', 'DESCRIPCION', '', '', '', 'TOTAL', 'PRECIO', 'VALOR']);

    // Filas de Servicios Extraordinarios
    if (extraServices.length > 0) {
      extraServices.forEach(s => {
        wsData.push([
          '',
          formatDate(s.date),
          s.description,
          '',
          '',
          '',
          s.quantity !== undefined ? Number(s.quantity) : 1,
          s.unitPrice !== undefined ? Number(s.unitPrice) : Number(s.value || 0),
          Number(s.value || 0)
        ]);
      });
    } else {
      wsData.push(['', 'Sin servicios extraordinarios en el período', '', '', '', '', 0, 0, 0]);
    }

    // Fila Totales Servicios
    wsData.push([
      '',
      '',
      'TOTALES',
      '',
      '',
      '',
      totalServiciosQty,
      '',
      totalServiciosValor
    ]);

    // Resumen y Liquidación Final
    wsData.push(['', '', 'Sub Total', '', '', '', '', '', subtotal]);
    wsData.push(['', '', '', '', '', '', 'Iva 13%', '', iva]);
    wsData.push(['', '', '', '', '', '', 'Total General', '', totalGeneral]);

    const ws = XLSX.utils.aoa_to_sheet(wsData);

    // Ajustar anchos de columnas
    ws['!cols'] = [
      { wch: 3 },  // A
      { wch: 15 }, // B: Fecha
      { wch: 38 }, // C: Descripcion
      { wch: 15 }, // D: Inv-Inicial
      { wch: 14 }, // E: Entrada
      { wch: 14 }, // F: Salida
      { wch: 16 }, // G: Total Libras
      { wch: 12 }, // H: Precio
      { wch: 15 }  // I: Total $
    ];

    const wb = XLSX.utils.book_new();
    const sheetName = `${startDate.slice(5)}_al_${endDate.slice(5)}`.substring(0, 31);
    XLSX.utils.book_append_sheet(wb, ws, sheetName);

    downloadXLSX(wb, `Cuadro_cliente_cuarto_frio_${startDate}_al_${endDate}.xlsx`);
  } else {
    // Exportación a CSV formateado con enunciados
    const lines = [];
    lines.push(escapeCsvCell(title));
    lines.push(`${escapeCsvCell('Cliente:')},${escapeCsvCell(clientName)}`);
    lines.push(`${escapeCsvCell('Movimientos diarios entre:')},${escapeCsvCell(formattedStart)},${escapeCsvCell('Hasta')},${escapeCsvCell(formattedEnd)}`);
    lines.push('');
    
    // Encabezados almacenamiento
    lines.push(['FECHA', 'DESCRIPCION', 'INV-INICIAL', 'ENTRADA', 'SALIDA', 'TOTAL LIBRAS', 'PRECIO', 'Total $'].map(escapeCsvCell).join(','));

    // Filas
    dailyRows.forEach(row => {
      lines.push([
        formatDate(row.fecha),
        row.descripcion || `Mantenimiento congelado (${row.categoria || 'General'})`,
        row.stockInicial || 0,
        row.entradas || 0,
        row.salidas || 0,
        row.stockFinal || 0,
        row.precio || 0.001,
        row.totalMonto ? row.totalMonto.toFixed(2) : '0.00'
      ].map(escapeCsvCell).join(','));
    });

    // Totales Almacenamiento
    lines.push(['', 'Totales', totalInvInicial, totalEntradas, totalSalidas, totalLibrasAcum, '', totalAlmacenaje.toFixed(2)].map(escapeCsvCell).join(','));
    lines.push('');

    // Servicios Extraordinarios
    lines.push(escapeCsvCell('SERVICIOS EXTRA-ORDINARIOS'));
    lines.push(['FECHA', 'DESCRIPCION', 'TOTAL', 'PRECIO', 'VALOR'].map(escapeCsvCell).join(','));
    
    if (extraServices.length > 0) {
      extraServices.forEach(s => {
        lines.push([
          formatDate(s.date),
          s.description,
          s.quantity !== undefined ? s.quantity : 1,
          s.unitPrice !== undefined ? s.unitPrice : s.value,
          Number(s.value || 0).toFixed(2)
        ].map(escapeCsvCell).join(','));
      });
    }

    lines.push(['', 'TOTALES', totalServiciosQty, '', totalServiciosValor.toFixed(2)].map(escapeCsvCell).join(','));
    lines.push('');
    lines.push(['', 'Sub Total', '', '', subtotal.toFixed(2)].map(escapeCsvCell).join(','));
    lines.push(['', 'Iva 13%', '', '', iva.toFixed(2)].map(escapeCsvCell).join(','));
    lines.push(['', 'Total General', '', '', totalGeneral.toFixed(2)].map(escapeCsvCell).join(','));

    downloadCSV(lines, `Cuadro_cliente_cuarto_frio_${startDate}_al_${endDate}.csv`);
  }
};

/**
 * EXPORTADOR ESPECIALIZADO: RESUMEN DE ACTIVIDAD / GENERAL
 */
export const exportResumenCompleto = ({
  clientName = 'Avícola Salvadoreña S.A. DE C.V.',
  startDate,
  endDate,
  summaryData = [],
  groupedData = {},
  extraServices = [],
  totals = {},
  format = 'xlsx'
}) => {
  const formattedStart = formatDate(startDate);
  const formattedEnd = formatDate(endDate);
  const title = 'RESUMEN DE ACTIVIDAD Y VALORACION DE INVENTARIO';

  const subtotal = totals.subtotal || 0;
  const iva = totals.iva || 0;
  const totalGeneral = totals.totalGeneral || 0;
  const invTotal = totals.invTotal || 0;
  const totalServicios = totals.totalServicios || 0;

  if (format === 'xlsx') {
    const wsData = [];
    wsData.push([]);
    wsData.push(['', title]);
    wsData.push(['', 'Cliente:', clientName]);
    wsData.push(['', 'Período:', `${formattedStart} al ${formattedEnd}`]);
    wsData.push([]);
    wsData.push(['', 'Producto / SKU', 'Categoría', 'U.M.', 'Stock Inicial', 'Entradas', 'Salidas', 'Stock Final', 'Precio Unit ($)', 'Total Valor ($)']);

    summaryData.forEach(d => {
      wsData.push([
        '',
        d.producto,
        d.categoria,
        d.unidad,
        Number(d.stockInicial || 0),
        Number(d.entradas || 0),
        Number(d.salidas || 0),
        Number(d.stockFinal || 0),
        Number(d.precio || 0),
        Number(d.total || 0)
      ]);
    });

    wsData.push(['', 'TOTAL VALORACION INVENTARIO', '', '', '', '', '', '', '', invTotal]);
    wsData.push([]);

    // Servicios
    wsData.push(['', 'SERVICIOS EXTRAORDINARIOS DEL PERIODO']);
    wsData.push(['', 'Fecha', 'Ref. Movimiento', 'Descripción', '', '', '', '', '', 'Valor ($)']);

    if (extraServices.length > 0) {
      extraServices.forEach(s => {
        wsData.push([
          '',
          formatDate(s.date),
          s.ref || '',
          s.description,
          '',
          '',
          '',
          '',
          '',
          Number(s.value || 0)
        ]);
      });
    }

    wsData.push(['', 'TOTAL SERVICIOS', '', '', '', '', '', '', '', totalServicios]);
    wsData.push([]);
    wsData.push(['', 'SUBTOTAL (INVENTARIO + SERVICIOS)', '', '', '', '', '', '', '', subtotal]);
    wsData.push(['', 'IVA (13%)', '', '', '', '', '', '', '', iva]);
    wsData.push(['', 'GRAN TOTAL FACTURABLE', '', '', '', '', '', '', '', totalGeneral]);

    const ws = XLSX.utils.aoa_to_sheet(wsData);
    ws['!cols'] = [
      { wch: 3 },
      { wch: 35 },
      { wch: 18 },
      { wch: 8 },
      { wch: 14 },
      { wch: 14 },
      { wch: 14 },
      { wch: 14 },
      { wch: 16 },
      { wch: 18 }
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Resumen_Actividad');
    downloadXLSX(wb, `resumen_actividad_${startDate}_al_${endDate}.xlsx`);
  } else {
    const lines = [];
    lines.push(escapeCsvCell(title));
    lines.push(`${escapeCsvCell('Cliente:')},${escapeCsvCell(clientName)}`);
    lines.push(`${escapeCsvCell('Período:')},${escapeCsvCell(formattedStart + ' al ' + formattedEnd)}`);
    lines.push('');
    lines.push(['Producto / SKU', 'Categoría', 'U.M.', 'Stock Inicial', 'Entradas', 'Salidas', 'Stock Final', 'Precio Unit ($)', 'Total Valor ($)'].map(escapeCsvCell).join(','));

    summaryData.forEach(d => {
      lines.push([
        d.producto,
        d.categoria,
        d.unidad,
        d.stockInicial || 0,
        d.entradas || 0,
        d.salidas || 0,
        d.stockFinal || 0,
        d.precio || 0,
        Number(d.total || 0).toFixed(2)
      ].map(escapeCsvCell).join(','));
    });

    lines.push(['TOTAL VALORACION INVENTARIO', '', '', '', '', '', '', '', invTotal.toFixed(2)].map(escapeCsvCell).join(','));
    lines.push('');
    lines.push(escapeCsvCell('SERVICIOS EXTRAORDINARIOS DEL PERIODO'));
    lines.push(['Fecha', 'Ref. Movimiento', 'Descripción', 'Valor ($)'].map(escapeCsvCell).join(','));

    extraServices.forEach(s => {
      lines.push([
        formatDate(s.date),
        s.ref || '',
        s.description,
        Number(s.value || 0).toFixed(2)
      ].map(escapeCsvCell).join(','));
    });

    lines.push(['TOTAL SERVICIOS', '', '', totalServicios.toFixed(2)].map(escapeCsvCell).join(','));
    lines.push('');
    lines.push(['SUBTOTAL (INVENTARIO + SERVICIOS)', '', '', subtotal.toFixed(2)].map(escapeCsvCell).join(','));
    lines.push(['IVA (13%)', '', '', iva.toFixed(2)].map(escapeCsvCell).join(','));
    lines.push(['GRAN TOTAL FACTURABLE', '', '', totalGeneral.toFixed(2)].map(escapeCsvCell).join(','));

    downloadCSV(lines, `resumen_actividad_${startDate}_al_${endDate}.csv`);
  }
};

/**
 * EXPORTADOR ESPECIALIZADO: CORTE DE SEGURO
 */
export const exportCorteSeguro = ({
  customerName = 'AVICOLA SALVADOREÑA S.A. DE C.V.',
  warehouseName = 'ALMACENADORA LIL',
  cutoffDate,
  premiumRate = 0.10,
  reportRows = [],
  totals = {},
  format = 'xlsx'
}) => {
  const formattedDate = formatDate(cutoffDate);
  const title = `CIERRE DE INVENTARIO PARA SEGURO - ${warehouseName}`;
  const periodLabel = new Date(`${cutoffDate}T12:00:00`).toLocaleDateString('es-SV', {
    month: 'long',
    year: 'numeric'
  });

  const totalPounds = totals.totalPounds || 0;
  const totalBaskets = totals.totalBaskets || 0;
  const totalInsuredValue = totals.totalInsuredValue || 0;
  const totalPremium = totals.totalPremium || 0;

  if (format === 'xlsx') {
    const wsData = [];
    wsData.push([]);
    wsData.push(['', title]);
    wsData.push(['', 'San Martín, ' + formattedDate]);
    wsData.push(['', 'Señores:', customerName]);
    wsData.push(['', `Póliza / Almacén: ${warehouseName} - Mes: ${periodLabel}`]);
    wsData.push(['', `Tasa de Prima: ${premiumRate}% sobre valor CIF`]);
    wsData.push([]);
    wsData.push(['', 'Código', 'Material / Descripción', 'Unidades', 'Total LB', 'Total Cesta', 'Valor por LB $', 'Valor por Cestas $', 'Total $ (Valor CIF)', `Prima (${premiumRate}%)`]);

    reportRows.forEach(row => {
      wsData.push([
        '',
        row.code,
        row.material,
        Number(row.units || 0),
        Number(row.pounds || 0),
        Number(row.baskets || 0),
        row.poundRate != null ? Number(row.poundRate) : '',
        row.basketRate != null ? Number(row.basketRate) : '',
        Number(row.insuredValue || 0),
        Number(row.premium || 0)
      ]);
    });

    wsData.push([
      '',
      '',
      'TOTAL GENERAL',
      '',
      totalPounds,
      totalBaskets,
      '',
      '',
      totalInsuredValue,
      totalPremium
    ]);

    wsData.push([]);
    wsData.push(['', `El seguro se facturará por el monto de: $${formatCurrency(totalPremium)}`]);
    wsData.push(['', 'Atentamente: Ing. Raúl Sosa']);

    const ws = XLSX.utils.aoa_to_sheet(wsData);
    ws['!cols'] = [
      { wch: 3 },
      { wch: 15 },
      { wch: 38 },
      { wch: 12 },
      { wch: 15 },
      { wch: 15 },
      { wch: 15 },
      { wch: 16 },
      { wch: 18 },
      { wch: 16 }
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Corte_Seguro');
    downloadXLSX(wb, `corte_seguro_${cutoffDate}.xlsx`);
  } else {
    const lines = [];
    lines.push(escapeCsvCell(title));
    lines.push(`${escapeCsvCell('San Martín,')},${escapeCsvCell(formattedDate)}`);
    lines.push(`${escapeCsvCell('Señores:')},${escapeCsvCell(customerName)}`);
    lines.push(`${escapeCsvCell('Póliza:')},${escapeCsvCell(warehouseName + ' - ' + periodLabel)}`);
    lines.push(`${escapeCsvCell('Tasa de Prima:')},${escapeCsvCell(premiumRate + '%')}`);
    lines.push('');
    lines.push(['Código', 'Material / Descripción', 'Unidades', 'Total LB', 'Total Cesta', 'Valor por LB $', 'Valor por Cestas $', 'Total $ (Valor CIF)', `Prima (${premiumRate}%)`].map(escapeCsvCell).join(','));

    reportRows.forEach(row => {
      lines.push([
        row.code,
        row.material,
        row.units || 0,
        row.pounds || 0,
        row.baskets || 0,
        row.poundRate != null ? row.poundRate : '',
        row.basketRate != null ? row.basketRate : '',
        Number(row.insuredValue || 0).toFixed(2),
        Number(row.premium || 0).toFixed(2)
      ].map(escapeCsvCell).join(','));
    });

    lines.push(['', 'TOTAL GENERAL', '', totalPounds, totalBaskets, '', '', totalInsuredValue.toFixed(2), totalPremium.toFixed(2)].map(escapeCsvCell).join(','));
    lines.push('');
    lines.push([`Monto total a facturar por seguro: $${totalPremium.toFixed(2)}`].map(escapeCsvCell).join(','));

    downloadCSV(lines, `corte_seguro_${cutoffDate}.csv`);
  }
};

/**
 * EXPORTADOR ESPECIALIZADO: MOVIMIENTOS
 */
export const exportMovimientos = ({
  movements = [],
  products = [],
  format = 'xlsx'
}) => {
  const getProductName = (id) => {
    const p = products.find(prod => prod.id === id);
    return p ? `${p.sku} - ${p.description}` : 'Desconocido';
  };

  const title = 'REGISTRO HISTORICO DE MOVIMIENTOS DE INVENTARIO Y SERVICIOS';
  const todayStr = new Date().toISOString().split('T')[0];

  if (format === 'xlsx') {
    const wsData = [];
    wsData.push([]);
    wsData.push(['', title]);
    wsData.push(['', 'Fecha de Generación:', formatDate(todayStr)]);
    wsData.push(['', 'Total Movimientos:', movements.length]);
    wsData.push([]);
    wsData.push([
      '',
      'Fecha',
      'Hora Inicio',
      'Hora Fin',
      'Tipo',
      'Doc Tipo',
      'Doc Número',
      'Transportista',
      'Equipo / Placa',
      'Marchamo',
      'Auditor',
      'Producto',
      'Temp °C',
      'Cant. Unidades',
      'Cant. Libras',
      'Cant. Cestas',
      'Servicios Extraordinarios'
    ]);

    movements.forEach(mov => {
      const servicesStr = (mov.services || []).map(s => `${s.description} ($${Number(s.value || 0).toFixed(2)})`).join(' | ');
      const baseInfo = [
        formatDate(mov.date),
        mov.timeStart || '',
        mov.timeEnd || '',
        mov.type === 'in' ? 'Entrada' : 'Salida',
        mov.refType || '',
        mov.refNumber || '',
        mov.carrier || '',
        mov.equipment || '',
        mov.seal || '',
        mov.auditUser || ''
      ];

      if (mov.items && mov.items.length > 0) {
        mov.items.forEach(it => {
          wsData.push([
            '',
            ...baseInfo,
            getProductName(it.productId),
            it.temperature != null ? Number(it.temperature) : '',
            Number(it.qtyUnits || 0),
            Number(it.qtyPounds || 0),
            Number(it.qtyBaskets || 0),
            servicesStr
          ]);
        });
      } else {
        wsData.push([
          '',
          ...baseInfo,
          'Sin productos',
          '',
          0,
          0,
          0,
          servicesStr
        ]);
      }
    });

    const ws = XLSX.utils.aoa_to_sheet(wsData);
    ws['!cols'] = [
      { wch: 3 },
      { wch: 13 },
      { wch: 10 },
      { wch: 10 },
      { wch: 10 },
      { wch: 12 },
      { wch: 14 },
      { wch: 22 },
      { wch: 14 },
      { wch: 14 },
      { wch: 14 },
      { wch: 32 },
      { wch: 10 },
      { wch: 14 },
      { wch: 14 },
      { wch: 14 },
      { wch: 35 }
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Movimientos');
    downloadXLSX(wb, `movimientos_${todayStr}.xlsx`);
  } else {
    const lines = [];
    lines.push(escapeCsvCell(title));
    lines.push(`${escapeCsvCell('Fecha de Generación:')},${escapeCsvCell(formatDate(todayStr))}`);
    lines.push(`${escapeCsvCell('Total Movimientos:')},${escapeCsvCell(movements.length)}`);
    lines.push('');
    lines.push([
      'Fecha',
      'Hora Inicio',
      'Hora Fin',
      'Tipo',
      'Doc Tipo',
      'Doc Número',
      'Transportista',
      'Equipo / Placa',
      'Marchamo',
      'Auditor',
      'Producto',
      'Temp °C',
      'Cant. Unidades',
      'Cant. Libras',
      'Cant. Cestas',
      'Servicios Extraordinarios'
    ].map(escapeCsvCell).join(','));

    movements.forEach(mov => {
      const servicesStr = (mov.services || []).map(s => `${s.description} ($${Number(s.value || 0).toFixed(2)})`).join(' | ');
      const baseInfo = [
        formatDate(mov.date),
        mov.timeStart || '',
        mov.timeEnd || '',
        mov.type === 'in' ? 'Entrada' : 'Salida',
        mov.refType || '',
        mov.refNumber || '',
        mov.carrier || '',
        mov.equipment || '',
        mov.seal || '',
        mov.auditUser || ''
      ];

      if (mov.items && mov.items.length > 0) {
        mov.items.forEach(it => {
          lines.push([
            ...baseInfo,
            getProductName(it.productId),
            it.temperature != null ? it.temperature : '',
            it.qtyUnits || 0,
            it.qtyPounds || 0,
            it.qtyBaskets || 0,
            servicesStr
          ].map(escapeCsvCell).join(','));
        });
      } else {
        lines.push([
          ...baseInfo,
          'Sin productos',
          '',
          0,
          0,
          0,
          servicesStr
        ].map(escapeCsvCell).join(','));
      }
    });

    downloadCSV(lines, `movimientos_${todayStr}.csv`);
  }
};

/**
 * EXPORTADOR ESPECIALIZADO: CATALOGO DE PRODUCTOS
 */
export const exportProductos = ({
  products = [],
  categoryUnits = {},
  format = 'xlsx'
}) => {
  const title = 'CATALOGO DE PRODUCTOS Y EXISTENCIAS ACTUALES';
  const todayStr = new Date().toISOString().split('T')[0];

  const totalUnits = products.reduce((acc, p) => acc + Number(p.stockUnits || 0), 0);
  const totalPounds = products.reduce((acc, p) => acc + Number(p.stockPounds || 0), 0);
  const totalBaskets = products.reduce((acc, p) => acc + Number(p.stockBaskets || 0), 0);
  const totalValuation = products.reduce((acc, p) => {
    const unitType = categoryUnits[p.category] || 'units';
    const qty = unitType === 'baskets' ? Number(p.stockBaskets || 0) :
                unitType === 'pounds' ? Number(p.stockPounds || 0) : Number(p.stockUnits || 0);
    return acc + (qty * Number(p.price || 0));
  }, 0);

  if (format === 'xlsx') {
    const wsData = [];
    wsData.push([]);
    wsData.push(['', title]);
    wsData.push(['', 'Fecha de Generación:', formatDate(todayStr)]);
    wsData.push(['', 'Total Productos:', products.length]);
    wsData.push([]);
    wsData.push([
      '',
      'Código (SKU)',
      'Descripción del Producto',
      'Categoría',
      'Unidad de Control',
      'Precio Tarifa ($)',
      'Stock (Unidades)',
      'Stock (Libras)',
      'Stock (Cestas)',
      'Valorización Estimada ($)'
    ]);

    products.forEach(p => {
      const unitType = categoryUnits[p.category] || 'units';
      const unitLabel = unitType === 'units' ? 'Unidades' : unitType === 'pounds' ? 'Libras' : 'Cestas';
      const qty = unitType === 'baskets' ? Number(p.stockBaskets || 0) :
                  unitType === 'pounds' ? Number(p.stockPounds || 0) : Number(p.stockUnits || 0);
      const val = qty * Number(p.price || 0);

      wsData.push([
        '',
        p.sku,
        p.description,
        p.category,
        unitLabel,
        Number(p.price || 0),
        Number(p.stockUnits || 0),
        Number(p.stockPounds || 0),
        Number(p.stockBaskets || 0),
        val
      ]);
    });

    wsData.push([
      '',
      '',
      'TOTAL GENERAL',
      '',
      '',
      '',
      totalUnits,
      totalPounds,
      totalBaskets,
      totalValuation
    ]);

    const ws = XLSX.utils.aoa_to_sheet(wsData);
    ws['!cols'] = [
      { wch: 3 },
      { wch: 15 },
      { wch: 40 },
      { wch: 18 },
      { wch: 16 },
      { wch: 15 },
      { wch: 16 },
      { wch: 16 },
      { wch: 16 },
      { wch: 22 }
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Productos');
    downloadXLSX(wb, `productos_${todayStr}.xlsx`);
  } else {
    const lines = [];
    lines.push(escapeCsvCell(title));
    lines.push(`${escapeCsvCell('Fecha de Generación:')},${escapeCsvCell(formatDate(todayStr))}`);
    lines.push(`${escapeCsvCell('Total Productos:')},${escapeCsvCell(products.length)}`);
    lines.push('');
    lines.push([
      'Código (SKU)',
      'Descripción del Producto',
      'Categoría',
      'Unidad de Control',
      'Precio Tarifa ($)',
      'Stock (Unidades)',
      'Stock (Libras)',
      'Stock (Cestas)',
      'Valorización Estimada ($)'
    ].map(escapeCsvCell).join(','));

    products.forEach(p => {
      const unitType = categoryUnits[p.category] || 'units';
      const unitLabel = unitType === 'units' ? 'Unidades' : unitType === 'pounds' ? 'Libras' : 'Cestas';
      const qty = unitType === 'baskets' ? Number(p.stockBaskets || 0) :
                  unitType === 'pounds' ? Number(p.stockPounds || 0) : Number(p.stockUnits || 0);
      const val = qty * Number(p.price || 0);

      lines.push([
        p.sku,
        p.description,
        p.category,
        unitLabel,
        p.price || 0,
        p.stockUnits || 0,
        p.stockPounds || 0,
        p.stockBaskets || 0,
        val.toFixed(2)
      ].map(escapeCsvCell).join(','));
    });

    lines.push(['', 'TOTAL GENERAL', '', '', '', totalUnits, totalPounds, totalBaskets, totalValuation.toFixed(2)].map(escapeCsvCell).join(','));

    downloadCSV(lines, `productos_${todayStr}.csv`);
  }
};

/**
 * EXPORTADOR ESPECIALIZADO: BITÁCORA Y AUDITORÍA DEL SISTEMA
 */
export const exportBitacora = ({
  systemLogs = [],
  format = 'xlsx'
}) => {
  const title = 'BITACORA Y AUDITORIA DE ACCIONES DEL SISTEMA';
  const todayStr = new Date().toISOString().split('T')[0];

  if (format === 'xlsx') {
    const wsData = [];
    wsData.push([]);
    wsData.push(['', title]);
    wsData.push(['', 'Fecha de Exportación:', formatDate(todayStr)]);
    wsData.push(['', 'Total Registros:', systemLogs.length]);
    wsData.push([]);
    wsData.push(['', 'Fecha y Hora', 'Usuario', 'Acción', 'Módulo', 'Detalles de la Operación', 'IP Origen']);

    systemLogs.forEach(l => {
      wsData.push([
        '',
        l.timestamp || '',
        l.username || '',
        l.action || '',
        l.module || '',
        l.details || '',
        l.ip_address || 'Local'
      ]);
    });

    const ws = XLSX.utils.aoa_to_sheet(wsData);
    ws['!cols'] = [
      { wch: 3 },
      { wch: 20 },
      { wch: 15 },
      { wch: 22 },
      { wch: 15 },
      { wch: 55 },
      { wch: 15 }
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Bitacora');
    downloadXLSX(wb, `Bitacora_Sistema_${todayStr}.xlsx`);
  } else {
    const lines = [];
    lines.push(escapeCsvCell(title));
    lines.push(`${escapeCsvCell('Fecha de Exportación:')},${escapeCsvCell(formatDate(todayStr))}`);
    lines.push(`${escapeCsvCell('Total Registros:')},${escapeCsvCell(systemLogs.length)}`);
    lines.push('');
    lines.push(['Fecha y Hora', 'Usuario', 'Acción', 'Módulo', 'Detalles de la Operación', 'IP Origen'].map(escapeCsvCell).join(','));

    systemLogs.forEach(l => {
      lines.push([
        l.timestamp || '',
        l.username || '',
        l.action || '',
        l.module || '',
        l.details || '',
        l.ip_address || 'Local'
      ].map(escapeCsvCell).join(','));
    });

    downloadCSV(lines, `Bitacora_Sistema_${todayStr}.csv`);
  }
};
