import React, { useState, useEffect, useRef } from 'react';
import { X, Printer, Download, Copy, RefreshCw, Settings2, FileText, Check } from 'lucide-react';
import JsBarcode from 'jsbarcode';
import jsPDF from 'jspdf';
import { toast } from 'react-hot-toast';
import { formatPrice } from '../../utils/formatUtils';

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
  const [customPrice, setCustomPrice] = useState(product?.price !== undefined ? formatPrice(product.price) : '0.00');
  const [customSku, setCustomSku] = useState(product?.sku || '');
  const [customDate, setCustomDate] = useState(getDefaultDateFormatted());
  const [labelSize, setLabelSize] = useState('58x40'); // '58x40' | '50x30' | 'sheet'
  const [barcodeType, setBarcodeType] = useState('CODE128'); // 'CODE128' | 'EAN13' | 'CODE39'
  
  const barcodeSvgRef = useRef(null);

  // Renderizar código de barras reactivamente
  useEffect(() => {
    if (barcodeSvgRef.current && customSku) {
      try {
        JsBarcode(barcodeSvgRef.current, String(customSku).trim(), {
          format: barcodeType,
          width: 1.8,
          height: 38,
          displayValue: true,
          font: 'Arial',
          fontSize: 12,
          textMargin: 2,
          margin: 0,
          background: '#ffffff',
          lineColor: '#000000'
        });
      } catch (err) {
        // Fallback a CODE128 si falla formato específico
        try {
          JsBarcode(barcodeSvgRef.current, String(customSku).trim(), {
            format: 'CODE128',
            width: 1.8,
            height: 38,
            displayValue: true,
            fontSize: 12,
            margin: 0
          });
        } catch (e) {
          console.warn('Error al generar código de barras:', e);
        }
      }
    }
  }, [customSku, barcodeType, customPrice, customDescription]);

  // Imprimir directamente vía navegador
  const handlePrint = () => {
    const printWindow = window.open('', '_blank', 'width=750,height=600');
    if (!printWindow) {
      toast.error('Por favor permite las ventanas emergentes (pop-ups) para imprimir');
      return;
    }

    const svgContent = barcodeSvgRef.current ? barcodeSvgRef.current.outerHTML : '';
    const numCopies = Math.max(1, parseInt(copies, 10) || 1);

    const isContinuousRoll = labelSize !== 'sheet';
    const labelWidthMm = labelSize === '50x30' ? '50mm' : '58mm';
    const labelHeightMm = labelSize === '50x30' ? '30mm' : '40mm';

    let labelsHtml = '';
    for (let i = 0; i < numCopies; i++) {
      labelsHtml += `
        <div class="label-box">
          <div class="label-top-row">
            <div class="product-title">${escapeHtml(customDescription)}</div>
            <div class="product-price">$${escapeHtml(customPrice)}</div>
          </div>
          <div class="barcode-container">
            ${svgContent}
          </div>
          <div class="label-bottom-row">
            <span class="label-date">${escapeHtml(customDate)}</span>
          </div>
        </div>
      `;
    }

    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <title>Etiqueta - ${escapeHtml(customSku)}</title>
          <style>
            @page {
              size: ${isContinuousRoll ? `${labelWidthMm} ${labelHeightMm}` : 'letter portrait'};
              margin: ${isContinuousRoll ? '0mm' : '10mm'};
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
            }
            .labels-container {
              display: ${isContinuousRoll ? 'block' : 'flex'};
              flex-wrap: wrap;
              gap: 4mm;
              justify-content: flex-start;
            }
            .label-box {
              width: ${labelWidthMm};
              height: ${labelHeightMm};
              padding: 2.5mm 3mm 1.5mm 3mm;
              border: 1px solid #000;
              display: flex;
              flex-direction: column;
              justify-content: space-between;
              background: #fff;
              page-break-inside: avoid;
              ${isContinuousRoll ? 'page-break-after: always;' : ''}
              overflow: hidden;
            }
            .label-top-row {
              display: flex;
              justify-content: space-between;
              align-items: flex-start;
              gap: 4px;
            }
            .product-title {
              font-size: 11px;
              font-weight: bold;
              line-height: 1.15;
              max-height: 26px;
              overflow: hidden;
              text-overflow: ellipsis;
              display: -webkit-box;
              -webkit-line-clamp: 2;
              -webkit-box-orient: vertical;
              flex: 1;
              text-transform: uppercase;
            }
            .product-price {
              font-size: 20px;
              font-weight: 900;
              letter-spacing: -0.5px;
              white-space: nowrap;
              margin-left: 4px;
              line-height: 1;
            }
            .barcode-container {
              text-align: center;
              display: flex;
              justify-content: center;
              align-items: center;
              margin: 1mm 0 0 0;
            }
            .barcode-container svg {
              max-width: 100%;
              height: auto;
              max-height: 20mm;
            }
            .label-bottom-row {
              display: flex;
              justify-content: flex-end;
              align-items: center;
              margin-top: 0.5mm;
            }
            .label-date {
              font-size: 8.5px;
              font-weight: bold;
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
              setTimeout(function() { window.close(); }, 500);
            };
          </script>
        </body>
      </html>
    `;

    printWindow.document.open();
    printWindow.document.write(html);
    printWindow.document.close();
  };

  // Descargar archivo PDF de las etiquetas
  const handleDownloadPdf = () => {
    try {
      const numCopies = Math.max(1, parseInt(copies, 10) || 1);
      const isContinuous = labelSize !== 'sheet';

      // 58mm x 40mm en puntos (1mm = 2.83465 pt)
      const widthMm = labelSize === '50x30' ? 50 : 58;
      const heightMm = labelSize === '50x30' ? 30 : 40;

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

            // Borde exterior
            doc.setDrawColor(0, 0, 0);
            doc.setLineWidth(0.3);
            doc.rect(1.5, 1.5, widthMm - 3, heightMm - 3);

            // Título
            doc.setFont('Helvetica', 'bold');
            doc.setFontSize(8.5);
            doc.text(customDescription.toUpperCase().substring(0, 28), 3, 5.5);

            // Precio
            doc.setFontSize(16);
            doc.text(`$${customPrice}`, widthMm - 4, 8.5, { align: 'right' });

            // Código de barras
            doc.addImage(barcodeImgData, 'PNG', (widthMm - 44) / 2, 10, 44, 21);

            // Fecha
            doc.setFontSize(7);
            doc.setFont('Helvetica', 'bold');
            doc.text(customDate, widthMm - 4, heightMm - 3, { align: 'right' });
          }
        } else {
          // Hoja Carta con cuadrícula
          let x = 12;
          let y = 15;
          const cols = 3;
          const colWidth = 60;
          const rowHeight = 42;

          for (let i = 0; i < numCopies; i++) {
            const col = i % cols;
            const row = Math.floor((i % (cols * 6)) / cols);

            if (i > 0 && i % (cols * 6) === 0) {
              doc.addPage();
              x = 12;
              y = 15;
            }

            const currentX = x + col * colWidth;
            const currentY = y + row * rowHeight;

            doc.setDrawColor(0, 0, 0);
            doc.setLineWidth(0.3);
            doc.rect(currentX, currentY, 58, 38);

            doc.setFont('Helvetica', 'bold');
            doc.setFontSize(8);
            doc.text(customDescription.toUpperCase().substring(0, 24), currentX + 2.5, currentY + 5);

            doc.setFontSize(14);
            doc.text(`$${customPrice}`, currentX + 55, currentY + 8, { align: 'right' });

            doc.addImage(barcodeImgData, 'PNG', currentX + 6, currentY + 9, 46, 22);

            doc.setFontSize(7);
            doc.setFont('Helvetica', 'bold');
            doc.text(customDate, currentX + 55, currentY + 36, { align: 'right' });
          }
        }

        doc.save(`Etiqueta_${customSku}_${customDate.replace(/\//g, '-')}.pdf`);
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
      <div className="modal-content" style={{ maxWidth: '680px', width: '95%' }}>
        <div className="topbar" style={{ marginBottom: '1.25rem', borderBottom: 'none' }}>
          <div>
            <h2 style={{ fontSize: '1.25rem', color: 'var(--color-primary)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Printer size={22} /> Imprimir Etiqueta de Producto
            </h2>
            <p style={{ color: 'var(--color-text-light)', fontSize: '0.8rem', margin: '0.2rem 0 0 0' }}>
              Formato estándar con descripción, precio prominente, código de barras y fecha de etiquetado.
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
              <label className="form-label" style={{ fontSize: '0.8rem' }}>Descripción en Etiqueta</label>
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
                <label className="form-label" style={{ fontSize: '0.8rem' }}>Precio ($)</label>
                <input
                  type="text"
                  className="form-input"
                  value={customPrice}
                  onChange={(e) => setCustomPrice(e.target.value)}
                  placeholder="25.00"
                  style={{ fontSize: '0.9rem', fontWeight: 'bold' }}
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
                <label className="form-label" style={{ fontSize: '0.8rem' }}>Tamaño de Etiqueta</label>
                <select
                  className="form-select"
                  value={labelSize}
                  onChange={(e) => setLabelSize(e.target.value)}
                  style={{ fontSize: '0.85rem' }}
                >
                  <option value="58x40">Rollo 58mm x 40mm (Estándar)</option>
                  <option value="50x30">Rollo 50mm x 30mm (Compacto)</option>
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

          {/* Vista Previa Visual Idéntica a Etiqueta Física */}
          <div>
            <label className="form-label" style={{ fontSize: '0.8rem', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
              <Settings2 size={14} /> Vista Previa de Etiqueta:
            </label>

            <div
              style={{
                backgroundColor: '#ffffff',
                color: '#000000',
                borderRadius: '4px',
                border: '2px solid #1e293b',
                padding: '12px 14px 8px 14px',
                boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                minHeight: '190px',
                userSelect: 'none'
              }}
            >
              {/* Fila Superior: Nombre del Producto y Precio Grande */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
                <div
                  style={{
                    fontFamily: 'Arial, sans-serif',
                    fontSize: '0.85rem',
                    fontWeight: '800',
                    lineHeight: '1.2',
                    textTransform: 'uppercase',
                    color: '#000000',
                    flex: 1,
                    maxHeight: '36px',
                    overflow: 'hidden'
                  }}
                >
                  {customDescription || 'NOMBRE DEL PRODUCTO'}
                </div>

                <div
                  style={{
                    fontFamily: 'Arial, sans-serif',
                    fontSize: '1.65rem',
                    fontWeight: '900',
                    color: '#000000',
                    letterSpacing: '-0.5px',
                    lineHeight: '1',
                    whiteSpace: 'nowrap'
                  }}
                >
                  ${customPrice}
                </div>
              </div>

              {/* Código de Barras Centrado */}
              <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', margin: '4px 0 0 0' }}>
                <svg ref={barcodeSvgRef} style={{ maxWidth: '100%', height: 'auto', display: 'block' }}></svg>
              </div>

              {/* Fila Inferior: Fecha a la derecha */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', marginTop: '2px' }}>
                <span
                  style={{
                    fontFamily: 'Arial, sans-serif',
                    fontSize: '0.75rem',
                    fontWeight: '700',
                    color: '#000000'
                  }}
                >
                  {customDate}
                </span>
              </div>
            </div>

            <div style={{ marginTop: '0.75rem', fontSize: '0.75rem', color: 'var(--color-text-light)', textAlign: 'center' }}>
              Compatible con impresoras térmicas (Zebra, Xprinter, Dymo, POS) y hojas de etiquetas estándar.
            </div>
          </div>
        </div>

        {/* Acciones del Modal */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '1.5rem', borderTop: '1px solid var(--color-border)', paddingTop: '1rem', flexWrap: 'wrap', gap: '0.75rem' }}>
          <button type="button" className="btn btn-outline" onClick={handleDownloadPdf}>
            <Download size={16} /> Descargar PDF ({copies} {copies === 1 ? 'etiqueta' : 'etiquetas'})
          </button>

          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <button type="button" className="btn btn-outline" onClick={onClose}>
              Cerrar
            </button>
            <button type="button" className="btn btn-primary" onClick={handlePrint}>
              <Printer size={16} /> Imprimir {copies > 1 ? `(${copies} copias)` : ''}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProductLabelModal;
