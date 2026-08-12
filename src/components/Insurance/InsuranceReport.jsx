import React, { useMemo, useState } from 'react';
import { Download, FileOutput, ShieldCheck } from 'lucide-react';
import { useInventory } from '../../context/InventoryContext';
import { exportToCsv } from '../../utils/exportCsv';
import { formatCurrency, formatDate, formatPrice } from '../../utils/formatUtils';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

const getLocalDate = () => {
  const now = new Date();
  return [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0')
  ].join('-');
};

const InsuranceReport = () => {
  const { products, movements, categoryUnits } = useInventory();
  const [cutoffDate, setCutoffDate] = useState(getLocalDate);
  const [premiumRate, setPremiumRate] = useState(0.10);
  const [customerName, setCustomerName] = useState('AVICOLA SALVADOREÑA S.A. DE C.V.');
  const [warehouseName, setWarehouseName] = useState('ALMACENADORA LIL');

  const reportRows = useMemo(() => {
    if (!cutoffDate) return [];

    const cutoff = new Date(`${cutoffDate}T23:59:59`);

    return products.map(product => {
      let units = Number(product.stockUnits || 0);
      let pounds = Number(product.stockPounds || 0);
      let baskets = Number(product.stockBaskets || 0);

      movements.forEach(movement => {
        const movementDate = new Date(`${movement.date}T23:59:59`);
        if (movementDate <= cutoff) return;

        (movement.items || [])
          .filter(item => item.productId === product.id)
          .forEach(item => {
            const direction = movement.type === 'in' ? -1 : 1;
            units += Number(item.qtyUnits || 0) * direction;
            pounds += Number(item.qtyPounds || 0) * direction;
            baskets += Number(item.qtyBaskets || 0) * direction;
          });
      });

      const configuredMetric = categoryUnits[product.category];
      const valuationMetric = configuredMetric === 'baskets' ? 'baskets' : 'pounds';
      const rate = Number(product.price || 0);
      const insuredValue = valuationMetric === 'baskets'
        ? baskets * rate
        : pounds * rate;
      const premium = insuredValue * (Number(premiumRate || 0) / 100);

      return {
        id: product.id,
        code: product.sku,
        material: product.description,
        units,
        pounds,
        baskets,
        valuationMetric,
        poundRate: valuationMetric === 'pounds' ? rate : null,
        basketRate: valuationMetric === 'baskets' ? rate : null,
        insuredValue,
        premium
      };
    })
      .filter(row => {
        const rate = row.poundRate ?? row.basketRate;
        const valuationQty = row.valuationMetric === 'baskets' ? row.baskets : row.pounds;
        return rate > 0 && valuationQty > 0;
      })
      .sort((a, b) => String(a.code).localeCompare(String(b.code)));
  }, [products, movements, categoryUnits, cutoffDate, premiumRate]);

  const totalInsuredValue = reportRows.reduce((total, row) => total + row.insuredValue, 0);
  const totalPremium = reportRows.reduce((total, row) => total + row.premium, 0);
  const totalPounds = reportRows.reduce((total, row) => total + row.pounds, 0);
  const totalBaskets = reportRows.reduce((total, row) => total + row.baskets, 0);

  const periodLabel = useMemo(() => {
    if (!cutoffDate) return '';
    return new Date(`${cutoffDate}T12:00:00`).toLocaleDateString('es-SV', {
      month: 'long',
      year: 'numeric'
    });
  }, [cutoffDate]);

  const handleExportCsv = () => {
    const rows = reportRows.map(row => ({
      Código: row.code,
      Material: row.material,
      Unidades: row.units,
      'Total LB': row.pounds,
      'Total Cesta': row.baskets,
      'Valor por LB $': row.poundRate ?? '',
      'Valor por Cestas $': row.basketRate ?? '',
      'Total $': row.insuredValue,
      [`${premiumRate}%`]: row.premium
    }));

    rows.push({
      Código: '',
      Material: 'TOTAL',
      Unidades: '',
      'Total LB': totalPounds,
      'Total Cesta': totalBaskets,
      'Valor por LB $': '',
      'Valor por Cestas $': '',
      'Total $': totalInsuredValue,
      [`${premiumRate}%`]: totalPremium
    });

    exportToCsv(rows, `corte_seguro_${cutoffDate}.csv`);
  };

  const handleExportPdf = () => {
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'letter' });
    const reportDate = formatDate(cutoffDate);

    doc.setFontSize(10);
    doc.text(`San Martín, ${reportDate}`, 14, 14);
    doc.setFont(undefined, 'bold');
    doc.text('Señores', 14, 22);
    doc.text(customerName || 'Cliente', 14, 28);
    doc.setFont(undefined, 'normal');
    doc.text('Presente', 14, 34);
    doc.text(
      `Estimados, a continuación presentamos el cierre de inventario para el seguro de ${periodLabel}, ${warehouseName}.`,
      14,
      43
    );

    autoTable(doc, {
      startY: 49,
      head: [[
        'Código',
        'Material',
        'Unidades',
        'Total LB',
        'Total Cesta',
        'Valor por LB $',
        'Valor por Cestas $',
        'Total $',
        `${premiumRate}%`
      ]],
      body: reportRows.map(row => [
        row.code,
        row.material,
        row.units.toLocaleString('en-US'),
        row.pounds.toLocaleString('en-US', { maximumFractionDigits: 2 }),
        row.baskets.toLocaleString('en-US', { maximumFractionDigits: 2 }),
        row.poundRate == null ? '' : `$${formatPrice(row.poundRate)}`,
        row.basketRate == null ? '' : `$${formatPrice(row.basketRate)}`,
        `$${formatCurrency(row.insuredValue)}`,
        `$${formatCurrency(row.premium)}`
      ]),
      foot: [[
        '',
        'TOTAL',
        '',
        totalPounds.toLocaleString('en-US', { maximumFractionDigits: 2 }),
        totalBaskets.toLocaleString('en-US', { maximumFractionDigits: 2 }),
        '',
        '',
        `$${formatCurrency(totalInsuredValue)}`,
        `$${formatCurrency(totalPremium)}`
      ]],
      styles: { fontSize: 6.5, cellPadding: 1.5 },
      headStyles: { fillColor: [30, 64, 175], textColor: 255, fontStyle: 'bold' },
      footStyles: { fillColor: [226, 232, 240], textColor: [15, 23, 42], fontStyle: 'bold' },
      columnStyles: {
        0: { cellWidth: 20 },
        1: { cellWidth: 58 },
        2: { halign: 'right' },
        3: { halign: 'right' },
        4: { halign: 'right' },
        5: { halign: 'right' },
        6: { halign: 'right' },
        7: { halign: 'right' },
        8: { halign: 'right' }
      },
      margin: { left: 10, right: 10 }
    });

    let finalY = doc.lastAutoTable.finalY + 9;
    if (finalY > 190) {
      doc.addPage();
      finalY = 20;
    }

    doc.setFontSize(11);
    doc.setFont(undefined, 'bold');
    doc.text(
      `El seguro se facturará por el monto de $ ${formatCurrency(totalPremium)}`,
      14,
      finalY
    );
    doc.setFont(undefined, 'normal');
    doc.text('Atentamente,', 14, finalY + 14);
    doc.text('Ing. Raúl Sosa', 14, finalY + 21);

    doc.save(`corte_seguro_${cutoffDate}.pdf`);
  };

  return (
    <div>
      <div className="topbar">
        <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
          <ShieldCheck size={24} /> Corte de Seguro
        </h1>
        <div style={{ display: 'flex', gap: '1rem' }}>
          <button className="btn btn-outline" onClick={handleExportCsv}>
            <Download size={18} /> Exportar CSV
          </button>
          <button className="btn btn-primary" onClick={handleExportPdf}>
            <FileOutput size={18} /> Exportar PDF
          </button>
        </div>
      </div>

      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <div className="grid grid-cols-3" style={{ alignItems: 'end' }}>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Fecha de corte</label>
            <input
              type="date"
              className="form-input"
              value={cutoffDate}
              onChange={(event) => setCutoffDate(event.target.value)}
            />
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Porcentaje del seguro</label>
            <input
              type="number"
              min="0"
              step="0.01"
              className="form-input"
              value={premiumRate}
              onChange={(event) => setPremiumRate(Number(event.target.value))}
            />
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '0.8rem', color: 'var(--color-text-light)' }}>Monto a facturar</div>
            <div style={{ fontSize: '1.75rem', fontWeight: 'bold', color: 'var(--color-primary)' }}>
              ${totalPremium.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2" style={{ marginTop: '1.25rem' }}>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Cliente</label>
            <input
              type="text"
              className="form-input"
              value={customerName}
              onChange={(event) => setCustomerName(event.target.value)}
            />
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Almacenadora / póliza</label>
            <input
              type="text"
              className="form-input"
              value={warehouseName}
              onChange={(event) => setWarehouseName(event.target.value)}
            />
          </div>
        </div>

        <p style={{ marginTop: '1rem', marginBottom: 0, fontSize: '0.8rem', color: 'var(--color-text-light)' }}>
          La tarifa usa el precio del producto. La métrica configurada para su categoría determina si se valora por libra o por cesta.
        </p>
      </div>

      <div className="grid grid-cols-3" style={{ marginBottom: '1.5rem' }}>
        <div className="card stat-card">
          <div className="stat-content">
            <h3>Productos en el corte</h3>
            <p>{reportRows.length}</p>
          </div>
        </div>
        <div className="card stat-card">
          <div className="stat-content">
            <h3>Valor asegurado</h3>
            <p>${totalInsuredValue.toLocaleString('en-US', { maximumFractionDigits: 2 })}</p>
          </div>
        </div>
        <div className="card stat-card">
          <div className="stat-content">
            <h3>Prima ({premiumRate}%)</h3>
            <p>${totalPremium.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
          </div>
        </div>
      </div>

      <div className="card" style={{ padding: 0 }}>
        <div className="table-container" style={{ border: 'none', boxShadow: 'none' }}>
          <table>
            <thead>
              <tr>
                <th>Código</th>
                <th>Material</th>
                <th style={{ textAlign: 'right' }}>Unidades</th>
                <th style={{ textAlign: 'right' }}>Total LB</th>
                <th style={{ textAlign: 'right' }}>Total Cesta</th>
                <th style={{ textAlign: 'right' }}>Valor por LB $</th>
                <th style={{ textAlign: 'right' }}>Valor por Cestas $</th>
                <th style={{ textAlign: 'right' }}>Total $</th>
                <th style={{ textAlign: 'right' }}>{premiumRate}%</th>
              </tr>
            </thead>
            <tbody>
              {reportRows.length === 0 ? (
                <tr>
                  <td colSpan="9" style={{ textAlign: 'center', padding: '2rem' }}>
                    No hay existencias para la fecha seleccionada.
                  </td>
                </tr>
              ) : reportRows.map(row => (
                <tr key={row.id}>
                  <td style={{ fontWeight: 500 }}>{row.code}</td>
                  <td>{row.material}</td>
                  <td style={{ textAlign: 'right' }}>{row.units.toLocaleString('en-US')}</td>
                  <td style={{ textAlign: 'right' }}>{row.pounds.toLocaleString('en-US', { maximumFractionDigits: 2 })}</td>
                  <td style={{ textAlign: 'right' }}>{row.baskets.toLocaleString('en-US', { maximumFractionDigits: 2 })}</td>
                  <td style={{ textAlign: 'right' }}>{row.poundRate == null ? '' : `$${formatPrice(row.poundRate)}`}</td>
                  <td style={{ textAlign: 'right' }}>{row.basketRate == null ? '' : `$${formatPrice(row.basketRate)}`}</td>
                  <td style={{ textAlign: 'right', fontWeight: 500 }}>${formatCurrency(row.insuredValue)}</td>
                  <td style={{ textAlign: 'right', fontWeight: 600, color: 'var(--color-primary)' }}>${formatCurrency(row.premium)}</td>
                </tr>
              ))}
            </tbody>
            {reportRows.length > 0 && (
              <tfoot>
                <tr style={{ fontWeight: 'bold', backgroundColor: 'var(--color-surface)' }}>
                  <td></td>
                  <td>TOTAL</td>
                  <td></td>
                  <td style={{ textAlign: 'right' }}>{totalPounds.toLocaleString('en-US', { maximumFractionDigits: 2 })}</td>
                  <td style={{ textAlign: 'right' }}>{totalBaskets.toLocaleString('en-US', { maximumFractionDigits: 2 })}</td>
                  <td></td>
                  <td></td>
                  <td style={{ textAlign: 'right' }}>${formatCurrency(totalInsuredValue)}</td>
                  <td style={{ textAlign: 'right', color: 'var(--color-primary)' }}>${formatCurrency(totalPremium)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </div>
  );
};

export default InsuranceReport;
