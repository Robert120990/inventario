import React, { useState } from 'react';
import { useInventory } from '../../context/InventoryContext';
import { Save, X } from 'lucide-react';

const ProductForm = ({ onCancel, initialData }) => {
  const { addProduct, updateProduct, categories } = useInventory();
  const [formData, setFormData] = useState(initialData || {
    sku: '',
    description: '',
    price: '',
    category: categories && categories.length > 0 ? categories[0] : '',
    stockUnits: 0,
    stockPounds: 0,
    stockBaskets: 0
  });

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!formData.sku || !formData.description || formData.price === '') return;
    
    const dataToSave = {
      ...formData,
      price: Number(formData.price),
      stockUnits: Number(formData.stockUnits),
      stockPounds: Number(formData.stockPounds),
      stockBaskets: Number(formData.stockBaskets)
    };

    if (initialData) {
      updateProduct(initialData.id, dataToSave);
    } else {
      addProduct(dataToSave);
    }
    
    onCancel(); // Return to list
  };

  return (
    <div>
      <div className="topbar">
        <h1 className="page-title">{initialData ? 'Editar Producto' : 'Nuevo Producto'}</h1>
        <button className="btn btn-outline" onClick={onCancel}>
          <X size={18} /> Cancelar
        </button>
      </div>

      <div className="card" style={{ maxWidth: '800px', margin: '0 auto' }}>
        <form onSubmit={handleSubmit}>
          <div className="grid grid-cols-2">
            <div className="form-group">
              <label className="form-label">Código (SKU)</label>
              <input 
                type="text" 
                name="sku" 
                className="form-input" 
                value={formData.sku} 
                onChange={handleChange} 
                required 
                placeholder="Ej. ELEC-005"
              />
            </div>
            <div className="form-group">
              <label className="form-label">Categoría</label>
              <select 
                name="category" 
                className="form-select" 
                value={formData.category} 
                onChange={handleChange}
              >
                {categories?.map(cat => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Descripción</label>
            <textarea 
              name="description" 
              className="form-input" 
              value={formData.description} 
              onChange={handleChange} 
              required 
              rows="3"
              placeholder="Descripción detallada del producto..."
            ></textarea>
          </div>

          <div className="form-group" style={{ maxWidth: '50%' }}>
            <label className="form-label">Precio Unitario ($)</label>
            <input 
              type="number" 
              name="price" 
              step="0.01" 
              className="form-input" 
              value={formData.price} 
              onChange={handleChange} 
              required 
            />
          </div>

          <h3 style={{ marginTop: '2rem', marginBottom: '1rem', fontSize: '1.125rem', color: 'var(--color-primary)' }}>Stock Inicial</h3>
          <div className="grid grid-cols-3">
            <div className="form-group">
              <label className="form-label">Unidades</label>
              <input 
                type="number" 
                name="stockUnits" 
                className="form-input" 
                value={formData.stockUnits} 
                onChange={handleChange} 
                min="0"
              />
            </div>
            <div className="form-group">
              <label className="form-label">Libras (Opcional)</label>
              <input 
                type="number" 
                name="stockPounds" 
                step="0.01"
                className="form-input" 
                value={formData.stockPounds} 
                onChange={handleChange} 
                min="0"
              />
            </div>
            <div className="form-group">
              <label className="form-label">Cestas (Opcional)</label>
              <input 
                type="number" 
                name="stockBaskets" 
                className="form-input" 
                value={formData.stockBaskets} 
                onChange={handleChange} 
                min="0"
              />
            </div>
          </div>

          <div style={{ marginTop: '2rem', display: 'flex', justifyContent: 'flex-end', gap: '1rem' }}>
            <button type="button" className="btn btn-outline" onClick={onCancel}>Cancelar</button>
            <button type="submit" className="btn btn-primary"><Save size={18} /> Guardar Producto</button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ProductForm;
