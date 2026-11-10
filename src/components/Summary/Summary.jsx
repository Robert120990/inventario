import React, { useState, useMemo } from 'react';
import { useInventory } from '../../context/InventoryContext';
import { FileText, Download, FileSpreadsheet, FileOutput } from 'lucide-react';
import { formatDate, formatCurrency, formatPrice } from '../../utils/formatUtils';
import { CONTRACT_INFO, resolveServiceDetails } from '../../utils/contractRates';

import { toast } from 'react-hot-toast';
import { DatePicker, DateQuickPresets, getLocalDateStr } from '../Common/DatePicker';

const Summary = () => {
  const { products, movements, categoryUnits, canExport } = useInventory();
  const allowExport = canExport('summary');
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    d.setDate(1); // First day of the current month
    return getLocalDateStr(d);
  });
  const [endDate, setEndDate] = useState(() => getLocalDateStr(new Date()));
  const [clientName, _setClientName] = useState(CONTRACT_INFO.clientName);

  const handleStartDateChange = (newStart) => {
    setStartDate(newStart);
    if (endDate && newStart > endDate) {
      setEndDate(newStart);
    }
  };

  const handleEndDateChange = (newEnd) => {
    setEndDate(newEnd);
    if (startDate && newEnd < startDate) {
      setStartDate(newEnd);
    }
  };

  const handlePresetSelect = (start, end) => {
    setStartDate(start);
    setEndDate(end);
  };

  const summaryData = useMemo(() => {
    if (!startDate || !endDate || products.length === 0) return [];

    // Pre-indexar movimientos por producto en una sola pasada O(M) con fecha normalizada YYYY-MM-DD
    const movsByProduct = new Map();
    movements.forEach(m => {
      if (!Array.isArray(m.items) || m.items.length === 0) return;
      const mDateStr = String(m.date || '').split('T')[0];
      if (!mDateStr) return;
      m.items.forEach(it => {
        const key = String(it.productId);
        let bucket = movsByProduct.get(key);
        if (!bucket) {
          bucket = [];
          movsByProduct.set(key, bucket);
        }
        bucket.push({ type: m.type, dateStr: mDateStr, item: it });
      });
    });

    return products.map(p => {
      const unitType = categoryUnits[p.category] || 'units';
      const qtyField = unitType === 'units' ? 'qtyUnits' : 
                      unitType === 'pounds' ? 'qtyPounds' : 'qtyBaskets';
      const stockField = unitType === 'units' ? 'stockUnits' : 
                        unitType === 'pounds' ? 'stockPounds' : 'stockBaskets';
      const unitLabel = unitType === 'units' ? 'Und' : 
                       unitType === 'pounds' ? 'Lbs' : 'Cst';

      const pEntries = movsByProduct.get(String(p.id)) || [];
      const currentStock = Number(p[stockField] || 0);
      let stockAtEnd = currentStock;
      let entradas = 0;
      let salidas = 0;

      pEntries.forEach(({ type, dateStr, item }) => {
        const qty = Number(item[qtyField] || 0);
        if (dateStr > endDate) {
          if (type === 'in') stockAtEnd -= qty;
          if (type === 'out') stockAtEnd += qty;
        } else if (dateStr >= startDate && dateStr <= endDate) {
          if (type === 'in') entradas += qty;
          if (type === 'out') salidas += qty;
        }
      });

      const stockInicial = stockAtEnd - entradas + salidas;
      const precio = Number(p.price || 0);
      const total = stockAtEnd * precio;

      return {
        id: p.id,
        producto: `${p.sku} - ${p.description}`,
        categoria: p.category,
        unidad: unitLabel,
        stockInicial,
        entradas,
        salidas,
        stockFinal: stockAtEnd,
        precio,
        total
      };
    }).filter(row => row.entradas > 0 || row.salidas > 0);
  }, [products, movements, startDate, endDate, categoryUnits]);

  const groupedData = useMemo(() => {
    const groups = {};
    summaryData.forEach(item => {
      if (!groups[item.categoria]) {
        groups[item.categoria] = {
          items: [],
          totalStock: 0,
          totalMonto: 0
        };
      }
      groups[item.categoria].items.push(item);
      groups[item.categoria].totalStock += item.stockFinal;
      groups[item.categoria].totalMonto += item.total;
    });
    return groups;
  }, [summaryData]);

  const servicesData = useMemo(() => {
    if (!startDate || !endDate) return [];

    const services = [];
    movements.forEach(m => {
      const mDateStr = String(m.date || '').split('T')[0];
      if (mDateStr && mDateStr >= startDate && mDateStr <= endDate && m.services) {
        m.services.forEach(s => {
          const res = resolveServiceDetails(s);
          services.push({
            date: mDateStr,
            description: res.description,
            quantity: res.quantity,
            unitPrice: res.unitPrice,
            value: Number(res.value || 0),
            ref: m.refNumber
          });
        });
      }
    });
    return services;
  }, [movements, startDate, endDate]);


  const totalServicios = servicesData.reduce((acc, curr) => acc + curr.value, 0);
  const totalServices = totalServicios;
  const invTotal = summaryData.reduce((acc, curr) => acc + curr.total, 0);
  const reportSubtotal = invTotal + totalServicios;
  const reportIva = reportSubtotal * CONTRACT_INFO.ivaRate;
  const reportGrandTotal = reportSubtotal + reportIva;

  const handleExportXLSX = async () => {
    try {
      const { exportResumenCompleto } = await import('../../utils/exportManager');
      await exportResumenCompleto({
        clientName,
        startDate,
        endDate,
        summaryData,
        groupedData,
        extraServices: servicesData,
        totals: {
          invTotal,
          totalServicios,
          subtotal: reportSubtotal,
          iva: reportIva,
          totalGeneral: reportGrandTotal
        },
        format: 'xlsx'
      });
      toast.success('Resumen de actividad descargado en Excel (.xlsx)');
    } catch (err) {
      console.error(err);
      toast.error('Error al exportar a Excel: ' + err.message);
    }
  };

  const handleExportCSV = async () => {
    try {
      const { exportResumenCompleto } = await import('../../utils/exportManager');
      await exportResumenCompleto({
        clientName,
        startDate,
        endDate,
        summaryData,
        groupedData,
        extraServices: servicesData,
        totals: {
          invTotal,
          totalServicios,
          subtotal: reportSubtotal,
          iva: reportIva,
          totalGeneral: reportGrandTotal
        },
        format: 'csv'
      });
      toast.success('Resumen de actividad descargado en CSV');
    } catch (err) {
      console.error(err);
      toast.error('Error al exportar a CSV: ' + err.message);
    }
  };

  const handleExportPDF = async () => {
    try {
      const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([
        import('jspdf'),
        import('jspdf-autotable')
      ]);
      const doc = new jsPDF();
      doc.text(`Resumen de Actividad (${startDate} al ${endDate})`, 14, 15);
    
    const tableColumn = ["Producto", "UM", "S. Inicial", "Ent.", "Sal.", "S. Final", "Precio", "Total"];
    const tableRows = [];

    Object.keys(groupedData).forEach(cat => {
      tableRows.push([{ content: cat, colSpan: 8, styles: { fillColor: [240, 240, 240], fontStyle: 'bold' } }]);
      
      groupedData[cat].items.forEach(row => {
        tableRows.push([
          row.producto,
          row.unidad,
          row.stockInicial.toString(),
          row.entradas.toString(),
          row.salidas.toString(),
          row.stockFinal.toString(),
          `$${formatPrice(row.precio)}`,
          `$${formatCurrency(row.total)}`
        ]);
      });

      tableRows.push([
        { content: `Total ${cat}`, colSpan: 5, styles: { fontStyle: 'bold', halign: 'right' } },
        { content: groupedData[cat].totalStock.toString(), styles: { fontStyle: 'bold', halign: 'center' } },
        '',
        { content: `$${formatCurrency(groupedData[cat].totalMonto)}`, styles: { fontStyle: 'bold', halign: 'right' } }
      ]);
    });

    autoTable(doc, {
      head: [tableColumn],
      body: tableRows,
      startY: 20,
      styles: { fontSize: 7 },
      headStyles: { fillColor: [41, 128, 185] },
      columnStyles: {
        2: { halign: 'center' },
        3: { halign: 'center' },
        4: { halign: 'center' },
        5: { halign: 'center' },
        6: { halign: 'right' },
        7: { halign: 'right' }
      }
    });

    let currentY = doc.lastAutoTable.finalY + 10;

    if (servicesData.length > 0) {
      if (currentY > 250) { doc.addPage(); currentY = 20; }
      
      doc.setFont(undefined, 'bold');
      doc.text("Detalle de Servicios Extraordinarios", 14, currentY);
      
      autoTable(doc, {
        head: [["Fecha", "Ref. Mov", "Descripción Servicio", "Valor"]],
        body: servicesData.map(s => [formatDate(s.date), s.ref, s.description, `$${formatCurrency(s.value)}`]),
        startY: currentY + 5,
        styles: { fontSize: 7 },
        headStyles: { fillColor: [52, 152, 219] }
      });
      currentY = doc.lastAutoTable.finalY + 10;
    }

    if (currentY > 250) { doc.addPage(); currentY = 20; }
    
    doc.setFontSize(10);
    doc.setFont(undefined, 'normal');
    
    if (totalServices > 0) {
      doc.text(`Total Servicios: $${formatCurrency(totalServices)}`, 140, currentY);
      currentY += 6;
    }
    
    doc.text(`Subtotal: $${formatCurrency(reportSubtotal)}`, 140, currentY);
    currentY += 6;
    doc.text(`IVA (13%): $${formatCurrency(reportIva)}`, 140, currentY);
    currentY += 6;
    doc.setFont(undefined, 'bold');
    doc.text(`TOTAL REPORTE: $${formatCurrency(reportGrandTotal)}`, 140, currentY);

    doc.save(`resumen_${startDate}_al_${endDate}.pdf`);
    } catch (err) {
      console.error('Error al generar PDF:', err);
      toast.error('Error al generar PDF: ' + err.message);
    }
  };

  return (
    <div>
      <div className="topbar">
        <h1 className="page-title">Resumen de Actividad</h1>
        {allowExport && (
          <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
            <button className="btn btn-primary" onClick={handleExportXLSX}>
              <FileSpreadsheet size={18} /> Exportar Excel (.xlsx)
            </button>
            <button className="btn btn-outline" onClick={handleExportCSV}>
              <Download size={18} /> Exportar CSV
            </button>
            <button className="btn btn-outline" onClick={handleExportPDF}>
              <FileOutput size={18} /> Exportar PDF
            </button>
          </div>
        )}
      </div>

      <div className="card" style={{ marginBottom: '1.5rem', padding: '1.25rem' }}>
        <div style={{ marginBottom: '1rem', paddingBottom: '0.85rem', borderBottom: '1px solid var(--color-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
          <DateQuickPresets
            startDate={startDate}
            endDate={endDate}
            onSelectRange={handlePresetSelect}
          />
        </div>

        <div style={{ display: 'flex', gap: '1.25rem', alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div className="form-group" style={{ marginBottom: 0, minWidth: '180px', flex: '1 1 200px' }}>
            <DatePicker
              label="Fecha Inicio"
              value={startDate}
              onChange={handleStartDateChange}
              max={endDate}
            />
          </div>
          <div className="form-group" style={{ marginBottom: 0, minWidth: '180px', flex: '1 1 200px' }}>
            <DatePicker
              label="Fecha Fin"
              value={endDate}
              onChange={handleEndDateChange}
              min={startDate}
            />
          </div>
          <div style={{ marginLeft: 'auto', textAlign: 'right', minWidth: '220px' }}>
            <h3 style={{ fontSize: '0.875rem', color: 'var(--color-text-light)' }}>Valoración Total (C/Impuestos)</h3>
            <p style={{ fontSize: '1.5rem', fontWeight: 'bold', color: 'var(--color-primary)' }}>${reportGrandTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
          </div>
        </div>
      </div>

      <div className="card" style={{ padding: '0', overflow: 'hidden' }}>
        <div className="table-container table-scroll-both" style={{ border: 'none', boxShadow: 'none', margin: 0 }}>
          <table style={{ width: '100%', minWidth: '720px' }}>
            <thead>
              <tr>
                <th>Producto</th>
                <th style={{ textAlign: 'center' }}>U.M.</th>
                <th style={{ textAlign: 'center' }}>S. Inicial</th>
                <th style={{ textAlign: 'center' }}>Entradas</th>
                <th style={{ textAlign: 'center' }}>Salidas</th>
                <th style={{ textAlign: 'center' }}>S. Final</th>
                <th style={{ textAlign: 'right' }}>Precio</th>
                <th style={{ textAlign: 'right' }}>Total</th>
              </tr>
            </thead>
            <tbody>
              {summaryData.length === 0 ? (
                <tr>
                  <td colSpan="8" style={{ textAlign: 'center', padding: '2rem' }}>No hay movimientos en el rango seleccionado</td>
                </tr>
              ) : (
                Object.keys(groupedData).map(cat => (
                  <React.Fragment key={cat}>
                    <tr style={{ backgroundColor: 'var(--color-bg)', fontWeight: 'bold' }}>
                      <td colSpan="8" style={{ color: 'var(--color-primary)', fontSize: '0.875rem' }}>{cat}</td>
                    </tr>
                    {groupedData[cat].items.map((row, idx) => (
                      <tr key={`${cat}-${idx}`}>
                        <td style={{ fontWeight: '400', minWidth: '200px', paddingLeft: '1.5rem' }}>{row.producto}</td>
                        <td style={{ textAlign: 'center' }}><span className="badge badge-gray">{row.unidad}</span></td>
                        <td style={{ textAlign: 'center' }}>{row.stockInicial}</td>
                        <td style={{ color: 'var(--color-success)', textAlign: 'center' }}>{row.entradas}</td>
                        <td style={{ color: 'var(--color-danger)', textAlign: 'center' }}>{row.salidas}</td>
                        <td style={{ fontWeight: '500', textAlign: 'center' }}>{row.stockFinal}</td>
                        <td style={{ textAlign: 'right' }}>${formatPrice(row.precio)}</td>
                        <td style={{ textAlign: 'right', fontWeight: '500' }}>${formatCurrency(row.total)}</td>
                      </tr>
                    ))}
                    <tr style={{ borderBottom: '2px solid var(--color-border)' }}>
                      <td colSpan="5" style={{ textAlign: 'right', fontWeight: 'bold', color: 'var(--color-text-light)', fontSize: '0.875rem' }}>Total {cat}:</td>
                      <td style={{ textAlign: 'center', fontWeight: 'bold', color: 'var(--color-primary)' }}>{groupedData[cat].totalStock}</td>
                      <td></td>
                      <td style={{ textAlign: 'right', fontWeight: 'bold', color: 'var(--color-primary)' }}>${formatCurrency(groupedData[cat].totalMonto)}</td>
                    </tr>
                  </React.Fragment>
                ))
              )}
            </tbody>
            {summaryData.length > 0 && (
              <tfoot>
                <tr style={{ backgroundColor: 'var(--color-surface)', fontWeight: 'bold' }}>
                  <td colSpan="7" style={{ textAlign: 'right', padding: '1rem' }}>VALORACIÓN INVENTARIO:</td>
                  <td style={{ textAlign: 'right', padding: '1rem', color: 'var(--color-primary)' }}>${formatCurrency(invTotal)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      {servicesData.length > 0 && (
        <div style={{ marginTop: '2.5rem' }}>
          <h2 style={{ fontSize: '1.25rem', color: 'var(--color-primary)', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <FileText size={20} /> Servicios Extraordinarios del Periodo
          </h2>
          <div className="card" style={{ padding: '0', overflow: 'hidden' }}>
            <div className="table-container table-scroll-both" style={{ border: 'none', boxShadow: 'none', margin: 0 }}>
              <table style={{ width: '100%', minWidth: '580px' }}>
                <thead>
                  <tr style={{ backgroundColor: 'var(--color-bg)' }}>
                    <th>Fecha</th>
                    <th>Ref. Movimiento</th>
                    <th>Descripción del Servicio</th>
                    <th style={{ textAlign: 'right' }}>Valor</th>
                  </tr>
                </thead>
                <tbody>
                  {servicesData.map((s, idx) => (
                    <tr key={idx}>
                      <td>{formatDate(s.date)}</td>
                      <td>{s.ref}</td>
                      <td style={{ fontWeight: '500' }}>{s.description}</td>
                      <td style={{ textAlign: 'right', fontWeight: 'bold' }}>${formatCurrency(s.value)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr style={{ fontWeight: 'bold', backgroundColor: 'var(--color-surface)' }}>
                    <td colSpan="3" style={{ textAlign: 'right', padding: '1rem' }}>TOTAL SERVICIOS:</td>
                    <td style={{ textAlign: 'right', padding: '1rem', color: 'var(--color-primary)' }}>${totalServices.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </div>
      )}

      {(invTotal > 0 || totalServices > 0) && (
        <div style={{ marginTop: '2rem', display: 'flex', justifyContent: 'flex-end', padding: '0.5rem 0' }}>
          <div style={{ width: '100%', maxWidth: '420px', backgroundColor: 'var(--color-primary)', color: 'white', padding: '1.35rem', borderRadius: 'var(--radius)', boxShadow: 'var(--shadow-lg)', textAlign: 'right' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem', opacity: 0.9 }}>
              <span>Subtotal (Inv + Serv):</span>
              <span>${formatCurrency(reportSubtotal)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem', borderBottom: '1px solid rgba(255,255,255,0.3)', paddingBottom: '0.5rem', opacity: 0.9 }}>
              <span>IVA (13%):</span>
              <span>${formatCurrency(reportIva)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '1.5rem', fontWeight: 'bold' }}>
              <span>GRAN TOTAL:</span>
              <span>${formatCurrency(reportGrandTotal)}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Summary;
