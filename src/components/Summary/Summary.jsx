import React, { useState, useMemo } from 'react';
import { useInventory } from '../../context/InventoryContext';
import { FileText, Download, FileOutput } from 'lucide-react';
import { exportToCsv } from '../../utils/exportCsv';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

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
      const precio = Number(p.price);
      const total = stockAtEnd * precio;

      return {
        id: p.id,
        producto: `${p.sku} - ${p.description}`,
        categoria: p.category,
        unidad: unitLabel,
        unitType,
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

  const handleExport = () => {
    const exportData = summaryData.map(d => ({
      Producto: d.producto,
      Categoría: d.categoria,
      Unidad: d.unidad,
      'Stock Inicial': d.stockInicial,
      Entradas: d.entradas,
      Salidas: d.salidas,
      'Stock Final': d.stockFinal,
      'Precio ($)': d.precio.toFixed(2),
      'Total ($)': d.total.toFixed(2)
    }));
    exportToCsv(exportData, `resumen_activos_${startDate}_al_${endDate}.csv`);
  };

  const handleExportPDF = () => {
    const doc = new jsPDF();
    doc.text(`Resumen de Actividad (${startDate} al ${endDate})`, 14, 15);
    
    const tableColumn = ["Producto", "UM", "S. Inicial", "Ent.", "Sal.", "S. Final", "Precio", "Total"];
    const tableRows = [];

    Object.keys(groupedData).forEach(cat => {
      // Category Header
      tableRows.push([{ content: cat, colSpan: 8, styles: { fillColor: [240, 240, 240], fontStyle: 'bold' } }]);
      
      groupedData[cat].items.forEach(row => {
        tableRows.push([
          row.producto,
          row.unidad,
          row.stockInicial.toString(),
          row.entradas.toString(),
          row.salidas.toString(),
          row.stockFinal.toString(),
          `$${row.precio.toFixed(2)}`,
          `$${row.total.toFixed(2)}`
        ]);
      });

      // Category Total
      tableRows.push([
        { content: `Total ${cat}`, colSpan: 5, styles: { fontStyle: 'bold', halign: 'right' } },
        { content: groupedData[cat].totalStock.toString(), styles: { fontStyle: 'bold', halign: 'center' } },
        '',
        { content: `$${groupedData[cat].totalMonto.toFixed(2)}`, styles: { fontStyle: 'bold', halign: 'right' } }
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

    doc.save(`resumen_${startDate}_al_${endDate}.pdf`);
  };

  const grandTotal = summaryData.reduce((acc, curr) => acc + curr.total, 0);

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
          <h3 style={{ fontSize: '0.875rem', color: 'var(--color-text-light)' }}>Valoración Total del Rango</h3>
          <p style={{ fontSize: '1.5rem', fontWeight: 'bold', color: 'var(--color-primary)' }}>${grandTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
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
                        <td style={{ textAlign: 'right' }}>${row.precio.toFixed(2)}</td>
                        <td style={{ textAlign: 'right', fontWeight: '500' }}>${row.total.toFixed(2)}</td>
                      </tr>
                    ))}
                    <tr style={{ borderBottom: '2px solid var(--color-border)' }}>
                      <td colSpan="5" style={{ textAlign: 'right', fontWeight: 'bold', color: 'var(--color-text-light)', fontSize: '0.875rem' }}>Total {cat}:</td>
                      <td style={{ textAlign: 'center', fontWeight: 'bold', color: 'var(--color-primary)' }}>{groupedData[cat].totalStock}</td>
                      <td></td>
                      <td style={{ textAlign: 'right', fontWeight: 'bold', color: 'var(--color-primary)' }}>${groupedData[cat].totalMonto.toFixed(2)}</td>
                    </tr>
                  </React.Fragment>
                ))
              )}
            </tbody>
            {summaryData.length > 0 && (
              <tfoot>
                <tr style={{ backgroundColor: 'var(--color-surface)', fontWeight: 'bold' }}>
                  <td colSpan="7" style={{ textAlign: 'right', padding: '1rem' }}>VALORACIÓN TOTAL:</td>
                  <td style={{ textAlign: 'right', padding: '1rem', color: 'var(--color-primary)', fontSize: '1.1rem' }}>${grandTotal.toFixed(2)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </div>
  );
};

export default Summary;
