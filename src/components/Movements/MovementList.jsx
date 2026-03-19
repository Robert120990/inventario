import React, { useState } from 'react';
import { useInventory } from '../../context/InventoryContext';
import { Plus, Download, Search } from 'lucide-react';
import { exportToCsv } from '../../utils/exportCsv';
import MovementForm from './MovementForm';
import { formatDate } from '../../utils/formatUtils';

const MovementList = () => {
  const { movements, products, deleteMovement, currentUser } = useInventory();
  const [isAdding, setIsAdding] = useState(false);
  const [editingMovement, setEditingMovement] = useState(null);
  
  const isAdmin = currentUser?.role === 'admin';
  const [searchTerm, setSearchTerm] = useState('');

  const filteredMovements = movements.filter(mov => {
    const searchLow = searchTerm.toLowerCase();
    
    // Buscar en datos generales del movimiento
    const inMovement = 
      (mov.refNumber || '').toLowerCase().includes(searchLow) ||
      (mov.refType || '').toLowerCase().includes(searchLow) ||
      (mov.carrier || '').toLowerCase().includes(searchLow) ||
      (mov.equipment || '').toLowerCase().includes(searchLow) ||
      (mov.auditUser || '').toLowerCase().includes(searchLow) ||
      (mov.date || '').toLowerCase().includes(searchLow);

    // Buscar en los productos dentro del movimiento
    const inProducts = mov.items?.some(it => {
      const p = products.find(prod => prod.id === it.productId);
      if (!p) return false;
      return p.sku.toLowerCase().includes(searchLow) || p.description.toLowerCase().includes(searchLow);
    });

    return inMovement || inProducts;
  });

  const getProductName = (id) => {
    const product = products.find(p => p.id === id);
    return product ? `${product.sku} - ${product.description}` : 'Desconocido';
  };

  const renderProductPreview = (mov) => {
    if (!mov.items || mov.items.length === 0) return 'Sin productos';
    if (mov.items.length === 1) return getProductName(mov.items[0].productId);
    return `Varios Productos (${mov.items.length})`;
  };

  const renderQuantities = (mov) => {
    if (!mov.items || mov.items.length === 0) return null;
    const totalUnits = mov.items.reduce((acc, curr) => acc + Number(curr.qtyUnits || 0), 0);
    const totalPounds = mov.items.reduce((acc, curr) => acc + Number(curr.qtyPounds || 0), 0);
    const totalBaskets = mov.items.reduce((acc, curr) => acc + Number(curr.qtyBaskets || 0), 0);
    
    return (
      <>
        <div>{totalUnits} Unid.</div>
        {(totalPounds > 0 || totalBaskets > 0) && (
          <div style={{ fontSize: '0.75rem', color: 'var(--color-text-light)' }}>
            {totalPounds} lbs • {totalBaskets} cestas
          </div>
        )}
      </>
    );
  };

  const handleExport = () => {
    const exportData = [];
    movements.forEach(mov => {
      const baseRow = {
        Fecha: new Date(mov.createdAt).toLocaleString(),
        Tipo: mov.type === 'in' ? 'Entrada' : 'Salida',
        'Doc Tipo': mov.refType,
        'Doc Número': mov.refNumber,
        Transportista: mov.carrier,
        Equipo: mov.equipment,
        Marchamo: mov.seal,
        Usuario: mov.auditUser
      };
      
      if (mov.items && mov.items.length > 0) {
        mov.items.forEach(item => {
          exportData.push({
            ...baseRow,
            Producto: getProductName(item.productId),
            Temperatura: item.temperature,
            'Cant. Unidades': item.qtyUnits,
            'Cant. Libras': item.qtyPounds,
            'Cant. Cestas': item.qtyBaskets
          });
        });
      } else {
        exportData.push(baseRow);
      }
    });
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

      <div className="card" style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '1rem', padding: '0.75rem 1.25rem' }}>
        <div style={{ position: 'relative', flex: 1, maxWidth: '500px' }}>
          <Search size={18} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-light)' }} />
          <input 
            type="text" 
            className="form-input" 
            placeholder="Buscar por documento, transporte, auditor o producto..." 
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{ paddingLeft: '2.5rem', marginBottom: 0 }}
          />
        </div>
        <div style={{ marginLeft: 'auto', fontSize: '0.875rem', color: 'var(--color-text-light)' }}>
          Mostrando <strong>{filteredMovements.length}</strong> de {movements.length} movimientos
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
                {isAdmin && <th>Acciones</th>}
              </tr>
            </thead>
            <tbody>
              {filteredMovements.length === 0 ? (
                <tr>
                  <td colSpan={isAdmin ? "8" : "7"} style={{ textAlign: 'center', padding: '2rem' }}>
                    {searchTerm ? `No se encontraron movimientos que coincidan con "${searchTerm}"` : 'No hay movimientos registrados'}
                  </td>
                </tr>
              ) : (
                filteredMovements.map(mov => (
                  <tr key={mov.id}>
                    <td>
                      <div>{formatDate(mov.date)}</div>
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
                    <td style={{ fontWeight: '500' }}>{renderProductPreview(mov)}</td>
                    <td>
                      {renderQuantities(mov)}
                    </td>
                    <td>
                      <div>{mov.carrier}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--color-text-light)' }}>Eq: {mov.equipment}</div>
                    </td>
                    <td>{mov.auditUser}</td>
                    {isAdmin && (
                      <td>
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                          <button onClick={() => { setEditingMovement(mov); setIsAdding(true); }} className="btn btn-outline" style={{ padding: '0.25rem 0.5rem' }}>Editar</button>
                          <button onClick={() => { if(window.confirm('¿Seguro que deseas eliminar este movimiento? Afectará el stock disponible.')) deleteMovement(mov.id); }} className="btn btn-danger" style={{ padding: '0.25rem 0.5rem' }}>Eliminar</button>
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
    </div>
  );
};

export default MovementList;
