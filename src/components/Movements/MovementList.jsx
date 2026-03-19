import React, { useState } from 'react';
import { useInventory } from '../../context/InventoryContext';
import { Plus, Download } from 'lucide-react';
import { exportToCsv } from '../../utils/exportCsv';
import MovementForm from './MovementForm';

const MovementList = () => {
  const { movements, products, deleteMovement } = useInventory();
  const [isAdding, setIsAdding] = useState(false);
  const [editingMovement, setEditingMovement] = useState(null);

  const getProductName = (id) => {
    const product = products.find(p => p.id === id);
    return product ? `${product.sku} - ${product.description}` : 'Desconocido';
  };

  const handleExport = () => {
    // Format data for export
    const exportData = movements.map(mov => ({
      Fecha: new Date(mov.createdAt).toLocaleString(),
      Tipo: mov.type === 'in' ? 'Entrada' : 'Salida',
      'Doc Tipo': mov.refType,
      'Doc Número': mov.refNumber,
      Producto: getProductName(mov.productId),
      'Cant. Unidades': mov.qtyUnits,
      'Cant. Libras': mov.qtyPounds,
      'Cant. Cestas': mov.qtyBaskets,
      Transportista: mov.carrier,
      Equipo: mov.equipment,
      Marchamo: mov.seal,
      Temperatura: mov.temperature,
      Usuario: mov.auditUser
    }));
    exportToCsv(exportData, `movimientos_${new Date().toISOString().split('T')[0]}.csv`);
  };

  if (isAdding) {
    return <MovementForm onCancel={() => { setIsAdding(false); setEditingMovement(null); }} initialData={editingMovement} />;
  }

  return (
    <div>
      <div className="topbar">
        <h1 className="page-title">Movimientos</h1>
        <div style={{ display: 'flex', gap: '1rem' }}>
          <button className="btn btn-outline" onClick={handleExport}>
            <Download size={18} /> Exportar CSV
          </button>
          <button className="btn btn-primary" onClick={() => { setEditingMovement(null); setIsAdding(true); }}>
            <Plus size={18} /> Registrar Movimiento
          </button>
        </div>
      </div>

      <div className="card" style={{ padding: '0' }}>
        <div className="table-container" style={{ border: 'none', boxShadow: 'none' }}>
          <table>
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Tipo</th>
                <th>Documento</th>
                <th>Producto</th>
                <th>Cantidades</th>
                <th>Logística / Transp.</th>
                <th>Usuario</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {movements.length === 0 ? (
                <tr>
                  <td colSpan="7" style={{ textAlign: 'center', padding: '2rem' }}>No hay movimientos registrados</td>
                </tr>
              ) : (
                movements.map(mov => (
                  <tr key={mov.id}>
                    <td>
                      <div>{mov.date}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--color-text-light)' }}>
                        {mov.timeStart} - {mov.timeEnd}
                      </div>
                    </td>
                    <td>
                      <span className={`badge ${mov.type === 'in' ? 'badge-success' : 'badge-danger'}`}>
                        {mov.type === 'in' ? 'Entrada' : 'Salida'}
                      </span>
                    </td>
                    <td>
                      <div style={{ fontWeight: '500' }}>{mov.refType}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--color-text-light)' }}>#{mov.refNumber}</div>
                    </td>
                    <td>{getProductName(mov.productId)}</td>
                    <td>
                      <div>{mov.qtyUnits} Unid.</div>
                      {(mov.qtyPounds > 0 || mov.qtyBaskets > 0) && (
                        <div style={{ fontSize: '0.75rem', color: 'var(--color-text-light)' }}>
                          {mov.qtyPounds} lbs • {mov.qtyBaskets} cestas
                        </div>
                      )}
                    </td>
                    <td>
                      <div>{mov.carrier}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--color-text-light)' }}>Eq: {mov.equipment}</div>
                    </td>
                    <td>{mov.auditUser}</td>
                    <td>
                      <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <button onClick={() => { setEditingMovement(mov); setIsAdding(true); }} className="btn btn-outline" style={{ padding: '0.25rem 0.5rem' }}>Editar</button>
                        <button onClick={() => { if(window.confirm('¿Seguro que deseas eliminar este movimiento? Afectará el stock disponible.')) deleteMovement(mov.id); }} className="btn btn-danger" style={{ padding: '0.25rem 0.5rem' }}>Eliminar</button>
                      </div>
                    </td>
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

export default MovementList;
