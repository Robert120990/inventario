import React, { useState } from 'react';
import { useInventory } from '../../context/InventoryContext';
import { Plus, Download } from 'lucide-react';
import { exportToCsv } from '../../utils/exportCsv';
import ProductForm from './ProductForm';

const ProductList = () => {
  const { products, deleteProduct } = useInventory();
  const [isAdding, setIsAdding] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);

  const handleExport = () => {
    exportToCsv(products, `productos_${new Date().toISOString().split('T')[0]}.csv`);
  };

  return (
    <div>
      <div className="topbar">
        <h1 className="page-title">Productos</h1>
        <div style={{ display: 'flex', gap: '1rem' }}>
          <button className="btn btn-outline" onClick={handleExport}>
            <Download size={18} /> Exportar CSV
          </button>
          <button className="btn btn-primary" onClick={() => { setEditingProduct(null); setIsAdding(true); }}>
            <Plus size={18} /> Nuevo Producto
          </button>
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
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {products.length === 0 ? (
                <tr>
                  <td colSpan="7" style={{ textAlign: 'center', padding: '2rem' }}>No hay productos registrados</td>
                </tr>
              ) : (
                products.map(prod => (
                  <tr key={prod.id}>
                    <td style={{ fontWeight: '500' }}>{prod.sku}</td>
                    <td>{prod.description}</td>
                    <td>
                      <span className="badge badge-gray">{prod.category}</span>
                    </td>
                    <td>${Number(prod.price).toFixed(2)}</td>
                    <td>{prod.stockUnits}</td>
                    <td>{prod.stockPounds}</td>
                    <td>{prod.stockBaskets}</td>
                    <td>
                      <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <button onClick={() => { setEditingProduct(prod); setIsAdding(true); }} className="btn btn-outline" style={{ padding: '0.25rem 0.5rem' }}>Editar</button>
                        <button onClick={() => { if(window.confirm('¿Seguro que deseas eliminar este producto?')) deleteProduct(prod.id); }} className="btn btn-danger" style={{ padding: '0.25rem 0.5rem' }}>Eliminar</button>
                      </div>
                    </td>
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
