import React, { useState, useEffect } from 'react';
import { Mail, Key, Server, Save, X, CheckCircle2, AlertCircle, RefreshCw, Globe, ExternalLink } from 'lucide-react';
import { toast } from 'react-hot-toast';

const API_BASE_URL = import.meta.env.VITE_API_URL || '';

const EmailConfigModal = ({ userId, username, onClose, onSaved }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [imapHost, setImapHost] = useState('box5644.bluehost.com');
  const [imapPort, setImapPort] = useState(993);
  const [smtpHost, setSmtpHost] = useState('box5644.bluehost.com');
  const [smtpPort, setSmtpPort] = useState(465);
  const [isConfigured, setIsConfigured] = useState(false);
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testResult, setTestResult] = useState(null);

  useEffect(() => {
    fetchConfig();
  }, [userId]);

  const fetchConfig = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/email/config?userId=${userId}`);
      const data = await res.json();
      if (data.isConfigured) {
        setEmail(data.email || '');
        setImapHost(data.imap_host || 'box5644.bluehost.com');
        setImapPort(data.imap_port || 993);
        setSmtpHost(data.smtp_host || 'box5644.bluehost.com');
        setSmtpPort(data.smtp_port || 465);
        setIsConfigured(true);
      }
    } catch (e) {
      console.error('Error fetching email config:', e);
    }
  };

  const handleTestConnection = async () => {
    if (!email || (!password && !isConfigured)) {
      toast.error('Ingresa correo y contraseña para probar.');
      return;
    }

    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch(`${API_BASE_URL}/api/email/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          email,
          password: password || undefined,
          imap_host: imapHost,
          imap_port: imapPort
        })
      });
      const data = await res.json();
      if (data.success) {
        setTestResult({ success: true, message: '¡Conexión exitosa con el servidor de correo!' });
        toast.success('Conexión IMAP verificada correctamente');
      } else {
        setTestResult({ success: false, message: data.error || 'Credenciales inválidas o servidor no responde.' });
        toast.error(data.error || 'Fallo en la prueba de conexión');
      }
    } catch (e) {
      setTestResult({ success: false, message: 'Error de conexión con el servidor.' });
      toast.error('Error de red al probar conexión');
    } finally {
      setTesting(false);
    }
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!email) {
      toast.error('El correo electrónico es requerido.');
      return;
    }
    if (!password && !isConfigured) {
      toast.error('La contraseña del correo es requerida.');
      return;
    }

    setSaving(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/email/config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          email,
          password: password || undefined,
          imap_host: imapHost,
          imap_port: imapPort,
          smtp_host: smtpHost,
          smtp_port: smtpPort,
          auditUser: username
        })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        toast.success('Configuración de correo guardada con éxito');
        if (onSaved) onSaved();
        onClose();
      } else {
        toast.error(data.error || 'Error al guardar configuración');
      }
    } catch (e) {
      toast.error('Error al comunicarse con el servidor');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content" style={{ maxWidth: '580px', width: '95%' }}>
        <div className="topbar" style={{ marginBottom: '1.25rem', borderBottom: '1px solid var(--color-border)', paddingBottom: '0.75rem' }}>
          <div>
            <h2 style={{ fontSize: '1.25rem', color: 'var(--color-primary)', display: 'flex', alignItems: 'center', gap: '0.5rem', margin: 0 }}>
              <Mail size={22} /> Configuración de Correo Corporativo
            </h2>
            <p style={{ color: 'var(--color-text-light)', fontSize: '0.8rem', margin: '0.25rem 0 0 0' }}>
              Conecta tu cuenta de cPanel / Bluehost / Roundcube para ver y enviar correos.
            </p>
          </div>
          <button type="button" className="btn btn-outline" onClick={onClose} style={{ padding: '0.25rem' }}>
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSave}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Dirección de Correo Empresarial</label>
              <div style={{ position: 'relative' }}>
                <Mail size={16} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-light)' }} />
                <input
                  type="email"
                  className="form-input"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="ejemplo@tuempresa.com"
                  style={{ paddingLeft: '2.2rem' }}
                  required
                />
              </div>
            </div>

            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">
                Contraseña de Correo {isConfigured && <span style={{ color: 'var(--color-text-light)', fontWeight: 'normal', fontSize: '0.75rem' }}>(dejar en blanco para mantener actual)</span>}
              </label>
              <div style={{ position: 'relative' }}>
                <Key size={16} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-light)' }} />
                <input
                  type="password"
                  className="form-input"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={isConfigured ? '••••••••••••' : 'Contraseña de tu webmail'}
                  style={{ paddingLeft: '2.2rem' }}
                  required={!isConfigured}
                />
              </div>
            </div>

            <div style={{ backgroundColor: 'var(--color-bg)', padding: '0.85rem 1rem', borderRadius: 'var(--radius)', border: '1px solid var(--color-border)' }}>
              <div style={{ fontSize: '0.85rem', fontWeight: '600', color: 'var(--color-text)', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Server size={16} style={{ color: 'var(--color-primary)' }} /> Parámetros del Servidor (Bluehost / cPanel)
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '0.75rem' }}>
                <div>
                  <label style={{ fontSize: '0.75rem', color: 'var(--color-text-light)', display: 'block', marginBottom: '0.25rem' }}>Servidor IMAP (Entrada)</label>
                  <input
                    type="text"
                    className="form-input"
                    value={imapHost}
                    onChange={(e) => setImapHost(e.target.value)}
                    style={{ fontSize: '0.8rem', padding: '0.35rem 0.6rem' }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: '0.75rem', color: 'var(--color-text-light)', display: 'block', marginBottom: '0.25rem' }}>Puerto IMAP</label>
                  <input
                    type="number"
                    className="form-input"
                    value={imapPort}
                    onChange={(e) => setImapPort(e.target.value)}
                    style={{ fontSize: '0.8rem', padding: '0.35rem 0.6rem' }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: '0.75rem', color: 'var(--color-text-light)', display: 'block', marginBottom: '0.25rem' }}>Servidor SMTP (Salida)</label>
                  <input
                    type="text"
                    className="form-input"
                    value={smtpHost}
                    onChange={(e) => setSmtpHost(e.target.value)}
                    style={{ fontSize: '0.8rem', padding: '0.35rem 0.6rem' }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: '0.75rem', color: 'var(--color-text-light)', display: 'block', marginBottom: '0.25rem' }}>Puerto SMTP</label>
                  <input
                    type="number"
                    className="form-input"
                    value={smtpPort}
                    onChange={(e) => setSmtpPort(e.target.value)}
                    style={{ fontSize: '0.8rem', padding: '0.35rem 0.6rem' }}
                  />
                </div>
              </div>
            </div>

            {testResult && (
              <div style={{
                padding: '0.75rem 1rem',
                borderRadius: 'var(--radius)',
                backgroundColor: testResult.success ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                border: `1px solid ${testResult.success ? 'var(--color-success)' : 'var(--color-danger)'}`,
                display: 'flex',
                alignItems: 'center',
                gap: '0.65rem',
                fontSize: '0.85rem',
                color: testResult.success ? 'var(--color-success)' : 'var(--color-danger)'
              }}>
                {testResult.success ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
                <span>{testResult.message}</span>
              </div>
            )}
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '1.5rem', borderTop: '1px solid var(--color-border)', paddingTop: '1rem' }}>
            <button
              type="button"
              className="btn btn-outline"
              onClick={handleTestConnection}
              disabled={testing || !email}
              style={{ fontSize: '0.85rem' }}
            >
              {testing ? <RefreshCw size={15} className="spin" /> : <Globe size={15} />}
              {testing ? 'Verificando...' : 'Probar Conexión'}
            </button>

            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button type="button" className="btn btn-outline" onClick={onClose}>
                Cancelar
              </button>
              <button type="submit" className="btn btn-primary" disabled={saving}>
                <Save size={16} /> {saving ? 'Guardando...' : 'Guardar Cuenta'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};

export default EmailConfigModal;
