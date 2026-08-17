import React, { useMemo, useState } from 'react';
import { ClipboardCheck, Search, Save, RotateCcw, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { useInventory } from '../../context/InventoryContext';

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
  const { products, currentUser, adjustProductStock, canEdit } = useInventory();
  const [query, setQuery] = useState('');
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [counted, setCounted] = useState(toStock());
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [lastAdjustment, setLastAdjustment] = useState(null);
  const allowEdit = canEdit('inventory-count');

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

    const confirmed = window.confirm(
      `¿Actualizar el inventario de ${selectedProduct.sku}? Esta acción reemplazará las existencias actuales por el conteo físico.`
    );
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
                    display: 'grid', gridTemplateColumns: '130px 1fr auto', gap: '1rem',
                    width: '100%', padding: '0.85rem 1rem', border: 'none',
                    borderBottom: '1px solid var(--color-border)', background: 'transparent',
                    color: 'var(--color-text)', textAlign: 'left', cursor: 'pointer'
                  }}
                >
                  <strong>{product.sku}</strong>
                  <span>{product.description}</span>
                  <small style={{ color: 'var(--color-text-light)' }}>{product.category}</small>
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
    </div>
  );
};

export default InventoryCount;
