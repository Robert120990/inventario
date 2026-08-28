import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useInventory } from '../../context/InventoryContext';
import { 
  FileText, Download, FileSpreadsheet, FileOutput, Layers, Package, 
  Snowflake, Lock, Unlock, History, RotateCcw, Save, Trash2, 
  CheckCircle2, AlertCircle, RefreshCw, Search, X, Check, Eye, Pencil
} from 'lucide-react';
import { exportCuadroClienteCuartoFrio } from '../../utils/exportManager';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { formatDate, formatCurrency, formatPrice } from '../../utils/formatUtils';
import { CONTRACT_INFO, resolveServiceDetails } from '../../utils/contractRates';
import { toast } from 'react-hot-toast';
import { DatePicker, DateQuickPresets, getLocalDateStr } from '../Common/DatePicker';

const Summary2 = () => {
  const { 
    products, 
    movements, 
    categoryUnits, 
    canExport, 
    currentUser,
    dailyCuts,
    fetchDailyCuts, 

    fetchDailyCutById, 
    createDailyCut, 
    updateDailyCut, 
    deleteDailyCut 
  } = useInventory();
  
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

  // Estados para Cortes Congelados e Historial
  const [activeCut, setActiveCut] = useState(null); // null = Modo en Vivo, Objeto = Corte Congelado
  const [isLocked, setIsLocked] = useState(true); // Bloqueo de edición del corte
  const [customCongelados, setCustomCongelados] = useState(null);
  const [customPreparados, setCustomPreparados] = useState(null);
  const [customServices, setCustomServices] = useState(null);

  // Estados de interfaz y modales
  const [historyModalOpen, setHistoryModalOpen] = useState(false);
  const [cutsList, setCutsList] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [historySearch, setHistorySearch] = useState('');
  
  const [freezeModalOpen, setFreezeModalOpen] = useState(false);
  const [freezeTitle, setFreezeTitle] = useState('');
  const [isSavingCut, setIsSavingCut] = useState(false);
  const [saveStatus, setSaveStatus] = useState(null); // 'saving' | 'saved' | null
  
  const autoSaveTimerRef = useRef(null);

  // Cargar cortes registrados al iniciar para sincronización de balances y baseline
  useEffect(() => {
    fetchDailyCuts().then(cuts => {
      if (Array.isArray(cuts)) setCutsList(cuts);
    });
  }, []);

  // Controladores de fecha sincronizados
  const handleStartDateChange = (newStart) => {
    if (activeCut && isLocked) return;
    setStartDate(newStart);
    let effectiveEnd = endDate;
    if (endDate && newStart > endDate) {
      setEndDate(newStart);
      effectiveEnd = newStart;
    }
    if (activeCut && !isLocked) {
      triggerAutoSave(null, null, null, newStart, effectiveEnd);
    }
  };

  const handleEndDateChange = (newEnd) => {
    if (activeCut && isLocked) return;
    setEndDate(newEnd);
    let effectiveStart = startDate;
    if (startDate && newEnd < startDate) {
      setStartDate(newEnd);
      effectiveStart = newEnd;
    }
    if (activeCut && !isLocked) {
      triggerAutoSave(null, null, null, effectiveStart, newEnd);
    }
  };

  const handlePresetSelect = (start, end) => {
    if (activeCut && isLocked) return;
    setStartDate(start);
    setEndDate(end);
    if (activeCut && !isLocked) {
      triggerAutoSave(null, null, null, start, end);
    }
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

  // Helper para calcular inventario diario para un grupo de productos y tipo de unidad con cuadre continuo
  const calculateDailySeries = (targetProducts, unitField, stockField, rate, unitLabel, descText) => {
    if (targetProducts.length === 0 || dateList.length === 0) return [];

    const d0 = dateList[0];
    const unitTypeKey = unitField === 'qtyPounds' ? 'congeladosData' : 'preparadosData';

    // Buscar cortes congelados previos para usar como línea base y asegurar cuadre perfecto
    const allCuts = (dailyCuts && dailyCuts.length > 0) ? dailyCuts : cutsList;
    const priorCuts = allCuts
      .filter(c => {
        const cutEnd = String(c.endDate || '').split('T')[0];
        const rows = c[unitTypeKey];
        return cutEnd && cutEnd <= d0 && Array.isArray(rows) && rows.length > 0;
      })
      .sort((a, b) => {
        const endA = String(a.endDate || '').split('T')[0];
        const endB = String(b.endDate || '').split('T')[0];
        return endB.localeCompare(endA);
      });

    let baselineDate = null;
    let baselineFinalStock = null;

    if (priorCuts.length > 0) {
      const lastCut = priorCuts[0];
      const cutRows = lastCut[unitTypeKey] || [];
      const cutEnd = String(lastCut.endDate || '').split('T')[0];
      
      const rowOnEnd = cutRows.find(r => String(r.fecha || '').split('T')[0] === cutEnd) || cutRows[cutRows.length - 1];
      if (rowOnEnd && rowOnEnd.stockFinal !== undefined && rowOnEnd.stockFinal !== null) {
        baselineDate = cutEnd;
        baselineFinalStock = Number(rowOnEnd.stockFinal || 0);
      }
    }

    let startingStockForD0 = 0;

    if (baselineDate !== null && baselineFinalStock !== null) {
      let accumulated = baselineFinalStock;
      if (baselineDate < d0) {
        targetProducts.forEach(p => {
          const pMovs = movements.filter(m => m.items && m.items.some(it => it.productId === p.id));
          pMovs.forEach(m => {
            const mDate = String(m.date || '').split('T')[0];
            if (mDate > baselineDate && mDate < d0) {
              const item = m.items.find(it => it.productId === p.id);
              if (item) {
                if (m.type === 'in') accumulated += Number(item[unitField] || 0);
                if (m.type === 'out') accumulated -= Number(item[unitField] || 0);
              }
            }
          });
        });
      }
      startingStockForD0 = accumulated;
    } else {
      // Cálculo hacia atrás desde stock actual de productos
      targetProducts.forEach(p => {
        const pMovs = movements.filter(m => m.items && m.items.some(it => it.productId === p.id));
        let stockAtD0End = Number(p[stockField] || 0);

        const afterD0 = pMovs.filter(m => String(m.date || '').split('T')[0] > d0);
        afterD0.forEach(m => {
          const item = m.items.find(it => it.productId === p.id);
          if (item) {
            if (m.type === 'in') stockAtD0End -= Number(item[unitField] || 0);
            if (m.type === 'out') stockAtD0End += Number(item[unitField] || 0);
          }
        });

        const onD0 = pMovs.filter(m => String(m.date || '').split('T')[0] === d0);
        let inOnD0 = 0;
        let outOnD0 = 0;
        onD0.forEach(m => {
          const item = m.items.find(it => it.productId === p.id);
          if (item) {
            if (m.type === 'in') inOnD0 += Number(item[unitField] || 0);
            if (m.type === 'out') outOnD0 += Number(item[unitField] || 0);
          }
        });

        const initialOnD0 = stockAtD0End - inOnD0 + outOnD0;
        startingStockForD0 += initialOnD0;
      });
    }

    // Encadenamiento hacia adelante día a día garantizando continuidad
    let runningInitial = startingStockForD0;
    const resultRows = [];

    dateList.forEach(dateStr => {
      let dayIn = 0;
      let dayOut = 0;

      targetProducts.forEach(p => {
        const pMovs = movements.filter(m => m.items && m.items.some(it => it.productId === p.id));
        const onDate = pMovs.filter(m => String(m.date || '').split('T')[0] === dateStr);
        onDate.forEach(m => {
          const item = m.items.find(it => it.productId === p.id);
          if (item) {
            if (m.type === 'in') dayIn += Number(item[unitField] || 0);
            if (m.type === 'out') dayOut += Number(item[unitField] || 0);
          }
        });
      });

      const dayFinal = runningInitial + dayIn - dayOut;
      const dayTotalCost = dayFinal * rate;

      resultRows.push({
        fecha: dateStr,
        descripcion: descText,
        unitLabel,
        unitType: unitField === 'qtyPounds' ? 'pounds' : 'baskets',
        stockInicial: runningInitial,
        entradas: dayIn,
        salidas: dayOut,
        stockFinal: dayFinal,
        precio: rate,
        totalMonto: dayTotalCost
      });

      runningInitial = dayFinal;
    });

    return resultRows;
  };

  // Cálculo en vivo: 1. PRODUCTOS CONGELADOS
  const liveCongeladosRows = useMemo(() => {
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
  }, [products, movements, dateList, categoryUnits, cutsList, dailyCuts]);

  // Cálculo en vivo: 2. PRODUCTOS PREPARADOS
  const livePreparadosRows = useMemo(() => {
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
  }, [products, movements, dateList, categoryUnits, cutsList, dailyCuts]);


  // Cálculo en vivo: 3. SERVICIOS EXTRAORDINARIOS (Resueltos con libras y tarifas reales)
  const liveServicesData = useMemo(() => {
    if (!startDate || !endDate) return [];
    const services = [];
    movements.forEach(m => {
      const mDateStr = String(m.date || '').split('T')[0];
      if (mDateStr >= startDate && mDateStr <= endDate && m.services && m.services.length > 0) {
        m.services.forEach(s => {
          const res = resolveServiceDetails(s);
          services.push({
            date: mDateStr,
            description: res.description,
            quantity: res.quantity,
            unitPrice: res.unitPrice,
            value: Number(res.value || 0),
            ref: m.refNumber ? `${m.refType || 'Doc'} #${m.refNumber}` : ''
          });
        });
      }
    });
    return services;
  }, [movements, startDate, endDate]);

  // Filas activas en pantalla (utiliza datos del corte congelado o cálculo dinámico en vivo)
  const congeladosRows = customCongelados !== null 
    ? customCongelados 
    : (activeCut ? (activeCut.congeladosData || []) : liveCongeladosRows);

  const preparadosRows = customPreparados !== null 
    ? customPreparados 
    : (activeCut ? (activeCut.preparadosData || []) : livePreparadosRows);

  const rawServicesData = customServices !== null 
    ? customServices 
    : (activeCut ? (activeCut.servicesData || []) : liveServicesData);

  const servicesData = useMemo(() => {
    return (rawServicesData || []).map(resolveServiceDetails);
  }, [rawServicesData]);

  // Totales Congelados (Libras)
  const congTotals = useMemo(() => {
    const invInicial = congeladosRows.reduce((acc, r) => acc + (Number(r.stockInicial) || 0), 0);
    const entradas = congeladosRows.reduce((acc, r) => acc + (Number(r.entradas) || 0), 0);
    const salidas = congeladosRows.reduce((acc, r) => acc + (Number(r.salidas) || 0), 0);
    const stockFinal = congeladosRows.reduce((acc, r) => acc + (Number(r.stockFinal) || 0), 0);
    const totalMonto = congeladosRows.reduce((acc, r) => acc + (Number(r.totalMonto) || 0), 0);
    return { invInicial, entradas, salidas, stockFinal, totalMonto };
  }, [congeladosRows]);

  // Totales Preparados (Cestas)
  const prepTotals = useMemo(() => {
    const invInicial = preparadosRows.reduce((acc, r) => acc + (Number(r.stockInicial) || 0), 0);
    const entradas = preparadosRows.reduce((acc, r) => acc + (Number(r.entradas) || 0), 0);
    const salidas = preparadosRows.reduce((acc, r) => acc + (Number(r.salidas) || 0), 0);
    const stockFinal = preparadosRows.reduce((acc, r) => acc + (Number(r.stockFinal) || 0), 0);
    const totalMonto = preparadosRows.reduce((acc, r) => acc + (Number(r.totalMonto) || 0), 0);
    return { invInicial, entradas, salidas, stockFinal, totalMonto };
  }, [preparadosRows]);

  // Totales Servicios Extraordinarios
  const totalServicios = useMemo(() => {
    return servicesData.reduce((acc, s) => acc + (Number(s.value) || 0), 0);
  }, [servicesData]);

  const totalServiciosQty = useMemo(() => {
    return servicesData.reduce((acc, s) => acc + (Number(s.quantity) || 1), 0);
  }, [servicesData]);

  const showCongelados = selectedCategory === 'all' || selectedCategory === 'Congelados';
  const showPreparados = selectedCategory === 'all' || selectedCategory === 'Preparados';

  const reportTotalAlmacenaje = (showCongelados ? congTotals.totalMonto : 0) + (showPreparados ? prepTotals.totalMonto : 0);
  const reportSubtotal = reportTotalAlmacenaje + totalServicios;
  const reportIva = reportSubtotal * CONTRACT_INFO.ivaRate;
  const reportGrandTotal = reportSubtotal + reportIva;

  // =========================================================================
  // GESTIÓN DE CORTES CONGELADOS, DESBLOQUEO, EDICIÓN Y AUTO-GUARDADO
  // =========================================================================

  // Disparador de autoguardado con debounce cuando se edita un corte activo
  const triggerAutoSave = (updatedCong, updatedPrep, updatedServ, customStart, customEnd) => {
    if (!activeCut) return;

    setSaveStatus('saving');
    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
    }

    autoSaveTimerRef.current = setTimeout(async () => {
      const cong = updatedCong || congeladosRows;
      const prep = updatedPrep || preparadosRows;
      const serv = (updatedServ || servicesData).map(resolveServiceDetails);
      const effectiveStart = customStart || startDate;
      const effectiveEnd = customEnd || endDate;

      const calcCongTotal = cong.reduce((acc, r) => acc + (Number(r.totalMonto) || 0), 0);
      const calcPrepTotal = prep.reduce((acc, r) => acc + (Number(r.totalMonto) || 0), 0);
      const calcServTotal = serv.reduce((acc, s) => acc + (Number(s.value) || 0), 0);
      const calcSub = calcCongTotal + calcPrepTotal + calcServTotal;
      const calcIva = calcSub * CONTRACT_INFO.ivaRate;
      const calcGrand = calcSub + calcIva;

      const totalsPayload = {
        totalAlmacenaje: calcCongTotal + calcPrepTotal,
        subtotal: calcSub,
        iva: calcIva,
        totalGeneral: calcGrand,
        congeladosMonto: calcCongTotal,
        preparadosMonto: calcPrepTotal,
        serviciosMonto: calcServTotal
      };

      const newTitle = activeCut.title?.startsWith('Corte ') 
        ? `Corte ${formatDate(effectiveStart)} al ${formatDate(effectiveEnd)}`
        : (activeCut.title || `Corte ${formatDate(effectiveStart)} al ${formatDate(effectiveEnd)}`);

      const res = await updateDailyCut(activeCut.id, {
        title: newTitle,
        startDate: effectiveStart,
        endDate: effectiveEnd,
        congeladosData: cong,
        preparadosData: prep,
        servicesData: serv,
        totalsData: totalsPayload,
        clientName
      });

      if (res.success) {
        setSaveStatus('saved');
        setActiveCut(prev => ({
          ...prev,
          title: newTitle,
          startDate: effectiveStart,
          endDate: effectiveEnd,
          congeladosData: cong,
          preparadosData: prep,
          servicesData: serv,
          totalsData: totalsPayload,
          clientName
        }));
        // Sincronizar lista de cortes en memoria
        fetchDailyCuts().then(cuts => setCutsList(Array.isArray(cuts) ? cuts : []));
        setTimeout(() => setSaveStatus(null), 3000);
      } else {
        setSaveStatus(null);
        toast.error('Error al autoguardar cambios en el corte');
      }
    }, 600);
  };

  // Edición en línea de celdas (INV-INICIAL, ENTRADA, SALIDA, TOTAL)
  const handleCellEdit = (tableType, index, field, rawValue) => {
    if (isLocked && activeCut) {
      toast('Desbloquea el corte para poder editar las lecturas.', { icon: '🔒' });
      return;
    }

    const numVal = rawValue === '' ? 0 : Number(rawValue);

    if (tableType === 'congelados') {
      const newRows = [...congeladosRows];
      const row = { ...newRows[index] };
      row[field] = numVal;

      if (field === 'stockInicial' || field === 'entradas' || field === 'salidas') {
        const init = Number(field === 'stockInicial' ? numVal : row.stockInicial) || 0;
        const ent = Number(field === 'entradas' ? numVal : row.entradas) || 0;
        const sal = Number(field === 'salidas' ? numVal : row.salidas) || 0;
        row.stockFinal = init + ent - sal;
      }

      row.totalMonto = Number(row.stockFinal || 0) * Number(row.precio || 0.001);
      newRows[index] = row;
      setCustomCongelados(newRows);
      triggerAutoSave(newRows, null, null);
    } else if (tableType === 'preparados') {
      const newRows = [...preparadosRows];
      const row = { ...newRows[index] };
      row[field] = numVal;

      if (field === 'stockInicial' || field === 'entradas' || field === 'salidas') {
        const init = Number(field === 'stockInicial' ? numVal : row.stockInicial) || 0;
        const ent = Number(field === 'entradas' ? numVal : row.entradas) || 0;
        const sal = Number(field === 'salidas' ? numVal : row.salidas) || 0;
        row.stockFinal = init + ent - sal;
      }

      row.totalMonto = Number(row.stockFinal || 0) * Number(row.precio || 0.038);
      newRows[index] = row;
      setCustomPreparados(newRows);
      triggerAutoSave(null, newRows, null);
    }
  };

  // Edición en línea para Servicios Extraordinarios (CANTIDAD y PRECIO calculan automáticamente el VALOR total)
  const handleServiceCellEdit = (index, field, rawValue) => {
    if (isLocked && activeCut) {
      toast('Desbloquea el corte para poder editar los servicios.', { icon: '🔒' });
      return;
    }

    const newServices = servicesData.map(s => ({ ...s }));
    const item = { ...newServices[index] };

    if (field === 'description') {
      item.description = rawValue;
    } else {
      const numVal = rawValue === '' ? 0 : Number(rawValue);
      item[field] = numVal;

      const q = Number(field === 'quantity' ? numVal : item.quantity) || 0;
      const p = Number(field === 'unitPrice' ? numVal : item.unitPrice) || 0;
      item.value = Number((q * p).toFixed(2));
    }

    newServices[index] = item;
    setCustomServices(newServices);
    triggerAutoSave(null, null, newServices);
  };


  // Abrir modal para congelar corte actual
  const handleOpenFreezeModal = () => {
    setFreezeTitle(`Corte ${formatDate(startDate)} al ${formatDate(endDate)}`);
    setFreezeModalOpen(true);
  };

  // Confirmar y congelar el período actual
  const handleConfirmFreeze = async (e) => {
    e.preventDefault();
    if (!freezeTitle.trim()) {
      toast.error('Ingresa un título o identificador para el corte.');
      return;
    }

    setIsSavingCut(true);
    try {
      const totalsPayload = {
        totalAlmacenaje: reportTotalAlmacenaje,
        subtotal: reportSubtotal,
        iva: reportIva,
        totalGeneral: reportGrandTotal,
        congeladosMonto: congTotals.totalMonto,
        preparadosMonto: prepTotals.totalMonto,
        serviciosMonto: totalServicios
      };

      const resolvedServs = servicesData.map(resolveServiceDetails);

      const res = await createDailyCut({
        title: freezeTitle.trim(),
        clientName,
        startDate,
        endDate,
        isLocked: 1,
        congeladosData: congeladosRows,
        preparadosData: preparadosRows,
        servicesData: resolvedServs,
        totalsData: totalsPayload
      });

      if (res.success) {
        toast.success('¡Corte diario congelado y guardado con éxito!');
        setFreezeModalOpen(false);
        // Actualizar lista en historial
        const cuts = await fetchDailyCuts();
        if (Array.isArray(cuts)) setCutsList(cuts);

        // Cargar el corte recién creado como corte activo
        const fullCut = await fetchDailyCutById(res.id);
        if (fullCut) {
          setActiveCut(fullCut);
          setCustomCongelados(fullCut.congeladosData);
          setCustomPreparados(fullCut.preparadosData);
          setCustomServices(fullCut.servicesData);
          setIsLocked(true);
        }
      } else {
        toast.error(res.message || 'No se pudo guardar el corte.');
      }
    } catch (err) {
      console.error(err);
      toast.error('Error al congelar el período: ' + err.message);
    } finally {
      setIsSavingCut(false);
    }
  };

  // Alternar Bloqueo / Desbloqueo del corte activo (Guardando fechas y datos actualizados al cerrar)
  const handleToggleLock = async () => {
    if (!activeCut) return;

    const newLockState = !isLocked;
    setIsLocked(newLockState);

    const cong = congeladosRows;
    const prep = preparadosRows;
    const serv = servicesData.map(resolveServiceDetails);

    const calcCongTotal = cong.reduce((acc, r) => acc + (Number(r.totalMonto) || 0), 0);
    const calcPrepTotal = prep.reduce((acc, r) => acc + (Number(r.totalMonto) || 0), 0);
    const calcServTotal = serv.reduce((acc, s) => acc + (Number(s.value) || 0), 0);
    const calcSub = calcCongTotal + calcPrepTotal + calcServTotal;
    const calcIva = calcSub * CONTRACT_INFO.ivaRate;
    const calcGrand = calcSub + calcIva;

    const totalsPayload = {
      totalAlmacenaje: calcCongTotal + calcPrepTotal,
      subtotal: calcSub,
      iva: calcIva,
      totalGeneral: calcGrand,
      congeladosMonto: calcCongTotal,
      preparadosMonto: calcPrepTotal,
      serviciosMonto: calcServTotal
    };

    const newTitle = activeCut.title?.startsWith('Corte ') 
      ? `Corte ${formatDate(startDate)} al ${formatDate(endDate)}`
      : (activeCut.title || `Corte ${formatDate(startDate)} al ${formatDate(endDate)}`);

    try {
      const res = await updateDailyCut(activeCut.id, {
        isLocked: newLockState ? 1 : 0,
        title: newTitle,
        startDate,
        endDate,
        clientName,
        congeladosData: cong,
        preparadosData: prep,
        servicesData: serv,
        totalsData: totalsPayload
      });

      if (res.success) {
        setActiveCut(prev => ({
          ...prev,
          isLocked: newLockState,
          title: newTitle,
          startDate,
          endDate,
          congeladosData: cong,
          preparadosData: prep,
          servicesData: serv,
          totalsData: totalsPayload
        }));

        // Actualizar lista en el historial
        fetchDailyCuts().then(cuts => {
          if (Array.isArray(cuts)) setCutsList(cuts);
        });

        if (newLockState) {
          toast.success('Corte cerrado y bloqueado. Fechas y datos sincronizados con éxito.');
        } else {
          toast('Corte desbloqueado. Ahora puedes editar fechas y lecturas.', { icon: '🔓' });
        }
      }
    } catch (e) {
      toast.error('Error al actualizar estado de bloqueo');
    }
  };

  // Volver al Modo en Vivo (tiempo real)
  const handleBackToLive = () => {
    setActiveCut(null);
    setCustomCongelados(null);
    setCustomPreparados(null);
    setCustomServices(null);
    setIsLocked(false);
    setSaveStatus(null);
    toast.success('Has regresado al Modo en Tiempo Real.');
  };

  // Cargar lista de historial de cortes
  const loadHistory = async () => {
    setLoadingHistory(true);
    try {
      const cuts = await fetchDailyCuts();
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
      const fullCut = await fetchDailyCutById(cutSummary.id);
      if (fullCut) {
        setStartDate(fullCut.startDate.split('T')[0]);
        setEndDate(fullCut.endDate.split('T')[0]);
        setClientName(fullCut.clientName || CONTRACT_INFO.clientName);
        setActiveCut(fullCut);
        setCustomCongelados(fullCut.congeladosData);
        setCustomPreparados(fullCut.preparadosData);
        setCustomServices(fullCut.servicesData);
        setIsLocked(Boolean(fullCut.isLocked));
        setSaveStatus(null);
        setHistoryModalOpen(false);
        toast.success(`Corte '${fullCut.title}' cargado.`);
      }
    } catch (e) {
      toast.error('Error al cargar el corte seleccionado');
    }
  };

  // Eliminar un corte del historial
  const handleDeleteCut = async (cut) => {
    if (!window.confirm(`¿Estás seguro de que deseas eliminar permanentemente el corte '${cut.title}'?`)) {
      return;
    }

    const res = await deleteDailyCut(cut.id, cut.title);
    if (res.success) {
      toast.success('Corte eliminado con éxito.');
      if (activeCut?.id === cut.id) {
        handleBackToLive();
      }
      loadHistory();
    } else {
      toast.error('Error al eliminar el corte.');
    }
  };

  // =========================================================================
  // EXPORTACIONES
  // =========================================================================

  // Exportar Excel XLSX
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
      toast.success('Reporte Excel descargado exitosamente');
    } catch (err) {
      console.error(err);
      toast.error('Error al exportar Excel: ' + err.message);
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
      toast.success('Archivo CSV descargado exitosamente');
    } catch (err) {
      console.error(err);
      toast.error('Error al exportar CSV: ' + err.message);
    }
  };

  // Exportar PDF
  const handleExportPDF = () => {
    const doc = new jsPDF('p', 'mm', 'letter');
    
    // Encabezado
    doc.setFontSize(11);
    doc.setFont(undefined, 'bold');
    doc.text(CONTRACT_INFO.contractorName, 14, 15);
    doc.setFontSize(8.5);
    doc.setFont(undefined, 'normal');
    doc.text(CONTRACT_INFO.facility, 14, 20);
    doc.text(`Cliente: ${clientName}`, 14, 25);
    doc.text(`Período de Facturación: ${formatDate(startDate)} al ${formatDate(endDate)} (${daysCount} días)`, 14, 30);
    
    if (activeCut) {
      doc.setFont(undefined, 'bold');
      doc.text(`[Corte Congelado: ${activeCut.title}]`, 14, 35);
      doc.setFont(undefined, 'normal');
    }

    doc.setLineWidth(0.5);
    doc.line(14, 37, 200, 37);

    let currentY = 42;

    // 1. Tabla Congelados
    if (showCongelados && congeladosRows.length > 0) {
      doc.setFontSize(9);
      doc.setFont(undefined, 'bold');
      doc.text('1. ALMACENAMIENTO PRODUCTO CONGELADO (-18°C) - Tarifa: $0.001 / libra / día', 14, currentY);
      
      const congBody = congeladosRows.map(r => [
        formatDate(r.fecha),
        r.descripcion,
        Number(r.stockInicial || 0).toLocaleString('en-US'),
        Number(r.entradas || 0).toLocaleString('en-US'),
        Number(r.salidas || 0).toLocaleString('en-US'),
        Number(r.stockFinal || 0).toLocaleString('en-US'),
        `$${formatPrice(r.precio)}`,
        `$${formatCurrency(r.totalMonto)}`
      ]);

      congBody.push([
        'TOTALES',
        '',
        congTotals.invInicial.toLocaleString('en-US'),
        congTotals.entradas.toLocaleString('en-US'),
        congTotals.salidas.toLocaleString('en-US'),
        congTotals.stockFinal.toLocaleString('en-US'),
        '',
        `$${formatCurrency(congTotals.totalMonto)}`
      ]);

      autoTable(doc, {
        head: [["FECHA", "DESCRIPCION", "INV-INICIAL", "ENTRADAS", "SALIDAS", "TOTAL LBS", "PRECIO", "TOTAL $"]],
        body: congBody,
        startY: currentY + 2,
        styles: { fontSize: 6.5, cellPadding: 1 },
        headStyles: { fillColor: [41, 128, 185], textColor: 255, fontStyle: 'bold' }
      });

      currentY = doc.lastAutoTable.finalY + 6;
    }

    // 2. Tabla Preparados
    if (showPreparados && preparadosRows.length > 0) {
      if (currentY > 220) { doc.addPage(); currentY = 15; }

      doc.setFontSize(9);
      doc.setFont(undefined, 'bold');
      doc.text('2. ALMACENAMIENTO PRODUCTOS PREPARADOS - Tarifa: $0.038 / cesta / día', 14, currentY);
      
      const prepBody = preparadosRows.map(r => [
        formatDate(r.fecha),
        r.descripcion,
        Number(r.stockInicial || 0).toLocaleString('en-US'),
        Number(r.entradas || 0).toLocaleString('en-US'),
        Number(r.salidas || 0).toLocaleString('en-US'),
        Number(r.stockFinal || 0).toLocaleString('en-US'),
        `$${formatPrice(r.precio)}`,
        `$${formatCurrency(r.totalMonto)}`
      ]);

      prepBody.push([
        'TOTALES',
        '',
        prepTotals.invInicial.toLocaleString('en-US'),
        prepTotals.entradas.toLocaleString('en-US'),
        prepTotals.salidas.toLocaleString('en-US'),
        prepTotals.stockFinal.toLocaleString('en-US'),
        '',
        `$${formatCurrency(prepTotals.totalMonto)}`
      ]);

      autoTable(doc, {
        head: [["FECHA", "DESCRIPCION", "INV CESTAS", "ENTRADAS", "SALIDAS", "TOTAL CESTAS", "PRECIO", "TOTAL $"]],
        body: prepBody,
        startY: currentY + 2,
        styles: { fontSize: 6.5, cellPadding: 1 },
        headStyles: { fillColor: [39, 174, 96], textColor: 255, fontStyle: 'bold' }
      });

      currentY = doc.lastAutoTable.finalY + 6;
    }

    // 3. Tabla Servicios Extraordinarios
    if (servicesData.length > 0) {
      if (currentY > 220) { doc.addPage(); currentY = 15; }

      doc.setFontSize(9);
      doc.setFont(undefined, 'bold');
      doc.text('3. SERVICIOS EXTRA-ORDINARIOS (MANIOBRAS, HORAS EXTRAS, TEMPERATURA)', 14, currentY);
      
      const servRows = servicesData.map(s => [
        formatDate(s.date),
        s.description + (s.ref ? ` (${s.ref})` : ''),
        s.quantity ? Number(s.quantity).toLocaleString('en-US', { maximumFractionDigits: 2 }) : '1',
        s.unitPrice ? `$${formatPrice(s.unitPrice)}` : `$${formatCurrency(s.value)}`,
        `$${formatCurrency(s.value)}`
      ]);

      servRows.push(['TOTALES', '', totalServiciosQty.toLocaleString('en-US'), '', `$${formatCurrency(totalServicios)}`]);

      autoTable(doc, {
        head: [["FECHA", "DESCRIPCION", "TOTAL (CANT/LBS)", "PRECIO", "VALOR"]],
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

  // Filtrado de historial
  const filteredCuts = useMemo(() => {
    if (!historySearch.trim()) return cutsList;
    const q = historySearch.toLowerCase();
    return cutsList.filter(c => 
      (c.title || '').toLowerCase().includes(q) ||
      (c.clientName || '').toLowerCase().includes(q) ||
      (c.startDate || '').includes(q) ||
      (c.endDate || '').includes(q)
    );
  }, [cutsList, historySearch]);

  return (
    <div>
      {/* Topbar Principal */}
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

        {/* Acciones de Cabecera: Congelar, Desbloquear, Historial, Exportar */}
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
          {!activeCut ? (
            <button 
              className="btn btn-primary" 
              onClick={handleOpenFreezeModal}
              title="Congelar y guardar el estado de este período en la base de datos"
            >
              <Snowflake size={18} /> Congelar Período
            </button>
          ) : (
            <button 
              className={`btn ${isLocked ? 'btn-outline' : 'btn-primary'}`}
              onClick={handleToggleLock}
              title={isLocked ? 'Desbloquear corte para editar fechas o lecturas' : 'Bloquear y cerrar corte guardando fechas y datos'}
            >
              {isLocked ? <Unlock size={18} /> : <Lock size={18} />}
              {isLocked ? 'Desbloquear Corte' : 'Bloquear / Cerrar Corte'}
            </button>
          )}

          {/* Botón Historial de Cortes */}
          <button 
            className="btn btn-outline" 
            onClick={handleOpenHistory}
            title="Ver historial de cortes diarios congelados"
          >
            <History size={18} /> Historial Cortes
          </button>

          {allowExport && (
            <div style={{ display: 'flex', gap: '0.4rem', borderLeft: '1px solid var(--color-border)', paddingLeft: '0.6rem' }}>
              <button className="btn btn-outline" onClick={handleExportXLSX} title="Descargar en Excel (.xlsx)">
                <FileSpreadsheet size={16} /> Excel
              </button>
              <button className="btn btn-outline" onClick={handleExportCSV} title="Descargar en CSV">
                <Download size={16} /> CSV
              </button>
              <button className="btn btn-outline" onClick={handleExportPDF} title="Descargar reporte en PDF">
                <FileOutput size={16} /> PDF
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Banner de Estado del Corte (Modo En Vivo vs Corte Congelado) */}
      <div style={{
        marginBottom: '1.25rem',
        padding: '0.85rem 1.25rem',
        borderRadius: 'var(--radius-lg)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '0.75rem',
        backgroundColor: activeCut ? 'rgba(79, 70, 229, 0.08)' : 'rgba(16, 185, 129, 0.08)',
        border: activeCut ? '1px solid rgba(79, 70, 229, 0.3)' : '1px solid rgba(16, 185, 129, 0.3)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          {activeCut ? (
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
          ) : (
            <div style={{
              width: '36px',
              height: '36px',
              borderRadius: '50%',
              backgroundColor: 'rgba(16, 185, 129, 0.2)',
              color: '#10b981',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <RefreshCw size={18} />
            </div>
          )}

          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
              <strong style={{ fontSize: '0.95rem', color: 'var(--color-text)' }}>
                {activeCut ? `Corte Congelado: ${activeCut.title}` : 'Modo en Vivo (Tiempo Real)'}
              </strong>
              {activeCut && (
                <span className={`badge ${isLocked ? 'badge-primary' : 'badge-warning'}`} style={{ fontSize: '0.7rem' }}>
                  {isLocked ? '🔒 Bloqueado (Solo lectura)' : '🔓 Desbloqueado (Modo edición y ajuste de fechas)'}
                </span>
              )}
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
              {activeCut 
                ? `Período oficial del ${formatDate(startDate)} al ${formatDate(endDate)} · Creado por ${activeCut.created_by || 'admin'}`
                : 'Calculando lecturas y existencias dinámicamente desde los movimientos registrados en el sistema.'}
            </p>
          </div>
        </div>

        {activeCut && (
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <button 
              className="btn btn-outline" 
              style={{ fontSize: '0.8rem', padding: '0.4rem 0.75rem' }} 
              onClick={handleBackToLive}
              title="Salir de la vista del corte guardado y volver al cálculo dinámico en tiempo real"
            >
              <RotateCcw size={14} /> Volver a Tiempo Real
            </button>
          </div>
        )}
      </div>

      {/* Panel de Filtros y Configuración del Período */}
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
            <label className="form-label">Cliente Facturación</label>
            <input
              type="text"
              className="form-input"
              value={clientName}
              onChange={(e) => setClientName(e.target.value)}
              placeholder="Nombre del Cliente"
              disabled={Boolean(activeCut && isLocked)}
            />
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Filtrar Categoría</label>
            <select
              className="form-select"
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
            >
              <option value="all">Todas las Categorías</option>
              <option value="Congelados">Solo Congelados (Libras)</option>
              <option value="Preparados">Solo Preparados (Cestas)</option>
            </select>
          </div>
        </div>
      </div>

      {/* KPI Cards del Período */}
      <div className="grid grid-cols-4" style={{ marginBottom: '1.5rem', gap: '1rem' }}>
        <div className="card" style={{ padding: '1.25rem', borderLeft: '4px solid #2980b9' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
            <span style={{ fontSize: '0.8rem', color: 'var(--color-text-light)', fontWeight: 600 }}>CONGELADOS (LBS)</span>
            <Snowflake size={16} style={{ color: '#2980b9' }} />
          </div>
          <div style={{ fontSize: '1.35rem', fontWeight: 'bold', color: 'var(--color-text)' }}>
            {congTotals.stockFinal.toLocaleString('en-US')} lbs
          </div>
          <div style={{ fontSize: '0.8rem', color: '#2980b9', marginTop: '0.25rem', fontWeight: '600' }}>
            ${formatCurrency(congTotals.totalMonto)} acumulado
          </div>
        </div>

        <div className="card" style={{ padding: '1.25rem', borderLeft: '4px solid #27ae60' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
            <span style={{ fontSize: '0.8rem', color: 'var(--color-text-light)', fontWeight: 600 }}>PREPARADOS (CESTAS)</span>
            <Package size={16} style={{ color: '#27ae60' }} />
          </div>
          <div style={{ fontSize: '1.35rem', fontWeight: 'bold', color: 'var(--color-text)' }}>
            {prepTotals.stockFinal.toLocaleString('en-US')} cestas
          </div>
          <div style={{ fontSize: '0.8rem', color: '#27ae60', marginTop: '0.25rem', fontWeight: '600' }}>
            ${formatCurrency(prepTotals.totalMonto)} acumulado
          </div>
        </div>

        <div className="card" style={{ padding: '1.25rem', borderLeft: '4px solid #e67e22' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
            <span style={{ fontSize: '0.8rem', color: 'var(--color-text-light)', fontWeight: 600 }}>SERVICIOS EXTRA</span>
            <Layers size={16} style={{ color: '#e67e22' }} />
          </div>
          <div style={{ fontSize: '1.35rem', fontWeight: 'bold', color: 'var(--color-text)' }}>
            ${formatCurrency(totalServicios)}
          </div>
          <div style={{ fontSize: '0.8rem', color: 'var(--color-text-light)', marginTop: '0.25rem' }}>
            {servicesData.length} actividades ({totalServiciosQty.toLocaleString('en-US')} cant/lbs)
          </div>
        </div>

        <div className="card" style={{ padding: '1.25rem', borderLeft: '4px solid var(--color-primary)', backgroundColor: 'rgba(79, 70, 229, 0.03)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
            <span style={{ fontSize: '0.8rem', color: 'var(--color-primary)', fontWeight: 700 }}>TOTAL + IVA (13%)</span>
            <CheckCircle2 size={16} style={{ color: 'var(--color-primary)' }} />
          </div>
          <div style={{ fontSize: '1.45rem', fontWeight: 'bold', color: 'var(--color-primary)' }}>
            ${formatCurrency(reportGrandTotal)}
          </div>
          <div style={{ fontSize: '0.8rem', color: 'var(--color-text-light)', marginTop: '0.25rem' }}>
            Subtotal: ${formatCurrency(reportSubtotal)}
          </div>
        </div>
      </div>

      {/* =========================================================================
          TABLA 1: PRODUCTOS CONGELADOS (LIBRAS - $0.001 / LB / DIA)
          ========================================================================= */}
      {showCongelados && (
        <div style={{ marginBottom: '2.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <div style={{ width: '12px', height: '12px', borderRadius: '3px', backgroundColor: '#2980b9' }}></div>
              <h2 style={{ fontSize: '1.1rem', fontWeight: 'bold', color: 'var(--color-text)', margin: 0 }}>
                ALMACENAMIENTO PRODUCTO CONGELADO (-18°C)
              </h2>
              <span className="badge badge-outline" style={{ fontSize: '0.75rem', borderColor: '#2980b9', color: '#2980b9' }}>
                Tarifa: $0.001 / libra / día
              </span>
              {activeCut && !isLocked && (
                <span className="badge badge-warning" style={{ fontSize: '0.7rem' }}>
                  ✍️ Celdas Editables (Autoguardado)
                </span>
              )}
            </div>
            <div style={{ fontSize: '0.85rem', color: 'var(--color-text-light)' }}>
              Subtotal Congelados: <strong style={{ color: '#2980b9' }}>${formatCurrency(congTotals.totalMonto)}</strong>
            </div>
          </div>

          <div className="card" style={{ padding: 0 }}>
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
                    <th style={{ textAlign: 'center' }}>PRECIO</th>
                    <th style={{ textAlign: 'right' }}>Total $</th>
                  </tr>
                </thead>
                <tbody>
                  {congeladosRows.length === 0 ? (
                    <tr>
                      <td colSpan="8" style={{ textAlign: 'center', padding: '1.5rem', color: 'var(--color-text-light)' }}>
                        No hay movimientos de productos congelados en el período seleccionado.
                      </td>
                    </tr>
                  ) : (
                    congeladosRows.map((r, idx) => (
                      <tr key={idx}>
                        <td style={{ fontWeight: '500' }}>{formatDate(r.fecha)}</td>
                        <td>{r.descripcion}</td>
                        <td style={{ textAlign: 'right' }}>
                          {activeCut && !isLocked ? (
                            <input
                              type="number"
                              className="form-input"
                              style={{ width: '100px', textAlign: 'right', margin: 0, padding: '0.35rem 0.5rem' }}
                              value={r.stockInicial ?? ''}
                              onChange={(e) => handleCellEdit('congelados', idx, 'stockInicial', e.target.value)}
                            />
                          ) : (
                            Number(r.stockInicial || 0).toLocaleString('en-US')
                          )}
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          {activeCut && !isLocked ? (
                            <input
                              type="number"
                              className="form-input"
                              style={{ width: '100px', textAlign: 'right', margin: 0, padding: '0.35rem 0.5rem', color: 'var(--color-success)' }}
                              value={r.entradas ?? ''}
                              onChange={(e) => handleCellEdit('congelados', idx, 'entradas', e.target.value)}
                            />
                          ) : (
                            Number(r.entradas || 0).toLocaleString('en-US')
                          )}
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          {activeCut && !isLocked ? (
                            <input
                              type="number"
                              className="form-input"
                              style={{ width: '100px', textAlign: 'right', margin: 0, padding: '0.35rem 0.5rem', color: 'var(--color-danger)' }}
                              value={r.salidas ?? ''}
                              onChange={(e) => handleCellEdit('congelados', idx, 'salidas', e.target.value)}
                            />
                          ) : (
                            Number(r.salidas || 0).toLocaleString('en-US')
                          )}
                        </td>
                        <td style={{ textAlign: 'right', fontWeight: 'bold' }}>
                          {activeCut && !isLocked ? (
                            <input
                              type="number"
                              className="form-input"
                              style={{ width: '110px', textAlign: 'right', margin: 0, padding: '0.35rem 0.5rem', fontWeight: 'bold' }}
                              value={r.stockFinal ?? ''}
                              onChange={(e) => handleCellEdit('congelados', idx, 'stockFinal', e.target.value)}
                            />
                          ) : (
                            Number(r.stockFinal || 0).toLocaleString('en-US')
                          )}
                        </td>
                        <td style={{ textAlign: 'center', color: 'var(--color-text-muted)', fontSize: '0.8rem' }}>
                          ${formatPrice(r.precio)}
                        </td>
                        <td style={{ textAlign: 'right', fontWeight: 'bold', color: '#2980b9' }}>
                          ${formatCurrency(r.totalMonto)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
                {congeladosRows.length > 0 && (
                  <tfoot>
                    <tr style={{ backgroundColor: 'var(--color-surface)', fontWeight: 'bold' }}>
                      <td></td>
                      <td>Totales</td>
                      <td style={{ textAlign: 'right' }}>{congTotals.invInicial.toLocaleString('en-US')}</td>
                      <td style={{ textAlign: 'right', color: 'var(--color-success)' }}>{congTotals.entradas.toLocaleString('en-US')}</td>
                      <td style={{ textAlign: 'right', color: 'var(--color-danger)' }}>{congTotals.salidas.toLocaleString('en-US')}</td>
                      <td style={{ textAlign: 'right' }}>{congTotals.stockFinal.toLocaleString('en-US')}</td>
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

      {/* =========================================================================
          TABLA 2: PRODUCTOS PREPARADOS (CESTAS - $0.038 / CESTA / DIA)
          ========================================================================= */}
      {showPreparados && (
        <div style={{ marginBottom: '2.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <div style={{ width: '12px', height: '12px', borderRadius: '3px', backgroundColor: '#27ae60' }}></div>
              <h2 style={{ fontSize: '1.1rem', fontWeight: 'bold', color: 'var(--color-text)', margin: 0 }}>
                ALMACENAMIENTO PRODUCTOS PREPARADOS
              </h2>
              <span className="badge badge-outline" style={{ fontSize: '0.75rem', borderColor: '#27ae60', color: '#27ae60' }}>
                Tarifa: $0.038 / cesta / día ($1.33 / pallet / día)
              </span>
              {activeCut && !isLocked && (
                <span className="badge badge-warning" style={{ fontSize: '0.7rem' }}>
                  ✍️ Celdas Editables (Autoguardado)
                </span>
              )}
            </div>
            <div style={{ fontSize: '0.85rem', color: 'var(--color-text-light)' }}>
              Subtotal Preparados: <strong style={{ color: '#27ae60' }}>${formatCurrency(prepTotals.totalMonto)}</strong>
            </div>
          </div>

          <div className="card" style={{ padding: 0 }}>
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
                    <th style={{ textAlign: 'center' }}>PRECIO CESTA</th>
                    <th style={{ textAlign: 'right' }}>Total $</th>
                  </tr>
                </thead>
                <tbody>
                  {preparadosRows.length === 0 ? (
                    <tr>
                      <td colSpan="8" style={{ textAlign: 'center', padding: '1.5rem', color: 'var(--color-text-light)' }}>
                        No hay movimientos de productos preparados en el período seleccionado.
                      </td>
                    </tr>
                  ) : (
                    preparadosRows.map((r, idx) => (
                      <tr key={idx}>
                        <td style={{ fontWeight: '500' }}>{formatDate(r.fecha)}</td>
                        <td>{r.descripcion}</td>
                        <td style={{ textAlign: 'right' }}>
                          {activeCut && !isLocked ? (
                            <input
                              type="number"
                              className="form-input"
                              style={{ width: '100px', textAlign: 'right', margin: 0, padding: '0.35rem 0.5rem' }}
                              value={r.stockInicial ?? ''}
                              onChange={(e) => handleCellEdit('preparados', idx, 'stockInicial', e.target.value)}
                            />
                          ) : (
                            Number(r.stockInicial || 0).toLocaleString('en-US')
                          )}
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          {activeCut && !isLocked ? (
                            <input
                              type="number"
                              className="form-input"
                              style={{ width: '100px', textAlign: 'right', margin: 0, padding: '0.35rem 0.5rem', color: 'var(--color-success)' }}
                              value={r.entradas ?? ''}
                              onChange={(e) => handleCellEdit('preparados', idx, 'entradas', e.target.value)}
                            />
                          ) : (
                            Number(r.entradas || 0).toLocaleString('en-US')
                          )}
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          {activeCut && !isLocked ? (
                            <input
                              type="number"
                              className="form-input"
                              style={{ width: '100px', textAlign: 'right', margin: 0, padding: '0.35rem 0.5rem', color: 'var(--color-danger)' }}
                              value={r.salidas ?? ''}
                              onChange={(e) => handleCellEdit('preparados', idx, 'salidas', e.target.value)}
                            />
                          ) : (
                            Number(r.salidas || 0).toLocaleString('en-US')
                          )}
                        </td>
                        <td style={{ textAlign: 'right', fontWeight: 'bold' }}>
                          {activeCut && !isLocked ? (
                            <input
                              type="number"
                              className="form-input"
                              style={{ width: '110px', textAlign: 'right', margin: 0, padding: '0.35rem 0.5rem', fontWeight: 'bold' }}
                              value={r.stockFinal ?? ''}
                              onChange={(e) => handleCellEdit('preparados', idx, 'stockFinal', e.target.value)}
                            />
                          ) : (
                            Number(r.stockFinal || 0).toLocaleString('en-US')
                          )}
                        </td>
                        <td style={{ textAlign: 'center', color: 'var(--color-text-muted)', fontSize: '0.8rem' }}>
                          ${formatPrice(r.precio)}
                        </td>
                        <td style={{ textAlign: 'right', fontWeight: 'bold', color: '#27ae60' }}>
                          ${formatCurrency(r.totalMonto)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
                {preparadosRows.length > 0 && (
                  <tfoot>
                    <tr style={{ backgroundColor: 'var(--color-surface)', fontWeight: 'bold' }}>
                      <td></td>
                      <td>Totales</td>
                      <td style={{ textAlign: 'right' }}>{prepTotals.invInicial.toLocaleString('en-US')}</td>
                      <td style={{ textAlign: 'right', color: 'var(--color-success)' }}>{prepTotals.entradas.toLocaleString('en-US')}</td>
                      <td style={{ textAlign: 'right', color: 'var(--color-danger)' }}>{prepTotals.salidas.toLocaleString('en-US')}</td>
                      <td style={{ textAlign: 'right' }}>{prepTotals.stockFinal.toLocaleString('en-US')}</td>
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

      {/* =========================================================================
          TABLA 3: SERVICIOS EXTRAORDINARIOS (MANIOBRAS, HORAS EXTRAS, TEMPERATURA)
          ========================================================================= */}
      <div style={{ marginBottom: '2.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <div style={{ width: '12px', height: '12px', borderRadius: '3px', backgroundColor: '#e67e22' }}></div>
            <h2 style={{ fontSize: '1.1rem', fontWeight: 'bold', color: 'var(--color-text)', margin: 0 }}>
              SERVICIOS EXTRA-ORDINARIOS
            </h2>
            <span className="badge badge-outline" style={{ fontSize: '0.75rem', borderColor: '#e67e22', color: '#e67e22' }}>
              Tarifas según Contrato Anexo A
            </span>
            {activeCut && !isLocked && (
              <span className="badge badge-warning" style={{ fontSize: '0.7rem' }}>
                ✍️ Celdas Editables (Autoguardado)
              </span>
            )}
          </div>
          <div style={{ fontSize: '0.85rem', color: 'var(--color-text-light)' }}>
            Total Servicios: <strong style={{ color: '#e67e22' }}>${formatCurrency(totalServicios)}</strong>
          </div>
        </div>

        <div className="card" style={{ padding: 0 }}>
          <div className="table-container" style={{ border: 'none', boxShadow: 'none' }}>
            <table>
              <thead>
                <tr style={{ backgroundColor: 'var(--color-bg)' }}>
                  <th>FECHA</th>
                  <th>DESCRIPCION</th>
                  <th style={{ textAlign: 'center' }}>TOTAL (CANT / LBS)</th>
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
                      <td>
                        {activeCut && !isLocked ? (
                          <input
                            type="text"
                            className="form-input"
                            style={{ margin: 0, padding: '0.35rem 0.5rem', width: '100%' }}
                            value={s.description || ''}
                            onChange={(e) => handleServiceCellEdit(idx, 'description', e.target.value)}
                          />
                        ) : (
                          <>{s.description} {s.ref ? `(${s.ref})` : ''}</>
                        )}
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        {activeCut && !isLocked ? (
                          <input
                            type="number"
                            step="any"
                            className="form-input"
                            style={{ width: '110px', textAlign: 'center', margin: '0 auto', padding: '0.35rem 0.5rem', fontWeight: 'bold' }}
                            value={s.quantity ?? ''}
                            onChange={(e) => handleServiceCellEdit(idx, 'quantity', e.target.value)}
                            title="Cantidad o Libras recibidas"
                          />
                        ) : (
                          Number(s.quantity).toLocaleString('en-US', { maximumFractionDigits: 2 })
                        )}
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        {activeCut && !isLocked ? (
                          <input
                            type="number"
                            step="any"
                            className="form-input"
                            style={{ width: '90px', textAlign: 'right', margin: 0, padding: '0.35rem 0.5rem' }}
                            value={s.unitPrice ?? ''}
                            onChange={(e) => handleServiceCellEdit(idx, 'unitPrice', e.target.value)}
                            title="Precio unitario o tasa por libra"
                          />
                        ) : (
                          s.unitPrice !== undefined ? `$${formatPrice(s.unitPrice)}` : `$${formatCurrency(s.value)}`
                        )}
                      </td>
                      <td style={{ textAlign: 'right', fontWeight: 'bold', color: '#e67e22' }}>
                        ${formatCurrency(s.value)}
                      </td>

                    </tr>
                  ))
                )}
              </tbody>
              {servicesData.length > 0 && (
                <tfoot>
                  <tr style={{ backgroundColor: 'var(--color-surface)', fontWeight: 'bold' }}>
                    <td></td>
                    <td>TOTALES</td>
                    <td style={{ textAlign: 'center' }}>{totalServiciosQty.toLocaleString('en-US')}</td>
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
            <span style={{ color: 'var(--color-text-light)' }}>Servicios Extraordinarios:</span>
            <strong>${formatCurrency(totalServicios)}</strong>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.6rem', borderTop: '1px solid var(--color-border)', paddingTop: '0.6rem' }}>
            <span style={{ fontWeight: '600' }}>Sub Total:</span>
            <strong>${formatCurrency(reportSubtotal)}</strong>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.6rem' }}>
            <span style={{ color: 'var(--color-text-light)' }}>IVA ({CONTRACT_INFO.ivaRate * 100}%):</span>
            <strong>${formatCurrency(reportIva)}</strong>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.85rem', paddingTop: '0.85rem', borderTop: '2px solid var(--color-primary)', fontSize: '1.15rem' }}>
            <span style={{ fontWeight: 'bold', color: 'var(--color-primary)' }}>TOTAL GENERAL:</span>
            <strong style={{ color: 'var(--color-primary)' }}>${formatCurrency(reportGrandTotal)}</strong>
          </div>
        </div>
      </div>

      {/* =========================================================================
          MODAL: CONGELAR CORTE ACTUAL
          ========================================================================= */}
      {freezeModalOpen && (
        <div className="modal-backdrop">
          <div className="modal" style={{ maxWidth: '520px' }}>
            <div className="modal-header">
              <h3 className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Snowflake size={20} style={{ color: 'var(--color-primary)' }} />
                Congelar Período de Liquidación
              </h3>
              <button className="btn btn-ghost" onClick={() => setFreezeModalOpen(false)}>
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleConfirmFreeze}>
              <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <p style={{ fontSize: '0.875rem', color: 'var(--color-text-light)', margin: 0 }}>
                  Esta acción guardará una instantánea congelada de todas las lecturas diarias de congelados, preparados y servicios extraordinarios en el rango seleccionado:
                </p>

                <div style={{
                  padding: '0.85rem',
                  backgroundColor: 'var(--color-bg)',
                  borderRadius: 'var(--radius)',
                  border: '1px solid var(--color-border)',
                  fontSize: '0.85rem',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.35rem'
                }}>
                  <div><strong>Período:</strong> {formatDate(startDate)} al {formatDate(endDate)} ({daysCount} días)</div>
                  <div><strong>Cliente:</strong> {clientName}</div>
                  <div><strong>Total Almacenaje:</strong> ${formatCurrency(reportTotalAlmacenaje)}</div>
                  <div><strong>Servicios:</strong> ${formatCurrency(totalServicios)}</div>
                  <div style={{ marginTop: '0.25rem', paddingTop: '0.25rem', borderTop: '1px dashed var(--color-border)', color: 'var(--color-primary)', fontWeight: 'bold', fontSize: '0.95rem' }}>
                    Total Liquidación: ${formatCurrency(reportGrandTotal)}
                  </div>
                </div>

                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label">Identificador / Nombre del Corte *</label>
                  <input
                    type="text"
                    className="form-input"
                    value={freezeTitle}
                    onChange={(e) => setFreezeTitle(e.target.value)}
                    placeholder="Ej. Corte Primera Quincena Agosto 2026"
                    required
                    autoFocus
                  />
                </div>

                <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
                  🔒 El corte se guardará en modo bloqueado por seguridad. Podrás desbloquearlo en cualquier momento si necesitas ajustar lecturas o fechas.
                </div>
              </div>

              <div className="modal-footer">
                <button type="button" className="btn btn-outline" onClick={() => setFreezeModalOpen(false)}>
                  Cancelar
                </button>
                <button type="submit" className="btn btn-primary" disabled={isSavingCut}>
                  {isSavingCut ? <RefreshCw size={16} className="spin" /> : <Save size={16} />}
                  <span>{isSavingCut ? 'Guardando...' : 'Confirmar y Congelar'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =========================================================================
          MODAL: HISTORIAL DE CORTES CONGELADOS
          ========================================================================= */}
      {historyModalOpen && (
        <div className="modal-backdrop">
          <div className="modal" style={{ maxWidth: '1000px', width: '95%' }}>
            <div className="modal-header">
              <h3 className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <History size={22} style={{ color: 'var(--color-primary)' }} />
                Historial de Cortes Diarios Congelados
              </h3>
              <button className="btn btn-ghost" onClick={() => setHistoryModalOpen(false)}>
                <X size={18} />
              </button>
            </div>

            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '1rem', maxHeight: '70vh', overflowY: 'auto' }}>
              {/* Buscador de cortes */}
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                <div style={{ position: 'relative', flex: 1 }}>
                  <Search size={16} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)' }} />
                  <input
                    type="text"
                    className="form-input"
                    placeholder="Buscar por título, fecha o cliente..."
                    value={historySearch}
                    onChange={(e) => setHistorySearch(e.target.value)}
                    style={{ paddingLeft: '2.25rem' }}
                  />
                </div>
                <button className="btn btn-outline" onClick={loadHistory} disabled={loadingHistory} title="Refrescar lista">
                  <RefreshCw size={16} className={loadingHistory ? 'spin' : ''} />
                </button>
              </div>

              {/* Tabla de Cortes con layout amplio */}
              {loadingHistory ? (
                <div style={{ textAlign: 'center', padding: '2.5rem' }}>
                  <div className="spin" style={{ width: '30px', height: '30px', border: '3px solid var(--color-border)', borderTopColor: 'var(--color-primary)', borderRadius: '50%', margin: '0 auto 0.75rem' }}></div>
                  <p style={{ color: 'var(--color-text-light)', fontSize: '0.85rem' }}>Cargando cortes registrados...</p>
                </div>
              ) : filteredCuts.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '2.5rem', color: 'var(--color-text-muted)', backgroundColor: 'var(--color-bg)', borderRadius: 'var(--radius)' }}>
                  <Snowflake size={36} style={{ margin: '0 auto 0.5rem', opacity: 0.4 }} />
                  <p style={{ fontWeight: '600', marginBottom: '0.25rem' }}>No se encontraron cortes congelados</p>
                  <p style={{ fontSize: '0.8rem' }}>Puedes congelar el período activo usando el botón "Congelar Período".</p>
                </div>
              ) : (
                <div className="table-container" style={{ margin: 0, overflowX: 'auto' }}>
                  <table style={{ minWidth: '850px', width: '100%' }}>
                    <thead>
                      <tr>
                        <th style={{ minWidth: '190px' }}>TÍTULO / CORTE</th>
                        <th style={{ minWidth: '150px' }}>PERÍODO</th>
                        <th style={{ minWidth: '160px' }}>CLIENTE</th>
                        <th style={{ textAlign: 'right', minWidth: '130px' }}>TOTAL FACTURADO</th>
                        <th style={{ textAlign: 'center', minWidth: '110px' }}>ESTADO</th>
                        <th style={{ textAlign: 'center', minWidth: '95px' }}>CREADO</th>
                        <th style={{ textAlign: 'center', minWidth: '140px' }}>ACCIONES</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredCuts.map((cut) => {
                        const isCurrentActive = activeCut?.id === cut.id;
                        const cutTotal = cut.totals?.totalGeneral || 0;

                        return (
                          <tr key={cut.id} style={{ backgroundColor: isCurrentActive ? 'rgba(79, 70, 229, 0.06)' : 'inherit' }}>
                            <td style={{ fontWeight: '600' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                <Snowflake size={14} style={{ color: 'var(--color-primary)' }} />
                                <span>{cut.title}</span>
                              </div>
                            </td>
                            <td style={{ fontSize: '0.825rem', whiteSpace: 'nowrap' }}>
                              {formatDate(cut.startDate)} al {formatDate(cut.endDate)}
                            </td>
                            <td style={{ fontSize: '0.825rem' }}>{cut.clientName}</td>
                            <td style={{ textAlign: 'right', fontWeight: 'bold', color: 'var(--color-primary)' }}>
                              ${formatCurrency(cutTotal)}
                            </td>
                            <td style={{ textAlign: 'center' }}>
                              <span className={`badge ${cut.isLocked ? 'badge-primary' : 'badge-warning'}`} style={{ fontSize: '0.7rem' }}>
                                {cut.isLocked ? '🔒 Bloqueado' : '🔓 Desbloqueado'}
                              </span>
                            </td>
                            <td style={{ textAlign: 'center', fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
                              {cut.created_at ? formatDate(cut.created_at) : 'Reciente'}
                            </td>
                            <td style={{ textAlign: 'center' }}>
                              <div style={{ display: 'flex', gap: '0.4rem', justifyContent: 'center', alignItems: 'center' }}>
                                <button
                                  className="btn btn-primary"
                                  style={{ padding: '0.3rem 0.65rem', fontSize: '0.75rem', whiteSpace: 'nowrap' }}
                                  onClick={() => handleSelectCutFromHistory(cut)}
                                  title="Cargar y ver datos de este corte en pantalla"
                                >
                                  <Eye size={13} /> {isCurrentActive ? 'Viendo' : 'Cargar'}
                                </button>
                                <button
                                  className="btn btn-ghost"
                                  style={{ padding: '0.3rem 0.5rem', color: 'var(--color-danger)' }}
                                  onClick={() => handleDeleteCut(cut)}
                                  title="Eliminar este corte permanentemente"
                                >
                                  <Trash2 size={14} />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="modal-footer" style={{ justifyContent: 'space-between' }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
                Total de cortes registrados: <strong>{cutsList.length}</strong>
              </div>
              <button className="btn btn-outline" onClick={() => setHistoryModalOpen(false)}>
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Summary2;
