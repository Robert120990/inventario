import React, { useState, useEffect, useMemo } from 'react';
import {
  X,
  Printer,
  FileOutput,
  Edit3,
  ArrowDownCircle,
  ArrowUpCircle,
  Truck,
  FileText,
  Package,
  Scale,
  ThermometerSnowflake,
  Layers,
  Wrench,
  Clock
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { useInventory } from '../../context/InventoryContext';
import { formatCurrency, formatPrice } from '../../utils/formatUtils';
import {
  buildMovementNoteData,
  formatMovementPounds,
  printMovementNote,
  downloadMovementNotePdf,
  downloadMovementNoteWord
} from '../../utils/movementNotePrinter';

const MovementDetailModal = ({ movement, onClose, onEdit, allowEdit = false, syncState = 'synced', syncError = '' }) => {
  const { products, settings, contractRates } = useInventory();
  const [observations, setObservations] = useState('');
  const [includeServices, setIncludeServices] = useState(true);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);

  // Cerrar modal con tecla Escape
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const noteData = useMemo(() => {
    if (!movement) return null;
    return buildMovementNoteData({
      movement,
      products,
      settings,
      contractRates,
      observations,
      includeServices
    });
  }, [movement, products, settings, contractRates, observations, includeServices]);

  if (!movement || !noteData) return null;

  const { isExit, totals } = noteData;

  const handlePrint = () => {
    try {
      const res = printMovementNote({
        movement,
        products,
        settings,
        contractRates,
        observations,
        includeServices
      });
      if (res?.success) {
        toast.success(`Preparando impresión de ${noteData.noteShortLabel}`);
      } else {
        toast.error(res?.message || 'No se pudo abrir la ventana de impresión');
      }
    } catch (err) {
      console.error('Error al imprimir nota:', err);
      toast.error('Error al imprimir: ' + err.message);
    }
  };

  const handleDownloadPdf = async () => {
    setIsGeneratingPdf(true);
    try {
      await downloadMovementNotePdf({
        movement,
        products,
        settings,
        contractRates,
        observations,
        includeServices
      });
      toast.success(`${noteData.noteShortLabel} descargada en PDF`);
    } catch (err) {
      console.error('Error al generar PDF:', err);
      toast.error('Error al generar PDF: ' + err.message);
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  const handleDownloadWord = () => {
    try {
      downloadMovementNoteWord({
        movement,
        products,
        settings,
        contractRates,
        observations,
        includeServices
      });
      toast.success(`${noteData.noteShortLabel} descargada en Word (.doc)`);
    } catch (err) {
      console.error('Error al generar Word:', err);
      toast.error('Error al generar Word: ' + err.message);
    }
  };

  const headerGradient = isExit
    ? 'linear-gradient(135deg, var(--color-primary) 0%, #1e3a8a 100%)'
    : 'linear-gradient(135deg, #059669 0%, #065f46 100%)';

  const headerShadow = isExit
    ? '0 6px 16px rgba(0, 103, 192, 0.28)'
    : '0 6px 16px rgba(5, 150, 105, 0.28)';

  return (
    <div className="modal-overlay" onClick={onClose} style={{ zIndex: 1200, padding: '0.85rem' }}>
      <div
        className="modal-content large"
        style={{
          maxWidth: '980px',
          width: '100%',
          maxHeight: '94vh',
          display: 'flex',
          flexDirection: 'column',
          padding: 0,
          overflow: 'hidden',
          backgroundColor: 'var(--color-card)',
          borderRadius: 'var(--radius-xl)',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.35), 0 0 0 1px var(--color-border)'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* 1. HEADER CON ISOTIPO EN GRADIENTE Y METADATOS */}
        <div
          style={{
            padding: '0.95rem 1.35rem',
            borderBottom: '1px solid var(--color-border)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: '1rem',
            background: 'linear-gradient(180deg, var(--color-surface) 0%, var(--color-card) 100%)',
            flexShrink: 0
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
            <div
              style={{
                width: '46px',
                height: '46px',
                borderRadius: '12px',
                background: headerGradient,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#ffffff',
                boxShadow: headerShadow,
                flexShrink: 0
              }}
            >
              {isExit ? <ArrowUpCircle size={24} /> : <ArrowDownCircle size={24} />}
            </div>

            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem', flexWrap: 'wrap' }}>
                <h2
                  style={{
                    margin: 0,
                    fontSize: '1.22rem',
                    fontWeight: '700',
                    fontFamily: 'var(--font-headline)',
                    color: 'var(--color-text)',
                    letterSpacing: '-0.02em'
                  }}
                >
                  {isExit ? 'Detalle de Salida de Almacén' : 'Detalle de Entrada a Almacén'}
                </h2>

                <span className={`badge ${isExit ? 'badge-danger' : 'badge-success'}`}>
                  {isExit ? 'Salida' : 'Entrada'}
                </span>

                <span
                  className="badge badge-gray"
                  style={{ fontWeight: 700, color: 'var(--color-text)' }}
                >
                  {noteData.noteTitle}
                </span>

                {syncState === 'conflict' ? (
                  <span
                    title={syncError || 'Conflicto al sincronizar con el servidor'}
                    style={{
                      fontSize: '0.68rem',
                      padding: '0.18rem 0.55rem',
                      borderRadius: '999px',
                      backgroundColor: 'rgba(239, 68, 68, 0.14)',
                      color: '#dc2626',
                      fontWeight: 700
                    }}
                  >
                    Requiere revisión
                  </span>
                ) : syncState === 'pending' ? (
                  <span
                    title="Cambio local pendiente de sincronizar"
                    style={{
                      fontSize: '0.68rem',
                      padding: '0.18rem 0.55rem',
                      borderRadius: '999px',
                      backgroundColor: 'rgba(245, 158, 11, 0.16)',
                      color: '#b45309',
                      fontWeight: 700
                    }}
                  >
                    Pendiente
                  </span>
                ) : (
                  <span
                    style={{
                      fontSize: '0.68rem',
                      padding: '0.18rem 0.55rem',
                      borderRadius: '999px',
                      backgroundColor: 'rgba(16, 185, 129, 0.12)',
                      color: '#059669',
                      fontWeight: 600
                    }}
                  >
                    Sincronizado
                  </span>
                )}
              </div>

              <p style={{ margin: '0.22rem 0 0 0', fontSize: '0.825rem', color: 'var(--color-text-muted)' }}>
                <strong>{noteData.docType} #{noteData.refNumber}</strong> • Fecha: <strong>{noteData.formattedDate}</strong> • Horario: {noteData.timeStart} - {noteData.timeEnd} • Auditor: <strong>{noteData.auditUser}</strong>
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar detalle del movimiento"
            style={{
              borderRadius: '50%',
              width: '36px',
              height: '36px',
              padding: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'transparent',
              color: 'var(--color-text-muted)',
              border: '1px solid var(--color-border)',
              cursor: 'pointer',
              flexShrink: 0
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* 2. MICRO-TARJETAS KPI DE TRIPLE UNIDAD Y CADENA DE FRÍO */}
        <div
          style={{
            padding: '0.7rem 1.35rem',
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
            gap: '0.65rem',
            backgroundColor: 'var(--color-surface)',
            borderBottom: '1px solid var(--color-border)',
            flexShrink: 0
          }}
        >
          {/* KPI 1: Unidades */}
          <div
            style={{
              padding: '0.8rem 1rem',
              backgroundColor: 'var(--color-card)',
              borderRadius: 'var(--radius)',
              border: '1px solid var(--color-border)',
              display: 'flex',
              alignItems: 'center',
              gap: '0.8rem'
            }}
          >
            <div
              style={{
                width: '38px',
                height: '38px',
                borderRadius: '9px',
                backgroundColor: 'rgba(59, 130, 246, 0.12)',
                color: '#3b82f6',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0
              }}
            >
              <Package size={19} />
            </div>
            <div>
              <div style={{ fontSize: '0.68rem', fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Unidades ({totals.totalItems} {totals.totalItems === 1 ? 'ítem' : 'ítems'})
              </div>
              <div style={{ fontSize: '1.2rem', fontWeight: 800, fontFamily: 'var(--font-headline)', color: 'var(--color-text)' }}>
                {totals.totalUnits.toLocaleString('en-US')}
              </div>
            </div>
          </div>

          {/* KPI 2: Peso Neto Libras */}
          <div
            style={{
              padding: '0.8rem 1rem',
              backgroundColor: 'var(--color-card)',
              borderRadius: 'var(--radius)',
              border: '1px solid var(--color-border)',
              display: 'flex',
              alignItems: 'center',
              gap: '0.8rem'
            }}
          >
            <div
              style={{
                width: '38px',
                height: '38px',
                borderRadius: '9px',
                backgroundColor: 'rgba(16, 185, 129, 0.12)',
                color: '#10b981',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0
              }}
            >
              <Scale size={19} />
            </div>
            <div>
              <div style={{ fontSize: '0.68rem', fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Peso Neto Total
              </div>
              <div style={{ fontSize: '1.2rem', fontWeight: 800, fontFamily: 'var(--font-headline)', color: 'var(--color-text)' }}>
                {formatMovementPounds(totals.totalPounds)} <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--color-text-muted)' }}>lbs</span>
              </div>
            </div>
          </div>

          {/* KPI 3: Cestas */}
          <div
            style={{
              padding: '0.8rem 1rem',
              backgroundColor: 'var(--color-card)',
              borderRadius: 'var(--radius)',
              border: '1px solid var(--color-border)',
              display: 'flex',
              alignItems: 'center',
              gap: '0.8rem'
            }}
          >
            <div
              style={{
                width: '38px',
                height: '38px',
                borderRadius: '9px',
                backgroundColor: 'rgba(139, 92, 246, 0.12)',
                color: '#8b5cf6',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0
              }}
            >
              <Layers size={19} />
            </div>
            <div>
              <div style={{ fontSize: '0.68rem', fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Cestas / Embalajes
              </div>
              <div style={{ fontSize: '1.2rem', fontWeight: 800, fontFamily: 'var(--font-headline)', color: 'var(--color-text)' }}>
                {totals.totalBaskets.toLocaleString('en-US')}
              </div>
            </div>
          </div>

          {/* KPI 4: Temperatura Promedio Cadena de Frío */}
          <div
            style={{
              padding: '0.8rem 1rem',
              backgroundColor: 'var(--color-card)',
              borderRadius: 'var(--radius)',
              border: '1px solid var(--color-border)',
              display: 'flex',
              alignItems: 'center',
              gap: '0.8rem'
            }}
          >
            <div
              style={{
                width: '38px',
                height: '38px',
                borderRadius: '9px',
                backgroundColor: totals.isAvgTempOutOfRange ? 'rgba(245, 158, 11, 0.15)' : 'rgba(14, 165, 233, 0.12)',
                color: totals.isAvgTempOutOfRange ? '#d97706' : '#0284c7',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0
              }}
            >
              <ThermometerSnowflake size={19} />
            </div>
            <div>
              <div style={{ fontSize: '0.68rem', fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Temp. Promedio
              </div>
              <div
                style={{
                  fontSize: '1.15rem',
                  fontWeight: 800,
                  fontFamily: 'var(--font-headline)',
                  color: totals.isAvgTempOutOfRange ? 'var(--color-warning)' : 'var(--color-text)'
                }}
              >
                {totals.hasAnyTemp ? totals.avgTempFormatted : 'Sin registro'}
              </div>
            </div>
          </div>
        </div>

        {/* 3. CUERPO DESPLAZABLE */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '1rem 1.35rem' }}>
          {/* Paneles de Documento y Logística */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(265px, 1fr))',
              gap: '0.85rem',
              marginBottom: '1.15rem'
            }}
          >
            {/* Tarjeta Documento */}
            <div
              style={{
                backgroundColor: 'var(--color-surface)',
                border: '1px solid var(--color-border)',
                borderRadius: 'var(--radius-lg)',
                padding: '1rem 1.15rem'
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  fontSize: '0.8rem',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em',
                  color: 'var(--color-primary)',
                  marginBottom: '0.75rem',
                  paddingBottom: '0.45rem',
                  borderBottom: '1px solid var(--color-border)'
                }}
              >
                <FileText size={16} /> Información General y Documento
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem', fontSize: '0.86rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem' }}>
                  <span style={{ color: 'var(--color-text-muted)' }}>Tipo de Operación:</span>
                  <strong style={{ color: isExit ? 'var(--color-danger)' : 'var(--color-success)' }}>
                    {isExit ? 'Salida (Despacho)' : 'Entrada (Recepción)'}
                  </strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem' }}>
                  <span style={{ color: 'var(--color-text-muted)' }}>Documento de Referencia:</span>
                  <strong>{noteData.docType} #{noteData.refNumber}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem' }}>
                  <span style={{ color: 'var(--color-text-muted)' }}>Fecha del Movimiento:</span>
                  <strong>{noteData.formattedDate}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem' }}>
                  <span style={{ color: 'var(--color-text-muted)' }}>{noteData.scheduleLabel}:</span>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', fontWeight: 600 }}>
                    <Clock size={13} style={{ color: 'var(--color-text-muted)' }} />
                    {noteData.timeStart} - {noteData.timeEnd}
                    {noteData.durationLabel && (
                      <span className="badge badge-gray" style={{ padding: '0.1rem 0.45rem', fontSize: '0.7rem' }}>
                        {noteData.durationLabel}
                      </span>
                    )}
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem' }}>
                  <span style={{ color: 'var(--color-text-muted)' }}>Usuario Auditor:</span>
                  <strong>{noteData.auditUser}</strong>
                </div>
              </div>
            </div>

            {/* Tarjeta Logística y Transporte */}
            <div
              style={{
                backgroundColor: 'var(--color-surface)',
                border: '1px solid var(--color-border)',
                borderRadius: 'var(--radius-lg)',
                padding: '1rem 1.15rem'
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  fontSize: '0.8rem',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em',
                  color: 'var(--color-primary)',
                  marginBottom: '0.75rem',
                  paddingBottom: '0.45rem',
                  borderBottom: '1px solid var(--color-border)'
                }}
              >
                <Truck size={16} /> Logística, Transporte y Custodia
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem', fontSize: '0.86rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem' }}>
                  <span style={{ color: 'var(--color-text-muted)' }}>Transportista / Motorista:</span>
                  <strong>{noteData.carrier}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem' }}>
                  <span style={{ color: 'var(--color-text-muted)' }}>Equipo / Placa:</span>
                  <strong>{noteData.equipment}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem' }}>
                  <span style={{ color: 'var(--color-text-muted)' }}>N° de Marchamo / Sello:</span>
                  <strong>{noteData.seal}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem' }}>
                  <span style={{ color: 'var(--color-text-muted)' }}>Comprobante Imprimible:</span>
                  <strong style={{ color: 'var(--color-primary)' }}>{noteData.noteTitle}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem' }}>
                  <span style={{ color: 'var(--color-text-muted)' }}>Folio Interno:</span>
                  <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{noteData.internalId}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Tabla de Productos */}
          <div style={{ marginBottom: '1.35rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.6rem' }}>
              <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 700, color: 'var(--color-text)' }}>
                Productos Registrados ({totals.totalItems})
              </h3>
            </div>

            <div className="table-container" style={{ boxShadow: 'none' }}>
              <table className="movements-table" style={{ minWidth: '540px' }}>
                <thead>
                  <tr>
                    <th style={{ width: '40px', textAlign: 'center' }}>#</th>
                    <th style={{ width: '105px' }}>Código (SKU)</th>
                    <th>Descripción del Producto</th>
                    <th style={{ width: '110px' }}>Categoría</th>
                    <th style={{ width: '90px', textAlign: 'center' }}>Temp. (°C)</th>
                    <th style={{ width: '85px', textAlign: 'right' }}>Unidades</th>
                    <th style={{ width: '105px', textAlign: 'right' }}>Peso Neto (Lbs)</th>
                    <th style={{ width: '80px', textAlign: 'right' }}>Cestas</th>
                  </tr>
                </thead>
                <tbody>
                  {noteData.items.length === 0 ? (
                    <tr>
                      <td colSpan={8} style={{ textAlign: 'center', padding: '1.5rem', color: 'var(--color-text-muted)' }}>
                        Este movimiento no tiene productos asociados.
                      </td>
                    </tr>
                  ) : (
                    noteData.items.map((item) => (
                      <tr key={`${item.productId}-${item.index}`}>
                        <td style={{ textAlign: 'center', color: 'var(--color-text-muted)', fontWeight: 600 }}>
                          {item.index}
                        </td>
                        <td style={{ fontWeight: 700, fontFamily: 'monospace' }}>{item.sku}</td>
                        <td style={{ fontWeight: 500 }}>{item.description}</td>
                        <td>
                          <span className="badge badge-gray" style={{ fontSize: '0.7rem', padding: '0.18rem 0.55rem' }}>
                            {item.category}
                          </span>
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          {item.hasTemp ? (
                            <span
                              className={`badge ${item.isTempOutOfRange ? 'badge-warning' : 'badge-primary'}`}
                              style={{ fontSize: '0.72rem', padding: '0.18rem 0.55rem' }}
                              title={item.isTempOutOfRange ? 'Temperatura fuera de rango (> -14.0°C)' : 'Temperatura dentro de rango (<= -14.0°C)'}
                            >
                              {item.tempFormatted}
                            </span>
                          ) : (
                            <span style={{ color: 'var(--color-text-muted)' }}>—</span>
                          )}
                        </td>
                        <td style={{ textAlign: 'right', fontWeight: 600 }}>
                          {item.qtyUnits.toLocaleString('en-US')}
                        </td>
                        <td style={{ textAlign: 'right', fontWeight: 600 }}>
                          {formatMovementPounds(item.qtyPounds)}
                        </td>
                        <td style={{ textAlign: 'right', fontWeight: 600 }}>
                          {item.qtyBaskets.toLocaleString('en-US')}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
                {noteData.items.length > 0 && (
                  <tfoot>
                    <tr style={{ backgroundColor: 'var(--color-surface)', fontWeight: 800 }}>
                      <td colSpan={4} style={{ textAlign: 'right', fontWeight: 700 }}>
                        TOTALES DEL MOVIMIENTO:
                      </td>
                      <td style={{ textAlign: 'center', fontWeight: 700 }}>
                        {totals.hasAnyTemp ? `Prom: ${totals.avgTempFormatted}` : '—'}
                      </td>
                      <td style={{ textAlign: 'right', fontWeight: 800, color: 'var(--color-primary)' }}>
                        {totals.totalUnits.toLocaleString('en-US')}
                      </td>
                      <td style={{ textAlign: 'right', fontWeight: 800, color: 'var(--color-primary)' }}>
                        {formatMovementPounds(totals.totalPounds)}
                      </td>
                      <td style={{ textAlign: 'right', fontWeight: 800, color: 'var(--color-primary)' }}>
                        {totals.totalBaskets.toLocaleString('en-US')}
                      </td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>

          {/* Tabla de Servicios Extraordinarios (si existen) */}
          {noteData.services.length > 0 && (
            <div style={{ marginBottom: '1.35rem' }}>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  gap: '0.5rem',
                  marginBottom: '0.6rem'
                }}
              >
                <h3
                  style={{
                    margin: 0,
                    fontSize: '0.95rem',
                    fontWeight: 700,
                    color: 'var(--color-text)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.45rem'
                  }}
                >
                  <Wrench size={16} style={{ color: 'var(--color-primary)' }} />
                  Servicios Extraordinarios Registrados ({noteData.services.length})
                </h3>

                <label
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.45rem',
                    fontSize: '0.8rem',
                    color: 'var(--color-text-light)',
                    cursor: 'pointer'
                  }}
                >
                  <input
                    type="checkbox"
                    checked={includeServices}
                    onChange={(e) => setIncludeServices(e.target.checked)}
                  />
                  Incluir servicios en la {noteData.noteShortLabel} impresa
                </label>
              </div>

              <div className="table-container" style={{ boxShadow: 'none' }}>
                <table style={{ minWidth: '540px' }}>
                  <thead>
                    <tr>
                      <th style={{ width: '48px', textAlign: 'center' }}>#</th>
                      <th>Descripción del Servicio</th>
                      <th style={{ width: '130px', textAlign: 'right' }}>Cantidad / Lbs</th>
                      <th style={{ width: '120px', textAlign: 'right' }}>Precio Unit.</th>
                      <th style={{ width: '120px', textAlign: 'right' }}>Total ($)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {noteData.services.map((srv) => (
                      <tr key={srv.index}>
                        <td style={{ textAlign: 'center', color: 'var(--color-text-muted)' }}>{srv.index}</td>
                        <td style={{ fontWeight: 500 }}>{srv.description}</td>
                        <td style={{ textAlign: 'right' }}>
                          {srv.quantity.toLocaleString('en-US', { maximumFractionDigits: 3 })}
                        </td>
                        <td style={{ textAlign: 'right' }}>${formatPrice(srv.unitPrice)}</td>
                        <td style={{ textAlign: 'right', fontWeight: 700 }}>${formatCurrency(srv.value)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr style={{ backgroundColor: 'var(--color-surface)', fontWeight: 800 }}>
                      <td colSpan={4} style={{ textAlign: 'right' }}>
                        TOTAL SERVICIOS EXTRAORDINARIOS:
                      </td>
                      <td style={{ textAlign: 'right', color: 'var(--color-primary)' }}>
                        ${formatCurrency(noteData.totalServicesValue)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}

          {/* Observaciones opcionales para la Nota Impresa */}
          <div
            style={{
              backgroundColor: 'var(--color-surface)',
              border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-lg)',
              padding: '0.9rem 1.15rem'
            }}
          >
            <label
              htmlFor="movement-note-observations"
              style={{
                display: 'block',
                fontSize: '0.8rem',
                fontWeight: 700,
                color: 'var(--color-text)',
                marginBottom: '0.4rem'
              }}
            >
              Observaciones para la {noteData.noteShortLabel} (opcional para impresión / PDF / Word)
            </label>
            <input
              id="movement-note-observations"
              type="text"
              className="form-input"
              placeholder="Ej. Entregado conforme con precinto intacto (si se deja vacío se imprimen líneas para llenado manual)..."
              value={observations}
              onChange={(e) => setObservations(e.target.value)}
              style={{ marginBottom: 0, fontSize: '0.85rem' }}
            />
          </div>
        </div>

        {/* 4. FOOTER FIJO CON ACCIONES DE IMPRESIÓN, PDF Y WORD */}
        <div
          style={{
            padding: '0.85rem 1.35rem',
            borderTop: '1px solid var(--color-border)',
            backgroundColor: 'var(--color-surface)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '0.75rem',
            flexShrink: 0
          }}
        >
          <div>
            {allowEdit && typeof onEdit === 'function' && (
              <button
                type="button"
                className="btn btn-outline"
                onClick={() => onEdit(movement)}
                title="Abrir este movimiento en el formulario de edición"
              >
                <Edit3 size={16} /> Editar Movimiento
              </button>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem', flexWrap: 'wrap' }}>
            <button type="button" className="btn btn-outline" onClick={onClose}>
              Cerrar
            </button>

            <button
              type="button"
              className="btn btn-outline"
              onClick={handleDownloadWord}
              title={`Descargar ${noteData.noteShortLabel} en formato Microsoft Word (.doc)`}
            >
              <FileText size={16} /> Descargar Word
            </button>

            <button
              type="button"
              className="btn btn-outline"
              onClick={handleDownloadPdf}
              disabled={isGeneratingPdf}
              title={`Descargar ${noteData.noteShortLabel} en formato PDF`}
            >
              <FileOutput size={16} /> {isGeneratingPdf ? 'Generando PDF...' : 'Descargar PDF'}
            </button>

            <button
              type="button"
              className="btn btn-primary"
              onClick={handlePrint}
              style={
                !isExit
                  ? {
                      backgroundColor: 'var(--color-success)',
                      borderColor: 'var(--color-success)',
                      color: '#ffffff'
                    }
                  : undefined
              }
              title={`Imprimir comprobante oficial: ${noteData.noteTitle}`}
            >
              <Printer size={17} /> Imprimir {noteData.noteShortLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MovementDetailModal;
