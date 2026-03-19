import React, { useState } from 'react';
import { useInventory } from '../../context/InventoryContext';
import { Plus, UserCheck, UserX } from 'lucide-react';
import { toast } from 'react-hot-toast';
import UserForm from './UserForm';

const UserList = () => {
  const { users, currentUser, updateUser } = useInventory();
  const [isAdding, setIsAdding] = useState(false);
  const [editingUser, setEditingUser] = useState(null);

  const handleToggleActive = (user) => {
    if (user.id === currentUser.id) {
      alert("No puedes desactivar tu propio usuario mientras estás en sesión.");
      return;
    }
    updateUser(user.id, { isActive: !user.isActive });
    toast.success(user.isActive ? 'Usuario desactivado' : 'Usuario reactivado');
  };

  if (isAdding) {
    return (
      <div className="modal-overlay">
        <div className="modal-content">
          <UserForm onCancel={() => { setIsAdding(false); setEditingUser(null); }} initialData={editingUser} />
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="topbar">
        <h1 className="page-title">Gestión de Usuarios</h1>
        <button className="btn btn-primary" onClick={() => { setEditingUser(null); setIsAdding(true); }}>
          <Plus size={18} /> Nuevo Usuario
        </button>
      </div>

      <div className="card" style={{ padding: '0' }}>
        <div className="table-container" style={{ border: 'none', boxShadow: 'none' }}>
          <table>
            <thead>
              <tr>
                <th>Usuario</th>
                <th>Rol</th>
                <th>Estado</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {users.map(u => (
                <tr key={u.id} style={{ opacity: u.isActive !== false ? 1 : 0.6 }}>
                  <td style={{ fontWeight: '500' }}>{u.username}</td>
                  <td>
                    <span className={`badge ${u.role === 'admin' ? 'badge-primary' : 'badge-gray'}`}>
                      {u.role === 'admin' ? 'Administrador' : 'Usuario'}
                    </span>
                  </td>
                  <td>
                    <span className={`badge ${u.isActive !== false ? 'badge-success' : 'badge-danger'}`}>
                      {u.isActive !== false ? 'Activo' : 'Desactivado'}
                    </span>
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <button onClick={() => { setEditingUser(u); setIsAdding(true); }} className="btn btn-outline" style={{ padding: '0.25rem 0.5rem' }}>
                        Editar
                      </button>
                      {u.id !== currentUser.id && (
                        <button 
                          onClick={() => handleToggleActive(u)} 
                          className={`btn ${u.isActive !== false ? 'btn-danger' : 'btn-success'}`} 
                          style={{ padding: '0.25rem 0.5rem', width: '130px', backgroundColor: u.isActive !== false ? '' : 'var(--color-success)', color: 'white', border: 'none' }}
                        >
                          {u.isActive !== false ? <><UserX size={14} /> Desactivar</> : <><UserCheck size={14} /> Reactivar</>}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {users.length === 0 && (
                <tr>
                  <td colSpan="4" style={{ textAlign: 'center', padding: '2rem' }}>No hay usuarios activos.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default UserList;
