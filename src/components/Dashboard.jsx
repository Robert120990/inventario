import React from 'react';
import { useInventory } from '../context/InventoryContext';
import { Package, ArrowRightLeft, TrendingUp } from 'lucide-react';

const Dashboard = () => {
  const { totalStock, products, movements } = useInventory();

  // Get last 5 movements
  const recentMovements = [...movements].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 5);

  const getProductName = (id) => {
    const product = products.find(p => p.id === id);
    return product ? `${product.sku} - ${product.description}` : 'Desconocido';
  };

  return (
    <div>
      <div className="topbar">
        <h1 className="page-title">Dashboard</h1>
      </div>

      <div className="grid grid-cols-3" style={{ marginBottom: '2rem' }}>
        <div className="card stat-card">
          <div className="stat-icon">
            <Package size={24} />
          </div>
          <div className="stat-content">
            <h3>Total de Referencias</h3>
            <p>{products.length}</p>
          </div>
        </div>
        
        <div className="card stat-card">
          <div className="stat-icon" style={{ backgroundColor: 'rgba(16, 185, 129, 0.1)', color: 'var(--color-success)' }}>
            <TrendingUp size={24} />
          </div>
          <div className="stat-content">
            <h3>Stock Total (Unidades)</h3>
            <p>{totalStock.toLocaleString()}</p>
          </div>
        </div>

        <div className="card stat-card">
          <div className="stat-icon" style={{ backgroundColor: 'rgba(239, 68, 68, 0.1)', color: 'var(--color-danger)' }}>
            <ArrowRightLeft size={24} />
          </div>
          <div className="stat-content">
            <h3>Movimientos Registrados</h3>
            <p>{movements.length}</p>
          </div>
        </div>
      </div>

      <div className="card" style={{ padding: '0' }}>
        <div style={{ padding: '1.5rem', borderBottom: '1px solid var(--color-border)' }}>
          <h2 style={{ fontSize: '1.25rem', fontWeight: '600', color: 'var(--color-text)' }}>Últimos 5 Movimientos</h2>
        </div>
        
        <div className="table-container" style={{ border: 'none', boxShadow: 'none' }}>
          <table>
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Referencia</th>
                <th>Producto</th>
                <th>Tipo</th>
                <th>Cant. Unidades</th>
                <th>Usuario</th>
              </tr>
            </thead>
            <tbody>
              {recentMovements.length === 0 ? (
                <tr>
                  <td colSpan="6" style={{ textAlign: 'center', padding: '2rem' }}>No hay movimientos recientes</td>
                </tr>
              ) : (
                recentMovements.map(mov => (
                  <tr key={mov.id}>
                    <td>{new Date(mov.createdAt).toLocaleDateString()} {new Date(mov.createdAt).toLocaleTimeString()}</td>
                    <td>{mov.refType} #{mov.refNumber}</td>
                    <td>{getProductName(mov.productId)}</td>
                    <td>
                      <span className={`badge ${mov.type === 'in' ? 'badge-success' : 'badge-danger'}`}>
                        {mov.type === 'in' ? 'Entrada' : 'Salida'}
                      </span>
                    </td>
                    <td>{mov.qtyUnits}</td>
                    <td>{mov.auditUser}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
