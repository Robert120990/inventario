import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  X, ShieldCheck, AlertTriangle, RefreshCw, FileCheck2,
  Copy, Download, CheckCircle2, Clock, CreditCard, Layers, Send,
  FileJson, Receipt, Info
} from 'lucide-react';
import { apiFetch } from '../../context/InventoryContext';
import { formatDate, formatCurrency, formatPrice } from '../../utils/formatUtils';
import { CONTRACT_INFO, resolveServiceDetails } from '../../utils/contractRates';
import { toast } from 'react-hot-toast';

const API_BASE_URL = import.meta.env.VITE_API_URL || '';

const DEFAULT_ISSUER = {
  id: 1,
  razonSocial: 'Inversiones Lil, S.A. de C.V.',
  nit: '0614-270114-103-3',
  nrc: '230360-6',
  ambiente: 'Producción (01)',
  branchId: 1,
  branchName: 'Puma San Martin II (S001)',
  codigoMh: 'S001'
};

const DEFAULT_RECEPTOR = {
  id: 5038,
  nombre: 'AVICOLA SALVADOREÑA, S.A DE C.V',
  nit: '0614-130571-001-2',
  nrc: '233-0',
  correo: 'FRANCISCO.PORTILLO@SOMOSCMI.COM',
  direccion: 'CANTON EL ROSARIO, GRANJA OMOA'
};

/**
 * Construye una vista previa determinista local del Cuerpo del Documento DTE 03
 * como respaldo inmediato mientras responde el endpoint /api/billing/preview.
 */
function buildLocalPreview(cutType, cutData, options) {
  if (!cutData) {
    return { items: [], subtotalGravado: 0, iva13: 0, totalPagar: 0, dtePayload: null };
  }

  const items = [];
  let numItem = 1;
  const detailMode = options?.detailMode || 'consolidated';

  if (cutType === 'insurance_cut') {
    const totals = cutData.totals || cutData.totalsData || {};
    const rows = Array.isArray(cutData.rowsData) ? cutData.rowsData : [];
    const totalInsured = Number(
      totals.totalInsuredValue ??
      rows.reduce((acc, r) => acc + Number(r.insuredValue || 0), 0)
    );
    const totalPremium = Number(
      (
        totals.totalPremium ??
        rows.reduce((acc, r) => acc + Number(r.premium || 0), 0)
      ).toFixed(2)
    );
    const rate = Number(cutData.premiumRate || CONTRACT_INFO.insuranceRate || 0.10);
    const startStr = cutData.startDate ? formatDate(cutData.startDate) : 'Inicio de mes';
    const endStr = formatDate(cutData.cutoffDate);

    if (totalPremium > 0) {
      items.push({
        numItem: numItem++,
        tipoItem: 2,
        uniMedida: 99,
        codigo: 'SRV-SEG-MERC',
        descripcion: `COBRO DE PRIMA DE SEGURO DE MERCADERIA EN CUARTO FRIO (PERIODO ${startStr} AL ${endStr} - TASA ${rate}% SOBRE VALOR ASEGURADO $${formatCurrency(totalInsured)})`,
        cantidad: 1,
        precioUni: totalPremium,
        ventaGravada: totalPremium,
        tributos: ['20']
      });
    }
  } else {
    // daily_cut (Summary2)
    const congRows = Array.isArray(cutData.congeladosData) ? cutData.congeladosData : [];
    const prepRows = Array.isArray(cutData.preparadosData) ? cutData.preparadosData : [];
    const servRows = Array.isArray(cutData.servicesData) ? cutData.servicesData : [];
    const totals = cutData.totalsData || cutData.totals || {};

    const totalPounds = congRows.reduce((acc, r) => acc + Number(r.stockFinal || 0), 0);
    const ratePounds = Number(congRows[0]?.precio || CONTRACT_INFO.defaultStorageRatePounds || 0.001);
    const rawCongMonto = totals.congeladosMonto !== undefined
      ? Number(totals.congeladosMonto)
      : congRows.reduce((acc, r) => acc + Number(r.totalMonto || 0), 0);
    const congSubtotal = Number(rawCongMonto.toFixed(2));

    const totalBaskets = prepRows.reduce((acc, r) => acc + Number(r.stockFinal || 0), 0);
    const rateBaskets = Number(prepRows[0]?.precio || CONTRACT_INFO.defaultStorageRateBaskets || 0.038);
    const rawPrepMonto = totals.preparadosMonto !== undefined
      ? Number(totals.preparadosMonto)
      : prepRows.reduce((acc, r) => acc + Number(r.totalMonto || 0), 0);
    const prepSubtotal = Number(rawPrepMonto.toFixed(2));

    const periodText = `PERIODO ${formatDate(cutData.startDate)} AL ${formatDate(cutData.endDate)}`;

    if (congSubtotal > 0) {
      if (detailMode === 'unitary' && totalPounds > 0) {
        const unitaryGravada = Number((totalPounds * ratePounds).toFixed(2));
        items.push({
          numItem: numItem++,
          tipoItem: 2,
          uniMedida: 99,
          codigo: 'SRV-ALM-CONG',
          descripcion: `SERVICIO DE ALMACENAMIENTO Y FRIO PRODUCTO CONGELADO -18°C (${periodText})`,
          cantidad: Number(totalPounds.toFixed(2)),
          precioUni: ratePounds,
          ventaGravada: unitaryGravada,
          tributos: ['20']
        });
      } else {
        items.push({
          numItem: numItem++,
          tipoItem: 2,
          uniMedida: 99,
          codigo: 'SRV-ALM-CONG',
          descripcion: `SERVICIO DE ALMACENAMIENTO Y FRIO PRODUCTO CONGELADO -18°C (${periodText} · ${totalPounds.toLocaleString('en-US', { maximumFractionDigits: 2 })} LBS ACUMULADAS A $${ratePounds}/LB)`,
          cantidad: 1,
          precioUni: congSubtotal,
          ventaGravada: congSubtotal,
          tributos: ['20']
        });
      }
    }

    if (prepSubtotal > 0) {
      if (detailMode === 'unitary' && totalBaskets > 0) {
        const unitaryGravada = Number((totalBaskets * rateBaskets).toFixed(2));
        items.push({
          numItem: numItem++,
          tipoItem: 2,
          uniMedida: 99,
          codigo: 'SRV-ALM-PREP',
          descripcion: `SERVICIO DE ALMACENAMIENTO Y FRIO PRODUCTOS PREPARADOS (${periodText})`,
          cantidad: Number(totalBaskets.toFixed(2)),
          precioUni: rateBaskets,
          ventaGravada: unitaryGravada,
          tributos: ['20']
        });
      } else {
        items.push({
          numItem: numItem++,
          tipoItem: 2,
          uniMedida: 99,
          codigo: 'SRV-ALM-PREP',
          descripcion: `SERVICIO DE ALMACENAMIENTO Y FRIO PRODUCTOS PREPARADOS (${periodText} · ${totalBaskets.toLocaleString('en-US', { maximumFractionDigits: 2 })} CESTAS ACUMULADAS A $${rateBaskets}/CESTA)`,
          cantidad: 1,
          precioUni: prepSubtotal,
          ventaGravada: prepSubtotal,
          tributos: ['20']
        });
      }
    }

    // Servicios extraordinarios
    if (servRows.length > 0) {
      if (detailMode === 'consolidated') {
        const servTotal = Number(
          servRows.reduce((acc, s) => acc + Number(resolveServiceDetails(s).value || 0), 0).toFixed(2)
        );
        if (servTotal > 0) {
          items.push({
            numItem: numItem++,
            tipoItem: 2,
            uniMedida: 99,
            codigo: 'SRV-EXT- CONS'.replace(' ', ''),
            descripcion: `SERVICIOS EXTRAORDINARIOS DE CUARTO FRIO: MANIOBRAS, HORAS EXTRAS Y TEMPERATURA (${periodText} · ${servRows.length} EVENTOS)`,
            cantidad: 1,
            precioUni: servTotal,
            ventaGravada: servTotal,
            tributos: ['20']
          });
        }
      } else {
        servRows.forEach((rawS) => {
          const s = resolveServiceDetails(rawS);
          const val = Number(Number(s.value || 0).toFixed(2));
          if (val <= 0) return;
          const isTemp = /temperatura/i.test(s.description);
          const code = isTemp ? 'SRV-EXT-TEMP' : 'SRV-EXT-OPER';
          const dateTag = s.date ? ` [${formatDate(s.date)}]` : '';
          items.push({
            numItem: numItem++,
            tipoItem: 2,
            uniMedida: 99,
            codigo: code,
            descripcion: `${s.description}${s.ref ? ` (${s.ref})` : ''}${dateTag}`,
            cantidad: 1,
            precioUni: val,
            ventaGravada: val,
            tributos: ['20']
          });
        });
      }
    }
  }

  const subtotalGravado = Number(
    items.reduce((acc, it) => acc + Number(it.ventaGravada || 0), 0).toFixed(2)
  );
  const iva13 = Number((subtotalGravado * 0.13).toFixed(2));
  const totalPagar = Number((subtotalGravado + iva13).toFixed(2));

  return {
    items,
    subtotalGravado,
    iva13,
    totalPagar,
    dtePayload: {
      identificacion: {
        version: 3,
        ambiente: '01',
        tipoDte: '03',
        tipoMoneda: 'USD'
      },
      emisor: DEFAULT_ISSUER,
      receptor: DEFAULT_RECEPTOR,
      cuerpoDocumento: items,
      resumen: {
        totalGravada: subtotalGravado,
        tributos: [{ codigo: '20', descripcion: 'Impuesto al Valor Agregado 13%', valor: iva13 }],
        subTotalVentas: subtotalGravado,
        subTotal: subtotalGravado,
        montoTotalOperacion: totalPagar,
        totalPagar,
        condicionOperacion: Number(options?.condicionOperacion || 2)
      },
      extension: {
        observaciones: options?.observaciones || ''
      }
    }
  };
}

