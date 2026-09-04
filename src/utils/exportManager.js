import XLSX from 'xlsx-js-style';
import { formatDate, formatCurrency } from './formatUtils.js';
import { resolveServiceDetails } from './contractRates.js';

// ==========================================
// PALETA DE COLORES Y ESTILOS CORPORATIVOS (EXCEL)
// ==========================================
const PALETTE = {
  NAVY_HEADER: '0F172A',      // Slate 900 - Banners principales
  NAVY_SUBHEADER: '1E3A8A',   // Blue 900 - Cabeceras de tabla institucional
  ACCENT_BLUE: '2563EB',      // Blue 600 - Acentos y totales
  ACCENT_CYAN: '0284C7',      // Sky 600 - Productos Congelados (-18°C)
  ACCENT_PURPLE: '6D28D9',    // Purple 700 - Productos Preparados / Cestas
  ACCENT_AMBER: 'B45309',     // Amber 700 - Servicios Extraordinarios
  CARD_BG: 'F1F5F9',          // Slate 100 - Fondo de tarjetas y metadatos
  BORDER_LIGHT: 'E2E8F0',     // Slate 200 - Bordes finos de celdas de datos
  BORDER_MEDIUM: 'CBD5E1',    // Slate 300 - Bordes de tarjetas y separadores
  BORDER_DARK: '0F172A',      // Slate 900 - Bordes de cierre contable
  ZEBRA_EVEN: 'FFFFFF',       // Blanco puro
  ZEBRA_ODD: 'F8FAFC',        // Slate 50 - Sombra tenue para filas alternas
  ZEBRA_CYAN_ODD: 'F0F9FF',   // Sky 50 - Sombra tenue para congelados
  ZEBRA_PURPLE_ODD: 'FAF5FF', // Purple 50 - Sombra tenue para preparados
  ZEBRA_AMBER_ODD: 'FFFBEB',  // Amber 50 - Sombra tenue para servicios
  TEXT_DARK: '0F172A',        // Texto oscuro principal
  TEXT_WHITE: 'FFFFFF',       // Texto blanco para cabeceras oscuras
  TEXT_MUTED: '64748B',       // Texto secundario / gris
  TOTAL_BG: 'E2E8F0',         // Slate 200 para subtotales
  GRAND_TOTAL_BG: '1E3A8A',   // Azul marino profundo para Gran Total
  GRAND_TOTAL_TEXT: 'FFFFFF'
};

const FONT_NAME = 'Calibri';

const thinBorder = {
  top: { style: 'thin', color: { rgb: PALETTE.BORDER_LIGHT } },
  bottom: { style: 'thin', color: { rgb: PALETTE.BORDER_LIGHT } },
  left: { style: 'thin', color: { rgb: PALETTE.BORDER_LIGHT } },
  right: { style: 'thin', color: { rgb: PALETTE.BORDER_LIGHT } }
};

const mediumBorder = {
  top: { style: 'thin', color: { rgb: PALETTE.BORDER_MEDIUM } },
  bottom: { style: 'thin', color: { rgb: PALETTE.BORDER_MEDIUM } },
  left: { style: 'thin', color: { rgb: PALETTE.BORDER_MEDIUM } },
  right: { style: 'thin', color: { rgb: PALETTE.BORDER_MEDIUM } }
};

const subtotalBorder = {
  top: { style: 'thin', color: { rgb: PALETTE.BORDER_MEDIUM } },
  bottom: { style: 'double', color: { rgb: PALETTE.BORDER_DARK } },
  left: { style: 'thin', color: { rgb: PALETTE.BORDER_LIGHT } },
  right: { style: 'thin', color: { rgb: PALETTE.BORDER_LIGHT } }
};

const grandTotalBorder = {
  top: { style: 'medium', color: { rgb: PALETTE.BORDER_DARK } },
  bottom: { style: 'double', color: { rgb: PALETTE.BORDER_DARK } },
  left: { style: 'medium', color: { rgb: PALETTE.BORDER_DARK } },
  right: { style: 'medium', color: { rgb: PALETTE.BORDER_DARK } }
};

/**
 * Clase constructora de hojas de cálculo estilizadas y estructuradas
 */
class StyledSheetBuilder {
  constructor() {
    this.ws = {};
    this.currentRow = 0;
    this.merges = [];
    this.colWidths = [];
    this.rowHeights = [];
  }

  setColWidths(widths) {
    this.colWidths = widths.map(w => ({ wch: w }));
  }

  setRowHeight(r, hpt) {
    this.rowHeights[r] = { hpt };
  }

  setCell(r, c, val, opt = {}) {
    const ref = XLSX.utils.encode_cell({ r, c });
    let t = 's';
    let v = val;
    if (typeof val === 'number') {
      t = 'n';
    } else if (val === null || val === undefined) {
      v = '';
    } else {
      v = String(val);
    }
    const cell = { v, t };
    if (opt.z) cell.z = opt.z;
    if (opt.s) cell.s = opt.s;
    this.ws[ref] = cell;
    return cell;
  }

  mergeRange(r1, c1, r2, c2, val, style, numFmt = null) {
    this.merges.push({ s: { r: r1, c: c1 }, e: { r: r2, c: c2 } });
    for (let r = r1; r <= r2; r++) {
      for (let c = c1; c <= c2; c++) {
        const v = (r === r1 && c === c1) ? val : '';
        this.setCell(r, c, v, { s: style, z: numFmt });
      }
    }
  }

  addBanner(mainTitle, subTitle, totalCols = 9, accentColor = PALETTE.NAVY_SUBHEADER) {
    this.setRowHeight(this.currentRow, 28);
    this.mergeRange(this.currentRow, 0, this.currentRow, totalCols - 1, mainTitle, {
      font: { name: FONT_NAME, sz: 13, bold: true, color: { rgb: PALETTE.TEXT_WHITE } },
      fill: { fgColor: { rgb: PALETTE.NAVY_HEADER } },
      alignment: { horizontal: 'center', vertical: 'center' }
    });
    this.currentRow++;

    if (subTitle) {
      this.setRowHeight(this.currentRow, 22);
      this.mergeRange(this.currentRow, 0, this.currentRow, totalCols - 1, subTitle, {
        font: { name: FONT_NAME, sz: 10.5, bold: true, color: { rgb: PALETTE.TEXT_WHITE } },
        fill: { fgColor: { rgb: accentColor } },
        alignment: { horizontal: 'center', vertical: 'center' }
      });
      this.currentRow++;
    }
  }

  addEmptyRow(height = 12) {
    this.setRowHeight(this.currentRow, height);
    this.currentRow++;
  }

  build(maxCol = 9) {
    this.ws['!ref'] = XLSX.utils.encode_range({
      s: { r: 0, c: 0 },
      e: { r: Math.max(0, this.currentRow - 1), c: maxCol - 1 }
    });
    if (this.merges.length > 0) this.ws['!merges'] = this.merges;
    if (this.colWidths.length > 0) this.ws['!cols'] = this.colWidths;
    if (this.rowHeights.length > 0) this.ws['!rows'] = this.rowHeights;
    this.ws['!views'] = [{ showGridLines: true }];
    return this.ws;
  }
}

/**
 * Descarga universal y segura de archivos en cualquier navegador
 */
const downloadFile = (blob, filename) => {
  try {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', filename);
    link.download = filename;
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    setTimeout(() => {
      if (document.body.contains(link)) {
        document.body.removeChild(link);
      }
      URL.revokeObjectURL(url);
    }, 500);
  } catch (err) {
    console.error('Error al descargar archivo:', err);
    alert('Error al descargar el archivo: ' + err.message);
  }
};

/**
 * Exporta un libro XLSX nativo de Microsoft Excel con estilos
 */
