import React, { useState } from 'react';
import { useInventory } from '../../context/InventoryContext';
import { Plus, Trash2 } from 'lucide-react';

const Settings = () => {
  const { categories, documentTypes, users, addCategory, deleteCategory, addDocumentType, deleteDocumentType, addUser } = useInventory();
  const [newCat, setNewCat] = useState('');
  const [newDocType, setNewDocType] = useState('');
  const [newUser, setNewUser] = useState({ username: '', password: '', role: 'user' });

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

  const handleAddUser = (e) => {
    e.preventDefault();
    if (newUser.username.trim() && newUser.password.trim()) {
      addUser({ username: newUser.username.trim(), password: newUser.password.trim(), role: newUser.role });
      setNewUser({ username: '', password: '', role: 'user' });
    }
  };

  return (
    <div>
      <div className="topbar">
        <h1 className="page-title">Configuración del Sistema</h1>
      </div>

      <div className="grid grid-cols-3">
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

        {/* Users */}
        <div className="card">
          <h2 style={{ fontSize: '1.2rem', marginBottom: '1rem', color: 'var(--color-primary)' }}>Usuarios</h2>
          <form onSubmit={handleAddUser} style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1.5rem' }}>
            <input type="text" className="form-input" value={newUser.username} onChange={(e) => setNewUser({...newUser, username: e.target.value})} placeholder="Nombre de usuario" required />
            <input type="password" className="form-input" value={newUser.password} onChange={(e) => setNewUser({...newUser, password: e.target.value})} placeholder="Contraseña" required />
            <select className="form-select" value={newUser.role} onChange={(e) => setNewUser({...newUser, role: e.target.value})}>
              <option value="user">Usuario normal</option>
              <option value="admin">Administrador</option>
            </select>
            <button type="submit" className="btn btn-primary" style={{ alignSelf: 'flex-start' }}><Plus size={18} /> Agregar</button>
          </form>
          <ul style={{ listStyle: 'none', padding: 0 }}>
            {users.map((u, idx) => (
              <li key={idx} style={{ padding: '0.5rem 0', borderBottom: '1px solid var(--color-border)', display: 'flex', justifyContent: 'space-between' }}>
                <span>{u.username}</span>
                <span className={`badge ${u.role === 'admin' ? 'badge-primary' : 'badge-gray'}`}>{u.role}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
};

export default Settings;
