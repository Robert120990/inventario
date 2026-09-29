import React, { useState, useEffect, useMemo } from 'react';
import { useInventory } from '../../context/InventoryContext';
import { History, X, Search, RefreshCw, Snowflake, Eye, Trash2 } from 'lucide-react';
import { formatDate, formatCurrency } from '../../utils/formatUtils';
import { toast } from 'react-hot-toast';

export default function DailyCutsHistoryModal({ isOpen, onClose, onSelectCut, activeCutId }) {
  const { fetchDailyCuts, deleteDailyCut } = useInventory();
  const [cutsList, setCutsList] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [historySearch, setHistorySearch] = useState('');

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
    <div className="modal-backdrop" onClick={onClose} style={{ zIndex: 1200 }}>
      <div 
        className="modal" 
        style={{ maxWidth: '1000px', width: '95%', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <h3 className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <History size={22} style={{ color: 'var(--color-primary)' }} />
            Historial de Cortes Diarios Congelados
          </h3>
          <button className="btn btn-ghost" onClick={onClose} aria-label="Cerrar modal">
            <X size={18} />
          </button>
        </div>

        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '1rem', overflowY: 'auto' }}>
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
                autoFocus
              />
            </div>
            <button className="btn btn-outline" onClick={loadHistory} disabled={loadingHistory} title="Refrescar lista">
              <RefreshCw size={16} className={loadingHistory ? 'spin' : ''} />
            </button>
          </div>

          {/* Tabla de Cortes */}
          {loadingHistory ? (
            <div style={{ textAlign: 'center', padding: '2.5rem' }}>
              <div className="spin" style={{ width: '30px', height: '30px', border: '3px solid var(--color-border)', borderTopColor: 'var(--color-primary)', borderRadius: '50%', margin: '0 auto 0.75rem' }}></div>
              <p style={{ color: 'var(--color-text-light)', fontSize: '0.85rem' }}>Cargando cortes registrados...</p>
            </div>
          ) : filteredCuts.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '2.5rem', color: 'var(--color-text-muted)', backgroundColor: 'var(--color-bg)', borderRadius: 'var(--radius)' }}>
              <Snowflake size={36} style={{ margin: '0 auto 0.5rem', opacity: 0.4 }} />
              <p style={{ fontWeight: '600', marginBottom: '0.25rem' }}>No se encontraron cortes congelados</p>
              <p style={{ fontSize: '0.8rem' }}>Puedes congelar un período activo en el Resumen Diario usando "Congelar Período".</p>
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
                    const isCurrentActive = activeCutId === cut.id;
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
                              onClick={() => onSelectCut && onSelectCut(cut)}
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
          <button className="btn btn-outline" onClick={onClose}>
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}
