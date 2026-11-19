import { formatDate, formatCurrency, formatPrice } from './formatUtils.js';
import { CONTRACT_INFO } from './contractRates.js';

/**
 * Escapa caracteres especiales HTML para prevenir XSS en documentos exportados.
 */
export const escapeHtml = (value) => {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
};

/**
 * Genera el documento HTML compatible con Microsoft Word (.doc) para Summary2.
 */
export const buildSummary2WordHtml = ({
  clientName = CONTRACT_INFO.clientName,
  startDate = '',
  endDate = '',
  daysCount = 0,
  activeCut = null,
  showCongelados = true,
  showPreparados = true,
  congeladosRows = [],
  preparadosRows = [],
  congTotals = { invInicial: 0, entradas: 0, salidas: 0, stockFinal: 0, totalMonto: 0 },
  prepTotals = { invInicial: 0, entradas: 0, salidas: 0, stockFinal: 0, totalMonto: 0 },
  servicesData = [],
  totalServicios = 0,
  totalServiciosQty = 0,
  reportSubtotal = 0,
  reportIva = 0,
  reportGrandTotal = 0
} = {}) => {
  const title = activeCut
    ? activeCut.title
    : `Resumen Diario ${formatDate(startDate)} al ${formatDate(endDate)}`;

  let html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
    <head>
      <meta charset="utf-8">
      <title>${escapeHtml(title)}</title>
      <style>
        body { font-family: Arial, sans-serif; font-size: 11pt; color: #333; }
        table { border-collapse: collapse; width: 100%; margin-bottom: 20px; font-size: 9pt; }
        th, td { border: 1px solid #ddd; padding: 6px 8px; text-align: right; }
        th { background-color: #f2f2f2; text-align: center; font-weight: bold; color: #333; }
        td:nth-child(1), td:nth-child(2) { text-align: left; }
        h2 { font-size: 11pt; margin-top: 20px; padding-bottom: 5px; color: #444; }
        .header { margin-bottom: 20px; }
        .header p { margin: 3px 0; font-size: 10pt; }
        .bold { font-weight: bold; }
        .totals { font-weight: bold; background-color: #f9f9f9; }
        .grand-totals { margin-top: 30px; text-align: right; }
        .grand-totals p { margin: 4px 0; font-size: 10pt; }
        .grand-totals .main-total { font-weight: bold; font-size: 12pt; margin-top: 10px; }
      </style>
    </head>
    <body>`;

  html += `<div class="header">
      <p class="bold" style="font-size: 12pt;">${escapeHtml(CONTRACT_INFO.contractorName)}</p>
      <p>${escapeHtml(CONTRACT_INFO.facility)}</p>
      <p>Cliente: ${escapeHtml(clientName)}</p>
      <p>Período de Facturación: ${escapeHtml(formatDate(startDate))} al ${escapeHtml(formatDate(endDate))} (${Number(daysCount || 0)} días)</p>
      ${activeCut ? `<p class="bold">[Corte Congelado: ${escapeHtml(activeCut.title)}]</p>` : ''}
    </div>`;

  if (showCongelados && congeladosRows.length > 0) {
    html += `<h2>1. ALMACENAMIENTO PRODUCTO CONGELADO (-18°C) - Tarifa: $0.001 / libra / día</h2>
      <table>
        <thead>
          <tr><th>FECHA</th><th>DESCRIPCION</th><th>INV-INICIAL</th><th>ENTRADAS</th><th>SALIDAS</th><th>TOTAL LBS</th><th>PRECIO</th><th>TOTAL $</th></tr>
        </thead>
        <tbody>`;

    congeladosRows.forEach(r => {
      html += `<tr>
          <td>${escapeHtml(formatDate(r.fecha))}</td>
          <td>${escapeHtml(r.descripcion)}</td>
          <td>${Number(r.stockInicial || 0).toLocaleString('en-US')}</td>
          <td>${Number(r.entradas || 0).toLocaleString('en-US')}</td>
          <td>${Number(r.salidas || 0).toLocaleString('en-US')}</td>
          <td>${Number(r.stockFinal || 0).toLocaleString('en-US')}</td>
          <td>$${formatPrice(r.precio)}</td>
          <td>$${formatCurrency(r.totalMonto)}</td>
        </tr>`;
    });

    html += `<tr class="totals">
        <td colspan="2">TOTALES</td>
        <td>${Number(congTotals.invInicial || 0).toLocaleString('en-US')}</td>
        <td>${Number(congTotals.entradas || 0).toLocaleString('en-US')}</td>
        <td>${Number(congTotals.salidas || 0).toLocaleString('en-US')}</td>
        <td>${Number(congTotals.stockFinal || 0).toLocaleString('en-US')}</td>
        <td></td>
        <td>$${formatCurrency(congTotals.totalMonto)}</td>
      </tr></tbody></table>`;
  }

  if (showPreparados && preparadosRows.length > 0) {
    html += `<h2>2. ALMACENAMIENTO PRODUCTOS PREPARADOS - Tarifa: $0.038 / cesta / día</h2>
      <table>
        <thead>
          <tr><th>FECHA</th><th>DESCRIPCION</th><th>INV CESTAS</th><th>ENTRADAS</th><th>SALIDAS</th><th>TOTAL CESTAS</th><th>PRECIO</th><th>TOTAL $</th></tr>
        </thead>
        <tbody>`;

    preparadosRows.forEach(r => {
      html += `<tr>
          <td>${escapeHtml(formatDate(r.fecha))}</td>
          <td>${escapeHtml(r.descripcion)}</td>
          <td>${Number(r.stockInicial || 0).toLocaleString('en-US')}</td>
          <td>${Number(r.entradas || 0).toLocaleString('en-US')}</td>
          <td>${Number(r.salidas || 0).toLocaleString('en-US')}</td>
          <td>${Number(r.stockFinal || 0).toLocaleString('en-US')}</td>
          <td>$${formatPrice(r.precio)}</td>
          <td>$${formatCurrency(r.totalMonto)}</td>
        </tr>`;
    });

    html += `<tr class="totals">
        <td colspan="2">TOTALES</td>
        <td>${Number(prepTotals.invInicial || 0).toLocaleString('en-US')}</td>
        <td>${Number(prepTotals.entradas || 0).toLocaleString('en-US')}</td>
        <td>${Number(prepTotals.salidas || 0).toLocaleString('en-US')}</td>
        <td>${Number(prepTotals.stockFinal || 0).toLocaleString('en-US')}</td>
        <td></td>
        <td>$${formatCurrency(prepTotals.totalMonto)}</td>
      </tr></tbody></table>`;
  }

  if (servicesData.length > 0) {
    html += `<h2>3. SERVICIOS EXTRA-ORDINARIOS (MANIOBRAS, HORAS EXTRAS, TEMPERATURA)</h2>
      <table>
        <thead>
          <tr><th>FECHA</th><th>DESCRIPCION</th><th>TOTAL (CANT/LBS)</th><th>PRECIO</th><th>VALOR</th></tr>
        </thead>
        <tbody>`;

    servicesData.forEach(s => {
      const descText = String(s.description || '') + (s.ref ? ` (${s.ref})` : '');
      html += `<tr>
          <td>${escapeHtml(formatDate(s.date))}</td>
          <td>${escapeHtml(descText)}</td>
          <td>${s.quantity ? Number(s.quantity).toLocaleString('en-US', { maximumFractionDigits: 2 }) : '1'}</td>
          <td>${s.unitPrice ? `$${formatPrice(s.unitPrice)}` : `$${formatCurrency(s.value)}`}</td>
          <td>$${formatCurrency(s.value)}</td>
        </tr>`;
    });

    html += `<tr class="totals">
        <td colspan="2">TOTALES</td>
        <td>${Number(totalServiciosQty || 0).toLocaleString('en-US')}</td>
        <td></td>
        <td>$${formatCurrency(totalServicios)}</td>
      </tr></tbody></table>`;
  }

  html += `<div class="grand-totals">
      ${showCongelados ? `<p>Almacenamiento Congelados: $${formatCurrency(congTotals.totalMonto)}</p>` : ''}
      ${showPreparados ? `<p>Almacenamiento Preparados: $${formatCurrency(prepTotals.totalMonto)}</p>` : ''}
      <p>Servicios Extra-ordinarios: $${formatCurrency(totalServicios)}</p>
      <p>Sub Total: $${formatCurrency(reportSubtotal)}</p>
      <p>IVA (13%): $${formatCurrency(reportIva)}</p>
      <p class="main-total">TOTAL GENERAL: $${formatCurrency(reportGrandTotal)}</p>
    </div>
    </body></html>`;

  return html;
};

/**
 * Descarga el reporte Summary2 en formato Word (.doc).
 */
export const exportSummary2Word = (params) => {
  const html = buildSummary2WordHtml(params);
  const blob = new Blob(['\ufeff', html], { type: 'application/msword' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `Resumen_${formatDate(params.startDate).replace(/\//g, '-')}_al_${formatDate(params.endDate).replace(/\//g, '-')}.doc`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

/**
 * Genera y descarga el reporte Summary2 en formato PDF.
 */
export const exportSummary2PDF = async ({
  clientName = CONTRACT_INFO.clientName,
  startDate = '',
  endDate = '',
  daysCount = 0,
  activeCut = null,
  showCongelados = true,
  showPreparados = true,
  congeladosRows = [],
  preparadosRows = [],
  congTotals = { invInicial: 0, entradas: 0, salidas: 0, stockFinal: 0, totalMonto: 0 },
  prepTotals = { invInicial: 0, entradas: 0, salidas: 0, stockFinal: 0, totalMonto: 0 },
  servicesData = [],
  totalServicios = 0,
  totalServiciosQty = 0,
  reportSubtotal = 0,
  reportIva = 0,
  reportGrandTotal = 0
} = {}) => {
  const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable')
  ]);
  const doc = new jsPDF('p', 'mm', 'letter');

  doc.setFontSize(11);
  doc.setFont(undefined, 'bold');
  doc.text(CONTRACT_INFO.contractorName, 14, 15);
  doc.setFontSize(8.5);
  doc.setFont(undefined, 'normal');
  doc.text(CONTRACT_INFO.facility, 14, 20);
  doc.text(`Cliente: ${clientName}`, 14, 25);
  doc.text(`Período de Facturación: ${formatDate(startDate)} al ${formatDate(endDate)} (${daysCount} días)`, 14, 30);

  if (activeCut) {
    doc.setFont(undefined, 'bold');
    doc.text(`[Corte Congelado: ${activeCut.title}]`, 14, 35);
    doc.setFont(undefined, 'normal');
  }

  doc.setLineWidth(0.5);
  doc.line(14, 37, 200, 37);

  let currentY = 42;

  if (showCongelados && congeladosRows.length > 0) {
    doc.setFontSize(9);
    doc.setFont(undefined, 'bold');
    doc.text('1. ALMACENAMIENTO PRODUCTO CONGELADO (-18°C) - Tarifa: $0.001 / libra / día', 14, currentY);

    const congBody = congeladosRows.map(r => [
      formatDate(r.fecha),
      r.descripcion,
      Number(r.stockInicial || 0).toLocaleString('en-US'),
      Number(r.entradas || 0).toLocaleString('en-US'),
      Number(r.salidas || 0).toLocaleString('en-US'),
      Number(r.stockFinal || 0).toLocaleString('en-US'),
      `$${formatPrice(r.precio)}`,
      `$${formatCurrency(r.totalMonto)}`
    ]);

    congBody.push([
      'TOTALES',
      '',
      congTotals.invInicial.toLocaleString('en-US'),
      congTotals.entradas.toLocaleString('en-US'),
      congTotals.salidas.toLocaleString('en-US'),
      congTotals.stockFinal.toLocaleString('en-US'),
      '',
      `$${formatCurrency(congTotals.totalMonto)}`
    ]);

    autoTable(doc, {
      head: [['FECHA', 'DESCRIPCION', 'INV-INICIAL', 'ENTRADAS', 'SALIDAS', 'TOTAL LBS', 'PRECIO', 'TOTAL $']],
      body: congBody,
      startY: currentY + 2,
      styles: { fontSize: 6.5, cellPadding: 1 },
      headStyles: { fillColor: [41, 128, 185], textColor: 255, fontStyle: 'bold' }
    });

    currentY = doc.lastAutoTable.finalY + 6;
  }

  if (showPreparados && preparadosRows.length > 0) {
    if (currentY > 220) { doc.addPage(); currentY = 15; }

    doc.setFontSize(9);
    doc.setFont(undefined, 'bold');
    doc.text('2. ALMACENAMIENTO PRODUCTOS PREPARADOS - Tarifa: $0.038 / cesta / día', 14, currentY);

    const prepBody = preparadosRows.map(r => [
      formatDate(r.fecha),
      r.descripcion,
      Number(r.stockInicial || 0).toLocaleString('en-US'),
      Number(r.entradas || 0).toLocaleString('en-US'),
      Number(r.salidas || 0).toLocaleString('en-US'),
      Number(r.stockFinal || 0).toLocaleString('en-US'),
      `$${formatPrice(r.precio)}`,
      `$${formatCurrency(r.totalMonto)}`
    ]);

    prepBody.push([
      'TOTALES',
      '',
      prepTotals.invInicial.toLocaleString('en-US'),
      prepTotals.entradas.toLocaleString('en-US'),
      prepTotals.salidas.toLocaleString('en-US'),
      prepTotals.stockFinal.toLocaleString('en-US'),
      '',
      `$${formatCurrency(prepTotals.totalMonto)}`
    ]);

    autoTable(doc, {
      head: [['FECHA', 'DESCRIPCION', 'INV CESTAS', 'ENTRADAS', 'SALIDAS', 'TOTAL CESTAS', 'PRECIO', 'TOTAL $']],
      body: prepBody,
      startY: currentY + 2,
      styles: { fontSize: 6.5, cellPadding: 1 },
      headStyles: { fillColor: [39, 174, 96], textColor: 255, fontStyle: 'bold' }
    });

    currentY = doc.lastAutoTable.finalY + 6;
  }

  if (servicesData.length > 0) {
    if (currentY > 220) { doc.addPage(); currentY = 15; }

    doc.setFontSize(9);
    doc.setFont(undefined, 'bold');
    doc.text('3. SERVICIOS EXTRA-ORDINARIOS (MANIOBRAS, HORAS EXTRAS, TEMPERATURA)', 14, currentY);

    const servRows = servicesData.map(s => [
      formatDate(s.date),
      s.description + (s.ref ? ` (${s.ref})` : ''),
      s.quantity ? Number(s.quantity).toLocaleString('en-US', { maximumFractionDigits: 2 }) : '1',
      s.unitPrice ? `$${formatPrice(s.unitPrice)}` : `$${formatCurrency(s.value)}`,
      `$${formatCurrency(s.value)}`
    ]);

    servRows.push(['TOTALES', '', totalServiciosQty.toLocaleString('en-US'), '', `$${formatCurrency(totalServicios)}`]);

    autoTable(doc, {
      head: [['FECHA', 'DESCRIPCION', 'TOTAL (CANT/LBS)', 'PRECIO', 'VALOR']],
      body: servRows,
      startY: currentY + 2,
      styles: { fontSize: 6.5, cellPadding: 1 },
      headStyles: { fillColor: [52, 73, 94], textColor: 255, fontStyle: 'bold' }
    });

    currentY = doc.lastAutoTable.finalY + 6;
  }

  if (currentY > 235) { doc.addPage(); currentY = 15; }

  doc.setFontSize(8.5);
  doc.setFont(undefined, 'normal');
  if (showCongelados) doc.text(`Almacenamiento Congelados: $${formatCurrency(congTotals.totalMonto)}`, 130, currentY);
  if (showPreparados) doc.text(`Almacenamiento Preparados: $${formatCurrency(prepTotals.totalMonto)}`, 130, currentY + 4);
  doc.text(`Servicios Extra-ordinarios: $${formatCurrency(totalServicios)}`, 130, currentY + 8);
  doc.text(`Sub Total: $${formatCurrency(reportSubtotal)}`, 130, currentY + 12);
  doc.text(`IVA (13%): $${formatCurrency(reportIva)}`, 130, currentY + 16);
  doc.setFont(undefined, 'bold');
  doc.text(`TOTAL GENERAL: $${formatCurrency(reportGrandTotal)}`, 130, currentY + 21);

  doc.save(`Cuadro_cliente_cuarto_frio_${startDate}_al_${endDate}.pdf`);
};
