import React, { useMemo, useState, useEffect, useRef } from 'react';
import { 
  Download, FileOutput, ShieldCheck, FileSpreadsheet, Snowflake, 
  Lock, Unlock, History, RotateCcw, RefreshCw, Check, Trash2, Search, X, CheckCircle2, AlertCircle 
} from 'lucide-react';
import { useInventory } from '../../context/InventoryContext';
import { exportCorteSeguro } from '../../utils/exportManager';
import { formatCurrency, formatDate, formatPrice } from '../../utils/formatUtils';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { toast } from 'react-hot-toast';
import { DatePicker, getLocalDateStr } from '../Common/DatePicker';

const InsuranceReport = () => {
  const { 
    products, 
    movements, 
    categoryUnits, 
    canExport,
    currentUser,
    fetchInsuranceCuts,
    fetchInsuranceCutById,
    createInsuranceCut,
    updateInsuranceCut,
    deleteInsuranceCut
  } = useInventory();

  const allowExport = canExport('insurance');

  // Fechas del período: Fecha Inicio e Inicio del próximo corte
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    d.setDate(1);
    return getLocalDateStr(d);
  });
  const [cutoffDate, setCutoffDate] = useState(() => getLocalDateStr(new Date()));
  const [premiumRate, setPremiumRate] = useState(0.10);
  const [customerName, setCustomerName] = useState('AVICOLA SALVADOREÑA S.A. DE C.V.');
  const [warehouseName, setWarehouseName] = useState('ALMACENADORA LIL');

  // Estados de Corte Congelado
  const [activeCut, setActiveCut] = useState(null); // null = Modo en Vivo, Objeto = Corte Congelado
  const [isLocked, setIsLocked] = useState(true); // Bloqueo de edición
  const [customRows, setCustomRows] = useState(null);

  // Estados de Modales e Historial
  const [historyModalOpen, setHistoryModalOpen] = useState(false);
  const [cutsList, setCutsList] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [historySearch, setHistorySearch] = useState('');

  const [freezeModalOpen, setFreezeModalOpen] = useState(false);
  const [freezeTitle, setFreezeTitle] = useState('');
  const [isSavingCut, setIsSavingCut] = useState(false);
  const [saveStatus, setSaveStatus] = useState(null); // 'saving' | 'saved' | null

  const autoSaveTimerRef = useRef(null);

  // Al cargar la página, leer el corte de seguro más reciente y fijar fecha de inicio al día siguiente
  useEffect(() => {
    fetchInsuranceCuts().then(cuts => {
      if (Array.isArray(cuts) && cuts.length > 0) {
        setCutsList(cuts);
        // Ordenar cortes por cutoffDate descendente
        const sortedCuts = [...cuts].sort((a, b) => {
          const dateA = String(a.cutoffDate || '').split('T')[0];
          const dateB = String(b.cutoffDate || '').split('T')[0];
          return dateB.localeCompare(dateA);
        });

        const latestCut = sortedCuts[0];
        if (latestCut && latestCut.cutoffDate) {
          const lastCutStr = String(latestCut.cutoffDate).split('T')[0];
          const nextDay = new Date(lastCutStr + 'T12:00:00');
          nextDay.setDate(nextDay.getDate() + 1);
          const nextDayStr = getLocalDateStr(nextDay);

          setStartDate(nextDayStr);
          const todayStr = getLocalDateStr(new Date());
          if (nextDayStr > todayStr) {
            setCutoffDate(nextDayStr);
          } else {
            setCutoffDate(todayStr);
          }
        }
      } else if (Array.isArray(cuts)) {
        setCutsList(cuts);
      }
    });
  }, []);

  // Cálculo en vivo de existencias y valoración a la fecha de corte
  const liveRows = useMemo(() => {
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

  // Filas activas: Si hay un corte cargado y tiene datos personalizados/editados, usamos esos
  const reportRows = useMemo(() => {
    if (activeCut && customRows) {
      return customRows;
    }
    return liveRows;
  }, [activeCut, customRows, liveRows]);

  const totalInsuredValue = reportRows.reduce((total, row) => total + Number(row.insuredValue || 0), 0);
  const totalPremium = reportRows.reduce((total, row) => total + Number(row.premium || 0), 0);
  const totalPounds = reportRows.reduce((total, row) => total + Number(row.pounds || 0), 0);
  const totalBaskets = reportRows.reduce((total, row) => total + Number(row.baskets || 0), 0);

  const periodLabel = useMemo(() => {
    if (!cutoffDate) return '';
    return new Date(`${cutoffDate}T12:00:00`).toLocaleDateString('es-SV', {
      month: 'long',
      year: 'numeric'
    });
  }, [cutoffDate]);

  // Autoguardado debounced cuando el corte está desbloqueado
  const triggerAutoSave = (updatedRows = null, newStartDate = null, newCutoffDate = null, newCustomer = null, newWarehouse = null, newRate = null) => {
    if (!activeCut || isLocked) return;

    setSaveStatus('saving');
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);

    autoSaveTimerRef.current = setTimeout(async () => {
      const rowsPayload = updatedRows || reportRows;
      const effectiveStart = newStartDate || startDate;
      const effectiveCutoff = newCutoffDate || cutoffDate;
      const effectiveCustomer = newCustomer !== null ? newCustomer : customerName;
      const effectiveWarehouse = newWarehouse !== null ? newWarehouse : warehouseName;
      const effectiveRate = newRate !== null ? newRate : premiumRate;

      const calcInsured = rowsPayload.reduce((acc, r) => acc + (Number(r.insuredValue) || 0), 0);
      const calcPremium = rowsPayload.reduce((acc, r) => acc + (Number(r.premium) || 0), 0);
      const calcPounds = rowsPayload.reduce((acc, r) => acc + (Number(r.pounds) || 0), 0);
      const calcBaskets = rowsPayload.reduce((acc, r) => acc + (Number(r.baskets) || 0), 0);

      const totalsPayload = {
        totalPounds: calcPounds,
        totalBaskets: calcBaskets,
        totalInsuredValue: calcInsured,
        totalPremium: calcPremium
      };

      const res = await updateInsuranceCut(activeCut.id, {
        startDate: effectiveStart,
        cutoffDate: effectiveCutoff,
        customerName: effectiveCustomer,
        warehouseName: effectiveWarehouse,
        premiumRate: effectiveRate,
        rowsData: rowsPayload,
        totalsData: totalsPayload
      });

      if (res.success) {
        setSaveStatus('saved');
        setActiveCut(prev => ({
          ...prev,
          startDate: effectiveStart,
          cutoffDate: effectiveCutoff,
          customerName: effectiveCustomer,
          warehouseName: effectiveWarehouse,
          premiumRate: effectiveRate,
          rowsData: rowsPayload,
          totalsData: totalsPayload
        }));
        fetchInsuranceCuts().then(cuts => setCutsList(Array.isArray(cuts) ? cuts : []));
        setTimeout(() => setSaveStatus(null), 3000);
      } else {
        setSaveStatus(null);
        toast.error('Error al autoguardar cambios en el corte de seguro');
      }
    }, 600);
  };

  // Edición en línea de celdas en el reporte cuando está desbloqueado
  const handleCellEdit = (index, field, rawValue) => {
    if (isLocked && activeCut) {
      toast('Desbloquea el corte para poder editar las cantidades o tarifas.', { icon: '🔒' });
      return;
    }

    const numVal = rawValue === '' ? 0 : Number(rawValue);
    const newRows = [...reportRows];
    const row = { ...newRows[index] };
    row[field] = numVal;

    // Recalcular valor asegurado y prima para esta fila
    const rate = row.valuationMetric === 'baskets' 
      ? (field === 'basketRate' ? numVal : (row.basketRate || 0))
      : (field === 'poundRate' ? numVal : (row.poundRate || 0));

    const qty = row.valuationMetric === 'baskets'
      ? (field === 'baskets' ? numVal : (row.baskets || 0))
      : (field === 'pounds' ? numVal : (row.pounds || 0));

    row.insuredValue = Number((qty * rate).toFixed(2));
    row.premium = Number((row.insuredValue * (Number(premiumRate || 0) / 100)).toFixed(2));

    newRows[index] = row;
    setCustomRows(newRows);
    triggerAutoSave(newRows);
  };

  // Manejadores de cambios de cabecera
  const handleStartDateChange = (newStart) => {
    if (activeCut && isLocked) return;
    setStartDate(newStart);
    if (activeCut && !isLocked) {
      triggerAutoSave(null, newStart, null);
    }
  };

  const handleCutoffDateChange = (newCutoff) => {
    if (activeCut && isLocked) return;
    setCutoffDate(newCutoff);
    if (activeCut && !isLocked) {
      triggerAutoSave(null, null, newCutoff);
    }
  };

  const handleCustomerChange = (val) => {
    if (activeCut && isLocked) return;
    setCustomerName(val);
    if (activeCut && !isLocked) {
      triggerAutoSave(null, null, null, val);
    }
  };

  const handleWarehouseChange = (val) => {
    if (activeCut && isLocked) return;
    setWarehouseName(val);
    if (activeCut && !isLocked) {
      triggerAutoSave(null, null, null, null, val);
    }
  };

  const handlePremiumRateChange = (val) => {
    if (activeCut && isLocked) return;
    const num = Number(val);
    setPremiumRate(num);

    // Recalcular primas con la nueva tasa
    const updated = reportRows.map(r => ({
      ...r,
      premium: Number((r.insuredValue * (num / 100)).toFixed(2))
    }));
    setCustomRows(updated);

    if (activeCut && !isLocked) {
      triggerAutoSave(updated, null, null, null, null, num);
    }
  };

  // Abrir Modal para Congelar Período
  const handleOpenFreezeModal = () => {
    setFreezeTitle(`Corte de Seguro al ${formatDate(cutoffDate)}`);
    setFreezeModalOpen(true);
  };

  // Guardar y congelar el corte de seguro
  const handleSaveFreezeCut = async (e) => {
    if (e) e.preventDefault();
    if (!freezeTitle.trim()) {
      toast.error('Ingresa un título para identificar el corte.');
      return;
    }

    setIsSavingCut(true);
    try {
      const totalsPayload = {
        totalPounds,
        totalBaskets,
        totalInsuredValue,
        totalPremium
      };

      const res = await createInsuranceCut({
        title: freezeTitle.trim(),
        customerName,
        warehouseName,
        startDate,
        cutoffDate,
        premiumRate,
        isLocked: 1,
        rowsData: reportRows,
        totalsData: totalsPayload
      });

      if (res.success) {
        toast.success('¡Corte de seguro congelado y guardado con éxito!');
        setFreezeModalOpen(false);
        const cuts = await fetchInsuranceCuts();
        if (Array.isArray(cuts)) setCutsList(cuts);

        // Cargar el corte como corte activo
        const fullCut = await fetchInsuranceCutById(res.id);
        if (fullCut) {
          setActiveCut(fullCut);
          setCustomRows(fullCut.rowsData);
          setIsLocked(true);
        }
      } else {
        toast.error(res.message || 'No se pudo guardar el corte.');
      }
    } catch (err) {
      console.error(err);
      toast.error('Error al congelar el corte: ' + err.message);
    } finally {
      setIsSavingCut(false);
    }
  };

  // Alternar Bloqueo / Desbloqueo del corte activo
  const handleToggleLock = async () => {
    if (!activeCut) return;

    const newLockState = !isLocked;
    setIsLocked(newLockState);

    const rowsPayload = reportRows;
    const totalsPayload = {
      totalPounds,
      totalBaskets,
      totalInsuredValue,
      totalPremium
    };

    try {
      const res = await updateInsuranceCut(activeCut.id, {
        isLocked: newLockState ? 1 : 0,
        title: activeCut.title,
        startDate,
        cutoffDate,
        customerName,
        warehouseName,
        premiumRate,
        rowsData: rowsPayload,
        totalsData: totalsPayload
      });

      if (res.success) {
        setActiveCut(prev => ({
          ...prev,
          isLocked: newLockState,
          startDate,
          cutoffDate,
          customerName,
          warehouseName,
          premiumRate,
          rowsData: rowsPayload,
          totalsData: totalsPayload
        }));

        fetchInsuranceCuts().then(cuts => {
          if (Array.isArray(cuts)) setCutsList(cuts);
        });

        if (newLockState) {
          toast.success('Corte de seguro cerrado y bloqueado.');
        } else {
          toast('Corte desbloqueado. Ahora puedes editar valores y tarifas.', { icon: '🔓' });
        }
      }
    } catch (e) {
      toast.error('Error al actualizar estado de bloqueo');
    }
  };

  // Volver a Modo en Vivo (Cálculo dinámico en tiempo real)
  const handleBackToLive = () => {
    setActiveCut(null);
    setCustomRows(null);
    setIsLocked(false);
    setSaveStatus(null);
    toast.success('Has regresado al Modo en Vivo (Tiempo Real).');
  };

  // Cargar lista del historial
  const loadHistory = async () => {
    setLoadingHistory(true);
    try {
      const cuts = await fetchInsuranceCuts();
      setCutsList(Array.isArray(cuts) ? cuts : []);
    } catch (e) {
      toast.error('Error al cargar historial de cortes');
    } finally {
      setLoadingHistory(false);
    }
  };

  const handleOpenHistory = () => {
    setHistoryModalOpen(true);
    loadHistory();
  };

  // Cargar un corte guardado desde el historial
  const handleSelectCutFromHistory = async (cutSummary) => {
    try {
      const fullCut = await fetchInsuranceCutById(cutSummary.id);
      if (fullCut) {
        if (fullCut.startDate) setStartDate(fullCut.startDate.split('T')[0]);
        setCutoffDate(fullCut.cutoffDate.split('T')[0]);
        setCustomerName(fullCut.customerName || 'AVICOLA SALVADOREÑA S.A. DE C.V.');
        setWarehouseName(fullCut.warehouseName || 'ALMACENADORA LIL');
        setPremiumRate(Number(fullCut.premiumRate || 0.10));
        setActiveCut(fullCut);
        setCustomRows(fullCut.rowsData || []);
        setIsLocked(Boolean(fullCut.isLocked));
        setHistoryModalOpen(false);
        toast.success(`Corte "${fullCut.title}" cargado con éxito.`);
      }
    } catch (e) {
      toast.error('Error al cargar el corte seleccionado');
    }
  };

  // Eliminar un corte desde el historial
  const handleDeleteCutFromHistory = async (e, cut) => {
    e.stopPropagation();
    if (!window.confirm(`¿Estás seguro de eliminar el corte "${cut.title}"? Esta acción no se puede deshacer.`)) {
      return;
    }

    try {
      const res = await deleteInsuranceCut(cut.id, cut.title);
      if (res.success) {
        toast.success('Corte de seguro eliminado');
        if (activeCut && activeCut.id === cut.id) {
          handleBackToLive();
        }
        loadHistory();
      } else {
        toast.error('No se pudo eliminar el corte');
      }
    } catch (e) {
      toast.error('Error al eliminar');
    }
  };

  const handleExportXlsx = () => {
    try {
      exportCorteSeguro({
        customerName,
        warehouseName,
        cutoffDate,
        premiumRate,
        reportRows,
        totals: {
          totalPounds,
          totalBaskets,
          totalInsuredValue,
          totalPremium
        },
        format: 'xlsx'
      });
      toast.success('Corte de seguro descargado en Excel (.xlsx)');
    } catch (err) {
      console.error(err);
      toast.error('Error al exportar a Excel: ' + err.message);
    }
  };

  const handleExportCsv = () => {
    try {
      exportCorteSeguro({
        customerName,
        warehouseName,
        cutoffDate,
        premiumRate,
        reportRows,
        totals: {
          totalPounds,
          totalBaskets,
          totalInsuredValue,
          totalPremium
        },
        format: 'csv'
      });
      toast.success('Corte de seguro descargado en CSV');
    } catch (err) {
      console.error(err);
      toast.error('Error al exportar a CSV: ' + err.message);
    }
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

  const filteredCuts = cutsList.filter(c => {
    const q = historySearch.toLowerCase();
    return (
      (c.title || '').toLowerCase().includes(q) ||
      (c.customerName || '').toLowerCase().includes(q) ||
      (c.warehouseName || '').toLowerCase().includes(q) ||
      (c.cutoffDate || '').includes(q)
    );
  });

  return (
    <div>
      {/* Topbar Principal */}
      <div className="topbar">
        <div>
          <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <ShieldCheck size={24} style={{ color: 'var(--color-primary)' }} /> Corte de Seguro
          </h1>
          <p style={{ color: 'var(--color-text-light)', fontSize: '0.875rem', margin: 0 }}>
            Valoración y liquidación mensual de póliza de seguro sobre existencias de producto congelado.
          </p>
        </div>

        {/* Acciones de Cabecera: Congelar, Desbloquear, Historial, Exportar */}
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
          {!activeCut ? (
            <button 
              className="btn btn-primary" 
              onClick={handleOpenFreezeModal}
              title="Congelar y guardar el estado de este corte en la base de datos"
            >
              <Snowflake size={18} /> Congelar Período
            </button>
          ) : (
            <button 
              className={`btn ${isLocked ? 'btn-outline' : 'btn-primary'}`}
              onClick={handleToggleLock}
              title={isLocked ? 'Desbloquear corte para editar cantidades o tarifas' : 'Bloquear y cerrar corte guardando cambios'}
            >
              {isLocked ? <Unlock size={18} /> : <Lock size={18} />}
              {isLocked ? 'Desbloquear Corte' : 'Bloquear / Cerrar Corte'}
            </button>
          )}

          {/* Botón Historial de Cortes */}
          <button 
            className="btn btn-outline" 
            onClick={handleOpenHistory}
            title="Ver historial de cortes de seguro congelados"
          >
            <History size={18} /> Historial Cortes
          </button>

          {allowExport && (
            <div style={{ display: 'flex', gap: '0.4rem', borderLeft: '1px solid var(--color-border)', paddingLeft: '0.6rem' }}>
              <button className="btn btn-outline" onClick={handleExportXlsx} title="Descargar en Excel (.xlsx)">
                <FileSpreadsheet size={16} /> Excel
              </button>
              <button className="btn btn-outline" onClick={handleExportCsv} title="Descargar en CSV">
                <Download size={16} /> CSV
              </button>
              <button className="btn btn-outline" onClick={handleExportPdf} title="Descargar reporte en PDF">
                <FileOutput size={16} /> PDF
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Banner de Estado del Corte (Solo cuando se visualiza un Corte Congelado) */}
      {activeCut && (
        <div style={{
          marginBottom: '1.25rem',
          padding: '0.85rem 1.25rem',
          borderRadius: 'var(--radius-lg)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '0.75rem',
          backgroundColor: 'rgba(79, 70, 229, 0.08)',
          border: '1px solid rgba(79, 70, 229, 0.3)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div style={{
              width: '36px',
              height: '36px',
              borderRadius: '50%',
              backgroundColor: isLocked ? 'rgba(79, 70, 229, 0.2)' : 'rgba(245, 158, 11, 0.2)',
              color: isLocked ? '#4f46e5' : '#f59e0b',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              {isLocked ? <Lock size={18} /> : <Unlock size={18} />}
            </div>

            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                <strong style={{ fontSize: '0.95rem', color: 'var(--color-text)' }}>
                  Corte Congelado: {activeCut.title}
                </strong>
                <span className={`badge ${isLocked ? 'badge-primary' : 'badge-warning'}`} style={{ fontSize: '0.7rem' }}>
                  {isLocked ? '🔒 Bloqueado (Solo lectura)' : '🔓 Desbloqueado (Modo edición)'}
                </span>
                {saveStatus === 'saving' && (
                  <span className="badge badge-warning" style={{ fontSize: '0.7rem', display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}>
                    <RefreshCw size={11} className="spin" /> Guardando cambios...
                  </span>
                )}
                {saveStatus === 'saved' && (
                  <span className="badge badge-success" style={{ fontSize: '0.7rem', display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}>
                    <Check size={11} /> Autoguardado
                  </span>
                )}
              </div>
              <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--color-text-light)', marginTop: '0.15rem' }}>
                Corte al {formatDate(cutoffDate)} · Creado por {activeCut.created_by || 'admin'}
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <button 
              className="btn btn-outline" 
              style={{ fontSize: '0.8rem', padding: '0.4rem 0.75rem' }} 
              onClick={handleBackToLive}
              title="Salir de la vista del corte guardado y volver al cálculo en tiempo real"
            >
              <RotateCcw size={14} /> Volver a Modo en Vivo
            </button>
          </div>
        </div>
      )}

      {/* Configuración del Período y Parámetros */}
      <div className="card" style={{ marginBottom: '1.5rem', padding: '1.25rem' }}>
        <div className="grid grid-cols-4" style={{ alignItems: 'end', gap: '1rem' }}>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <DatePicker
              label="Fecha Inicio (Período)"
              value={startDate}
              onChange={handleStartDateChange}
              disabled={Boolean(activeCut && isLocked)}
            />
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <DatePicker
              label="Fecha de Corte (Fin)"
              value={cutoffDate}
              onChange={handleCutoffDateChange}
              disabled={Boolean(activeCut && isLocked)}
            />
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Porcentaje del seguro (%)</label>
            <input
              type="number"
              min="0"
              step="0.01"
              className="form-input"
              value={premiumRate}
              onChange={(e) => handlePremiumRateChange(e.target.value)}
              disabled={Boolean(activeCut && isLocked)}
            />
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '0.8rem', color: 'var(--color-text-light)' }}>Monto a facturar</div>
            <div style={{ fontSize: '1.75rem', fontWeight: 'bold', color: 'var(--color-primary)' }}>
              ${totalPremium.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2" style={{ marginTop: '1.25rem', gap: '1rem' }}>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Cliente</label>
            <input
              type="text"
              className="form-input"
              value={customerName}
              onChange={(e) => handleCustomerChange(e.target.value)}
              disabled={Boolean(activeCut && isLocked)}
            />
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Almacenadora / póliza</label>
            <input
              type="text"
              className="form-input"
              value={warehouseName}
              onChange={(e) => handleWarehouseChange(e.target.value)}
              disabled={Boolean(activeCut && isLocked)}
            />
          </div>
        </div>

        <p style={{ marginTop: '1rem', marginBottom: 0, fontSize: '0.8rem', color: 'var(--color-text-light)' }}>
          La tarifa usa el precio del producto. La métrica configurada para su categoría determina si se valora por libra o por cesta.
          {activeCut && !isLocked && (
            <strong style={{ color: '#f59e0b', marginLeft: '0.5rem' }}>
              (Modo edición activo: puedes modificar cantidades y precios directamente en la tabla)
            </strong>
          )}
        </p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-3" style={{ marginBottom: '1.5rem', gap: '1rem' }}>
        <div className="card stat-card">
          <div className="stat-content">
            <h3>Productos en el corte</h3>
            <p>{reportRows.length}</p>
          </div>
        </div>
        <div className="card stat-card">
          <div className="stat-content">
            <h3>Valor asegurado</h3>
            <p>${totalInsuredValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
          </div>
        </div>
        <div className="card stat-card">
          <div className="stat-content">
            <h3>Prima ({premiumRate}%)</h3>
            <p>${totalPremium.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
          </div>
        </div>
      </div>

      {/* Tabla Principal */}
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
              ) : reportRows.map((row, idx) => {
                const canEditCell = Boolean(activeCut && !isLocked);

                return (
                  <tr key={row.id || idx}>
                    <td style={{ fontWeight: 500 }}>{row.code}</td>
                    <td>{row.material}</td>
                    
                    {/* Unidades */}
                    <td style={{ textAlign: 'right' }}>
                      {canEditCell ? (
                        <input
                          type="number"
                          className="form-input"
                          style={{ width: '80px', padding: '0.2rem 0.4rem', textAlign: 'right', fontSize: '0.85rem' }}
                          value={row.units}
                          onChange={(e) => handleCellEdit(idx, 'units', e.target.value)}
                        />
                      ) : (
                        row.units.toLocaleString('en-US')
                      )}
                    </td>

                    {/* Total LB */}
                    <td style={{ textAlign: 'right' }}>
                      {canEditCell ? (
                        <input
                          type="number"
                          step="0.01"
                          className="form-input"
                          style={{ width: '95px', padding: '0.2rem 0.4rem', textAlign: 'right', fontSize: '0.85rem' }}
                          value={row.pounds}
                          onChange={(e) => handleCellEdit(idx, 'pounds', e.target.value)}
                        />
                      ) : (
                        row.pounds.toLocaleString('en-US', { maximumFractionDigits: 2 })
                      )}
                    </td>

                    {/* Total Cesta */}
                    <td style={{ textAlign: 'right' }}>
                      {canEditCell ? (
                        <input
                          type="number"
                          step="0.01"
                          className="form-input"
                          style={{ width: '90px', padding: '0.2rem 0.4rem', textAlign: 'right', fontSize: '0.85rem' }}
                          value={row.baskets}
                          onChange={(e) => handleCellEdit(idx, 'baskets', e.target.value)}
                        />
                      ) : (
                        row.baskets.toLocaleString('en-US', { maximumFractionDigits: 2 })
                      )}
                    </td>

                    {/* Valor por LB */}
                    <td style={{ textAlign: 'right' }}>
                      {canEditCell && row.valuationMetric === 'pounds' ? (
                        <input
                          type="number"
                          step="0.0001"
                          className="form-input"
                          style={{ width: '85px', padding: '0.2rem 0.4rem', textAlign: 'right', fontSize: '0.85rem' }}
                          value={row.poundRate ?? ''}
                          onChange={(e) => handleCellEdit(idx, 'poundRate', e.target.value)}
                        />
                      ) : (
                        row.poundRate == null ? '' : `$${formatPrice(row.poundRate)}`
                      )}
                    </td>

                    {/* Valor por Cestas */}
                    <td style={{ textAlign: 'right' }}>
                      {canEditCell && row.valuationMetric === 'baskets' ? (
                        <input
                          type="number"
                          step="0.0001"
                          className="form-input"
                          style={{ width: '85px', padding: '0.2rem 0.4rem', textAlign: 'right', fontSize: '0.85rem' }}
                          value={row.basketRate ?? ''}
                          onChange={(e) => handleCellEdit(idx, 'basketRate', e.target.value)}
                        />
                      ) : (
                        row.basketRate == null ? '' : `$${formatPrice(row.basketRate)}`
                      )}
                    </td>

                    {/* Total $ Asegurado */}
                    <td style={{ textAlign: 'right', fontWeight: 500 }}>
                      ${formatCurrency(row.insuredValue)}
                    </td>

                    {/* Prima */}
                    <td style={{ textAlign: 'right', fontWeight: 600, color: 'var(--color-primary)' }}>
                      ${formatCurrency(row.premium)}
                    </td>
                  </tr>
                );
              })}
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

      {/* MODAL PARA CONGELAR CORTE */}
      {freezeModalOpen && (
        <div className="modal-overlay" style={{ zIndex: 1100 }}>
          <div className="modal-content" style={{ maxWidth: '520px', width: '90%' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
              <h2 style={{ fontSize: '1.25rem', fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Snowflake size={22} style={{ color: 'var(--color-primary)' }} /> Congelar Corte de Seguro
              </h2>
              <button 
                type="button" 
                className="btn btn-outline" 
                style={{ padding: '0.25rem 0.5rem', border: 'none' }}
                onClick={() => setFreezeModalOpen(false)}
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSaveFreezeCut}>
              <div style={{ marginBottom: '1rem' }}>
                <label className="form-label" style={{ fontWeight: 600 }}>Título del Corte</label>
                <input
                  type="text"
                  className="form-input"
                  value={freezeTitle}
                  onChange={(e) => setFreezeTitle(e.target.value)}
                  placeholder="Ej. Corte de Seguro Agosto 2026"
                  required
                  autoFocus
                />
                <span style={{ fontSize: '0.75rem', color: 'var(--color-text-light)' }}>
                  Identificador para ubicarlo fácilmente en el historial.
                </span>
              </div>

              {/* Resumen del Corte a Congelar */}
              <div style={{
                backgroundColor: 'var(--color-bg)',
                borderRadius: 'var(--radius)',
                padding: '1rem',
                marginBottom: '1.5rem',
                border: '1px solid var(--color-border)'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.4rem', fontSize: '0.85rem' }}>
                  <span style={{ color: 'var(--color-text-light)' }}>Período:</span>
                  <strong>{formatDate(startDate)} al {formatDate(cutoffDate)}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.4rem', fontSize: '0.85rem' }}>
                  <span style={{ color: 'var(--color-text-light)' }}>Cliente:</span>
                  <span>{customerName}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.4rem', fontSize: '0.85rem' }}>
                  <span style={{ color: 'var(--color-text-light)' }}>Productos:</span>
                  <strong>{reportRows.length} ítems</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.4rem', fontSize: '0.85rem' }}>
                  <span style={{ color: 'var(--color-text-light)' }}>Valor Asegurado:</span>
                  <strong>${formatCurrency(totalInsuredValue)}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: '0.5rem', borderTop: '1px dashed var(--color-border)', fontSize: '0.95rem' }}>
                  <span style={{ fontWeight: 600 }}>Prima ({premiumRate}%):</span>
                  <strong style={{ color: 'var(--color-primary)' }}>${formatCurrency(totalPremium)}</strong>
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={() => setFreezeModalOpen(false)}
                  disabled={isSavingCut}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={isSavingCut}
                >
                  {isSavingCut ? (
                    <>
                      <RefreshCw size={16} className="spin" /> Guardando...
                    </>
                  ) : (
                    <>
                      <Snowflake size={16} /> Congelar Período
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL DE HISTORIAL DE CORTES */}
      {historyModalOpen && (
        <div className="modal-overlay" style={{ zIndex: 1100 }}>
          <div className="modal-content" style={{ maxWidth: '880px', width: '95%', maxHeight: '85vh', display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <div>
                <h2 style={{ fontSize: '1.25rem', fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <History size={22} style={{ color: 'var(--color-primary)' }} /> Historial de Cortes de Seguro
                </h2>
                <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--color-text-light)' }}>
                  Consulta o recupera cortes de póliza de seguro congelados anteriormente.
                </p>
              </div>
              <button 
                type="button" 
                className="btn btn-outline" 
                style={{ padding: '0.25rem 0.5rem', border: 'none' }}
                onClick={() => setHistoryModalOpen(false)}
              >
                <X size={20} />
              </button>
            </div>

            {/* Buscador */}
            <div style={{ marginBottom: '1rem', position: 'relative' }}>
              <Search size={16} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-light)' }} />
              <input
                type="text"
                className="form-input"
                style={{ paddingLeft: '2.2rem' }}
                placeholder="Buscar por título, cliente o fecha..."
                value={historySearch}
                onChange={(e) => setHistorySearch(e.target.value)}
              />
            </div>

            {/* Lista / Tabla de Cortes */}
            <div style={{ flex: 1, overflowY: 'auto', border: '1px solid var(--color-border)', borderRadius: 'var(--radius)' }}>
              {loadingHistory ? (
                <div style={{ textAlign: 'center', padding: '3rem' }}>
                  <RefreshCw size={28} className="spin" style={{ color: 'var(--color-primary)', margin: '0 auto 0.5rem' }} />
                  <p style={{ color: 'var(--color-text-light)', margin: 0 }}>Cargando cortes guardados...</p>
                </div>
              ) : filteredCuts.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '3rem' }}>
                  <AlertCircle size={32} style={{ color: 'var(--color-text-light)', margin: '0 auto 0.5rem' }} />
                  <p style={{ fontWeight: 600, margin: 0 }}>No hay cortes registrados</p>
                  <p style={{ fontSize: '0.8rem', color: 'var(--color-text-light)', marginTop: '0.25rem' }}>
                    Congela un período usando el botón "Congelar Período" para almacenarlo aquí.
                  </p>
                </div>
              ) : (
                <table style={{ width: '100%', fontSize: '0.85rem' }}>
                  <thead style={{ position: 'sticky', top: 0, backgroundColor: 'var(--color-surface)', zIndex: 1 }}>
                    <tr>
                      <th>Título</th>
                      <th>Fecha Corte</th>
                      <th>Cliente</th>
                      <th style={{ textAlign: 'right' }}>Valor Asegurado</th>
                      <th style={{ textAlign: 'right' }}>Prima</th>
                      <th>Autor</th>
                      <th style={{ textAlign: 'center' }}>Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredCuts.map((cut) => {
                      const isActive = activeCut && activeCut.id === cut.id;
                      const totals = cut.totals || {};

                      return (
                        <tr 
                          key={cut.id}
                          style={{
                            backgroundColor: isActive ? 'rgba(79, 70, 229, 0.08)' : 'inherit',
                            cursor: 'pointer'
                          }}
                          onClick={() => handleSelectCutFromHistory(cut)}
                        >
                          <td>
                            <div style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                              {cut.title}
                              {cut.isLocked && <Lock size={12} style={{ color: 'var(--color-text-light)' }} />}
                              {isActive && <span className="badge badge-primary" style={{ fontSize: '0.65rem' }}>Activo</span>}
                            </div>
                          </td>
                          <td>{formatDate(cut.cutoffDate)}</td>
                          <td>{cut.customerName}</td>
                          <td style={{ textAlign: 'right' }}>${formatCurrency(totals.totalInsuredValue || 0)}</td>
                          <td style={{ textAlign: 'right', fontWeight: 600, color: 'var(--color-primary)' }}>
                            ${formatCurrency(totals.totalPremium || 0)}
                          </td>
                          <td style={{ fontSize: '0.75rem', color: 'var(--color-text-light)' }}>
                            {cut.created_by || 'admin'}
                          </td>
                          <td style={{ textAlign: 'center' }}>
                            <div style={{ display: 'flex', gap: '0.3rem', justifyContent: 'center' }}>
                              <button
                                type="button"
                                className="btn btn-sm btn-primary"
                                style={{ padding: '0.2rem 0.5rem', fontSize: '0.75rem' }}
                                onClick={() => handleSelectCutFromHistory(cut)}
                                title="Cargar este corte en la vista"
                              >
                                Cargar
                              </button>
                              <button
                                type="button"
                                className="btn btn-sm btn-outline"
                                style={{ padding: '0.2rem 0.4rem', color: 'var(--color-danger)', borderColor: 'var(--color-danger)' }}
                                onClick={(e) => handleDeleteCutFromHistory(e, cut)}
                                title="Eliminar corte"
                              >
                                <Trash2 size={13} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1rem' }}>
              <button
                type="button"
                className="btn btn-outline"
                onClick={() => setHistoryModalOpen(false)}
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default InsuranceReport;
