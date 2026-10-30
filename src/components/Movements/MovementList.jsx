import React, { useState, useEffect, useRef } from 'react';
import { useInventory } from '../../context/InventoryContext';
import {
  Plus, Download, Search, FileSpreadsheet,
  ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight,
  ArrowDownCircle, ArrowUpCircle, Eye, Printer, FileOutput, FileText,
  Edit3, Trash2, ChevronDown, Package, User
} from 'lucide-react';
import { exportMovimientos } from '../../utils/exportManager';
import MovementForm from './MovementForm';
import MovementDetailModal from './MovementDetailModal';
import { formatDate } from '../../utils/formatUtils';
import {
  printMovementNote,
  downloadMovementNotePdf,
  downloadMovementNoteWord,
  downloadMovementsListPdf,
  downloadMovementsListWord,
  formatTimeShort,
  findProductForMovementItem
} from '../../utils/movementNotePrinter';
import { toast } from 'react-hot-toast';

const MovementList = () => {
  const {
    movements,
    products,
    settings,
    contractRates,
    deleteMovement,
    getEntitySyncState,
    canCreate,
    canEdit,
    canDelete,
    canExport
  } = useInventory();
  const [isAdding, setIsAdding] = useState(false);
  const [editingMovement, setEditingMovement] = useState(null);
  const [viewingMovement, setViewingMovement] = useState(null);
  const [noteMenu, setNoteMenu] = useState(null); // { mov, top, left }
  const menuRef = useRef(null);

  const allowCreate = canCreate('movements');
  const allowEdit = canEdit('movements');
  const allowDelete = canDelete('movements');
  const allowExport = canExport('movements');
  const showActions = true;

  // Filters & Pagination State (Default: 10 most recent movements)
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState('all'); // 'all', 'in', 'out'
  const [pageSize, setPageSize] = useState(10); // Default to 10 items
  const [currentPage, setCurrentPage] = useState(1);

  // Cerrar menú flotante de comprobante al hacer clic fuera, presionar Escape, hacer scroll o redimensionar
  useEffect(() => {
    if (!noteMenu) return undefined;

    const handlePointerDown = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setNoteMenu(null);
      }
    };
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') setNoteMenu(null);
    };
    const handleViewportChange = () => setNoteMenu(null);

    document.addEventListener('mousedown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('scroll', handleViewportChange, true);
    window.addEventListener('resize', handleViewportChange);

    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('scroll', handleViewportChange, true);
      window.removeEventListener('resize', handleViewportChange);
    };
  }, [noteMenu]);

  // Filter movements
  const filteredMovements = movements.filter(mov => {
    // Filter by type (in / out)
    if (typeFilter !== 'all' && mov.type !== typeFilter) {
      return false;
    }

    if (!searchTerm.trim()) return true;

    const searchLow = searchTerm.toLowerCase();

    // Buscar en datos generales del movimiento
    const inMovement =
      (mov.refNumber || '').toLowerCase().includes(searchLow) ||
      (mov.refType || '').toLowerCase().includes(searchLow) ||
      (mov.carrier || '').toLowerCase().includes(searchLow) ||
      (mov.equipment || '').toLowerCase().includes(searchLow) ||
      (mov.seal || '').toLowerCase().includes(searchLow) ||
      (mov.auditUser || '').toLowerCase().includes(searchLow) ||
      (mov.date || '').toLowerCase().includes(searchLow);

    // Buscar en los productos dentro del movimiento
    const inProducts = mov.items?.some(it => {
      const p = findProductForMovementItem(it, products);
      if (!p) return false;
      return p.sku.toLowerCase().includes(searchLow) || p.description.toLowerCase().includes(searchLow);
    });

    return inMovement || inProducts;
  });

  // Sort movements by date & time descending (newest first)
  const sortedMovements = [...filteredMovements].sort((a, b) => {
    const timeA = a.timeStart || '00:00';
    const timeB = b.timeStart || '00:00';
    const dateA = a.date ? `${a.date}T${timeA}` : (a.created_at || '');
    const dateB = b.date ? `${b.date}T${timeB}` : (b.created_at || '');
    return new Date(dateB) - new Date(dateA);
  });

  // Reset to page 1 whenever search, filter or pageSize changes
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, typeFilter, pageSize]);

  // Pagination calculation
  const totalItems = sortedMovements.length;
  const isAll = pageSize === 'all';
  const limitNum = isAll ? totalItems : Number(pageSize);
  const totalPages = isAll ? 1 : Math.max(1, Math.ceil(totalItems / limitNum));

  // Ensure currentPage is within bounds
  const validCurrentPage = Math.min(Math.max(1, currentPage), totalPages);

  const startIndex = (validCurrentPage - 1) * limitNum;
  const endIndex = isAll ? totalItems : Math.min(startIndex + limitNum, totalItems);
  const paginatedMovements = isAll ? sortedMovements : sortedMovements.slice(startIndex, endIndex);

  // Total pounds for the filtered set
  const totalPounds = filteredMovements.reduce(
    (movementTotal, movement) => movementTotal + (movement.items || []).reduce(
      (itemTotal, item) => itemTotal + Number(item.qtyPounds || 0),
      0
    ),
    0
  );

  const formattedTotalPounds = totalPounds.toLocaleString('es-SV', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2
  });

  const renderProductPreview = (mov) => {
    const items = mov.items || [];
    if (items.length === 0) {
      return <span style={{ color: 'var(--color-text-muted)', fontSize: '0.78rem' }}>Sin productos</span>;
    }

    if (items.length === 1) {
      const product = findProductForMovementItem(items[0], products);
      const sku = product?.sku || items[0].sku || items[0].productId || 'SKU';
      const desc = product?.description || 'Desconocido';
      return (
        <div
          className="mov-single-product"
          onClick={() => setViewingMovement(mov)}
          title={`${sku} - ${desc} (Clic para ver detalle)`}
        >
          <div className="mov-prod-sku" style={{ fontSize: '0.76rem', fontWeight: 700, fontFamily: 'monospace', color: 'var(--color-primary)' }}>
            {sku}
          </div>
          <div style={{ fontSize: '0.78rem', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {desc}
          </div>
        </div>
      );
    }

    const previewTooltip = items
      .slice(0, 5)
      .map((it) => {
        const p = findProductForMovementItem(it, products);
        return p ? `${p.sku} - ${p.description}` : String(it.productId || 'Ítem');
      })
      .join('\n') + (items.length > 5 ? `\n...y ${items.length - 5} más` : '');

    return (
      <button
        type="button"
        className="mov-products-chip"
        onClick={() => setViewingMovement(mov)}
        title={`Clic para ver los ${items.length} productos:\n${previewTooltip}`}
      >
        <Package size={13} style={{ color: 'var(--color-primary)', flexShrink: 0 }} />
        <span>{items.length} productos</span>
      </button>
    );
  };

  const renderQuantities = (mov) => {
    if (!mov.items || mov.items.length === 0) return null;
    const totalUnits = mov.items.reduce((acc, curr) => acc + Number(curr.qtyUnits || 0), 0);
    const totalMovPounds = mov.items.reduce((acc, curr) => acc + Number(curr.qtyPounds || 0), 0);
    const totalBaskets = mov.items.reduce((acc, curr) => acc + Number(curr.qtyBaskets || 0), 0);

    return (
      <div style={{ fontVariantNumeric: 'tabular-nums' }}>
        <div style={{ fontWeight: 700, fontSize: '0.84rem', whiteSpace: 'nowrap', color: 'var(--color-text)' }}>
          {totalUnits.toLocaleString('en-US')} Unid.
        </div>
        {(totalMovPounds > 0 || totalBaskets > 0) && (
          <div style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)', whiteSpace: 'nowrap' }}>
            {totalMovPounds.toLocaleString('en-US', { maximumFractionDigits: 2 })} lbs
            {totalBaskets > 0 ? ` • ${totalBaskets.toLocaleString('en-US')} cst.` : ''}
          </div>
        )}
      </div>
    );
  };

  const handleToggleNoteMenu = (e, mov) => {
    e.stopPropagation();
    if (noteMenu && noteMenu.mov.id === mov.id) {
      setNoteMenu(null);
      return;
    }

    const rect = e.currentTarget.getBoundingClientRect();
    const menuWidth = 235;
    const menuHeight = 175;
    const viewportW = window.innerWidth;
    const viewportH = window.innerHeight;

    let left = rect.right - menuWidth;
    if (left < 10) left = 10;
    if (left + menuWidth > viewportW - 10) left = viewportW - menuWidth - 10;

    const spaceBelow = viewportH - rect.bottom;
    const top = spaceBelow < menuHeight + 12 ? Math.max(10, rect.top - menuHeight - 6) : rect.bottom + 6;

    setNoteMenu({ mov, top, left });
  };

  const handleQuickPrintNote = (mov) => {
    setNoteMenu(null);
    try {
      const res = printMovementNote({
        movement: mov,
        products,
        settings,
        contractRates
      });
      if (res?.success) {
        toast.success(`Preparando impresión de ${res.noteTitle}`);
      } else {
        toast.error(res?.message || 'No se pudo inicializar la impresión');
      }
    } catch (err) {
      console.error('Error al imprimir nota:', err);
      toast.error('Error al imprimir nota: ' + err.message);
    }
  };

  const handleQuickDownloadPdf = async (mov) => {
    setNoteMenu(null);
    try {
      const res = await downloadMovementNotePdf({
        movement: mov,
        products,
        settings,
        contractRates
      });
      toast.success(`${res?.noteTitle || 'Comprobante'} descargado en PDF`);
    } catch (err) {
      console.error('Error al descargar PDF:', err);
      toast.error('Error al descargar PDF: ' + err.message);
    }
  };

  const handleQuickDownloadWord = (mov) => {
    setNoteMenu(null);
    try {
      const res = downloadMovementNoteWord({
        movement: mov,
        products,
        settings,
        contractRates
      });
      toast.success(`${res?.noteTitle || 'Comprobante'} descargado en Word (.doc)`);
    } catch (err) {
      console.error('Error al descargar Word:', err);
      toast.error('Error al descargar Word: ' + err.message);
    }
  };

  const handleExportXlsx = async () => {
    try {
      await exportMovimientos({
        movements: sortedMovements,
        products,
        format: 'xlsx'
      });
      toast.success('Movimientos exportados a Excel (.xlsx)');
    } catch (err) {
      console.error(err);
      toast.error('Error al exportar a Excel: ' + err.message);
    }
  };

  const handleExportCsv = () => {
    try {
      exportMovimientos({
        movements: sortedMovements,
        products,
        format: 'csv'
      });
      toast.success('Movimientos exportados a CSV');
    } catch (err) {
      console.error(err);
      toast.error('Error al exportar a CSV: ' + err.message);
    }
  };

  const handleExportListPdf = async () => {
    try {
      await downloadMovementsListPdf({
        movements: sortedMovements,
        products,
        settings,
        contractRates,
        typeFilter
      });
      toast.success('Reporte de movimientos descargado en PDF');
    } catch (err) {
      console.error(err);
      toast.error('Error al exportar a PDF: ' + err.message);
    }
  };

  const handleExportListWord = () => {
    try {
      downloadMovementsListWord({
        movements: sortedMovements,
        products,
        settings,
        contractRates,
        typeFilter
      });
      toast.success('Reporte de movimientos descargado en Word (.doc)');
    } catch (err) {
      console.error(err);
      toast.error('Error al exportar a Word: ' + err.message);
    }
  };

  // Helper for generating page numbers
  const getPageNumbers = () => {
    const pages = [];
    const maxVisible = 5;
    if (totalPages <= maxVisible) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
      let start = Math.max(1, validCurrentPage - 2);
      let end = Math.min(totalPages, start + maxVisible - 1);
      if (end - start < maxVisible - 1) {
        start = Math.max(1, end - maxVisible + 1);
      }
      for (let i = start; i <= end; i++) pages.push(i);
    }
    return pages;
  };

  // Mantener referencia reactiva si el movimiento visualizado cambia de estado de sincronización
  const activeViewingMovement = viewingMovement
    ? movements.find((m) => m.id === viewingMovement.id) || viewingMovement
    : null;

  const viewingSyncInfo =
    activeViewingMovement && typeof getEntitySyncState === 'function'
      ? getEntitySyncState('movements', activeViewingMovement.id)
      : { state: activeViewingMovement?.offlinePending ? 'pending' : 'synced' };

  const effectiveViewingSyncState =
    viewingSyncInfo?.state === 'conflict'
      ? 'conflict'
      : viewingSyncInfo?.state === 'pending' || activeViewingMovement?.offlinePending
        ? 'pending'
        : 'synced';

  if (isAdding) {
    return <MovementForm onCancel={() => { setIsAdding(false); setEditingMovement(null); }} initialData={editingMovement} />;
  }

  return (
    <div>
      <div className="movements-topbar">
        <div>
          <h1 className="page-title">Movimientos</h1>
          <p style={{ color: 'var(--color-text-light)', fontSize: '0.84rem', marginTop: '0.15rem' }}>
            Registro transaccional de entradas y salidas de almacén.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap', alignItems: 'center' }}>
          {allowExport && (
            <div className="mov-export-group" role="group" aria-label="Exportar listado de movimientos">
              <button
                type="button"
                className="mov-export-btn"
                onClick={handleExportXlsx}
                disabled={sortedMovements.length === 0}
                title="Descargar movimientos filtrados en Excel (.xlsx)"
              >
                <FileSpreadsheet size={15} style={{ color: '#10b981' }} /> Excel
              </button>
              <button
                type="button"
                className="mov-export-btn"
                onClick={handleExportCsv}
                disabled={sortedMovements.length === 0}
                title="Descargar movimientos filtrados en CSV"
              >
                <Download size={15} /> CSV
              </button>
              <button
                type="button"
                className="mov-export-btn"
                onClick={handleExportListPdf}
                disabled={sortedMovements.length === 0}
                title="Descargar movimientos filtrados en PDF"
              >
                <FileOutput size={15} style={{ color: '#ef4444' }} /> PDF
              </button>
              <button
                type="button"
                className="mov-export-btn"
                onClick={handleExportListWord}
                disabled={sortedMovements.length === 0}
                title="Descargar movimientos filtrados en Word (.doc)"
              >
                <FileText size={15} style={{ color: '#3b82f6' }} /> Word
              </button>
            </div>
          )}

          {allowCreate && (
            <button
              className="btn btn-primary"
              style={{ padding: '0.5rem 0.95rem', fontSize: '0.84rem', whiteSpace: 'nowrap' }}
              onClick={() => { setEditingMovement(null); setIsAdding(true); }}
            >
              <Plus size={17} /> Registrar Movimiento
            </button>
          )}
        </div>
      </div>

      {/* Control Card: Search, Type Filter & Page Size */}
      <div className="card" style={{ marginBottom: '1.15rem', padding: '0.85rem 1.1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem' }}>
          {/* Search Input */}
          <div style={{ position: 'relative', flex: '1 1 220px', minWidth: '180px', maxWidth: '420px' }}>
            <Search size={16} style={{ position: 'absolute', left: '11px', top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-light)' }} />
            <input
              type="text"
              className="form-input"
              placeholder="Buscar documento, transporte, auditor o producto..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{ paddingLeft: '2.25rem', paddingTop: '0.48rem', paddingBottom: '0.48rem', fontSize: '0.83rem', marginBottom: 0 }}
            />
          </div>

          {/* Quick Filter Buttons & Page Size Selector */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', flexWrap: 'wrap' }}>
            {/* Type Selector */}
            <div style={{ display: 'flex', backgroundColor: 'var(--color-bg)', padding: '3px', borderRadius: 'var(--radius)', border: '1px solid var(--color-border)' }}>
              <button
                type="button"
                onClick={() => setTypeFilter('all')}
                style={{
                  padding: '0.3rem 0.68rem',
                  fontSize: '0.78rem',
                  borderRadius: '5px',
                  border: 'none',
                  background: typeFilter === 'all' ? 'var(--color-primary)' : 'transparent',
                  color: typeFilter === 'all' ? 'white' : 'var(--color-text-light)',
                  cursor: 'pointer',
                  fontWeight: typeFilter === 'all' ? '600' : 'normal'
                }}
              >
                Todos
              </button>
              <button
                type="button"
                onClick={() => setTypeFilter('in')}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.3rem',
                  padding: '0.3rem 0.68rem',
                  fontSize: '0.78rem',
                  borderRadius: '5px',
                  border: 'none',
                  background: typeFilter === 'in' ? '#059669' : 'transparent',
                  color: typeFilter === 'in' ? 'white' : 'var(--color-text-light)',
                  cursor: 'pointer',
                  fontWeight: typeFilter === 'in' ? '600' : 'normal'
                }}
              >
                <ArrowDownCircle size={13} /> Entradas
              </button>
              <button
                type="button"
                onClick={() => setTypeFilter('out')}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.3rem',
                  padding: '0.3rem 0.68rem',
                  fontSize: '0.78rem',
                  borderRadius: '5px',
                  border: 'none',
                  background: typeFilter === 'out' ? '#dc2626' : 'transparent',
                  color: typeFilter === 'out' ? 'white' : 'var(--color-text-light)',
                  cursor: 'pointer',
                  fontWeight: typeFilter === 'out' ? '600' : 'normal'
                }}
              >
                <ArrowUpCircle size={13} /> Salidas
              </button>
            </div>

            {/* Page Size Selector */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
              <span style={{ fontSize: '0.78rem', color: 'var(--color-text-light)', whiteSpace: 'nowrap' }}>Mostrar:</span>
              <select
                value={pageSize}
                onChange={(e) => setPageSize(e.target.value === 'all' ? 'all' : Number(e.target.value))}
                className="form-select"
                style={{ width: 'auto', padding: '0.32rem 0.65rem', fontSize: '0.78rem', marginBottom: 0 }}
              >
                <option value={10}>Últimos 10</option>
                <option value={25}>25</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
                <option value="all">Todos</option>
              </select>
            </div>
          </div>
        </div>

        {/* Metrics Summary Line */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginTop: '0.68rem',
          paddingTop: '0.68rem',
          borderTop: '1px solid var(--color-border)',
          fontSize: '0.8rem',
          color: 'var(--color-text-light)',
          flexWrap: 'wrap',
          gap: '0.5rem'
        }}>
          <div>
            Total libras en filtro: <strong style={{ color: 'var(--color-primary)' }}>{formattedTotalPounds} lbs</strong>
          </div>
          <div>
            {totalItems > 0 ? (
              <span>
                Mostrando <strong>{startIndex + 1} - {endIndex}</strong> de <strong>{totalItems}</strong> movimientos
              </span>
            ) : (
              <span>0 movimientos encontrados</span>
            )}
          </div>
        </div>
      </div>

      {/* Grid / Table Container Compacta y Sin Desbordamiento en Monitores Cuadrados */}
      <div className="card" style={{ padding: '0', overflow: 'hidden' }}>
        <div className="table-container" style={{ border: 'none', boxShadow: 'none', marginBottom: 0 }}>
          <table className="movements-table">
            <thead>
              <tr>
                <th style={{ width: '98px' }}>Fecha</th>
                <th style={{ width: '148px' }}>Documento</th>
                <th>Producto(s)</th>
                <th style={{ width: '142px' }}>Cantidades</th>
                <th>Transporte / Auditor</th>
                {showActions && <th style={{ width: '154px', textAlign: 'right' }}>Acciones</th>}
              </tr>
            </thead>
            <tbody>
              {paginatedMovements.length === 0 ? (
                <tr>
                  <td colSpan={showActions ? 6 : 5} style={{ textAlign: 'center', padding: '2.75rem 1rem' }}>
                    <div style={{ color: 'var(--color-text-light)' }}>
                      <p style={{ fontWeight: '500', marginBottom: '0.25rem' }}>
                        {searchTerm ? 'No se encontraron movimientos con ese criterio.' : 'No hay movimientos registrados.'}
                      </p>
                      {searchTerm && (
                        <button
                          onClick={() => setSearchTerm('')}
                          className="btn btn-outline"
                          style={{ marginTop: '0.5rem', padding: '0.25rem 0.75rem', fontSize: '0.8rem' }}
                        >
                          Limpiar búsqueda
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ) : (
                paginatedMovements.map(mov => {
                  const syncInfo = typeof getEntitySyncState === 'function'
                    ? getEntitySyncState('movements', mov.id)
                    : { state: mov.offlinePending ? 'pending' : 'synced' };
                  const effectiveSyncState =
                    syncInfo.state === 'conflict'
                      ? 'conflict'
                      : syncInfo.state === 'pending' || mov.offlinePending
                        ? 'pending'
                        : 'synced';
                  const isExit = mov.type === 'out';
                  const isMenuOpen = Boolean(noteMenu && noteMenu.mov.id === mov.id);
                  const noteLabel = isExit ? 'Nota de Envío' : 'Nota de Recibido';

                  const transportMeta = [
                    mov.equipment ? `Eq: ${mov.equipment}` : '',
                    mov.seal ? `Sello: ${mov.seal}` : ''
                  ].filter(Boolean).join(' • ');

                  return (
                    <tr key={mov.id}>
                      {/* 1. Fecha y Horario */}
                      <td style={{ whiteSpace: 'nowrap' }}>
                        <div style={{ fontWeight: 600, fontSize: '0.82rem', color: 'var(--color-text)' }}>
                          {formatDate(mov.date)}
                        </div>
                        <div style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)' }}>
                          {formatTimeShort(mov.timeStart)}{mov.timeEnd ? ` - ${formatTimeShort(mov.timeEnd)}` : ''}
                        </div>
                      </td>

                      {/* 2. Tipo + Documento + Indicador Limpio de Sincronización */}
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.2rem' }}>
                          <span
                            className={`badge ${isExit ? 'badge-danger' : 'badge-success'}`}
                            style={{ padding: '0.12rem 0.48rem', fontSize: '0.68rem', gap: '0.22rem', whiteSpace: 'nowrap' }}
                          >
                            {isExit ? <ArrowUpCircle size={11} /> : <ArrowDownCircle size={11} />}
                            {isExit ? 'Salida' : 'Entrada'}
                          </span>

                          {effectiveSyncState === 'conflict' ? (
                            <span
                              title={syncInfo.operation?.error || 'Conflicto al sincronizar con el servidor'}
                              style={{
                                fontSize: '0.63rem',
                                padding: '0.06rem 0.36rem',
                                borderRadius: '999px',
                                backgroundColor: 'rgba(239, 68, 68, 0.16)',
                                color: '#ef4444',
                                fontWeight: 700,
                                whiteSpace: 'nowrap'
                              }}
                            >
                              Revisión
                            </span>
                          ) : effectiveSyncState === 'pending' ? (
                            <span
                              title="Cambio local pendiente de sincronizar con el servidor"
                              style={{
                                fontSize: '0.63rem',
                                padding: '0.06rem 0.36rem',
                                borderRadius: '999px',
                                backgroundColor: 'rgba(245, 158, 11, 0.18)',
                                color: '#f59e0b',
                                fontWeight: 700,
                                whiteSpace: 'nowrap'
                              }}
                            >
                              Pendiente
                            </span>
                          ) : (
                            <span
                              title="Sincronizado con el servidor central"
                              style={{
                                width: '7px',
                                height: '7px',
                                borderRadius: '50%',
                                backgroundColor: '#10b981',
                                display: 'inline-block',
                                flexShrink: 0
                              }}
                            />
                          )}
                        </div>

                        <div
                          style={{
                            fontSize: '0.79rem',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            maxWidth: '155px'
                          }}
                          title={`${mov.refType || 'Doc'} #${mov.refNumber || 'S/N'}`}
                        >
                          <span style={{ color: 'var(--color-text-muted)' }}>{mov.refType}: </span>
                          <strong style={{ color: 'var(--color-text)' }}>#{mov.refNumber}</strong>
                        </div>
                      </td>

                      {/* 3. Producto(s) */}
                      <td>{renderProductPreview(mov)}</td>

                      {/* 4. Cantidades */}
                      <td>{renderQuantities(mov)}</td>

                      {/* 5. Transporte y Auditor Consolidados */}
                      <td>
                        <div
                          style={{
                            fontWeight: 600,
                            fontSize: '0.81rem',
                            color: 'var(--color-text)',
                            maxWidth: '185px',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap'
                          }}
                          title={mov.carrier || 'N/A'}
                        >
                          {mov.carrier || 'N/A'}
                        </div>
                        <div
                          style={{
                            fontSize: '0.72rem',
                            color: 'var(--color-text-muted)',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.35rem',
                            flexWrap: 'wrap'
                          }}
                          title={`${transportMeta}${transportMeta ? ' • ' : ''}Auditor: ${mov.auditUser || 'Sistema'}`}
                        >
                          {transportMeta && <span style={{ whiteSpace: 'nowrap' }}>{transportMeta}</span>}
                          <span
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '0.18rem',
                              color: 'var(--color-text-light)',
                              fontWeight: 500,
                              whiteSpace: 'nowrap'
                            }}
                          >
                            {transportMeta ? '• ' : ''}
                            <User size={11} style={{ opacity: 0.75 }} />
                            {mov.auditUser || 'Sistema'}
                          </span>
                        </div>
                      </td>

                      {/* 6. Barra de Acciones Compacta y Uniforme */}
                      {showActions && (
                        <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                          <div className="mov-action-bar">
                            <button
                              type="button"
                              onClick={() => setViewingMovement(mov)}
                              className="mov-icon-btn view-btn"
                              title="Ver detalle completo del movimiento"
                              aria-label="Ver detalle completo del movimiento"
                            >
                              <Eye size={15} />
                            </button>

                            <button
                              type="button"
                              onClick={(e) => handleToggleNoteMenu(e, mov)}
                              className={`mov-icon-btn ${isExit ? 'note-out-btn' : 'note-in-btn'} ${isMenuOpen ? 'active' : ''}`}
                              title={`${noteLabel}: Imprimir / PDF / Word`}
                              aria-label={`${noteLabel}: Imprimir / PDF / Word`}
                              aria-expanded={isMenuOpen}
                            >
                              <Printer size={14} />
                              <ChevronDown size={11} />
                            </button>

                            {allowEdit && (
                              <button
                                type="button"
                                onClick={() => { setEditingMovement(mov); setIsAdding(true); }}
                                className="mov-icon-btn edit-btn"
                                title="Editar este movimiento"
                                aria-label="Editar este movimiento"
                              >
                                <Edit3 size={14} />
                              </button>
                            )}

                            {allowDelete && (
                              <button
                                type="button"
                                onClick={async () => {
                                  if (window.confirm('¿Seguro que deseas eliminar este movimiento? Afectará el stock disponible.')) {
                                    const res = await deleteMovement(mov.id);
                                    if (res?.success) {
                                      toast.success('Movimiento eliminado correctamente');
                                    } else {
                                      toast.error(res?.message || 'No fue posible eliminar el movimiento');
                                    }
                                  }
                                }}
                                className="mov-icon-btn delete-btn"
                                title="Eliminar este movimiento"
                                aria-label="Eliminar este movimiento"
                              >
                                <Trash2 size={14} />
                              </button>
                            )}
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Bottom Pagination Toolbar */}
        {!isAll && totalPages > 1 && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0.75rem 1.1rem',
            backgroundColor: 'var(--color-card)',
            borderTop: '1px solid var(--color-border)',
            flexWrap: 'wrap',
            gap: '0.75rem'
          }}>
            <div style={{ fontSize: '0.82rem', color: 'var(--color-text-light)' }}>
              Página <strong>{validCurrentPage}</strong> de <strong>{totalPages}</strong> ({totalItems} movimientos)
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
              <button
                type="button"
                className="btn btn-outline"
                onClick={() => setCurrentPage(1)}
                disabled={validCurrentPage === 1}
                style={{ padding: '0.3rem 0.5rem', fontSize: '0.78rem' }}
                title="Primera página"
              >
                <ChevronsLeft size={15} />
              </button>
              <button
                type="button"
                className="btn btn-outline"
                onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                disabled={validCurrentPage === 1}
                style={{ padding: '0.3rem 0.5rem', fontSize: '0.78rem' }}
                title="Página anterior"
              >
                <ChevronLeft size={15} />
              </button>

              {getPageNumbers().map(pageNum => (
                <button
                  key={pageNum}
                  type="button"
                  onClick={() => setCurrentPage(pageNum)}
                  style={{
                    padding: '0.3rem 0.65rem',
                    fontSize: '0.78rem',
                    borderRadius: 'var(--radius)',
                    border: pageNum === validCurrentPage ? '1px solid var(--color-primary)' : '1px solid var(--color-border)',
                    background: pageNum === validCurrentPage ? 'var(--color-primary)' : 'transparent',
                    color: pageNum === validCurrentPage ? 'white' : 'var(--color-text)',
                    cursor: 'pointer',
                    fontWeight: pageNum === validCurrentPage ? '700' : '500',
                    minWidth: '30px'
                  }}
                >
                  {pageNum}
                </button>
              ))}

              <button
                type="button"
                className="btn btn-outline"
                onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                disabled={validCurrentPage === totalPages}
                style={{ padding: '0.3rem 0.5rem', fontSize: '0.78rem' }}
                title="Página siguiente"
              >
                <ChevronRight size={15} />
              </button>
              <button
                type="button"
                className="btn btn-outline"
                onClick={() => setCurrentPage(totalPages)}
                disabled={validCurrentPage === totalPages}
                style={{ padding: '0.3rem 0.5rem', fontSize: '0.78rem' }}
                title="Última página"
              >
                <ChevronsRight size={15} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Menú Flotante de Comprobante (Imprimir / PDF / Word) libre de recortes de tabla */}
      {noteMenu && (
        <div
          ref={menuRef}
          className="mov-popover-menu"
          style={{ top: `${noteMenu.top}px`, left: `${noteMenu.left}px` }}
          role="menu"
        >
          <div className="mov-popover-header">
            <div
              style={{
                fontSize: '0.68rem',
                fontWeight: 800,
                letterSpacing: '0.05em',
                textTransform: 'uppercase',
                color: noteMenu.mov.type === 'out' ? 'var(--color-primary)' : 'var(--color-success)'
              }}
            >
              {noteMenu.mov.type === 'out' ? 'NOTA DE ENVÍO' : 'NOTA DE RECIBIDO'}
            </div>
            <div style={{ fontSize: '0.74rem', color: 'var(--color-text-muted)', marginTop: '1px' }}>
              {noteMenu.mov.refType} #{noteMenu.mov.refNumber}
            </div>
          </div>

          <button
            type="button"
            className="mov-popover-item"
            onClick={() => handleQuickPrintNote(noteMenu.mov)}
            role="menuitem"
          >
            <Printer size={15} style={{ color: 'var(--color-primary)', flexShrink: 0 }} />
            <span>Imprimir {noteMenu.mov.type === 'out' ? 'Nota de Envío' : 'Nota de Recibido'}</span>
          </button>

          <button
            type="button"
            className="mov-popover-item"
            onClick={() => handleQuickDownloadPdf(noteMenu.mov)}
            role="menuitem"
          >
            <FileOutput size={15} style={{ color: '#ef4444', flexShrink: 0 }} />
            <span>Descargar en PDF (.pdf)</span>
          </button>

          <button
            type="button"
            className="mov-popover-item"
            onClick={() => handleQuickDownloadWord(noteMenu.mov)}
            role="menuitem"
          >
            <FileText size={15} style={{ color: '#3b82f6', flexShrink: 0 }} />
            <span>Descargar en Word (.doc)</span>
          </button>
        </div>
      )}

      {/* Modal de Detalle Completo del Movimiento e Impresión de Nota de Envío / Nota de Recibido */}
      {activeViewingMovement && (
        <MovementDetailModal
          movement={activeViewingMovement}
          onClose={() => setViewingMovement(null)}
          allowEdit={allowEdit}
          onEdit={(mov) => {
            setViewingMovement(null);
            setEditingMovement(mov);
            setIsAdding(true);
          }}
          syncState={effectiveViewingSyncState}
          syncError={viewingSyncInfo?.operation?.error || ''}
        />
      )}
    </div>
  );
};

export default MovementList;
