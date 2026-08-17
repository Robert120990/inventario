import React, { useState } from 'react';
import { useInventory } from '../../context/InventoryContext';
import { Plus, UserCheck, UserX } from 'lucide-react';
import { toast } from 'react-hot-toast';
import UserForm from './UserForm';

const UserList = ({ onConfigureAccess }) => {
  const { users, currentUser, updateUser, deleteUser } = useInventory();
  const [isAdding, setIsAdding] = useState(false);
  const [editingUser, setEditingUser] = useState(null);

  const handleToggleActive = (user) => {
    if (user.id === currentUser.id) {
      toast.error("No puedes desactivar tu propio usuario mientras estás en sesión.");
      return;
    }
    updateUser(user.id, { isActive: !user.isActive, username: user.username, role: user.role });
    toast.success(user.isActive ? 'Usuario desactivado' : 'Usuario reactivado');
  };

  const handleDelete = (user) => {
    if (user.id === currentUser.id) {
      toast.error("No puedes eliminar tu propio usuario.");
      return;
    }
    if (window.confirm(`¿Estás seguro de eliminar permanentemente al usuario '${user.username}'?`)) {
      deleteUser(user.id);
      toast.success('Usuario eliminado');
    }
  };

  if (isAdding) {
    return (
      <div className="modal-overlay">
        <div className="modal-content" style={{ maxWidth: '500px', width: '95%' }}>
          <UserForm onCancel={() => { setIsAdding(false); setEditingUser(null); }} initialData={editingUser} />
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="topbar">
        <div>
          <h1 className="page-title">Gestión de Cuentas de Usuario</h1>
          <p style={{ color: 'var(--color-text-light)', fontSize: '0.875rem' }}>
            Administra los usuarios con acceso al sistema y sus roles asignados.
          </p>
        </div>
        <button className="btn btn-primary" onClick={() => { setEditingRole: null; setEditingUser(null); setIsAdding(true); }}>
          <Plus size={18} /> Nuevo Usuario
        </button>
      </div>

      <div className="card" style={{ padding: '0' }}>
        <div className="table-container" style={{ border: 'none', boxShadow: 'none' }}>
          <table>
            <thead>
              <tr>
                <th>Usuario</th>
                <th>Rol Asignado</th>
                <th>Estado</th>
                <th>Último Acceso</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {users.map(u => (
                <tr key={u.id} style={{ opacity: u.isActive !== false ? 1 : 0.6 }}>
                  <td style={{ fontWeight: '600' }}>{u.username}</td>
                  <td>
                    <span className={`badge ${u.role === 'admin' ? 'badge-primary' : 'badge-gray'}`}>
                      {u.roleName || (u.role === 'admin' ? 'Administrador' : 'Usuario')}
                    </span>
                  </td>
                  <td>
                    <span className={`badge ${u.isActive !== false ? 'badge-success' : 'badge-danger'}`}>
                      {u.isActive !== false ? 'Activo' : 'Desactivado'}
                    </span>
                  </td>
                  <td style={{ fontSize: '0.8rem', color: 'var(--color-text-light)' }}>
                    {u.last_login ? new Date(u.last_login).toLocaleString() : 'Sin registros'}
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                      <button onClick={() => { setEditingUser(u); setIsAdding(true); }} className="btn btn-outline" style={{ padding: '0.25rem 0.5rem', fontSize: '0.8rem' }}>
                        Editar
                      </button>
                      {onConfigureAccess && (
                        <button onClick={() => onConfigureAccess(u)} className="btn btn-outline" style={{ padding: '0.25rem 0.5rem', fontSize: '0.8rem', color: 'var(--color-primary)' }}>
                          Permisos
                        </button>
                      )}
                      {u.id !== currentUser.id && (
                        <button 
                          onClick={() => handleToggleActive(u)} 
                          className={`btn ${u.isActive !== false ? 'btn-danger' : 'btn-success'}`} 
                          style={{ padding: '0.25rem 0.5rem', fontSize: '0.8rem', backgroundColor: u.isActive !== false ? '' : 'var(--color-success)', color: 'white', border: 'none' }}
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
                  <td colSpan="5" style={{ textAlign: 'center', padding: '2rem' }}>No hay usuarios activos.</td>
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
