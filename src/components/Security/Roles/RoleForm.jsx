import React, { useState } from 'react';
import { useInventory } from '../../../context/InventoryContext';
import { Save, X, Check, Eye, Plus, Edit2, Trash2, Shield, Layers, Sparkles } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { SYSTEM_MODULES, GROUPS_ORDER } from '../../../config/modules';

const RoleForm = ({ onCancel, initialData }) => {
  const { addRole, updateRole } = useInventory();
  const [name, setName] = useState(initialData?.name || '');
  const [description, setDescription] = useState(initialData?.description || '');
  const [saving, setSaving] = useState(false);

  const [permissions, setPermissions] = useState(() => {
    const base = initialData?.permissions || {};
    const formatted = {};
    SYSTEM_MODULES.forEach(m => {
      formatted[m.id] = {
        view: Boolean(base[m.id]?.view),
        create: Boolean(base[m.id]?.create),
        edit: Boolean(base[m.id]?.edit),
        delete: Boolean(base[m.id]?.delete),
        export: Boolean(base[m.id]?.export)
      };
    });
    return formatted;
  });

  const handleToggle = (moduleId, action) => {
    setPermissions(prev => {
      const current = prev[moduleId] || {};
      const nextVal = !current[action];
      const updated = { ...current, [action]: nextVal };
      if (nextVal && action !== 'view') updated.view = true;
      if (!nextVal && action === 'view') {
        updated.create = false;
        updated.edit = false;
        updated.delete = false;
        updated.export = false;
      }
      return { ...prev, [moduleId]: updated };
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

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.error('El nombre del rol es obligatorio');
      return;
    }
    setSaving(true);
    try {
      if (initialData?.id) {
        const res = await updateRole(initialData.id, { name, description, permissions });
        if (res.success) {
          toast.success('Rol actualizado con éxito');
          onCancel();
        } else {
          toast.error(res.message || 'Error al actualizar el rol');
        }
      } else {
        const res = await addRole({ name, description, permissions });
        if (res.success) {
          toast.success('Rol creado con éxito');
          onCancel();
        } else {
          toast.error(res.message || 'Error al crear el rol');
        }
      }
    } catch (err) {
      toast.error('Error al guardar el rol');
    } finally {
      setSaving(false);
    }
  };

  const groupedModules = GROUPS_ORDER.map(groupName => ({
    group: groupName,
    items: SYSTEM_MODULES.filter(m => m.group === groupName)
  }));

  return (
    <div>
      <div className="topbar" style={{ marginBottom: '1.25rem', borderBottom: 'none' }}>
        <h2 style={{ fontSize: '1.25rem', color: 'var(--color-primary)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Shield size={22} /> {initialData ? 'Editar Rol y Perfil' : 'Nuevo Rol de Usuario'}
        </h2>
        <button type="button" className="btn btn-outline" onClick={onCancel} style={{ padding: '0.25rem' }}>
          <X size={18} />
        </button>
      </div>

      <form onSubmit={handleSubmit}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Nombre del Rol</label>
              <input
                type="text"
                className="form-input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ej. Auditor de Calidad, Facturación..."
                required
              />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Descripción</label>
              <input
                type="text"
                className="form-input"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Breve descripción de las responsabilidades..."
              />
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
            <span style={{ fontSize: '0.85rem', fontWeight: '600' }}>Matriz de Permisos del Rol:</span>
            <div style={{ display: 'flex', gap: '0.4rem' }}>
              <button type="button" className="btn btn-outline" onClick={() => handleSetAll(true)} style={{ fontSize: '0.75rem', padding: '0.25rem 0.5rem' }}>
                <Check size={13} style={{ color: 'var(--color-success)' }} /> Todo
              </button>
              <button type="button" className="btn btn-outline" onClick={handleSetReadOnly} style={{ fontSize: '0.75rem', padding: '0.25rem 0.5rem' }}>
                <Eye size={13} style={{ color: 'var(--color-primary)' }} /> Lectura
              </button>
              <button type="button" className="btn btn-outline" onClick={() => handleSetAll(false)} style={{ fontSize: '0.75rem', padding: '0.25rem 0.5rem' }}>
                <X size={13} style={{ color: 'var(--color-danger)' }} /> Bloquear
              </button>
            </div>
          </div>

          <div className="table-container" style={{ maxHeight: '380px', overflowY: 'auto' }}>
            <table>
              <thead>
                <tr>
                  <th style={{ width: '35%' }}>Pantalla / Módulo</th>
                  <th style={{ textAlign: 'center', width: '13%' }}>Ver</th>
                  <th style={{ textAlign: 'center', width: '13%' }}>Crear</th>
                  <th style={{ textAlign: 'center', width: '13%' }}>Editar</th>
                  <th style={{ textAlign: 'center', width: '13%' }}>Eliminar</th>
                  <th style={{ textAlign: 'center', width: '13%' }}>Exportar</th>
                </tr>
              </thead>
              <tbody>
                {groupedModules.map(groupObj => (
                  <React.Fragment key={groupObj.group}>
                    <tr style={{ backgroundColor: 'rgba(255,255,255,0.03)', borderTop: '1px solid var(--color-border)' }}>
                      <td colSpan="6" style={{ padding: '0.45rem 0.75rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <strong style={{ fontSize: '0.75rem', color: 'var(--color-primary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                            {groupObj.group}
                          </strong>
                          <div style={{ display: 'flex', gap: '0.4rem' }}>
                            <button
                              type="button"
                              onClick={() => handleToggleGroup(groupObj.group, true)}
                              style={{ background: 'none', border: 'none', color: 'var(--color-success)', fontSize: '0.65rem', cursor: 'pointer' }}
                            >
                              + Activar Grupo
                            </button>
                            <span style={{ color: 'var(--color-border)', fontSize: '0.65rem' }}>|</span>
                            <button
                              type="button"
                              onClick={() => handleToggleGroup(groupObj.group, false)}
                              style={{ background: 'none', border: 'none', color: 'var(--color-danger)', fontSize: '0.65rem', cursor: 'pointer' }}
                            >
                              - Desactivar Grupo
                            </button>
                          </div>
                        </div>
                      </td>
                    </tr>
                    {groupObj.items.map(mod => {
                      const modPerms = permissions[mod.id] || {};
                      return (
                        <tr key={mod.id}>
                          <td style={{ paddingLeft: '1.25rem' }}>
                            <div style={{ fontWeight: '600', fontSize: '0.85rem' }}>{mod.name}</div>
                          </td>
                          <td style={{ textAlign: 'center' }}>
                            <button type="button" className={`perm-toggle-btn ${modPerms.view ? 'active view-act' : ''}`} onClick={() => handleToggle(mod.id, 'view')}>
                              {modPerms.view ? <Check size={16} /> : <X size={16} />}
                            </button>
                          </td>
                          <td style={{ textAlign: 'center' }}>
                            {mod.actions.includes('create') ? (
                              <button type="button" className={`perm-toggle-btn ${modPerms.create ? 'active' : ''}`} onClick={() => handleToggle(mod.id, 'create')}>
                                {modPerms.create ? <Check size={16} /> : <X size={16} />}
                              </button>
                            ) : <span style={{ color: 'var(--color-text-light)', opacity: 0.3 }}>—</span>}
                          </td>
                          <td style={{ textAlign: 'center' }}>
                            {mod.actions.includes('edit') ? (
                              <button type="button" className={`perm-toggle-btn ${modPerms.edit ? 'active' : ''}`} onClick={() => handleToggle(mod.id, 'edit')}>
                                {modPerms.edit ? <Check size={16} /> : <X size={16} />}
                              </button>
                            ) : <span style={{ color: 'var(--color-text-light)', opacity: 0.3 }}>—</span>}
                          </td>
                          <td style={{ textAlign: 'center' }}>
                            {mod.actions.includes('delete') ? (
                              <button type="button" className={`perm-toggle-btn ${modPerms.delete ? 'active del-act' : ''}`} onClick={() => handleToggle(mod.id, 'delete')}>
                                {modPerms.delete ? <Check size={16} /> : <X size={16} />}
                              </button>
                            ) : <span style={{ color: 'var(--color-text-light)', opacity: 0.3 }}>—</span>}
                          </td>
                          <td style={{ textAlign: 'center' }}>
                            {mod.actions.includes('export') ? (
                              <button type="button" className={`perm-toggle-btn ${modPerms.export ? 'active view-act' : ''}`} onClick={() => handleToggle(mod.id, 'export')}>
                                {modPerms.export ? <Check size={16} /> : <X size={16} />}
                              </button>
                            ) : <span style={{ color: 'var(--color-text-light)', opacity: 0.3 }}>—</span>}
                          </td>
                        </tr>
                      );
                    })}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', borderTop: '1px solid var(--color-border)', paddingTop: '1rem' }}>
            <button type="button" className="btn btn-outline" onClick={onCancel} disabled={saving}>
              Cancelar
            </button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              <Save size={16} /> {saving ? 'Guardando...' : 'Guardar Rol'}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
};

export default RoleForm;
