import React, { useState, useMemo, useEffect } from 'react';
import { useInventory } from '../../../context/InventoryContext';
import { 
  History, Plus, Calendar, User, Tag, Trash2, CheckCircle2, 
  Sparkles, X, PlusCircle, Search, Filter, Shield, Wrench, 
  Layers, GitCommit, GitPullRequest, RefreshCw, ExternalLink,
  ChevronDown
} from 'lucide-react';
import { formatDate } from '../../../utils/formatUtils';
import { toast } from 'react-hot-toast';
import { SYSTEM_CHANGELOG } from '../../../config/changelog';

const TYPE_CONFIG = {
  feature: { label: 'Nueva Función', color: '#10b981', bg: 'rgba(16, 185, 129, 0.12)', border: 'rgba(16, 185, 129, 0.3)' },
  improvement: { label: 'Mejora', color: '#3b82f6', bg: 'rgba(59, 130, 246, 0.12)', border: 'rgba(59, 130, 246, 0.3)' },
  fix: { label: 'Corrección', color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.12)', border: 'rgba(245, 158, 11, 0.3)' },
  security: { label: 'Seguridad', color: '#8b5cf6', bg: 'rgba(139, 92, 246, 0.12)', border: 'rgba(139, 92, 246, 0.3)' }
};

const parseCommitType = (text) => {
  const lower = (text || '').toLowerCase();
  if (lower.startsWith('feat') || lower.includes('nueva') || lower.includes('agregar') || lower.includes('implementar')) {
    return 'feature';
  }
  if (lower.startsWith('fix') || lower.includes('corregir') || lower.includes('reparar') || lower.includes('bloquear')) {
    return 'fix';
  }
  if (lower.startsWith('sec') || lower.includes('seguridad') || lower.includes('permiso') || lower.includes('auth')) {
    return 'security';
  }
  if (lower.startsWith('perf') || lower.startsWith('refactor') || lower.startsWith('style') || lower.startsWith('docs') || lower.includes('optimiz')) {
    return 'improvement';
  }
  return 'improvement';
};

const formatCommitTitle = (subject) => {
  if (!subject) return 'Actualización del sistema';
  let cleaned = subject.replace(/^(feat|fix|perf|refactor|docs|style|security|chore|build|ci)(\([a-zA-Z0-9_-]+\))?:\s*/i, '');
  if (cleaned.length > 0) {
    cleaned = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
  }
  return cleaned || subject;
};

