import React, { useState } from 'react';
import { useInventory } from '../../../context/InventoryContext';
import { Save, X, CheckSquare, Square } from 'lucide-react';
import { toast } from 'react-hot-toast';

const MODULES_CONFIG = [
  { id: 'dashboard', name: 'Dashboard', actions: ['view'] },
  { id: 'products', name: 'Productos', actions: ['view', 'create', 'edit', 'delete'] },
  { id: 'inventory-count', name: 'Toma de Inventario', actions: ['view', 'create', 'edit', 'delete'] },
  { id: 'movements', name: 'Movimientos', actions: ['view', 'create', 'edit', 'delete'] },
  { id: 'insurance', name: 'Corte de Seguro', actions: ['view'] },
  { id: 'summary', name: 'Resumen Detallado', actions: ['view'] },
  { id: 'summary2', name: 'Resumen Diario', actions: ['view'] },
  { id: 'security', name: 'Módulo de Seguridad', actions: ['view', 'create', 'edit', 'delete'] },
  { id: 'settings', name: 'Configuración', actions: ['view', 'edit'] },
];

const RoleForm = ({ onCancel, initialData }) => {
  const { addRole, updateRole } = useInventory();
  const [name, setName] = useState(initialData?.name || '');
  const [description, setDescription] = useState(initialData?.description || '');
  const [saving, setSaving] = useState(false);

  const [permissions, setPermissions] = useState(() => {
    const base = initialData?.permissions || {};
    const formatted = {};
    MODULES_CONFIG.forEach(m => {
      formatted[m.id] = {
        view: Boolean(base[m.id]?.view),
        create: Boolean(base[m.id]?.create),
        edit: Boolean(base[m.id]?.edit),
        delete: Boolean(base[m.id]?.delete)
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
      }
      return { ...prev, [moduleId]: updated };
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

  return (
    <div>
      <div className="topbar" style={{ marginBottom: '1.5rem', borderBottom: 'none' }}>
        <h2 style={{ fontSize: '1.25rem', color: 'var(--color-primary)' }}>
          {initialData ? 'Editar Rol del Sistema' : 'Nuevo Rol del Sistema'}
        </h2>
        <button type="button" className="btn btn-outline" onClick={onCancel} style={{ padding: '0.25rem' }}>
          <X size={18} />
        </button>
      </div>

      <form onSubmit={handleSubmit}>
        <div className="grid grid-cols-2" style={{ gap: '1rem', marginBottom: '1.5rem' }}>
          <div className="form-group">
            <label className="form-label">Nombre del Rol</label>
            <input
              type="text"
              className="form-input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ej: Supervisor de Almacén"
              required
            />
          </div>
          <div className="form-group">
            <label className="form-label">Descripción</label>
            <input
              type="text"
              className="form-input"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Ej: Permisos para captura y consulta de inventario"
            />
          </div>
        </div>

        <div style={{ marginBottom: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ fontSize: '1rem', color: 'var(--color-text)', margin: 0 }}>Permisos por Módulo</h3>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button type="button" className="btn btn-outline" onClick={() => handleSetAll(true)} style={{ fontSize: '0.75rem', padding: '0.25rem 0.5rem' }}>
              Marcar Todos
            </button>
            <button type="button" className="btn btn-outline" onClick={() => handleSetAll(false)} style={{ fontSize: '0.75rem', padding: '0.25rem 0.5rem' }}>
              Desmarcar Todos
            </button>
          </div>
        </div>

        <div className="table-container" style={{ maxHeight: '350px', overflowY: 'auto', marginBottom: '1.5rem' }}>
          <table>
            <thead>
              <tr>
                <th>Módulo</th>
                <th style={{ textAlign: 'center' }}>Ver</th>
                <th style={{ textAlign: 'center' }}>Crear</th>
                <th style={{ textAlign: 'center' }}>Editar</th>
                <th style={{ textAlign: 'center' }}>Eliminar</th>
              </tr>
            </thead>
            <tbody>
              {MODULES_CONFIG.map(mod => {
                const modPerms = permissions[mod.id] || {};
                return (
                  <tr key={mod.id}>
                    <td style={{ fontWeight: '500' }}>{mod.name}</td>
                    <td style={{ textAlign: 'center' }}>
                      <button
                        type="button"
                        onClick={() => handleToggle(mod.id, 'view')}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: modPerms.view ? 'var(--color-success)' : 'var(--color-text-light)' }}
                      >
                        {modPerms.view ? <CheckSquare size={18} /> : <Square size={18} />}
                      </button>
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      {mod.actions.includes('create') ? (
                        <button
                          type="button"
                          onClick={() => handleToggle(mod.id, 'create')}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: modPerms.create ? 'var(--color-primary)' : 'var(--color-text-light)' }}
                        >
                          {modPerms.create ? <CheckSquare size={18} /> : <Square size={18} />}
                        </button>
                      ) : '—'}
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      {mod.actions.includes('edit') ? (
                        <button
                          type="button"
                          onClick={() => handleToggle(mod.id, 'edit')}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: modPerms.edit ? '#d97706' : 'var(--color-text-light)' }}
                        >
                          {modPerms.edit ? <CheckSquare size={18} /> : <Square size={18} />}
                        </button>
                      ) : '—'}
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      {mod.actions.includes('delete') ? (
                        <button
                          type="button"
                          onClick={() => handleToggle(mod.id, 'delete')}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: modPerms.delete ? 'var(--color-danger)' : 'var(--color-text-light)' }}
                        >
                          {modPerms.delete ? <CheckSquare size={18} /> : <Square size={18} />}
                        </button>
                      ) : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem' }}>
          <button type="button" className="btn btn-outline" onClick={onCancel} disabled={saving}>
            Cancelar
          </button>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            <Save size={18} /> {saving ? 'Guardando...' : (initialData ? 'Guardar Cambios' : 'Crear Rol')}
          </button>
        </div>
      </form>
    </div>
  );
};

export default RoleForm;
