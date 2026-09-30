import React, { useState, useEffect, useMemo } from 'react';
import { useInventory } from '../../context/InventoryContext';
import { 
  History, X, Search, RefreshCw, Snowflake, Eye, Trash2, 
  Calendar, Lock, Unlock, DollarSign, ShieldCheck, FileText, CheckCircle2
} from 'lucide-react';
import { formatDate, formatCurrency } from '../../utils/formatUtils';
import { toast } from 'react-hot-toast';

export default function DailyCutsHistoryModal({ isOpen, onClose, onSelectCut, activeCutId }) {
  const { fetchDailyCuts, deleteDailyCut } = useInventory();
  const [cutsList, setCutsList] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [historySearch, setHistorySearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('all'); // 'all' | 'locked' | 'unlocked'

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

  useEffect(() => {
    if (isOpen) {
      loadHistory();
    }
  }, [isOpen]);

  // Cerrar al presionar la tecla Escape
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Cálculos estadísticos para las tarjetas KPI
  const stats = useMemo(() => {
    const totalCuts = cutsList.length;
    let totalFacturado = 0;
    let lockedCount = 0;
    let unlockedCount = 0;

    cutsList.forEach((c) => {
      const val = Number(c.totals?.totalGeneral || 0);
      totalFacturado += isNaN(val) ? 0 : val;
      if (c.isLocked) {
        lockedCount++;
      } else {
        unlockedCount++;
      }
    });

    return { totalCuts, totalFacturado, lockedCount, unlockedCount };
  }, [cutsList]);

  // Filtrado reactivo por texto y estado de bloqueo
  const filteredCuts = useMemo(() => {
    return cutsList.filter((c) => {
      // Filtro de estado
      if (filterStatus === 'locked' && !c.isLocked) return false;
      if (filterStatus === 'unlocked' && c.isLocked) return false;

      // Filtro de búsqueda
      if (!historySearch.trim()) return true;
      const q = historySearch.toLowerCase();
      return (
        (c.title || '').toLowerCase().includes(q) ||
        (c.clientName || '').toLowerCase().includes(q) ||
        (c.startDate || '').includes(q) ||
        (c.endDate || '').includes(q)
      );
    });
  }, [cutsList, historySearch, filterStatus]);

  const handleDeleteCut = async (cut) => {
    if (!window.confirm(`¿Estás seguro de que deseas eliminar permanentemente el corte '${cut.title}'?`)) {
      return;
    }

    const res = await deleteDailyCut(cut.id, cut.title);
    if (res && res.success) {
      toast.success('Corte eliminado con éxito.');
      loadHistory();
    } else {
      toast.error('Error al eliminar el corte.');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose} style={{ zIndex: 1200, padding: '1.25rem' }}>
      <div 
        className="modal-content large" 
        style={{ 
          maxWidth: '1060px', 
          width: '100%', 
          maxHeight: '92vh', 
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
        {/* =========================================================================
            1. HEADER ELEGANTE CON ICONO EN GRADIENTE Y METADATOS
            ========================================================================= */}
        <div style={{
          padding: '1.25rem 1.75rem',
          borderBottom: '1px solid var(--color-border)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          background: 'linear-gradient(180deg, var(--color-surface) 0%, var(--color-card) 100%)',
          flexShrink: 0
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <div style={{
              width: '44px',
              height: '44px',
              borderRadius: '12px',
              background: 'linear-gradient(135deg, var(--color-primary) 0%, #1e40af 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#ffffff',
              boxShadow: '0 6px 16px rgba(0, 103, 192, 0.28)',
              flexShrink: 0
            }}>
              <History size={22} />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                <h2 style={{ 
                  margin: 0, 
                  fontSize: '1.25rem', 
                  fontWeight: '700', 
                  fontFamily: 'var(--font-headline)', 
                  color: 'var(--color-text)',
                  letterSpacing: '-0.02em'
                }}>
                  Historial de Cortes Diarios
                </h2>
                <span className="badge badge-primary" style={{ fontSize: '0.7rem', padding: '0.2rem 0.6rem' }}>
                  Auditoría de Almacén
                </span>
              </div>
              <p style={{ margin: '0.2rem 0 0 0', fontSize: '0.825rem', color: 'var(--color-text-muted)' }}>
                Consulta períodos congelados, revisa totales facturados y carga cortes históricos a pantalla.
              </p>
            </div>
          </div>

          <button 
            className="btn btn-ghost" 
            onClick={onClose} 
            aria-label="Cerrar modal"
            style={{ 
              borderRadius: '50%', 
              width: '36px', 
              height: '36px', 
              padding: 0, 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'center',
              color: 'var(--color-text-muted)',
              border: '1px solid var(--color-border)'
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* =========================================================================
            2. TARJETAS DE MÉTRICAS KPI (RESUMEN RÁPIDO)
            ========================================================================= */}
        <div style={{
          padding: '1rem 1.75rem',
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
          gap: '0.85rem',
          backgroundColor: 'var(--color-surface)',
          borderBottom: '1px solid var(--color-border)',
          flexShrink: 0
        }}>
          {/* Tarjeta 1: Total Cortes */}
          <div style={{
            padding: '0.85rem 1rem',
            backgroundColor: 'var(--color-card)',
            borderRadius: 'var(--radius)',
            border: '1px solid var(--color-border)',
            display: 'flex',
            alignItems: 'center',
            gap: '0.85rem'
          }}>
            <div style={{
              width: '36px',
              height: '36px',
              borderRadius: '8px',
              backgroundColor: 'rgba(59, 130, 246, 0.12)',
              color: '#3b82f6',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <Calendar size={18} />
            </div>
            <div>
              <div style={{ fontSize: '0.7rem', fontWeight: '600', color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Cortes Registrados
              </div>
              <div style={{ fontSize: '1.25rem', fontWeight: '800', fontFamily: 'var(--font-headline)', color: 'var(--color-text)' }}>
                {stats.totalCuts}
              </div>
            </div>
          </div>

          {/* Tarjeta 2: Total Facturado Histórico */}
          <div style={{
            padding: '0.85rem 1rem',
            backgroundColor: 'var(--color-card)',
            borderRadius: 'var(--radius)',
            border: '1px solid var(--color-border)',
            display: 'flex',
            alignItems: 'center',
            gap: '0.85rem'
          }}>
            <div style={{
              width: '36px',
              height: '36px',
              borderRadius: '8px',
              backgroundColor: 'rgba(16, 185, 129, 0.12)',
              color: '#10b981',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <DollarSign size={18} />
            </div>
            <div>
              <div style={{ fontSize: '0.7rem', fontWeight: '600', color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Total Facturado Acumulado
              </div>
              <div style={{ fontSize: '1.25rem', fontWeight: '800', fontFamily: 'var(--font-headline)', color: '#10b981' }}>
                ${formatCurrency(stats.totalFacturado)}
              </div>
            </div>
          </div>

          {/* Tarjeta 3: Estado de Cierre / Bloqueo */}
          <div style={{
            padding: '0.85rem 1rem',
            backgroundColor: 'var(--color-card)',
            borderRadius: 'var(--radius)',
            border: '1px solid var(--color-border)',
            display: 'flex',
            alignItems: 'center',
            gap: '0.85rem'
          }}>
            <div style={{
              width: '36px',
              height: '36px',
              borderRadius: '8px',
              backgroundColor: 'rgba(139, 92, 246, 0.12)',
              color: '#8b5cf6',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <ShieldCheck size={18} />
            </div>
            <div>
              <div style={{ fontSize: '0.7rem', fontWeight: '600', color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Integridad & Bloqueo
              </div>
              <div style={{ fontSize: '0.95rem', fontWeight: '700', color: 'var(--color-text)', display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.15rem' }}>
                <span style={{ color: 'var(--color-primary)' }}>🔒 {stats.lockedCount} cerrados</span>
                <span style={{ color: 'var(--color-text-muted)' }}>·</span>
                <span style={{ color: '#d97706' }}>🔓 {stats.unlockedCount}</span>
              </div>
            </div>
          </div>
        </div>

        {/* =========================================================================
            3. BARRA DE HERRAMIENTAS: BÚSQUEDA + PESTAÑAS DE FILTRO + REFRESCO
            ========================================================================= */}
        <div style={{
          padding: '0.85rem 1.75rem',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '1rem',
          flexWrap: 'wrap',
          borderBottom: '1px solid var(--color-border)',
          flexShrink: 0
        }}>
          {/* Buscador de cortes */}
          <div style={{ position: 'relative', flex: 1, minWidth: '240px' }}>
            <Search 
              size={16} 
              style={{ position: 'absolute', left: '0.85rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)' }} 
            />
            <input
              type="text"
              className="form-input"
              placeholder="Buscar corte por título, cliente, fecha..."
              value={historySearch}
              onChange={(e) => setHistorySearch(e.target.value)}
              style={{ 
                paddingLeft: '2.4rem', 
                paddingRight: historySearch ? '2.2rem' : '0.75rem',
                height: '38px',
                borderRadius: '8px'
              }}
              autoFocus
            />
            {historySearch && (
              <button
                onClick={() => setHistorySearch('')}
                style={{
                  position: 'absolute',
                  right: '0.65rem',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'none',
                  border: 'none',
                  color: 'var(--color-text-muted)',
                  cursor: 'pointer',
                  padding: '0.2rem',
                  display: 'flex',
                  alignItems: 'center'
                }}
                title="Limpiar búsqueda"
              >
                <X size={14} />
              </button>
            )}
          </div>

          {/* Filtros por pestaña / Chip */}
          <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
            <button
              onClick={() => setFilterStatus('all')}
              style={{
                padding: '0.4rem 0.8rem',
                borderRadius: '20px',
                fontSize: '0.78rem',
                fontWeight: filterStatus === 'all' ? '700' : '500',
                border: filterStatus === 'all' ? '1px solid var(--color-primary)' : '1px solid var(--color-border)',
                backgroundColor: filterStatus === 'all' ? 'rgba(0, 103, 192, 0.1)' : 'transparent',
                color: filterStatus === 'all' ? 'var(--color-primary)' : 'var(--color-text-muted)',
                cursor: 'pointer',
                transition: 'all 0.15s ease'
              }}
            >
              Todos ({stats.totalCuts})
            </button>
            <button
              onClick={() => setFilterStatus('locked')}
              style={{
                padding: '0.4rem 0.8rem',
                borderRadius: '20px',
                fontSize: '0.78rem',
                fontWeight: filterStatus === 'locked' ? '700' : '500',
                border: filterStatus === 'locked' ? '1px solid var(--color-primary)' : '1px solid var(--color-border)',
                backgroundColor: filterStatus === 'locked' ? 'rgba(0, 103, 192, 0.1)' : 'transparent',
                color: filterStatus === 'locked' ? 'var(--color-primary)' : 'var(--color-text-muted)',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
                display: 'flex',
                alignItems: 'center',
                gap: '0.3rem'
              }}
            >
              <Lock size={12} /> Bloqueados ({stats.lockedCount})
            </button>
            <button
              onClick={() => setFilterStatus('unlocked')}
              style={{
                padding: '0.4rem 0.8rem',
                borderRadius: '20px',
                fontSize: '0.78rem',
                fontWeight: filterStatus === 'unlocked' ? '700' : '500',
                border: filterStatus === 'unlocked' ? '1px solid #d97706' : '1px solid var(--color-border)',
                backgroundColor: filterStatus === 'unlocked' ? 'rgba(217, 119, 6, 0.1)' : 'transparent',
                color: filterStatus === 'unlocked' ? '#d97706' : 'var(--color-text-muted)',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
                display: 'flex',
                alignItems: 'center',
                gap: '0.3rem'
              }}
            >
              <Unlock size={12} /> Abiertos ({stats.unlockedCount})
            </button>

            {/* Botón Refrescar */}
            <button 
              className="btn btn-outline" 
              onClick={loadHistory} 
              disabled={loadingHistory} 
              title="Refrescar lista de cortes"
              style={{ height: '36px', padding: '0 0.75rem', borderRadius: '8px', marginLeft: '0.3rem' }}
            >
              <RefreshCw size={15} className={loadingHistory ? 'spin' : ''} />
            </button>
          </div>
        </div>

        {/* =========================================================================
            4. LISTADO DE CORTES (TABLA ELEGANTE CON HOVER Y HIGHLIGHT)
            ========================================================================= */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '1rem 1.75rem' }}>
          {loadingHistory ? (
            <div style={{ textAlign: 'center', padding: '4rem 1rem' }}>
              <div 
                className="spin" 
                style={{ 
                  width: '36px', 
                  height: '36px', 
                  border: '3px solid rgba(0, 103, 192, 0.15)', 
                  borderTopColor: 'var(--color-primary)', 
                  borderRadius: '50%', 
                  margin: '0 auto 1rem' 
                }}
              />
              <p style={{ color: 'var(--color-text)', fontWeight: '600', marginBottom: '0.25rem' }}>
                Consultando base de datos...
              </p>
              <p style={{ color: 'var(--color-text-muted)', fontSize: '0.825rem' }}>
                Cargando el registro histórico de cortes congelados
              </p>
            </div>
          ) : filteredCuts.length === 0 ? (
            <div style={{ 
              textAlign: 'center', 
              padding: '3.5rem 1.5rem', 
              backgroundColor: 'var(--color-surface)', 
              borderRadius: 'var(--radius)',
              border: '1px dashed var(--color-border)'
            }}>
              <div style={{
                width: '56px',
                height: '56px',
                borderRadius: '50%',
                backgroundColor: 'rgba(0, 103, 192, 0.08)',
                color: 'var(--color-primary)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 1rem'
              }}>
                <Snowflake size={28} />
              </div>
              <h3 style={{ fontSize: '1.05rem', fontWeight: '700', color: 'var(--color-text)', marginBottom: '0.35rem' }}>
                {historySearch ? 'No se encontraron resultados para tu búsqueda' : 'No hay cortes registrados en este filtro'}
              </h3>
              <p style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)', maxWidth: '420px', margin: '0 auto 1rem' }}>
                {historySearch 
                  ? 'Intenta con otros términos como el nombre del cliente o fechas diferentes.' 
                  : 'Puedes congelar un período contable activo desde la pantalla de Resumen Diario con el botón "Congelar Período".'}
              </p>
              {historySearch && (
                <button 
                  className="btn btn-outline" 
                  onClick={() => setHistorySearch('')}
                  style={{ fontSize: '0.8rem', padding: '0.4rem 0.9rem' }}
                >
                  Limpiar búsqueda
                </button>
              )}
            </div>
          ) : (
            <div className="table-container" style={{ margin: 0, boxShadow: 'none', border: '1px solid var(--color-border)', borderRadius: 'var(--radius)' }}>
              <table style={{ minWidth: '920px', width: '100%', borderCollapse: 'separate', borderSpacing: 0 }}>
                <thead>
                  <tr style={{ backgroundColor: 'var(--color-surface)' }}>
                    <th style={{ minWidth: '220px', padding: '0.75rem 1rem' }}>TÍTULO / DESCRIPCIÓN</th>
                    <th style={{ minWidth: '170px', padding: '0.75rem 1rem' }}>PERÍODO FACTURADO</th>
                    <th style={{ minWidth: '150px', padding: '0.75rem 1rem' }}>CLIENTE</th>
                    <th style={{ textAlign: 'right', minWidth: '140px', padding: '0.75rem 1rem' }}>TOTAL FACTURADO</th>
                    <th style={{ textAlign: 'center', minWidth: '120px', padding: '0.75rem 1rem' }}>ESTADO</th>
                    <th style={{ textAlign: 'center', minWidth: '105px', padding: '0.75rem 1rem' }}>FECHA CIERRE</th>
                    <th style={{ textAlign: 'center', minWidth: '150px', padding: '0.75rem 1rem' }}>ACCIONES</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredCuts.map((cut, idx) => {
                    const isCurrentActive = activeCutId === cut.id;
                    const cutTotal = Number(cut.totals?.totalGeneral || 0);

                    return (
                      <tr 
                        key={cut.id} 
                        style={{ 
                          backgroundColor: isCurrentActive 
                            ? 'rgba(0, 103, 192, 0.08)' 
                            : (idx % 2 === 0 ? 'var(--color-card)' : 'var(--color-surface)'),
                          borderLeft: isCurrentActive ? '4px solid var(--color-primary)' : 'none',
                          transition: 'background-color 0.15s ease'
                        }}
                      >
                        {/* 1. Título y corte */}
                        <td style={{ padding: '0.85rem 1rem' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                            <div style={{
                              width: '30px',
                              height: '30px',
                              borderRadius: '6px',
                              backgroundColor: 'rgba(0, 103, 192, 0.1)',
                              color: 'var(--color-primary)',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              flexShrink: 0
                            }}>
                              <Snowflake size={15} />
                            </div>
                            <div>
                              <div style={{ fontWeight: '700', color: 'var(--color-text)', fontSize: '0.875rem' }}>
                                {cut.title}
                              </div>
                              {isCurrentActive && (
                                <span style={{ 
                                  fontSize: '0.68rem', 
                                  color: 'var(--color-primary)', 
                                  fontWeight: '700',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '0.25rem',
                                  marginTop: '0.15rem'
                                }}>
                                  <CheckCircle2 size={11} /> Activo en Pantalla
                                </span>
                              )}
                            </div>
                          </div>
                        </td>

                        {/* 2. Período */}
                        <td style={{ padding: '0.85rem 1rem', fontSize: '0.825rem', whiteSpace: 'nowrap' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: 'var(--color-text)' }}>
                            <Calendar size={13} style={{ color: 'var(--color-text-muted)' }} />
                            <span>{formatDate(cut.startDate)} <span style={{ color: 'var(--color-text-muted)' }}>al</span> {formatDate(cut.endDate)}</span>
                          </div>
                        </td>

                        {/* 3. Cliente */}
                        <td style={{ padding: '0.85rem 1rem', fontSize: '0.825rem', color: 'var(--color-text-light)' }}>
                          {cut.clientName || 'Sin especificar'}
                        </td>

                        {/* 4. Total Facturado */}
                        <td style={{ padding: '0.85rem 1rem', textAlign: 'right', whiteSpace: 'nowrap' }}>
                          <div style={{ 
                            fontSize: '0.95rem', 
                            fontWeight: '800', 
                            fontFamily: 'var(--font-headline)', 
                            color: cutTotal > 0 ? '#10b981' : 'var(--color-text)' 
                          }}>
                            ${formatCurrency(cutTotal)}
                          </div>
                          <div style={{ fontSize: '0.68rem', color: 'var(--color-text-muted)' }}>
                            Saldo consolidado
                          </div>
                        </td>

                        {/* 5. Estado de Bloqueo */}
                        <td style={{ padding: '0.85rem 1rem', textAlign: 'center' }}>
                          {cut.isLocked ? (
                            <span 
                              style={{ 
                                display: 'inline-flex', 
                                alignItems: 'center', 
                                gap: '0.3rem', 
                                fontSize: '0.72rem', 
                                padding: '0.25rem 0.65rem',
                                borderRadius: '12px',
                                fontWeight: '700',
                                backgroundColor: 'rgba(0, 103, 192, 0.1)',
                                color: 'var(--color-primary)'
                              }}
                            >
                              <Lock size={11} /> Cerrado
                            </span>
                          ) : (
                            <span 
                              style={{ 
                                display: 'inline-flex', 
                                alignItems: 'center', 
                                gap: '0.3rem', 
                                fontSize: '0.72rem', 
                                padding: '0.25rem 0.65rem',
                                borderRadius: '12px',
                                fontWeight: '700',
                                backgroundColor: 'rgba(217, 119, 6, 0.12)',
                                color: '#d97706'
                              }}
                            >
                              <Unlock size={11} /> Editable
                            </span>
                          )}
                        </td>

                        {/* 6. Fecha de Creado */}
                        <td style={{ padding: '0.85rem 1rem', textAlign: 'center', fontSize: '0.75rem', color: 'var(--color-text-muted)', whiteSpace: 'nowrap' }}>
                          {cut.created_at ? formatDate(cut.created_at) : 'Reciente'}
                        </td>

                        {/* 7. Acciones */}
                        <td style={{ padding: '0.85rem 1rem', textAlign: 'center' }}>
                          <div style={{ display: 'flex', gap: '0.45rem', justifyContent: 'center', alignItems: 'center' }}>
                            <button
                              className="btn btn-primary"
                              style={{ 
                                padding: '0.35rem 0.8rem', 
                                fontSize: '0.78rem', 
                                whiteSpace: 'nowrap',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '0.35rem',
                                borderRadius: '6px'
                              }}
                              onClick={() => onSelectCut && onSelectCut(cut)}
                              title="Cargar y consultar este corte en el Resumen Diario"
                            >
                              <Eye size={13} /> {isCurrentActive ? 'Viendo' : 'Cargar'}
                            </button>
                            <button
                              className="btn btn-ghost"
                              style={{ 
                                padding: '0.35rem 0.55rem', 
                                color: 'var(--color-danger)',
                                borderRadius: '6px'
                              }}
                              onClick={() => handleDeleteCut(cut)}
                              title="Eliminar este corte de la base de datos"
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

        {/* =========================================================================
            5. FOOTER CON CONTADOR Y BOTÓN DE CIERRE
            ========================================================================= */}
        <div style={{
          padding: '1rem 1.75rem',
          borderTop: '1px solid var(--color-border)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          backgroundColor: 'var(--color-surface)',
          flexShrink: 0
        }}>
          <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>
            Mostrando <strong>{filteredCuts.length}</strong> de <strong>{cutsList.length}</strong> cortes históricos registrados
          </div>
          <button 
            className="btn btn-outline" 
            onClick={onClose}
            style={{ padding: '0.45rem 1.25rem', borderRadius: '8px', fontWeight: '600' }}
          >
            Cerrar Ventana
          </button>
        </div>
      </div>
    </div>
  );
}
