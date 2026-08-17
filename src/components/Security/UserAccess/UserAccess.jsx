import React, { useState, useEffect } from 'react';
import { useInventory } from '../../../context/InventoryContext';
import { GitBranch, Save, ShieldCheck, CheckSquare, Square, User, AlertCircle, RefreshCw } from 'lucide-react';
import { toast } from 'react-hot-toast';

const MODULES_CONFIG = [
  { id: 'dashboard', name: 'Dashboard', actions: ['view'] },
  { id: 'products', name: 'Productos', actions: ['view', 'create', 'edit', 'delete'] },
  { id: 'inventory-count', name: 'Toma de Inventario', actions: ['view', 'create', 'edit', 'delete'] },
  { id: 'movements', name: 'Movimientos (Entradas/Salidas)', actions: ['view', 'create', 'edit', 'delete'] },
  { id: 'insurance', name: 'Corte de Seguro', actions: ['view'] },
  { id: 'summary', name: 'Resumen Detallado', actions: ['view'] },
  { id: 'summary2', name: 'Resumen Diario', actions: ['view'] },
  { id: 'security', name: 'Módulo de Seguridad', actions: ['view', 'create', 'edit', 'delete'] },
  { id: 'settings', name: 'Configuración del Sistema', actions: ['view', 'edit'] },
];

const ACTION_LABELS = {
  view: 'Ver',
  create: 'Crear',
  edit: 'Editar',
  delete: 'Eliminar'
};

