import React, { useState } from 'react';
import { useInventory } from '../../../context/InventoryContext';
import { History, Plus, Calendar, User, Tag, Trash2, CheckCircle2, Sparkles, X, PlusCircle } from 'lucide-react';
import { formatDate } from '../../../utils/formatUtils';
import { toast } from 'react-hot-toast';

const TYPE_CONFIG = {
  feature: { label: 'Nueva Función', color: '#10b981', bg: 'rgba(16, 185, 129, 0.1)' },
  improvement: { label: 'Mejora', color: '#3b82f6', bg: 'rgba(59, 130, 246, 0.1)' },
  fix: { label: 'Corrección', color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.1)' },
  security: { label: 'Seguridad', color: '#8b5cf6', bg: 'rgba(139, 92, 246, 0.1)' }
};

const ChangeHistory = () => {
  const { versions, addVersion, deleteVersion, currentUser } = useInventory();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [description, setDescription] = useState('');
  const [changesList, setChangesList] = useState([
    { type: 'feature', text: '' }
  ]);
  const [saving, setSaving] = useState(false);

  const handleAddChangeRow = () => {
    setChangesList(prev => [...prev, { type: 'feature', text: '' }]);
  };

  const handleRemoveChangeRow = (index) => {
    setChangesList(prev => prev.filter((_, i) => i !== index));
  };

  const handleChangeRow = (index, field, value) => {
    setChangesList(prev => {
      const copy = [...prev];
      copy[index] = { ...copy[index], [field]: value };
      return copy;
    });
  };

  const handleSubmitVersion = async (e) => {
    e.preventDefault();
    if (!description.trim()) {
      toast.error('La descripción de la versión es obligatoria');
      return;
    }
    const filteredChanges = changesList.filter(c => c.text && c.text.trim());
    setSaving(true);
    try {
      const res = await addVersion(description.trim(), filteredChanges, currentUser?.username || 'Admin');
      if (res.success) {
        toast.success('Nueva versión e historial de cambios registrados');
        setIsModalOpen(false);
        setDescription('');
        setChangesList([{ type: 'feature', text: '' }]);
      } else {
        toast.error('Error al registrar la versión');
      }
    } catch (e) {
      toast.error('Error al conectar');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = (id, version) => {
    if (window.confirm(`¿Seguro que deseas eliminar la versión ${version} del historial?`)) {
      deleteVersion(id);
      toast.success('Versión eliminada del historial');
    }
  };

  const isAdmin = currentUser?.role === 'admin';

  return (
    <div>
      <div className="topbar">
        <div>
          <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <History size={24} style={{ color: 'var(--color-primary)' }} /> Historial de Cambios y Versiones
          </h1>
          <p style={{ color: 'var(--color-text-light)', fontSize: '0.875rem' }}>
            Consulta qué novedades, mejoras y correcciones incluye cada versión del sistema.
          </p>
        </div>
        {isAdmin && (
          <button className="btn btn-primary" onClick={() => setIsModalOpen(true)}>
            <Plus size={18} /> Registrar Novedades de Versión
          </button>
        )}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', maxWidth: '900px' }}>
        {versions.map((ver, idx) => {
          const isLatest = idx === 0;
          const changes = Array.isArray(ver.changes) ? ver.changes : [];

          return (
            <div key={ver.id} className="card" style={{ borderLeft: isLatest ? '4px solid var(--color-primary)' : '4px solid var(--color-border)', position: 'relative' }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem', gap: '0.5rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <span className={`badge ${isLatest ? 'badge-primary' : 'badge-gray'}`} style={{ fontSize: '0.9rem', padding: '0.35rem 0.75rem', fontWeight: 'bold' }}>
                    {ver.version}
                  </span>
                  {isLatest && (
                    <span className="badge badge-success" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.75rem' }}>
                      <Sparkles size={12} /> Versión Actual
                    </span>
                  )}
                  <h2 style={{ fontSize: '1.1rem', margin: 0, color: 'var(--color-text)' }}>
                    {ver.description}
                  </h2>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                  <span style={{ fontSize: '0.8rem', color: 'var(--color-text-light)', display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}>
                    <Calendar size={14} />
                    {formatDate(ver.date)} {ver.time ? `· ${ver.time}` : ''}
                  </span>
                  {ver.author && (
                    <span style={{ fontSize: '0.8rem', color: 'var(--color-text-light)', display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}>
                      <User size={14} /> {ver.author}
                    </span>
                  )}
                  {isAdmin && (
                    <button
                      type="button"
                      onClick={() => handleDelete(ver.id, ver.version)}
                      className="btn btn-outline"
                      style={{ padding: '0.25rem 0.5rem', color: 'var(--color-danger)', border: 'none' }}
                      title="Eliminar versión"
                    >
                      <Trash2 size={16} />
                    </button>
                  )}
                </div>
              </div>

              {/* Changes List */}
              {changes.length > 0 ? (
                <div style={{ marginTop: '1rem', borderTop: '1px solid var(--color-border)', paddingTop: '1rem' }}>
                  <h4 style={{ fontSize: '0.85rem', color: 'var(--color-text-light)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.75rem' }}>
                    ¿Qué hay de nuevo en esta versión?
                  </h4>
                  <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                    {changes.map((change, cIdx) => {
                      const text = typeof change === 'string' ? change : change.text;
                      const type = typeof change === 'object' && change.type ? change.type : 'feature';
                      const config = TYPE_CONFIG[type] || TYPE_CONFIG.feature;

                      return (
                        <li key={cIdx} style={{ display: 'flex', alignItems: 'flex-start', gap: '0.6rem', fontSize: '0.9rem' }}>
                          <span
                            style={{
                              fontSize: '0.7rem',
                              padding: '2px 8px',
                              borderRadius: '12px',
                              backgroundColor: config.bg,
                              color: config.color,
                              fontWeight: '600',
                              whiteSpace: 'nowrap',
                              marginTop: '2px'
                            }}
                          >
                            {config.label}
                          </span>
                          <span style={{ color: 'var(--color-text)', lineHeight: 1.4 }}>{text}</span>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ) : (
                <p style={{ color: 'var(--color-text-light)', fontSize: '0.875rem', fontStyle: 'italic', margin: 0 }}>
                  {ver.description}
                </p>
              )}
            </div>
          );
        })}

        {versions.length === 0 && (
          <div className="card" style={{ textAlign: 'center', padding: '3rem' }}>
            <History size={48} style={{ color: 'var(--color-text-light)', margin: '0 auto 1rem', opacity: 0.5 }} />
            <h3 style={{ color: 'var(--color-text)' }}>No hay versiones registradas</h3>
            <p style={{ color: 'var(--color-text-light)', fontSize: '0.875rem', maxWidth: '400px', margin: '0.5rem auto' }}>
              Las versiones registradas y sus listas de cambios aparecerán aquí cronológicamente.
            </p>
          </div>
        )}
      </div>

      {/* Modal for adding version changelog */}
      {isModalOpen && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '650px', width: '95%' }}>
            <div className="topbar" style={{ marginBottom: '1.5rem', borderBottom: 'none' }}>
              <h2 style={{ fontSize: '1.25rem', color: 'var(--color-primary)' }}>Registrar Novedades de Versión</h2>
              <button type="button" className="btn btn-outline" onClick={() => setIsModalOpen(false)} style={{ padding: '0.25rem' }}>
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSubmitVersion}>
              <div className="form-group" style={{ marginBottom: '1.5rem' }}>
                <label className="form-label">Título o Resumen General de la Versión</label>
                <input
                  type="text"
                  className="form-input"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Ej: Módulo de Seguridad y Autenticación con Roles"
                  required
                />
              </div>

              <div style={{ marginBottom: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <label className="form-label" style={{ marginBottom: 0 }}>Detalle de Cambios y Novedades</label>
                <button type="button" className="btn btn-outline" onClick={handleAddChangeRow} style={{ fontSize: '0.75rem', padding: '0.25rem 0.5rem' }}>
                  <PlusCircle size={14} /> Agregar Fila
                </button>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', maxHeight: '250px', overflowY: 'auto', marginBottom: '1.5rem' }}>
                {changesList.map((row, idx) => (
                  <div key={idx} style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                    <select
                      className="form-select"
                      value={row.type}
                      onChange={(e) => handleChangeRow(idx, 'type', e.target.value)}
                      style={{ width: '150px', flexShrink: 0 }}
                    >
                      <option value="feature">Nueva Función</option>
                      <option value="improvement">Mejora</option>
                      <option value="fix">Corrección</option>
                      <option value="security">Seguridad</option>
                    </select>
                    <input
                      type="text"
                      className="form-input"
                      value={row.text}
                      onChange={(e) => handleChangeRow(idx, 'text', e.target.value)}
                      placeholder="Descripción de la mejora o cambio..."
                      style={{ flex: 1 }}
                    />
                    {changesList.length > 1 && (
                      <button
                        type="button"
                        onClick={() => handleRemoveChangeRow(idx)}
                        className="btn btn-outline"
                        style={{ padding: '0.35rem', color: 'var(--color-danger)' }}
                      >
                        <Trash2 size={16} />
                      </button>
                    )}
                  </div>
                ))}
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem' }}>
                <button type="button" className="btn btn-outline" onClick={() => setIsModalOpen(false)} disabled={saving}>
                  Cancelar
                </button>
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {saving ? 'Registrando...' : 'Publicar Versión'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default ChangeHistory;
