import React, { useState, useEffect } from 'react';
import { useInventory } from '../../../context/InventoryContext';
import { GitBranch, Save, ShieldCheck, Check, X, User, Sparkles, ShieldAlert, Eye, Plus, Edit2, Trash2 } from 'lucide-react';
import { toast } from 'react-hot-toast';

const MODULES_CONFIG = [
  { id: 'dashboard', name: 'Dashboard Principal', desc: 'Métricas, KPIs y accesos rápidos', actions: ['view'] },
  { id: 'products', name: 'Catálogo de Productos', desc: 'Existencias, precios, categorías y SKU', actions: ['view', 'create', 'edit', 'delete'] },
  { id: 'inventory-count', name: 'Toma de Inventario', desc: 'Conteo físico y ajustes transaccionales', actions: ['view', 'create', 'edit', 'delete'] },
  { id: 'movements', name: 'Movimientos de Almacén', desc: 'Entradas, salidas, transporte y remisiones', actions: ['view', 'create', 'edit', 'delete'] },
  { id: 'insurance', name: 'Corte de Seguro', desc: 'Reporte valorizado de póliza asegurada', actions: ['view'] },
  { id: 'summary', name: 'Resumen Detallado', desc: 'Kardex consolidado de existencias y flujo', actions: ['view'] },
  { id: 'summary2', name: 'Resumen Diario', desc: 'Volumen diario y operaciones de almacén', actions: ['view'] },
  { id: 'email', name: 'Correo Corporativo', desc: 'Bandeja de entrada empresarial, Roundcube y webmail', actions: ['view', 'create', 'delete'] },
  { id: 'security', name: 'Módulo de Seguridad', desc: 'Usuarios, roles, sesiones y bitácora', actions: ['view', 'create', 'edit', 'delete'] },
  { id: 'settings', name: 'Configuración del Sistema', desc: 'Categorías, documentos y personalización', actions: ['view', 'edit'] },
];

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
      
      const formatted = {};
      MODULES_CONFIG.forEach(m => {
        const modPerm = basePerms[m.id];
        // If user is admin and has NO explicit setting, default to true, otherwise use explicit setting
        const hasExplicitSetting = modPerm !== undefined && typeof modPerm === 'object';
        formatted[m.id] = {
          view: hasExplicitSetting ? Boolean(modPerm.view) : (selectedUser.role === 'admin'),
          create: hasExplicitSetting ? Boolean(modPerm.create) : (selectedUser.role === 'admin'),
          edit: hasExplicitSetting ? Boolean(modPerm.edit) : (selectedUser.role === 'admin'),
          delete: hasExplicitSetting ? Boolean(modPerm.delete) : (selectedUser.role === 'admin')
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
      
      // If granting create, edit, or delete, auto-enable view
      if (nextVal && action !== 'view') {
        updatedMod.view = true;
      }
      // If disabling view, auto-disable create, edit, delete
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
        toast.success(`Permisos actualizados para '${selectedUser?.username}'`);
      } else {
        toast.error('Error al guardar permisos.');
      }
    } catch (e) {
      toast.error('Ocurrió un error inesperado.');
    } finally {
      setSaving(false);
    }
  };

  const isCurrentEditingSelf = currentUser?.id === selectedUser?.id;

  return (
    <div>
      <div className="topbar">
        <div>
          <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <GitBranch size={24} style={{ color: 'var(--color-primary)' }} /> Accesos y Permisos de Usuario
          </h1>
          <p style={{ color: 'var(--color-text-light)', fontSize: '0.875rem' }}>
            Controla exactamente a qué módulos puede entrar cada usuario y qué acciones tiene autorizadas.
          </p>
        </div>
        <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
          <Save size={18} /> {saving ? 'Guardando...' : 'Guardar Permisos'}
        </button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', marginBottom: '2rem' }}>
        {/* User Selection & Preset Actions Card */}
        <div className="card" style={{ padding: '1.25rem 1.5rem' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flex: 1, minWidth: '280px' }}>
              <div style={{ width: '36px', height: '36px', borderRadius: '50%', backgroundColor: 'rgba(59, 130, 246, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-primary)' }}>
                <User size={18} />
              </div>
              <div>
                <label className="form-label" style={{ marginBottom: '0.2rem', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Seleccionar Cuenta
                </label>
                <select
                  className="form-select"
                  value={selectedUserId}
                  onChange={(e) => setSelectedUserId(e.target.value)}
                  style={{ minWidth: '260px', padding: '0.45rem 0.75rem', fontWeight: '600' }}
                >
                  {users.map(u => (
                    <option key={u.id} value={u.id.toString()}>
                      {u.username} — {u.roleName || (u.role === 'admin' ? 'Administrador' : 'Usuario')} {u.isActive === false ? '(Inactivo)' : ''}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
              <span style={{ fontSize: '0.75rem', color: 'var(--color-text-light)', marginRight: '0.25rem' }}>Plantillas Rápidas:</span>
              <button type="button" className="btn btn-outline" onClick={() => handleSetAll(true)} style={{ fontSize: '0.75rem', padding: '0.35rem 0.75rem' }}>
                <Sparkles size={13} style={{ color: 'var(--color-success)' }} /> Acceso Total
              </button>
              <button type="button" className="btn btn-outline" onClick={handleSetReadOnly} style={{ fontSize: '0.75rem', padding: '0.35rem 0.75rem' }}>
                <Eye size={13} style={{ color: 'var(--color-primary)' }} /> Solo Lectura
              </button>
              <button type="button" className="btn btn-outline" onClick={() => handleSetAll(false)} style={{ fontSize: '0.75rem', padding: '0.35rem 0.75rem', color: 'var(--color-danger)' }}>
                <X size={13} /> Denegar Todo
              </button>
            </div>
          </div>
        </div>

        {/* Matrix Card */}
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '1rem 1.5rem', borderBottom: '1px solid var(--color-border)', backgroundColor: 'var(--color-bg)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <h2 style={{ fontSize: '1.05rem', fontWeight: '700', margin: 0, color: 'var(--color-text)' }}>
                  Matriz de Accesos: <span style={{ color: 'var(--color-primary)' }}>{selectedUser?.username}</span>
                </h2>
                {isCurrentEditingSelf && (
                  <span className="badge badge-primary" style={{ fontSize: '0.7rem' }}>Tu usuario en sesión</span>
                )}
              </div>
              <p style={{ fontSize: '0.8rem', color: 'var(--color-text-light)', margin: '0.2rem 0 0 0' }}>
                Rol asignado: <strong>{selectedUser?.roleName || selectedUser?.role}</strong>
              </p>
            </div>

            <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', fontSize: '0.75rem', color: 'var(--color-text-light)' }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}>
                <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: 'var(--color-success)' }}></span> Autorizado
              </span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}>
                <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: 'var(--color-border)' }}></span> Restringido
              </span>
            </div>
          </div>

          <div className="table-container" style={{ border: 'none', boxShadow: 'none' }}>
            <table>
              <thead>
                <tr>
                  <th style={{ width: '38%' }}>Módulo del Sistema</th>
                  <th style={{ textAlign: 'center', width: '15.5%' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', justifyContent: 'center' }}>
                      <Eye size={13} /> Ver (Acceso)
                    </span>
                  </th>
                  <th style={{ textAlign: 'center', width: '15.5%' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', justifyContent: 'center' }}>
                      <Plus size={13} /> Crear
                    </span>
                  </th>
                  <th style={{ textAlign: 'center', width: '15.5%' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', justifyContent: 'center' }}>
                      <Edit2 size={13} /> Editar
                    </span>
                  </th>
                  <th style={{ textAlign: 'center', width: '15.5%' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', justifyContent: 'center' }}>
                      <Trash2 size={13} /> Eliminar
                    </span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {MODULES_CONFIG.map(mod => {
                  const modPerms = permissions[mod.id] || {};
                  const isVisible = Boolean(modPerms.view);

                  return (
                    <tr key={mod.id} style={{ opacity: isVisible ? 1 : 0.65 }}>
                      <td>
                        <div style={{ fontWeight: '600', color: isVisible ? 'var(--color-text)' : 'var(--color-text-light)' }}>
                          {mod.name}
                        </div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--color-text-light)', marginTop: '0.15rem' }}>
                          {mod.desc}
                        </div>
                      </td>

                      {/* View */}
                      <td style={{ textAlign: 'center' }}>
                        <button
                          type="button"
                          className={`perm-toggle-btn ${modPerms.view ? 'active view-act' : ''}`}
                          onClick={() => handleToggle(mod.id, 'view')}
                          title={modPerms.view ? 'Acceso habilitado' : 'Acceso deshabilitado'}
                        >
                          {modPerms.view ? <Check size={18} /> : <X size={18} />}
                        </button>
                      </td>

                      {/* Create */}
                      <td style={{ textAlign: 'center' }}>
                        {mod.actions.includes('create') ? (
                          <button
                            type="button"
                            className={`perm-toggle-btn ${modPerms.create ? 'active' : ''}`}
                            onClick={() => handleToggle(mod.id, 'create')}
                            title={modPerms.create ? 'Permiso para crear' : 'Sin permiso de creación'}
                          >
                            {modPerms.create ? <Check size={18} /> : <X size={18} />}
                          </button>
                        ) : (
                          <span style={{ color: 'var(--color-text-light)', opacity: 0.4 }}>—</span>
                        )}
                      </td>

                      {/* Edit */}
                      <td style={{ textAlign: 'center' }}>
                        {mod.actions.includes('edit') ? (
                          <button
                            type="button"
                            className={`perm-toggle-btn ${modPerms.edit ? 'active' : ''}`}
                            onClick={() => handleToggle(mod.id, 'edit')}
                            title={modPerms.edit ? 'Permiso para editar' : 'Sin permiso de edición'}
                          >
                            {modPerms.edit ? <Check size={18} /> : <X size={18} />}
                          </button>
                        ) : (
                          <span style={{ color: 'var(--color-text-light)', opacity: 0.4 }}>—</span>
                        )}
                      </td>

                      {/* Delete */}
                      <td style={{ textAlign: 'center' }}>
                        {mod.actions.includes('delete') ? (
                          <button
                            type="button"
                            className={`perm-toggle-btn ${modPerms.delete ? 'active del-act' : ''}`}
                            onClick={() => handleToggle(mod.id, 'delete')}
                            title={modPerms.delete ? 'Permiso para eliminar' : 'Sin permiso de eliminación'}
                          >
                            {modPerms.delete ? <Check size={18} /> : <X size={18} />}
                          </button>
                        ) : (
                          <span style={{ color: 'var(--color-text-light)', opacity: 0.4 }}>—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div style={{ padding: '1rem 1.5rem', backgroundColor: 'var(--color-bg)', borderTop: '1px solid var(--color-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
            <span style={{ fontSize: '0.8rem', color: 'var(--color-text-light)' }}>
              * Al desactivar <strong>Ver (Acceso)</strong>, el menú desaparecerá inmediatamente para este usuario.
            </span>
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