const UserAccess = () => {
  const { users, roles, fetchUsers, updateUserPermissions, currentUser } = useInventory();
  const [selectedUserId, setSelectedUserId] = useState('');
  const [permissions, setPermissions] = useState({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchUsers();
  }, []);

  useEffect(() => {
    if (!selectedUserId && users.length > 0) {
      setSelectedUserId(users[0].id.toString());
    }
  }, [users, selectedUserId]);

  const selectedUser = users.find(u => u.id.toString() === selectedUserId);

  useEffect(() => {
    if (selectedUser) {
      // Find role default permissions if user has no custom permissions
      const userRole = roles.find(r => r.id === selectedUser.role_id || r.name.toLowerCase() === (selectedUser.role || '').toLowerCase());
      const basePerms = selectedUser.permissions || userRole?.permissions || {};
      
      // Default structure
      const formatted = {};
      MODULES_CONFIG.forEach(m => {
        formatted[m.id] = {
          view: Boolean(basePerms[m.id]?.view ?? (selectedUser.role === 'admin')),
          create: Boolean(basePerms[m.id]?.create ?? (selectedUser.role === 'admin')),
          edit: Boolean(basePerms[m.id]?.edit ?? (selectedUser.role === 'admin')),
          delete: Boolean(basePerms[m.id]?.delete ?? (selectedUser.role === 'admin'))
        };
      });
      setPermissions(formatted);
    }
  }, [selectedUserId, selectedUser, roles]);

  const handleToggle = (moduleId, action) => {
    setPermissions(prev => {
      const currentMod = prev[moduleId] || {};
      const nextVal = !currentMod[action];
      const updatedMod = { ...currentMod, [action]: nextVal };
      
      // If giving create, edit, or delete, ensure view is also enabled
      if (nextVal && action !== 'view') {
        updatedMod.view = true;
      }
      // If disabling view, disable create/edit/delete
      if (!nextVal && action === 'view') {
        updatedMod.create = false;
        updatedMod.edit = false;
        updatedMod.delete = false;
      }

      return {
        ...prev,
        [moduleId]: updatedMod
      };
    });
  };

  const handleSetAll = (enable) => {
    const next = {};
    MODULES_CONFIG.forEach(m => {
      next[m.id] = {
        view: enable,
        create: enable && m.actions.includes('create'),
        edit: enable && m.actions.includes('edit'),
        delete: enable && m.actions.includes('delete')
      };
    });
    setPermissions(next);
  };

  const handleSetReadOnly = () => {
    const next = {};
    MODULES_CONFIG.forEach(m => {
      next[m.id] = {
        view: true,
        create: false,
        edit: false,
        delete: false
      };
    });
    setPermissions(next);
  };

  const handleSave = async () => {
    if (!selectedUserId) return;
    setSaving(true);
    try {
      const res = await updateUserPermissions(Number(selectedUserId), permissions);
      if (res.success) {
        toast.success(`Permisos guardados para el usuario ${selectedUser?.username}`);
      } else {
        toast.error('Error al guardar permisos.');
      }
    } catch (e) {
      toast.error('Ocurrió un error inesperado.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <div className="topbar">
        <div>
          <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <GitBranch size={24} style={{ color: 'var(--color-primary)' }} /> Accesos y Permisos de Usuario
          </h1>
          <p style={{ color: 'var(--color-text-light)', fontSize: '0.875rem' }}>
            Controla granularmente qué módulos puede ver, crear, editar o eliminar cada usuario.
          </p>
        </div>
        <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
          <Save size={18} /> {saving ? 'Guardando...' : 'Guardar Permisos'}
        </button>
      </div>

      <div className="grid grid-cols-1" style={{ gap: '1.5rem', marginBottom: '1.5rem' }}>
        {/* User Selector Bar */}
        <div className="card" style={{ padding: '1rem 1.5rem' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flex: 1, minWidth: '280px' }}>
              <User size={20} style={{ color: 'var(--color-primary)' }} />
              <label style={{ fontWeight: '600', fontSize: '0.9rem', whiteSpace: 'nowrap' }}>Seleccionar Usuario:</label>
              <select
                className="form-select"
                value={selectedUserId}
                onChange={(e) => setSelectedUserId(e.target.value)}
                style={{ flex: 1, maxWidth: '300px' }}
              >
                {users.map(u => (
                  <option key={u.id} value={u.id.toString()}>
                    {u.username} — Rol: {u.roleName || (u.role === 'admin' ? 'Administrador' : 'Usuario')} {u.isActive === 0 ? '(Inactivo)' : ''}
                  </option>
                ))}
              </select>
            </div>

            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              <button type="button" className="btn btn-outline" onClick={() => handleSetAll(true)} style={{ fontSize: '0.75rem', padding: '0.35rem 0.75rem' }}>
                Acceso Total
              </button>
              <button type="button" className="btn btn-outline" onClick={handleSetReadOnly} style={{ fontSize: '0.75rem', padding: '0.35rem 0.75rem' }}>
                Solo Lectura
              </button>
              <button type="button" className="btn btn-outline" onClick={() => handleSetAll(false)} style={{ fontSize: '0.75rem', padding: '0.35rem 0.75rem', color: 'var(--color-danger)' }}>
                Denegar Todo
              </button>
            </div>
          </div>
        </div>

        {/* Matrix Card */}
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '1rem 1.5rem', borderBottom: '1px solid var(--color-border)', backgroundColor: 'var(--color-bg)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <h2 style={{ fontSize: '1rem', fontWeight: '600', margin: 0, color: 'var(--color-primary)' }}>
                Matriz de Permisos: <span style={{ color: 'var(--color-text)' }}>{selectedUser?.username}</span>
              </h2>
              <span style={{ fontSize: '0.75rem', color: 'var(--color-text-light)' }}>
                Rol asignado: <strong>{selectedUser?.roleName || selectedUser?.role}</strong>
              </span>
            </div>
            {selectedUser?.role === 'admin' && (
              <span className="badge badge-primary" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
                <ShieldCheck size={12} /> Administrador (Acceso total por defecto)
              </span>
            )}
          </div>

          <div className="table-container" style={{ border: 'none', boxShadow: 'none' }}>
            <table>
              <thead>
                <tr>
                  <th style={{ width: '30%' }}>Módulo del Sistema</th>
                  <th style={{ textAlign: 'center', width: '17%' }}>Ver (Acceso)</th>
                  <th style={{ textAlign: 'center', width: '17%' }}>Crear</th>
                  <th style={{ textAlign: 'center', width: '17%' }}>Editar</th>
                  <th style={{ textAlign: 'center', width: '17%' }}>Eliminar</th>
                </tr>
              </thead>
              <tbody>
                {MODULES_CONFIG.map(mod => {
                  const modPerms = permissions[mod.id] || {};
                  return (
                    <tr key={mod.id}>
                      <td style={{ fontWeight: '500' }}>
                        {mod.name}
                      </td>

                      {/* View */}
                      <td style={{ textAlign: 'center' }}>
                        <button
                          type="button"
                          onClick={() => handleToggle(mod.id, 'view')}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: modPerms.view ? 'var(--color-success)' : 'var(--color-text-light)' }}
                          title="Permiso de visualización"
                        >
                          {modPerms.view ? <CheckSquare size={20} /> : <Square size={20} />}
                        </button>
                      </td>

                      {/* Create */}
                      <td style={{ textAlign: 'center' }}>
                        {mod.actions.includes('create') ? (
                          <button
                            type="button"
                            onClick={() => handleToggle(mod.id, 'create')}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: modPerms.create ? 'var(--color-primary)' : 'var(--color-text-light)' }}
                            title="Permiso para crear registros"
                          >
                            {modPerms.create ? <CheckSquare size={20} /> : <Square size={20} />}
                          </button>
                        ) : (
                          <span style={{ color: 'var(--color-border)', fontSize: '0.8rem' }}>—</span>
                        )}
                      </td>

                      {/* Edit */}
                      <td style={{ textAlign: 'center' }}>
                        {mod.actions.includes('edit') ? (
                          <button
                            type="button"
                            onClick={() => handleToggle(mod.id, 'edit')}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: modPerms.edit ? '#d97706' : 'var(--color-text-light)' }}
                            title="Permiso para editar registros"
                          >
                            {modPerms.edit ? <CheckSquare size={20} /> : <Square size={20} />}
                          </button>
                        ) : (
                          <span style={{ color: 'var(--color-border)', fontSize: '0.8rem' }}>—</span>
                        )}
                      </td>

                      {/* Delete */}
                      <td style={{ textAlign: 'center' }}>
                        {mod.actions.includes('delete') ? (
                          <button
                            type="button"
                            onClick={() => handleToggle(mod.id, 'delete')}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: modPerms.delete ? 'var(--color-danger)' : 'var(--color-text-light)' }}
                            title="Permiso para eliminar o anular"
                          >
                            {modPerms.delete ? <CheckSquare size={20} /> : <Square size={20} />}
                          </button>
                        ) : (
                          <span style={{ color: 'var(--color-border)', fontSize: '0.8rem' }}>—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div style={{ padding: '1rem 1.5rem', backgroundColor: 'var(--color-bg)', borderTop: '1px solid var(--color-border)', display: 'flex', justifyContent: 'flex-end', gap: '1rem' }}>
            <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
              <Save size={18} /> {saving ? 'Guardando...' : 'Guardar Cambios de Permisos'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default UserAccess;
