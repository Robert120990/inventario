import React, { useState } from 'react';
import { useInventory } from '../../context/InventoryContext';
import { LogIn, Package } from 'lucide-react';

const Login = () => {
  const { login, settings } = useInventory();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    const result = login(username, password);
    if (!result.success) {
      setError(result.message);
    }
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', backgroundColor: 'var(--color-bg)' }}>
      <div className="card" style={{ width: '100%', maxWidth: '400px', display: 'flex', flexDirection: 'column', gap: '1.5rem', alignItems: 'center' }}>
        <div style={{ textAlign: 'center' }}>
          {settings.logo ? (
            <img src={settings.logo} alt="Logo" style={{ width: '64px', height: '64px', objectFit: 'contain', marginBottom: '1rem' }} />
          ) : (
            <Package size={48} style={{ color: 'var(--color-primary)', marginBottom: '1rem' }} />
          )}
          <h2 style={{ color: 'var(--color-primary)', margin: 0 }}>{settings.name}</h2>
        </div>
        <h3 style={{ fontSize: '1.2rem', color: 'var(--color-text-light)' }}>Iniciar Sesión</h3>
        <form onSubmit={handleSubmit} style={{ width: '100%' }}>
          <div className="form-group">
            <label className="form-label">Usuario</label>
            <input 
              type="text" 
              className="form-input" 
              value={username}
              onChange={(e) => {setUsername(e.target.value); setError('');}}
              placeholder="Ej: admin"
              required 
            />
          </div>
          <div className="form-group" style={{ marginTop: '1rem' }}>
            <label className="form-label">Contraseña</label>
            <input 
              type="password" 
              className="form-input" 
              value={password}
              onChange={(e) => {setPassword(e.target.value); setError('');}}
              required 
            />
          </div>
          {error && <p className="form-error" style={{ marginBottom: '1rem' }}>{error}</p>}
          <button type="submit" className="btn btn-primary" style={{ width: '100%', marginTop: '0.5rem' }}>
            <LogIn size={18} /> Entrar
          </button>
        </form>
      </div>
    </div>
  );
};

export default Login;
