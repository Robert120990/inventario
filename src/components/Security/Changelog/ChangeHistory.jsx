import React, { useState, useMemo } from 'react';
import { useInventory } from '../../../context/InventoryContext';
import { History, Plus, Calendar, User, Tag, Trash2, CheckCircle2, Sparkles, X, PlusCircle, Search, Filter, Shield, Wrench, Layers } from 'lucide-react';
import { formatDate } from '../../../utils/formatUtils';
import { toast } from 'react-hot-toast';

const TYPE_CONFIG = {
  feature: { label: 'Nueva Función', color: '#10b981', bg: 'rgba(16, 185, 129, 0.12)', border: 'rgba(16, 185, 129, 0.3)' },
  improvement: { label: 'Mejora', color: '#3b82f6', bg: 'rgba(59, 130, 246, 0.12)', border: 'rgba(59, 130, 246, 0.3)' },
  fix: { label: 'Corrección', color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.12)', border: 'rgba(245, 158, 11, 0.3)' },
  security: { label: 'Seguridad', color: '#8b5cf6', bg: 'rgba(139, 92, 246, 0.12)', border: 'rgba(139, 92, 246, 0.3)' }
};

const ChangeHistory = () => {
  const { versions, addVersion, deleteVersion, currentUser, canCreate, canDelete } = useInventory();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedType, setSelectedType] = useState('all'); // 'all' | 'feature' | 'improvement' | 'fix' | 'security'
  const [description, setDescription] = useState('');
  const [changesList, setChangesList] = useState([
    { type: 'feature', text: '' }
  ]);
  const [saving, setSaving] = useState(false);

  const allowCreate = currentUser?.role === 'admin' || canCreate('security-changelog');
  const allowDelete = currentUser?.role === 'admin' || canDelete('security-changelog');

  // Filtrado reactivo de versiones y cambios
  const filteredVersions = useMemo(() => {
    const term = searchTerm.toLowerCase().trim();

    return versions
      .map(ver => {
        const changes = Array.isArray(ver.changes) ? ver.changes : [];
        
        // Filtrar cambios individuales dentro de la versión según el tipo seleccionado y término de búsqueda
        const matchingChanges = changes.filter(c => {
          const text = typeof c === 'string' ? c : (c.text || '');
          const type = typeof c === 'object' && c.type ? c.type : 'feature';

          const matchesType = selectedType === 'all' || type === selectedType;
          const matchesTerm = !term || 
            text.toLowerCase().includes(term) ||
            (ver.version || '').toLowerCase().includes(term) ||
            (ver.description || '').toLowerCase().includes(term) ||
            (ver.author || '').toLowerCase().includes(term);

          return matchesType && matchesTerm;
        });

        // Si la versión en sí coincide en descripción / versión / autor, incluirla
        const verMatchesSearch = !term ||
          (ver.version || '').toLowerCase().includes(term) ||
          (ver.description || '').toLowerCase().includes(term) ||
          (ver.author || '').toLowerCase().includes(term);

        if (matchingChanges.length > 0 || (verMatchesSearch && selectedType === 'all')) {
          return {
            ...ver,
            displayChanges: matchingChanges.length > 0 ? matchingChanges : changes
          };
        }
        return null;
      })
      .filter(Boolean);
  }, [versions, searchTerm, selectedType]);

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
      toast.error('La descripción o título de la versión es obligatoria');
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
      toast.error('Error al conectar con el servidor');
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

  const currentVersionName = versions[0]?.version || 'v2.5.0';

  return (
    <div>
      <div className="topbar">
        <div>
          <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <History size={24} style={{ color: 'var(--color-primary)' }} /> Historial de Cambios y Versiones
          </h1>
          <p style={{ color: 'var(--color-text-light)', fontSize: '0.875rem' }}>
            Registro automático de versiones, nuevas funciones, optimizaciones, seguridad y mejoras del sistema.
          </p>
        </div>
        {allowCreate && (
          <button className="btn btn-primary" onClick={() => setIsModalOpen(true)}>
            <Plus size={18} /> Publicar Nueva Versión
          </button>
        )}
      </div>

      {/* Barra de Filtros y Búsqueda */}
      <div className="card" style={{ marginBottom: '1.5rem', padding: '1.25rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
          {/* Tabs por Tipo */}
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <button
              type="button"
              className={`btn ${selectedType === 'all' ? 'btn-primary' : 'btn-outline'}`}
              onClick={() => setSelectedType('all')}
              style={{ fontSize: '0.8rem', padding: '0.4rem 0.8rem' }}
            >
              Todas las Novedades
            </button>
            <button
              type="button"
              className={`btn ${selectedType === 'feature' ? 'btn-primary' : 'btn-outline'}`}
              onClick={() => setSelectedType('feature')}
              style={{ fontSize: '0.8rem', padding: '0.4rem 0.8rem', borderColor: TYPE_CONFIG.feature.border }}
            >
              <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: TYPE_CONFIG.feature.color, display: 'inline-block', marginRight: '5px' }}></span>
              Nuevas Funciones
            </button>
            <button
              type="button"
              className={`btn ${selectedType === 'improvement' ? 'btn-primary' : 'btn-outline'}`}
              onClick={() => setSelectedType('improvement')}
              style={{ fontSize: '0.8rem', padding: '0.4rem 0.8rem', borderColor: TYPE_CONFIG.improvement.border }}
            >
              <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: TYPE_CONFIG.improvement.color, display: 'inline-block', marginRight: '5px' }}></span>
              Mejoras
            </button>
            <button
              type="button"
              className={`btn ${selectedType === 'fix' ? 'btn-primary' : 'btn-outline'}`}
              onClick={() => setSelectedType('fix')}
              style={{ fontSize: '0.8rem', padding: '0.4rem 0.8rem', borderColor: TYPE_CONFIG.fix.border }}
            >
              <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: TYPE_CONFIG.fix.color, display: 'inline-block', marginRight: '5px' }}></span>
              Correcciones
            </button>
            <button
              type="button"
              className={`btn ${selectedType === 'security' ? 'btn-primary' : 'btn-outline'}`}
              onClick={() => setSelectedType('security')}
              style={{ fontSize: '0.8rem', padding: '0.4rem 0.8rem', borderColor: TYPE_CONFIG.security.border }}
            >
              <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: TYPE_CONFIG.security.color, display: 'inline-block', marginRight: '5px' }}></span>
              Seguridad
            </button>
          </div>

          {/* Buscador */}
          <div style={{ position: 'relative', minWidth: '260px', flex: 1, maxWidth: '400px' }}>
            <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-light)' }} />
            <input
              type="text"
              className="form-input"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar en el registro de cambios..."
              style={{ paddingLeft: '2.4rem', marginBottom: 0 }}
            />
          </div>
        </div>
      </div>

      {/* Lista de Versiones Estilizadas */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', maxWidth: '950px' }}>
        {filteredVersions.map((ver, idx) => {
          const isLatest = idx === 0 && !searchTerm && selectedType === 'all';
          const changes = ver.displayChanges || ver.changes || [];

          return (
            <div
              key={ver.id || ver.version}
              className="card"
              style={{
                borderLeft: isLatest ? '4px solid var(--color-primary)' : '4px solid var(--color-border)',
                position: 'relative',
                transition: 'all 0.2s ease',
                backgroundColor: isLatest ? 'rgba(59, 130, 246, 0.03)' : 'var(--color-surface)'
              }}
            >
              {/* Header de la Versión */}
              <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem', gap: '0.5rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                  <span
                    className={`badge ${isLatest ? 'badge-primary' : 'badge-gray'}`}
                    style={{ fontSize: '0.95rem', padding: '0.35rem 0.85rem', fontWeight: 'bold', letterSpacing: '0.04em' }}
                  >
                    {ver.version}
                  </span>

                  {isLatest && (
                    <span className="badge badge-success" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.75rem' }}>
                      <Sparkles size={13} /> Versión Actual en Producción
                    </span>
                  )}

                  {ver.isOfficial && (
                    <span className="badge badge-primary" style={{ fontSize: '0.75rem', opacity: 0.85 }}>
                      Release Oficial
                    </span>
                  )}

                  <h2 style={{ fontSize: '1.15rem', margin: 0, fontWeight: 700, color: 'var(--color-text)' }}>
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
                  {allowDelete && !ver.isOfficial && (
                    <button
                      type="button"
                      onClick={() => handleDelete(ver.id, ver.version)}
                      className="btn btn-outline"
                      style={{ padding: '0.25rem 0.5rem', color: 'var(--color-danger)', border: 'none' }}
                      title="Eliminar versión personalizada"
                    >
                      <Trash2 size={16} />
                    </button>
                  )}
                </div>
              </div>

              {/* Lista Detallada de Cambios */}
              {changes.length > 0 ? (
                <div style={{ marginTop: '1rem', borderTop: '1px solid var(--color-border)', paddingTop: '1rem' }}>
                  <h4 style={{ fontSize: '0.8rem', color: 'var(--color-text-light)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.85rem', fontWeight: 600 }}>
                    Novedades e Implementaciones ({changes.length})
                  </h4>
                  <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
                    {changes.map((change, cIdx) => {
                      const text = typeof change === 'string' ? change : change.text;
                      const type = typeof change === 'object' && change.type ? change.type : 'feature';
                      const config = TYPE_CONFIG[type] || TYPE_CONFIG.feature;

                      return (
                        <li key={cIdx} style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem', fontSize: '0.9rem' }}>
                          <span
                            style={{
                              fontSize: '0.72rem',
                              padding: '2px 9px',
                              borderRadius: '12px',
                              backgroundColor: config.bg,
                              color: config.color,
                              border: `1px solid ${config.border}`,
                              fontWeight: '600',
                              whiteSpace: 'nowrap',
                              marginTop: '2px'
                            }}
                          >
                            {config.label}
                          </span>
                          <span style={{ color: 'var(--color-text)', lineHeight: 1.45 }}>{text}</span>
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

        {filteredVersions.length === 0 && (
          <div className="card" style={{ textAlign: 'center', padding: '3.5rem' }}>
            <History size={48} style={{ color: 'var(--color-text-light)', margin: '0 auto 1rem', opacity: 0.5 }} />
            <h3 style={{ color: 'var(--color-text)' }}>No se encontraron coincidencias</h3>
            <p style={{ color: 'var(--color-text-light)', fontSize: '0.875rem', maxWidth: '400px', margin: '0.5rem auto' }}>
              Intenta cambiar el filtro de categoría o borrar los términos del buscador.
            </p>
          </div>
        )}
      </div>

      {/* Modal para Registrar Nueva Versión */}
      {isModalOpen && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '680px', width: '95%' }}>
            <div className="topbar" style={{ marginBottom: '1.5rem', borderBottom: 'none' }}>
              <h2 style={{ fontSize: '1.25rem', color: 'var(--color-primary)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <History size={20} /> Publicar Nueva Versión
              </h2>
              <button type="button" className="btn btn-outline" onClick={() => setIsModalOpen(false)} style={{ padding: '0.25rem' }}>
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSubmitVersion}>
              <div className="form-group" style={{ marginBottom: '1.25rem' }}>
                <label className="form-label">Título o Resumen de la Versión</label>
                <input
                  type="text"
                  className="form-input"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Ej: Módulo de Facturación y Liquidación de Cuarto Frío"
                  required
                />
              </div>

              <div style={{ marginBottom: '0.75rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <label className="form-label" style={{ marginBottom: 0 }}>Lista de Cambios y Novedades</label>
                <button type="button" className="btn btn-outline" onClick={handleAddChangeRow} style={{ fontSize: '0.75rem', padding: '0.25rem 0.6rem' }}>
                  <PlusCircle size={14} /> + Agregar Fila
                </button>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', maxHeight: '280px', overflowY: 'auto', marginBottom: '1.5rem' }}>
                {changesList.map((row, idx) => (
                  <div key={idx} style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                    <select
                      className="form-select"
                      value={row.type}
                      onChange={(e) => handleChangeRow(idx, 'type', e.target.value)}
                      style={{ width: '155px', flexShrink: 0, fontWeight: '600' }}
                    >
                      <option value="feature">🟢 Nueva Función</option>
                      <option value="improvement">🔵 Mejora</option>
                      <option value="fix">🟡 Corrección</option>
                      <option value="security">🟣 Seguridad</option>
                    </select>
                    <input
                      type="text"
                      className="form-input"
                      value={row.text}
                      onChange={(e) => handleChangeRow(idx, 'text', e.target.value)}
                      placeholder="Descripción de la mejora o novedad..."
                      style={{ flex: 1, marginBottom: 0 }}
                    />
                    {changesList.length > 1 && (
                      <button
                        type="button"
                        onClick={() => handleRemoveChangeRow(idx)}
                        className="btn btn-outline"
                        style={{ padding: '0.35rem', color: 'var(--color-danger)' }}
                        title="Eliminar fila"
                      >
                        <Trash2 size={16} />
                      </button>
                    )}
                  </div>
                ))}
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem', borderTop: '1px solid var(--color-border)', paddingTop: '1rem' }}>
                <button type="button" className="btn btn-outline" onClick={() => setIsModalOpen(false)} disabled={saving}>
                  Cancelar
                </button>
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {saving ? 'Publicando...' : 'Publicar Versión'}
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
