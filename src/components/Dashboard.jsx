import React from 'react';
import { useInventory } from '../context/InventoryContext';
import { Package, ArrowRightLeft, TrendingUp } from 'lucide-react';

const Dashboard = () => {
  const { totalStock, products, movements } = useInventory();

  // Get movements from today
  const today = new Date().toISOString().split('T')[0];
  const todaysMovements = movements.filter(m => m.date === today);

  // Flatten items for display
  const todaysItems = todaysMovements.flatMap(mov => 
    (mov.items || []).map(item => ({
      ...item,
      id: `${mov.id}-${item.productId}`,
      date: mov.date,
      time: mov.timeStart,
      type: mov.type,
      ref: `${mov.refType} #${mov.refNumber}`,
      user: mov.auditUser
    }))
  );

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
        <div style={{ padding: '1.5rem', borderBottom: '1px solid var(--color-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ fontSize: '1.25rem', fontWeight: '600', color: 'var(--color-text)' }}>Productos Movidos Hoy ({today})</h2>
          <span className="badge badge-gray">{todaysItems.length} registros</span>
        </div>
        
        <div className="table-container" style={{ border: 'none', boxShadow: 'none' }}>
          <table>
            <thead>
              <tr>
                <th>Hora</th>
                <th>Referencia</th>
                <th>Producto</th>
                <th>Tipo</th>
                <th style={{ textAlign: 'center' }}>Unid.</th>
                <th style={{ textAlign: 'center' }}>Lbs.</th>
                <th>Usuario</th>
              </tr>
            </thead>
            <tbody>
              {todaysItems.length === 0 ? (
                <tr>
                  <td colSpan="7" style={{ textAlign: 'center', padding: '2rem' }}>No se han registrado movimientos el día de hoy</td>
                </tr>
              ) : (
                todaysItems.map(item => (
                  <tr key={item.id}>
                    <td>{item.time}</td>
                    <td>{item.ref}</td>
                    <td style={{ fontWeight: '500' }}>{getProductName(item.productId)}</td>
                    <td>
                      <span className={`badge ${item.type === 'in' ? 'badge-success' : 'badge-danger'}`}>
                        {item.type === 'in' ? 'Entrada' : 'Salida'}
                      </span>
                    </td>
                    <td style={{ textAlign: 'center' }}>{item.qtyUnits}</td>
                    <td style={{ textAlign: 'center' }}>{item.qtyPounds || 0}</td>
                    <td>{item.user}</td>
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
