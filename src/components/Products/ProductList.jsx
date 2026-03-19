import React, { useState } from 'react';
import { useInventory } from '../../context/InventoryContext';
import { Plus, Edit2, Trash2, Package, Download, Search } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { exportToCsv } from '../../utils/exportCsv';
import ProductForm from './ProductForm';
import { formatPrice } from '../../utils/formatUtils';

const ProductList = () => {
  const { products, deleteProduct, currentUser } = useInventory();
  const [isAdding, setIsAdding] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);
  
  const isAdmin = currentUser?.role === 'admin';
  const [searchTerm, setSearchTerm] = useState('');

  const filteredProducts = products.filter(p => 
    p.sku.toLowerCase().includes(searchTerm.toLowerCase()) ||
    p.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
    p.category.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleExport = () => {
    exportToCsv(products, `productos_${new Date().toISOString().split('T')[0]}.csv`);
    toast.success('Listado de productos exportado');
  };

  return (
    <div>
      <div className="topbar">
        <h1 className="page-title">Productos</h1>
        <div style={{ display: 'flex', gap: '1rem' }}>
          <button className="btn btn-outline" onClick={handleExport}>
            <Download size={18} /> Exportar CSV
          </button>
          {isAdmin && (
            <button className="btn btn-primary" onClick={() => { setEditingProduct(null); setIsAdding(true); }}>
              <Plus size={18} /> Nuevo Producto
            </button>
          )}
        </div>
      </div>

      <div className="card" style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '1rem', padding: '0.75rem 1.25rem' }}>
        <div style={{ position: 'relative', flex: 1, maxWidth: '500px' }}>
          <Search size={18} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-light)' }} />
          <input 
            type="text" 
            className="form-input" 
            placeholder="Buscar por código, descripción o categoría..." 
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{ paddingLeft: '2.5rem', marginBottom: 0 }}
          />
        </div>
        <div style={{ marginLeft: 'auto', fontSize: '0.875rem', color: 'var(--color-text-light)' }}>
          Mostrando <strong>{filteredProducts.length}</strong> de {products.length} productos
        </div>
      </div>

      <div className="card" style={{ padding: '0' }}>
        <div className="table-container" style={{ border: 'none', boxShadow: 'none' }}>
          <table>
            <thead>
              <tr>
                <th>Código (SKU)</th>
                <th>Descripción</th>
                <th>Categoría</th>
                <th>Precio</th>
                <th>Stock (Unidades)</th>
                <th>Stock (Libras)</th>
                <th>Stock (Cestas)</th>
                {isAdmin && <th>Acciones</th>}
              </tr>
            </thead>
            <tbody>
              {filteredProducts.length === 0 ? (
                <tr>
                  <td colSpan={isAdmin ? "8" : "7"} style={{ textAlign: 'center', padding: '2rem' }}>
                    {searchTerm ? `No se encontraron productos que coincidan con "${searchTerm}"` : 'No hay productos registrados'}
                  </td>
                </tr>
              ) : (
                filteredProducts.map(prod => (
                  <tr key={prod.id}>
                    <td style={{ fontWeight: '500' }}>{prod.sku}</td>
                    <td>{prod.description}</td>
                    <td>{prod.category}</td>
                    <td>${formatPrice(prod.price)}</td>
                    <td style={{ textAlign: 'center' }}>{prod.stockUnits}</td>
                    <td>{prod.stockPounds}</td>
                    <td>{prod.stockBaskets}</td>
                    {isAdmin && (
                      <td>
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                          <button onClick={() => { setEditingProduct(prod); setIsAdding(true); }} className="btn btn-outline" style={{ padding: '0.25rem 0.5rem' }}>Editar</button>
                          <button onClick={() => { 
                            if(window.confirm('¿Seguro que deseas eliminar este producto?')) {
                              deleteProduct(prod.id);
                              toast.success('Producto eliminado');
                            }
                          }} className="btn btn-danger" style={{ padding: '0.25rem 0.5rem' }}>Eliminar</button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {isAdding && (
        <div className="modal-overlay">
          <div className="modal-content">
            <ProductForm onCancel={() => { setIsAdding(false); setEditingProduct(null); }} initialData={editingProduct} />
          </div>
        </div>
      )}
    </div>
  );
};

export default ProductList;
