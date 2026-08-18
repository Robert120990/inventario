import React, { useState, useMemo } from 'react';
import { useInventory } from '../../context/InventoryContext';
import { FileText, Download, FileSpreadsheet, FileOutput, ShieldCheck } from 'lucide-react';
import { exportCuadroClienteCuartoFrio } from '../../utils/exportManager';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { formatDate, formatCurrency, formatPrice } from '../../utils/formatUtils';
import { CONTRACT_INFO } from '../../utils/contractRates';

const Summary2 = () => {
  const { products, movements, categories, categoryUnits, settings } = useInventory();
  
  // Rango de fechas por defecto: Mes actual (1 al día actual)
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    d.setDate(1);
    return d.toISOString().split('T')[0];
  });
  const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);
  const [clientName, setClientName] = useState(CONTRACT_INFO.clientName);
  const [selectedCategory, setSelectedCategory] = useState('all');

  // Movimientos diarios consolidados
  const dailyRows = useMemo(() => {
    if (!startDate || !endDate || products.length === 0) return [];
    
    const start = new Date(startDate + 'T00:00:00');
    const end = new Date(endDate + 'T23:59:59');
    
    const dates = [];
    let d = new Date(start);
    while (d <= end) {
      dates.push(d.toISOString().split('T')[0]);
      d.setDate(d.getDate() + 1);
    }

    const filteredProducts = selectedCategory === 'all' 
      ? products 
      : products.filter(p => p.category === selectedCategory);

    if (filteredProducts.length === 0) return [];

    const result = [];

    // Calcular el stock diario para cada fecha
    dates.forEach(dateStr => {
      const currentDateEnd = new Date(dateStr + 'T23:59:59');

      let dayInitialPounds = 0;
      let dayInPounds = 0;
      let dayOutPounds = 0;
      let dayFinalPounds = 0;

      filteredProducts.forEach(p => {
        const unitType = categoryUnits[p.category] || 'units';
        const qtyField = unitType === 'units' ? 'qtyUnits' : 
                        unitType === 'pounds' ? 'qtyPounds' : 'qtyBaskets';
        const stockField = unitType === 'units' ? 'stockUnits' : 
                          unitType === 'pounds' ? 'stockPounds' : 'stockBaskets';

        const pMovs = movements.filter(m => m.items && m.items.some(it => it.productId === p.id));
        let currentStock = Number(p[stockField] || 0);

        // Movimientos después de dateStr
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
        
        dayInitialPounds += initialOnDate;
        dayInPounds += inOnDate;
        dayOutPounds += outOnDate;
        dayFinalPounds += stockAtEnd;
      });

      // Tarifa diaria por libra según contrato 2025-2026 ($0.001 / lb / día para producto crudo)
      const dailyRate = CONTRACT_INFO.defaultStorageRatePounds;
      const dayTotalCost = dayFinalPounds * dailyRate;

      result.push({
        fecha: dateStr,
        descripcion: 'Mantenimiento congelado (-18°)',
        categoria: selectedCategory === 'all' ? 'General' : selectedCategory,
        stockInicial: dayInitialPounds,
        entradas: dayInPounds,
        salidas: dayOutPounds,
        stockFinal: dayFinalPounds,
        precio: dailyRate,
        totalMonto: dayTotalCost
      });
    });

    return result;
  }, [products, movements, startDate, endDate, selectedCategory, categoryUnits]);

  // Servicios extraordinarios registrados en el período
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
            quantity: s.quantity !== undefined ? Number(s.quantity) : 1,
            unitPrice: s.unitPrice !== undefined ? Number(s.unitPrice) : Number(s.value || 0),
            value: Number(s.value || 0),
            ref: m.refNumber
          });
        });
      }
    });
    return services;
  }, [movements, startDate, endDate]);

  // Totales de almacenamiento
  const totalInvInicial = dailyRows.reduce((acc, curr) => acc + curr.stockInicial, 0);
  const totalEntradas = dailyRows.reduce((acc, curr) => acc + curr.entradas, 0);
  const totalSalidas = dailyRows.reduce((acc, curr) => acc + curr.salidas, 0);
  const totalLibrasAcum = dailyRows.reduce((acc, curr) => acc + curr.stockFinal, 0);
  const totalAlmacenaje = dailyRows.reduce((acc, curr) => acc + curr.totalMonto, 0);

  // Totales de servicios
  const totalServicios = servicesData.reduce((acc, curr) => acc + curr.value, 0);

  // Subtotal, IVA y Gran Total
  const reportSubtotal = totalAlmacenaje + totalServicios;
  const reportIva = reportSubtotal * CONTRACT_INFO.ivaRate;
  const reportGrandTotal = reportSubtotal + reportIva;

  // Exportar Excel
  const handleExportXLSX = () => {
    exportCuadroClienteCuartoFrio({
      clientName,
      startDate,
      endDate,
      dailyRows,
      extraServices: servicesData,
      totals: {
        subtotal: reportSubtotal,
        iva: reportIva,
        totalGeneral: reportGrandTotal
      },
      format: 'xlsx'
    });
  };

  // Exportar CSV
  const handleExportCSV = () => {
    exportCuadroClienteCuartoFrio({
      clientName,
      startDate,
      endDate,
      dailyRows,
      extraServices: servicesData,
      totals: {
        subtotal: reportSubtotal,
        iva: reportIva,
        totalGeneral: reportGrandTotal
      },
      format: 'csv'
    });
  };

  // Exportar PDF
  const handleExportPDF = () => {
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'letter' });
    
    // Encabezado
    doc.setFontSize(10);
    doc.setFont(undefined, 'bold');
    doc.text("PROCESO DE FACTURACION POR ALMACENAMIENTO CONGELADO(-18°) Y SERVICIOS EXTRA-ORDINARIOS", 14, 15);
    doc.setFontSize(9);
    doc.setFont(undefined, 'normal');
    doc.text(`Cliente: ${clientName}`, 14, 21);
    doc.text(`Movimientos diarios entre: ${formatDate(startDate)} Hasta ${formatDate(endDate)}`, 14, 26);
    
    // Tabla 1: Almacenamiento
    const tableColumn = ["FECHA", "DESCRIPCION", "INV-INICIAL", "ENTRADA", "SALIDA", "TOTAL LBS", "PRECIO", "TOTAL $"];
    const tableRows = dailyRows.map(r => [
      formatDate(r.fecha),
      r.descripcion,
      r.stockInicial.toLocaleString('en-US', { maximumFractionDigits: 2 }),
      r.entradas.toLocaleString('en-US', { maximumFractionDigits: 2 }),
      r.salidas.toLocaleString('en-US', { maximumFractionDigits: 2 }),
      r.stockFinal.toLocaleString('en-US', { maximumFractionDigits: 2 }),
      `$${formatPrice(r.precio)}`,
      `$${formatCurrency(r.totalMonto)}`
    ]);

    tableRows.push([
      'Totales',
      '',
      totalInvInicial.toLocaleString('en-US', { maximumFractionDigits: 2 }),
      totalEntradas.toLocaleString('en-US', { maximumFractionDigits: 2 }),
      totalSalidas.toLocaleString('en-US', { maximumFractionDigits: 2 }),
      totalLibrasAcum.toLocaleString('en-US', { maximumFractionDigits: 2 }),
      '',
      `$${formatCurrency(totalAlmacenaje)}`
    ]);

    autoTable(doc, {
      head: [tableColumn],
      body: tableRows,
      startY: 31,
      styles: { fontSize: 6.5, cellPadding: 1.2 },
      headStyles: { fillColor: [41, 128, 185], textColor: 255, fontStyle: 'bold' },
      footStyles: { fillColor: [230, 230, 230], fontStyle: 'bold' }
    });

    let currentY = doc.lastAutoTable.finalY + 8;

    // Tabla 2: Servicios Extraordinarios
    if (servicesData.length > 0) {
      if (currentY > 230) { doc.addPage(); currentY = 20; }
      doc.setFont(undefined, 'bold');
      doc.setFontSize(9);
      doc.text("SERVICIOS EXTRA-ORDINARIOS", 14, currentY);
      
      const servRows = servicesData.map(s => [
        formatDate(s.date),
        s.description,
        s.quantity ? s.quantity.toLocaleString('en-US') : '1',
        s.unitPrice ? `$${formatPrice(s.unitPrice)}` : `$${formatCurrency(s.value)}`,
        `$${formatCurrency(s.value)}`
      ]);

      servRows.push(['TOTALES', '', '', '', `$${formatCurrency(totalServicios)}`]);

      autoTable(doc, {
        head: [["FECHA", "DESCRIPCION", "TOTAL", "PRECIO", "VALOR"]],
        body: servRows,
        startY: currentY + 3,
        styles: { fontSize: 7, cellPadding: 1.2 },
        headStyles: { fillColor: [52, 73, 94], textColor: 255, fontStyle: 'bold' }
      });

      currentY = doc.lastAutoTable.finalY + 8;
    }

    if (currentY > 240) { doc.addPage(); currentY = 20; }
    
    // Totales Finales
    doc.setFontSize(9);
    doc.setFont(undefined, 'normal');
    doc.text(`Sub Total: $${formatCurrency(reportSubtotal)}`, 140, currentY);
    doc.text(`IVA (13%): $${formatCurrency(reportIva)}`, 140, currentY + 5);
    doc.setFont(undefined, 'bold');
    doc.text(`TOTAL GENERAL: $${formatCurrency(reportGrandTotal)}`, 140, currentY + 11);

    doc.save(`Cuadro_cliente_cuarto_frio_${startDate}_al_${endDate}.pdf`);
  };

  return (
    <div>
      <div className="topbar">
        <div>
          <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <FileSpreadsheet size={24} style={{ color: 'var(--color-primary)' }} /> 
            Cuadro Cliente Cuarto Frío (Resumen Diario)
          </h1>
          <p style={{ color: 'var(--color-text-light)', fontSize: '0.875rem' }}>
            Liquidación diaria por almacenamiento congelado (-18°C) y cobro de servicios extraordinarios según Contrato 2025-2026.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
          <button className="btn btn-primary" onClick={handleExportXLSX} title="Descargar en formato Microsoft Excel nativo">
            <FileSpreadsheet size={18} /> Exportar Excel (.xlsx)
          </button>
          <button className="btn btn-outline" onClick={handleExportCSV} title="Descargar en formato CSV compatible">
            <Download size={18} /> Exportar CSV
          </button>
          <button className="btn btn-outline" onClick={handleExportPDF} title="Descargar reporte en PDF">
            <FileOutput size={18} /> Exportar PDF
          </button>
        </div>
      </div>

      {/* Panel de Filtros y Configuración del Corte */}
      <div className="card" style={{ marginBottom: '1.5rem', padding: '1.25rem' }}>
        <div className="grid grid-cols-4" style={{ alignItems: 'end', gap: '1rem' }}>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Fecha Inicio</label>
            <input type="date" className="form-input" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Fecha Fin</label>
            <input type="date" className="form-input" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Cliente / Depositante</label>
            <input type="text" className="form-input" value={clientName} onChange={(e) => setClientName(e.target.value)} />
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Filtrar Categoría</label>
            <select className="form-select" value={selectedCategory} onChange={(e) => setSelectedCategory(e.target.value)}>
              <option value="all">Consolidado General (Todas)</option>
              {categories.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
        </div>
      </div>

      {/* Header Visual estilo Cuadro Cliente */}
      <div className="card" style={{ marginBottom: '1rem', borderLeft: '4px solid var(--color-primary)' }}>
        <h2 style={{ fontSize: '1rem', color: 'var(--color-primary)', textTransform: 'uppercase', margin: '0 0 0.4rem 0' }}>
          PROCESO DE FACTURACION POR ALMACENAMIENTO CONGELADO(-18°) Y SERVICIOS EXTRA-ORDINARIOS
        </h2>
        <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem', fontSize: '0.875rem', color: 'var(--color-text-light)' }}>
          <div><strong>Cliente:</strong> {clientName}</div>
          <div><strong>Período:</strong> {formatDate(startDate)} hasta {formatDate(endDate)}</div>
          <div><strong>Tarifa Base:</strong> ${formatPrice(CONTRACT_INFO.defaultStorageRatePounds)} / lb / día</div>
        </div>
      </div>

      {/* Tabla 1: Movimientos diarios de Almacenamiento */}
      <div className="card" style={{ padding: '0', marginBottom: '2rem' }}>
        <div className="table-container" style={{ border: 'none', boxShadow: 'none' }}>
          <table>
            <thead>
              <tr style={{ backgroundColor: 'var(--color-bg)' }}>
                <th>FECHA</th>
                <th>DESCRIPCION</th>
                <th style={{ textAlign: 'right' }}>INV-INICIAL</th>
                <th style={{ textAlign: 'right' }}>ENTRADA</th>
                <th style={{ textAlign: 'right' }}>SALIDA</th>
                <th style={{ textAlign: 'right' }}>TOTAL LIBRAS</th>
                <th style={{ textAlign: 'right' }}>PRECIO</th>
                <th style={{ textAlign: 'right' }}>TOTAL $</th>
              </tr>
            </thead>
            <tbody>
              {dailyRows.length === 0 ? (
                <tr>
                  <td colSpan="8" style={{ textAlign: 'center', padding: '2rem' }}>
                    No hay movimientos en el rango de fechas seleccionado.
                  </td>
                </tr>
              ) : (
                dailyRows.map((r, idx) => (
                  <tr key={idx}>
                    <td style={{ fontWeight: '500' }}>{formatDate(r.fecha)}</td>
                    <td>{r.descripcion}</td>
                    <td style={{ textAlign: 'right' }}>{r.stockInicial.toLocaleString('en-US', { maximumFractionDigits: 2 })}</td>
                    <td style={{ textAlign: 'right', color: r.entradas > 0 ? 'var(--color-success)' : 'inherit' }}>
                      {r.entradas > 0 ? `+${r.entradas.toLocaleString('en-US', { maximumFractionDigits: 2 })}` : '0'}
                    </td>
                    <td style={{ textAlign: 'right', color: r.salidas > 0 ? 'var(--color-danger)' : 'inherit' }}>
                      {r.salidas > 0 ? `-${r.salidas.toLocaleString('en-US', { maximumFractionDigits: 2 })}` : '0'}
                    </td>
                    <td style={{ textAlign: 'right', fontWeight: 'bold' }}>{r.stockFinal.toLocaleString('en-US', { maximumFractionDigits: 2 })}</td>
                    <td style={{ textAlign: 'right' }}>${formatPrice(r.precio)}</td>
                    <td style={{ textAlign: 'right', fontWeight: '500' }}>${formatCurrency(r.totalMonto)}</td>
                  </tr>
                ))
              )}
            </tbody>
            {dailyRows.length > 0 && (
              <tfoot>
                <tr style={{ backgroundColor: 'var(--color-surface)', fontWeight: 'bold' }}>
                  <td></td>
                  <td>Totales</td>
                  <td style={{ textAlign: 'right' }}>{totalInvInicial.toLocaleString('en-US', { maximumFractionDigits: 2 })}</td>
                  <td style={{ textAlign: 'right', color: 'var(--color-success)' }}>{totalEntradas.toLocaleString('en-US', { maximumFractionDigits: 2 })}</td>
                  <td style={{ textAlign: 'right', color: 'var(--color-danger)' }}>{totalSalidas.toLocaleString('en-US', { maximumFractionDigits: 2 })}</td>
                  <td style={{ textAlign: 'right' }}>{totalLibrasAcum.toLocaleString('en-US', { maximumFractionDigits: 2 })}</td>
                  <td></td>
                  <td style={{ textAlign: 'right', color: 'var(--color-primary)' }}>${formatCurrency(totalAlmacenaje)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      {/* Tabla 2: Servicios Extraordinarios */}
      <div style={{ marginBottom: '2rem' }}>
        <h2 style={{ fontSize: '1.125rem', color: 'var(--color-primary)', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <FileText size={18} /> SERVICIOS EXTRA-ORDINARIOS
        </h2>

        <div className="card" style={{ padding: 0 }}>
          <div className="table-container" style={{ border: 'none', boxShadow: 'none' }}>
            <table>
              <thead>
                <tr style={{ backgroundColor: 'var(--color-bg)' }}>
                  <th>FECHA</th>
                  <th>DESCRIPCION</th>
                  <th style={{ textAlign: 'center' }}>TOTAL (CANT/LBS)</th>
                  <th style={{ textAlign: 'right' }}>PRECIO</th>
                  <th style={{ textAlign: 'right' }}>VALOR</th>
                </tr>
              </thead>
              <tbody>
                {servicesData.length === 0 ? (
                  <tr>
                    <td colSpan="5" style={{ textAlign: 'center', padding: '1.5rem', color: 'var(--color-text-light)' }}>
                      No se registraron servicios extraordinarios en el período seleccionado.
                    </td>
                  </tr>
                ) : (
                  servicesData.map((s, idx) => (
                    <tr key={idx}>
                      <td style={{ fontWeight: '500' }}>{formatDate(s.date)}</td>
                      <td>{s.description} {s.ref ? `(Doc #${s.ref})` : ''}</td>
                      <td style={{ textAlign: 'center' }}>{s.quantity !== undefined ? s.quantity.toLocaleString('en-US') : '1'}</td>
                      <td style={{ textAlign: 'right' }}>{s.unitPrice ? `$${formatPrice(s.unitPrice)}` : `$${formatCurrency(s.value)}`}</td>
                      <td style={{ textAlign: 'right', fontWeight: 'bold' }}>${formatCurrency(s.value)}</td>
                    </tr>
                  ))
                )}
              </tbody>
              {servicesData.length > 0 && (
                <tfoot>
                  <tr style={{ backgroundColor: 'var(--color-surface)', fontWeight: 'bold' }}>
                    <td></td>
                    <td>TOTALES</td>
                    <td style={{ textAlign: 'center' }}>{servicesData.reduce((a, c) => a + (c.quantity || 1), 0)}</td>
                    <td></td>
                    <td style={{ textAlign: 'right', color: 'var(--color-primary)' }}>${formatCurrency(totalServicios)}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      </div>

      {/* Resumen de Liquidación e Impuestos */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1.5rem' }}>
        <div className="card" style={{ minWidth: '380px', padding: '1.5rem', borderLeft: '4px solid var(--color-primary)' }}>
          <h3 style={{ fontSize: '1rem', marginBottom: '1rem', color: 'var(--color-primary)', borderBottom: '1px solid var(--color-border)', paddingBottom: '0.5rem' }}>
            Resumen de Facturación
          </h3>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.6rem' }}>
            <span style={{ color: 'var(--color-text-light)' }}>Almacenamiento Congelado:</span>
            <strong>${formatCurrency(totalAlmacenaje)}</strong>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.6rem' }}>
            <span style={{ color: 'var(--color-text-light)' }}>Servicios Extra-ordinarios:</span>
            <strong>${formatCurrency(totalServicios)}</strong>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.6rem', paddingTop: '0.5rem', borderTop: '1px solid var(--color-border)' }}>
            <span style={{ fontWeight: 'bold' }}>Sub Total:</span>
            <strong style={{ color: 'var(--color-primary)' }}>${formatCurrency(reportSubtotal)}</strong>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.8rem' }}>
            <span style={{ color: 'var(--color-text-light)' }}>IVA (13%):</span>
            <strong>${formatCurrency(reportIva)}</strong>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: '0.75rem', borderTop: '2px solid var(--color-border)', fontSize: '1.25rem', fontWeight: 'bold', color: 'var(--color-primary)' }}>
            <span>TOTAL GENERAL:</span>
            <span>${formatCurrency(reportGrandTotal)}</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Summary2;