const ChangeHistory = () => {
  const { versions: contextVersions, addVersion, deleteVersion, currentUser, canCreate, canDelete } = useInventory();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedType, setSelectedType] = useState('all'); // 'all' | 'feature' | 'improvement' | 'fix' | 'security'
  const [description, setDescription] = useState('');
  const [changesList, setChangesList] = useState([{ type: 'feature', text: '' }]);
  const [saving, setSaving] = useState(false);
  const [syncingGithub, setSyncingGithub] = useState(false);
  const [githubCommits, setGithubCommits] = useState([]);
  const [visibleCount, setVisibleCount] = useState(25);

  const allowCreate = canCreate('security-changelog');
  const allowDelete = canDelete('security-changelog');

  // Sincronizar automáticamente con GitHub API para traer commits recientes
  const syncWithGitHub = async (showToast = false) => {
    setSyncingGithub(true);
    try {
      // Intentar primero con el repositorio principal y luego upstream
      const urls = [
        'https://api.github.com/repos/raulrafael/inventario/commits?per_page=100',
        'https://api.github.com/repos/Robert120990/inventario/commits?per_page=100'
      ];

      let rawCommits = [];
      for (const url of urls) {
        try {
          const res = await fetch(url, { headers: { 'Accept': 'application/vnd.github.v3+json' } });
          if (res.ok) {
            const data = await res.json();
            if (Array.isArray(data) && data.length > 0) {
              rawCommits = data;
              break;
            }
          }
        } catch {
          // Continuar al siguiente endpoint
        }
      }

      if (rawCommits.length > 0) {
        const parsed = rawCommits.map((item, idx) => {
          const sha = (item.sha || '').slice(0, 7);
          const fullMsg = item.commit?.message || '';
          const [subject, ...bodyLines] = fullMsg.split('\n');
          const authorName = item.commit?.author?.name || item.author?.login || 'Desarrollador';
          const authorEmail = item.commit?.author?.email || '';
          const authorFormatted = authorEmail?.toLowerCase()?.includes('raul') ? 'Ing. Raúl Sosa' : authorName;
          const isoDate = item.commit?.author?.date || new Date().toISOString();
          
          let dateStr = '';
          let timeStr = '';
          try {
            const d = new Date(isoDate);
            dateStr = d.toISOString().slice(0, 10);
            timeStr = d.toTimeString().slice(0, 5);
          } catch {
            dateStr = new Date().toISOString().slice(0, 10);
            timeStr = '12:00';
          }

          const rawSegments = (subject || '').split(/,\s*(?=(?:feat|fix|perf|security|refactor|chore)(?:\([a-z0-9_-]+\))?:)/i);
          const changes = [];

          if (rawSegments.length > 1) {
            rawSegments.forEach(seg => {
              changes.push({
                type: parseCommitType(seg),
                text: formatCommitTitle(seg)
              });
            });
          } else {
            changes.push({
              type: parseCommitType(subject),
              text: formatCommitTitle(subject)
            });
          }

          bodyLines.forEach(l => {
            const trimmed = l.trim();
            if (trimmed && (trimmed.startsWith('-') || trimmed.startsWith('*'))) {
              const cleaned = trimmed.replace(/^[-*]\s*/, '');
              changes.push({
                type: parseCommitType(cleaned),
                text: cleaned
              });
            }
          });

          return {
            id: sha,
            version: `v2.7.${rawCommits.length - idx}`,
            commit: sha,
            fullCommit: item.sha,
            description: formatCommitTitle(subject),
            author: authorFormatted,
            authorAvatar: item.author?.avatar_url,
            date: dateStr,
            time: timeStr,
            isOfficial: idx < 10,
            isGitCommit: true,
            htmlUrl: item.html_url || `https://github.com/raulrafael/inventario/commit/${item.sha}`,
            changes
          };
        });

        setGithubCommits(parsed);
        if (showToast) {
          toast.success(`Sincronizados ${parsed.length} commits desde GitHub`);
        }
      } else {
        if (showToast) {
          toast('Historial actualizado desde el registro local de Git', { icon: 'ℹ️' });
        }
      }
    } catch {
      if (showToast) {
        toast('Usando registro de commits local de Git', { icon: 'ℹ️' });
      }
    } finally {
      setSyncingGithub(false);
    }
  };

  useEffect(() => {
    syncWithGitHub(false);
  }, []);

  // Combinar commits de GitHub con contextVersions / SYSTEM_CHANGELOG
  const allReleases = useMemo(() => {
    const map = new Map();

    // 1. Usar commits sincronizados de GitHub si existen
    if (githubCommits.length > 0) {
      githubCommits.forEach(v => {
        const key = (v.commit || v.version || v.id || '').toLowerCase();
        if (key) map.set(key, v);
      });
    }

    // 2. Usar SYSTEM_CHANGELOG local de Git
    SYSTEM_CHANGELOG.forEach(v => {
      const key = (v.commit || v.version || v.id || '').toLowerCase();
      if (key && !map.has(key)) {
        map.set(key, v);
      }
    });

    // 3. Agregar versiones de la base de datos
    if (Array.isArray(contextVersions)) {
      contextVersions.forEach(v => {
        const key = (v.commit || v.version || v.id || '').toLowerCase();
        if (key) {
          const existing = map.get(key);
          map.set(key, { ...existing, ...v });
        }
      });
    }

    return Array.from(map.values());
  }, [githubCommits, contextVersions]);

  // Filtrado reactivo de versiones y cambios
  const filteredVersions = useMemo(() => {
    const term = searchTerm.toLowerCase().trim();

    return allReleases
      .map(ver => {
        const changes = Array.isArray(ver.changes) ? ver.changes : [];
        
        // Filtrar cambios individuales según el tipo seleccionado y término
        const matchingChanges = changes.filter(c => {
          const text = typeof c === 'string' ? c : (c.text || '');
          const type = typeof c === 'object' && c.type ? c.type : 'feature';

          const matchesType = selectedType === 'all' || type === selectedType;
          const matchesTerm = !term || 
            text.toLowerCase().includes(term) ||
            (ver.version || '').toLowerCase().includes(term) ||
            (ver.commit || '').toLowerCase().includes(term) ||
            (ver.description || '').toLowerCase().includes(term) ||
            (ver.author || '').toLowerCase().includes(term);

          return matchesType && matchesTerm;
        });

        const verMatchesSearch = !term ||
          (ver.version || '').toLowerCase().includes(term) ||
          (ver.commit || '').toLowerCase().includes(term) ||
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
  }, [allReleases, searchTerm, selectedType]);

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
    } catch {
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

  const displayedList = filteredVersions.slice(0, visibleCount);

  return (
    <div>
      {/* Topbar Header */}
      <div className="topbar">
        <div>
          <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <History size={24} style={{ color: 'var(--color-primary)' }} /> Historial de Cambios y Versiones
          </h1>
          <p style={{ color: 'var(--color-text-light)', fontSize: '0.875rem' }}>
            Registro cronológico y sincronización automática de cada commit, nueva función, optimización y corrección en GitHub.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center' }}>
          <button 
            type="button" 
            className="btn btn-outline" 
            onClick={() => syncWithGitHub(true)} 
            disabled={syncingGithub}
            title="Sincronizar commits en vivo desde GitHub"
          >
            <RefreshCw size={16} className={syncingGithub ? 'animate-spin' : ''} />
            <span>{syncingGithub ? 'Sincronizando...' : 'Sincronizar GitHub'}</span>
          </button>

          {allowCreate && (
            <button className="btn btn-primary" onClick={() => setIsModalOpen(true)}>
              <Plus size={18} /> Publicar Nueva Versión
            </button>
          )}
        </div>
      </div>

      {/* Barra de Filtros, Estado de Commits y Búsqueda */}
      <div className="card" style={{ marginBottom: '1.5rem', padding: '1.25rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
          
          {/* Tabs por Tipo */}
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
            <button
              type="button"
              className={`btn ${selectedType === 'all' ? 'btn-primary' : 'btn-outline'}`}
              onClick={() => setSelectedType('all')}
              style={{ fontSize: '0.8rem', padding: '0.4rem 0.8rem' }}
            >
              Todos los Commits ({allReleases.length})
            </button>
            <button
              type="button"
              className={`btn ${selectedType === 'feature' ? 'btn-primary' : 'btn-outline'}`}
              onClick={() => setSelectedType('feature')}
              style={{ fontSize: '0.8rem', padding: '0.4rem 0.8rem', borderColor: TYPE_CONFIG.feature.border }}
            >
              <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: TYPE_CONFIG.feature.color, display: 'inline-block', marginRight: '5px' }} />
              Nuevas Funciones
            </button>
            <button
              type="button"
              className={`btn ${selectedType === 'improvement' ? 'btn-primary' : 'btn-outline'}`}
              onClick={() => setSelectedType('improvement')}
              style={{ fontSize: '0.8rem', padding: '0.4rem 0.8rem', borderColor: TYPE_CONFIG.improvement.border }}
            >
              <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: TYPE_CONFIG.improvement.color, display: 'inline-block', marginRight: '5px' }} />
              Mejoras
            </button>
            <button
              type="button"
              className={`btn ${selectedType === 'fix' ? 'btn-primary' : 'btn-outline'}`}
              onClick={() => setSelectedType('fix')}
              style={{ fontSize: '0.8rem', padding: '0.4rem 0.8rem', borderColor: TYPE_CONFIG.fix.border }}
            >
              <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: TYPE_CONFIG.fix.color, display: 'inline-block', marginRight: '5px' }} />
              Correcciones
            </button>
            <button
              type="button"
              className={`btn ${selectedType === 'security' ? 'btn-primary' : 'btn-outline'}`}
              onClick={() => setSelectedType('security')}
              style={{ fontSize: '0.8rem', padding: '0.4rem 0.8rem', borderColor: TYPE_CONFIG.security.border }}
            >
              <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: TYPE_CONFIG.security.color, display: 'inline-block', marginRight: '5px' }} />
              Seguridad
            </button>
          </div>

          {/* Buscador */}
          <div style={{ position: 'relative', minWidth: '260px', flex: 1, maxWidth: '380px' }}>
            <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-light)' }} />
            <input
              type="text"
              className="form-input"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar por commit, función o autor..."
              style={{ paddingLeft: '2.4rem', marginBottom: 0 }}
            />
          </div>
        </div>
      </div>

      {/* Timeline y Lista de Commits */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', maxWidth: '980px' }}>
        {displayedList.map((ver, idx) => {
          const isLatest = idx === 0 && !searchTerm && selectedType === 'all';
          const changes = ver.displayChanges || ver.changes || [];
          const commitHash = ver.commit || (ver.fullCommit ? ver.fullCommit.slice(0, 7) : null);
          const commitUrl = ver.htmlUrl || (commitHash ? `https://github.com/raulrafael/inventario/commit/${ver.fullCommit || commitHash}` : null);

          return (
            <div
              key={ver.id || ver.commit || ver.version || idx}
              className="card"
              style={{
                borderLeft: isLatest ? '4px solid var(--color-primary)' : '4px solid var(--color-border)',
                position: 'relative',
                transition: 'var(--transition)',
                backgroundColor: isLatest ? 'var(--color-surface)' : 'var(--color-card)',
                boxShadow: isLatest ? 'var(--shadow-lg)' : 'var(--shadow-sm)'
              }}
            >
              {/* Header del Release / Commit */}
              <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.85rem', gap: '0.6rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
                  
                  {/* Badge de Versión */}
                  <span
                    className={`badge ${isLatest ? 'badge-primary' : 'badge-gray'}`}
                    style={{ fontSize: '0.9rem', padding: '0.3rem 0.75rem', fontWeight: 'bold', letterSpacing: '0.03em' }}
                  >
                    {ver.version}
                  </span>

                  {/* Badge de Commit SHA con Link a GitHub */}
                  {commitHash && (
                    <a
                      href={commitUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="badge"
                      style={{
                        backgroundColor: 'rgba(255, 255, 255, 0.08)',
                        border: '1px solid var(--color-border)',
                        color: 'var(--color-text-light)',
                        textDecoration: 'none',
                        fontFamily: 'monospace',
                        fontSize: '0.75rem',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.35rem'
                      }}
                      title="Ver commit en GitHub"
                    >
                      <GitCommit size={13} style={{ color: 'var(--color-primary)' }} />
                      <span>#{commitHash}</span>
                      <ExternalLink size={11} style={{ opacity: 0.6 }} />
                    </a>
                  )}

                  {isLatest && (
                    <span className="badge badge-success" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.72rem' }}>
                      <Sparkles size={12} /> Versión en Producción
                    </span>
                  )}

                  <h2 style={{ fontSize: '1.05rem', margin: 0, fontWeight: 700, color: 'var(--color-text)' }}>
                    {ver.description}
                  </h2>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '0.8rem', color: 'var(--color-text-light)', display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}>
                    <Calendar size={14} />
                    {formatDate(ver.date)} {ver.time ? `· ${ver.time}` : ''}
                  </span>
                  
                  {ver.author && (
                    <span style={{ fontSize: '0.8rem', color: 'var(--color-text-light)', display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                      {ver.authorAvatar ? (
                        <img src={ver.authorAvatar} alt="" style={{ width: '16px', height: '16px', borderRadius: '50%' }} />
                      ) : (
                        <User size={14} />
                      )}
                      <span>{ver.author}</span>
                    </span>
                  )}

                  {allowDelete && !ver.isOfficial && !ver.isGitCommit && (
                    <button
                      type="button"
                      onClick={() => handleDelete(ver.id, ver.version)}
                      className="btn btn-outline"
                      style={{ padding: '0.2rem 0.45rem', color: 'var(--color-danger)', border: 'none' }}
                      title="Eliminar versión manual"
                    >
                      <Trash2 size={15} />
                    </button>
                  )}
                </div>
              </div>

              {/* Lista Detallada de Cambios */}
              {changes.length > 0 ? (
                <div style={{ marginTop: '0.85rem', borderTop: '1px solid var(--color-border)', paddingTop: '0.85rem' }}>
                  <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '0.55rem' }}>
                    {changes.map((change, cIdx) => {
                      const text = typeof change === 'string' ? change : change.text;
                      const type = typeof change === 'object' && change.type ? change.type : 'feature';
                      const config = TYPE_CONFIG[type] || TYPE_CONFIG.feature;

                      return (
                        <li key={cIdx} style={{ display: 'flex', alignItems: 'flex-start', gap: '0.65rem', fontSize: '0.875rem' }}>
                          <span
                            style={{
                              fontSize: '0.7rem',
                              padding: '2px 8px',
                              borderRadius: '10px',
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
                <p style={{ color: 'var(--color-text-light)', fontSize: '0.875rem', margin: 0 }}>
                  {ver.description}
                </p>
              )}
            </div>
          );
        })}

        {/* Botón Cargar Más Commits */}
        {filteredVersions.length > visibleCount && (
          <div style={{ textAlign: 'center', marginTop: '1rem' }}>
            <button
              type="button"
              className="btn btn-outline"
              onClick={() => setVisibleCount(prev => prev + 25)}
              style={{ padding: '0.6rem 1.5rem', display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}
            >
              <ChevronDown size={18} />
              <span>Mostrar más commits ({visibleCount} de {filteredVersions.length})</span>
            </button>
          </div>
        )}

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
