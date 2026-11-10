import {
  formatDate,
  formatCurrency,
  formatPrice,
  formatTimeShort,
  findProductForMovementItem,
  toLocalDateISO
} from './formatUtils.js';
import { formatTemperatureDisplay, resolveServiceDetails } from './contractRates.js';

export { formatTimeShort, findProductForMovementItem };

/**
 * Escapa caracteres especiales HTML para prevenir XSS en plantillas de impresión
 */
const escapeHtml = (value) => {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
};

/**
 * Valida que una fuente de imagen sea segura para incrustar.
 * Rechaza svg+xml para prevenir ejecución de scripts embebidos.
 * En modo rasterBase64Only (documentos Word .doc), bloquea URLs remotas/relativas para evitar beacons externos/UNC.
 */
export const sanitizeLogoSrc = (logo, { rasterBase64Only = false } = {}) => {
  if (!logo || typeof logo !== 'string') return null;
  const trimmed = logo.trim();
  if (/^data:image\/(png|jpeg|jpg|webp|gif);base64,/i.test(trimmed)) {
    return trimmed;
  }
  if (rasterBase64Only) {
    return null;
  }
  if ((trimmed.startsWith('/') && !trimmed.startsWith('//')) || /^https:\/\//i.test(trimmed)) {
    return trimmed;
  }
  return null;
};

/**
 * Calcula la duración legible entre hora de inicio y hora de fin
 */
export const computeDurationLabel = (timeStart, timeEnd) => {
  if (!timeStart || !timeEnd) return '';
  const startParts = String(timeStart).split(':').map(Number);
  const endParts = String(timeEnd).split(':').map(Number);
  if (startParts.length < 2 || endParts.length < 2) return '';
  if (Number.isNaN(startParts[0]) || Number.isNaN(startParts[1]) || Number.isNaN(endParts[0]) || Number.isNaN(endParts[1])) {
    return '';
  }

  const startMins = startParts[0] * 60 + startParts[1];
  let endMins = endParts[0] * 60 + endParts[1];
  if (endMins < startMins) {
    endMins += 24 * 60; // Turno nocturno que cruza medianoche
  }

  const diff = endMins - startMins;
  if (diff <= 0) return '';
  const hours = Math.floor(diff / 60);
  const mins = diff % 60;
  if (hours > 0 && mins > 0) return `${hours}h ${mins}m`;
  if (hours > 0) return `${hours}h`;
  return `${mins} min`;
};

/**
 * Formatea peso en libras respetando precisión DECIMAL(15,3) sin redondeo truncado
 */
export const formatMovementPounds = (value) => {
  const num = Number(value || 0);
  if (Number.isNaN(num)) return '0.00';
  return num.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 3
  });
};

/**
 * Construye el modelo estructurado de datos del movimiento para el modal de detalle,
 * impresión de Nota de Envío / Nota de Recibido y exportación a PDF.
 */
