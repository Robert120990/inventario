import React, { useState, useEffect } from 'react';
import { useInventory } from '../../context/InventoryContext';
import { 
  Plus, Download, Search, FileSpreadsheet, 
  ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, 
  SlidersHorizontal, ArrowDownCircle, ArrowUpCircle 
} from 'lucide-react';
import { exportMovimientos } from '../../utils/exportManager';
import MovementForm from './MovementForm';
import { formatDate } from '../../utils/formatUtils';
import { toast } from 'react-hot-toast';

const MovementList = () => {
  const { movements, products, deleteMovement, canCreate, canEdit, canDelete, canExport } = useInventory();
  const [isAdding, setIsAdding] = useState(false);
  const [editingMovement, setEditingMovement] = useState(null);
  
  const allowCreate = canCreate('movements');
  const allowEdit = canEdit('movements');
  const allowDelete = canDelete('movements');
  const allowExport = canExport('movements');
  const showActions = allowEdit || allowDelete;

  // Filters & Pagination State (Default: 10 most recent movements)
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState('all'); // 'all', 'in', 'out'
  const [pageSize, setPageSize] = useState(10); // Default to 10 items
  const [currentPage, setCurrentPage] = useState(1);

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
      const p = products.find(prod => prod.id === it.productId);
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

  const getProductName = (id) => {
    const product = products.find(p => p.id === id);
    return product ? `${product.sku} - ${product.description}` : 'Desconocido';
  };

  const renderProductPreview = (mov) => {
    if (!mov.items || mov.items.length === 0) return 'Sin productos';
    if (mov.items.length === 1) return getProductName(mov.items[0].productId);
    return `Varios Productos (${mov.items.length})`;
  };

  const renderQuantities = (mov) => {
    if (!mov.items || mov.items.length === 0) return null;
    const totalUnits = mov.items.reduce((acc, curr) => acc + Number(curr.qtyUnits || 0), 0);
    const totalMovPounds = mov.items.reduce((acc, curr) => acc + Number(curr.qtyPounds || 0), 0);
    const totalBaskets = mov.items.reduce((acc, curr) => acc + Number(curr.qtyBaskets || 0), 0);
    
    return (
      <>
        <div style={{ fontWeight: '600' }}>{totalUnits.toLocaleString()} Unid.</div>
        {(totalMovPounds > 0 || totalBaskets > 0) && (
          <div style={{ fontSize: '0.75rem', color: 'var(--color-text-light)' }}>
            {totalMovPounds.toLocaleString()} lbs • {totalBaskets} cestas
          </div>
        )}
      </>
    );
  };

  const handleExportXlsx = () => {
    try {
      exportMovimientos({
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

  if (isAdding) {
    return <MovementForm onCancel={() => { setIsAdding(false); setEditingMovement(null); }} initialData={editingMovement} />;
  }

  return (
    <div>
      <div className="topbar">
        <div>
          <h1 className="page-title">Movimientos</h1>
          <p style={{ color: 'var(--color-text-light)', fontSize: '0.875rem', marginTop: '0.25rem' }}>
            Registro transaccional de entradas y salidas con carga optimizada.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
          {allowExport && (
            <>
              <button className="btn btn-primary" onClick={handleExportXlsx} disabled={sortedMovements.length === 0} title="Descargar todos los movimientos filtrados en Excel (.xlsx)">
                <FileSpreadsheet size={18} /> Exportar Excel (.xlsx)
              </button>
              <button className="btn btn-outline" onClick={handleExportCsv} disabled={sortedMovements.length === 0} title="Descargar todos los movimientos filtrados en CSV estructurado">
                <Download size={18} /> Exportar CSV
              </button>
            </>
          )}
          {allowCreate && (
            <button className="btn btn-primary" onClick={() => { setEditingMovement(null); setIsAdding(true); }}>
              <Plus size={18} /> Registrar Movimiento
            </button>
          )}
        </div>
      </div>

      {/* Control Card: Search, Type Filter & Page Size */}
      <div className="card" style={{ marginBottom: '1.5rem', padding: '1rem 1.25rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
          {/* Search Input */}
          <div style={{ position: 'relative', flex: '1 1 280px', maxWidth: '450px' }}>
            <Search size={18} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-light)' }} />
            <input 
              type="text" 
              className="form-input" 
              placeholder="Buscar por documento, transporte, auditor o producto..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{ paddingLeft: '2.5rem', marginBottom: 0 }}
            />
          </div>

          {/* Quick Filter Buttons & Page Size Selector */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
            {/* Type Selector */}
            <div style={{ display: 'flex', backgroundColor: 'var(--color-bg)', padding: '3px', borderRadius: 'var(--radius)', border: '1px solid var(--color-border)' }}>
              <button
                type="button"
                onClick={() => setTypeFilter('all')}
                style={{
                  padding: '0.35rem 0.75rem',
                  fontSize: '0.8rem',
                  borderRadius: '4px',
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
                  gap: '0.35rem',
                  padding: '0.35rem 0.75rem',
                  fontSize: '0.8rem',
                  borderRadius: '4px',
                  border: 'none',
                  background: typeFilter === 'in' ? 'var(--color-success)' : 'transparent',
                  color: typeFilter === 'in' ? 'white' : 'var(--color-text-light)',
                  cursor: 'pointer',
                  fontWeight: typeFilter === 'in' ? '600' : 'normal'
                }}
              >
                <ArrowDownCircle size={14} /> Entradas
              </button>
              <button
                type="button"
                onClick={() => setTypeFilter('out')}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.35rem',
                  padding: '0.35rem 0.75rem',
                  fontSize: '0.8rem',
                  borderRadius: '4px',
                  border: 'none',
                  background: typeFilter === 'out' ? 'var(--color-danger)' : 'transparent',
                  color: typeFilter === 'out' ? 'white' : 'var(--color-text-light)',
                  cursor: 'pointer',
                  fontWeight: typeFilter === 'out' ? '600' : 'normal'
                }}
              >
                <ArrowUpCircle size={14} /> Salidas
              </button>
            </div>

            {/* Page Size Selector */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <span style={{ fontSize: '0.8rem', color: 'var(--color-text-light)', whiteSpace: 'nowrap' }}>Mostrar:</span>
              <select
                value={pageSize}
                onChange={(e) => setPageSize(e.target.value === 'all' ? 'all' : Number(e.target.value))}
                className="form-select"
                style={{ width: 'auto', padding: '0.35rem 0.75rem', fontSize: '0.8rem', marginBottom: 0 }}
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
          marginTop: '0.85rem', 
          paddingTop: '0.85rem', 
          borderTop: '1px solid var(--color-border)', 
          fontSize: '0.85rem', 
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
                {pageSize === 10 && totalItems > 10 && (
                  <span className="badge badge-primary" style={{ marginLeft: '0.5rem', fontSize: '0.7rem' }}>
                    ⚡ Modo Ultra-Rápido (Últimos 10)
                  </span>
                )}
              </span>
            ) : (
              <span>0 movimientos encontrados</span>
            )}
          </div>
        </div>
      </div>

      {/* Grid / Table Container */}
      <div className="card" style={{ padding: '0', overflow: 'hidden' }}>
        <div className="table-container" style={{ border: 'none', boxShadow: 'none', marginBottom: 0 }}>
          <table>
            <thead>
              <tr>
                <th>Fecha y Hora</th>
                <th>Tipo</th>
                <th>Documento</th>
                <th>Producto(s)</th>
                <th>Cantidades</th>
                <th>Transporte</th>
                <th>Auditor</th>
                {showActions && <th style={{ textAlign: 'center' }}>Acciones</th>}
              </tr>
            </thead>
            <tbody>
              {paginatedMovements.length === 0 ? (
                <tr>
                  <td colSpan={showActions ? 8 : 7} style={{ textAlign: 'center', padding: '3rem 1rem' }}>
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
                paginatedMovements.map(mov => (
                  <tr key={mov.id}>
                    <td>
                      <div style={{ fontWeight: '600', color: 'var(--color-text)' }}>{formatDate(mov.date)}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--color-text-light)' }}>
                        {mov.timeStart || '--:--'} {mov.timeEnd ? `- ${mov.timeEnd}` : ''}
                      </div>
                    </td>
                    <td>
                      <span className={`badge ${mov.type === 'in' ? 'badge-success' : 'badge-danger'}`}>
                        {mov.type === 'in' ? 'Entrada' : 'Salida'}
                      </span>
                    </td>
                    <td>
                      <div style={{ fontWeight: '600', color: 'var(--color-text)' }}>{mov.refType}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--color-text-light)' }}>#{mov.refNumber}</div>
                    </td>
                    <td style={{ fontWeight: '500' }}>{renderProductPreview(mov)}</td>
                    <td>
                      {renderQuantities(mov)}
                    </td>
                    <td>
                      <div style={{ fontWeight: '500' }}>{mov.carrier || 'N/A'}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--color-text-light)' }}>
                        {mov.equipment ? `Eq: ${mov.equipment}` : ''} {mov.seal ? `• Sello: ${mov.seal}` : ''}
                      </div>
                    </td>
                    <td>
                      <span style={{ fontSize: '0.85rem' }}>{mov.auditUser || 'Sistema'}</span>
                    </td>
                    {showActions && (
                      <td style={{ textAlign: 'center' }}>
                        <div style={{ display: 'flex', gap: '0.4rem', justifyContent: 'center' }}>
                          {allowEdit && (
                            <button 
                              onClick={() => { setEditingMovement(mov); setIsAdding(true); }} 
                              className="btn btn-outline" 
                              style={{ padding: '0.25rem 0.5rem', fontSize: '0.8rem' }}
                              title="Editar este movimiento"
                            >
                              Editar
                            </button>
                          )}
                          {allowDelete && (
                            <button 
                              onClick={() => { 
                                if (window.confirm('¿Seguro que deseas eliminar este movimiento? Afectará el stock disponible.')) {
                                  deleteMovement(mov.id);
                                }
                              }} 
                              className="btn btn-danger" 
                              style={{ padding: '0.25rem 0.5rem', fontSize: '0.8rem' }}
                              title="Eliminar este movimiento"
                            >
                              Eliminar
                            </button>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                ))
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
            padding: '0.85rem 1.25rem',
            backgroundColor: 'var(--color-card)',
            borderTop: '1px solid var(--color-border)',
            flexWrap: 'wrap',
            gap: '0.75rem'
          }}>
            <div style={{ fontSize: '0.85rem', color: 'var(--color-text-light)' }}>
              Página <strong>{validCurrentPage}</strong> de <strong>{totalPages}</strong> ({totalItems} movimientos)
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
              <button
                type="button"
                className="btn btn-outline"
                onClick={() => setCurrentPage(1)}
                disabled={validCurrentPage === 1}
                style={{ padding: '0.35rem 0.55rem', fontSize: '0.8rem' }}
                title="Primera página"
              >
                <ChevronsLeft size={16} />
              </button>
              <button
                type="button"
                className="btn btn-outline"
                onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                disabled={validCurrentPage === 1}
                style={{ padding: '0.35rem 0.55rem', fontSize: '0.8rem' }}
                title="Página anterior"
              >
                <ChevronLeft size={16} />
              </button>

              {getPageNumbers().map(pageNum => (
                <button
                  key={pageNum}
                  type="button"
                  onClick={() => setCurrentPage(pageNum)}
                  style={{
                    padding: '0.35rem 0.75rem',
                    fontSize: '0.8rem',
                    borderRadius: 'var(--radius)',
                    border: pageNum === validCurrentPage ? '1px solid var(--color-primary)' : '1px solid var(--color-border)',
                    background: pageNum === validCurrentPage ? 'var(--color-primary)' : 'transparent',
                    color: pageNum === validCurrentPage ? 'white' : 'var(--color-text)',
                    cursor: 'pointer',
                    fontWeight: pageNum === validCurrentPage ? '700' : '500',
                    minWidth: '32px'
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
                style={{ padding: '0.35rem 0.55rem', fontSize: '0.8rem' }}
                title="Página siguiente"
              >
                <ChevronRight size={16} />
              </button>
              <button
                type="button"
                className="btn btn-outline"
                onClick={() => setCurrentPage(totalPages)}
                disabled={validCurrentPage === totalPages}
                style={{ padding: '0.35rem 0.55rem', fontSize: '0.8rem' }}
                title="Última página"
              >
                <ChevronsRight size={16} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default MovementList;
