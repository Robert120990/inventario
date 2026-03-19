import React, { useState, useMemo } from 'react';
import { useInventory } from '../../context/InventoryContext';
import { FileText, Download, FileOutput } from 'lucide-react';
import { exportToCsv } from '../../utils/exportCsv';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { formatDate, formatCurrency, formatPrice } from '../../utils/formatUtils';

const Summary = () => {
  const { products, movements, categoryUnits } = useInventory();
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    d.setDate(1); // First day of the current month
    return d.toISOString().split('T')[0];
  });
  const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);

  const summaryData = useMemo(() => {
    if (!startDate || !endDate || products.length === 0) return [];
    
    const start = new Date(startDate + 'T00:00:00');
    const end = new Date(endDate + 'T23:59:59');

    return products.map(p => {
      const unitType = categoryUnits[p.category] || 'units';
      const qtyField = unitType === 'units' ? 'qtyUnits' : 
                      unitType === 'pounds' ? 'qtyPounds' : 'qtyBaskets';
      const stockField = unitType === 'units' ? 'stockUnits' : 
                        unitType === 'pounds' ? 'stockPounds' : 'stockBaskets';
      const unitLabel = unitType === 'units' ? 'Und' : 
                       unitType === 'pounds' ? 'Lbs' : 'Cst';

      const pMovs = movements.filter(m => m.items && m.items.some(it => it.productId === p.id));
      let currentStock = Number(p[stockField] || 0);
      
      const afterEnd = pMovs.filter(m => {
        const mDate = new Date(m.date + 'T23:59:59');
        return mDate > end;
      });

      let stockAtEnd = currentStock;
      afterEnd.forEach(m => {
        const item = m.items.find(it => it.productId === p.id);
        if (item) {
          if (m.type === 'in') stockAtEnd -= Number(item[qtyField] || 0);
          if (m.type === 'out') stockAtEnd += Number(item[qtyField] || 0);
        }
      });

      const inRange = pMovs.filter(m => {
        const mDate = new Date(m.date + 'T12:00:00');
        return mDate >= start && mDate <= end;
      });

      let entradas = 0;
      let salidas = 0;
      inRange.forEach(m => {
        const item = m.items.find(it => it.productId === p.id);
        if (item) {
          if (m.type === 'in') entradas += Number(item[qtyField] || 0);
          if (m.type === 'out') salidas += Number(item[qtyField] || 0);
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
    const start = new Date(startDate + 'T00:00:00');
    const end = new Date(endDate + 'T23:59:59');

    const services = [];
    movements.forEach(m => {
      const mDate = new Date(m.date + 'T12:00:00');
      if (mDate >= start && mDate <= end && m.services) {
        m.services.forEach(s => {
          services.push({
            date: m.date,
            description: s.description,
            value: Number(s.value || 0),
            ref: m.refNumber
          });
        });
      }
    });
    return services;
  }, [movements, startDate, endDate]);

  const totalServices = servicesData.reduce((acc, curr) => acc + curr.value, 0);
  const invTotal = summaryData.reduce((acc, curr) => acc + curr.total, 0);
  const reportSubtotal = invTotal + totalServices;
  const reportIva = reportSubtotal * 0.13;
  const reportGrandTotal = reportSubtotal + reportIva;

  const handleExport = () => {
    const exportData = summaryData.map(d => ({
      Producto: d.producto,
      Categoría: d.categoria,
      Unidad: d.unidad,
      'Stock Inicial': d.stockInicial,
      Entradas: d.entradas,
      Salidas: d.salidas,
      'Stock Final': d.stockFinal,
      'Precio ($)': formatPrice(d.precio),
      'Total ($)': formatCurrency(d.total)
    }));

    const servicesExport = servicesData.map(s => ({
      Fecha: formatDate(s.date),
      Referencia: s.ref,
      Descripción: s.description,
      'Valor ($)': formatCurrency(s.value)
    }));

    const totalsExport = [
      {},
      { Producto: 'FIN DEL REPORTE' },
      { Producto: 'SUBTOTAL (INV + SERV)', 'Total ($)': formatCurrency(reportSubtotal) },
      { Producto: 'IVA (13%)', 'Total ($)': formatCurrency(reportIva) },
      { Producto: 'TOTAL CON IMPUESTOS', 'Total ($)': formatCurrency(reportGrandTotal) }
    ];

    exportToCsv([...exportData, {}, { Producto: 'SERVICIOS EXTRAORDINARIOS' }, ...servicesExport, ...totalsExport], `resumen_completo_${startDate}_al_${endDate}.csv`);
  };

  const handleExportPDF = () => {
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
  };

  return (
    <div>
      <div className="topbar">
        <h1 className="page-title">Resumen de Actividad</h1>
        <div style={{ display: 'flex', gap: '1rem' }}>
          <button className="btn btn-outline" onClick={handleExport}>
            <Download size={18} /> Exportar CSV
          </button>
          <button className="btn btn-primary" style={{ backgroundColor: '#e74c3c', borderColor: '#e74c3c' }} onClick={handleExportPDF}>
            <FileOutput size={18} /> Exportar PDF
          </button>
        </div>
      </div>

      <div className="card" style={{ marginBottom: '1.5rem', display: 'flex', gap: '1.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label className="form-label">Fecha Inicio</label>
          <input type="date" className="form-input" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        </div>
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label className="form-label">Fecha Fin</label>
          <input type="date" className="form-input" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
        </div>
        <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
          <h3 style={{ fontSize: '0.875rem', color: 'var(--color-text-light)' }}>Valoración Total (C/Impuestos)</h3>
          <p style={{ fontSize: '1.5rem', fontWeight: 'bold', color: 'var(--color-primary)' }}>${reportGrandTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
        </div>
      </div>

      <div className="card" style={{ padding: '0' }}>
        <div className="table-container" style={{ border: 'none', boxShadow: 'none' }}>
          <table>
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
          <div className="card" style={{ padding: '0' }}>
            <div className="table-container" style={{ border: 'none', boxShadow: 'none' }}>
              <table>
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
        <div style={{ marginTop: '2rem', textAlign: 'right', padding: '1.5rem' }}>
          <div style={{ display: 'inline-block', backgroundColor: 'var(--color-primary)', color: 'white', padding: '1.5rem', borderRadius: 'var(--radius)', boxShadow: 'var(--shadow-lg)', textAlign: 'right', minWidth: '350px' }}>
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
