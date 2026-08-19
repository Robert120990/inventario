import React, { useState } from 'react';
import { useInventory } from '../../context/InventoryContext';
import { LogIn, Package, ShieldCheck, Lock, User, Sparkles } from 'lucide-react';
import { APP_DISPLAY_VERSION, APP_COMMIT_HASH } from '../../config/version';

const Login = () => {
  const { login, settings, currentVersion } = useInventory();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const appCommitVersion = import.meta.env.VITE_APP_VERSION;
  const versionDisplay = currentVersion?.version 
    ? (appCommitVersion ? `${currentVersion.version} (v${appCommitVersion})` : currentVersion.version)
    : (appCommitVersion ? `v${appCommitVersion}` : '');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      const result = await login(username, password);
      if (!result.success) {
        setError(result.message);
      }
    } catch (err) {
      setError('Error al intentar iniciar sesión.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '100vh',
      backgroundColor: 'var(--color-bg)',
      position: 'relative',
      overflow: 'hidden',
      padding: '1.5rem'
    }}>
      {/* Stitch Luminous Background Radial Halos */}
      <div className="luminous-glow" style={{ top: '-15%', left: '10%', width: '450px', height: '450px', background: 'radial-gradient(circle, rgba(0, 209, 102, 0.15) 0%, transparent 70%)' }}></div>
      <div className="luminous-glow" style={{ bottom: '-15%', right: '10%', width: '500px', height: '500px', background: 'radial-gradient(circle, rgba(0, 89, 187, 0.12) 0%, transparent 70%)' }}></div>

      {/* Frosted Glass Login Center Card */}
      <div className="glass-card" style={{
        width: '100%',
        maxWidth: '420px',
        display: 'flex',
        flexDirection: 'column',
        gap: '1.75rem',
        borderRadius: 'var(--radius-xl)',
        padding: '2.5rem 2rem',
        boxShadow: 'var(--shadow-lg)',
        position: 'relative',
        zIndex: 10
      }}>
        {/* Brand Header */}
        <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <div style={{
            width: '56px',
            height: '56px',
            borderRadius: 'var(--radius-lg)',
            background: 'linear-gradient(135deg, rgba(0, 109, 50, 0.15) 0%, rgba(0, 209, 102, 0.25) 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            border: '1px solid rgba(0, 209, 102, 0.3)',
            marginBottom: '1rem',
            boxShadow: '0 8px 20px -4px rgba(0, 209, 102, 0.25)'
          }}>
            {settings.logo ? (
              <img src={settings.logo} alt="Logo" style={{ width: '36px', height: '36px', objectFit: 'contain' }} />
            ) : (
              <Package size={30} style={{ color: 'var(--color-primary)' }} />
            )}
          </div>

          <span className="badge badge-primary" style={{ fontSize: '0.7rem', padding: '0.25rem 0.65rem', marginBottom: '0.5rem', fontWeight: '700' }}>
            <ShieldCheck size={13} /> CONTROL DE ACCESO
          </span>

          <h1 className="font-headline" style={{ color: 'var(--color-text)', fontSize: '1.75rem', fontWeight: '700', letterSpacing: '-0.03em', margin: 0 }}>
            {settings.name || 'Inventario'}
          </h1>
          <p style={{ fontSize: '0.85rem', color: 'var(--color-text-light)', marginTop: '0.35rem' }}>
            Inicia sesión para ingresar al centro de comando
          </p>
        </div>

        {/* Login Form */}
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.15rem' }}>
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <User size={14} style={{ color: 'var(--color-primary)' }} />
              <span>Usuario</span>
            </label>
            <input 
              type="text" 
              className="form-input" 
              value={username}
              onChange={(e) => { setUsername(e.target.value); setError(''); }}
              placeholder="Nombre de usuario"
              required 
              autoFocus
              style={{ fontSize: '0.9rem', padding: '0.75rem 0.9rem' }}
            />
          </div>

          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <Lock size={14} style={{ color: 'var(--color-primary)' }} />
              <span>Contraseña</span>
            </label>
            <input 
              type="password" 
              className="form-input" 
              value={password}
              onChange={(e) => { setPassword(e.target.value); setError(''); }}
              placeholder="••••••••"
              required 
              style={{ fontSize: '0.9rem', padding: '0.75rem 0.9rem' }}
            />
          </div>

          {error && (
            <div style={{
              padding: '0.65rem 0.85rem',
              backgroundColor: 'var(--color-danger-bg)',
              color: 'var(--color-danger-text)',
              borderRadius: 'var(--radius)',
              fontSize: '0.8rem',
              fontWeight: '500',
              border: '1px solid rgba(186, 26, 26, 0.2)'
            }}>
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="btn btn-primary font-headline"
            style={{
              width: '100%',
              marginTop: '0.5rem',
              padding: '0.8rem',
              fontSize: '0.95rem',
              fontWeight: '700',
              borderRadius: 'var(--radius)'
            }}
          >
            <LogIn size={18} />
            <span>{submitting ? 'Verificando credenciales...' : 'Acceder al Sistema'}</span>
          </button>
        </form>

        {/* Footer info with Version Pill Badge */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem', marginTop: '0.5rem' }}>
          <div className="version-pill-badge" style={{ padding: '0.2rem 0.65rem 0.2rem 0.3rem' }}>
            <span className="version-pill-tag">NUEVA</span>
            <span className="version-pill-number">{APP_DISPLAY_VERSION}</span>
            <span className="version-pill-commit">· {APP_COMMIT_HASH}</span>
          </div>
          <span style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)' }}>
            © 2026 Sistema de Control de Inventario
          </span>
        </div>
      </div>
    </div>
  );
};

export default Login;