export const buildMovementNoteData = ({
  movement,
  products = [],
  productsMap = null,
  settings = {},
  contractRates = {},
  observations = '',
  includeServices = true,
  rasterBase64Only = false
}) => {
  const mov = movement || {};
  const isExit = mov.type === 'out';

  const noteTitle = isExit ? 'NOTA DE ENVÍO' : 'NOTA DE RECIBIDO';
  const noteShortLabel = isExit ? 'Nota de Envío' : 'Nota de Recibido';
  const noteSubtitle = isExit
    ? 'Comprobante Oficial de Salida y Despacho de Mercancía'
    : 'Comprobante Oficial de Entrada y Recepción de Mercancía';
  const operationTypeLabel = isExit ? 'SALIDA DE ALMACÉN (DESPACHO)' : 'ENTRADA A ALMACÉN (RECEPCIÓN)';
  const scheduleLabel = isExit ? 'Horario de Carga' : 'Horario de Descarga';

  const declarationText = isExit
    ? 'Por medio de la presente se hace constar el DESPACHO Y ENVÍO desde almacén de los productos detallados a continuación, habiéndose verificado cantidades físicas, peso neto, cestas/embalajes, sello de seguridad y temperatura de cadena de frío.'
    : 'Por medio de la presente se hace constar que se ha RECIBIDO en almacén el detalle de productos descrito a continuación, habiéndose verificado cantidades físicas, peso neto, cestas/embalajes y control de temperatura de recepción.';

  const companyName = contractRates?.contractorName || settings?.name || 'Inventario Pro';
  const systemName = settings?.name || 'Inventario Pro';
  const facilityName = contractRates?.facility || '';
  const clientName = contractRates?.clientName || '';
  const logoSrc = sanitizeLogoSrc(settings?.logo, { rasterBase64Only });

  const docType = mov.refType || 'Documento';
  const refNumber = mov.refNumber ? String(mov.refNumber) : 'S/N';
  const internalId = mov.id ? String(mov.id).slice(0, 8).toUpperCase() : 'LOCAL';
  const formattedDate = formatDate(mov.date) || 'N/A';
  const timeStart = formatTimeShort(mov.timeStart);
  const timeEnd = formatTimeShort(mov.timeEnd);
  const durationLabel = computeDurationLabel(mov.timeStart, mov.timeEnd);
  const carrier = mov.carrier || 'No especificado';
  const equipment = mov.equipment || 'No especificado';
  const seal = mov.seal || 'Sin marchamo';
  const auditUser = mov.auditUser || 'Sistema';

  const rawItems = Array.isArray(mov.items) ? mov.items : [];
  const items = rawItems.map((it, idx) => {
    const product = findProductForMovementItem(it, products, productsMap);
    const hasTemp =
      it.temperature !== null &&
      it.temperature !== undefined &&
      String(it.temperature).trim() !== '' &&
      !Number.isNaN(Number(it.temperature));
    const tempNumeric = hasTemp ? Number(it.temperature) : null;
    const tempFormatted = hasTemp ? `${formatTemperatureDisplay(tempNumeric)} °C` : '—';
    const isTempOutOfRange = hasTemp && tempNumeric > -14.0;

    return {
      index: idx + 1,
      productId: it.productId,
      sku: product?.sku || it.sku || String(it.productId || 'N/A'),
      description: product?.description || it.description || 'Producto no encontrado en catálogo',
      category: product?.category || it.category || 'General',
      hasTemp,
      tempNumeric,
      tempFormatted,
      isTempOutOfRange,
      qtyUnits: Number(it.qtyUnits || 0),
      qtyPounds: Number(it.qtyPounds || 0),
      qtyBaskets: Number(it.qtyBaskets || 0)
    };
  });

  const totalUnits = items.reduce((sum, it) => sum + it.qtyUnits, 0);
  const totalPounds = items.reduce((sum, it) => sum + it.qtyPounds, 0);
  const totalBaskets = items.reduce((sum, it) => sum + it.qtyBaskets, 0);

  const itemsWithTemp = items.filter((it) => it.hasTemp);
  const hasAnyTemp = itemsWithTemp.length > 0;
  const avgTemp = hasAnyTemp
    ? itemsWithTemp.reduce((sum, it) => sum + it.tempNumeric, 0) / itemsWithTemp.length
    : null;
  const avgTempFormatted = hasAnyTemp ? `${formatTemperatureDisplay(avgTemp)} °C` : 'N/A';
  const isAvgTempOutOfRange = hasAnyTemp && avgTemp > -14.0;

  const rawServices = Array.isArray(mov.services) ? mov.services : [];
  const services = rawServices.map((s, idx) => {
    const resolved = resolveServiceDetails(s);
    return {
      index: idx + 1,
      description: resolved.description || 'Servicio extraordinario',
      quantity: Number(resolved.quantity || 1),
      unitPrice: Number(resolved.unitPrice || 0),
      value: Number(resolved.value || 0)
    };
  });
  const totalServicesValue = services.reduce((sum, s) => sum + s.value, 0);

  const signatures = isExit
    ? [
        {
          role: 'DESPACHADO POR (ALMACÉN)',
          primaryLine: `Auditor: ${auditUser}`,
          secondaryLine: 'Firma y Sello de Almacén'
        },
        {
          role: 'TRANSPORTADO POR (MOTORISTA)',
          primaryLine: mov.carrier ? `Transporte: ${mov.carrier}` : 'Nombre: ________________________',
          secondaryLine: `Equipo/Placa: ${mov.equipment || '__________'} • Firma / DUI`
        },
        {
          role: 'RECIBIDO CONFORME (DESTINO)',
          primaryLine: 'Nombre: ________________________',
          secondaryLine: 'Firma, Sello y Hora de Recepción'
        }
      ]
    : [
        {
          role: 'ENTREGADO POR (TRANSPORTE)',
          primaryLine: mov.carrier ? `Transporte: ${mov.carrier}` : 'Nombre: ________________________',
          secondaryLine: `Equipo/Placa: ${mov.equipment || '__________'} • Firma / DUI`
        },
        {
          role: 'RECIBIDO POR (ALMACÉN)',
          primaryLine: `Auditor: ${auditUser}`,
          secondaryLine: 'Firma y Sello de Recepción'
        },
        {
          role: 'SUPERVISIÓN / CALIDAD',
          primaryLine: 'Nombre: ________________________',
          secondaryLine: 'Firma y Conformidad Cadena de Frío'
        }
      ];

  const now = new Date();
  const printedAt = `${String(now.getDate()).padStart(2, '0')}/${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

  return {
    isExit,
    noteTitle,
    noteShortLabel,
    noteSubtitle,
    operationTypeLabel,
    scheduleLabel,
    declarationText,
    companyName,
    systemName,
    facilityName,
    clientName,
    logoSrc,
    docType,
    refNumber,
    internalId,
    formattedDate,
    rawDate: mov.date || '',
    timeStart,
    timeEnd,
    durationLabel,
    carrier,
    equipment,
    seal,
    auditUser,
    items,
    totals: {
      totalItems: items.length,
      totalUnits,
      totalPounds,
      totalBaskets,
      hasAnyTemp,
      avgTemp,
      avgTempFormatted,
      isAvgTempOutOfRange
    },
    services,
    totalServicesValue,
    includeServices: Boolean(includeServices && services.length > 0),
    observations: String(observations || '').trim(),
    signatures,
    printedAt
  };
};

/**
 * Construye el documento HTML completo optimizado para impresión en hoja Carta (Letter)
 */
const buildPrintableNoteHtml = (data) => {
  const accentPrimary = data.isExit ? '#1e3a8a' : '#065f46';
  const accentBadgeBg = data.isExit ? '#eff6ff' : '#ecfdf5';
  const accentBorder = data.isExit ? '#93c5fd' : '#6ee7b7';

  const itemsRowsHtml =
    data.items.length === 0
      ? `<tr><td colspan="7" style="text-align:center; padding: 14px; color:#64748b;">No hay productos registrados en este movimiento.</td></tr>`
      : data.items
          .map(
            (it) => `
          <tr>
            <td class="num-center">${it.index}</td>
            <td class="sku-cell">${escapeHtml(it.sku)}</td>
            <td>
              <div class="prod-desc">${escapeHtml(it.description)}</div>
              ${it.category ? `<div class="prod-cat">${escapeHtml(it.category)}</div>` : ''}
            </td>
            <td class="num-center ${it.isTempOutOfRange ? 'temp-warn' : ''}">${escapeHtml(it.tempFormatted)}</td>
            <td class="num-right">${it.qtyUnits.toLocaleString('en-US')}</td>
            <td class="num-right">${formatMovementPounds(it.qtyPounds)}</td>
            <td class="num-right">${it.qtyBaskets.toLocaleString('en-US')}</td>
          </tr>
        `
          )
          .join('');

  const servicesSectionHtml = data.includeServices
    ? `
      <div class="section-block">
        <div class="section-title">Servicios Extraordinarios / Maniobras Asociadas</div>
        <table class="data-table">
          <thead>
            <tr>
              <th style="width: 38px; text-align: center;">#</th>
              <th>Descripción del Servicio</th>
              <th style="width: 110px; text-align: right;">Cantidad / Lbs</th>
              <th style="width: 105px; text-align: right;">Tarifa Unit.</th>
              <th style="width: 105px; text-align: right;">Subtotal ($)</th>
            </tr>
          </thead>
          <tbody>
            ${data.services
              .map(
                (s) => `
              <tr>
                <td class="num-center">${s.index}</td>
                <td>${escapeHtml(s.description)}</td>
                <td class="num-right">${s.quantity.toLocaleString('en-US', { maximumFractionDigits: 3 })}</td>
                <td class="num-right">$${formatPrice(s.unitPrice)}</td>
                <td class="num-right" style="font-weight:700;">$${formatCurrency(s.value)}</td>
              </tr>
            `
              )
              .join('')}
          </tbody>
          <tfoot>
            <tr>
              <td colspan="4" style="text-align: right; font-weight: 700;">TOTAL SERVICIOS EXTRAORDINARIOS:</td>
              <td class="num-right" style="font-weight: 800;">$${formatCurrency(data.totalServicesValue)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    `
    : '';

  const observationsContentHtml = data.observations
    ? `<div class="obs-text">${escapeHtml(data.observations)}</div>`
    : `
      <div class="obs-line"></div>
      <div class="obs-line"></div>
    `;

  const signaturesHtml = data.signatures
    .map(
      (sig) => `
      <div class="sig-box">
        <div class="sig-space"></div>
        <div class="sig-line"></div>
        <div class="sig-role">${escapeHtml(sig.role)}</div>
        <div class="sig-primary">${escapeHtml(sig.primaryLine)}</div>
        <div class="sig-secondary">${escapeHtml(sig.secondaryLine)}</div>
      </div>
    `
    )
    .join('');

  return `<!DOCTYPE html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <title>${escapeHtml(data.noteTitle)} - ${escapeHtml(data.docType)} ${escapeHtml(data.refNumber)}</title>
    <style>
      @page {
        size: letter portrait;
        margin: 11mm 12mm;
      }
      * {
        box-sizing: border-box;
        margin: 0;
        padding: 0;
      }
      body {
        font-family: 'Segoe UI', Arial, Helvetica, sans-serif;
        color: #0f172a;
        background: #ffffff;
        font-size: 11.5px;
        line-height: 1.4;
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }
      .page-wrap {
        width: 100%;
        max-width: 196mm;
        margin: 0 auto;
      }
      .header-row {
        display: flex;
        justify-content: space-between;
        align-items: stretch;
        gap: 14px;
        padding-bottom: 10px;
        border-bottom: 2.5px solid ${accentPrimary};
        margin-bottom: 12px;
      }
      .company-block {
        display: flex;
        align-items: center;
        gap: 12px;
        flex: 1;
      }
      .company-logo {
        max-width: 68px;
        max-height: 68px;
        object-fit: contain;
        border-radius: 6px;
      }
      .company-name {
        font-size: 16px;
        font-weight: 800;
        color: #0f172a;
        letter-spacing: -0.02em;
        text-transform: uppercase;
      }
      .company-sub {
        font-size: 10.5px;
        color: #334155;
        margin-top: 2px;
      }
      .company-client {
        font-size: 10.5px;
        color: #475569;
        margin-top: 2px;
        font-weight: 600;
      }
      .doc-box {
        min-width: 225px;
        border: 1.8px solid ${accentPrimary};
        border-radius: 7px;
        overflow: hidden;
        text-align: center;
        display: flex;
        flex-direction: column;
        justify-content: space-between;
      }
      .doc-box-header {
        background: ${accentPrimary};
        color: #ffffff;
        font-size: 13.5px;
        font-weight: 800;
        letter-spacing: 0.05em;
        padding: 6px 10px;
      }
      .doc-box-body {
        background: ${accentBadgeBg};
        padding: 6px 10px;
      }
      .doc-ref {
        font-size: 12.5px;
        font-weight: 800;
        color: #0f172a;
      }
      .doc-meta {
        font-size: 9.8px;
        color: #334155;
        margin-top: 2px;
      }
      .subtitle-banner {
        display: flex;
        justify-content: space-between;
        align-items: center;
        background: #f8fafc;
        border: 1px solid #cbd5e1;
        border-left: 4px solid ${accentPrimary};
        border-radius: 5px;
        padding: 6px 10px;
        margin-bottom: 11px;
        font-size: 10.5px;
      }
      .op-pill {
        display: inline-block;
        padding: 2px 8px;
        border-radius: 999px;
        background: ${accentBadgeBg};
        border: 1px solid ${accentBorder};
        color: ${accentPrimary};
        font-weight: 800;
        font-size: 9.8px;
        letter-spacing: 0.03em;
      }
      .info-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 10px;
        margin-bottom: 12px;
      }
      .info-card {
        border: 1px solid #cbd5e1;
        border-radius: 6px;
        padding: 8px 10px;
        background: #ffffff;
      }
      .info-card-title {
        font-size: 9.5px;
        font-weight: 800;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        color: ${accentPrimary};
        border-bottom: 1px solid #e2e8f0;
        padding-bottom: 4px;
        margin-bottom: 6px;
      }
      .info-row {
        display: flex;
        justify-content: space-between;
        gap: 8px;
        padding: 2px 0;
        font-size: 10.5px;
      }
      .info-label {
        color: #475569;
        font-weight: 600;
      }
      .info-val {
        color: #0f172a;
        font-weight: 700;
        text-align: right;
      }
      .declaration {
        font-size: 10px;
        color: #334155;
        margin-bottom: 10px;
        text-align: justify;
      }
      .section-block {
        margin-bottom: 12px;
      }
      .section-title {
        font-size: 10.5px;
        font-weight: 800;
        text-transform: uppercase;
        letter-spacing: 0.04em;
        color: #0f172a;
        margin-bottom: 5px;
      }
      .data-table {
        width: 100%;
        border-collapse: collapse;
        font-size: 10.5px;
      }
      .data-table th {
        background: ${accentPrimary};
        color: #ffffff;
        font-weight: 700;
        text-transform: uppercase;
        font-size: 9.2px;
        letter-spacing: 0.04em;
        padding: 6px 7px;
        border: 1px solid ${accentPrimary};
        text-align: left;
      }
      .data-table td {
        padding: 5.5px 7px;
        border: 1px solid #cbd5e1;
        vertical-align: middle;
      }
      .data-table tbody tr:nth-child(even) td {
        background: #f8fafc;
      }
      .data-table tfoot td {
        background: #e2e8f0;
        font-weight: 800;
        padding: 6.5px 7px;
        border: 1px solid #94a3b8;
        color: #0f172a;
      }
      .num-center {
        text-align: center !important;
      }
      .num-right {
        text-align: right !important;
        font-variant-numeric: tabular-nums;
      }
      .sku-cell {
        font-weight: 700;
        font-family: Consolas, 'Courier New', monospace;
        font-size: 10.2px;
      }
      .prod-desc {
        font-weight: 600;
        color: #0f172a;
      }
      .prod-cat {
        font-size: 9px;
        color: #64748b;
      }
      .temp-warn {
        color: #b45309;
        font-weight: 700;
      }
      .summary-strip {
        display: grid;
        grid-template-columns: repeat(4, 1fr);
        gap: 8px;
        margin-bottom: 12px;
      }
      .summary-item {
        border: 1px solid #cbd5e1;
        background: #f8fafc;
        border-radius: 5px;
        padding: 5px 8px;
        text-align: center;
      }
      .summary-item-label {
        font-size: 8.8px;
        text-transform: uppercase;
        color: #475569;
        font-weight: 700;
      }
      .summary-item-val {
        font-size: 12.5px;
        font-weight: 800;
        color: #0f172a;
        margin-top: 1px;
      }
      .obs-box {
        border: 1px solid #cbd5e1;
        border-radius: 6px;
        padding: 7px 10px;
        margin-bottom: 16px;
        page-break-inside: avoid;
      }
      .obs-title {
        font-size: 9.5px;
        font-weight: 800;
        text-transform: uppercase;
        color: #334155;
        margin-bottom: 4px;
      }
      .obs-text {
        font-size: 10.5px;
        color: #0f172a;
        white-space: pre-wrap;
        min-height: 24px;
      }
      .obs-line {
        border-bottom: 1px dashed #94a3b8;
        height: 16px;
      }
      .signatures-grid {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 16px;
        margin-top: 10px;
        page-break-inside: avoid;
      }
      .sig-box {
        border: 1px solid #cbd5e1;
        border-radius: 6px;
        padding: 8px 10px;
        text-align: center;
        background: #ffffff;
      }
      .sig-space {
        height: 44px;
      }
      .sig-line {
        border-top: 1.5px solid #0f172a;
        margin: 0 6px 5px 6px;
      }
      .sig-role {
        font-size: 9.2px;
        font-weight: 800;
        color: ${accentPrimary};
        letter-spacing: 0.03em;
      }
      .sig-primary {
        font-size: 9.8px;
        font-weight: 600;
        color: #0f172a;
        margin-top: 2px;
      }
      .sig-secondary {
        font-size: 8.8px;
        color: #475569;
        margin-top: 1px;
      }
      .footer-meta {
        margin-top: 12px;
        padding-top: 6px;
        border-top: 1px solid #e2e8f0;
        display: flex;
        justify-content: space-between;
        font-size: 8.8px;
        color: #64748b;
      }
    </style>
  </head>
  <body>
    <div class="page-wrap">
      <!-- Encabezado Corporativo -->
      <div class="header-row">
        <div class="company-block">
          ${data.logoSrc ? `<img src="${escapeHtml(data.logoSrc)}" alt="Logo" class="company-logo" />` : ''}
          <div>
            <div class="company-name">${escapeHtml(data.companyName)}</div>
            ${data.facilityName ? `<div class="company-sub">${escapeHtml(data.facilityName)}</div>` : ''}
            ${data.clientName ? `<div class="company-client">Cuenta / Cliente: ${escapeHtml(data.clientName)}</div>` : ''}
          </div>
        </div>
        <div class="doc-box">
          <div class="doc-box-header">${escapeHtml(data.noteTitle)}</div>
          <div class="doc-box-body">
            <div class="doc-ref">${escapeHtml(data.docType)}: #${escapeHtml(data.refNumber)}</div>
            <div class="doc-meta">Fecha: <strong>${escapeHtml(data.formattedDate)}</strong> • Control: <strong>${escapeHtml(data.internalId)}</strong></div>
          </div>
        </div>
      </div>

      <!-- Subtítulo Operativo -->
      <div class="subtitle-banner">
        <span>${escapeHtml(data.noteSubtitle)}</span>
        <span class="op-pill">${escapeHtml(data.operationTypeLabel)}</span>
      </div>

      <!-- Paneles de Metadatos y Logística -->
      <div class="info-grid">
        <div class="info-card">
          <div class="info-card-title">Datos del Documento y Operación</div>
          <div class="info-row">
            <span class="info-label">Fecha de Movimiento:</span>
            <span class="info-val">${escapeHtml(data.formattedDate)}</span>
          </div>
          <div class="info-row">
            <span class="info-label">Documento Referencia:</span>
            <span class="info-val">${escapeHtml(data.docType)} #${escapeHtml(data.refNumber)}</span>
          </div>
          <div class="info-row">
            <span class="info-label">${escapeHtml(data.scheduleLabel)}:</span>
            <span class="info-val">${escapeHtml(data.timeStart)} - ${escapeHtml(data.timeEnd)}${data.durationLabel ? ` (${escapeHtml(data.durationLabel)})` : ''}</span>
          </div>
          <div class="info-row">
            <span class="info-label">Auditor Responsable:</span>
            <span class="info-val">${escapeHtml(data.auditUser)}</span>
          </div>
        </div>

        <div class="info-card">
          <div class="info-card-title">Logística, Transporte y Custodia</div>
          <div class="info-row">
            <span class="info-label">Transportista / Motorista:</span>
            <span class="info-val">${escapeHtml(data.carrier)}</span>
          </div>
          <div class="info-row">
            <span class="info-label">Equipo / Placa:</span>
            <span class="info-val">${escapeHtml(data.equipment)}</span>
          </div>
          <div class="info-row">
            <span class="info-label">N° de Marchamo / Sello:</span>
            <span class="info-val">${escapeHtml(data.seal)}</span>
          </div>
          <div class="info-row">
            <span class="info-label">Temp. Promedio Cadena Frío:</span>
            <span class="info-val">${escapeHtml(data.totals.avgTempFormatted)}</span>
          </div>
        </div>
      </div>

      <!-- Constancia -->
      <div class="declaration">${escapeHtml(data.declarationText)}</div>

      <!-- Cinta Resumen Triple Unidad -->
      <div class="summary-strip">
        <div class="summary-item">
          <div class="summary-item-label">Líneas de Producto</div>
          <div class="summary-item-val">${data.totals.totalItems}</div>
        </div>
        <div class="summary-item">
          <div class="summary-item-label">Total Unidades</div>
          <div class="summary-item-val">${data.totals.totalUnits.toLocaleString('en-US')}</div>
        </div>
        <div class="summary-item">
          <div class="summary-item-label">Peso Neto Total (Lbs)</div>
          <div class="summary-item-val">${formatMovementPounds(data.totals.totalPounds)}</div>
        </div>
        <div class="summary-item">
          <div class="summary-item-label">Total Cestas</div>
          <div class="summary-item-val">${data.totals.totalBaskets.toLocaleString('en-US')}</div>
        </div>
      </div>

      <!-- Tabla de Productos -->
      <div class="section-block">
        <div class="section-title">Detalle Físico de Productos</div>
        <table class="data-table">
          <thead>
            <tr>
              <th style="width: 34px; text-align: center;">#</th>
              <th style="width: 98px;">Código (SKU)</th>
              <th>Descripción del Producto</th>
              <th style="width: 78px; text-align: center;">Temp. (°C)</th>
              <th style="width: 82px; text-align: right;">Unidades</th>
              <th style="width: 102px; text-align: right;">Peso Neto (Lbs)</th>
              <th style="width: 74px; text-align: right;">Cestas</th>
            </tr>
          </thead>
          <tbody>
            ${itemsRowsHtml}
          </tbody>
          <tfoot>
            <tr>
              <td colspan="3" style="text-align: right;">TOTALES DEL MOVIMIENTO:</td>
              <td class="num-center">${data.totals.hasAnyTemp ? `Prom: ${escapeHtml(data.totals.avgTempFormatted)}` : '—'}</td>
              <td class="num-right">${data.totals.totalUnits.toLocaleString('en-US')}</td>
              <td class="num-right">${formatMovementPounds(data.totals.totalPounds)}</td>
              <td class="num-right">${data.totals.totalBaskets.toLocaleString('en-US')}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      ${servicesSectionHtml}

      <!-- Observaciones -->
      <div class="obs-box">
        <div class="obs-title">Observaciones / Control de Andén:</div>
        ${observationsContentHtml}
      </div>

      <!-- Firmas de Conformidad -->
      <div class="signatures-grid">
        ${signaturesHtml}
      </div>

      <!-- Pie de Página -->
      <div class="footer-meta">
        <span>Sistema: ${escapeHtml(data.systemName)} • ${escapeHtml(data.noteTitle)} (${escapeHtml(data.docType)} #${escapeHtml(data.refNumber)})</span>
        <span>Impreso: ${escapeHtml(data.printedAt)}</span>
      </div>
    </div>
  </body>
</html>`;
};

/**
 * Imprime la Nota de Envío (Salida) o Nota de Recibido (Entrada) abriendo el diálogo nativo
 * de impresión. Si el navegador bloquea pop-ups, utiliza un iframe oculto de respaldo.
 */
export const printMovementNote = (options) => {
  const data = buildMovementNoteData(options);
  const html = buildPrintableNoteHtml(data);

  const printWindow = window.open('', '_blank', 'width=940,height=780');
  if (printWindow) {
    printWindow.opener = null;
    const htmlWithAutoPrint = html.replace(
      '</body>',
      `<script>
        (function() {
          function triggerPrint() {
            window.focus();
            window.print();
          }
          window.onafterprint = function() {
            window.close();
          };
          window.onload = function() {
            var imgs = document.images;
            if (!imgs || imgs.length === 0) {
              setTimeout(triggerPrint, 120);
              return;
            }
            var pending = imgs.length;
            var done = false;
            function check() {
              pending--;
              if (pending <= 0 && !done) {
                done = true;
                setTimeout(triggerPrint, 120);
              }
            }
            for (var i = 0; i < imgs.length; i++) {
              if (imgs[i].complete) {
                check();
              } else {
                imgs[i].addEventListener('load', check);
                imgs[i].addEventListener('error', check);
              }
            }
            setTimeout(function() {
              if (!done) {
                done = true;
                triggerPrint();
              }
            }, 900);
          };
        })();
      </script></body>`
    );
    printWindow.document.open();
    printWindow.document.write(htmlWithAutoPrint);
    printWindow.document.close();
    return { success: true, noteTitle: data.noteShortLabel };
  }

  // Respaldo mediante iframe oculto cuando las ventanas emergentes están bloqueadas
  const iframe = document.createElement('iframe');
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = '0';
  document.body.appendChild(iframe);

  const doc = iframe.contentWindow?.document;
  if (!doc || !iframe.contentWindow) {
    if (document.body.contains(iframe)) document.body.removeChild(iframe);
    return { success: false, message: 'No fue posible inicializar la vista de impresión.' };
  }

  doc.open();
  doc.write(html);
  doc.close();

  setTimeout(() => {
    try {
      iframe.contentWindow.focus();
      iframe.contentWindow.print();
    } finally {
      setTimeout(() => {
        if (document.body.contains(iframe)) {
          document.body.removeChild(iframe);
        }
      }, 2000);
    }
  }, 300);

  return { success: true, noteTitle: data.noteShortLabel };
};

/**
 * Descarga un archivo PDF nativo de la Nota de Envío o Nota de Recibido usando jsPDF + autoTable
 */
export const downloadMovementNotePdf = async (options) => {
  const data = buildMovementNoteData(options);
  const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable')
  ]);

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'letter' });
  const accentRgb = data.isExit ? [30, 58, 138] : [6, 95, 70]; // Azul marino vs Verde esmeralda oscuro

  // Encabezado izquierdo (Empresa)
  let textStartX = 14;
  if (data.logoSrc && /^data:image\/(png|jpeg|jpg)/i.test(data.logoSrc)) {
    try {
      const imgFormat = /data:image\/png/i.test(data.logoSrc) ? 'PNG' : 'JPEG';
      doc.addImage(data.logoSrc, imgFormat, 14, 11, 16, 16);
      textStartX = 33;
    } catch {
      textStartX = 14;
    }
  }

  doc.setFontSize(12.5);
  doc.setFont(undefined, 'bold');
  doc.setTextColor(15, 23, 42);
  doc.text(data.companyName, textStartX, 16);

  doc.setFontSize(8.5);
  doc.setFont(undefined, 'normal');
  doc.setTextColor(71, 85, 105);
  let headerY = 21;
  if (data.facilityName) {
    doc.text(data.facilityName, textStartX, headerY);
    headerY += 4.5;
  }
  if (data.clientName) {
    doc.setFont(undefined, 'bold');
    doc.text(`Cliente: ${data.clientName}`, textStartX, headerY);
    doc.setFont(undefined, 'normal');
  }

  // Caja derecha del Comprobante (NOTA DE ENVÍO / NOTA DE RECIBIDO)
  const boxX = 136;
  const boxY = 11;
  const boxW = 66;
  const boxH = 19;
  doc.setDrawColor(...accentRgb);
  doc.setLineWidth(0.5);
  doc.rect(boxX, boxY, boxW, boxH);
  doc.setFillColor(...accentRgb);
  doc.rect(boxX, boxY, boxW, 7, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(10);
  doc.setFont(undefined, 'bold');
  doc.text(data.noteTitle, boxX + boxW / 2, boxY + 4.8, { align: 'center' });

  doc.setTextColor(15, 23, 42);
  doc.setFontSize(9.2);
  doc.text(`${data.docType}: #${data.refNumber}`, boxX + boxW / 2, boxY + 12.2, { align: 'center' });
  doc.setFontSize(7.8);
  doc.setFont(undefined, 'normal');
  doc.setTextColor(71, 85, 105);
  doc.text(`Fecha: ${data.formattedDate}  •  ID: ${data.internalId}`, boxX + boxW / 2, boxY + 16.8, { align: 'center' });

  // Línea divisoria
  doc.setDrawColor(...accentRgb);
  doc.setLineWidth(0.6);
  doc.line(14, 33, 202, 33);

  // Bloques de Información Operativa y Logística
  autoTable(doc, {
    startY: 36,
    head: [['DATOS DEL DOCUMENTO Y OPERACIÓN', 'LOGÍSTICA, TRANSPORTE Y CUSTODIA']],
    body: [
      [
        `Operación: ${data.operationTypeLabel}`,
        `Transportista / Motorista: ${data.carrier}`
      ],
      [
        `Documento: ${data.docType} #${data.refNumber}`,
        `Equipo / Placa: ${data.equipment}`
      ],
      [
        `${data.scheduleLabel}: ${data.timeStart} - ${data.timeEnd}${data.durationLabel ? ` (${data.durationLabel})` : ''}`,
        `N° de Marchamo / Sello: ${data.seal}`
      ],
      [
        `Auditor Responsable: ${data.auditUser}`,
        `Temp. Promedio Cadena de Frío: ${data.totals.avgTempFormatted}`
      ]
    ],
    theme: 'grid',
    styles: { fontSize: 8, cellPadding: 2, textColor: [15, 23, 42] },
    headStyles: { fillColor: accentRgb, textColor: 255, fontStyle: 'bold', fontSize: 8 },
    columnStyles: {
      0: { cellWidth: 94 },
      1: { cellWidth: 94 }
    },
    margin: { left: 14, right: 14 }
  });

  let currentY = doc.lastAutoTable.finalY + 5;

  // Párrafo de constancia
  doc.setFontSize(8);
  doc.setFont(undefined, 'normal');
  doc.setTextColor(51, 65, 85);
  const splitDecl = doc.splitTextToSize(data.declarationText, 188);
  doc.text(splitDecl, 14, currentY);
  currentY += splitDecl.length * 3.8 + 2;

  // Tabla principal de Productos
  const itemBody = data.items.map((it) => [
    String(it.index),
    it.sku,
    it.category ? `${it.description}\n[${it.category}]` : it.description,
    it.tempFormatted,
    it.qtyUnits.toLocaleString('en-US'),
    formatMovementPounds(it.qtyPounds),
    it.qtyBaskets.toLocaleString('en-US')
  ]);

  autoTable(doc, {
    startY: currentY,
    head: [['#', 'CÓDIGO (SKU)', 'DESCRIPCIÓN DEL PRODUCTO', 'TEMP. (°C)', 'UNIDADES', 'PESO NETO (LBS)', 'CESTAS']],
    body: itemBody,
    foot: [[
      '',
      '',
      `TOTALES (${data.totals.totalItems} líneas)`,
      data.totals.hasAnyTemp ? `Prom: ${data.totals.avgTempFormatted}` : '—',
      data.totals.totalUnits.toLocaleString('en-US'),
      formatMovementPounds(data.totals.totalPounds),
      data.totals.totalBaskets.toLocaleString('en-US')
    ]],
    theme: 'grid',
    styles: { fontSize: 8, cellPadding: 2, valign: 'middle', textColor: [15, 23, 42] },
    headStyles: { fillColor: accentRgb, textColor: 255, fontStyle: 'bold', fontSize: 7.8 },
    footStyles: { fillColor: [226, 232, 240], textColor: [15, 23, 42], fontStyle: 'bold' },
    columnStyles: {
      0: { cellWidth: 9, halign: 'center' },
      1: { cellWidth: 25, fontStyle: 'bold' },
      2: { cellWidth: 68 },
      3: { cellWidth: 21, halign: 'center' },
      4: { cellWidth: 21, halign: 'right' },
      5: { cellWidth: 26, halign: 'right' },
      6: { cellWidth: 18, halign: 'right' }
    },
    margin: { left: 14, right: 14 }
  });

  currentY = doc.lastAutoTable.finalY + 6;

  // Tabla de Servicios Extraordinarios (opcional)
  if (data.includeServices && data.services.length > 0) {
    if (currentY > 220) {
      doc.addPage();
      currentY = 16;
    }

    doc.setFontSize(8.5);
    doc.setFont(undefined, 'bold');
    doc.setTextColor(15, 23, 42);
    doc.text('SERVICIOS EXTRAORDINARIOS / MANIOBRAS ASOCIADAS', 14, currentY);

    autoTable(doc, {
      startY: currentY + 2,
      head: [['#', 'DESCRIPCIÓN DEL SERVICIO', 'CANT. / LBS', 'TARIFA UNIT.', 'SUBTOTAL ($)']],
      body: data.services.map((s) => [
        String(s.index),
        s.description,
        s.quantity.toLocaleString('en-US', { maximumFractionDigits: 3 }),
        `$${formatPrice(s.unitPrice)}`,
        `$${formatCurrency(s.value)}`
      ]),
      foot: [['', 'TOTAL SERVICIOS EXTRAORDINARIOS', '', '', `$${formatCurrency(data.totalServicesValue)}`]],
      theme: 'grid',
      styles: { fontSize: 7.8, cellPadding: 1.8 },
      headStyles: { fillColor: [51, 65, 85], textColor: 255, fontStyle: 'bold' },
      footStyles: { fillColor: [226, 232, 240], textColor: [15, 23, 42], fontStyle: 'bold' },
      columnStyles: {
        0: { cellWidth: 9, halign: 'center' },
        1: { cellWidth: 99 },
        2: { cellWidth: 26, halign: 'right' },
        3: { cellWidth: 27, halign: 'right' },
        4: { cellWidth: 27, halign: 'right' }
      },
      margin: { left: 14, right: 14 }
    });

    currentY = doc.lastAutoTable.finalY + 6;
  }

  // Observaciones y Firmas
  if (currentY > 192) {
    doc.addPage();
    currentY = 18;
  }

  doc.setDrawColor(203, 213, 225);
  doc.setLineWidth(0.3);
  doc.rect(14, currentY, 188, 18);
  doc.setFontSize(7.8);
  doc.setFont(undefined, 'bold');
  doc.setTextColor(51, 65, 85);
  doc.text('OBSERVACIONES / CONTROL DE ANDÉN:', 17, currentY + 4.8);
  doc.setFont(undefined, 'normal');
  doc.setTextColor(15, 23, 42);
  if (data.observations) {
    const obsLines = doc.splitTextToSize(data.observations, 182);
    doc.text(obsLines.slice(0, 3), 17, currentY + 9.8);
  }

  currentY += 25;

  // 3 bloques de firma
  const sigWidth = 58;
  const sigGap = 7;
  data.signatures.forEach((sig, i) => {
    const x = 14 + i * (sigWidth + sigGap);
    doc.setDrawColor(203, 213, 225);
    doc.rect(x, currentY, sigWidth, 28);
    doc.setDrawColor(15, 23, 42);
    doc.line(x + 5, currentY + 16, x + sigWidth - 5, currentY + 16);

    doc.setFontSize(7);
    doc.setFont(undefined, 'bold');
    doc.setTextColor(...accentRgb);
    doc.text(sig.role, x + sigWidth / 2, currentY + 20, { align: 'center' });

    doc.setFontSize(7);
    doc.setFont(undefined, 'normal');
    doc.setTextColor(15, 23, 42);
    doc.text(sig.primaryLine.slice(0, 34), x + sigWidth / 2, currentY + 23.5, { align: 'center' });

    doc.setFontSize(6.3);
    doc.setTextColor(100, 116, 139);
    doc.text(sig.secondaryLine.slice(0, 38), x + sigWidth / 2, currentY + 26.5, { align: 'center' });
  });

  // Pie de página
  doc.setFontSize(7);
  doc.setTextColor(100, 116, 139);
  doc.text(
    `${data.systemName} • ${data.noteTitle} (${data.docType} #${data.refNumber}) • Generado: ${data.printedAt}`,
    14,
    270
  );

  const safeRef = String(data.refNumber || 'SN').replace(/[^a-zA-Z0-9_-]/g, '_');
  const safeDate = String(data.rawDate || toLocalDateISO()).replace(/[^0-9-]/g, '') || toLocalDateISO();
  const prefix = data.isExit ? 'Nota_de_Envio' : 'Nota_de_Recibido';
  doc.save(`${prefix}_${safeRef}_${safeDate}.pdf`);

  return { success: true, noteTitle: data.noteShortLabel };
};


/**
 * Descarga segura de un documento HTML enriquecido con esquema Microsoft Word (.doc)
 */
const triggerWordDownload = (html, filename) => {
  const safeName = filename.endsWith('.doc') ? filename : `${filename}.doc`;
  const blob = new Blob(['\ufeff', html], { type: 'application/msword;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = safeName;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  setTimeout(() => {
    if (document.body.contains(link)) {
      document.body.removeChild(link);
    }
    URL.revokeObjectURL(url);
  }, 500);
};

/**
 * Construye el HTML con esquema nativo de Microsoft Word (MSO) usando maquetación por tablas
 * para fidelidad idéntica al PDF de Nota de Envío / Nota de Recibido.
 */
export const buildMovementNoteWordHtml = (data) => {
  const accentPrimary = data.isExit ? '#1e3a8a' : '#065f46';
  const accentBadgeBg = data.isExit ? '#eff6ff' : '#ecfdf5';
  const safeWordLogoSrc = sanitizeLogoSrc(data.logoSrc, { rasterBase64Only: true });

  const itemsRowsHtml =
    data.items.length === 0
      ? `<tr><td colspan="7" style="text-align:center; padding:10px; color:#64748b;">No hay productos registrados en este movimiento.</td></tr>`
      : data.items
          .map(
            (it, idx) => `
          <tr style="background-color:${idx % 2 === 1 ? '#f8fafc' : '#ffffff'};">
            <td style="text-align:center;">${it.index}</td>
            <td style="font-weight:bold; font-family:Consolas, monospace;">${escapeHtml(it.sku)}</td>
            <td>
              <div style="font-weight:bold; color:#0f172a;">${escapeHtml(it.description)}</div>
              ${it.category ? `<div style="font-size:8pt; color:#64748b;">${escapeHtml(it.category)}</div>` : ''}
            </td>
            <td style="text-align:center; ${it.isTempOutOfRange ? 'color:#b45309; font-weight:bold;' : ''}">${escapeHtml(it.tempFormatted)}</td>
            <td style="text-align:right;">${it.qtyUnits.toLocaleString('en-US')}</td>
            <td style="text-align:right;">${formatMovementPounds(it.qtyPounds)}</td>
            <td style="text-align:right;">${it.qtyBaskets.toLocaleString('en-US')}</td>
          </tr>
        `
          )
          .join('');

  const servicesHtml = data.includeServices
    ? `
      <div style="margin-top:12pt; margin-bottom:10pt;">
        <div style="font-size:9.5pt; font-weight:bold; text-transform:uppercase; color:#0f172a; margin-bottom:4pt;">
          Servicios Extraordinarios / Maniobras Asociadas
        </div>
        <table class="grid-table" width="100%" cellspacing="0" cellpadding="5">
          <thead>
            <tr>
              <th width="6%" style="background-color:#334155; color:#ffffff; text-align:center;">#</th>
              <th width="49%" style="background-color:#334155; color:#ffffff; text-align:left;">Descripción del Servicio</th>
              <th width="15%" style="background-color:#334155; color:#ffffff; text-align:right;">Cant. / Lbs</th>
              <th width="15%" style="background-color:#334155; color:#ffffff; text-align:right;">Tarifa Unit.</th>
              <th width="15%" style="background-color:#334155; color:#ffffff; text-align:right;">Subtotal ($)</th>
            </tr>
          </thead>
          <tbody>
            ${data.services
              .map(
                (s) => `
              <tr>
                <td style="text-align:center;">${s.index}</td>
                <td>${escapeHtml(s.description)}</td>
                <td style="text-align:right;">${s.quantity.toLocaleString('en-US', { maximumFractionDigits: 3 })}</td>
                <td style="text-align:right;">$${formatPrice(s.unitPrice)}</td>
                <td style="text-align:right; font-weight:bold;">$${formatCurrency(s.value)}</td>
              </tr>
            `
              )
              .join('')}
            <tr style="background-color:#e2e8f0; font-weight:bold;">
              <td colspan="4" style="text-align:right;">TOTAL SERVICIOS EXTRAORDINARIOS:</td>
              <td style="text-align:right;">$${formatCurrency(data.totalServicesValue)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    `
    : '';

  return `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
  <head>
    <meta charset="utf-8" />
    <title>${escapeHtml(data.noteTitle)} - ${escapeHtml(data.docType)} ${escapeHtml(data.refNumber)}</title>
    <!--[if gte mso 9]>
    <xml>
      <w:WordDocument>
        <w:View>Print</w:View>
        <w:Zoom>100</w:Zoom>
        <w:DoNotOptimizeForBrowser/>
      </w:WordDocument>
    </xml>
    <![endif]-->
    <style>
      @page WordSection1 {
        size: 8.5in 11.0in;
        margin: 0.45in 0.5in 0.45in 0.5in;
      }
      div.WordSection1 {
        page: WordSection1;
      }
      body {
        font-family: Arial, Helvetica, sans-serif;
        font-size: 9.5pt;
        color: #0f172a;
      }
      table {
        border-collapse: collapse;
      }
      .grid-table th, .grid-table td {
        border: 1px solid #cbd5e1;
        padding: 4.5pt 6pt;
        font-size: 9pt;
      }
    </style>
  </head>
  <body>
    <div class="WordSection1">
      <!-- Encabezado Corporativo en Tabla de 2 Columnas -->
      <table width="100%" cellspacing="0" cellpadding="0" style="border-bottom: 2.5pt solid ${accentPrimary}; padding-bottom: 8pt; margin-bottom: 10pt;">
        <tr>
          <td width="64%" valign="middle" style="padding-bottom: 6pt;">
            <table cellspacing="0" cellpadding="0">
              <tr>
                ${
                  safeWordLogoSrc
                    ? `<td valign="middle" style="padding-right: 10pt;"><img src="${escapeHtml(safeWordLogoSrc)}" width="56" height="56" alt="Logo" /></td>`
                    : ''
                }
                <td valign="middle">
                  <div style="font-size: 13pt; font-weight: bold; text-transform: uppercase; color: #0f172a;">${escapeHtml(data.companyName)}</div>
                  ${data.facilityName ? `<div style="font-size: 8.5pt; color: #334155; margin-top: 2pt;">${escapeHtml(data.facilityName)}</div>` : ''}
                  ${data.clientName ? `<div style="font-size: 8.5pt; color: #475569; font-weight: bold; margin-top: 2pt;">Cuenta / Cliente: ${escapeHtml(data.clientName)}</div>` : ''}
                </td>
              </tr>
            </table>
          </td>
          <td width="36%" valign="middle" align="right" style="padding-bottom: 6pt;">
            <table width="100%" cellspacing="0" cellpadding="5" style="border: 1.5pt solid ${accentPrimary};">
              <tr>
                <td align="center" style="background-color: ${accentPrimary}; color: #ffffff; font-size: 11pt; font-weight: bold; letter-spacing: 0.5pt;">
                  ${escapeHtml(data.noteTitle)}
                </td>
              </tr>
              <tr>
                <td align="center" style="background-color: ${accentBadgeBg};">
                  <div style="font-size: 10pt; font-weight: bold; color: #0f172a;">${escapeHtml(data.docType)}: #${escapeHtml(data.refNumber)}</div>
                  <div style="font-size: 8pt; color: #334155; margin-top: 2pt;">Fecha: <b>${escapeHtml(data.formattedDate)}</b> • ID: <b>${escapeHtml(data.internalId)}</b></div>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>

      <!-- Cinta de Subtítulo -->
      <table width="100%" cellspacing="0" cellpadding="6" style="background-color: #f8fafc; border: 1px solid #cbd5e1; border-left: 4pt solid ${accentPrimary}; margin-bottom: 10pt;">
        <tr>
          <td width="65%" style="font-size: 8.8pt; color: #334155;">${escapeHtml(data.noteSubtitle)}</td>
          <td width="35%" align="right" style="font-size: 8.5pt; font-weight: bold; color: ${accentPrimary};">${escapeHtml(data.operationTypeLabel)}</td>
        </tr>
      </table>

      <!-- Paneles de Documento y Logística (2 Columnas) -->
      <table width="100%" cellspacing="0" cellpadding="0" style="margin-bottom: 10pt;">
        <tr>
          <td width="49%" valign="top" style="border: 1px solid #cbd5e1; padding: 7pt;">
            <div style="font-size: 8.5pt; font-weight: bold; text-transform: uppercase; color: ${accentPrimary}; border-bottom: 1px solid #e2e8f0; padding-bottom: 3pt; margin-bottom: 5pt;">
              Datos del Documento y Operación
            </div>
            <table width="100%" cellspacing="0" cellpadding="2" style="font-size: 8.8pt;">
              <tr><td style="color:#475569;">Fecha de Movimiento:</td><td align="right"><b>${escapeHtml(data.formattedDate)}</b></td></tr>
              <tr><td style="color:#475569;">Documento Referencia:</td><td align="right"><b>${escapeHtml(data.docType)} #${escapeHtml(data.refNumber)}</b></td></tr>
              <tr><td style="color:#475569;">${escapeHtml(data.scheduleLabel)}:</td><td align="right"><b>${escapeHtml(data.timeStart)} - ${escapeHtml(data.timeEnd)}${data.durationLabel ? ` (${escapeHtml(data.durationLabel)})` : ''}</b></td></tr>
              <tr><td style="color:#475569;">Auditor Responsable:</td><td align="right"><b>${escapeHtml(data.auditUser)}</b></td></tr>
            </table>
          </td>
          <td width="2%"></td>
          <td width="49%" valign="top" style="border: 1px solid #cbd5e1; padding: 7pt;">
            <div style="font-size: 8.5pt; font-weight: bold; text-transform: uppercase; color: ${accentPrimary}; border-bottom: 1px solid #e2e8f0; padding-bottom: 3pt; margin-bottom: 5pt;">
              Logística, Transporte y Custodia
            </div>
            <table width="100%" cellspacing="0" cellpadding="2" style="font-size: 8.8pt;">
              <tr><td style="color:#475569;">Transportista / Motorista:</td><td align="right"><b>${escapeHtml(data.carrier)}</b></td></tr>
              <tr><td style="color:#475569;">Equipo / Placa:</td><td align="right"><b>${escapeHtml(data.equipment)}</b></td></tr>
              <tr><td style="color:#475569;">N° de Marchamo / Sello:</td><td align="right"><b>${escapeHtml(data.seal)}</b></td></tr>
              <tr><td style="color:#475569;">Temp. Promedio Cadena Frío:</td><td align="right"><b>${escapeHtml(data.totals.avgTempFormatted)}</b></td></tr>
            </table>
          </td>
        </tr>
      </table>

      <!-- Párrafo de Constancia -->
      <p style="font-size: 8.5pt; color: #334155; text-align: justify; margin: 0 0 9pt 0;">
        ${escapeHtml(data.declarationText)}
      </p>

      <!-- Cinta Resumen de Totales (4 KPIs) -->
      <table width="100%" cellspacing="0" cellpadding="5" style="margin-bottom: 10pt;">
        <tr>
          <td width="25%" align="center" style="border: 1px solid #cbd5e1; background-color: #f8fafc;">
            <div style="font-size: 7.5pt; color: #475569; font-weight: bold; text-transform: uppercase;">Líneas de Producto</div>
            <div style="font-size: 11pt; font-weight: bold; color: #0f172a;">${data.totals.totalItems}</div>
          </td>
          <td width="25%" align="center" style="border: 1px solid #cbd5e1; background-color: #f8fafc;">
            <div style="font-size: 7.5pt; color: #475569; font-weight: bold; text-transform: uppercase;">Total Unidades</div>
            <div style="font-size: 11pt; font-weight: bold; color: #0f172a;">${data.totals.totalUnits.toLocaleString('en-US')}</div>
          </td>
          <td width="25%" align="center" style="border: 1px solid #cbd5e1; background-color: #f8fafc;">
            <div style="font-size: 7.5pt; color: #475569; font-weight: bold; text-transform: uppercase;">Peso Neto Total (Lbs)</div>
            <div style="font-size: 11pt; font-weight: bold; color: #0f172a;">${formatMovementPounds(data.totals.totalPounds)}</div>
          </td>
          <td width="25%" align="center" style="border: 1px solid #cbd5e1; background-color: #f8fafc;">
            <div style="font-size: 7.5pt; color: #475569; font-weight: bold; text-transform: uppercase;">Total Cestas</div>
            <div style="font-size: 11pt; font-weight: bold; color: #0f172a;">${data.totals.totalBaskets.toLocaleString('en-US')}</div>
          </td>
        </tr>
      </table>

      <!-- Tabla de Productos -->
      <div style="font-size: 9.5pt; font-weight: bold; text-transform: uppercase; color: #0f172a; margin-bottom: 4pt;">
        Detalle Físico de Productos
      </div>
      <table class="grid-table" width="100%" cellspacing="0" cellpadding="5" style="margin-bottom: 10pt;">
        <thead>
          <tr>
            <th width="5%" style="background-color: ${accentPrimary}; color: #ffffff; text-align: center;">#</th>
            <th width="15%" style="background-color: ${accentPrimary}; color: #ffffff; text-align: left;">Código (SKU)</th>
            <th width="36%" style="background-color: ${accentPrimary}; color: #ffffff; text-align: left;">Descripción del Producto</th>
            <th width="11%" style="background-color: ${accentPrimary}; color: #ffffff; text-align: center;">Temp. (°C)</th>
            <th width="11%" style="background-color: ${accentPrimary}; color: #ffffff; text-align: right;">Unidades</th>
            <th width="13%" style="background-color: ${accentPrimary}; color: #ffffff; text-align: right;">Peso Neto (Lbs)</th>
            <th width="9%" style="background-color: ${accentPrimary}; color: #ffffff; text-align: right;">Cestas</th>
          </tr>
        </thead>
        <tbody>
          ${itemsRowsHtml}
          <tr style="background-color: #e2e8f0; font-weight: bold;">
            <td colspan="3" style="text-align: right;">TOTALES DEL MOVIMIENTO:</td>
            <td style="text-align: center;">${data.totals.hasAnyTemp ? `Prom: ${escapeHtml(data.totals.avgTempFormatted)}` : '—'}</td>
            <td style="text-align: right;">${data.totals.totalUnits.toLocaleString('en-US')}</td>
            <td style="text-align: right;">${formatMovementPounds(data.totals.totalPounds)}</td>
            <td style="text-align: right;">${data.totals.totalBaskets.toLocaleString('en-US')}</td>
          </tr>
        </tbody>
      </table>

      ${servicesHtml}

      <!-- Observaciones -->
      <table width="100%" cellspacing="0" cellpadding="7" style="border: 1px solid #cbd5e1; margin-bottom: 16pt;">
        <tr>
          <td>
            <div style="font-size: 8pt; font-weight: bold; text-transform: uppercase; color: #334155; margin-bottom: 4pt;">
              Observaciones / Control de Andén:
            </div>
            ${
              data.observations
                ? `<div style="font-size: 9pt; color: #0f172a;">${escapeHtml(data.observations)}</div>`
                : `<div style="border-bottom: 1px dashed #94a3b8; height: 14pt;">&nbsp;</div>
                   <div style="border-bottom: 1px dashed #94a3b8; height: 14pt;">&nbsp;</div>`
            }
          </td>
        </tr>
      </table>

      <!-- Firmas en Tabla de 3 Columnas -->
      <table width="100%" cellspacing="0" cellpadding="0" style="margin-bottom: 10pt;">
        <tr>
          ${data.signatures
            .map(
              (sig, idx) => `
            <td width="32%" valign="bottom" align="center" style="border: 1px solid #cbd5e1; padding: 8pt 6pt;">
              <div style="height: 36pt;">&nbsp;</div>
              <div style="border-top: 1.2pt solid #0f172a; padding-top: 4pt; font-size: 8pt; font-weight: bold; color: ${accentPrimary};">
                ${escapeHtml(sig.role)}
              </div>
              <div style="font-size: 8.2pt; font-weight: bold; color: #0f172a; margin-top: 2pt;">
                ${escapeHtml(sig.primaryLine)}
              </div>
              <div style="font-size: 7.5pt; color: #475569; margin-top: 1pt;">
                ${escapeHtml(sig.secondaryLine)}
              </div>
            </td>
            ${idx < 2 ? '<td width="2%"></td>' : ''}
          `
            )
            .join('')}
        </tr>
      </table>

      <!-- Pie de Página -->
      <table width="100%" cellspacing="0" cellpadding="3" style="border-top: 1px solid #e2e8f0; font-size: 7.5pt; color: #64748b;">
        <tr>
          <td>Sistema: ${escapeHtml(data.systemName)} • ${escapeHtml(data.noteTitle)} (${escapeHtml(data.docType)} #${escapeHtml(data.refNumber)})</td>
          <td align="right">Generado: ${escapeHtml(data.printedAt)}</td>
        </tr>
      </table>
    </div>
  </body>
</html>`;
};

/**
 * Descarga un archivo Microsoft Word (.doc) de la Nota de Envío o Nota de Recibido
 */
export const downloadMovementNoteWord = (options) => {
  const data = buildMovementNoteData({ ...options, rasterBase64Only: true });
  const html = buildMovementNoteWordHtml(data);
  const safeRef = String(data.refNumber || 'SN').replace(/[^a-zA-Z0-9_-]/g, '_');
  const safeDate = String(data.rawDate || toLocalDateISO()).replace(/[^0-9-]/g, '') || toLocalDateISO();
  const prefix = data.isExit ? 'Nota_de_Envio' : 'Nota_de_Recibido';
  triggerWordDownload(html, `${prefix}_${safeRef}_${safeDate}.doc`);
  return { success: true, noteTitle: data.noteShortLabel };
};

/**
 * Normaliza filas consolidadas del listado de movimientos filtrados para exportación masiva PDF / Word
 */
const summarizeMovementsList = ({
  movements = [],
  products = [],
  productsMap = null,
  settings = {},
  contractRates = {},
  typeFilter = 'all',
  rasterBase64Only = false
}) => {
  const companyName = contractRates?.contractorName || settings?.name || 'Inventario Pro';
  const facilityName = contractRates?.facility || '';
  const clientName = contractRates?.clientName || '';
  const logoSrc = sanitizeLogoSrc(settings?.logo, { rasterBase64Only });
  const filterLabel =
    typeFilter === 'in'
      ? 'Solo Entradas (Notas de Recibido)'
      : typeFilter === 'out'
        ? 'Solo Salidas (Notas de Envío)'
        : 'Todos los Movimientos (Entradas y Salidas)';

  let grandUnits = 0;
  let grandPounds = 0;
  let grandBaskets = 0;

  const rows = movements.map((mov, idx) => {
    const items = Array.isArray(mov.items) ? mov.items : [];
    const units = items.reduce((s, it) => s + Number(it.qtyUnits || 0), 0);
    const pounds = items.reduce((s, it) => s + Number(it.qtyPounds || 0), 0);
    const baskets = items.reduce((s, it) => s + Number(it.qtyBaskets || 0), 0);
    grandUnits += units;
    grandPounds += pounds;
    grandBaskets += baskets;

    const productSummary =
      items.length === 0
        ? 'Sin productos'
        : items
            .map((it) => {
              const p = findProductForMovementItem(it, products, productsMap);
              return p ? `${p.sku} - ${p.description}` : String(it.sku || it.productId || 'Desconocido');
            })
            .join('; ');

    const timeRange = `${formatTimeShort(mov.timeStart)}${mov.timeEnd ? ` - ${formatTimeShort(mov.timeEnd)}` : ''}`;
    const transportInfo = [
      mov.carrier || 'N/A',
      mov.equipment ? `Eq: ${mov.equipment}` : '',
      mov.seal ? `Sello: ${mov.seal}` : ''
    ]
      .filter(Boolean)
      .join(' • ');

    return {
      index: idx + 1,
      date: formatDate(mov.date) || 'N/A',
      timeRange,
      typeLabel: mov.type === 'in' ? 'Entrada' : 'Salida',
      isExit: mov.type === 'out',
      docRef: `${mov.refType || 'Doc'} #${mov.refNumber || 'S/N'}`,
      productSummary,
      units,
      pounds,
      baskets,
      transportInfo,
      auditUser: mov.auditUser || 'Sistema'
    };
  });

  const now = new Date();
  const dateStamp = toLocalDateISO(now);
  const generatedAt = `${String(now.getDate()).padStart(2, '0')}/${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

  return {
    companyName,
    facilityName,
    clientName,
    logoSrc,
    filterLabel,
    rows,
    totals: {
      count: rows.length,
      units: grandUnits,
      pounds: grandPounds,
      baskets: grandBaskets
    },
    dateStamp,
    generatedAt
  };
};

/**
 * Descarga en PDF (Carta Horizontal) el listado de movimientos filtrados
 */
export const downloadMovementsListPdf = async (options) => {
  const report = summarizeMovementsList(options);
  const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable')
  ]);

  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'letter' });

  doc.setFontSize(12);
  doc.setFont(undefined, 'bold');
  doc.setTextColor(15, 23, 42);
  doc.text(`${report.companyName} — REPORTE DE MOVIMIENTOS DE ALMACÉN`, 14, 14);

  doc.setFontSize(8.5);
  doc.setFont(undefined, 'normal');
  doc.setTextColor(71, 85, 105);
  const metaParts = [report.facilityName, report.clientName ? `Cliente: ${report.clientName}` : ''].filter(Boolean).join('  •  ');
  if (metaParts) {
    doc.text(metaParts, 14, 19);
  }
  doc.text(`Filtro: ${report.filterLabel}  •  Registros: ${report.totals.count}  •  Generado: ${report.generatedAt}`, 14, 24);

  doc.setDrawColor(30, 58, 138);
  doc.setLineWidth(0.5);
  doc.line(14, 27, 265, 27);

  autoTable(doc, {
    startY: 30,
    head: [['#', 'FECHA / HORA', 'TIPO', 'DOCUMENTO', 'PRODUCTO(S)', 'UNIDADES', 'PESO NETO (LBS)', 'CESTAS', 'TRANSPORTE / SELLO', 'AUDITOR']],
    body: report.rows.map((r) => [
      String(r.index),
      `${r.date}\n${r.timeRange}`,
      r.typeLabel,
      r.docRef,
      r.productSummary,
      r.units.toLocaleString('en-US'),
      formatMovementPounds(r.pounds),
      r.baskets.toLocaleString('en-US'),
      r.transportInfo,
      r.auditUser
    ]),
    foot: [[
      '',
      '',
      '',
      '',
      `TOTAL CONSOLIDADO (${report.totals.count} mov.)`,
      report.totals.units.toLocaleString('en-US'),
      formatMovementPounds(report.totals.pounds),
      report.totals.baskets.toLocaleString('en-US'),
      '',
      ''
    ]],
    theme: 'grid',
    styles: { fontSize: 7.2, cellPadding: 1.8, valign: 'middle', textColor: [15, 23, 42] },
    headStyles: { fillColor: [30, 58, 138], textColor: 255, fontStyle: 'bold' },
    footStyles: { fillColor: [226, 232, 240], textColor: [15, 23, 42], fontStyle: 'bold' },
    columnStyles: {
      0: { cellWidth: 8, halign: 'center' },
      1: { cellWidth: 23 },
      2: { cellWidth: 16, halign: 'center' },
      3: { cellWidth: 28, fontStyle: 'bold' },
      4: { cellWidth: 66 },
      5: { cellWidth: 19, halign: 'right' },
      6: { cellWidth: 25, halign: 'right' },
      7: { cellWidth: 16, halign: 'right' },
      8: { cellWidth: 34 },
      9: { cellWidth: 17 }
    },
    margin: { left: 14, right: 14 }
  });

  doc.save(`Movimientos_${report.dateStamp}.pdf`);
  return { success: true };
};

/**
 * Descarga en Word (.doc Horizontal) el listado de movimientos filtrados
 */
export const downloadMovementsListWord = (options) => {
  const report = summarizeMovementsList({ ...options, rasterBase64Only: true });

  const rowsHtml = report.rows
    .map(
      (r, idx) => `
      <tr style="background-color:${idx % 2 === 1 ? '#f8fafc' : '#ffffff'};">
        <td style="text-align:center;">${r.index}</td>
        <td><b>${escapeHtml(r.date)}</b><br/><span style="font-size:7.5pt; color:#475569;">${escapeHtml(r.timeRange)}</span></td>
        <td style="text-align:center; font-weight:bold; color:${r.isExit ? '#991b1b' : '#065f46'};">${escapeHtml(r.typeLabel)}</td>
        <td style="font-weight:bold;">${escapeHtml(r.docRef)}</td>
        <td>${escapeHtml(r.productSummary)}</td>
        <td style="text-align:right;">${r.units.toLocaleString('en-US')}</td>
        <td style="text-align:right;">${formatMovementPounds(r.pounds)}</td>
        <td style="text-align:right;">${r.baskets.toLocaleString('en-US')}</td>
        <td>${escapeHtml(r.transportInfo)}</td>
        <td>${escapeHtml(r.auditUser)}</td>
      </tr>
    `
    )
    .join('');

  const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
  <head>
    <meta charset="utf-8" />
    <title>Reporte de Movimientos - ${escapeHtml(report.dateStamp)}</title>
    <style>
      @page WordSection1 {
        size: 11.0in 8.5in;
        mso-page-orientation: landscape;
        margin: 0.45in 0.45in 0.45in 0.45in;
      }
      div.WordSection1 { page: WordSection1; }
      body { font-family: Arial, Helvetica, sans-serif; font-size: 8.5pt; color: #0f172a; }
      table { border-collapse: collapse; width: 100%; }
      th, td { border: 1px solid #cbd5e1; padding: 4pt 5pt; font-size: 8pt; }
      th { background-color: #1e3a8a; color: #ffffff; font-weight: bold; text-transform: uppercase; }
    </style>
  </head>
  <body>
    <div class="WordSection1">
      <div style="border-bottom: 2pt solid #1e3a8a; padding-bottom: 6pt; margin-bottom: 10pt;">
        <div style="font-size: 12pt; font-weight: bold; color: #0f172a;">${escapeHtml(report.companyName)} — REPORTE DE MOVIMIENTOS DE ALMACÉN</div>
        ${report.facilityName || report.clientName ? `<div style="font-size: 8.5pt; color: #334155; margin-top: 2pt;">${escapeHtml([report.facilityName, report.clientName ? `Cliente: ${report.clientName}` : ''].filter(Boolean).join(' • '))}</div>` : ''}
        <div style="font-size: 8pt; color: #475569; margin-top: 2pt;">Filtro: <b>${escapeHtml(report.filterLabel)}</b> • Registros: <b>${report.totals.count}</b> • Generado: ${escapeHtml(report.generatedAt)}</div>
      </div>

      <table>
        <thead>
          <tr>
            <th width="4%">#</th>
            <th width="10%">Fecha / Hora</th>
            <th width="7%">Tipo</th>
            <th width="12%">Documento</th>
            <th width="25%">Producto(s)</th>
            <th width="8%">Unidades</th>
            <th width="10%">Peso Neto (Lbs)</th>
            <th width="6%">Cestas</th>
            <th width="11%">Transporte</th>
            <th width="7%">Auditor</th>
          </tr>
        </thead>
        <tbody>
          ${rowsHtml}
          <tr style="background-color:#e2e8f0; font-weight:bold;">
            <td colspan="5" style="text-align:right;">TOTAL CONSOLIDADO (${report.totals.count} movimientos):</td>
            <td style="text-align:right;">${report.totals.units.toLocaleString('en-US')}</td>
            <td style="text-align:right;">${formatMovementPounds(report.totals.pounds)}</td>
            <td style="text-align:right;">${report.totals.baskets.toLocaleString('en-US')}</td>
            <td colspan="2"></td>
          </tr>
        </tbody>
      </table>
    </div>
  </body>
</html>`;

  triggerWordDownload(html, `Movimientos_${report.dateStamp}.doc`);
  return { success: true };
};
