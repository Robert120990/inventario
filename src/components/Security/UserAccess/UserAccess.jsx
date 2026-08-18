import React, { useState, useEffect } from 'react';
import { useInventory } from '../../../context/InventoryContext';
import { GitBranch, Save, Check, X, User, Sparkles, Eye, Plus, Edit2, Trash2, Download, Shield, Layers } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { SYSTEM_MODULES, GROUPS_ORDER } from '../../../config/modules';

const UserAccess = ({ initialSelectedUserId }) => {
  const { users, roles, fetchUsers, updateUserPermissions, currentUser } = useInventory();
  const [selectedUserId, setSelectedUserId] = useState(initialSelectedUserId ? String(initialSelectedUserId) : '');
  const [permissions, setPermissions] = useState({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchUsers();
  }, []);

  useEffect(() => {
    if (initialSelectedUserId) {
      setSelectedUserId(String(initialSelectedUserId));
    } else if (!selectedUserId && users.length > 0) {
      setSelectedUserId(String(users[0].id));
    }
  }, [users, initialSelectedUserId]);

  const selectedUser = users.find(u => String(u.id) === String(selectedUserId));

  useEffect(() => {
    if (selectedUser) {
      const userRole = roles.find(r => r.id === selectedUser.role_id || r.name.toLowerCase() === (selectedUser.role || '').toLowerCase());
      const basePerms = selectedUser.permissions || userRole?.permissions || {};
      
      const formatted = {};
      SYSTEM_MODULES.forEach(m => {
        const modPerm = basePerms[m.id];
        const hasExplicit = modPerm !== undefined && typeof modPerm === 'object';
        const isLegacyAdmin = selectedUser.role === 'admin' && !selectedUser.permissions;

        formatted[m.id] = {
          view: hasExplicit ? Boolean(modPerm.view) : isLegacyAdmin,
          create: hasExplicit ? Boolean(modPerm.create) : (isLegacyAdmin && m.actions.includes('create')),
          edit: hasExplicit ? Boolean(modPerm.edit) : (isLegacyAdmin && m.actions.includes('edit')),
          delete: hasExplicit ? Boolean(modPerm.delete) : (isLegacyAdmin && m.actions.includes('delete')),
          export: hasExplicit ? Boolean(modPerm.export) : (isLegacyAdmin && m.actions.includes('export'))
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
      
      // If enabling create, edit, delete, export -> auto-enable view
      if (nextVal && action !== 'view') {
        updatedMod.view = true;
      }
      // If disabling view -> auto-disable create, edit, delete, export
      if (!nextVal && action === 'view') {
        updatedMod.create = false;
        updatedMod.edit = false;
        updatedMod.delete = false;
        updatedMod.export = false;
      }

      return {
        ...prev,
        [moduleId]: updatedMod
      };
    });
  };

  const handleSetAll = (enable) => {
    const next = {};
    SYSTEM_MODULES.forEach(m => {
      next[m.id] = {
        view: enable,
        create: enable && m.actions.includes('create'),
        edit: enable && m.actions.includes('edit'),
        delete: enable && m.actions.includes('delete'),
        export: enable && m.actions.includes('export')
      };
    });
    setPermissions(next);
  };

  const handleSetReadOnly = () => {
    const next = {};
    SYSTEM_MODULES.forEach(m => {
      next[m.id] = {
        view: true,
        create: false,
        edit: false,
        delete: false,
        export: false
      };
    });
    setPermissions(next);
  };

  const handleToggleGroup = (groupName, enable) => {
    setPermissions(prev => {
      const updated = { ...prev };
      SYSTEM_MODULES.filter(m => m.group === groupName).forEach(m => {
        updated[m.id] = {
          view: enable,
          create: enable && m.actions.includes('create'),
          edit: enable && m.actions.includes('edit'),
          delete: enable && m.actions.includes('delete'),
          export: enable && m.actions.includes('export')
        };
      });
      return updated;
    });
  };

  const handleSave = async () => {
    if (!selectedUserId) return;
    setSaving(true);
    try {
      const res = await updateUserPermissions(Number(selectedUserId), permissions);
      if (res.success) {
        toast.success(`Permisos guardados para '${selectedUser?.username}'`);
      } else {
        toast.error('Error al guardar permisos.');
      }
    } catch (e) {
      toast.error('Ocurrió un error inesperado.');
    } finally {
      setSaving(false);
    }
  };

  const isCurrentEditingSelf = currentUser && String(currentUser.id) === String(selectedUser?.id);

  // Group modules
  const groupedModules = GROUPS_ORDER.map(groupName => ({
    group: groupName,
    items: SYSTEM_MODULES.filter(m => m.group === groupName)
  }));

  return (
    <div>
      <div className="topbar">
        <div>
          <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <GitBranch size={24} style={{ color: 'var(--color-primary)' }} /> Accesos y Permisos por Pantalla
          </h1>
          <p style={{ color: 'var(--color-text-light)', fontSize: '0.875rem' }}>
            Cada pantalla del sistema cuenta con su respectivo permiso de visualización, edición y descarga de archivos.
          </p>
        </div>
        <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
          <Save size={18} /> {saving ? 'Guardando...' : 'Guardar Cambios'}
        </button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', marginBottom: '2rem' }}>
        {/* User Selection & Preset Actions Card */}
        <div className="card" style={{ padding: '1.25rem 1.5rem' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flex: 1, minWidth: '280px' }}>
              <div style={{ width: '38px', height: '38px', borderRadius: '50%', backgroundColor: 'rgba(59, 130, 246, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-primary)' }}>
                <User size={20} />
              </div>
              <div>
                <label className="form-label" style={{ marginBottom: '0.2rem', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Seleccionar Usuario para Gestionar
                </label>
                <select
                  className="form-select"
                  value={selectedUserId}
                  onChange={(e) => setSelectedUserId(e.target.value)}
                  style={{ minWidth: '280px', padding: '0.45rem 0.75rem', fontWeight: '600' }}
                >
                  {users.map(u => (
                    <option key={u.id} value={String(u.id)}>
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
                  Matriz de Permisos: <span style={{ color: 'var(--color-primary)' }}>{selectedUser?.username}</span>
                </h2>
                {isCurrentEditingSelf && (
                  <span className="badge badge-primary" style={{ fontSize: '0.7rem' }}>Tu usuario en sesión</span>
                )}
              </div>
              <p style={{ fontSize: '0.8rem', color: 'var(--color-text-light)', margin: '0.2rem 0 0 0' }}>
                Rol base asignado: <strong>{selectedUser?.roleName || selectedUser?.role}</strong> (total {SYSTEM_MODULES.length} pantallas configurables)
              </p>
            </div>

            <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', fontSize: '0.75rem', color: 'var(--color-text-light)' }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}>
                <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: 'var(--color-success)' }}></span> Autorizado
              </span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}>
                <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: 'var(--color-border)' }}></span> Bloqueado
              </span>
            </div>
          </div>

          <div className="table-container" style={{ border: 'none', boxShadow: 'none' }}>
            <table>
              <thead>
                <tr>
                  <th style={{ width: '35%' }}>Pantalla / Módulo del Sistema</th>
                  <th style={{ textAlign: 'center', width: '13%' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', justifyContent: 'center' }}>
                      <Eye size={13} /> Ver (Acceso)
                    </span>
                  </th>
                  <th style={{ textAlign: 'center', width: '13%' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', justifyContent: 'center' }}>
                      <Plus size={13} /> Crear
                    </span>
                  </th>
                  <th style={{ textAlign: 'center', width: '13%' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', justifyContent: 'center' }}>
                      <Edit2 size={13} /> Editar
                    </span>
                  </th>
                  <th style={{ textAlign: 'center', width: '13%' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', justifyContent: 'center' }}>
                      <Trash2 size={13} /> Eliminar
                    </span>
                  </th>
                  <th style={{ textAlign: 'center', width: '13%' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', justifyContent: 'center' }}>
                      <Download size={13} /> Exportar
                    </span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {groupedModules.map(groupObj => (
                  <React.Fragment key={groupObj.group}>
                    {/* Group Header Row */}
                    <tr style={{ backgroundColor: 'rgba(255,255,255,0.03)', borderTop: '2px solid var(--color-border)' }}>
                      <td colSpan="6" style={{ padding: '0.65rem 1rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <span style={{ fontWeight: '700', fontSize: '0.85rem', color: 'var(--color-primary)', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                            <Layers size={14} /> {groupObj.group}
                          </span>
                          <div style={{ display: 'flex', gap: '0.4rem' }}>
                            <button
                              type="button"
                              onClick={() => handleToggleGroup(groupObj.group, true)}
                              style={{ background: 'none', border: 'none', color: 'var(--color-success)', fontSize: '0.7rem', cursor: 'pointer', fontWeight: '600' }}
                            >
                              + Activar Grupo
                            </button>
                            <span style={{ color: 'var(--color-border)' }}>|</span>
                            <button
                              type="button"
                              onClick={() => handleToggleGroup(groupObj.group, false)}
                              style={{ background: 'none', border: 'none', color: 'var(--color-danger)', fontSize: '0.7rem', cursor: 'pointer', fontWeight: '600' }}
                            >
                              - Desactivar Grupo
                            </button>
                          </div>
                        </div>
                      </td>
                    </tr>

                    {/* Group Module Rows */}
                    {groupObj.items.map(mod => {
                      const modPerms = permissions[mod.id] || {};
                      const isVisible = Boolean(modPerms.view);

                      return (
                        <tr key={mod.id} style={{ opacity: isVisible ? 1 : 0.65 }}>
                          <td style={{ paddingLeft: '1.5rem' }}>
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

                          {/* Export */}
                          <td style={{ textAlign: 'center' }}>
                            {mod.actions.includes('export') ? (
                              <button
                                type="button"
                                className={`perm-toggle-btn ${modPerms.export ? 'active view-act' : ''}`}
                                onClick={() => handleToggle(mod.id, 'export')}
                                title={modPerms.export ? 'Permiso para exportar' : 'Sin permiso de exportación'}
                              >
                                {modPerms.export ? <Check size={18} /> : <X size={18} />}
                              </button>
                            ) : (
                              <span style={{ color: 'var(--color-text-light)', opacity: 0.4 }}>—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>

          <div style={{ padding: '1rem 1.5rem', backgroundColor: 'var(--color-bg)', borderTop: '1px solid var(--color-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
            <span style={{ fontSize: '0.8rem', color: 'var(--color-text-light)' }}>
              * Al desmarcar <strong>Ver (Acceso)</strong>, la pantalla y su opción en el menú quedarán completamente bloqueadas para este usuario.
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
