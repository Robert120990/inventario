import React, { useState } from 'react';
import { useInventory } from '../../context/InventoryContext';
import { Save, X } from 'lucide-react';

const MovementForm = ({ onCancel, initialData }) => {
  const { products, addMovement, updateMovement, documentTypes, currentUser } = useInventory();
  const [error, setError] = useState('');
  
  const [formData, setFormData] = useState(initialData || {
    type: 'out',
    // Logistics
    equipment: '',
    carrier: '',
    seal: '',
    // Reference
    refType: 'Factura',
    refNumber: '',
    // Temporality
    date: new Date().toISOString().split('T')[0],
    timeStart: '',
    timeEnd: '',
    // Load detail
    productId: '',
    temperature: '',
    qtyUnits: '',
    qtyPounds: '',
    qtyBaskets: '',
    // Audit
    auditUser: currentUser?.username || ''
  });

  const [productSearch, setProductSearch] = useState(() => {
    if (initialData && initialData.productId) {
      const p = products.find(x => x.id === initialData.productId);
      return p ? `${p.sku} - ${p.description}` : '';
    }
    return '';
  });
  const [showProductList, setShowProductList] = useState(false);

  const filteredProducts = products.filter(p => 
    p.sku.toLowerCase().includes(productSearch.toLowerCase()) || 
    p.description.toLowerCase().includes(productSearch.toLowerCase())
  );

  const selectedProduct = products.find(p => p.id === formData.productId);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    if (error) setError('');
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!formData.productId) {
      setError('Debes seleccionar un producto.');
      return;
    }

    if (!formData.qtyUnits || formData.qtyUnits <= 0) {
      setError('La cantidad de unidades debe ser mayor a 0.');
      return;
    }

    // Validation for negative stock on 'out' (REMOVED logic to allow negative stock)
    // if (formData.type === 'out') {
    //   if (Number(formData.qtyUnits) > selectedProduct.stockUnits) {
    //     ...
    //   }
    // }

    const movementToSave = {
      ...formData,
      qtyUnits: Number(formData.qtyUnits),
      qtyPounds: Number(formData.qtyPounds || 0),
      qtyBaskets: Number(formData.qtyBaskets || 0),
      temperature: formData.temperature ? Number(formData.temperature) : null
    };

    if (initialData) {
      updateMovement(initialData.id, movementToSave);
    } else {
      addMovement(movementToSave);
    }
    
    onCancel();
  };

  return (
    <div>
      <div className="topbar">
        <h1 className="page-title">{initialData ? 'Editar Movimiento' : 'Registrar Movimiento'}</h1>
        <button className="btn btn-outline" onClick={onCancel}>
          <X size={18} /> Cancelar
        </button>
      </div>

      {error && (
        <div style={{ backgroundColor: 'var(--color-danger)', color: 'white', padding: '1rem', borderRadius: 'var(--radius)', marginBottom: '1.5rem' }}>
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="card">
        
        {/* Basic Info */}
        <div className="grid grid-cols-2" style={{ marginBottom: '1.5rem', paddingBottom: '1.5rem', borderBottom: '1px solid var(--color-border)' }}>
          <div className="form-group">
            <label className="form-label">Tipo de Movimiento</label>
            <div style={{ display: 'flex', gap: '1rem' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                <input type="radio" name="type" value="in" checked={formData.type === 'in'} onChange={handleChange} /> Entrada
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                <input type="radio" name="type" value="out" checked={formData.type === 'out'} onChange={handleChange} /> Salida
              </label>
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Usuario Auditor</label>
            <input type="text" name="auditUser" className="form-input" value={formData.auditUser} readOnly disabled style={{ backgroundColor: 'var(--color-bg)', cursor: 'not-allowed' }} />
          </div>
        </div>

        <div className="grid grid-cols-3">
          {/* Logistics */}
          <div>
            <h3 style={{ fontSize: '1rem', marginBottom: '1rem', color: 'var(--color-primary)' }}>Logística</h3>
            <div className="form-group">
              <label className="form-label">Transportista</label>
              <input type="text" name="carrier" className="form-input" value={formData.carrier} onChange={handleChange} required />
            </div>
            <div className="form-group">
              <label className="form-label">Equipo</label>
              <input type="text" name="equipment" className="form-input" value={formData.equipment} onChange={handleChange} required />
            </div>
            <div className="form-group">
              <label className="form-label">Marchamo</label>
              <input type="text" name="seal" className="form-input" value={formData.seal} onChange={handleChange} />
            </div>
          </div>

          {/* Reference */}
          <div>
            <h3 style={{ fontSize: '1rem', marginBottom: '1rem', color: 'var(--color-primary)' }}>Referencia</h3>
            <div className="form-group">
              <label className="form-label">Tipo de Documento</label>
              <select name="refType" className="form-select" value={formData.refType} onChange={handleChange}>
                {useInventory().documentTypes?.map(docType => (
                  <option key={docType} value={docType}>{docType}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Número de Documento</label>
              <input type="text" name="refNumber" className="form-input" value={formData.refNumber} onChange={handleChange} required />
            </div>
            <div className="form-group">
              <label className="form-label">Fecha</label>
              <input type="date" name="date" className="form-input" value={formData.date} onChange={handleChange} required />
            </div>
            <div className="grid grid-cols-2">
              <div className="form-group">
                <label className="form-label">Hora Inicio</label>
                <input type="time" name="timeStart" className="form-input" value={formData.timeStart} onChange={handleChange} required />
              </div>
              <div className="form-group">
                <label className="form-label">Hora Final</label>
                <input type="time" name="timeEnd" className="form-input" value={formData.timeEnd} onChange={handleChange} required />
              </div>
            </div>
          </div>

          {/* Load Detail */}
          <div>
            <h3 style={{ fontSize: '1rem', marginBottom: '1rem', color: 'var(--color-primary)' }}>Detalle de Carga</h3>
            <div className="form-group" style={{ position: 'relative' }}>
              <label className="form-label">Producto (Buscar por Código o Nombre)</label>
              <input 
                type="text" 
                className="form-input" 
                placeholder="Escribe para buscar..." 
                value={productSearch}
                onChange={(e) => {
                  setProductSearch(e.target.value);
                  setFormData(prev => ({ ...prev, productId: '' })); // reset id
                  setShowProductList(true);
                }}
                onFocus={() => setShowProductList(true)}
              />
              {showProductList && (
                <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius)', maxHeight: '200px', overflowY: 'auto', zIndex: 10 }}>
                  {filteredProducts.map(p => (
                    <div 
                      key={p.id} 
                      style={{ padding: '0.5rem', cursor: 'pointer', borderBottom: '1px solid var(--color-border)' }}
                      onClick={() => {
                        setProductSearch(`${p.sku} - ${p.description}`);
                        setFormData(prev => ({ ...prev, productId: p.id }));
                        setShowProductList(false);
                        setError('');
                      }}
                      onMouseEnter={(e) => e.target.style.backgroundColor = 'var(--color-bg)'}
                      onMouseLeave={(e) => e.target.style.backgroundColor = 'transparent'}
                    >
                      <strong>{p.sku}</strong> - {p.description} (Stock: {p.stockUnits})
                    </div>
                  ))}
                  {filteredProducts.length === 0 && <div style={{ padding: '0.5rem', color: 'var(--color-text-light)' }}>Sin resultados</div>}
                </div>
              )}
            </div>
            <div className="form-group">
              <label className="form-label">Temperatura (°C)</label>
              <input type="number" step="0.1" name="temperature" className="form-input" value={formData.temperature} onChange={handleChange} />
            </div>
            
            <div className="form-group">
              <label className="form-label">Cantidad (Unidades)</label>
              <input type="number" name="qtyUnits" className="form-input" value={formData.qtyUnits} onChange={handleChange} required min="1" />
            </div>
            <div className="grid grid-cols-2">
              <div className="form-group">
                <label className="form-label">Libras (Opcional)</label>
                <input type="number" step="0.01" name="qtyPounds" className="form-input" value={formData.qtyPounds} onChange={handleChange} min="0" />
              </div>
              <div className="form-group">
                <label className="form-label">Cestas (Opc)</label>
                <input type="number" name="qtyBaskets" className="form-input" value={formData.qtyBaskets} onChange={handleChange} min="0" />
              </div>
            </div>
          </div>
        </div>

        <div style={{ marginTop: '2rem', paddingTop: '1.5rem', borderTop: '1px solid var(--color-border)', display: 'flex', justifyContent: 'flex-end', gap: '1rem' }}>
          <button type="button" className="btn btn-outline" onClick={onCancel}>Cancelar</button>
          <button type="submit" className="btn btn-primary"><Save size={18} /> Guardar Movimiento</button>
        </div>
      </form>
    </div>
  );
};

export default MovementForm;
