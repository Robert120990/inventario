import { formatDate, formatCurrency, formatPrice } from './formatUtils.js';
import { formatTemperatureDisplay, resolveServiceDetails } from './contractRates.js';

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
 * Valida que una fuente de imagen sea segura para incrustar (data:image o URL http/https/ruta relativa)
 */
const sanitizeLogoSrc = (logo) => {
  if (!logo || typeof logo !== 'string') return null;
  const trimmed = logo.trim();
  if (/^data:image\/(png|jpeg|jpg|webp|gif|svg\+xml);base64,/i.test(trimmed)) {
    return trimmed;
  }
  if (/^(https?:\/\/|\/)/i.test(trimmed)) {
    return trimmed;
  }
  return null;
};

/**
 * Formatea una cadena de hora HH:MM:SS o HH:MM a HH:MM
 */
export const formatTimeShort = (timeStr) => {
  if (!timeStr) return '--:--';
  const clean = String(timeStr).trim();
  if (clean.length >= 5 && clean.includes(':')) {
    return clean.slice(0, 5);
  }
  return clean;
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
 * Busca el producto asociado a un ítem del movimiento de forma resiliente
 */
export const findProductForMovementItem = (item, products = []) => {
  if (!item || !Array.isArray(products)) return null;
  return (
    products.find(
      (prod) =>
        prod.id === item.productId ||
        String(prod.id) === String(item.productId) ||
        prod.sku === item.productId ||
        (item.sku && prod.sku === item.sku)
    ) || null
  );
};

/**
 * Construye el modelo estructurado de datos del movimiento para el modal de detalle,
 * impresión de Nota de Envío / Nota de Recibido y exportación a PDF.
 */
export const buildMovementNoteData = ({
  movement,
  products = [],
  settings = {},
  contractRates = {},
  observations = '',
  includeServices = true
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
  const logoSrc = sanitizeLogoSrc(settings?.logo);

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
    const product = findProductForMovementItem(it, products);
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
  if (currentY > 215) {
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
  const safeDate = String(data.rawDate || 'fecha').replace(/[^0-9-]/g, '');
  const prefix = data.isExit ? 'Nota_de_Envio' : 'Nota_de_Recibido';
  doc.save(`${prefix}_${safeRef}_${safeDate}.pdf`);

  return { success: true, noteTitle: data.noteShortLabel };
};