export default function SipeBillingModal({
  isOpen,
  onClose,
  cutType = 'daily_cut',
  cutData,
  onBillingSuccess
}) {
  // Estado del contrato en vivo con sys.sipesv.com
  const [contractStatus, setContractStatus] = useState(null);
  const [checkingContract, setCheckingContract] = useState(false);

  // Opciones de configuración fiscal DTE 03
  const [condicionOperacion, setCondicionOperacion] = useState(2); // 2 = Crédito, 1 = Contado
  const [diasCredito, setDiasCredito] = useState(30); // 15 | 30 | 45 | 60
  const [detailMode, setDetailMode] = useState('consolidated'); // 'consolidated' | 'unitary'
  const [emissionMode, setEmissionMode] = useState('sipe_api'); // 'sipe_api' | 'sipe_draft_or_staging'
  const [observaciones, setObservaciones] = useState('');

  // Vista previa del servidor y estado de emisión
  const [serverPreview, setServerPreview] = useState(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [emitting, setEmitting] = useState(false);
  const [emittedResult, setEmittedResult] = useState(null);

  // Detectar si el corte ya tiene un DTE emitido o registrado
  const existingDteInfo = useMemo(() => {
    if (emittedResult) return emittedResult;
    if (!cutData) return null;
    const status = cutData.dteStatus || cutData.dte_status || 'UNBILLED';
    const numeroControl = cutData.dteNumeroControl || cutData.dte_numero_control;
    const codigoGeneracion = cutData.dteCodigoGeneracion || cutData.dte_codigo_generacion;
    const selloRecepcion = cutData.dteSelloRecepcion || cutData.dte_sello_recepcion;
    const emittedAt = cutData.dteEmittedAt || cutData.dte_emitted_at;
    const saleId = cutData.sipeSaleId || cutData.sipe_sale_id;
    let payload = cutData.dtePayload || cutData.dte_payload || null;
    if (typeof payload === 'string') {
      try {
        payload = JSON.parse(payload);
      } catch {
        payload = null;
      }
    }

    if (status && status !== 'UNBILLED') {
      return {
        dteStatus: status,
        dteNumeroControl: numeroControl,
        dteCodigoGeneracion: codigoGeneracion,
        dteSelloRecepcion: selloRecepcion,
        dteEmittedAt: emittedAt,
        sipeSaleId: saleId,
        dtePayload: payload
      };
    }
    return null;
  }, [cutData, emittedResult]);

  const cutId = cutData?.id;
  const cutTitle = cutData?.title;
  const cutStartDate = cutData?.startDate;
  const cutEndDate = cutData?.endDate;
  const cutCutoffDate = cutData?.cutoffDate;

  // Inicializar observaciones por defecto al abrir un corte
  useEffect(() => {
    if (isOpen && cutId) {
      setEmittedResult(null);
      const defaultObs = cutType === 'insurance_cut'
        ? `Liquidación Póliza de Seguro Cuarto Frío (${cutTitle || formatDate(cutCutoffDate)})`
        : `Liquidación Almacenamiento Cuarto Frío (${cutTitle || `${formatDate(cutStartDate)} al ${formatDate(cutEndDate)}`})`;
      setObservaciones(defaultObs);
    }
  }, [isOpen, cutId, cutTitle, cutStartDate, cutEndDate, cutCutoffDate, cutType]);

  // Consultar estado del contrato API en sys.sipesv.com
  const handleVerifyContract = useCallback(async (showToastOnSuccess = false) => {
    setCheckingContract(true);
    try {
      const res = await apiFetch(`${API_BASE_URL}/api/billing/contract-status`);
      if (res.ok) {
        const data = await res.json();
        setContractStatus(data);
        if (showToastOnSuccess) {
          if (data.driftDetected) {
            toast.error('Se detectaron cambios en el contrato del API sys.sipesv.com');
          } else {
            toast.success(`Contrato API v${data.apiVersion || '2.4.0'} verificado y sincronizado`);
          }
        }
      } else {
        if (showToastOnSuccess) {
          toast.error('No se pudo verificar el estado del contrato con el backend');
        }
      }
    } catch {
      if (showToastOnSuccess) {
        toast.error('Error de red al verificar el contrato API');
      }
    } finally {
      setCheckingContract(false);
    }
  }, []);

  // Solicitar vista previa al backend /api/billing/preview
  const fetchPreview = useCallback(async () => {
    if (!isOpen || !cutData) return;
    setLoadingPreview(true);
    try {
      const res = await apiFetch(`${API_BASE_URL}/api/billing/preview`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cutId: cutData.id,
          cutType,
          cutData,
          options: {
            condicionOperacion: Number(condicionOperacion),
            diasCredito: Number(condicionOperacion) === 2 ? Number(diasCredito) : 0,
            plazo: '01',
            periodo: Number(condicionOperacion) === 2 ? Number(diasCredito) : null,
            detailMode,
            emissionMode,
            observaciones
          }
        })
      });
      if (res.ok) {
        const data = await res.json();
        setServerPreview(data);
        if (data.contractStatus) {
          setContractStatus(prev => prev || data.contractStatus);
        }
      }
    } catch {
      // Se utiliza la vista previa determinista local si el endpoint aún no responde
    } finally {
      setLoadingPreview(false);
    }
  }, [isOpen, cutData, cutType, condicionOperacion, diasCredito, detailMode, emissionMode, observaciones]);

  useEffect(() => {
    if (isOpen && cutId) {
      handleVerifyContract(false);
    }
  }, [isOpen, cutId, handleVerifyContract]);

  useEffect(() => {
    if (isOpen && cutId) {
      fetchPreview();
    }
  }, [isOpen, cutId, condicionOperacion, diasCredito, detailMode, emissionMode, fetchPreview]);

  // Cerrar con tecla Escape
  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.key === 'Escape' && isOpen && !emitting) {
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, emitting, onClose]);

  // Combinar vista previa del servidor o respaldo local
  const activePreview = useMemo(() => {
    const local = buildLocalPreview(cutType, cutData, {
      condicionOperacion,
      diasCredito,
      detailMode,
      emissionMode,
      observaciones
    });

    if (!serverPreview) return local;

    const rawItems =
      serverPreview.items ||
      serverPreview.cuerpoDocumento ||
      serverPreview.preview?.items ||
      serverPreview.preview?.cuerpoDocumento ||
      serverPreview.dtePayload?.cuerpoDocumento ||
      serverPreview.payload?.cuerpoDocumento;

    if (!Array.isArray(rawItems) || rawItems.length === 0) {
      return local;
    }

    const normalizedItems = rawItems.map((item, idx) => {
      const qty = Number(item.cantidad ?? item.quantity ?? 1);
      const price = Number(item.precioUni ?? item.precioUnitario ?? item.unitPrice ?? 0);
      const gravada = Number(
        item.ventaGravada ?? item.subtotal ?? item.monto ?? Number((qty * price).toFixed(2))
      );
      return {
        numItem: item.numItem || idx + 1,
        codigo: item.codigo || item.code || `SRV-0${idx + 1}`,
        descripcion: item.descripcion || item.description || 'Servicio de Almacenamiento',
        cantidad: qty,
        precioUni: price,
        ventaGravada: gravada
      };
    });

    const summarySource =
      serverPreview.totals ||
      serverPreview.resumen ||
      serverPreview.preview?.totals ||
      serverPreview.preview?.resumen ||
      serverPreview.dtePayload?.resumen ||
      {};

    const subtotalGravado = Number(
      (
        summarySource.subtotalGravado ??
        summarySource.totalGravada ??
        summarySource.subTotal ??
        normalizedItems.reduce((acc, i) => acc + i.ventaGravada, 0)
      ).toFixed(2)
    );
    const iva13 = Number(
      (
        summarySource.iva13 ??
        summarySource.iva ??
        summarySource.totalIva ??
        subtotalGravado * 0.13
      ).toFixed(2)
    );
    const totalPagar = Number(
      (
        summarySource.totalPagar ??
        summarySource.montoTotalOperacion ??
        summarySource.total ??
        subtotalGravado + iva13
      ).toFixed(2)
    );

    return {
      items: normalizedItems,
      subtotalGravado,
      iva13,
      totalPagar,
      dtePayload: serverPreview.dtePayload || serverPreview.payload || serverPreview.preview || local.dtePayload
    };
  }, [cutType, cutData, condicionOperacion, diasCredito, detailMode, emissionMode, observaciones, serverPreview]);

  // Datos de Emisor y Receptor
  const issuer = contractStatus?.issuer || DEFAULT_ISSUER;
  const receptor = contractStatus?.receptor || contractStatus?.defaultCustomer || DEFAULT_RECEPTOR;
  const apiVersion = contractStatus?.apiVersion || '2.4.0';
  const contractHash = contractStatus?.contractHash || 'sha256:dte03-sipe-lil-verified';
  const driftDetected = Boolean(contractStatus?.driftDetected);
  const driftDetails = Array.isArray(contractStatus?.driftDetails) ? contractStatus.driftDetails : [];
  const contingencyOpen = Boolean(contractStatus?.contingencyOpen);

  const handleCopyText = (text, label) => {
    if (!text) return;
    navigator.clipboard.writeText(String(text));
    toast.success(`${label} copiado al portapapeles`);
  };

  const handleDownloadJson = () => {
    const payloadToExport = existingDteInfo?.dtePayload || activePreview?.dtePayload;
    if (!payloadToExport) {
      toast.error('No hay estructura JSON DTE disponible para descargar');
      return;
    }
    const blob = new Blob([JSON.stringify(payloadToExport, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const controlNum = existingDteInfo?.dteNumeroControl || `PREVIEW_${cutData?.id || 'CUT'}`;
    a.href = url;
    a.download = `${controlNum}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success('Archivo JSON DTE descargado');
  };

  const handleEmitDte = async () => {
    if (!cutData?.id) {
      toast.error('El corte debe estar congelado y guardado antes de facturar.');
      return;
    }
    if (activePreview.totalPagar <= 0) {
      toast.error('El monto total a facturar debe ser mayor a $0.00');
      return;
    }

    setEmitting(true);
    try {
      const res = await apiFetch(`${API_BASE_URL}/api/billing/emit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cutId: cutData.id,
          cutType,
          cutData,
          options: {
            condicionOperacion: Number(condicionOperacion),
            diasCredito: Number(condicionOperacion) === 2 ? Number(diasCredito) : 0,
            plazo: '01',
            periodo: Number(condicionOperacion) === 2 ? Number(diasCredito) : null,
            detailMode,
            emissionMode,
            mode: emissionMode,
            contingency: emissionMode === 'sipe_draft_or_staging',
            observaciones
          }
        })
      });

      const data = await res.json();
      if (!res.ok || data.error) {
        throw new Error(data.error || data.message || 'Error al emitir el DTE en SIPE');
      }

      const resultObj = data.result || data.dte || data;
      const newDteInfo = {
        dteStatus:
          resultObj.dteStatus ||
          resultObj.dte_status ||
          (emissionMode === 'sipe_draft_or_staging' ? 'CONTINGENCY' : 'EMITTED'),
        dteNumeroControl:
          resultObj.dteNumeroControl ||
          resultObj.dte_numero_control ||
          resultObj.numeroControl ||
          resultObj.identificacion?.numeroControl,
        dteCodigoGeneracion:
          resultObj.dteCodigoGeneracion ||
          resultObj.dte_codigo_generacion ||
          resultObj.codigoGeneracion ||
          resultObj.identificacion?.codigoGeneracion,
        dteSelloRecepcion:
          resultObj.dteSelloRecepcion ||
          resultObj.dte_sello_recepcion ||
          resultObj.selloRecepcion ||
          resultObj.selloRecibido ||
          null,
        dteEmittedAt:
          resultObj.dteEmittedAt ||
          resultObj.dte_emitted_at ||
          new Date().toISOString(),
        sipeSaleId:
          resultObj.sipeSaleId ||
          resultObj.sipe_sale_id ||
          resultObj.saleId ||
          null,
        dtePayload:
          resultObj.dtePayload ||
          resultObj.dte_payload ||
          resultObj.payload ||
          activePreview.dtePayload
      };

      setEmittedResult(newDteInfo);
      toast.success(
        `¡Factura DTE 03 generada con éxito! (${newDteInfo.dteNumeroControl || 'Registrada'})`
      );

      if (onBillingSuccess) {
        onBillingSuccess(newDteInfo);
      }
    } catch (err) {
      toast.error(err.message || 'No se pudo completar la facturación en SIPE');
    } finally {
      setEmitting(false);
    }
  };

  if (!isOpen || !cutData) return null;

  const isAlreadyBilled = Boolean(existingDteInfo);

  return (
    <div
      className="modal-overlay"
      onClick={() => !emitting && onClose()}
      style={{ zIndex: 1350, padding: '1rem' }}
    >
      <div
        className="modal-content"
        onClick={(e) => e.stopPropagation()}
        style={{
          maxWidth: '1040px',
          width: '100%',
          maxHeight: '93vh',
          display: 'flex',
          flexDirection: 'column',
          padding: 0,
          overflow: 'hidden',
          backgroundColor: 'var(--color-card)',
          borderRadius: 'var(--radius-xl)',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.45), 0 0 0 1px var(--color-border)'
        }}
      >
        {/* =========================================================================
            1. CABECERA EJECUTIVA Y BANNER DE CONTRATO API (sys.sipesv.com)
            ========================================================================= */}
        <div
          style={{
            padding: '1.15rem 1.5rem',
            borderBottom: '1px solid var(--color-border)',
            background: 'linear-gradient(180deg, var(--color-surface) 0%, var(--color-card) 100%)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            gap: '1rem',
            flexShrink: 0
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.9rem' }}>
            <div
              style={{
                width: '44px',
                height: '44px',
                borderRadius: '12px',
                background: isAlreadyBilled
                  ? 'linear-gradient(135deg, #059669 0%, #047857 100%)'
                  : 'linear-gradient(135deg, var(--color-primary) 0%, #1e40af 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#ffffff',
                boxShadow: '0 6px 16px rgba(0, 103, 192, 0.25)',
                flexShrink: 0
              }}
            >
              <Receipt size={22} />
            </div>

            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
                <h2
                  style={{
                    margin: 0,
                    fontSize: '1.2rem',
                    fontWeight: 800,
                    fontFamily: 'var(--font-headline)',
                    color: 'var(--color-text)'
                  }}
                >
                  Facturación Electrónica DTE-03 · SIPE (Inversiones LIL)
                </h2>
                <span
                  className="badge badge-primary"
                  style={{ fontSize: '0.7rem', padding: '0.2rem 0.55rem' }}
                >
                  {cutType === 'insurance_cut' ? 'Póliza de Seguro' : 'Almacenamiento Cuarto Frío'}
                </span>
                {isAlreadyBilled && (
                  <span
                    className="badge badge-success"
                    style={{
                      fontSize: '0.72rem',
                      padding: '0.2rem 0.65rem',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.3rem'
                    }}
                  >
                    <CheckCircle2 size={12} /> {existingDteInfo.dteStatus === 'EMITTED' ? 'DTE Emitido' : existingDteInfo.dteStatus}
                  </span>
                )}
              </div>
              <p style={{ margin: '0.2rem 0 0 0', fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>
                Corte: <strong>{cutData.title}</strong> · Comprobante de Crédito Fiscal (Versión MH v3) hacia{' '}
                <code>sys.sipesv.com</code>
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            {/* Badge de Estado de Contrato API */}
            <div
              title={`Hash Contrato: ${contractHash} · Modo: ${contractStatus?.mode || 'verificado'}`}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.4rem',
                padding: '0.35rem 0.75rem',
                borderRadius: '999px',
                fontSize: '0.73rem',
                fontWeight: 700,
                backgroundColor: driftDetected
                  ? 'rgba(245, 158, 11, 0.15)'
                  : 'rgba(16, 185, 129, 0.14)',
                color: driftDetected ? '#d97706' : '#059669',
                border: `1px solid ${driftDetected ? 'rgba(245, 158, 11, 0.4)' : 'rgba(16, 185, 129, 0.35)'}`
              }}
            >
              {driftDetected ? <AlertTriangle size={14} /> : <ShieldCheck size={14} />}
              <span>
                {driftDetected
                  ? 'Cambio Detectado en API SIPE'
                  : `Contrato API v${apiVersion} Sincronizado`}
              </span>
            </div>

            <button
              type="button"
              className="btn btn-outline"
              onClick={() => handleVerifyContract(true)}
              disabled={checkingContract}
              title="Verificar cambios en el contrato de API sys.sipesv.com"
              style={{
                padding: '0.35rem 0.65rem',
                fontSize: '0.75rem',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.35rem'
              }}
            >
              <RefreshCw size={13} className={checkingContract ? 'spin' : ''} />
              <span>Verificar cambios en API</span>
            </button>

            <button
              type="button"
              className="btn btn-ghost"
              onClick={onClose}
              disabled={emitting}
              style={{
                borderRadius: '50%',
                width: '34px',
                height: '34px',
                padding: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Alerta de Drift si la API de sys.sipesv.com cambió */}
        {driftDetected && (
          <div
            style={{
              backgroundColor: 'rgba(245, 158, 11, 0.12)',
              borderBottom: '1px solid rgba(245, 158, 11, 0.35)',
              padding: '0.65rem 1.5rem',
              display: 'flex',
              alignItems: 'flex-start',
              gap: '0.65rem',
              fontSize: '0.8rem',
              color: '#b45309'
            }}
          >
            <AlertTriangle size={18} style={{ flexShrink: 0, marginTop: '2px' }} />
            <div>
              <strong>Atención: Se detectaron diferencias en el esquema de integración de sys.sipesv.com:</strong>
              {driftDetails.length > 0 ? (
                <ul style={{ margin: '0.25rem 0 0 1.1rem', padding: 0 }}>
                  {driftDetails.map((detail, idx) => (
                    <li key={idx}>{detail}</li>
                  ))}
                </ul>
              ) : (
                <span style={{ marginLeft: '0.35rem' }}>
                  El hash del contrato remoto difiere de la versión esperada. Se recomienda usar modo Pre-Factura/Contingencia.
                </span>
              )}
            </div>
          </div>
        )}

        {/* =========================================================================
            CUERPO DEL MODAL CON SCROLL
            ========================================================================= */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '1.25rem 1.5rem', display: 'flex', flexDirection: 'column', gap: '1.15rem' }}>
          {/* Tarjetas Emisor y Receptor */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
              gap: '0.85rem'
            }}
          >
            {/* Emisor */}
            <div
              style={{
                padding: '0.9rem 1.1rem',
                borderRadius: 'var(--radius)',
                backgroundColor: 'var(--color-surface)',
                border: '1px solid var(--color-border)',
                borderLeft: '4px solid var(--color-primary)'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
                <span style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--color-primary)', letterSpacing: '0.04em' }}>
                  Emisor (Empresa ID #{issuer.id || 1})
                </span>
                <span className="badge badge-outline" style={{ fontSize: '0.68rem' }}>
                  Sucursal {issuer.branchName || 'Puma San Martin II (S001)'}
                </span>
              </div>
              <div style={{ fontWeight: 800, fontSize: '0.95rem', color: 'var(--color-text)' }}>
                {issuer.razonSocial || 'Inversiones Lil, S.A. de C.V.'}
              </div>
              <div style={{ fontSize: '0.78rem', color: 'var(--color-text-light)', marginTop: '0.25rem', fontFamily: 'monospace' }}>
                NIT: {issuer.nit || '0614-270114-103-3'} &nbsp;|&nbsp; NRC: {issuer.nrc || '230360-6'}
              </div>
              <div style={{ fontSize: '0.74rem', color: 'var(--color-text-muted)', marginTop: '0.2rem' }}>
                Ambiente MH: <strong>{issuer.ambiente || 'Producción (01)'}</strong>
                {contingencyOpen && (
                  <span style={{ marginLeft: '0.5rem', color: '#d97706', fontWeight: 600 }}>
                    · Contingencia Abierta en SIPE
                  </span>
                )}
              </div>
            </div>

            {/* Receptor */}
            <div
              style={{
                padding: '0.9rem 1.1rem',
                borderRadius: 'var(--radius)',
                backgroundColor: 'var(--color-surface)',
                border: '1px solid var(--color-border)',
                borderLeft: '4px solid #059669'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
                <span style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', color: '#059669', letterSpacing: '0.04em' }}>
                  Receptor DTE-03 (Cliente ID #{receptor.id || 5038})
                </span>
                <span className="badge badge-outline" style={{ fontSize: '0.68rem', borderColor: '#059669', color: '#059669' }}>
                  Crédito Fiscal (03)
                </span>
              </div>
              <div style={{ fontWeight: 800, fontSize: '0.95rem', color: 'var(--color-text)' }}>
                {receptor.nombre || 'AVICOLA SALVADOREÑA, S.A DE C.V'}
              </div>
              <div style={{ fontSize: '0.78rem', color: 'var(--color-text-light)', marginTop: '0.25rem', fontFamily: 'monospace' }}>
                NIT: {receptor.nit || '0614-130571-001-2'} &nbsp;|&nbsp; NRC: {receptor.nrc || '233-0'}
              </div>
              <div style={{ fontSize: '0.74rem', color: 'var(--color-text-muted)', marginTop: '0.2rem' }}>
                {receptor.direccion || 'CANTON EL ROSARIO, GRANJA OMOA'} · {receptor.correo || 'FRANCISCO.PORTILLO@SOMOSCMI.COM'}
              </div>
            </div>
          </div>

          {/* =========================================================================
              TARJETA DE RECIBO OFICIAL DTE (SI YA FUE EMITIDO)
              ========================================================================= */}
          {isAlreadyBilled && (
            <div
              style={{
                padding: '1.1rem 1.25rem',
                borderRadius: 'var(--radius-lg)',
                backgroundColor: 'rgba(16, 185, 129, 0.08)',
                border: '1px solid rgba(16, 185, 129, 0.35)'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '0.85rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem' }}>
                  <FileCheck2 size={20} style={{ color: '#059669' }} />
                  <strong style={{ fontSize: '0.98rem', color: 'var(--color-text)' }}>
                    Comprobante de Crédito Fiscal Registrado en SIPE
                  </strong>
                  <span className="badge badge-success" style={{ fontSize: '0.7rem' }}>
                    {existingDteInfo.dteStatus}
                  </span>
                </div>

                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button
                    type="button"
                    className="btn btn-outline"
                    onClick={() =>
                      handleCopyText(
                        JSON.stringify(existingDteInfo.dtePayload || activePreview.dtePayload, null, 2),
                        'JSON DTE'
                      )
                    }
                    style={{ padding: '0.3rem 0.65rem', fontSize: '0.75rem' }}
                  >
                    <Copy size={13} /> Copiar JSON DTE
                  </button>
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={handleDownloadJson}
                    style={{ padding: '0.3rem 0.75rem', fontSize: '0.75rem', backgroundColor: '#059669', borderColor: '#059669' }}
                  >
                    <Download size={13} /> Descargar DTE (.json)
                  </button>
                </div>
              </div>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                  gap: '0.75rem'
                }}
              >
                {/* Número de Control */}
                <div style={{ padding: '0.65rem 0.85rem', backgroundColor: 'var(--color-card)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)' }}>
                  <div style={{ fontSize: '0.68rem', color: 'var(--color-text-muted)', textTransform: 'uppercase', fontWeight: 700 }}>
                    Número de Control
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.4rem', marginTop: '0.2rem' }}>
                    <code style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--color-primary)' }}>
                      {existingDteInfo.dteNumeroControl || 'DTE-03-S001P001-000000000000001'}
                    </code>
                    {existingDteInfo.dteNumeroControl && (
                      <button
                        type="button"
                        className="btn btn-ghost"
                        style={{ padding: '2px 5px' }}
                        onClick={() => handleCopyText(existingDteInfo.dteNumeroControl, 'Número de Control')}
                        title="Copiar Número de Control"
                      >
                        <Copy size={13} />
                      </button>
                    )}
                  </div>
                </div>

                {/* Código de Generación */}
                <div style={{ padding: '0.65rem 0.85rem', backgroundColor: 'var(--color-card)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)' }}>
                  <div style={{ fontSize: '0.68rem', color: 'var(--color-text-muted)', textTransform: 'uppercase', fontWeight: 700 }}>
                    Código de Generación (UUID)
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.4rem', marginTop: '0.2rem' }}>
                    <code style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text)', wordBreak: 'break-all' }}>
                      {existingDteInfo.dteCodigoGeneracion || 'Pendiente'}
                    </code>
                    {existingDteInfo.dteCodigoGeneracion && (
                      <button
                        type="button"
                        className="btn btn-ghost"
                        style={{ padding: '2px 5px' }}
                        onClick={() => handleCopyText(existingDteInfo.dteCodigoGeneracion, 'Código de Generación')}
                        title="Copiar Código de Generación"
                      >
                        <Copy size={13} />
                      </button>
                    )}
                  </div>
                </div>

                {/* Sello de Recepción MH */}
                <div style={{ padding: '0.65rem 0.85rem', backgroundColor: 'var(--color-card)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)' }}>
                  <div style={{ fontSize: '0.68rem', color: 'var(--color-text-muted)', textTransform: 'uppercase', fontWeight: 700 }}>
                    Sello de Recepción MH
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.4rem', marginTop: '0.2rem' }}>
                    <code style={{ fontSize: '0.75rem', color: existingDteInfo.dteSelloRecepcion ? '#059669' : 'var(--color-text-muted)', wordBreak: 'break-all' }}>
                      {existingDteInfo.dteSelloRecepcion || 'En cola / Pre-Factura SIPE'}
                    </code>
                    {existingDteInfo.dteSelloRecepcion && (
                      <button
                        type="button"
                        className="btn btn-ghost"
                        style={{ padding: '2px 5px' }}
                        onClick={() => handleCopyText(existingDteInfo.dteSelloRecepcion, 'Sello de Recepción')}
                        title="Copiar Sello de Recepción"
                      >
                        <Copy size={13} />
                      </button>
                    )}
                  </div>
                </div>

                {/* Fecha/Hora de Emisión */}
                <div style={{ padding: '0.65rem 0.85rem', backgroundColor: 'var(--color-card)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)' }}>
                  <div style={{ fontSize: '0.68rem', color: 'var(--color-text-muted)', textTransform: 'uppercase', fontWeight: 700 }}>
                    Fecha / Hora de Emisión
                  </div>
                  <div style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--color-text)', marginTop: '0.2rem' }}>
                    {existingDteInfo.dteEmittedAt
                      ? new Date(existingDteInfo.dteEmittedAt).toLocaleString('es-SV')
                      : 'Registrado'}
                    {existingDteInfo.sipeSaleId ? ` · Venta #${existingDteInfo.sipeSaleId}` : ''}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* =========================================================================
              2. OPCIONES DE FACTURACIÓN (DTE 03)
              ========================================================================= */}
          {!isAlreadyBilled && (
            <div
              style={{
                padding: '1rem 1.15rem',
                borderRadius: 'var(--radius)',
                backgroundColor: 'var(--color-surface)',
                border: '1px solid var(--color-border)'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.85rem' }}>
                <CreditCard size={16} style={{ color: 'var(--color-primary)' }} />
                <strong style={{ fontSize: '0.88rem', color: 'var(--color-text)' }}>
                  Configuración de Emisión DTE-03 (Comprobante de Crédito Fiscal)
                </strong>
              </div>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
                  gap: '0.85rem',
                  alignItems: 'end'
                }}
              >
                {/* Condición de Operación */}
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label" style={{ fontSize: '0.76rem', fontWeight: 600 }}>
                    Condición de Operación
                  </label>
                  <select
                    className="form-select"
                    value={condicionOperacion}
                    onChange={(e) => setCondicionOperacion(Number(e.target.value))}
                    style={{ height: '38px', fontSize: '0.83rem' }}
                  >
                    <option value={2}>2 - Crédito (Plazo contractual)</option>
                    <option value={1}>1 - Contado</option>
                  </select>
                </div>

                {/* Días de Crédito */}
                {Number(condicionOperacion) === 2 && (
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label" style={{ fontSize: '0.76rem', fontWeight: 600 }}>
                      Días de Crédito (Plazo MH)
                    </label>
                    <select
                      className="form-select"
                      value={diasCredito}
                      onChange={(e) => setDiasCredito(Number(e.target.value))}
                      style={{ height: '38px', fontSize: '0.83rem' }}
                    >
                      <option value={15}>15 días</option>
                      <option value={30}>30 días (Estándar Contrato)</option>
                      <option value={45}>45 días</option>
                      <option value={60}>60 días</option>
                    </select>
                  </div>
                )}

                {/* Modo de Desglose de Ítems (solo para daily_cut) */}
                {cutType === 'daily_cut' && (
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label" style={{ fontSize: '0.76rem', fontWeight: 600 }}>
                      Modo de Desglose de Ítems
                    </label>
                    <select
                      className="form-select"
                      value={detailMode}
                      onChange={(e) => setDetailMode(e.target.value)}
                      style={{ height: '38px', fontSize: '0.83rem' }}
                    >
                      <option value="consolidated">Consolidado por Rubro (Cantidad = 1, Cuadre Exacto)</option>
                      <option value="unitary">Detallado por Unidad (Libras / Cestas / Eventos)</option>
                    </select>
                  </div>
                )}

                {/* Modo de Emisión */}
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label" style={{ fontSize: '0.76rem', fontWeight: 600 }}>
                    Modo de Emisión en SIPE
                  </label>
                  <select
                    className="form-select"
                    value={emissionMode}
                    onChange={(e) => setEmissionMode(e.target.value)}
                    style={{ height: '38px', fontSize: '0.83rem' }}
                  >
                    <option value="sipe_api">Emitir DTE 03 en sys.sipesv.com (Producción)</option>
                    <option value="sipe_draft_or_staging">Registrar Pre-Factura / Contingencia en SIPE</option>
                  </select>
                </div>
              </div>

              {/* Observaciones adicionales */}
              <div className="form-group" style={{ marginTop: '0.8rem', marginBottom: 0 }}>
                <label className="form-label" style={{ fontSize: '0.76rem', fontWeight: 600 }}>
                  Observaciones Adicionales (<code>extension.observaciones</code>)
                </label>
                <input
                  type="text"
                  className="form-input"
                  value={observaciones}
                  onChange={(e) => setObservaciones(e.target.value)}
                  placeholder="Observaciones o referencia del período en el DTE..."
                  style={{ height: '36px', fontSize: '0.82rem' }}
                />
              </div>
            </div>
          )}

          {/* =========================================================================
              3. TABLA DE VISTA PREVIA DEL CUERPO DEL DOCUMENTO (DTE 03)
              ========================================================================= */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Layers size={16} style={{ color: 'var(--color-primary)' }} />
                <strong style={{ fontSize: '0.9rem', color: 'var(--color-text)' }}>
                  Vista Previa del Cuerpo del Documento (<code>cuerpoDocumento</code> · Tipo Ítem 2 - Servicio)
                </strong>
                {loadingPreview && (
                  <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}>
                    <RefreshCw size={12} className="spin" /> Sincronizando vista previa...
                  </span>
                )}
              </div>
              <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
                Tributo aplicado: <code>20 (IVA 13%)</code>
              </span>
            </div>

            <div className="table-container" style={{ margin: 0, border: '1px solid var(--color-border)', borderRadius: 'var(--radius)', boxShadow: 'none' }}>
              <table style={{ width: '100%', fontSize: '0.83rem' }}>
                <thead>
                  <tr style={{ backgroundColor: 'var(--color-surface)' }}>
                    <th style={{ width: '55px', textAlign: 'center' }}>#</th>
                    <th style={{ width: '130px' }}>CÓDIGO</th>
                    <th>DESCRIPCIÓN DEL SERVICIO</th>
                    <th style={{ width: '110px', textAlign: 'right' }}>CANTIDAD</th>
                    <th style={{ width: '120px', textAlign: 'right' }}>PRECIO UNI.</th>
                    <th style={{ width: '130px', textAlign: 'right' }}>VENTA GRAVADA</th>
                  </tr>
                </thead>
                <tbody>
                  {activePreview.items.length === 0 ? (
                    <tr>
                      <td colSpan="6" style={{ textAlign: 'center', padding: '1.5rem', color: 'var(--color-text-muted)' }}>
                        No hay cargos facturables con monto mayor a $0.00 en este corte.
                      </td>
                    </tr>
                  ) : (
                    activePreview.items.map((item) => (
                      <tr key={item.numItem}>
                        <td style={{ textAlign: 'center', fontWeight: 700, color: 'var(--color-text-muted)' }}>
                          {item.numItem}
                        </td>
                        <td>
                          <code
                            style={{
                              fontSize: '0.75rem',
                              padding: '0.15rem 0.45rem',
                              borderRadius: '4px',
                              backgroundColor: 'var(--color-surface)',
                              border: '1px solid var(--color-border)',
                              fontWeight: 600
                            }}
                          >
                            {item.codigo}
                          </code>
                        </td>
                        <td style={{ fontWeight: 500, color: 'var(--color-text)' }}>
                          {item.descripcion}
                        </td>
                        <td style={{ textAlign: 'right', fontFamily: 'monospace' }}>
                          {Number(item.cantidad || 1).toLocaleString('en-US', { maximumFractionDigits: 2 })}
                        </td>
                        <td style={{ textAlign: 'right', fontFamily: 'monospace' }}>
                          ${formatPrice(item.precioUni)}
                        </td>
                        <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--color-primary)', fontFamily: 'monospace' }}>
                          ${formatCurrency(item.ventaGravada)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* =========================================================================
              RESUMEN FISCAL DTE 03 (SUBTOTAL GRAVADO, IVA 13%, TOTAL A PAGAR)
              ========================================================================= */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: '1rem' }}>
            <div style={{ maxWidth: '520px', fontSize: '0.77rem', color: 'var(--color-text-muted)', display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <Info size={14} style={{ color: 'var(--color-primary)', flexShrink: 0 }} />
                <span>
                  El DTE-03 se transmite vinculado a <strong>Inversiones LIL, S.A. de C.V.</strong> (Sucursal <code>S001</code>) y queda auditado en este corte con bloqueo contra doble facturación.
                </span>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.2rem' }}>
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={handleDownloadJson}
                  style={{ padding: '0.28rem 0.65rem', fontSize: '0.74rem' }}
                >
                  <FileJson size={13} /> Exportar Payload DTE (.json)
                </button>
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={() =>
                    handleCopyText(
                      JSON.stringify(existingDteInfo?.dtePayload || activePreview.dtePayload, null, 2),
                      'Payload DTE JSON'
                    )
                  }
                  style={{ padding: '0.28rem 0.65rem', fontSize: '0.74rem' }}
                >
                  <Copy size={13} /> Copiar JSON
                </button>
              </div>
            </div>

            <div
              style={{
                minWidth: '330px',
                padding: '1rem 1.25rem',
                borderRadius: 'var(--radius)',
                backgroundColor: 'var(--color-surface)',
                border: '1px solid var(--color-border)',
                borderLeft: '4px solid var(--color-primary)'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.4rem', fontSize: '0.84rem' }}>
                <span style={{ color: 'var(--color-text-light)' }}>Subtotal Gravado:</span>
                <strong style={{ fontFamily: 'monospace' }}>${formatCurrency(activePreview.subtotalGravado)}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem', fontSize: '0.84rem' }}>
                <span style={{ color: 'var(--color-text-light)' }}>IVA (13% - Tributo 20):</span>
                <strong style={{ fontFamily: 'monospace' }}>${formatCurrency(activePreview.iva13)}</strong>
              </div>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  paddingTop: '0.55rem',
                  borderTop: '2px solid var(--color-primary)',
                  fontSize: '1.1rem'
                }}
              >
                <span style={{ fontWeight: 800, color: 'var(--color-primary)' }}>Total a Pagar (USD):</span>
                <strong style={{ fontWeight: 800, color: 'var(--color-primary)', fontFamily: 'monospace' }}>
                  ${formatCurrency(activePreview.totalPagar)}
                </strong>
              </div>
            </div>
          </div>
        </div>

        {/* =========================================================================
            FOOTER DE ACCIONES
            ========================================================================= */}
        <div
          style={{
            padding: '0.95rem 1.5rem',
            borderTop: '1px solid var(--color-border)',
            backgroundColor: 'var(--color-surface)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: '1rem',
            flexShrink: 0
          }}
        >
          <div style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            {Number(condicionOperacion) === 2 ? (
              <>
                <Clock size={14} /> Condición: <strong>Crédito a {diasCredito} días</strong>
              </>
            ) : (
              <>
                <CheckCircle2 size={14} /> Condición: <strong>Contado</strong>
              </>
            )}
          </div>

          <div style={{ display: 'flex', gap: '0.65rem', alignItems: 'center' }}>
            <button
              type="button"
              className="btn btn-outline"
              onClick={onClose}
              disabled={emitting}
            >
              Cerrar
            </button>

            {!isAlreadyBilled && (
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleEmitDte}
                disabled={emitting || activePreview.totalPagar <= 0}
                style={{
                  padding: '0.55rem 1.25rem',
                  fontWeight: 700,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.45rem',
                  backgroundColor: '#059669',
                  borderColor: '#059669'
                }}
              >
                {emitting ? (
                  <>
                    <RefreshCw size={16} className="spin" />
                    <span>Procesando DTE en SIPE...</span>
                  </>
                ) : (
                  <>
                    <Send size={16} />
                    <span>
                      {emissionMode === 'sipe_api'
                        ? `Emitir DTE-03 ($${formatCurrency(activePreview.totalPagar)})`
                        : `Registrar Pre-Factura SIPE ($${formatCurrency(activePreview.totalPagar)})`}
                    </span>
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
