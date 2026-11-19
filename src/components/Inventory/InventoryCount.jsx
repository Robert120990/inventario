import React, { useMemo, useState, useEffect, useCallback } from 'react';
import { ClipboardCheck, Search, Save, RotateCcw, AlertTriangle, CheckCircle2, History, RefreshCw } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { useInventory } from '../../context/InventoryContext';
import { confirmAction } from '../Common/ConfirmDialog';
import { formatTimestampLocal } from '../../utils/formatUtils';

const normalize = (value) => String(value ?? '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, ' ')
  .trim();

const matchesTerms = (product, query) => {
  const terms = normalize(query).split(/\s+/).filter(Boolean);
  if (!terms.length) return false;
  const productTerms = normalize([product.sku, product.description, product.category].join(' '))
    .split(/\s+/).filter(Boolean);
  return terms.every((term) => productTerms.some((productTerm) => productTerm.startsWith(term)));
};

const toStock = (product) => ({
  stockUnits: Number(product?.stockUnits || 0),
  stockPounds: Number(product?.stockPounds || 0),
  stockBaskets: Number(product?.stockBaskets || 0)
});

const InventoryCount = () => {
  const { products, currentUser, adjustProductStock, fetchInventoryAdjustments, canCreate, canEdit } = useInventory();
  const [query, setQuery] = useState('');
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [counted, setCounted] = useState(toStock());
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [lastAdjustment, setLastAdjustment] = useState(null);
  const [adjustments, setAdjustments] = useState([]);
  const [loadingAdjustments, setLoadingAdjustments] = useState(false);
  const [onlySelectedProduct, setOnlySelectedProduct] = useState(false);
  const allowEdit = canCreate('inventory-count') || canEdit('inventory-count');

  const loadAdjustments = useCallback(async (productId = null) => {
    if (typeof fetchInventoryAdjustments !== 'function') return;
    setLoadingAdjustments(true);
    try {
      const rows = await fetchInventoryAdjustments(productId);
      setAdjustments(Array.isArray(rows) ? rows : []);
    } finally {
      setLoadingAdjustments(false);
    }
  }, [fetchInventoryAdjustments]);

  useEffect(() => {
    loadAdjustments(onlySelectedProduct && selectedProduct ? selectedProduct.id : null);
  }, [loadAdjustments, onlySelectedProduct, selectedProduct]);

  const results = useMemo(() => {
    if (!query.trim()) return [];
    return products.filter((product) => matchesTerms(product, query)).slice(0, 12);
  }, [products, query]);

  const selectProduct = (product) => {
    setSelectedProduct(product);
    setCounted(toStock(product));
    setQuery(`${product.sku} — ${product.description}`);
    setLastAdjustment(null);
  };

  const resetCount = () => {
    if (selectedProduct) setCounted(toStock(selectedProduct));
    setReason('');
  };

  const updateCount = (field, value) => {
    if (value === '') {
      setCounted((current) => ({ ...current, [field]: '' }));
      return;
    }
    const parsed = Number(value);
    if (parsed >= 0) setCounted((current) => ({ ...current, [field]: parsed }));
  };

  const differences = selectedProduct ? {
    stockUnits: Number(counted.stockUnits || 0) - Number(selectedProduct.stockUnits || 0),
    stockPounds: Number(counted.stockPounds || 0) - Number(selectedProduct.stockPounds || 0),
    stockBaskets: Number(counted.stockBaskets || 0) - Number(selectedProduct.stockBaskets || 0)
  } : toStock();

  const hasChanges = Object.values(differences).some((value) => Math.abs(value) > 0.0001);

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!selectedProduct || !hasChanges || !reason.trim()) return;

    const confirmed = await confirmAction({
      title: 'Confirmar ajuste de inventario',
      message: `¿Actualizar el inventario de ${selectedProduct.sku}? Esta acción reemplazará las existencias actuales por el conteo físico.`,
      confirmLabel: 'Actualizar inventario',
      variant: 'primary'
    });
    if (!confirmed) return;

    setSaving(true);
    const result = await adjustProductStock(selectedProduct.id, {
      stockUnits: Number(counted.stockUnits || 0),
      stockPounds: Number(counted.stockPounds || 0),
      stockBaskets: Number(counted.stockBaskets || 0),
      reason: reason.trim(),
      auditUser: currentUser?.username || 'desconocido'
    });
    setSaving(false);

    if (!result.success) {
      toast.error(result.message || 'No fue posible actualizar el inventario');
      return;
    }

    setSelectedProduct(result.product);
    setCounted(toStock(result.product));
    setReason('');
    setLastAdjustment(result.adjustment);
    toast.success('Inventario actualizado y auditado');
    loadAdjustments(onlySelectedProduct && result.product ? result.product.id : null);
  };

  const difference = (value, decimals = 0) => {
    const number = Number(value || 0);
    const prefix = number > 0 ? '+' : '';
    return `${prefix}${number.toLocaleString('es-SV', { maximumFractionDigits: decimals })}`;
  };

  return (
    <div>
      <div className="topbar">
        <div>
          <h1 className="page-title">Toma de Inventario</h1>
          <p style={{ color: 'var(--color-text-light)', marginTop: '0.35rem' }}>
            Inicializa o corrige puntualmente las existencias de un producto.
          </p>
        </div>
      </div>

      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <label className="form-label" htmlFor="inventory-product-search">Buscar producto</label>
        <div style={{ position: 'relative', maxWidth: '760px' }}>
          <Search size={18} style={{ position: 'absolute', left: 12, top: 12, color: 'var(--color-text-light)' }} />
          <input
            id="inventory-product-search"
            type="search"
            className="form-input"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              if (selectedProduct && event.target.value !== `${selectedProduct.sku} — ${selectedProduct.description}`) {
                setSelectedProduct(null);
              }
            }}
            placeholder="Código o palabras parciales, ej. Poll agridulc"
            autoComplete="off"
            style={{ paddingLeft: '2.5rem' }}
          />
          {!selectedProduct && query.trim() && (
            <div style={{
              position: 'absolute', zIndex: 10, top: 'calc(100% + 4px)', left: 0, right: 0,
              background: 'var(--color-card)', border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius)', boxShadow: 'var(--shadow)', maxHeight: 340, overflowY: 'auto'
            }}>
              {results.length ? results.map((product) => (
                <button
                  key={product.id}
                  type="button"
                  onClick={() => selectProduct(product)}
                  style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '0.5rem',
                    width: '100%',
                    padding: '0.85rem 1rem',
                    border: 'none',
                    borderBottom: '1px solid var(--color-border)',
                    background: 'transparent',
                    color: 'var(--color-text)',
                    textAlign: 'left',
                    cursor: 'pointer'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
                    <strong style={{ color: 'var(--color-primary)' }}>{product.sku}</strong>
                    <span>{product.description}</span>
                  </div>
                  <small style={{ color: 'var(--color-text-light)', marginLeft: 'auto' }}>{product.category}</small>
                </button>
              )) : (
                <div style={{ padding: '1rem', color: 'var(--color-text-light)' }}>No se encontraron productos.</div>
              )}
            </div>
          )}
        </div>
      </div>

      {!selectedProduct ? (
        <div className="card" style={{ textAlign: 'center', padding: '3rem' }}>
          <ClipboardCheck size={42} style={{ color: 'var(--color-primary)', marginBottom: '1rem' }} />
          <h3>Selecciona un producto</h3>
          <p style={{ color: 'var(--color-text-light)', marginTop: '0.5rem' }}>
            El ajuste afecta únicamente al producto seleccionado.
          </p>
        </div>
      ) : (
        <form onSubmit={handleSubmit}>
          <div className="card" style={{ marginBottom: '1.5rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
              <div>
                <div style={{ color: 'var(--color-text-light)', fontSize: '0.8rem' }}>PRODUCTO SELECCIONADO</div>
                <h2 style={{ margin: '0.35rem 0' }}>{selectedProduct.description}</h2>
                <span style={{ fontWeight: 600 }}>{selectedProduct.sku}</span>
                <span style={{ marginLeft: '0.75rem', color: 'var(--color-text-light)' }}>{selectedProduct.category}</span>
              </div>
              <button type="button" className="btn btn-outline" onClick={() => { setSelectedProduct(null); setQuery(''); }}>
                Cambiar producto
              </button>
            </div>
          </div>

          <div className="grid grid-cols-3" style={{ marginBottom: '1.5rem' }}>
            {[
              ['stockUnits', 'Unidades', 1],
              ['stockPounds', 'Libras', 0.001],
              ['stockBaskets', 'Cestas', 1]
            ].map(([field, label, step]) => (
              <div className="card" key={field}>
                <div style={{ color: 'var(--color-text-light)', marginBottom: '0.75rem' }}>{label}</div>
                <div style={{ fontSize: '0.85rem', marginBottom: '0.5rem' }}>
                  Sistema: <strong>{Number(selectedProduct[field] || 0).toLocaleString('es-SV')}</strong>
                </div>
                <label className="form-label" htmlFor={field}>Conteo físico</label>
                <input
                  id={field}
                  type="number"
                  min="0"
                  step={step}
                  className="form-input"
                  value={counted[field]}
                  onChange={(event) => updateCount(field, event.target.value)}
                  required
                />
                <div style={{
                  marginTop: '0.75rem', fontWeight: 600,
                  color: differences[field] === 0 ? 'var(--color-text-light)' : differences[field] > 0 ? '#00b894' : 'var(--color-danger)'
                }}>
                  Diferencia: {difference(differences[field], field === 'stockPounds' ? 3 : 0)}
                </div>
              </div>
            ))}
          </div>

          <div className="card">
            {hasChanges && (
              <div style={{
                display: 'flex', gap: '0.75rem', alignItems: 'flex-start', padding: '0.85rem',
                background: 'rgba(241, 196, 15, 0.12)', borderRadius: 'var(--radius)', marginBottom: '1rem'
              }}>
                <AlertTriangle size={20} color="#b7791f" />
                <div>
                  <strong>Se reemplazarán las existencias actuales.</strong>
                  <div style={{ fontSize: '0.85rem', marginTop: '0.2rem' }}>La operación quedará registrada a nombre de {currentUser?.username}.</div>
                </div>
              </div>
            )}

            <div className="form-group">
              <label className="form-label" htmlFor="inventory-reason">Motivo u observación</label>
              <textarea
                id="inventory-reason"
                className="form-input"
                rows="3"
                maxLength="500"
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                placeholder="Ej. Inventario inicial, conteo físico mensual o corrección por reconteo..."
                required
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', flexWrap: 'wrap' }}>
              <button type="button" className="btn btn-outline" onClick={resetCount}>
                <RotateCcw size={18} /> Restablecer
              </button>
              {allowEdit ? (
                <button type="submit" className="btn btn-primary" disabled={!hasChanges || !reason.trim() || saving}>
                  <Save size={18} /> {saving ? 'Guardando...' : 'Actualizar inventario'}
                </button>
              ) : (
                <span className="badge badge-gray" style={{ padding: '0.5rem 1rem', alignSelf: 'center' }}>
                  Solo lectura (Sin permisos para ajustar)
                </span>
              )}
            </div>
          </div>
        </form>
      )}

      {lastAdjustment && (
        <div className="card" style={{ marginTop: '1.5rem', borderLeft: '4px solid #00b894' }}>
          <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
            <CheckCircle2 size={22} color="#00b894" />
            <div>
              <strong>Ajuste registrado correctamente</strong>
              <div style={{ color: 'var(--color-text-light)', fontSize: '0.85rem', marginTop: '0.2rem' }}>
                ID {lastAdjustment.id} · {lastAdjustment.reason}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Historial Reciente de Ajustes Físicos */}
      <div className="card" style={{ marginTop: '1.5rem', padding: '1rem 1.25rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '0.9rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <History size={18} style={{ color: 'var(--color-primary)' }} />
            <h3 style={{ margin: 0, fontSize: '1.05rem', color: 'var(--color-text)' }}>
              Historial Reciente de Ajustes Físicos
            </h3>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', backgroundColor: 'var(--color-bg)', padding: '3px', borderRadius: 'var(--radius)', border: '1px solid var(--color-border)' }}>
              <button
                type="button"
                onClick={() => setOnlySelectedProduct(false)}
                style={{
                  padding: '0.28rem 0.65rem',
                  fontSize: '0.76rem',
                  borderRadius: '5px',
                  border: 'none',
                  background: !onlySelectedProduct ? 'var(--color-primary)' : 'transparent',
                  color: !onlySelectedProduct ? 'white' : 'var(--color-text-light)',
                  cursor: 'pointer',
                  fontWeight: !onlySelectedProduct ? '600' : 'normal'
                }}
              >
                Todos los recientes
              </button>
              <button
                type="button"
                disabled={!selectedProduct}
                onClick={() => setOnlySelectedProduct(true)}
                style={{
                  padding: '0.28rem 0.65rem',
                  fontSize: '0.76rem',
                  borderRadius: '5px',
                  border: 'none',
                  background: onlySelectedProduct && selectedProduct ? 'var(--color-primary)' : 'transparent',
                  color: onlySelectedProduct && selectedProduct ? 'white' : 'var(--color-text-light)',
                  cursor: selectedProduct ? 'pointer' : 'not-allowed',
                  opacity: selectedProduct ? 1 : 0.5,
                  fontWeight: onlySelectedProduct && selectedProduct ? '600' : 'normal'
                }}
              >
                Solo producto seleccionado
              </button>
            </div>

            <button
              type="button"
              className="btn btn-outline"
              disabled={loadingAdjustments}
              onClick={() => loadAdjustments(onlySelectedProduct && selectedProduct ? selectedProduct.id : null)}
              style={{ padding: '0.32rem 0.65rem', fontSize: '0.78rem' }}
            >
              <RefreshCw size={14} className={loadingAdjustments ? 'spin-icon' : ''} /> Actualizar
            </button>
          </div>
        </div>

        <div className="table-container" style={{ border: 'none', boxShadow: 'none', marginBottom: 0 }}>
          <table>
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Producto</th>
                <th>Unidades</th>
                <th>Libras</th>
                <th>Cestas</th>
                <th>Motivo</th>
                <th>Auditor</th>
              </tr>
            </thead>
            <tbody>
              {loadingAdjustments ? (
                <tr>
                  <td colSpan="7" style={{ textAlign: 'center', padding: '1.5rem', color: 'var(--color-text-light)' }}>
                    Cargando historial de ajustes...
                  </td>
                </tr>
              ) : adjustments.length === 0 ? (
                <tr>
                  <td colSpan="7" style={{ textAlign: 'center', padding: '1.5rem', color: 'var(--color-text-light)' }}>
                    No hay ajustes físicos registrados para este filtro.
                  </td>
                </tr>
              ) : (
                adjustments.map((adj) => {
                  const diffU = Number(adj.countedUnits || 0) - Number(adj.previousUnits || 0);
                  const diffP = Number(adj.countedPounds || 0) - Number(adj.previousPounds || 0);
                  const diffB = Number(adj.countedBaskets || 0) - Number(adj.previousBaskets || 0);
                  const createdStr = adj.created_at
                    ? `${formatTimestampLocal(adj.created_at)} ${new Date(String(adj.created_at).includes('T') ? adj.created_at : String(adj.created_at).replace(' ', 'T')).toLocaleTimeString('es-SV', { hour: '2-digit', minute: '2-digit' })}`
                    : '—';

                  const renderDeltaCell = (prev, curr, delta, decimals = 0) => (
                    <div style={{ fontSize: '0.78rem', fontVariantNumeric: 'tabular-nums' }}>
                      <div>
                        <span style={{ color: 'var(--color-text-muted)' }}>
                          {Number(prev || 0).toLocaleString('es-SV', { maximumFractionDigits: decimals })}
                        </span>
                        {' → '}
                        <strong>
                          {Number(curr || 0).toLocaleString('es-SV', { maximumFractionDigits: decimals })}
                        </strong>
                      </div>
                      <div style={{
                        fontSize: '0.71rem',
                        fontWeight: 600,
                        color: Math.abs(delta) < 0.0001
                          ? 'var(--color-text-muted)'
                          : delta > 0
                            ? '#00b894'
                            : 'var(--color-danger)'
                      }}>
                        {difference(delta, decimals)}
                      </div>
                    </div>
                  );

                  return (
                    <tr key={adj.id}>
                      <td style={{ whiteSpace: 'nowrap', fontSize: '0.78rem' }}>{createdStr}</td>
                      <td>
                        <div style={{ fontWeight: 700, fontSize: '0.76rem', color: 'var(--color-primary)', fontFamily: 'monospace' }}>
                          {adj.sku || adj.productId}
                        </div>
                        <div style={{ fontSize: '0.78rem', color: 'var(--color-text)' }}>
                          {adj.description || ''}
                        </div>
                      </td>
                      <td>{renderDeltaCell(adj.previousUnits, adj.countedUnits, diffU, 0)}</td>
                      <td>{renderDeltaCell(adj.previousPounds, adj.countedPounds, diffP, 3)}</td>
                      <td>{renderDeltaCell(adj.previousBaskets, adj.countedBaskets, diffB, 0)}</td>
                      <td style={{ maxWidth: '240px', fontSize: '0.78rem' }}>{adj.reason || '—'}</td>
                      <td style={{ whiteSpace: 'nowrap', fontSize: '0.78rem', fontWeight: 500 }}>{adj.auditUser || 'Sistema'}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default InventoryCount;
