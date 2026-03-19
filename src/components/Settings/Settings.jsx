import React, { useState } from 'react';
import { useInventory } from '../../context/InventoryContext';
import { Plus, Trash2, Home, Save, Image as ImageIcon } from 'lucide-react';

const Settings = () => {
  const { categories, documentTypes, settings, addCategory, deleteCategory, addDocumentType, deleteDocumentType, updateSettings } = useInventory();
  const [newCat, setNewCat] = useState('');
  const [newDocType, setNewDocType] = useState('');
  const [systemName, setSystemName] = useState(settings.name);
  const [systemLogo, setSystemLogo] = useState(settings.logo);

  const handleAddCat = (e) => {
    e.preventDefault();
    if (newCat.trim()) {
      addCategory(newCat.trim());
      setNewCat('');
    }
  };

  const handleAddDocType = (e) => {
    e.preventDefault();
    if (newDocType.trim()) {
      addDocumentType(newDocType.trim());
      setNewDocType('');
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

  const handleSaveSettings = (e) => {
    e.preventDefault();
    updateSettings({ name: systemName, logo: systemLogo });
    alert('Configuración del sistema guardada con éxito.');
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
              <li key={idx} style={{ padding: '0.5rem 0', borderBottom: '1px solid var(--color-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>{c}</span>
                <button type="button" onClick={() => deleteCategory(c)} className="btn btn-danger" style={{ padding: '0.25rem' }}><Trash2 size={14} /></button>
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
                <button type="button" onClick={() => deleteDocumentType(d)} className="btn btn-danger" style={{ padding: '0.25rem' }}><Trash2 size={14} /></button>
              </li>
            ))}
          </ul>
        </div>

      </div>
    </div>
  );
};

export default Settings;
