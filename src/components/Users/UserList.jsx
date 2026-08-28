import React, { useState } from 'react';
import { useInventory } from '../../context/InventoryContext';
import { Plus, UserCheck, UserX, User, Shield, Key, Edit2, Trash2, GitBranch } from 'lucide-react';
import { toast } from 'react-hot-toast';
import UserForm from './UserForm';
import { formatDate } from '../../utils/formatUtils';

const UserList = ({ onConfigureAccess }) => {
  const { users, currentUser, updateUser, deleteUser, canCreate, canEdit, canDelete, canView } = useInventory();
  const [isAdding, setIsAdding] = useState(false);
  const [editingUser, setEditingUser] = useState(null);

  const allowCreate = canCreate('security-users');
  const allowEdit = canEdit('security-users');
  const allowDelete = canDelete('security-users');
  const allowAccessMatrix = canView('security-access');


  const handleToggleActive = (user) => {
    if (String(user.id) === String(currentUser?.id)) {
      toast.error("No puedes desactivar tu propio usuario mientras estás en sesión.");
      return;
    }
    updateUser(user.id, { isActive: !user.isActive, username: user.username, role: user.role, role_id: user.role_id });
    toast.success(user.isActive ? 'Usuario desactivado' : 'Usuario reactivado');
  };

  const handleDelete = (user) => {
    if (String(user.id) === String(currentUser?.id)) {
      toast.error("No puedes eliminar tu propio usuario.");
      return;
    }
    if (window.confirm(`¿Estás seguro de eliminar permanentemente al usuario '${user.username}'?`)) {
      deleteUser(user.id);
      toast.success('Usuario eliminado del sistema');
    }
  };

  return (
    <div>
      <div className="topbar">
        <div>
          <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <User size={24} style={{ color: 'var(--color-primary)' }} /> Gestión de Cuentas de Usuario
          </h1>
          <p style={{ color: 'var(--color-text-light)', fontSize: '0.875rem' }}>
            Administra los usuarios con acceso al sistema, asignación de roles y credenciales.
          </p>
        </div>
        {allowCreate && (
          <button className="btn btn-primary" onClick={() => { setEditingUser(null); setIsAdding(true); }}>
            <Plus size={18} /> Nuevo Usuario
          </button>
        )}
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
                <th style={{ textAlign: 'center' }}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {users.map(u => {
                const isSelf = String(u.id) === String(currentUser?.id);
                return (
                  <tr key={u.id} style={{ opacity: u.isActive !== false ? 1 : 0.6 }}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <strong style={{ color: 'var(--color-text)' }}>{u.username}</strong>
                        {isSelf && (
                          <span className="badge badge-primary" style={{ fontSize: '0.65rem' }}>Tú</span>
                        )}
                      </div>
                    </td>
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
                      {u.last_login ? formatDate(u.last_login) : 'Sin registros'}
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: '0.4rem', justifyContent: 'center', flexWrap: 'wrap' }}>
                        {allowEdit && (
                          <button
                            onClick={() => { setEditingUser(u); setIsAdding(true); }}
                            className="btn btn-outline"
                            style={{ padding: '0.25rem 0.5rem', fontSize: '0.8rem' }}
                            title="Editar usuario o restablecer contraseña"
                          >
                            <Edit2 size={13} /> Editar
                          </button>
                        )}
                        {allowAccessMatrix && onConfigureAccess && (
                          <button
                            onClick={() => onConfigureAccess(u)}
                            className="btn btn-outline"
                            style={{ padding: '0.25rem 0.5rem', fontSize: '0.8rem', color: 'var(--color-primary)' }}
                            title="Configurar permisos por pantalla para este usuario"
                          >
                            <GitBranch size={13} /> Permisos
                          </button>
                        )}
                        {allowEdit && !isSelf && (
                          <button 
                            onClick={() => handleToggleActive(u)} 
                            className={`btn ${u.isActive !== false ? 'btn-danger' : 'btn-success'}`} 
                            style={{ padding: '0.25rem 0.5rem', fontSize: '0.8rem', backgroundColor: u.isActive !== false ? '' : 'var(--color-success)', color: 'white', border: 'none' }}
                            title={u.isActive !== false ? 'Desactivar acceso' : 'Reactivar acceso'}
                          >
                            {u.isActive !== false ? <><UserX size={13} /> Desactivar</> : <><UserCheck size={13} /> Activar</>}
                          </button>
                        )}
                        {allowDelete && !isSelf && (
                          <button 
                            onClick={() => handleDelete(u)} 
                            className="btn btn-danger" 
                            style={{ padding: '0.25rem 0.5rem', fontSize: '0.8rem' }}
                            title="Eliminar usuario permanentemente"
                          >
                            <Trash2 size={13} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {users.length === 0 && (
                <tr>
                  <td colSpan="5" style={{ textAlign: 'center', padding: '2rem' }}>No hay usuarios registrados.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {isAdding && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '500px', width: '95%' }}>
            <UserForm onCancel={() => { setIsAdding(false); setEditingUser(null); }} initialData={editingUser} />
          </div>
        </div>
      )}
    </div>
  );
};

export default UserList;
