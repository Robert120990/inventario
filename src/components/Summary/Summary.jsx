import React, { useState, useMemo } from 'react';
import { useInventory } from '../../context/InventoryContext';
import { FileText, Download } from 'lucide-react';
import { exportToCsv } from '../../utils/exportCsv';

const Summary = () => {
  const { products, movements } = useInventory();
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    d.setDate(1); // First day of the current month
    return d.toISOString().split('T')[0];
  });
  const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);

  const summaryData = useMemo(() => {
    if (!startDate || !endDate || products.length === 0) return [];
    
    // Set precise boundaries for the day
    const start = new Date(startDate + 'T00:00:00');
    const end = new Date(endDate + 'T23:59:59');

    return products.map(p => {
      // Movimientos del producto (si alguno de los items incluye el producto)
      const pMovs = movements.filter(m => m.items && m.items.some(it => it.productId === p.id));
      
      // Stock final actual
      let stockFinal = Number(p.stockUnits);
      
      // Movimientos después de la endDate (para restarlos y viajar en el tiempo)
      const afterEnd = pMovs.filter(m => {
        const mDate = new Date(m.date + 'T23:59:59');
        return mDate > end;
      });

      afterEnd.forEach(m => {
        const item = m.items.find(it => it.productId === p.id);
        if (item) {
          if (m.type === 'in') stockFinal -= Number(item.qtyUnits);
          if (m.type === 'out') stockFinal += Number(item.qtyUnits);
        }
      });

      // Movimientos EN EL RANGO
      const inRange = pMovs.filter(m => {
        const mDate = new Date(m.date + 'T12:00:00');
        return mDate >= start && mDate <= end;
      });

      let entradas = 0;
      let salidas = 0;
      inRange.forEach(m => {
        const item = m.items.find(it => it.productId === p.id);
        if (item) {
          if (m.type === 'in') entradas += Number(item.qtyUnits);
          if (m.type === 'out') salidas += Number(item.qtyUnits);
        }
      });

      // Stock inicial en la startDate
      const stockInicial = stockFinal - entradas + salidas;

      return {
        id: p.id,
        fecha: `${startDate} a ${endDate}`,
        producto: `${p.sku} - ${p.description}`,
        categoria: p.category,
        stockInicial,
        entradas,
        salidas,
        stockFinal,
        precio: Number(p.price),
        total: stockFinal * Number(p.price)
      };
    });
  }, [products, movements, startDate, endDate]);

  const handleExport = () => {
    const exportData = summaryData.map(d => ({
      'Rango Fechas': d.fecha,
      Producto: d.producto,
      Categoría: d.categoria,
      'Stock Inicial': d.stockInicial,
      Entradas: d.entradas,
      Salidas: d.salidas,
      'Stock Final': d.stockFinal,
      Precio: `$${d.precio.toFixed(2)}`,
      Total: `$${d.total.toFixed(2)}`
    }));
    exportToCsv(exportData, `resumen_${startDate}_al_${endDate}.csv`);
  };

  const totalValue = summaryData.reduce((acc, curr) => acc + curr.total, 0);

  return (
    <div>
      <div className="topbar">
        <h1 className="page-title">Resumen de Inventario</h1>
        <button className="btn btn-outline" onClick={handleExport}>
          <Download size={18} /> Exportar CSV
        </button>
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
          <h3 style={{ fontSize: '0.875rem', color: 'var(--color-text-light)' }}>Valoración Total (Stock Final)</h3>
          <p style={{ fontSize: '1.5rem', fontWeight: 'bold', color: 'var(--color-primary)' }}>${totalValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
        </div>
      </div>

      <div className="card" style={{ padding: '0' }}>
        <div className="table-container" style={{ border: 'none', boxShadow: 'none' }}>
          <table>
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Producto</th>
                <th>Categoría</th>
                <th style={{ textAlign: 'center' }}>Stock Inicial</th>
                <th style={{ textAlign: 'center' }}>Entradas</th>
                <th style={{ textAlign: 'center' }}>Salidas</th>
                <th style={{ textAlign: 'center' }}>Stock Final</th>
                <th>Precio</th>
                <th>Total</th>
              </tr>
            </thead>
            <tbody>
              {summaryData.length === 0 ? (
                <tr>
                  <td colSpan="9" style={{ textAlign: 'center', padding: '2rem' }}>No hay datos para mostrar</td>
                </tr>
              ) : (
                summaryData.map(row => (
                  <tr key={row.id}>
                    <td style={{ fontSize: '0.75rem', color: 'var(--color-text-light)', whiteSpace: 'nowrap' }}>{row.fecha}</td>
                    <td style={{ fontWeight: '500', minWidth: '200px' }}>{row.producto}</td>
                    <td><span className="badge badge-gray">{row.categoria}</span></td>
                    <td style={{ textAlign: 'center' }}>{row.stockInicial}</td>
                    <td style={{ color: 'var(--color-success)', fontWeight: 'bold', textAlign: 'center' }}>{row.entradas}</td>
                    <td style={{ color: 'var(--color-danger)', fontWeight: 'bold', textAlign: 'center' }}>{row.salidas}</td>
                    <td style={{ fontWeight: 'bold', textAlign: 'center' }}>{row.stockFinal}</td>
                    <td>${row.precio.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                    <td style={{ fontWeight: 'bold', color: 'var(--color-primary)' }}>${row.total.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default Summary;
