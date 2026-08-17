import React, { useState } from 'react';
import { useInventory } from '../../context/InventoryContext';
import { Plus, Trash2, Home, Save, Image as ImageIcon, GitBranch, Calendar, Palette } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { formatDate } from '../../utils/formatUtils';

const Settings = () => {
  const { categories, documentTypes, settings, categoryUnits, versions, addCategory, deleteCategory, addDocumentType, deleteDocumentType, updateSettings, updateCategoryUnit, addVersion, deleteVersion, theme, setTheme } = useInventory();
  const [newCat, setNewCat] = useState('');
  const [newDocType, setNewDocType] = useState('');
  const [systemName, setSystemName] = useState(settings.name);
  const [systemLogo, setSystemLogo] = useState(settings.logo);
  const [versionDescription, setVersionDescription] = useState('');

  const handleAddCat = (e) => {
    e.preventDefault();
    if (newCat.trim()) {
      addCategory(newCat.trim());
      setNewCat('');
      toast.success('Categoría agregada');
    }
  };

  const handleAddDocType = (e) => {
    e.preventDefault();
    if (newDocType.trim()) {
      addDocumentType(newDocType.trim());
      setNewDocType('');
      toast.success('Tipo de documento agregado');
    }
  };

  const handleLogoChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setSystemLogo(reader.result);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSaveSettings = async (e) => {
    e.preventDefault();
    try {
      await updateSettings({ name: systemName, logo: systemLogo });
      toast.success('Configuración del sistema guardada');
    } catch (error) {
      toast.error('Error al guardar la configuración');
    }
  };

  const handleAddVersion = async (e) => {
    e.preventDefault();
    if (!versionDescription.trim()) return;
    const result = await addVersion(versionDescription.trim());
    if (result.success) {
      setVersionDescription('');
      toast.success('Versión registrada');
    } else {
      toast.error('Error al registrar la versión');
    }
  };

  const handleDeleteVersion = (id) => {
    if (window.confirm('¿Seguro que deseas eliminar esta versión del log?')) {
      deleteVersion(id);
      toast.success('Versión eliminada');
    }
  };

  return (
    <div>
      <div className="topbar">
        <h1 className="page-title">Configuración del Sistema</h1>
      </div>

      <div className="grid grid-cols-1" style={{ marginBottom: '2rem' }}>
        <div className="card">
          <h2 style={{ fontSize: '1.2rem', marginBottom: '1.5rem', color: 'var(--color-primary)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Home size={20} /> Personalización del Sistema
          </h2>
          <form onSubmit={handleSaveSettings} className="grid grid-cols-2" style={{ alignItems: 'flex-start' }}>
            <div className="form-group">
              <label className="form-label">Nombre del Sistema</label>
              <input 
                type="text" 
                className="form-input" 
                value={systemName} 
                onChange={(e) => setSystemName(e.target.value)} 
                placeholder="Nombre de tu empresa/sistema" 
                required 
              />
              <p style={{ fontSize: '0.75rem', color: 'var(--color-text-light)', marginTop: '0.5rem' }}>
                Este nombre aparecerá en el menú lateral y en la pantalla de inicio.
              </p>
            </div>

            <div className="form-group">
              <label className="form-label">Logotipo</label>
              <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'center' }}>
                <div style={{ 
                  width: '80px', 
                  height: '80px', 
                  border: '2px dashed var(--color-border)', 
                  borderRadius: 'var(--radius)', 
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'center',
                  backgroundColor: 'var(--color-bg)',
                  overflow: 'hidden'
                }}>
                  {systemLogo ? (
                    <img src={systemLogo} alt="Logo Preview" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                  ) : (
                    <ImageIcon size={32} style={{ color: 'var(--color-text-light)' }} />
                  )}
                </div>
                <div style={{ flex: 1 }}>
                  <input 
                    type="file" 
                    accept="image/*" 
                    onChange={handleLogoChange}
                    style={{ fontSize: '0.875rem', color: 'var(--color-text-light)' }}
                  />
                  {systemLogo && (
                    <button 
                      type="button" 
                      onClick={() => setSystemLogo(null)} 
                      style={{ 
                        background: 'none', 
                        border: 'none', 
                        color: 'var(--color-danger)', 
                        fontSize: '0.75rem', 
                        cursor: 'pointer',
                        marginTop: '0.5rem',
                        display: 'block'
                      }}
                    >
                      Quitar Logo
                    </button>
                  )}
                </div>
              </div>
            </div>

            <div style={{ gridColumn: 'span 2', textAlign: 'right', marginTop: '1rem' }}>
              <button type="submit" className="btn btn-primary">
                <Save size={18} /> Guardar Cambios del Sistema
              </button>
            </div>
          </form>
        </div>

        {/* Theme Customizer Card */}
        <div className="card">
          <h2 style={{ fontSize: '1.2rem', marginBottom: '0.5rem', color: 'var(--color-primary)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Palette size={20} /> Tema Visual y Apariencia
          </h2>
          <p style={{ color: 'var(--color-text-light)', fontSize: '0.875rem', marginBottom: '1.25rem' }}>
            Personaliza el tema cromático de la plataforma para mejorar el contraste, la legibilidad y la experiencia visual.
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
            {[
              { id: 'light', name: 'Modo Claro', desc: 'Fondo limpio y texto de alto contraste', bg: '#f8fafc', surface: '#ffffff', primary: '#1e3a8a' },
              { id: 'dark', name: 'Modo Oscuro', desc: 'Elegante y descansado para la vista', bg: '#0b0f19', surface: '#111827', primary: '#3b82f6' },
              { id: 'navy', name: 'Azul Noche', desc: 'Tonalidad nocturna azul profundo', bg: '#08122d', surface: '#0e1e4a', primary: '#38bdf8' },
              { id: 'emerald', name: 'Esmeralda Pro', desc: 'Verde profesional para almacén', bg: '#051c19', surface: '#0a2e2b', primary: '#10b981' }
            ].map(t => {
              const isSelected = theme === t.id;
              return (
                <div
                  key={t.id}
                  onClick={() => setTheme(t.id)}
                  style={{
                    border: isSelected ? '2px solid var(--color-primary)' : '1px solid var(--color-border)',
                    borderRadius: 'var(--radius)',
                    padding: '1rem',
                    cursor: 'pointer',
                    backgroundColor: t.surface,
                    boxShadow: isSelected ? '0 0 0 3px rgba(59, 130, 246, 0.2)' : 'none',
                    transition: 'var(--transition)'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <span style={{ width: '14px', height: '14px', borderRadius: '50%', backgroundColor: t.primary, display: 'inline-block' }}></span>
                      <strong style={{ fontSize: '0.9rem', color: t.id === 'light' ? '#1e293b' : '#f8fafc' }}>{t.name}</strong>
                    </div>
                    {isSelected && (
                      <span style={{ fontSize: '0.7rem', padding: '2px 6px', borderRadius: '8px', backgroundColor: t.primary, color: 'white', fontWeight: 'bold' }}>
                        Activo
                      </span>
                    )}
                  </div>
                  <p style={{ fontSize: '0.75rem', color: t.id === 'light' ? '#64748b' : '#94a3b8', margin: 0 }}>
                    {t.desc}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2">
        {/* Categories */}
        <div className="card">
          <h2 style={{ fontSize: '1.2rem', marginBottom: '1rem', color: 'var(--color-primary)' }}>Categorías</h2>
          <form onSubmit={handleAddCat} style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem' }}>
            <input type="text" className="form-input" value={newCat} onChange={(e) => setNewCat(e.target.value)} placeholder="Nueva categoría" required />
            <button type="submit" className="btn btn-primary"><Plus size={18} /></button>
          </form>
          <ul style={{ listStyle: 'none', padding: 0 }}>
            {categories.map((c, idx) => (
              <li key={idx} style={{ padding: '0.75rem 0', borderBottom: '1px solid var(--color-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem' }}>
                <span style={{ flex: 1 }}>{c}</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <label style={{ fontSize: '0.75rem', color: 'var(--color-text-light)' }}>Métrica:</label>
                  <select 
                    className="form-select" 
                    style={{ padding: '0.25rem 0.5rem', fontSize: '0.875rem', width: 'auto' }}
                    value={categoryUnits[c] || 'units'}
                    onChange={(e) => updateCategoryUnit(c, e.target.value)}
                  >
                    <option value="units">Unidades</option>
                    <option value="pounds">Libras</option>
                    <option value="baskets">Cestas</option>
                  </select>
                  <button type="button" onClick={() => { deleteCategory(c); toast.success('Categoría eliminada'); }} className="btn btn-danger" style={{ padding: '0.25rem' }}><Trash2 size={14} /></button>
                </div>
              </li>
            ))}
          </ul>
        </div>

        {/* Document Types */}
        <div className="card">
          <h2 style={{ fontSize: '1.2rem', marginBottom: '1rem', color: 'var(--color-primary)' }}>Tipos de Documento</h2>
          <form onSubmit={handleAddDocType} style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem' }}>
            <input type="text" className="form-input" value={newDocType} onChange={(e) => setNewDocType(e.target.value)} placeholder="Nuevo tipo" required />
            <button type="submit" className="btn btn-primary"><Plus size={18} /></button>
          </form>
          <ul style={{ listStyle: 'none', padding: 0 }}>
            {documentTypes.map((d, idx) => (
              <li key={idx} style={{ padding: '0.5rem 0', borderBottom: '1px solid var(--color-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>{d}</span>
                <button type="button" onClick={() => { deleteDocumentType(d); toast.success('Tipo de documento eliminado'); }} className="btn btn-danger" style={{ padding: '0.25rem' }}><Trash2 size={14} /></button>
              </li>
            ))}
          </ul>
        </div>

      </div>

      <div className="grid grid-cols-1" style={{ marginBottom: '2rem' }}>
        <div className="card">
          <h2 style={{ fontSize: '1.2rem', marginBottom: '0.5rem', color: 'var(--color-primary)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <GitBranch size={20} /> Log de Versiones
          </h2>
          <p style={{ fontSize: '0.8rem', color: 'var(--color-text-light)', marginBottom: '1.5rem' }}>
            Registra cada versión del sistema. La numeración (V1, V2...) se asigna automáticamente y de forma única, y la versión más reciente se muestra en el menú lateral y en la pantalla de inicio.
          </p>

          <form onSubmit={handleAddVersion} style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem', alignItems: 'flex-end' }}>
            <div className="form-group" style={{ flex: 1, marginBottom: 0 }}>
              <label className="form-label">Descripción de la versión</label>
              <input
                type="text"
                className="form-input"
                value={versionDescription}
                onChange={(e) => setVersionDescription(e.target.value)}
                placeholder="Ej. Corrección de bugs en captura de movimientos..."
                required
              />
            </div>
            <button type="submit" className="btn btn-primary" style={{ whiteSpace: 'nowrap' }}>
              <Plus size={18} /> Registrar Versión
            </button>
          </form>

          {versions.length === 0 ? (
            <p style={{ color: 'var(--color-text-light)', fontSize: '0.875rem', fontStyle: 'italic' }}>No se han registrado versiones todavía.</p>
          ) : (
            <div className="table-container" style={{ border: 'none', boxShadow: 'none' }}>
              <table>
                <thead>
                  <tr>
                    <th style={{ width: '120px' }}>Versión</th>
                    <th style={{ width: '140px' }}>Fecha</th>
                    <th>Descripción</th>
                    <th style={{ width: '60px' }}></th>
                  </tr>
                </thead>
                <tbody>
                  {versions.map(v => (
                    <tr key={v.id}>
                      <td>
                        <span className="badge badge-primary" style={{ fontWeight: 'bold' }}>{v.version}</span>
                      </td>
                      <td style={{ color: 'var(--color-text-light)', fontSize: '0.875rem' }}>
                        <Calendar size={12} style={{ verticalAlign: 'middle', marginRight: '0.25rem' }} />
                        {formatDate(v.date)} {v.time ? `· ${v.time}` : ''}
                      </td>
                      <td style={{ fontWeight: '400' }}>{v.description}</td>
                      <td>
                        <button type="button" onClick={() => handleDeleteVersion(v.id)} className="btn btn-danger" style={{ padding: '0.25rem' }} title="Eliminar versión">
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Settings;