export const downloadXLSX = (workbook, filename) => {
  try {
    const wbout = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
    const blob = new Blob([wbout], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const safeFilename = filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`;
    downloadFile(blob, safeFilename);
  } catch (err) {
    console.error('Error en downloadXLSX:', err);
    throw err;
  }
};

/**
 * Convierte un arreglo de filas de texto a CSV con BOM UTF-8 y descarga
 */
export const downloadCSV = (csvRows, filename) => {
  try {
    const csvContent = '\uFEFF' + csvRows.join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const safeFilename = filename.endsWith('.csv') ? filename : `${filename}.csv`;
    downloadFile(blob, safeFilename);
  } catch (err) {
    console.error('Error en downloadCSV:', err);
    throw err;
  }
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
 * Formato ejecutivo con diseño corporativo, métricas y liquidación diaria para cliente.
 */
export const exportCuadroClienteCuartoFrio = ({
  clientName = 'Avícola Salvadoreña S.A. DE C.V.',
  startDate,
  endDate,
  dailyRows = [],
  congeladosRows = [],
  preparadosRows = [],
  extraServices = [],
  totals = {},
  format = 'xlsx' // 'xlsx' | 'csv'
}) => {
  const safeStart = startDate ? String(startDate) : new Date().toISOString().split('T')[0];
  const safeEnd = endDate ? String(endDate) : new Date().toISOString().split('T')[0];
  const formattedStart = formatDate(safeStart);
  const formattedEnd = formatDate(safeEnd);
  const title = 'PROCESO DE FACTURACION POR ALMACENAMIENTO CONGELADO (-18°C) Y SERVICIOS EXTRAORDINARIOS';

  // Si no se pasaron arrays específicos, usar dailyRows como fallback
  const congRows = congeladosRows.length > 0 ? congeladosRows : (dailyRows.filter(r => r.unitType === 'pounds' || r.categoria === 'Congelados'));
  const prepRows = preparadosRows.length > 0 ? preparadosRows : (dailyRows.filter(r => r.unitType === 'baskets' || r.categoria === 'Preparados'));
  const fallbackRows = (congRows.length === 0 && prepRows.length === 0) ? dailyRows : [];

  // Totales Congelados (Libras)
  const congInvInicial = congRows.reduce((acc, r) => acc + Number(r.stockInicial || 0), 0);
  const congEntradas = congRows.reduce((acc, r) => acc + Number(r.entradas || 0), 0);
  const congSalidas = congRows.reduce((acc, r) => acc + Number(r.salidas || 0), 0);
  const congLibrasAcum = congRows.reduce((acc, r) => acc + Number(r.stockFinal || 0), 0);
  const congAlmacenaje = congRows.reduce((acc, r) => acc + Number(r.totalMonto || 0), 0);

  // Totales Preparados (Cestas)
  const prepInvInicial = prepRows.reduce((acc, r) => acc + Number(r.stockInicial || 0), 0);
  const prepEntradas = prepRows.reduce((acc, r) => acc + Number(r.entradas || 0), 0);
  const prepSalidas = prepRows.reduce((acc, r) => acc + Number(r.salidas || 0), 0);
  const prepCestasAcum = prepRows.reduce((acc, r) => acc + Number(r.stockFinal || 0), 0);
  const prepAlmacenaje = prepRows.reduce((acc, r) => acc + Number(r.totalMonto || 0), 0);

  // Fallback Totales
  const fbAlmacenaje = fallbackRows.reduce((acc, r) => acc + Number(r.totalMonto || 0), 0);

  // Totales de servicios
  const resolvedServices = (extraServices || []).map(resolveServiceDetails);
  const totalServiciosQty = resolvedServices.reduce((acc, s) => acc + Number(s.quantity || (s.value > 0 ? 1 : 0)), 0);
  const totalServiciosValor = resolvedServices.reduce((acc, s) => acc + Number(s.value || 0), 0);

  const totalAlmacenajeGeneral = totals.totalAlmacenaje ?? (congAlmacenaje + prepAlmacenaje + fbAlmacenaje);
  const subtotal = totals.subtotal ?? (totalAlmacenajeGeneral + totalServiciosValor);
  const iva = totals.iva ?? (subtotal * 0.13);
  const totalGeneral = totals.totalGeneral ?? (subtotal + iva);

  if (format === 'xlsx') {
    const builder = new StyledSheetBuilder();
    const totalCols = 8;
    builder.setColWidths([14, 38, 16, 15, 15, 16, 14, 16]);

    // 1. Banner Principal
    builder.addBanner(
      'INVERSIONES LIL, S.A. DE C.V. · CUARTO FRÍO SAN MARTÍN',
      title,
      totalCols,
      PALETTE.ACCENT_CYAN
    );
    builder.addEmptyRow(8);

    // 2. Metadatos del Corte
    const rMeta = builder.currentRow;
    builder.setRowHeight(rMeta, 20);
    builder.mergeRange(rMeta, 0, rMeta, 0, 'Cliente:', {
      font: { name: FONT_NAME, sz: 10, bold: true, color: { rgb: PALETTE.NAVY_SUBHEADER } },
      fill: { fgColor: { rgb: PALETTE.CARD_BG } },
      alignment: { horizontal: 'right', vertical: 'center' },
      border: mediumBorder
    });
    builder.mergeRange(rMeta, 1, rMeta, 4, clientName, {
      font: { name: FONT_NAME, sz: 10, bold: true, color: { rgb: PALETTE.TEXT_DARK } },
      fill: { fgColor: { rgb: 'FFFFFF' } },
      alignment: { horizontal: 'left', vertical: 'center' },
      border: mediumBorder
    });
    builder.mergeRange(rMeta, 5, rMeta, 5, 'Rango Térmico:', {
      font: { name: FONT_NAME, sz: 10, bold: true, color: { rgb: PALETTE.NAVY_SUBHEADER } },
      fill: { fgColor: { rgb: PALETTE.CARD_BG } },
      alignment: { horizontal: 'right', vertical: 'center' },
      border: mediumBorder
    });
    builder.mergeRange(rMeta, 6, rMeta, 7, '-18°C a -20°C', {
      font: { name: FONT_NAME, sz: 10, bold: false, color: { rgb: PALETTE.TEXT_DARK } },
      fill: { fgColor: { rgb: 'FFFFFF' } },
      alignment: { horizontal: 'left', vertical: 'center' },
      border: mediumBorder
    });
    builder.currentRow++;

    const rMeta2 = builder.currentRow;
    builder.setRowHeight(rMeta2, 20);
    builder.mergeRange(rMeta2, 0, rMeta2, 0, 'Período:', {
      font: { name: FONT_NAME, sz: 10, bold: true, color: { rgb: PALETTE.NAVY_SUBHEADER } },
      fill: { fgColor: { rgb: PALETTE.CARD_BG } },
      alignment: { horizontal: 'right', vertical: 'center' },
      border: mediumBorder
    });
    builder.mergeRange(rMeta2, 1, rMeta2, 4, `${formattedStart} al ${formattedEnd}`, {
      font: { name: FONT_NAME, sz: 10, bold: false, color: { rgb: PALETTE.TEXT_DARK } },
      fill: { fgColor: { rgb: 'FFFFFF' } },
      alignment: { horizontal: 'left', vertical: 'center' },
      border: mediumBorder
    });
    builder.mergeRange(rMeta2, 5, rMeta2, 5, 'Fecha Emisión:', {
      font: { name: FONT_NAME, sz: 10, bold: true, color: { rgb: PALETTE.NAVY_SUBHEADER } },
      fill: { fgColor: { rgb: PALETTE.CARD_BG } },
      alignment: { horizontal: 'right', vertical: 'center' },
      border: mediumBorder
    });
    builder.mergeRange(rMeta2, 6, rMeta2, 7, formatDate(new Date().toISOString().split('T')[0]), {
      font: { name: FONT_NAME, sz: 10, bold: false, color: { rgb: PALETTE.TEXT_DARK } },
      fill: { fgColor: { rgb: 'FFFFFF' } },
      alignment: { horizontal: 'left', vertical: 'center' },
      border: mediumBorder
    });
    builder.currentRow++;
    builder.addEmptyRow(12);

    // 3. Tarjetas KPI
    const kpiTop = {
      font: { name: FONT_NAME, sz: 9, bold: true, color: { rgb: PALETTE.TEXT_MUTED } },
      fill: { fgColor: { rgb: PALETTE.CARD_BG } },
      alignment: { horizontal: 'center', vertical: 'center' },
      border: { top: { style: 'thin', color: { rgb: PALETTE.BORDER_MEDIUM } }, left: { style: 'thin', color: { rgb: PALETTE.BORDER_MEDIUM } }, right: { style: 'thin', color: { rgb: PALETTE.BORDER_MEDIUM } } }
    };
    const kpiBottom = {
      font: { name: FONT_NAME, sz: 11.5, bold: true, color: { rgb: PALETTE.NAVY_SUBHEADER } },
      fill: { fgColor: { rgb: PALETTE.CARD_BG } },
      alignment: { horizontal: 'center', vertical: 'center' },
      border: { bottom: { style: 'thin', color: { rgb: PALETTE.BORDER_MEDIUM } }, left: { style: 'thin', color: { rgb: PALETTE.BORDER_MEDIUM } }, right: { style: 'thin', color: { rgb: PALETTE.BORDER_MEDIUM } } }
    };

    builder.setRowHeight(builder.currentRow, 18);
    builder.mergeRange(builder.currentRow, 0, builder.currentRow, 1, 'ALMACENAJE CONGELADO', kpiTop);
    builder.mergeRange(builder.currentRow, 2, builder.currentRow, 3, 'ALMACENAJE PREPARADOS', kpiTop);
    builder.mergeRange(builder.currentRow, 4, builder.currentRow, 5, 'SERVICIOS EXTRAORDINARIOS', kpiTop);
    builder.mergeRange(builder.currentRow, 6, builder.currentRow, 7, 'GRAN TOTAL FACTURABLE', kpiTop);
    builder.currentRow++;

    builder.setRowHeight(builder.currentRow, 22);
    builder.mergeRange(builder.currentRow, 0, builder.currentRow, 1, congAlmacenaje, kpiBottom, '"$"#,##0.00');
    builder.mergeRange(builder.currentRow, 2, builder.currentRow, 3, prepAlmacenaje, kpiBottom, '"$"#,##0.00');
    builder.mergeRange(builder.currentRow, 4, builder.currentRow, 5, totalServiciosValor, kpiBottom, '"$"#,##0.00');
    builder.mergeRange(builder.currentRow, 6, builder.currentRow, 7, totalGeneral, kpiBottom, '"$"#,##0.00');
    builder.currentRow++;
    builder.addEmptyRow(14);

    // 4. Tabla 1: Congelados (Libras - $0.001)
    if (congRows.length > 0 || fallbackRows.length === 0) {
      builder.setRowHeight(builder.currentRow, 24);
      builder.mergeRange(builder.currentRow, 0, builder.currentRow, 7, '  1. ALMACENAMIENTO DE PRODUCTO CRUDO CONGELADO (-18°C) · TARIFA: $0.001 / LB / DÍA', {
        font: { name: FONT_NAME, sz: 10.5, bold: true, color: { rgb: PALETTE.TEXT_WHITE } },
        fill: { fgColor: { rgb: PALETTE.ACCENT_CYAN } },
        alignment: { horizontal: 'left', vertical: 'center' }
      });
      builder.currentRow++;

      const congHeaders = ['FECHA', 'DESCRIPCIÓN', 'INV-INICIAL (LB)', 'ENTRADA LB', 'SALIDA LB', 'TOTAL LIBRAS', 'TARIFA ($/LB)', 'TOTAL ($)'];
      builder.setRowHeight(builder.currentRow, 22);
      congHeaders.forEach((h, idx) => {
        builder.setCell(builder.currentRow, idx, h, {
          s: {
            font: { name: FONT_NAME, sz: 9.5, bold: true, color: { rgb: PALETTE.TEXT_WHITE } },
            fill: { fgColor: { rgb: PALETTE.NAVY_HEADER } },
            alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
            border: thinBorder
          }
        });
      });
      builder.currentRow++;

      if (congRows.length > 0) {
        congRows.forEach((row, idx) => {
          builder.setRowHeight(builder.currentRow, 20);
          const isOdd = idx % 2 === 1;
          const bg = isOdd ? PALETTE.ZEBRA_CYAN_ODD : PALETTE.ZEBRA_EVEN;
          const cellStyle = (align, bold = false) => ({
            font: { name: FONT_NAME, sz: 9.5, bold, color: { rgb: PALETTE.TEXT_DARK } },
            fill: { fgColor: { rgb: bg } },
            alignment: { horizontal: align, vertical: 'center' },
            border: thinBorder
          });

          builder.setCell(builder.currentRow, 0, formatDate(row.fecha), { s: cellStyle('center') });
          builder.setCell(builder.currentRow, 1, row.descripcion || 'Mantenimiento congelado', { s: cellStyle('left') });
          builder.setCell(builder.currentRow, 2, Number(row.stockInicial || 0), { s: cellStyle('right'), z: '#,##0.00' });
          builder.setCell(builder.currentRow, 3, Number(row.entradas || 0), { s: cellStyle('right'), z: '#,##0.00' });
          builder.setCell(builder.currentRow, 4, Number(row.salidas || 0), { s: cellStyle('right'), z: '#,##0.00' });
          builder.setCell(builder.currentRow, 5, Number(row.stockFinal || 0), { s: cellStyle('right', true), z: '#,##0.00' });
          builder.setCell(builder.currentRow, 6, Number(row.precio || 0.001), { s: cellStyle('right'), z: '"$"#,##0.000' });
          builder.setCell(builder.currentRow, 7, Number(row.totalMonto || 0), { s: cellStyle('right', true), z: '"$"#,##0.00' });
          builder.currentRow++;
        });
      } else {
        builder.setRowHeight(builder.currentRow, 20);
        builder.mergeRange(builder.currentRow, 0, builder.currentRow, 7, 'Sin movimientos de congelados en este período', {
          font: { name: FONT_NAME, sz: 9.5, italic: true, color: { rgb: PALETTE.TEXT_MUTED } },
          fill: { fgColor: { rgb: PALETTE.ZEBRA_EVEN } },
          alignment: { horizontal: 'center', vertical: 'center' },
          border: thinBorder
        });
        builder.currentRow++;
      }

      // Subtotales Congelados
      builder.setRowHeight(builder.currentRow, 22);
      const subStyleCong = {
        font: { name: FONT_NAME, sz: 10, bold: true, color: { rgb: PALETTE.NAVY_SUBHEADER } },
        fill: { fgColor: { rgb: PALETTE.TOTAL_BG } },
        border: subtotalBorder
      };
      builder.mergeRange(builder.currentRow, 0, builder.currentRow, 1, 'TOTAL CONGELADOS:', {
        ...subStyleCong,
        alignment: { horizontal: 'right', vertical: 'center' }
      });
      builder.setCell(builder.currentRow, 2, congInvInicial, { s: { ...subStyleCong, alignment: { horizontal: 'right', vertical: 'center' } }, z: '#,##0.00' });
      builder.setCell(builder.currentRow, 3, congEntradas, { s: { ...subStyleCong, alignment: { horizontal: 'right', vertical: 'center' } }, z: '#,##0.00' });
      builder.setCell(builder.currentRow, 4, congSalidas, { s: { ...subStyleCong, alignment: { horizontal: 'right', vertical: 'center' } }, z: '#,##0.00' });
      builder.setCell(builder.currentRow, 5, congLibrasAcum, { s: { ...subStyleCong, alignment: { horizontal: 'right', vertical: 'center' } }, z: '#,##0.00' });
      builder.setCell(builder.currentRow, 6, '', { s: subStyleCong });
      builder.setCell(builder.currentRow, 7, congAlmacenaje, { s: { ...subStyleCong, alignment: { horizontal: 'right', vertical: 'center' } }, z: '"$"#,##0.00' });
      builder.currentRow++;
      builder.addEmptyRow(14);
    }

    // 5. Tabla 2: Preparados (Cestas - $0.038)
    if (prepRows.length > 0 || fallbackRows.length === 0) {
      builder.setRowHeight(builder.currentRow, 24);
      builder.mergeRange(builder.currentRow, 0, builder.currentRow, 7, '  2. ALMACENAMIENTO DE PRODUCTOS COCINADOS / PATTIES · TARIFA: $0.038 / CESTA / DÍA', {
        font: { name: FONT_NAME, sz: 10.5, bold: true, color: { rgb: PALETTE.TEXT_WHITE } },
        fill: { fgColor: { rgb: PALETTE.ACCENT_PURPLE } },
        alignment: { horizontal: 'left', vertical: 'center' }
      });
      builder.currentRow++;

      const prepHeaders = ['FECHA', 'DESCRIPCIÓN', 'INV. CESTAS', 'ENTRADA CESTAS', 'SALIDA CESTAS', 'TOTAL CESTAS', 'TARIFA ($/CST)', 'TOTAL ($)'];
      builder.setRowHeight(builder.currentRow, 22);
      prepHeaders.forEach((h, idx) => {
        builder.setCell(builder.currentRow, idx, h, {
          s: {
            font: { name: FONT_NAME, sz: 9.5, bold: true, color: { rgb: PALETTE.TEXT_WHITE } },
            fill: { fgColor: { rgb: PALETTE.NAVY_HEADER } },
            alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
            border: thinBorder
          }
        });
      });
      builder.currentRow++;

      if (prepRows.length > 0) {
        prepRows.forEach((row, idx) => {
          builder.setRowHeight(builder.currentRow, 20);
          const isOdd = idx % 2 === 1;
          const bg = isOdd ? PALETTE.ZEBRA_PURPLE_ODD : PALETTE.ZEBRA_EVEN;
          const cellStyle = (align, bold = false) => ({
            font: { name: FONT_NAME, sz: 9.5, bold, color: { rgb: PALETTE.TEXT_DARK } },
            fill: { fgColor: { rgb: bg } },
            alignment: { horizontal: align, vertical: 'center' },
            border: thinBorder
          });

          builder.setCell(builder.currentRow, 0, formatDate(row.fecha), { s: cellStyle('center') });
          builder.setCell(builder.currentRow, 1, row.descripcion || 'Mantenimiento preparados', { s: cellStyle('left') });
          builder.setCell(builder.currentRow, 2, Number(row.stockInicial || 0), { s: cellStyle('right'), z: '#,##0' });
          builder.setCell(builder.currentRow, 3, Number(row.entradas || 0), { s: cellStyle('right'), z: '#,##0' });
          builder.setCell(builder.currentRow, 4, Number(row.salidas || 0), { s: cellStyle('right'), z: '#,##0' });
          builder.setCell(builder.currentRow, 5, Number(row.stockFinal || 0), { s: cellStyle('right', true), z: '#,##0' });
          builder.setCell(builder.currentRow, 6, Number(row.precio || 0.038), { s: cellStyle('right'), z: '"$"#,##0.000' });
          builder.setCell(builder.currentRow, 7, Number(row.totalMonto || 0), { s: cellStyle('right', true), z: '"$"#,##0.00' });
          builder.currentRow++;
        });
      } else {
        builder.setRowHeight(builder.currentRow, 20);
        builder.mergeRange(builder.currentRow, 0, builder.currentRow, 7, 'Sin movimientos de preparados en este período', {
          font: { name: FONT_NAME, sz: 9.5, italic: true, color: { rgb: PALETTE.TEXT_MUTED } },
          fill: { fgColor: { rgb: PALETTE.ZEBRA_EVEN } },
          alignment: { horizontal: 'center', vertical: 'center' },
          border: thinBorder
        });
        builder.currentRow++;
      }

      // Subtotales Preparados
      builder.setRowHeight(builder.currentRow, 22);
      const subStylePrep = {
        font: { name: FONT_NAME, sz: 10, bold: true, color: { rgb: PALETTE.NAVY_SUBHEADER } },
        fill: { fgColor: { rgb: PALETTE.TOTAL_BG } },
        border: subtotalBorder
      };
      builder.mergeRange(builder.currentRow, 0, builder.currentRow, 1, 'TOTAL PREPARADOS:', {
        ...subStylePrep,
        alignment: { horizontal: 'right', vertical: 'center' }
      });
      builder.setCell(builder.currentRow, 2, prepInvInicial, { s: { ...subStylePrep, alignment: { horizontal: 'right', vertical: 'center' } }, z: '#,##0' });
      builder.setCell(builder.currentRow, 3, prepEntradas, { s: { ...subStylePrep, alignment: { horizontal: 'right', vertical: 'center' } }, z: '#,##0' });
      builder.setCell(builder.currentRow, 4, prepSalidas, { s: { ...subStylePrep, alignment: { horizontal: 'right', vertical: 'center' } }, z: '#,##0' });
      builder.setCell(builder.currentRow, 5, prepCestasAcum, { s: { ...subStylePrep, alignment: { horizontal: 'right', vertical: 'center' } }, z: '#,##0' });
      builder.setCell(builder.currentRow, 6, '', { s: subStylePrep });
      builder.setCell(builder.currentRow, 7, prepAlmacenaje, { s: { ...subStylePrep, alignment: { horizontal: 'right', vertical: 'center' } }, z: '"$"#,##0.00' });
      builder.currentRow++;
      builder.addEmptyRow(14);
    }

    // 6. Tabla 3: Servicios Extraordinarios
    builder.setRowHeight(builder.currentRow, 24);
    builder.mergeRange(builder.currentRow, 0, builder.currentRow, 7, '  3. SERVICIOS EXTRAORDINARIOS (MANIOBRA Y CONTROL DE TEMPERATURA)', {
      font: { name: FONT_NAME, sz: 10.5, bold: true, color: { rgb: PALETTE.TEXT_WHITE } },
      fill: { fgColor: { rgb: PALETTE.ACCENT_AMBER } },
      alignment: { horizontal: 'left', vertical: 'center' }
    });
    builder.currentRow++;

    builder.setRowHeight(builder.currentRow, 22);
    builder.setCell(builder.currentRow, 0, 'FECHA', { s: { font: { name: FONT_NAME, sz: 9.5, bold: true, color: { rgb: PALETTE.TEXT_WHITE } }, fill: { fgColor: { rgb: '334155' } }, alignment: { horizontal: 'center', vertical: 'center' }, border: thinBorder } });
    builder.mergeRange(builder.currentRow, 1, builder.currentRow, 3, 'DESCRIPCIÓN DEL SERVICIO', { font: { name: FONT_NAME, sz: 9.5, bold: true, color: { rgb: PALETTE.TEXT_WHITE } }, fill: { fgColor: { rgb: '334155' } }, alignment: { horizontal: 'center', vertical: 'center' }, border: thinBorder });
    builder.setCell(builder.currentRow, 4, 'REF. MOV.', { s: { font: { name: FONT_NAME, sz: 9.5, bold: true, color: { rgb: PALETTE.TEXT_WHITE } }, fill: { fgColor: { rgb: '334155' } }, alignment: { horizontal: 'center', vertical: 'center' }, border: thinBorder } });
    builder.setCell(builder.currentRow, 5, 'CANTIDAD / LBS', { s: { font: { name: FONT_NAME, sz: 9.5, bold: true, color: { rgb: PALETTE.TEXT_WHITE } }, fill: { fgColor: { rgb: '334155' } }, alignment: { horizontal: 'center', vertical: 'center' }, border: thinBorder } });
    builder.setCell(builder.currentRow, 6, 'TARIFA ($)', { s: { font: { name: FONT_NAME, sz: 9.5, bold: true, color: { rgb: PALETTE.TEXT_WHITE } }, fill: { fgColor: { rgb: '334155' } }, alignment: { horizontal: 'center', vertical: 'center' }, border: thinBorder } });
    builder.setCell(builder.currentRow, 7, 'VALOR ($)', { s: { font: { name: FONT_NAME, sz: 9.5, bold: true, color: { rgb: PALETTE.TEXT_WHITE } }, fill: { fgColor: { rgb: '334155' } }, alignment: { horizontal: 'center', vertical: 'center' }, border: thinBorder } });
    builder.currentRow++;

    if (resolvedServices.length > 0) {
      resolvedServices.forEach((s, idx) => {
        builder.setRowHeight(builder.currentRow, 20);
        const isOdd = idx % 2 === 1;
        const bg = isOdd ? PALETTE.ZEBRA_AMBER_ODD : PALETTE.ZEBRA_EVEN;
        const sStyle = (align, bold = false) => ({
          font: { name: FONT_NAME, sz: 9.5, bold, color: { rgb: PALETTE.TEXT_DARK } },
          fill: { fgColor: { rgb: bg } },
          alignment: { horizontal: align, vertical: 'center' },
          border: thinBorder
        });

        builder.setCell(builder.currentRow, 0, formatDate(s.date), { s: sStyle('center') });
        builder.mergeRange(builder.currentRow, 1, builder.currentRow, 3, s.description || 'Servicio extraordinario', sStyle('left'));
        builder.setCell(builder.currentRow, 4, s.ref || 'N/A', { s: sStyle('center') });
        builder.setCell(builder.currentRow, 5, Number(s.quantity || 1), { s: sStyle('right'), z: '#,##0.00' });
        builder.setCell(builder.currentRow, 6, Number(s.unitPrice || 0), { s: sStyle('right'), z: '"$"#,##0.000' });
        builder.setCell(builder.currentRow, 7, Number(s.value || 0), { s: sStyle('right', true), z: '"$"#,##0.00' });
        builder.currentRow++;
      });
    } else {
      builder.setRowHeight(builder.currentRow, 20);
      builder.mergeRange(builder.currentRow, 0, builder.currentRow, 7, 'Sin servicios extraordinarios registrados en este período', {
        font: { name: FONT_NAME, sz: 9.5, italic: true, color: { rgb: PALETTE.TEXT_MUTED } },
        fill: { fgColor: { rgb: PALETTE.ZEBRA_EVEN } },
        alignment: { horizontal: 'center', vertical: 'center' },
        border: thinBorder
      });
      builder.currentRow++;
    }

    // Subtotal Servicios
    builder.setRowHeight(builder.currentRow, 22);
    const subStyleServ = {
      font: { name: FONT_NAME, sz: 10, bold: true, color: { rgb: PALETTE.ACCENT_AMBER } },
      fill: { fgColor: { rgb: 'FEF3C7' } },
      border: subtotalBorder
    };
    builder.mergeRange(builder.currentRow, 0, builder.currentRow, 4, 'TOTAL SERVICIOS EXTRAORDINARIOS:', {
      ...subStyleServ,
      alignment: { horizontal: 'right', vertical: 'center' }
    });
    builder.setCell(builder.currentRow, 5, totalServiciosQty, { s: { ...subStyleServ, alignment: { horizontal: 'right', vertical: 'center' } }, z: '#,##0.00' });
    builder.setCell(builder.currentRow, 6, '', { s: subStyleServ });
    builder.setCell(builder.currentRow, 7, totalServiciosValor, { s: { ...subStyleServ, alignment: { horizontal: 'right', vertical: 'center' } }, z: '"$"#,##0.00' });
    builder.currentRow++;
    builder.addEmptyRow(16);

    // 7. Tarjeta de Liquidación Final Facturable
    builder.setRowHeight(builder.currentRow, 24);
    builder.mergeRange(builder.currentRow, 4, builder.currentRow, 7, 'RESUMEN DE LIQUIDACIÓN Y GRAN TOTAL', {
      font: { name: FONT_NAME, sz: 10.5, bold: true, color: { rgb: PALETTE.TEXT_WHITE } },
      fill: { fgColor: { rgb: PALETTE.NAVY_HEADER } },
      alignment: { horizontal: 'center', vertical: 'center' }
    });
    builder.currentRow++;

    const summaryRow = (label, val, isBold = false, bg = PALETTE.CARD_BG, isGrandTotal = false) => {
      builder.setRowHeight(builder.currentRow, isGrandTotal ? 24 : 20);
      const font = {
        name: FONT_NAME,
        sz: isGrandTotal ? 11 : 10,
        bold: isBold || isGrandTotal,
        color: { rgb: isGrandTotal ? PALETTE.TEXT_WHITE : PALETTE.TEXT_DARK }
      };
      const fill = { fgColor: { rgb: isGrandTotal ? PALETTE.GRAND_TOTAL_BG : bg } };
      const border = isGrandTotal ? grandTotalBorder : mediumBorder;

      builder.mergeRange(builder.currentRow, 4, builder.currentRow, 6, label, {
        font,
        fill,
        alignment: { horizontal: 'right', vertical: 'center' },
        border
      });
      builder.setCell(builder.currentRow, 7, val, {
        s: { font, fill, alignment: { horizontal: 'right', vertical: 'center' }, border },
        z: '"$"#,##0.00'
      });
      builder.currentRow++;
    };

    summaryRow('Total Almacenaje Congelado Crudo:', congAlmacenaje);
    summaryRow('Total Almacenaje Preparados:', prepAlmacenaje);
    summaryRow('Total Servicios Extraordinarios:', totalServiciosValor);
    summaryRow('Sub Total Facturable:', subtotal, true, PALETTE.TOTAL_BG);
    summaryRow('IVA (13%):', iva);
    summaryRow('GRAN TOTAL FACTURABLE:', totalGeneral, true, null, true);

    const ws = builder.build(totalCols);
    const wb = XLSX.utils.book_new();
    const sheetName = (safeStart.length >= 5 && safeEnd.length >= 5 ? `${safeStart.slice(5)}_al_${safeEnd.slice(5)}` : 'Cuadro_Cliente').substring(0, 31);
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
    downloadXLSX(wb, `Cuadro_cliente_cuarto_frio_${safeStart}_al_${safeEnd}.xlsx`);
  } else {
    // Exportación a CSV formateado
    const lines = [];
    lines.push(escapeCsvCell(title));
    lines.push(`${escapeCsvCell('Cliente:')},${escapeCsvCell(clientName)}`);
    lines.push(`${escapeCsvCell('Movimientos diarios entre:')},${escapeCsvCell(formattedStart)},${escapeCsvCell('Hasta')},${escapeCsvCell(formattedEnd)}`);
    lines.push('');
    
    // 1. Tabla Congelados (Libras)
    if (congRows.length > 0 || fallbackRows.length === 0) {
      lines.push(escapeCsvCell('ALMACENAMIENTO CONGELADO (-18°) - $0.001/lb'));
      lines.push(['FECHA', 'DESCRIPCION', 'INV-INICIAL', 'ENTRADA LB', 'SALIDA LB', 'TOTAL LIBRAS', 'PRECIO', 'TOTAL $'].map(escapeCsvCell).join(','));
      congRows.forEach(row => {
        lines.push([
          formatDate(row.fecha),
          row.descripcion || 'Mantenimiento congelado',
          row.stockInicial || 0,
          row.entradas || 0,
          row.salidas || 0,
          row.stockFinal || 0,
          row.precio || 0.001,
          row.totalMonto ? Number(row.totalMonto).toFixed(2) : '0.00'
        ].map(escapeCsvCell).join(','));
      });
      lines.push(['', 'Totales', congInvInicial, congEntradas, congSalidas, congLibrasAcum, '', Number(congAlmacenaje).toFixed(2)].map(escapeCsvCell).join(','));
      lines.push('');
    }

    // 2. Tabla Preparados (Cestas)
    if (prepRows.length > 0 || fallbackRows.length === 0) {
      lines.push(escapeCsvCell('PRODUCTOS PREPARADOS - $0.038/cesta'));
      lines.push(['FECHA', 'DESCRIPCION', 'INV CESTAS', 'ENTRADA CESTAS', 'SALIDA CESTAS', 'TOTAL CESTA', 'PRECIO CESTA', 'TOTAL $'].map(escapeCsvCell).join(','));
      prepRows.forEach(row => {
        lines.push([
          formatDate(row.fecha),
          row.descripcion || 'Mantenimiento congelado (Preparados)',
          row.stockInicial || 0,
          row.entradas || 0,
          row.salidas || 0,
          row.stockFinal || 0,
          row.precio || 0.038,
          row.totalMonto ? Number(row.totalMonto).toFixed(2) : '0.00'
        ].map(escapeCsvCell).join(','));
      });
      lines.push(['', 'Totales', prepInvInicial, prepEntradas, prepSalidas, prepCestasAcum, '', Number(prepAlmacenaje).toFixed(2)].map(escapeCsvCell).join(','));
      lines.push('');
    }

    // 3. Servicios Extraordinarios
    lines.push(escapeCsvCell('SERVICIOS EXTRA-ORDINARIOS'));
    lines.push(['FECHA', 'DESCRIPCION', 'TOTAL (CANT/LBS)', 'PRECIO', 'VALOR'].map(escapeCsvCell).join(','));
    if (resolvedServices.length > 0) {
      resolvedServices.forEach(s => {
        lines.push([
          formatDate(s.date),
          s.description + (s.ref ? ` (${s.ref})` : ''),
          Number(s.quantity || 1),
          Number(s.unitPrice || s.value || 0),
          Number(s.value || 0).toFixed(2)
        ].map(escapeCsvCell).join(','));
      });
    }
    lines.push(['', 'TOTALES', totalServiciosQty, '', Number(totalServiciosValor).toFixed(2)].map(escapeCsvCell).join(','));
    lines.push('');

    // 4. Resumen
    lines.push(['', 'Sub Total', '', '', Number(subtotal).toFixed(2)].map(escapeCsvCell).join(','));
    lines.push(['', 'IVA 13%', '', '', Number(iva).toFixed(2)].map(escapeCsvCell).join(','));
    lines.push(['', 'TOTAL GENERAL', '', '', Number(totalGeneral).toFixed(2)].map(escapeCsvCell).join(','));

    downloadCSV(lines, `Cuadro_cliente_cuarto_frio_${safeStart}_al_${safeEnd}.csv`);
  }
};

/**
 * EXPORTADOR ESPECIALIZADO: RESUMEN DE ACTIVIDAD Y VALORACIÓN DE INVENTARIO
 * Genera el reporte general con métricas KPI, inventario consolidado y servicios.
 */
export const exportResumenCompleto = ({
  clientName = 'Avícola Salvadoreña S.A. DE C.V.',
  startDate,
  endDate,
  summaryData = [],
  extraServices = [],
  totals = {},
  format = 'xlsx'
}) => {
  const safeStart = startDate ? String(startDate) : new Date().toISOString().split('T')[0];
  const safeEnd = endDate ? String(endDate) : new Date().toISOString().split('T')[0];
  const formattedStart = formatDate(safeStart);
  const formattedEnd = formatDate(safeEnd);
  const title = 'RESUMEN DE ACTIVIDAD Y VALORACION DE INVENTARIO';

  const subtotal = totals.subtotal || 0;
  const iva = totals.iva || 0;
  const totalGeneral = totals.totalGeneral || 0;
  const invTotal = totals.invTotal || 0;
  const totalServicios = totals.totalServicios || 0;

  const sumStockInicial = summaryData.reduce((acc, d) => acc + Number(d.stockInicial || 0), 0);
  const sumEntradas = summaryData.reduce((acc, d) => acc + Number(d.entradas || 0), 0);
  const sumSalidas = summaryData.reduce((acc, d) => acc + Number(d.salidas || 0), 0);
  const sumStockFinal = summaryData.reduce((acc, d) => acc + Number(d.stockFinal || 0), 0);

  if (format === 'xlsx') {
    const builder = new StyledSheetBuilder();
    const totalCols = 9;
    builder.setColWidths([38, 16, 8, 15, 14, 14, 15, 15, 18]);

    // 1. Banner Principal
    builder.addBanner(
      'INVENTARIO PRO · CONTROL DE ALMACEN FRIGORIFICO',
      title,
      totalCols,
      PALETTE.NAVY_SUBHEADER
    );
    builder.addEmptyRow(8);

    // 2. Metadatos del Reporte
    const rMeta1 = builder.currentRow;
    builder.setRowHeight(rMeta1, 20);
    builder.mergeRange(rMeta1, 0, rMeta1, 0, 'Cliente:', {
      font: { name: FONT_NAME, sz: 10, bold: true, color: { rgb: PALETTE.NAVY_SUBHEADER } },
      fill: { fgColor: { rgb: PALETTE.CARD_BG } },
      alignment: { horizontal: 'right', vertical: 'center' },
      border: mediumBorder
    });
    builder.mergeRange(rMeta1, 1, rMeta1, 4, clientName, {
      font: { name: FONT_NAME, sz: 10, bold: true, color: { rgb: PALETTE.TEXT_DARK } },
      fill: { fgColor: { rgb: 'FFFFFF' } },
      alignment: { horizontal: 'left', vertical: 'center' },
      border: mediumBorder
    });
    builder.mergeRange(rMeta1, 5, rMeta1, 5, 'Fecha Emisión:', {
      font: { name: FONT_NAME, sz: 10, bold: true, color: { rgb: PALETTE.NAVY_SUBHEADER } },
      fill: { fgColor: { rgb: PALETTE.CARD_BG } },
      alignment: { horizontal: 'right', vertical: 'center' },
      border: mediumBorder
    });
    builder.mergeRange(rMeta1, 6, rMeta1, 8, formatDate(new Date().toISOString().split('T')[0]), {
      font: { name: FONT_NAME, sz: 10, bold: false, color: { rgb: PALETTE.TEXT_DARK } },
      fill: { fgColor: { rgb: 'FFFFFF' } },
      alignment: { horizontal: 'left', vertical: 'center' },
      border: mediumBorder
    });
    builder.currentRow++;

    const rMeta2 = builder.currentRow;
    builder.setRowHeight(rMeta2, 20);
    builder.mergeRange(rMeta2, 0, rMeta2, 0, 'Período:', {
      font: { name: FONT_NAME, sz: 10, bold: true, color: { rgb: PALETTE.NAVY_SUBHEADER } },
      fill: { fgColor: { rgb: PALETTE.CARD_BG } },
      alignment: { horizontal: 'right', vertical: 'center' },
      border: mediumBorder
    });
    builder.mergeRange(rMeta2, 1, rMeta2, 4, `${formattedStart} al ${formattedEnd}`, {
      font: { name: FONT_NAME, sz: 10, bold: false, color: { rgb: PALETTE.TEXT_DARK } },
      fill: { fgColor: { rgb: 'FFFFFF' } },
      alignment: { horizontal: 'left', vertical: 'center' },
      border: mediumBorder
    });
    builder.mergeRange(rMeta2, 5, rMeta2, 5, 'Instalación:', {
      font: { name: FONT_NAME, sz: 10, bold: true, color: { rgb: PALETTE.NAVY_SUBHEADER } },
      fill: { fgColor: { rgb: PALETTE.CARD_BG } },
      alignment: { horizontal: 'right', vertical: 'center' },
      border: mediumBorder
    });
    builder.mergeRange(rMeta2, 6, rMeta2, 8, 'Cuarto Frío San Martín', {
      font: { name: FONT_NAME, sz: 10, bold: false, color: { rgb: PALETTE.TEXT_DARK } },
      fill: { fgColor: { rgb: 'FFFFFF' } },
      alignment: { horizontal: 'left', vertical: 'center' },
      border: mediumBorder
    });
    builder.currentRow++;
    builder.addEmptyRow(12);

    // 3. Tarjetas KPI Ejecutivas
    const kpiTopStyle = {
      font: { name: FONT_NAME, sz: 9, bold: true, color: { rgb: PALETTE.TEXT_MUTED } },
      fill: { fgColor: { rgb: PALETTE.CARD_BG } },
      alignment: { horizontal: 'center', vertical: 'center' },
      border: { top: { style: 'thin', color: { rgb: PALETTE.BORDER_MEDIUM } }, left: { style: 'thin', color: { rgb: PALETTE.BORDER_MEDIUM } }, right: { style: 'thin', color: { rgb: PALETTE.BORDER_MEDIUM } } }
    };
    const kpiBottomStyle = {
      font: { name: FONT_NAME, sz: 11.5, bold: true, color: { rgb: PALETTE.NAVY_SUBHEADER } },
      fill: { fgColor: { rgb: PALETTE.CARD_BG } },
      alignment: { horizontal: 'center', vertical: 'center' },
      border: { bottom: { style: 'thin', color: { rgb: PALETTE.BORDER_MEDIUM } }, left: { style: 'thin', color: { rgb: PALETTE.BORDER_MEDIUM } }, right: { style: 'thin', color: { rgb: PALETTE.BORDER_MEDIUM } } }
    };

    builder.setRowHeight(builder.currentRow, 18);
    builder.mergeRange(builder.currentRow, 0, builder.currentRow, 1, 'PRODUCTOS CON MOVIMIENTO', kpiTopStyle);
    builder.mergeRange(builder.currentRow, 2, builder.currentRow, 3, 'TOTAL ENTRADAS (STOCK)', kpiTopStyle);
    builder.mergeRange(builder.currentRow, 4, builder.currentRow, 5, 'TOTAL SALIDAS (STOCK)', kpiTopStyle);
    builder.mergeRange(builder.currentRow, 6, builder.currentRow, 8, 'VALOR TOTAL INVENTARIO', kpiTopStyle);
    builder.currentRow++;

    builder.setRowHeight(builder.currentRow, 22);
    builder.mergeRange(builder.currentRow, 0, builder.currentRow, 1, summaryData.length, kpiBottomStyle, '#,##0');
    builder.mergeRange(builder.currentRow, 2, builder.currentRow, 3, sumEntradas, kpiBottomStyle, '#,##0.00');
    builder.mergeRange(builder.currentRow, 4, builder.currentRow, 5, sumSalidas, kpiBottomStyle, '#,##0.00');
    builder.mergeRange(builder.currentRow, 6, builder.currentRow, 8, invTotal, kpiBottomStyle, '"$"#,##0.00');
    builder.currentRow++;
    builder.addEmptyRow(14);

    // 4. Tabla Detalle de Inventario
    builder.setRowHeight(builder.currentRow, 24);
    builder.mergeRange(builder.currentRow, 0, builder.currentRow, 8, '  1. DETALLE DE EXISTENCIAS Y MOVIMIENTOS POR PRODUCTO', {
      font: { name: FONT_NAME, sz: 10.5, bold: true, color: { rgb: PALETTE.TEXT_WHITE } },
      fill: { fgColor: { rgb: PALETTE.NAVY_SUBHEADER } },
      alignment: { horizontal: 'left', vertical: 'center' }
    });
    builder.currentRow++;

    const invHeaders = ['PRODUCTO / SKU', 'CATEGORÍA', 'U.M.', 'STOCK INICIAL', 'ENTRADAS', 'SALIDAS', 'STOCK FINAL', 'PRECIO UNIT ($)', 'VALOR TOTAL ($)'];
    builder.setRowHeight(builder.currentRow, 22);
    invHeaders.forEach((h, idx) => {
      builder.setCell(builder.currentRow, idx, h, {
        s: {
          font: { name: FONT_NAME, sz: 9.5, bold: true, color: { rgb: PALETTE.TEXT_WHITE } },
          fill: { fgColor: { rgb: PALETTE.NAVY_HEADER } },
          alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
          border: thinBorder
        }
      });
    });
    builder.currentRow++;

    if (summaryData.length > 0) {
      summaryData.forEach((d, idx) => {
        builder.setRowHeight(builder.currentRow, 20);
        const isOdd = idx % 2 === 1;
        const bg = isOdd ? PALETTE.ZEBRA_ODD : PALETTE.ZEBRA_EVEN;
        const cellStyle = (align, bold = false) => ({
          font: { name: FONT_NAME, sz: 9.5, bold, color: { rgb: PALETTE.TEXT_DARK } },
          fill: { fgColor: { rgb: bg } },
          alignment: { horizontal: align, vertical: 'center' },
          border: thinBorder
        });

        builder.setCell(builder.currentRow, 0, d.producto, { s: cellStyle('left') });
        builder.setCell(builder.currentRow, 1, d.categoria, { s: cellStyle('center') });
        builder.setCell(builder.currentRow, 2, d.unidad, { s: cellStyle('center') });
        builder.setCell(builder.currentRow, 3, Number(d.stockInicial || 0), { s: cellStyle('right'), z: '#,##0.00' });
        builder.setCell(builder.currentRow, 4, Number(d.entradas || 0), { s: cellStyle('right'), z: '#,##0.00' });
        builder.setCell(builder.currentRow, 5, Number(d.salidas || 0), { s: cellStyle('right'), z: '#,##0.00' });
        builder.setCell(builder.currentRow, 6, Number(d.stockFinal || 0), { s: cellStyle('right', true), z: '#,##0.00' });
        builder.setCell(builder.currentRow, 7, Number(d.precio || 0), { s: cellStyle('right'), z: Number(d.precio) < 0.01 ? '"$"#,##0.000' : '"$"#,##0.00' });
        builder.setCell(builder.currentRow, 8, Number(d.total || 0), { s: cellStyle('right', true), z: '"$"#,##0.00' });
        builder.currentRow++;
      });
    } else {
      builder.setRowHeight(builder.currentRow, 20);
      builder.mergeRange(builder.currentRow, 0, builder.currentRow, 8, 'Sin movimientos de inventario en el período seleccionado', {
        font: { name: FONT_NAME, sz: 9.5, italic: true, color: { rgb: PALETTE.TEXT_MUTED } },
        fill: { fgColor: { rgb: PALETTE.ZEBRA_EVEN } },
        alignment: { horizontal: 'center', vertical: 'center' },
        border: thinBorder
      });
      builder.currentRow++;
    }

    // Subtotal Inventario
    builder.setRowHeight(builder.currentRow, 22);
    const subStyleInv = {
      font: { name: FONT_NAME, sz: 10, bold: true, color: { rgb: PALETTE.NAVY_SUBHEADER } },
      fill: { fgColor: { rgb: PALETTE.TOTAL_BG } },
      border: subtotalBorder
    };
    builder.mergeRange(builder.currentRow, 0, builder.currentRow, 2, 'TOTAL VALORACIÓN INVENTARIO:', {
      ...subStyleInv,
      alignment: { horizontal: 'right', vertical: 'center' }
    });
    builder.setCell(builder.currentRow, 3, sumStockInicial, { s: { ...subStyleInv, alignment: { horizontal: 'right', vertical: 'center' } }, z: '#,##0.00' });
    builder.setCell(builder.currentRow, 4, sumEntradas, { s: { ...subStyleInv, alignment: { horizontal: 'right', vertical: 'center' } }, z: '#,##0.00' });
    builder.setCell(builder.currentRow, 5, sumSalidas, { s: { ...subStyleInv, alignment: { horizontal: 'right', vertical: 'center' } }, z: '#,##0.00' });
    builder.setCell(builder.currentRow, 6, sumStockFinal, { s: { ...subStyleInv, alignment: { horizontal: 'right', vertical: 'center' } }, z: '#,##0.00' });
    builder.setCell(builder.currentRow, 7, '', { s: subStyleInv });
    builder.setCell(builder.currentRow, 8, invTotal, { s: { ...subStyleInv, alignment: { horizontal: 'right', vertical: 'center' } }, z: '"$"#,##0.00' });
    builder.currentRow++;
    builder.addEmptyRow(14);

    // 5. Tabla Servicios Extraordinarios
    builder.setRowHeight(builder.currentRow, 24);
    builder.mergeRange(builder.currentRow, 0, builder.currentRow, 8, '  2. SERVICIOS EXTRAORDINARIOS (MANIOBRA Y CONTROL DE TEMPERATURA)', {
      font: { name: FONT_NAME, sz: 10.5, bold: true, color: { rgb: PALETTE.TEXT_WHITE } },
      fill: { fgColor: { rgb: PALETTE.ACCENT_AMBER } },
      alignment: { horizontal: 'left', vertical: 'center' }
    });
    builder.currentRow++;

    builder.setRowHeight(builder.currentRow, 22);
    builder.setCell(builder.currentRow, 0, 'FECHA', { s: { font: { name: FONT_NAME, sz: 9.5, bold: true, color: { rgb: PALETTE.TEXT_WHITE } }, fill: { fgColor: { rgb: '334155' } }, alignment: { horizontal: 'center', vertical: 'center' }, border: thinBorder } });
    builder.setCell(builder.currentRow, 1, 'REF. MOV.', { s: { font: { name: FONT_NAME, sz: 9.5, bold: true, color: { rgb: PALETTE.TEXT_WHITE } }, fill: { fgColor: { rgb: '334155' } }, alignment: { horizontal: 'center', vertical: 'center' }, border: thinBorder } });
    builder.mergeRange(builder.currentRow, 2, builder.currentRow, 5, 'DESCRIPCIÓN DEL SERVICIO', { font: { name: FONT_NAME, sz: 9.5, bold: true, color: { rgb: PALETTE.TEXT_WHITE } }, fill: { fgColor: { rgb: '334155' } }, alignment: { horizontal: 'center', vertical: 'center' }, border: thinBorder });
    builder.setCell(builder.currentRow, 6, 'CANTIDAD / LBS', { s: { font: { name: FONT_NAME, sz: 9.5, bold: true, color: { rgb: PALETTE.TEXT_WHITE } }, fill: { fgColor: { rgb: '334155' } }, alignment: { horizontal: 'center', vertical: 'center' }, border: thinBorder } });
    builder.setCell(builder.currentRow, 7, 'TARIFA ($)', { s: { font: { name: FONT_NAME, sz: 9.5, bold: true, color: { rgb: PALETTE.TEXT_WHITE } }, fill: { fgColor: { rgb: '334155' } }, alignment: { horizontal: 'center', vertical: 'center' }, border: thinBorder } });
    builder.setCell(builder.currentRow, 8, 'VALOR ($)', { s: { font: { name: FONT_NAME, sz: 9.5, bold: true, color: { rgb: PALETTE.TEXT_WHITE } }, fill: { fgColor: { rgb: '334155' } }, alignment: { horizontal: 'center', vertical: 'center' }, border: thinBorder } });
    builder.currentRow++;

    let sumServiceQty = 0;
    if (extraServices.length > 0) {
      extraServices.forEach((s, idx) => {
        builder.setRowHeight(builder.currentRow, 20);
        const isOdd = idx % 2 === 1;
        const bg = isOdd ? PALETTE.ZEBRA_AMBER_ODD : PALETTE.ZEBRA_EVEN;
        const sStyle = (align, bold = false) => ({
          font: { name: FONT_NAME, sz: 9.5, bold, color: { rgb: PALETTE.TEXT_DARK } },
          fill: { fgColor: { rgb: bg } },
          alignment: { horizontal: align, vertical: 'center' },
          border: thinBorder
        });

        const qty = Number(s.quantity || 1);
        sumServiceQty += qty;

        builder.setCell(builder.currentRow, 0, formatDate(s.date), { s: sStyle('center') });
        builder.setCell(builder.currentRow, 1, s.ref || 'N/A', { s: sStyle('center') });
        builder.mergeRange(builder.currentRow, 2, builder.currentRow, 5, s.description || 'Servicio extraordinario', sStyle('left'));
        builder.setCell(builder.currentRow, 6, qty, { s: sStyle('right'), z: '#,##0.00' });
        builder.setCell(builder.currentRow, 7, Number(s.unitPrice || 0), { s: sStyle('right'), z: '"$"#,##0.000' });
        builder.setCell(builder.currentRow, 8, Number(s.value || 0), { s: sStyle('right', true), z: '"$"#,##0.00' });
        builder.currentRow++;
      });
    } else {
      builder.setRowHeight(builder.currentRow, 20);
      builder.mergeRange(builder.currentRow, 0, builder.currentRow, 8, 'Sin servicios extraordinarios registrados en este período', {
        font: { name: FONT_NAME, sz: 9.5, italic: true, color: { rgb: PALETTE.TEXT_MUTED } },
        fill: { fgColor: { rgb: PALETTE.ZEBRA_EVEN } },
        alignment: { horizontal: 'center', vertical: 'center' },
        border: thinBorder
      });
      builder.currentRow++;
    }

    // Subtotal Servicios
    builder.setRowHeight(builder.currentRow, 22);
    const subStyleServ = {
      font: { name: FONT_NAME, sz: 10, bold: true, color: { rgb: PALETTE.ACCENT_AMBER } },
      fill: { fgColor: { rgb: 'FEF3C7' } },
      border: subtotalBorder
    };
    builder.mergeRange(builder.currentRow, 0, builder.currentRow, 5, 'TOTAL SERVICIOS EXTRAORDINARIOS:', {
      ...subStyleServ,
      alignment: { horizontal: 'right', vertical: 'center' }
    });
    builder.setCell(builder.currentRow, 6, sumServiceQty, { s: { ...subStyleServ, alignment: { horizontal: 'right', vertical: 'center' } }, z: '#,##0.00' });
    builder.setCell(builder.currentRow, 7, '', { s: subStyleServ });
    builder.setCell(builder.currentRow, 8, totalServicios, { s: { ...subStyleServ, alignment: { horizontal: 'right', vertical: 'center' } }, z: '"$"#,##0.00' });
    builder.currentRow++;
    builder.addEmptyRow(16);

    // 6. Tarjeta de Resumen y Liquidación Final
    builder.setRowHeight(builder.currentRow, 24);
    builder.mergeRange(builder.currentRow, 5, builder.currentRow, 8, 'RESUMEN DE LIQUIDACIÓN Y GRAN TOTAL', {
      font: { name: FONT_NAME, sz: 10.5, bold: true, color: { rgb: PALETTE.TEXT_WHITE } },
      fill: { fgColor: { rgb: PALETTE.NAVY_HEADER } },
      alignment: { horizontal: 'center', vertical: 'center' }
    });
    builder.currentRow++;

    const summaryItem = (label, val, isBold = false, bg = PALETTE.CARD_BG, isGrandTotal = false) => {
      builder.setRowHeight(builder.currentRow, isGrandTotal ? 24 : 20);
      const font = {
        name: FONT_NAME,
        sz: isGrandTotal ? 11 : 10,
        bold: isBold || isGrandTotal,
        color: { rgb: isGrandTotal ? PALETTE.TEXT_WHITE : PALETTE.TEXT_DARK }
      };
      const fill = { fgColor: { rgb: isGrandTotal ? PALETTE.GRAND_TOTAL_BG : bg } };
      const border = isGrandTotal ? grandTotalBorder : mediumBorder;

      builder.mergeRange(builder.currentRow, 5, builder.currentRow, 7, label, {
        font,
        fill,
        alignment: { horizontal: 'right', vertical: 'center' },
        border
      });
      builder.setCell(builder.currentRow, 8, val, {
        s: { font, fill, alignment: { horizontal: 'right', vertical: 'center' }, border },
        z: '"$"#,##0.00'
      });
      builder.currentRow++;
    };

    summaryItem('Subtotal Valoración Inventario:', invTotal);
    summaryItem('Total Servicios Extraordinarios:', totalServicios);
    summaryItem('Subtotal Facturable:', subtotal, true, PALETTE.TOTAL_BG);
    summaryItem('IVA (13%):', iva);
    summaryItem('GRAN TOTAL FACTURABLE:', totalGeneral, true, null, true);

    const ws = builder.build(totalCols);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Resumen_Actividad');
    downloadXLSX(wb, `resumen_actividad_${safeStart}_al_${safeEnd}.xlsx`);
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

    downloadCSV(lines, `resumen_actividad_${safeStart}_al_${safeEnd}.csv`);
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
  const safeCutoff = cutoffDate ? String(cutoffDate) : new Date().toISOString().split('T')[0];
  const formattedDate = formatDate(safeCutoff);
  const title = `CIERRE DE INVENTARIO PARA SEGURO - ${warehouseName}`;
  
  let periodLabel = safeCutoff;
  try {
    const periodDate = new Date(`${safeCutoff}T12:00:00`);
    if (!isNaN(periodDate.getTime())) {
      periodLabel = periodDate.toLocaleDateString('es-SV', { month: 'long', year: 'numeric' });
    }
  } catch {
    periodLabel = safeCutoff;
  }

  const totalPounds = totals.totalPounds || 0;
  const totalBaskets = totals.totalBaskets || 0;
  const totalInsuredValue = totals.totalInsuredValue || 0;
  const totalPremium = totals.totalPremium || 0;

  if (format === 'xlsx') {
    const builder = new StyledSheetBuilder();
    const totalCols = 9;
    builder.setColWidths([14, 38, 12, 15, 14, 15, 16, 18, 16]);

    // 1. Banner Principal
    builder.addBanner(
      `ALMACENADORA LIL · PÓLIZA DE SEGURO DE MERCADERÍA`,
      title,
      totalCols,
      PALETTE.NAVY_SUBHEADER
    );
    builder.addEmptyRow(8);

    // 2. Metadatos
    const rMeta1 = builder.currentRow;
    builder.setRowHeight(rMeta1, 20);
    builder.mergeRange(rMeta1, 0, rMeta1, 0, 'Señores:', {
      font: { name: FONT_NAME, sz: 10, bold: true, color: { rgb: PALETTE.NAVY_SUBHEADER } },
      fill: { fgColor: { rgb: PALETTE.CARD_BG } },
      alignment: { horizontal: 'right', vertical: 'center' },
      border: mediumBorder
    });
    builder.mergeRange(rMeta1, 1, rMeta1, 4, customerName, {
      font: { name: FONT_NAME, sz: 10, bold: true, color: { rgb: PALETTE.TEXT_DARK } },
      fill: { fgColor: { rgb: 'FFFFFF' } },
      alignment: { horizontal: 'left', vertical: 'center' },
      border: mediumBorder
    });
    builder.mergeRange(rMeta1, 5, rMeta1, 5, 'Fecha Emisión:', {
      font: { name: FONT_NAME, sz: 10, bold: true, color: { rgb: PALETTE.NAVY_SUBHEADER } },
      fill: { fgColor: { rgb: PALETTE.CARD_BG } },
      alignment: { horizontal: 'right', vertical: 'center' },
      border: mediumBorder
    });
    builder.mergeRange(rMeta1, 6, rMeta1, 8, `San Martín, ${formattedDate}`, {
      font: { name: FONT_NAME, sz: 10, bold: false, color: { rgb: PALETTE.TEXT_DARK } },
      fill: { fgColor: { rgb: 'FFFFFF' } },
      alignment: { horizontal: 'left', vertical: 'center' },
      border: mediumBorder
    });
    builder.currentRow++;

    const rMeta2 = builder.currentRow;
    builder.setRowHeight(rMeta2, 20);
    builder.mergeRange(rMeta2, 0, rMeta2, 0, 'Póliza / Mes:', {
      font: { name: FONT_NAME, sz: 10, bold: true, color: { rgb: PALETTE.NAVY_SUBHEADER } },
      fill: { fgColor: { rgb: PALETTE.CARD_BG } },
      alignment: { horizontal: 'right', vertical: 'center' },
      border: mediumBorder
    });
    builder.mergeRange(rMeta2, 1, rMeta2, 4, `${warehouseName} - Mes: ${periodLabel}`, {
      font: { name: FONT_NAME, sz: 10, bold: false, color: { rgb: PALETTE.TEXT_DARK } },
      fill: { fgColor: { rgb: 'FFFFFF' } },
      alignment: { horizontal: 'left', vertical: 'center' },
      border: mediumBorder
    });
    builder.mergeRange(rMeta2, 5, rMeta2, 5, 'Tasa de Prima:', {
      font: { name: FONT_NAME, sz: 10, bold: true, color: { rgb: PALETTE.NAVY_SUBHEADER } },
      fill: { fgColor: { rgb: PALETTE.CARD_BG } },
      alignment: { horizontal: 'right', vertical: 'center' },
      border: mediumBorder
    });
    builder.mergeRange(rMeta2, 6, rMeta2, 8, `${premiumRate}% sobre valor CIF`, {
      font: { name: FONT_NAME, sz: 10, bold: true, color: { rgb: PALETTE.ACCENT_BLUE } },
      fill: { fgColor: { rgb: 'FFFFFF' } },
      alignment: { horizontal: 'left', vertical: 'center' },
      border: mediumBorder
    });
    builder.currentRow++;
    builder.addEmptyRow(12);

    // 3. Cabeceras de Tabla
    builder.setRowHeight(builder.currentRow, 24);
    const seguroHeaders = ['CÓDIGO', 'MATERIAL / DESCRIPCIÓN', 'UNIDADES', 'TOTAL LB', 'TOTAL CESTA', 'VALOR POR LB $', 'VALOR POR CESTA $', 'TOTAL $ (VALOR CIF)', `PRIMA (${premiumRate}%)`];
    seguroHeaders.forEach((h, idx) => {
      builder.setCell(builder.currentRow, idx, h, {
        s: {
          font: { name: FONT_NAME, sz: 9.5, bold: true, color: { rgb: PALETTE.TEXT_WHITE } },
          fill: { fgColor: { rgb: PALETTE.NAVY_HEADER } },
          alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
          border: thinBorder
        }
      });
    });
    builder.currentRow++;

    // 4. Filas de Datos
    if (reportRows.length > 0) {
      reportRows.forEach((row, idx) => {
        builder.setRowHeight(builder.currentRow, 20);
        const isOdd = idx % 2 === 1;
        const bg = isOdd ? PALETTE.ZEBRA_ODD : PALETTE.ZEBRA_EVEN;
        const cellStyle = (align, bold = false) => ({
          font: { name: FONT_NAME, sz: 9.5, bold, color: { rgb: PALETTE.TEXT_DARK } },
          fill: { fgColor: { rgb: bg } },
          alignment: { horizontal: align, vertical: 'center' },
          border: thinBorder
        });

        builder.setCell(builder.currentRow, 0, row.code, { s: cellStyle('center') });
        builder.setCell(builder.currentRow, 1, row.material, { s: cellStyle('left') });
        builder.setCell(builder.currentRow, 2, Number(row.units || 0), { s: cellStyle('right'), z: '#,##0' });
        builder.setCell(builder.currentRow, 3, Number(row.pounds || 0), { s: cellStyle('right'), z: '#,##0.00' });
        builder.setCell(builder.currentRow, 4, Number(row.baskets || 0), { s: cellStyle('right'), z: '#,##0' });
        builder.setCell(builder.currentRow, 5, row.poundRate != null && row.poundRate !== '' ? Number(row.poundRate) : '', { s: cellStyle('right'), z: '"$"#,##0.00' });
        builder.setCell(builder.currentRow, 6, row.basketRate != null && row.basketRate !== '' ? Number(row.basketRate) : '', { s: cellStyle('right'), z: '"$"#,##0.00' });
        builder.setCell(builder.currentRow, 7, Number(row.insuredValue || 0), { s: cellStyle('right', true), z: '"$"#,##0.00' });
        builder.setCell(builder.currentRow, 8, Number(row.premium || 0), { s: cellStyle('right', true), z: '"$"#,##0.00' });
        builder.currentRow++;
      });
    } else {
      builder.setRowHeight(builder.currentRow, 20);
      builder.mergeRange(builder.currentRow, 0, builder.currentRow, 8, 'Sin productos para corte en esta fecha', {
        font: { name: FONT_NAME, sz: 9.5, italic: true, color: { rgb: PALETTE.TEXT_MUTED } },
        fill: { fgColor: { rgb: PALETTE.ZEBRA_EVEN } },
        alignment: { horizontal: 'center', vertical: 'center' },
        border: thinBorder
      });
      builder.currentRow++;
    }

    // 5. Fila Total
    builder.setRowHeight(builder.currentRow, 22);
    const subStyleSeg = {
      font: { name: FONT_NAME, sz: 10, bold: true, color: { rgb: PALETTE.NAVY_SUBHEADER } },
      fill: { fgColor: { rgb: PALETTE.TOTAL_BG } },
      border: subtotalBorder
    };
    builder.mergeRange(builder.currentRow, 0, builder.currentRow, 1, 'TOTAL GENERAL:', {
      ...subStyleSeg,
      alignment: { horizontal: 'right', vertical: 'center' }
    });
    builder.setCell(builder.currentRow, 2, '', { s: subStyleSeg });
    builder.setCell(builder.currentRow, 3, totalPounds, { s: { ...subStyleSeg, alignment: { horizontal: 'right', vertical: 'center' } }, z: '#,##0.00' });
    builder.setCell(builder.currentRow, 4, totalBaskets, { s: { ...subStyleSeg, alignment: { horizontal: 'right', vertical: 'center' } }, z: '#,##0' });
    builder.setCell(builder.currentRow, 5, '', { s: subStyleSeg });
    builder.setCell(builder.currentRow, 6, '', { s: subStyleSeg });
    builder.setCell(builder.currentRow, 7, totalInsuredValue, { s: { ...subStyleSeg, alignment: { horizontal: 'right', vertical: 'center' } }, z: '"$"#,##0.00' });
    builder.setCell(builder.currentRow, 8, totalPremium, { s: { ...subStyleSeg, alignment: { horizontal: 'right', vertical: 'center' } }, z: '"$"#,##0.00' });
    builder.currentRow++;
    builder.addEmptyRow(14);

    // 6. Resumen de Cierre de Seguro
    builder.setRowHeight(builder.currentRow, 22);
    builder.mergeRange(builder.currentRow, 4, builder.currentRow, 8, `El seguro se facturará por el monto de: $${formatCurrency(totalPremium)}`, {
      font: { name: FONT_NAME, sz: 11, bold: true, color: { rgb: PALETTE.TEXT_WHITE } },
      fill: { fgColor: { rgb: PALETTE.GRAND_TOTAL_BG } },
      alignment: { horizontal: 'center', vertical: 'center' }
    });
    builder.currentRow++;
    builder.addEmptyRow(12);

    builder.setRowHeight(builder.currentRow, 20);
    builder.mergeRange(builder.currentRow, 0, builder.currentRow, 4, 'Atentamente: Ing. Raúl Sosa / Gerencia de Operaciones', {
      font: { name: FONT_NAME, sz: 9.5, italic: true, color: { rgb: PALETTE.TEXT_MUTED } },
      alignment: { horizontal: 'left', vertical: 'center' }
    });

    const ws = builder.build(totalCols);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Corte_Seguro');
    downloadXLSX(wb, `corte_seguro_${safeCutoff}.xlsx`);
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

    downloadCSV(lines, `corte_seguro_${safeCutoff}.csv`);
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

    if (movements.length > 0) {
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
              it.temperature != null && it.temperature !== '' ? Number(it.temperature) : '',
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
    } else {
      wsData.push(['', 'Sin movimientos registrados', '', '', '', '', '', '', '', '', '', '', '', 0, 0, 0, '']);
    }

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

    if (products.length > 0) {
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
    }

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

    if (systemLogs.length > 0) {
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
    }

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
