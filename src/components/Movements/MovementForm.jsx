import React, { useState, useEffect, useRef } from 'react';
import { useInventory } from '../../context/InventoryContext';
import { Save, X, Plus, Trash2 } from 'lucide-react';

const MovementForm = ({ onCancel, initialData }) => {
  const { products, addMovement, updateMovement, documentTypes, currentUser } = useInventory();
  const [error, setError] = useState('');
  
  const [formData, setFormData] = useState(() => {
    if (initialData) {
      return {
        ...initialData,
        items: initialData.items.map(it => {
          const p = products.find(prod => prod.id === it.productId);
          return {
            ...it,
            searchQuery: p ? `${p.sku} - ${p.description}` : '',
            showDropdown: false
          };
        })
      };
    }
    return {
      type: 'out',
      equipment: '',
      carrier: '',
      seal: '',
      refType: documentTypes && documentTypes.length > 0 ? documentTypes[0] : 'Factura',
      refNumber: '',
      date: new Date().toISOString().split('T')[0],
      timeStart: '',
      timeEnd: '',
      auditUser: currentUser?.username || '',
      items: [{ productId: '', searchQuery: '', showDropdown: false, temperature: '', qtyUnits: '', qtyPounds: '', qtyBaskets: '' }]
    };
  });

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    if (error) setError('');
  };

  const handleItemChange = (index, field, value) => {
    const newItems = [...formData.items];
    newItems[index][field] = value;
    setFormData({ ...formData, items: newItems });
    if (error) setError('');
  };

  const addItem = () => {
    setFormData(prev => ({
      ...prev,
      items: [...prev.items, { productId: '', searchQuery: '', showDropdown: false, temperature: '', qtyUnits: '', qtyPounds: '', qtyBaskets: '' }]
    }));
  };

  const removeItem = (index) => {
    if (formData.items.length === 1) return;
    const newItems = formData.items.filter((_, i) => i !== index);
    setFormData({ ...formData, items: newItems });
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    
    // Validations
    const invalidItem = formData.items.find(it => !it.productId || !it.qtyUnits || Number(it.qtyUnits) <= 0);
    if (invalidItem) {
      setError('Todos los productos deben estar seleccionados y tener cantidad de unidades mayor a 0.');
      return;
    }

    const movementToSave = {
      ...formData,
      items: formData.items.map(it => ({
        productId: it.productId,
        temperature: it.temperature ? Number(it.temperature) : null,
        qtyUnits: Number(it.qtyUnits),
        qtyPounds: Number(it.qtyPounds || 0),
        qtyBaskets: Number(it.qtyBaskets || 0)
      }))
    };

    if (initialData) {
      updateMovement(initialData.id, movementToSave);
    } else {
      addMovement(movementToSave);
    }
    
    onCancel();
  };

  // Close dropdowns when clicking outside
  const closeAllDropdowns = () => {
    setFormData(prev => ({
      ...prev,
      items: prev.items.map(it => ({ ...it, showDropdown: false }))
    }));
  };

  return (
    <div onClick={closeAllDropdowns}>
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

      <form onSubmit={handleSubmit} className="card" style={{ padding: '2rem' }}>
        
        {/* Section 1: General & Documento */}
        <div style={{ marginBottom: '2.5rem' }}>
          <h3 style={{ fontSize: '1.125rem', color: 'var(--color-primary)', borderBottom: '2px solid var(--color-border)', paddingBottom: '0.5rem', marginBottom: '1.5rem' }}>
            Información General
          </h3>
          <div className="grid grid-cols-3" style={{ marginBottom: '1rem' }}>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Tipo de Movimiento</label>
              <div style={{ display: 'flex', gap: '1rem', marginTop: '0.5rem' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontWeight: formData.type === 'in' ? 'bold' : 'normal', color: formData.type === 'in' ? 'var(--color-success)' : 'inherit' }}>
                  <input type="radio" name="type" value="in" checked={formData.type === 'in'} onChange={handleChange} /> Entrada
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontWeight: formData.type === 'out' ? 'bold' : 'normal', color: formData.type === 'out' ? 'var(--color-danger)' : 'inherit' }}>
                  <input type="radio" name="type" value="out" checked={formData.type === 'out'} onChange={handleChange} /> Salida
                </label>
              </div>
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Fecha del Movimiento</label>
              <input type="date" name="date" className="form-input" value={formData.date} onChange={handleChange} required />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Usuario Auditor</label>
              <input type="text" name="auditUser" className="form-input" value={formData.auditUser} readOnly disabled style={{ backgroundColor: 'var(--color-bg)', cursor: 'not-allowed', color: 'var(--color-text-light)' }} />
            </div>
          </div>
          <div className="grid grid-cols-2">
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Tipo de Documento</label>
              <select name="refType" className="form-select" value={formData.refType} onChange={handleChange}>
                {documentTypes?.map(docType => (
                  <option key={docType} value={docType}>{docType}</option>
                ))}
              </select>
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Número de Documento</label>
              <input type="text" name="refNumber" className="form-input" value={formData.refNumber} onChange={handleChange} placeholder="Ej. FAC-00123" required />
            </div>
          </div>
        </div>

        {/* Section 2: Logística */}
        <div style={{ marginBottom: '2.5rem' }}>
          <h3 style={{ fontSize: '1.125rem', color: 'var(--color-primary)', borderBottom: '2px solid var(--color-border)', paddingBottom: '0.5rem', marginBottom: '1.5rem' }}>
            Logística y Transporte
          </h3>
          <div className="grid grid-cols-3" style={{ marginBottom: '1rem' }}>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Transportista</label>
              <input type="text" name="carrier" className="form-input" value={formData.carrier} onChange={handleChange} placeholder="Nombre del chofer o empresa" required />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Equipo / Placa</label>
              <input type="text" name="equipment" className="form-input" value={formData.equipment} onChange={handleChange} placeholder="Placa o ID del camión" required />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">N° de Marchamo</label>
              <input type="text" name="seal" className="form-input" value={formData.seal} onChange={handleChange} placeholder="Sello de seguridad (Opc.)" />
            </div>
          </div>
          <div className="grid grid-cols-2">
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Hora de Inicio (Carga/Descarga)</label>
              <input type="time" name="timeStart" className="form-input" value={formData.timeStart} onChange={handleChange} required />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Hora de Finalización</label>
              <input type="time" name="timeEnd" className="form-input" value={formData.timeEnd} onChange={handleChange} required />
            </div>
          </div>
        </div>

        {/* Section 3: Productos */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', borderBottom: '2px solid var(--color-border)', paddingBottom: '0.5rem', marginBottom: '1.5rem' }}>
            <h3 style={{ fontSize: '1.125rem', color: 'var(--color-primary)', margin: 0 }}>
              Selección de Productos
            </h3>
            <button type="button" className="btn btn-outline" onClick={addItem} style={{ fontSize: '0.875rem', padding: '0.25rem 0.75rem' }}>
              <Plus size={16} /> Agregar Fila
            </button>
          </div>

          {formData.items.map((item, index) => {
            const filteredProducts = products.filter(p => 
              p.sku.toLowerCase().includes(item.searchQuery.toLowerCase()) || 
              p.description.toLowerCase().includes(item.searchQuery.toLowerCase())
            );

            return (
              <div key={index} style={{ backgroundColor: 'var(--color-bg)', padding: '1rem', borderRadius: 'var(--radius)', marginBottom: '1rem', position: 'relative' }}>
                {formData.items.length > 1 && (
                  <button type="button" onClick={() => removeItem(index)} style={{ position: 'absolute', top: '1rem', right: '1rem', background: 'none', border: 'none', color: 'var(--color-danger)', cursor: 'pointer' }} title="Eliminar fila">
                    <Trash2 size={16} />
                  </button>
                )}
                
                <div className="grid grid-cols-2" style={{ marginBottom: '1rem', paddingRight: '2rem' }}>
                  <div className="form-group" style={{ position: 'relative', marginBottom: 0 }} onClick={e => e.stopPropagation()}>
                    <label className="form-label">Producto {index + 1}</label>
                    <input 
                      type="text" 
                      className="form-input" 
                      placeholder="Escribe código o nombre para buscar..." 
                      value={item.searchQuery}
                      onChange={(e) => {
                        handleItemChange(index, 'searchQuery', e.target.value);
                        handleItemChange(index, 'productId', '');
                        handleItemChange(index, 'showDropdown', true);
                      }}
                      onFocus={() => {
                        const newItems = formData.items.map((it, i) => i === index ? { ...it, showDropdown: true } : { ...it, showDropdown: false });
                        setFormData({ ...formData, items: newItems });
                      }}
                    />
                    {item.showDropdown && (
                      <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius)', maxHeight: '200px', overflowY: 'auto', zIndex: 10, boxShadow: 'var(--shadow-lg)' }}>
                        {filteredProducts.map(p => (
                          <div 
                            key={p.id} 
                            style={{ padding: '0.75rem', cursor: 'pointer', borderBottom: '1px solid var(--color-border)' }}
                            onClick={() => {
                              handleItemChange(index, 'searchQuery', `${p.sku} - ${p.description}`);
                              handleItemChange(index, 'productId', p.id);
                              handleItemChange(index, 'showDropdown', false);
                            }}
                            onMouseEnter={(e) => e.target.style.backgroundColor = 'var(--color-bg)'}
                            onMouseLeave={(e) => e.target.style.backgroundColor = 'transparent'}
                          >
                            <strong>{p.sku}</strong> - {p.description} <span style={{ fontSize: '0.75rem', color: 'var(--color-text-light)', marginLeft: '0.5rem' }}>(Stock local: {p.stockUnits})</span>
                          </div>
                        ))}
                        {filteredProducts.length === 0 && <div style={{ padding: '0.75rem', color: 'var(--color-text-light)' }}>Sin resultados</div>}
                      </div>
                    )}
                  </div>
                  <div className="grid grid-cols-4">
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label className="form-label">Temp °C</label>
                      <input type="number" step="0.1" className="form-input" value={item.temperature} onChange={(e) => handleItemChange(index, 'temperature', e.target.value)} />
                    </div>
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label className="form-label">Unidades</label>
                      <input type="number" className="form-input" value={item.qtyUnits} onChange={(e) => handleItemChange(index, 'qtyUnits', e.target.value)} required min="1" />
                    </div>
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label className="form-label">Libras</label>
                      <input type="number" step="0.01" className="form-input" value={item.qtyPounds} onChange={(e) => handleItemChange(index, 'qtyPounds', e.target.value)} min="0" />
                    </div>
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label className="form-label">Cestas</label>
                      <input type="number" className="form-input" value={item.qtyBaskets} onChange={(e) => handleItemChange(index, 'qtyBaskets', e.target.value)} min="0" />
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
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
