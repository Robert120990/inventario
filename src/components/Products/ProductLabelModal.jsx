import React, { useState, useEffect, useRef } from 'react';
import { X, Printer, Download, Settings2 } from 'lucide-react';
import JsBarcode from 'jsbarcode';
import jsPDF from 'jspdf';
import { toast } from 'react-hot-toast';

/**
 * Obtiene la fecha actual en formato DD/MM/YY
 */
const getDefaultDateFormatted = () => {
  const now = new Date();
  const day = String(now.getDate()).padStart(2, '0');
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const year = String(now.getFullYear()).slice(-2);
  return `${day}/${month}/${year}`;
};

const ProductLabelModal = ({ product, onClose }) => {
  const [copies, setCopies] = useState(1);
  const [customDescription, setCustomDescription] = useState(product?.description || '');
  const [customCategory, setCustomCategory] = useState(product?.category || '');
  const [customSku, setCustomSku] = useState(product?.sku || '');
  const [customDate, setCustomDate] = useState(getDefaultDateFormatted());
  const [labelSize, setLabelSize] = useState('72x45'); // '72x45' | '72x60' | '58x40' | 'sheet'
  const [barcodeType, setBarcodeType] = useState('CODE128'); // 'CODE128' | 'EAN13' | 'CODE39'
  
  const barcodeSvgRef = useRef(null);

  // Renderizar código de barras reactivamente adaptado a 72mm
  useEffect(() => {
    if (barcodeSvgRef.current && customSku) {
      const is72mm = labelSize.startsWith('72');
      try {
        JsBarcode(barcodeSvgRef.current, String(customSku).trim(), {
          format: barcodeType,
          width: is72mm ? 2.2 : 1.9,
          height: is72mm ? 44 : 38,
          displayValue: true,
          font: 'Arial',
          fontSize: is72mm ? 13 : 12,
          textMargin: 3,
          margin: 0,
          background: '#ffffff',
          lineColor: '#000000'
        });
      } catch (err) {
        try {
          JsBarcode(barcodeSvgRef.current, String(customSku).trim(), {
            format: 'CODE128',
            width: is72mm ? 2.2 : 1.9,
            height: is72mm ? 44 : 38,
            displayValue: true,
            fontSize: 13,
            margin: 0
          });
        } catch (e) {
          console.warn('Error al generar código de barras:', e);
        }
      }
    }
  }, [customSku, barcodeType, customDescription, customCategory, labelSize]);

  // Imprimir directamente vía diálogo del navegador optimizado para ticket térmico de 72mm
  const handlePrint = () => {
    const printWindow = window.open('', '_blank', 'width=750,height=600');
    if (!printWindow) {
      toast.error('Por favor permite las ventanas emergentes (pop-ups) para imprimir');
      return;
    }

    const svgContent = barcodeSvgRef.current ? barcodeSvgRef.current.outerHTML : '';
    const numCopies = Math.max(1, parseInt(copies, 10) || 1);

    const isContinuousRoll = labelSize !== 'sheet';
    
    let labelWidthMm = '72mm';
    let labelHeightMm = '45mm';

    if (labelSize === '72x60') {
      labelWidthMm = '72mm';
      labelHeightMm = '60mm';
    } else if (labelSize === '58x40') {
      labelWidthMm = '58mm';
      labelHeightMm = '40mm';
    }

    let labelsHtml = '';
    for (let i = 0; i < numCopies; i++) {
      labelsHtml += `
        <div class="label-wrapper">
          <div class="label-box">
            <div class="product-header">
              <div class="product-title">${escapeHtml(customDescription)}</div>
              ${customCategory ? `<div class="product-category">${escapeHtml(customCategory)}</div>` : ''}
            </div>
            <div class="barcode-container">
              ${svgContent}
            </div>
            <div class="label-footer">
              <span class="label-sku">SKU: ${escapeHtml(customSku)}</span>
              <span class="label-date">${escapeHtml(customDate)}</span>
            </div>
          </div>
        </div>
      `;
    }

    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <title>Ticket Etiqueta - ${escapeHtml(customSku)}</title>
          <style>
            @page {
              size: ${isContinuousRoll ? `${labelWidthMm} ${labelHeightMm}` : 'letter portrait'};
              margin: 0mm;
            }
            * {
              box-sizing: border-box;
              margin: 0;
              padding: 0;
            }
            body {
              font-family: Arial, Helvetica, sans-serif;
              color: #000;
              background: #fff;
              -webkit-print-color-adjust: exact;
              print-color-adjust: exact;
              width: ${isContinuousRoll ? labelWidthMm : 'auto'};
            }
            .labels-container {
              display: ${isContinuousRoll ? 'block' : 'flex'};
              flex-wrap: wrap;
              gap: ${isContinuousRoll ? '0mm' : '4mm'};
              justify-content: flex-start;
              margin: 0 auto;
            }
            .label-wrapper {
              width: ${labelWidthMm};
              height: ${labelHeightMm};
              padding: 1.5mm;
              margin: 0 auto;
              page-break-inside: avoid;
              ${isContinuousRoll ? 'page-break-after: always;' : ''}
            }
            .label-box {
              width: 100%;
              height: 100%;
              padding: 2.5mm 3.5mm 2mm 3.5mm;
              border: 2px solid #000000;
              border-radius: 2px;
              display: flex;
              flex-direction: column;
              justify-content: space-between;
              background: #fff;
              overflow: hidden;
            }
            .product-header {
              text-align: left;
            }
            .product-title {
              font-size: ${labelSize.startsWith('72') ? '12.5px' : '11px'};
              font-weight: 900;
              line-height: 1.2;
              max-height: 32px;
              overflow: hidden;
              text-overflow: ellipsis;
              display: -webkit-box;
              -webkit-line-clamp: 2;
              -webkit-box-orient: vertical;
              text-transform: uppercase;
              color: #000000;
              letter-spacing: -0.2px;
            }
            .product-category {
              font-size: 9px;
              font-weight: 700;
              color: #222222;
              text-transform: uppercase;
              margin-top: 1.5px;
            }
            .barcode-container {
              text-align: center;
              display: flex;
              justify-content: center;
              align-items: center;
              margin: 1.5mm 0 1mm 0;
            }
            .barcode-container svg {
              max-width: 100%;
              height: auto;
              max-height: 24mm;
            }
            .label-footer {
              display: flex;
              justify-content: space-between;
              align-items: center;
              margin-top: 1px;
              font-size: 8.5px;
              font-weight: 800;
              border-top: 1px solid #000000;
              padding-top: 1.5px;
            }
            .label-sku {
              color: #000000;
            }
            .label-date {
              color: #000000;
            }
          </style>
        </head>
        <body>
          <div class="labels-container">
            ${labelsHtml}
          </div>
          <script>
            window.onload = function() {
              window.print();
              setTimeout(function() { window.close(); }, 600);
            };
          </script>
        </body>
      </html>
    `;

    printWindow.document.open();
    printWindow.document.write(html);
    printWindow.document.close();
  };

  // Descargar archivo PDF de las etiquetas optimizado para ticket 72mm
  const handleDownloadPdf = () => {
    try {
      const numCopies = Math.max(1, parseInt(copies, 10) || 1);
      const isContinuous = labelSize !== 'sheet';

      let widthMm = 72;
      let heightMm = 45;

      if (labelSize === '72x60') {
        widthMm = 72;
        heightMm = 60;
      } else if (labelSize === '58x40') {
        widthMm = 58;
        heightMm = 40;
      }

      const doc = isContinuous 
        ? new jsPDF({ orientation: 'landscape', unit: 'mm', format: [heightMm, widthMm] })
        : new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'letter' });

      // Convertir SVG a DataURL vía Canvas
      const svgElement = barcodeSvgRef.current;
      if (!svgElement) return;

      const svgData = new XMLSerializer().serializeToString(svgElement);
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      const img = new Image();

      img.onload = () => {
        canvas.width = img.width * 2;
        canvas.height = img.height * 2;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        const barcodeImgData = canvas.toDataURL('image/png');

        if (isContinuous) {
          for (let i = 0; i < numCopies; i++) {
            if (i > 0) doc.addPage([heightMm, widthMm], 'landscape');

            // Contorno / Marco exterior sólido
            doc.setDrawColor(0, 0, 0);
            doc.setLineWidth(0.6);
            doc.rect(1.5, 1.5, widthMm - 3, heightMm - 3);

            // Información del Producto (Nombre y Categoría)
            doc.setFont('Helvetica', 'bold');
            doc.setFontSize(9.5);
            doc.text(customDescription.toUpperCase().substring(0, 36), 3.5, 6);

            if (customCategory) {
              doc.setFontSize(7);
              doc.setFont('Helvetica', 'bold');
              doc.text(`CAT: ${customCategory.toUpperCase()}`, 3.5, 9.5);
            }

            // Código de barras centrado
            const bcWidth = widthMm - 14;
            doc.addImage(barcodeImgData, 'PNG', (widthMm - bcWidth) / 2, 11, bcWidth, heightMm - 18);

            // Línea separadora de pie
            doc.setLineWidth(0.3);
            doc.line(3.5, heightMm - 4.5, widthMm - 3.5, heightMm - 4.5);

            // Fecha y SKU en el pie
            doc.setFontSize(7);
            doc.setFont('Helvetica', 'bold');
            doc.text(`SKU: ${customSku}`, 3.5, heightMm - 2);
            doc.text(customDate, widthMm - 3.5, heightMm - 2, { align: 'right' });
          }
        } else {
          // Hoja Carta con cuadrícula
          let x = 10;
          let y = 15;
          const cols = 3;
          const colWidth = 64;
          const rowHeight = 44;

          for (let i = 0; i < numCopies; i++) {
            const col = i % cols;
            const row = Math.floor((i % (cols * 5)) / cols);

            if (i > 0 && i % (cols * 5) === 0) {
              doc.addPage();
              x = 10;
              y = 15;
            }

            const currentX = x + col * colWidth;
            const currentY = y + row * rowHeight;

            // Contorno
            doc.setDrawColor(0, 0, 0);
            doc.setLineWidth(0.6);
            doc.rect(currentX, currentY, 60, 40);

            // Información del Producto
            doc.setFont('Helvetica', 'bold');
            doc.setFontSize(8.5);
            doc.text(customDescription.toUpperCase().substring(0, 30), currentX + 3, currentY + 5.5);

            if (customCategory) {
              doc.setFontSize(6.5);
              doc.setFont('Helvetica', 'bold');
              doc.text(`CAT: ${customCategory.toUpperCase()}`, currentX + 3, currentY + 8.5);
            }

            // Código de barras
            doc.addImage(barcodeImgData, 'PNG', currentX + 5, currentY + 10, 50, 24);

            // Línea separadora
            doc.setLineWidth(0.2);
            doc.line(currentX + 3, currentY + 35.5, currentX + 57, currentY + 35.5);

            // Fecha y SKU
            doc.setFontSize(6.5);
            doc.setFont('Helvetica', 'bold');
            doc.text(`SKU: ${customSku}`, currentX + 3, currentY + 38.5);
            doc.text(customDate, currentX + 57, currentY + 38.5, { align: 'right' });
          }
        }

        doc.save(`Ticket_Etiqueta_72mm_${customSku}_${customDate.replace(/\//g, '-')}.pdf`);
        toast.success('Etiquetas exportadas a PDF exitosamente');
      };

      img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgData)));
    } catch (err) {
      console.error(err);
      toast.error('Error al generar PDF de etiquetas: ' + err.message);
    }
  };

  const escapeHtml = (text) => {
    if (!text) return '';
    return String(text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content" style={{ maxWidth: '720px', width: '95%' }}>
        <div className="topbar" style={{ marginBottom: '1.25rem', borderBottom: 'none' }}>
          <div>
            <h2 style={{ fontSize: '1.25rem', color: 'var(--color-primary)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Printer size={22} /> Imprimir Etiqueta Térmica (72mm)
            </h2>
            <p style={{ color: 'var(--color-text-light)', fontSize: '0.8rem', margin: '0.2rem 0 0 0' }}>
              Configurada para impresoras térmicas de ticket de 72mm (rollo de 80mm) con contorno de corte e información de producto.
            </p>
          </div>
          <button type="button" className="btn btn-outline" onClick={onClose} style={{ padding: '0.25rem' }}>
            <X size={18} />
          </button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.15fr', gap: '1.5rem', alignItems: 'start' }}>
          {/* Panel de Configuración */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label" style={{ fontSize: '0.8rem' }}>Descripción del Producto</label>
              <input
                type="text"
                className="form-input"
                value={customDescription}
                onChange={(e) => setCustomDescription(e.target.value)}
                placeholder="Nombre del producto"
                style={{ fontSize: '0.85rem' }}
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label" style={{ fontSize: '0.8rem' }}>Categoría / Detalle</label>
                <input
                  type="text"
                  className="form-input"
                  value={customCategory}
                  onChange={(e) => setCustomCategory(e.target.value)}
                  placeholder="Categoría"
                  style={{ fontSize: '0.85rem' }}
                />
              </div>

              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label" style={{ fontSize: '0.8rem' }}>Fecha (DD/MM/YY)</label>
                <input
                  type="text"
                  className="form-input"
                  value={customDate}
                  onChange={(e) => setCustomDate(e.target.value)}
                  placeholder="15/08/26"
                  style={{ fontSize: '0.85rem' }}
                />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label" style={{ fontSize: '0.8rem' }}>Código / SKU</label>
                <input
                  type="text"
                  className="form-input"
                  value={customSku}
                  onChange={(e) => setCustomSku(e.target.value)}
                  placeholder="6941821731893"
                  style={{ fontSize: '0.85rem' }}
                />
              </div>

              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label" style={{ fontSize: '0.8rem' }}>Cant. de Etiquetas</label>
                <input
                  type="number"
                  min="1"
                  max="500"
                  className="form-input"
                  value={copies}
                  onChange={(e) => setCopies(e.target.value)}
                  style={{ fontSize: '0.85rem' }}
                />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label" style={{ fontSize: '0.8rem' }}>Formato de Impresora</label>
                <select
                  className="form-select"
                  value={labelSize}
                  onChange={(e) => setLabelSize(e.target.value)}
                  style={{ fontSize: '0.85rem', fontWeight: '600' }}
                >
                  <option value="72x45">Ticket Térmico 72mm x 45mm (Rollo 80mm)</option>
                  <option value="72x60">Ticket Térmico 72mm x 60mm (Extendido)</option>
                  <option value="58x40">Ticket Térmico 58mm x 40mm (Rollo 58mm)</option>
                  <option value="sheet">Hoja Carta (Cuadrícula)</option>
                </select>
              </div>

              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label" style={{ fontSize: '0.8rem' }}>Formato Código</label>
                <select
                  className="form-select"
                  value={barcodeType}
                  onChange={(e) => setBarcodeType(e.target.value)}
                  style={{ fontSize: '0.85rem' }}
                >
                  <option value="CODE128">Code 128 (Universal)</option>
                  <option value="EAN13">EAN-13 (13 dígitos)</option>
                  <option value="CODE39">Code 39</option>
                </select>
              </div>
            </div>
          </div>

          {/* Vista Previa Visual 72mm */}
          <div>
            <label className="form-label" style={{ fontSize: '0.8rem', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
              <Settings2 size={14} /> Vista Previa Ticket Térmico 72mm:
            </label>

            {/* Contenedor del papel térmico */}
            <div
              style={{
                backgroundColor: '#f1f5f9',
                padding: '12px',
                borderRadius: '6px',
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center'
              }}
            >
              {/* Etiqueta 72mm con Contorno Sólido */}
              <div
                style={{
                  backgroundColor: '#ffffff',
                  color: '#000000',
                  border: '2.5px solid #000000',
                  borderRadius: '2px',
                  padding: '10px 14px 8px 14px',
                  boxShadow: '0 4px 10px rgba(0,0,0,0.15)',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  width: '100%',
                  minHeight: '190px',
                  userSelect: 'none'
                }}
              >
                {/* Cabecera: Descripción y Categoría */}
                <div>
                  <div
                    style={{
                      fontFamily: 'Arial, sans-serif',
                      fontSize: '0.95rem',
                      fontWeight: '900',
                      lineHeight: '1.2',
                      textTransform: 'uppercase',
                      color: '#000000',
                      letterSpacing: '-0.2px'
                    }}
                  >
                    {customDescription || 'NOMBRE DEL PRODUCTO'}
                  </div>
                  {customCategory && (
                    <div
                      style={{
                        fontFamily: 'Arial, sans-serif',
                        fontSize: '0.75rem',
                        fontWeight: '700',
                        color: '#1e293b',
                        textTransform: 'uppercase',
                        marginTop: '2px'
                      }}
                    >
                      {customCategory}
                    </div>
                  )}
                </div>

                {/* Código de Barras Centrado */}
                <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', margin: '6px 0 2px 0' }}>
                  <svg ref={barcodeSvgRef} style={{ maxWidth: '100%', height: 'auto', display: 'block' }}></svg>
                </div>

                {/* Pie: SKU y Fecha */}
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginTop: '2px',
                    borderTop: '1.5px solid #000000',
                    paddingTop: '3px'
                  }}
                >
                  <span
                    style={{
                      fontFamily: 'Arial, sans-serif',
                      fontSize: '0.75rem',
                      fontWeight: '800',
                      color: '#000000'
                    }}
                  >
                    SKU: {customSku}
                  </span>
                  <span
                    style={{
                      fontFamily: 'Arial, sans-serif',
                      fontSize: '0.78rem',
                      fontWeight: '900',
                      color: '#000000'
                    }}
                  >
                    {customDate}
                  </span>
                </div>
              </div>
            </div>

            <div style={{ marginTop: '0.65rem', fontSize: '0.75rem', color: 'var(--color-text-light)', textAlign: 'center' }}>
              ✓ Ancho optimizado a <strong>72mm</strong> para impresoras térmicas POS (rollo estándar de 80mm).
            </div>
          </div>
        </div>

        {/* Acciones del Modal */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '1.5rem', borderTop: '1px solid var(--color-border)', paddingTop: '1rem', flexWrap: 'wrap', gap: '0.75rem' }}>
          <button type="button" className="btn btn-outline" onClick={handleDownloadPdf}>
            <Download size={16} /> Descargar PDF 72mm ({copies} {copies === 1 ? 'ticket' : 'tickets'})
          </button>

          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <button type="button" className="btn btn-outline" onClick={onClose}>
              Cerrar
            </button>
            <button type="button" className="btn btn-primary" onClick={handlePrint}>
              <Printer size={16} /> Imprimir en Ticket Térmico {copies > 1 ? `(${copies} copias)` : ''}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProductLabelModal;
