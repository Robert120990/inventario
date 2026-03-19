import React, { useState, useMemo } from 'react';
import { useInventory } from '../../context/InventoryContext';
import { FileText, Download, FileSpreadsheet } from 'lucide-react';
import { exportToCsv } from '../../utils/exportCsv';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { formatDate, formatCurrency } from '../../utils/formatUtils';

const Summary2 = () => {
  const { products, movements, categories, categoryUnits } = useInventory();
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    d.setDate(1);
    return d.toISOString().split('T')[0];
  });
  const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);

  const summary2Data = useMemo(() => {
    if (!startDate || !endDate || products.length === 0) return [];
    
    const start = new Date(startDate + 'T00:00:00');
    const end = new Date(endDate + 'T23:59:59');
    
    // Generar lista de fechas en el rango
    const dates = [];
    let d = new Date(start);
    while (d <= end) {
      dates.push(d.toISOString().split('T')[0]);
      d.setDate(d.getDate() + 1);
    }

    const result = [];

    categories.forEach(cat => {
      const catProducts = products.filter(p => p.category === cat);
      if (catProducts.length === 0) return;

      dates.forEach(dateStr => {
        const currentDateEnd = new Date(dateStr + 'T23:59:59');

        let totalInitial = 0;
        let totalIn = 0;
        let totalOut = 0;
        let totalValue = 0;

        catProducts.forEach(p => {
          const unitType = categoryUnits[p.category] || 'units';
          const qtyField = unitType === 'units' ? 'qtyUnits' : 
                          unitType === 'pounds' ? 'qtyPounds' : 'qtyBaskets';
          const stockField = unitType === 'units' ? 'stockUnits' : 
                            unitType === 'pounds' ? 'stockPounds' : 'stockBaskets';

          const pMovs = movements.filter(m => m.items && m.items.some(it => it.productId === p.id));
          let currentStock = Number(p[stockField] || 0);

          // Stock al final del día dateStr
          const afterDate = pMovs.filter(m => {
            const mDate = new Date(m.date + 'T23:59:59');
            return mDate > currentDateEnd;
          });

          let stockAtEnd = currentStock;
          afterDate.forEach(m => {
            const item = m.items.find(it => it.productId === p.id);
            if (item) {
              if (m.type === 'in') stockAtEnd -= Number(item[qtyField] || 0);
              if (m.type === 'out') stockAtEnd += Number(item[qtyField] || 0);
            }
          });

          // Movimientos EN dateStr
          const onDate = pMovs.filter(m => m.date === dateStr);
          let inOnDate = 0;
          let outOnDate = 0;
          onDate.forEach(m => {
            const item = m.items.find(it => it.productId === p.id);
            if (item) {
              if (m.type === 'in') inOnDate += Number(item[qtyField] || 0);
              if (m.type === 'out') outOnDate += Number(item[qtyField] || 0);
            }
          });

          const initialOnDate = stockAtEnd - inOnDate + outOnDate;
          
          totalInitial += initialOnDate;
          totalIn += inOnDate;
          totalOut += outOnDate;
          totalValue += stockAtEnd * Number(p.price || 0);
        });

        if (totalIn > 0 || totalOut > 0) {
          result.push({
            categoria: cat,
            fecha: dateStr,
            stockInicial: totalInitial,
            entradas: totalIn,
            salidas: totalOut,
            stockFinal: totalInitial + totalIn - totalOut,
            totalMonto: totalValue
          });
        }
      });
    });

    return result;
  }, [products, movements, startDate, endDate, categories, categoryUnits]);

  const groupedData = useMemo(() => {
    const groups = {};
    summary2Data.forEach(item => {
      if (!groups[item.categoria]) {
        groups[item.categoria] = [];
      }
      groups[item.categoria].push(item);
    });
    return groups;
  }, [summary2Data]);

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
  
  // Para el Gran Total, necesitamos la valoración al FINAL del periodo (endDate) para cada producto
  const finalValuation = useMemo(() => {
    const end = new Date(endDate + 'T23:59:59');
    return products.reduce((acc, p) => {
      const unitType = categoryUnits[p.category] || 'units';
      const qtyField = unitType === 'units' ? 'qtyUnits' : 
                      unitType === 'pounds' ? 'qtyPounds' : 'qtyBaskets';
      const stockField = unitType === 'units' ? 'stockUnits' : 
                        unitType === 'pounds' ? 'stockPounds' : 'stockBaskets';

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

      return acc + (stockAtEnd * Number(p.price || 0));
    }, 0);
  }, [products, movements, endDate, categoryUnits]);

  const reportSubtotal = finalValuation + totalServices;
  const reportIva = reportSubtotal * 0.13;
  const reportGrandTotal = reportSubtotal + reportIva;

  const handleExport = () => {
    const exportData = summary2Data.map(d => ({
      Categoría: d.categoria,
      Fecha: formatDate(d.fecha),
      'Stock Inicial': d.stockInicial,
      Entradas: d.entradas,
      Salidas: d.salidas,
      'Stock Final': d.stockFinal,
      'Valorización ($)': formatCurrency(d.totalMonto)
    }));

    const servicesExport = servicesData.map(s => ({
      Fecha: formatDate(s.date),
      Referencia: s.ref,
      Descripción: s.description,
      'Valor ($)': formatCurrency(s.value)
    }));

    const totalsExport = [
      {},
      { Categoría: 'FIN DEL REPORTE' },
      { Categoría: 'SUBTOTAL (INV + SERV)', 'Valorización ($)': formatCurrency(reportSubtotal) },
      { Categoría: 'IVA (13%)', 'Valorización ($)': formatCurrency(reportIva) },
      { Categoría: 'TOTAL CON IMPUESTOS', 'Valorización ($)': formatCurrency(reportGrandTotal) }
    ];

    exportToCsv([...exportData, {}, { Categoría: 'SERVICIOS EXTRAORDINARIOS' }, ...servicesExport, ...totalsExport], `resumen_diario_${startDate}_al_${endDate}.csv`);
  };

  const handleExportPDF = () => {
    const doc = new jsPDF();
    doc.text(`Resumen Diario por Categoría (${startDate} al ${endDate})`, 14, 15);
    
    const tableColumn = ["Categoría", "Fecha", "S. Inicial", "Entradas", "Salidas", "S. Final", "Valorización"];
    const tableRows = [];

    Object.keys(groupedData).forEach(cat => {
      groupedData[cat].forEach(row => {
        tableRows.push([
          row.categoria,
          formatDate(row.fecha),
          row.stockInicial.toString(),
          row.entradas.toString(),
          row.salidas.toString(),
          row.stockFinal.toString(),
          `$${formatCurrency(row.totalMonto)}`
        ]);
      });
    });

    autoTable(doc, {
      head: [tableColumn],
      body: tableRows,
      startY: 20,
      styles: { fontSize: 8 },
      headStyles: { fillColor: [39, 174, 96] }
    });

    let currentY = doc.lastAutoTable.finalY + 10;

    if (servicesData.length > 0) {
      if (currentY > 250) { doc.addPage(); currentY = 20; }
      doc.setFont(undefined, 'bold');
      doc.text("Servicios Extraordinarios", 14, currentY);
      autoTable(doc, {
        head: [["Fecha", "Ref. Mov", "Descripción", "Valor"]],
        body: servicesData.map(s => [formatDate(s.date), s.ref, s.description, `$${formatCurrency(s.value)}`]),
        startY: currentY + 5,
        styles: { fontSize: 7 }
      });
      currentY = doc.lastAutoTable.finalY + 10;
    }

    if (currentY > 250) { doc.addPage(); currentY = 20; }
    doc.setFontSize(10);
    doc.text(`Total Inventario: $${formatCurrency(finalValuation)}`, 140, currentY);
    doc.text(`Total Servicios: $${formatCurrency(totalServices)}`, 140, currentY + 6);
    doc.text(`IVA (13%): $${formatCurrency(reportIva)}`, 140, currentY + 12);
    doc.setFont(undefined, 'bold');
    doc.text(`GRAN TOTAL: $${formatCurrency(reportGrandTotal)}`, 140, currentY + 18);

    doc.save(`resumen_diario_${startDate}_al_${endDate}.pdf`);
  };

  return (
    <div>
      <div className="topbar">
        <h1 className="page-title">Resumen de Actividad Diaria (Categorizado)</h1>
        <div style={{ display: 'flex', gap: '1rem' }}>
          <button className="btn btn-outline" onClick={handleExport}>
            <Download size={18} /> CSV
          </button>
          <button className="btn btn-primary" style={{ backgroundColor: '#27ae60', borderColor: '#27ae60' }} onClick={handleExportPDF}>
            <FileSpreadsheet size={18} /> PDF
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
          <h3 style={{ fontSize: '0.875rem', color: 'var(--color-text-light)' }}>Valoración Final Estimada</h3>
          <p style={{ fontSize: '1.5rem', fontWeight: 'bold', color: 'var(--color-success)' }}>${formatCurrency(reportGrandTotal)}</p>
        </div>
      </div>

      <div className="card" style={{ padding: '0' }}>
        <div className="table-container" style={{ border: 'none', boxShadow: 'none' }}>
          <table>
            <thead>
              <tr>
                <th>Categoría</th>
                <th>Fecha</th>
                <th style={{ textAlign: 'center' }}>S. Inicial</th>
                <th style={{ textAlign: 'center' }}>Entradas</th>
                <th style={{ textAlign: 'center' }}>Salidas</th>
                <th style={{ textAlign: 'center' }}>S. Final</th>
                <th style={{ textAlign: 'right' }}>Valoración Total</th>
              </tr>
            </thead>
            <tbody>
              {summary2Data.length === 0 ? (
                <tr>
                  <td colSpan="7" style={{ textAlign: 'center', padding: '2rem' }}>No hay actividad diaria en el rango seleccionado</td>
                </tr>
              ) : (
                Object.keys(groupedData).map(cat => (
                  <React.Fragment key={cat}>
                    <tr style={{ backgroundColor: 'var(--color-bg)', fontWeight: 'bold' }}>
                      <td colSpan="7" style={{ color: 'var(--color-success)', fontSize: '0.875rem' }}>{cat}</td>
                    </tr>
                    {groupedData[cat].map((row, idx) => (
                      <tr key={`${cat}-${idx}`}>
                        <td style={{ paddingLeft: '1.5rem', fontSize: '0.85rem', color: 'var(--color-text-light)' }}>{cat}</td>
                        <td style={{ fontWeight: '500' }}>{formatDate(row.fecha)}</td>
                        <td style={{ textAlign: 'center' }}>{row.stockInitial}</td>
                        <td style={{ color: 'var(--color-success)', textAlign: 'center' }}>+{row.entradas}</td>
                        <td style={{ color: 'var(--color-danger)', textAlign: 'center' }}>-{row.salidas}</td>
                        <td style={{ fontWeight: 'bold', textAlign: 'center' }}>{row.stockFinal}</td>
                        <td style={{ textAlign: 'right', fontWeight: '500' }}>${formatCurrency(row.totalMonto)}</td>
                      </tr>
                    ))}
                  </React.Fragment>
                ))
              )}
            </tbody>
            {summary2Data.length > 0 && (
              <tfoot>
                <tr style={{ backgroundColor: 'var(--color-surface)', fontWeight: 'bold' }}>
                  <td colSpan="6" style={{ textAlign: 'right', padding: '1rem' }}>VALORACIÓN INVENTARIO AL CIERRE:</td>
                  <td style={{ textAlign: 'right', padding: '1rem', color: 'var(--color-success)' }}>${formatCurrency(finalValuation)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      {servicesData.length > 0 && (
        <div style={{ marginTop: '2.5rem' }}>
          <h2 style={{ fontSize: '1.25rem', color: 'var(--color-primary)', marginBottom: '1rem' }}>Servicios Extraordinarios</h2>
          <div className="card" style={{ padding: '0' }}>
            <div className="table-container" style={{ border: 'none', boxShadow: 'none' }}>
              <table>
                <thead>
                  <tr>
                    <th>Fecha</th>
                    <th>Ref. Movimiento</th>
                    <th>Descripción</th>
                    <th style={{ textAlign: 'right' }}>Valor</th>
                  </tr>
                </thead>
                <tbody>
                  {servicesData.map((s, idx) => (
                    <tr key={idx}>
                      <td>{formatDate(s.date)}</td>
                      <td>{s.ref}</td>
                      <td>{s.description}</td>
                      <td style={{ textAlign: 'right' }}>${formatCurrency(s.value)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {(finalValuation > 0 || totalServices > 0) && (
        <div style={{ marginTop: '2rem', textAlign: 'right', padding: '1.5rem' }}>
          <div style={{ display: 'inline-block', backgroundColor: 'var(--color-success)', color: 'white', padding: '1.5rem', borderRadius: 'var(--radius)', boxShadow: 'var(--shadow-lg)', textAlign: 'right', minWidth: '350px' }}>
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

export default Summary2;
