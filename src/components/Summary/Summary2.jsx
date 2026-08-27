import React, { useState, useMemo } from 'react';
import { useInventory } from '../../context/InventoryContext';
import { FileText, Download, FileSpreadsheet, FileOutput, ShieldCheck, Layers, Package } from 'lucide-react';
import { exportCuadroClienteCuartoFrio } from '../../utils/exportManager';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { formatDate, formatCurrency, formatPrice } from '../../utils/formatUtils';
import { CONTRACT_INFO } from '../../utils/contractRates';
import { toast } from 'react-hot-toast';
import { DatePicker, DateQuickPresets, getLocalDateStr } from '../Common/DatePicker';

const Summary2 = () => {
  const { products, movements, categories, categoryUnits, settings, canExport } = useInventory();
  const allowExport = canExport('summary2');
  
  // Rango de fechas por defecto: Mes actual (1 al día actual)
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    d.setDate(1);
    return getLocalDateStr(d);
  });
  const [endDate, setEndDate] = useState(() => getLocalDateStr(new Date()));
  const [clientName, setClientName] = useState(CONTRACT_INFO.clientName);
  const [selectedCategory, setSelectedCategory] = useState('all'); // 'all' | 'Preparados' | 'Congelados'

  // Controladores de fecha sincronizados
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

  // Cantidad de días en el rango
  const daysCount = useMemo(() => {
    if (!startDate || !endDate) return 0;
    const start = new Date(startDate + 'T00:00:00');
    const end = new Date(endDate + 'T00:00:00');
    const diffTime = end.getTime() - start.getTime();
    const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24)) + 1;
    return diffDays > 0 ? diffDays : 0;
  }, [startDate, endDate]);

  // Lista de fechas ordenadas en el período
  const dateList = useMemo(() => {
    if (!startDate || !endDate) return [];
    const dates = [];
    const curr = new Date(startDate + 'T00:00:00');
    const end = new Date(endDate + 'T00:00:00');
    while (curr <= end) {
      dates.push(curr.toISOString().split('T')[0]);
      curr.setDate(curr.getDate() + 1);
    }
    return dates;
  }, [startDate, endDate]);

  // Helper para calcular inventario diario para un grupo de productos y tipo de unidad
  const calculateDailySeries = (targetProducts, unitField, stockField, rate, unitLabel, descText) => {
    if (targetProducts.length === 0 || dateList.length === 0) return [];

    return dateList.map(dateStr => {
      let dayInitial = 0;
      let dayIn = 0;
      let dayOut = 0;
      let dayFinal = 0;

      targetProducts.forEach(p => {
        const pMovs = movements.filter(m => m.items && m.items.some(it => it.productId === p.id));
        let currentStock = Number(p[stockField] || 0);

        // Movimientos estrictamente posteriores a esta fecha
        const afterDate = pMovs.filter(m => String(m.date) > dateStr);
        let stockAtEnd = currentStock;
        afterDate.forEach(m => {
          const item = m.items.find(it => it.productId === p.id);
          if (item) {
            if (m.type === 'in') stockAtEnd -= Number(item[unitField] || 0);
            if (m.type === 'out') stockAtEnd += Number(item[unitField] || 0);
          }
        });

        // Movimientos en la fecha exacta
        const onDate = pMovs.filter(m => String(m.date) === dateStr);
        let inOnDate = 0;
        let outOnDate = 0;
        onDate.forEach(m => {
          const item = m.items.find(it => it.productId === p.id);
          if (item) {
            if (m.type === 'in') inOnDate += Number(item[unitField] || 0);
            if (m.type === 'out') outOnDate += Number(item[unitField] || 0);
          }
        });

        const initialOnDate = stockAtEnd - inOnDate + outOnDate;

        dayInitial += initialOnDate;
        dayIn += inOnDate;
        dayOut += outOnDate;
        dayFinal += stockAtEnd;
      });

      const dayTotalCost = dayFinal * rate;

      return {
        fecha: dateStr,
        descripcion: descText,
        unitLabel,
        unitType: unitField === 'qtyPounds' ? 'pounds' : 'baskets',
        stockInicial: dayInitial,
        entradas: dayIn,
        salidas: dayOut,
        stockFinal: dayFinal,
        precio: rate,
        totalMonto: dayTotalCost
      };
    });
  };

  // 1. PRODUCTOS CONGELADOS (LIBRAS - $0.001 / lb / día)
  const congeladosRows = useMemo(() => {
    if (products.length === 0 || dateList.length === 0) return [];
    const congProducts = products.filter(p => p.category === 'Congelados' || categoryUnits[p.category] === 'pounds');
    return calculateDailySeries(
      congProducts,
      'qtyPounds',
      'stockPounds',
      CONTRACT_INFO.defaultStorageRatePounds || 0.001,
      'Lbs',
      'Mantenimiento congelado (-18°)'
    );
  }, [products, movements, dateList, categoryUnits]);

  // 2. PRODUCTOS PREPARADOS (CESTAS - $0.038 / cesta / día)
  const preparadosRows = useMemo(() => {
    if (products.length === 0 || dateList.length === 0) return [];
    const prepProducts = products.filter(p => p.category === 'Preparados' || categoryUnits[p.category] === 'baskets');
    return calculateDailySeries(
      prepProducts,
      'qtyBaskets',
      'stockBaskets',
      CONTRACT_INFO.defaultStorageRateBaskets || 0.038,
      'Cst',
      'Mantenimiento congelado (Preparados)'
    );
  }, [products, movements, dateList, categoryUnits]);

  // 3. SERVICIOS EXTRAORDINARIOS REGISTRADOS EN EL PERÍODO
  const servicesData = useMemo(() => {
    if (!startDate || !endDate) return [];
    const services = [];
    movements.forEach(m => {
      const mDateStr = String(m.date || '').split('T')[0];
      if (mDateStr >= startDate && mDateStr <= endDate && m.services && m.services.length > 0) {
        m.services.forEach(s => {
          services.push({
            date: mDateStr,
            description: s.description,
            quantity: s.quantity !== undefined ? Number(s.quantity) : 1,
            unitPrice: s.unitPrice !== undefined ? Number(s.unitPrice) : Number(s.value || 0),
            value: Number(s.value || 0),
            ref: m.refNumber ? `${m.refType || 'Doc'} #${m.refNumber}` : ''
          });
        });
      }
    });
    return services;
  }, [movements, startDate, endDate]);

  // Totales Congelados (Libras)
  const congTotals = useMemo(() => {
    const invInicial = congeladosRows.reduce((acc, r) => acc + r.stockInicial, 0);
    const entradas = congeladosRows.reduce((acc, r) => acc + r.entradas, 0);
    const salidas = congeladosRows.reduce((acc, r) => acc + r.salidas, 0);
    const stockFinal = congeladosRows.reduce((acc, r) => acc + r.stockFinal, 0);
    const totalMonto = congeladosRows.reduce((acc, r) => acc + r.totalMonto, 0);
    return { invInicial, entradas, salidas, stockFinal, totalMonto };
  }, [congeladosRows]);

  // Totales Preparados (Cestas)
  const prepTotals = useMemo(() => {
    const invInicial = preparadosRows.reduce((acc, r) => acc + r.stockInicial, 0);
    const entradas = preparadosRows.reduce((acc, r) => acc + r.entradas, 0);
    const salidas = preparadosRows.reduce((acc, r) => acc + r.salidas, 0);
    const stockFinal = preparadosRows.reduce((acc, r) => acc + r.stockFinal, 0);
    const totalMonto = preparadosRows.reduce((acc, r) => acc + r.totalMonto, 0);
    return { invInicial, entradas, salidas, stockFinal, totalMonto };
  }, [preparadosRows]);

  // Totales Servicios Extraordinarios
  const totalServicios = useMemo(() => {
    return servicesData.reduce((acc, s) => acc + s.value, 0);
  }, [servicesData]);

  // Totales de Facturación Consolidada según filtro activo
  const showCongelados = selectedCategory === 'all' || selectedCategory === 'Congelados';
  const showPreparados = selectedCategory === 'all' || selectedCategory === 'Preparados';

  const reportTotalAlmacenaje = (showCongelados ? congTotals.totalMonto : 0) + (showPreparados ? prepTotals.totalMonto : 0);
  const reportSubtotal = reportTotalAlmacenaje + totalServicios;
  const reportIva = reportSubtotal * CONTRACT_INFO.ivaRate;
  const reportGrandTotal = reportSubtotal + reportIva;

  // Exportar Excel
  const handleExportXLSX = () => {
    try {
      exportCuadroClienteCuartoFrio({
        clientName,
        startDate,
        endDate,
        congeladosRows: showCongelados ? congeladosRows : [],
        preparadosRows: showPreparados ? preparadosRows : [],
        extraServices: servicesData,
        totals: {
          totalAlmacenaje: reportTotalAlmacenaje,
          subtotal: reportSubtotal,
          iva: reportIva,
          totalGeneral: reportGrandTotal
        },
        format: 'xlsx'
      });
      toast.success('Cuadro de cliente descargado en formato Excel (.xlsx)');
    } catch (err) {
      console.error(err);
      toast.error('Error al exportar a Excel: ' + err.message);
    }
  };

  // Exportar CSV
  const handleExportCSV = () => {
    try {
      exportCuadroClienteCuartoFrio({
        clientName,
        startDate,
        endDate,
        congeladosRows: showCongelados ? congeladosRows : [],
        preparadosRows: showPreparados ? preparadosRows : [],
        extraServices: servicesData,
        totals: {
          totalAlmacenaje: reportTotalAlmacenaje,
          subtotal: reportSubtotal,
          iva: reportIva,
          totalGeneral: reportGrandTotal
        },
        format: 'csv'
      });
      toast.success('Cuadro de cliente descargado en formato CSV');
    } catch (err) {
      console.error(err);
      toast.error('Error al exportar a CSV: ' + err.message);
    }
  };

  // Exportar PDF
  const handleExportPDF = () => {
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'letter' });
    
    // Encabezado principal
    doc.setFontSize(10);
    doc.setFont(undefined, 'bold');
    doc.text("PROCESO DE FACTURACION POR ALMACENAMIENTO CONGELADO(-18°) Y SERVICIOS EXTRA-ORDINARIOS", 14, 14);
    doc.setFontSize(8.5);
    doc.setFont(undefined, 'normal');
    doc.text(`Cliente: ${clientName}`, 14, 19);
    doc.text(`Movimientos diarios entre: ${formatDate(startDate)} Hasta ${formatDate(endDate)}`, 14, 24);
    
    let currentY = 28;

    // 1. Tabla Congelados (Libras - $0.001)
    if (showCongelados && congeladosRows.length > 0) {
      doc.setFont(undefined, 'bold');
      doc.setFontSize(8.5);
      doc.text("ALMACENAMIENTO CONGELADOS ($0.001 / LB / DIA)", 14, currentY);
      
      const congCol = ["FECHA", "DESCRIPCION", "INV-INICIAL", "ENTRADA LB", "SALIDA LB", "TOTAL LBS", "PRECIO", "TOTAL $"];
      const congBody = congeladosRows.map(r => [
        formatDate(r.fecha),
        r.descripcion,
        r.stockInicial.toLocaleString('en-US', { maximumFractionDigits: 2 }),
        r.entradas.toLocaleString('en-US', { maximumFractionDigits: 2 }),
        r.salidas.toLocaleString('en-US', { maximumFractionDigits: 2 }),
        r.stockFinal.toLocaleString('en-US', { maximumFractionDigits: 2 }),
        `$${formatPrice(r.precio)}`,
        `$${formatCurrency(r.totalMonto)}`
      ]);

      congBody.push([
        'Totales',
        '',
        congTotals.invInicial.toLocaleString('en-US', { maximumFractionDigits: 2 }),
        congTotals.entradas.toLocaleString('en-US', { maximumFractionDigits: 2 }),
        congTotals.salidas.toLocaleString('en-US', { maximumFractionDigits: 2 }),
        congTotals.stockFinal.toLocaleString('en-US', { maximumFractionDigits: 2 }),
        '',
        `$${formatCurrency(congTotals.totalMonto)}`
      ]);

      autoTable(doc, {
        head: [congCol],
        body: congBody,
        startY: currentY + 2,
        styles: { fontSize: 6, cellPadding: 1 },
        headStyles: { fillColor: [41, 128, 185], textColor: 255, fontStyle: 'bold' },
        footStyles: { fillColor: [235, 245, 251], fontStyle: 'bold' }
      });

      currentY = doc.lastAutoTable.finalY + 6;
    }

    // 2. Tabla Preparados (Cestas - $0.038)
    if (showPreparados && preparadosRows.length > 0) {
      if (currentY > 215) { doc.addPage(); currentY = 15; }
      doc.setFont(undefined, 'bold');
      doc.setFontSize(8.5);
      doc.text("ALMACENAMIENTO PREPARADOS ($0.038 / CESTA / DIA)", 14, currentY);

      const prepCol = ["FECHA", "DESCRIPCION", "INV CESTAS", "ENTRADA CST", "SALIDA CST", "TOTAL CST", "PRECIO", "TOTAL $"];
      const prepBody = preparadosRows.map(r => [
        formatDate(r.fecha),
        r.descripcion,
        r.stockInicial.toLocaleString('en-US', { maximumFractionDigits: 0 }),
        r.entradas.toLocaleString('en-US', { maximumFractionDigits: 0 }),
        r.salidas.toLocaleString('en-US', { maximumFractionDigits: 0 }),
        r.stockFinal.toLocaleString('en-US', { maximumFractionDigits: 0 }),
        `$${formatPrice(r.precio)}`,
        `$${formatCurrency(r.totalMonto)}`
      ]);

      prepBody.push([
        'Totales',
        '',
        prepTotals.invInicial.toLocaleString('en-US', { maximumFractionDigits: 0 }),
        prepTotals.entradas.toLocaleString('en-US', { maximumFractionDigits: 0 }),
        prepTotals.salidas.toLocaleString('en-US', { maximumFractionDigits: 0 }),
        prepTotals.stockFinal.toLocaleString('en-US', { maximumFractionDigits: 0 }),
        '',
        `$${formatCurrency(prepTotals.totalMonto)}`
      ]);

      autoTable(doc, {
        head: [prepCol],
        body: prepBody,
        startY: currentY + 2,
        styles: { fontSize: 6, cellPadding: 1 },
        headStyles: { fillColor: [39, 174, 96], textColor: 255, fontStyle: 'bold' },
        footStyles: { fillColor: [234, 250, 234], fontStyle: 'bold' }
      });

      currentY = doc.lastAutoTable.finalY + 6;
    }

    // 3. Tabla Servicios Extraordinarios
    if (servicesData.length > 0) {
      if (currentY > 215) { doc.addPage(); currentY = 15; }
      doc.setFont(undefined, 'bold');
      doc.setFontSize(8.5);
      doc.text("SERVICIOS EXTRA-ORDINARIOS", 14, currentY);
      
      const servRows = servicesData.map(s => [
        formatDate(s.date),
        s.description + (s.ref ? ` (${s.ref})` : ''),
        s.quantity ? s.quantity.toLocaleString('en-US') : '1',
        s.unitPrice ? `$${formatPrice(s.unitPrice)}` : `$${formatCurrency(s.value)}`,
        `$${formatCurrency(s.value)}`
      ]);

      servRows.push(['TOTALES', '', '', '', `$${formatCurrency(totalServicios)}`]);

      autoTable(doc, {
        head: [["FECHA", "DESCRIPCION", "TOTAL", "PRECIO", "VALOR"]],
        body: servRows,
        startY: currentY + 2,
        styles: { fontSize: 6.5, cellPadding: 1 },
        headStyles: { fillColor: [52, 73, 94], textColor: 255, fontStyle: 'bold' }
      });

      currentY = doc.lastAutoTable.finalY + 6;
    }

    if (currentY > 235) { doc.addPage(); currentY = 15; }
    
    // Totales Finales
    doc.setFontSize(8.5);
    doc.setFont(undefined, 'normal');
    if (showCongelados) doc.text(`Almacenamiento Congelados: $${formatCurrency(congTotals.totalMonto)}`, 130, currentY);
    if (showPreparados) doc.text(`Almacenamiento Preparados: $${formatCurrency(prepTotals.totalMonto)}`, 130, currentY + 4);
    doc.text(`Servicios Extra-ordinarios: $${formatCurrency(totalServicios)}`, 130, currentY + 8);
    doc.text(`Sub Total: $${formatCurrency(reportSubtotal)}`, 130, currentY + 12);
    doc.text(`IVA (13%): $${formatCurrency(reportIva)}`, 130, currentY + 16);
    doc.setFont(undefined, 'bold');
    doc.text(`TOTAL GENERAL: $${formatCurrency(reportGrandTotal)}`, 130, currentY + 21);

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
            Liquidación diaria por almacenamiento congelado (-18°C) con tarifas oficiales: <strong>Preparados ($0.038 / cesta)</strong> y <strong>Congelados ($0.001 / libra)</strong> más servicios extraordinarios.
          </p>
        </div>

        {allowExport && (
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
        )}
      </div>

      {/* Panel de Filtros y Configuración del Corte */}
      <div className="card" style={{ marginBottom: '1.5rem', padding: '1.25rem' }}>
        <div style={{ marginBottom: '1rem', paddingBottom: '0.85rem', borderBottom: '1px solid var(--color-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
          <DateQuickPresets
            startDate={startDate}
            endDate={endDate}
            onSelectRange={handlePresetSelect}
          />
          {daysCount > 0 && (
            <span className="badge badge-primary" style={{ fontSize: '0.75rem', fontWeight: 600 }}>
              {daysCount} {daysCount === 1 ? 'día seleccionado' : 'días en período'}
            </span>
          )}
        </div>

        <div className="grid grid-cols-4" style={{ alignItems: 'end', gap: '1rem' }}>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <DatePicker
              label="Fecha Inicio"
              value={startDate}
              onChange={handleStartDateChange}
              max={endDate}
            />
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <DatePicker
              label="Fecha Fin"
              value={endDate}
              onChange={handleEndDateChange}
              min={startDate}
            />
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Cliente / Depositante</label>
            <input type="text" className="form-input" value={clientName} onChange={(e) => setClientName(e.target.value)} />
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Mostrar Tablas</label>
            <select className="form-select" value={selectedCategory} onChange={(e) => setSelectedCategory(e.target.value)}>
              <option value="all">Consolidado (Preparados + Congelados)</option>
              <option value="Preparados">Solo Preparados ($0.038 / cesta)</option>
              <option value="Congelados">Solo Congelados ($0.001 / libra)</option>
            </select>
          </div>
        </div>
      </div>

      {/* Tarjetas Resumen de Liquidación */}
      <div className="grid grid-cols-4" style={{ gap: '1rem', marginBottom: '1.5rem' }}>
        <div className="card" style={{ borderLeft: '4px solid #2980b9', padding: '1rem' }}>
          <div style={{ fontSize: '0.75rem', color: 'var(--color-text-light)', textTransform: 'uppercase', fontWeight: 600 }}>
            Congelados (Libras)
          </div>
          <div style={{ fontSize: '1.35rem', fontWeight: 700, color: '#2980b9', marginTop: '0.25rem' }}>
            ${formatCurrency(congTotals.totalMonto)}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--color-text-light)', marginTop: '0.2rem' }}>
            Tarifa: $0.001 / lb / día
          </div>
        </div>

        <div className="card" style={{ borderLeft: '4px solid #27ae60', padding: '1rem' }}>
          <div style={{ fontSize: '0.75rem', color: 'var(--color-text-light)', textTransform: 'uppercase', fontWeight: 600 }}>
            Preparados (Cestas)
          </div>
          <div style={{ fontSize: '1.35rem', fontWeight: 700, color: '#27ae60', marginTop: '0.25rem' }}>
            ${formatCurrency(prepTotals.totalMonto)}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--color-text-light)', marginTop: '0.2rem' }}>
            Tarifa: $0.038 / cesta / día
          </div>
        </div>

        <div className="card" style={{ borderLeft: '4px solid #e67e22', padding: '1rem' }}>
          <div style={{ fontSize: '0.75rem', color: 'var(--color-text-light)', textTransform: 'uppercase', fontWeight: 600 }}>
            Servicios Extraordinarios
          </div>
          <div style={{ fontSize: '1.35rem', fontWeight: 700, color: '#e67e22', marginTop: '0.25rem' }}>
            ${formatCurrency(totalServicios)}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--color-text-light)', marginTop: '0.2rem' }}>
            {servicesData.length} actividades
          </div>
        </div>

        <div className="card" style={{ borderLeft: '4px solid var(--color-primary)', padding: '1rem', backgroundColor: 'var(--color-surface)' }}>
          <div style={{ fontSize: '0.75rem', color: 'var(--color-text-light)', textTransform: 'uppercase', fontWeight: 600 }}>
            Total General (con IVA)
          </div>
          <div style={{ fontSize: '1.35rem', fontWeight: 700, color: 'var(--color-primary)', marginTop: '0.25rem' }}>
            ${formatCurrency(reportGrandTotal)}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--color-text-light)', marginTop: '0.2rem' }}>
            Subtotal: ${formatCurrency(reportSubtotal)} + IVA 13%
          </div>
        </div>
      </div>

      {/* 1. TABLA CONGELADOS (LIBRAS - $0.001) */}
      {showCongelados && (
        <div style={{ marginBottom: '2rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
            <h2 style={{ fontSize: '1rem', color: '#2980b9', margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 700 }}>
              <Package size={18} /> ALMACENAMIENTO PRODUCTOS CONGELADOS (LIBRAS - $0.001 / LB / DÍA)
            </h2>
            <span className="badge" style={{ backgroundColor: '#ebf5fb', color: '#2980b9', fontWeight: 600 }}>
              Tarifa: $0.001 / lb / día
            </span>
          </div>

          <div className="card" style={{ padding: '0' }}>
            <div className="table-container" style={{ border: 'none', boxShadow: 'none' }}>
              <table>
                <thead>
                  <tr style={{ backgroundColor: 'var(--color-bg)' }}>
                    <th>FECHA</th>
                    <th>DESCRIPCION</th>
                    <th style={{ textAlign: 'right' }}>INV-INICIAL</th>
                    <th style={{ textAlign: 'right' }}>ENTRADA LB</th>
                    <th style={{ textAlign: 'right' }}>SALIDA LB</th>
                    <th style={{ textAlign: 'right' }}>TOTAL LIBRAS</th>
                    <th style={{ textAlign: 'right' }}>PRECIO</th>
                    <th style={{ textAlign: 'right' }}>TOTAL $</th>
                  </tr>
                </thead>
                <tbody>
                  {congeladosRows.length === 0 ? (
                    <tr>
                      <td colSpan="8" style={{ textAlign: 'center', padding: '1.5rem' }}>
                        No hay movimientos de congelados en el rango de fechas seleccionado.
                      </td>
                    </tr>
                  ) : (
                    congeladosRows.map((r, idx) => (
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
                {congeladosRows.length > 0 && (
                  <tfoot>
                    <tr style={{ backgroundColor: 'var(--color-surface)', fontWeight: 'bold' }}>
                      <td></td>
                      <td>Totales</td>
                      <td style={{ textAlign: 'right' }}>{congTotals.invInicial.toLocaleString('en-US', { maximumFractionDigits: 2 })}</td>
                      <td style={{ textAlign: 'right', color: 'var(--color-success)' }}>{congTotals.entradas.toLocaleString('en-US', { maximumFractionDigits: 2 })}</td>
                      <td style={{ textAlign: 'right', color: 'var(--color-danger)' }}>{congTotals.salidas.toLocaleString('en-US', { maximumFractionDigits: 2 })}</td>
                      <td style={{ textAlign: 'right' }}>{congTotals.stockFinal.toLocaleString('en-US', { maximumFractionDigits: 2 })}</td>
                      <td></td>
                      <td style={{ textAlign: 'right', color: '#2980b9' }}>${formatCurrency(congTotals.totalMonto)}</td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>
        </div>
      )}

      {/* 2. TABLA PREPARADOS (CESTAS - $0.038) */}
      {showPreparados && (
        <div style={{ marginBottom: '2rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
            <h2 style={{ fontSize: '1rem', color: '#27ae60', margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 700 }}>
              <Layers size={18} /> ALMACENAMIENTO PRODUCTOS PREPARADOS (CESTAS - $0.038 / CESTA / DÍA)
            </h2>
            <span className="badge" style={{ backgroundColor: '#eafaf1', color: '#27ae60', fontWeight: 600 }}>
              Tarifa: $0.038 / cesta / día
            </span>
          </div>

          <div className="card" style={{ padding: '0' }}>
            <div className="table-container" style={{ border: 'none', boxShadow: 'none' }}>
              <table>
                <thead>
                  <tr style={{ backgroundColor: 'var(--color-bg)' }}>
                    <th>FECHA</th>
                    <th>DESCRIPCION</th>
                    <th style={{ textAlign: 'right' }}>INV CESTAS</th>
                    <th style={{ textAlign: 'right' }}>ENTRADA CESTAS</th>
                    <th style={{ textAlign: 'right' }}>SALIDA CESTAS</th>
                    <th style={{ textAlign: 'right' }}>TOTAL CESTA</th>
                    <th style={{ textAlign: 'right' }}>PRECIO CESTA</th>
                    <th style={{ textAlign: 'right' }}>TOTAL $</th>
                  </tr>
                </thead>
                <tbody>
                  {preparadosRows.length === 0 ? (
                    <tr>
                      <td colSpan="8" style={{ textAlign: 'center', padding: '1.5rem' }}>
                        No hay movimientos de preparados en el rango de fechas seleccionado.
                      </td>
                    </tr>
                  ) : (
                    preparadosRows.map((r, idx) => (
                      <tr key={idx}>
                        <td style={{ fontWeight: '500' }}>{formatDate(r.fecha)}</td>
                        <td>{r.descripcion}</td>
                        <td style={{ textAlign: 'right' }}>{r.stockInicial.toLocaleString('en-US', { maximumFractionDigits: 0 })}</td>
                        <td style={{ textAlign: 'right', color: r.entradas > 0 ? 'var(--color-success)' : 'inherit' }}>
                          {r.entradas > 0 ? `+${r.entradas.toLocaleString('en-US', { maximumFractionDigits: 0 })}` : '0'}
                        </td>
                        <td style={{ textAlign: 'right', color: r.salidas > 0 ? 'var(--color-danger)' : 'inherit' }}>
                          {r.salidas > 0 ? `-${r.salidas.toLocaleString('en-US', { maximumFractionDigits: 0 })}` : '0'}
                        </td>
                        <td style={{ textAlign: 'right', fontWeight: 'bold' }}>{r.stockFinal.toLocaleString('en-US', { maximumFractionDigits: 0 })}</td>
                        <td style={{ textAlign: 'right' }}>${formatPrice(r.precio)}</td>
                        <td style={{ textAlign: 'right', fontWeight: '500' }}>${formatCurrency(r.totalMonto)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
                {preparadosRows.length > 0 && (
                  <tfoot>
                    <tr style={{ backgroundColor: 'var(--color-surface)', fontWeight: 'bold' }}>
                      <td></td>
                      <td>Totales</td>
                      <td style={{ textAlign: 'right' }}>{prepTotals.invInicial.toLocaleString('en-US', { maximumFractionDigits: 0 })}</td>
                      <td style={{ textAlign: 'right', color: 'var(--color-success)' }}>{prepTotals.entradas.toLocaleString('en-US', { maximumFractionDigits: 0 })}</td>
                      <td style={{ textAlign: 'right', color: 'var(--color-danger)' }}>{prepTotals.salidas.toLocaleString('en-US', { maximumFractionDigits: 0 })}</td>
                      <td style={{ textAlign: 'right' }}>{prepTotals.stockFinal.toLocaleString('en-US', { maximumFractionDigits: 0 })}</td>
                      <td></td>
                      <td style={{ textAlign: 'right', color: '#27ae60' }}>${formatCurrency(prepTotals.totalMonto)}</td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>
        </div>
      )}

      {/* 3. TABLA SERVICIOS EXTRAORDINARIOS */}
      <div style={{ marginBottom: '2rem' }}>
        <h2 style={{ fontSize: '1rem', color: '#e67e22', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 700 }}>
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
                      <td>{s.description} {s.ref ? `(${s.ref})` : ''}</td>
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
                    <td style={{ textAlign: 'right', color: '#e67e22' }}>${formatCurrency(totalServicios)}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      </div>

      {/* Resumen de Facturación Final */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1.5rem' }}>
        <div className="card" style={{ minWidth: '400px', padding: '1.5rem', borderLeft: '4px solid var(--color-primary)' }}>
          <h3 style={{ fontSize: '1rem', marginBottom: '1rem', color: 'var(--color-primary)', borderBottom: '1px solid var(--color-border)', paddingBottom: '0.5rem' }}>
            Resumen de Liquidación del Período
          </h3>
          {showCongelados && (
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.6rem' }}>
              <span style={{ color: 'var(--color-text-light)' }}>Almacenamiento Congelados ($0.001/lb):</span>
              <strong>${formatCurrency(congTotals.totalMonto)}</strong>
            </div>
          )}
          {showPreparados && (
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.6rem' }}>
              <span style={{ color: 'var(--color-text-light)' }}>Almacenamiento Preparados ($0.038/cst):</span>
              <strong>${formatCurrency(prepTotals.totalMonto)}</strong>
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.6rem' }}>
            <span style={{ color: 'var(--color-text-light)' }}>Servicios Extra-ordinarios:</span>
            <strong>${formatCurrency(totalServicios)}</strong>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.6rem', paddingTop: '0.5rem', borderTop: '1px solid var(--color-border)' }}>
            <span style={{ fontWeight: 'bold' }}>Sub Total:</span>
            <strong style={{ color: 'var(--color-primary)', fontSize: '1.1rem' }}>${formatCurrency(reportSubtotal)}</strong>
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
