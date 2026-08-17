import React, { useState, useEffect } from 'react';
import { useInventory } from '../../../context/InventoryContext';
import { Shield, Plus, Edit2, Trash2, ShieldCheck, Users } from 'lucide-react';
import { toast } from 'react-hot-toast';
import RoleForm from './RoleForm';

const RoleList = () => {
  const { roles, users, fetchRoles, deleteRole, currentUser } = useInventory();
  const [isAdding, setIsAdding] = useState(false);
  const [editingRole, setEditingRole] = useState(null);

  useEffect(() => {
    fetchRoles();
  }, []);

  const handleDelete = async (role) => {
    if (role.name.toLowerCase() === 'administrador') {
      toast.error('No se puede eliminar el rol Administrador del sistema.');
      return;
    }
    const usersWithRole = users.filter(u => u.role_id === role.id || u.role?.toLowerCase() === role.name.toLowerCase());
    if (usersWithRole.length > 0) {
      toast.error(`No se puede eliminar: hay ${usersWithRole.length} usuarios asignados a este rol.`);
      return;
    }
    if (window.confirm(`¿Estás seguro de eliminar el rol '${role.name}'?`)) {
      const res = await deleteRole(role.id);
      if (res.success) {
        toast.success('Rol eliminado con éxito');
      } else {
        toast.error('Error al eliminar el rol');
      }
    }
  };

  return (
    <div>
      <div className="topbar">
        <div>
          <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Shield size={24} style={{ color: 'var(--color-primary)' }} /> Gestión de Roles y Perfiles
          </h1>
          <p style={{ color: 'var(--color-text-light)', fontSize: '0.875rem' }}>
            Define perfiles con paquetes de permisos preconfigurados para asignar a los usuarios.
          </p>
        </div>
        <button className="btn btn-primary" onClick={() => { setEditingRole(null); setIsAdding(true); }}>
          <Plus size={18} /> Nuevo Rol
        </button>
      </div>

      <div className="grid grid-cols-2" style={{ gap: '1.5rem', alignItems: 'stretch' }}>
        {roles.map(role => {
          const assignedCount = users.filter(u => u.role_id === role.id || (u.role && u.role.toLowerCase() === role.name.toLowerCase())).length;
          const isAdmin = role.name.toLowerCase() === 'administrador';
          const perms = role.permissions || {};
          const enabledModulesCount = Object.keys(perms).filter(k => perms[k]?.view).length;

          return (
            <div key={role.id} className="card" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', border: isAdmin ? '1px solid var(--color-primary)' : '1px solid var(--color-border)' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    {isAdmin ? <ShieldCheck size={22} style={{ color: 'var(--color-primary)' }} /> : <Shield size={22} style={{ color: 'var(--color-text-light)' }} />}
                    <h3 style={{ fontSize: '1.15rem', fontWeight: '600', margin: 0, color: 'var(--color-primary)' }}>
                      {role.name}
                    </h3>
                  </div>
                  <span className="badge badge-primary" style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                    <Users size={12} /> {assignedCount} {assignedCount === 1 ? 'usuario' : 'usuarios'}
                  </span>
                </div>

                <p style={{ fontSize: '0.875rem', color: 'var(--color-text-light)', marginBottom: '1.25rem', minHeight: '40px' }}>
                  {role.description || 'Sin descripción asignada.'}
                </p>

                <div style={{ padding: '0.75rem', backgroundColor: 'var(--color-bg)', borderRadius: 'var(--radius)', marginBottom: '1rem', fontSize: '0.8rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                    <span style={{ color: 'var(--color-text-light)' }}>Módulos habilitados:</span>
                    <strong>{isAdmin ? 'Acceso Total (9/9)' : `${enabledModulesCount} / 9`}</strong>
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', borderTop: '1px solid var(--color-border)', paddingTop: '1rem', marginTop: '0.5rem' }}>
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={() => { setEditingRole(role); setIsAdding(true); }}
                  style={{ padding: '0.35rem 0.75rem', fontSize: '0.8rem' }}
                >
                  <Edit2 size={14} /> Editar Permisos
                </button>
                {!isAdmin && (
                  <button
                    type="button"
                    className="btn btn-danger"
                    onClick={() => handleDelete(role)}
                    style={{ padding: '0.35rem 0.75rem', fontSize: '0.8rem' }}
                    title="Eliminar rol"
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {isAdding && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '650px', width: '95%' }}>
            <RoleForm
              initialData={editingRole}
              onCancel={() => { setIsAdding(false); setEditingRole(null); }}
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default RoleList;
