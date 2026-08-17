import React, { useState, useEffect } from 'react';
import { useInventory } from '../../../context/InventoryContext';
import { Users, Wifi, LogOut, Clock, Globe, Shield, RefreshCw, Smartphone, Monitor } from 'lucide-react';
import { toast } from 'react-hot-toast';

const ConnectedUsers = () => {
  const { activeSessions, fetchActiveSessions, disconnectSession, currentUser } = useInventory();
  const [loading, setLoading] = useState(false);

  const loadSessions = async () => {
    setLoading(true);
    try {
      await fetchActiveSessions();
    } catch (e) {
      toast.error('Error al actualizar sesiones');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSessions();
    const interval = setInterval(loadSessions, 30000); // refresh every 30s
    return () => clearInterval(interval);
  }, []);

  const handleDisconnect = async (session) => {
    if (window.confirm(`¿Deseas cerrar la sesión remota del usuario '${session.username}'?`)) {
      const res = await disconnectSession(session.id);
      if (res.success) {
        toast.success('Sesión finalizada con éxito');
      } else {
        toast.error('Error al finalizar sesión');
      }
    }
  };

  const getDeviceIcon = (ua = '') => {
    if (/mobile|android|iphone|ipad/i.test(ua)) {
      return <Smartphone size={16} style={{ color: 'var(--color-primary)' }} />;
    }
    return <Monitor size={16} style={{ color: 'var(--color-primary)' }} />;
  };

  return (
    <div>
      <div className="topbar">
        <div>
          <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Users size={24} style={{ color: 'var(--color-primary)' }} /> Usuarios Conectados y Sesiones Activas
          </h1>
          <p style={{ color: 'var(--color-text-light)', fontSize: '0.875rem' }}>
            Monitor en tiempo real de los usuarios conectados al sistema y sus dispositivos.
          </p>
        </div>
        <button className="btn btn-outline" onClick={loadSessions} disabled={loading}>
          <RefreshCw size={16} className={loading ? 'spin' : ''} /> Actualizar
        </button>
      </div>

      <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem' }}>
        <div className="card" style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '1rem', padding: '1.25rem' }}>
          <div style={{ width: '48px', height: '48px', borderRadius: '50%', backgroundColor: 'rgba(16, 185, 129, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-success)' }}>
            <Wifi size={24} />
          </div>
          <div>
            <div style={{ fontSize: '1.75rem', fontWeight: '700', lineHeight: 1 }}>{activeSessions.length}</div>
            <div style={{ fontSize: '0.85rem', color: 'var(--color-text-light)', marginTop: '0.25rem' }}>Sesiones Activas Ahora</div>
          </div>
        </div>
      </div>

      <div className="card" style={{ padding: 0 }}>
        <div className="table-container" style={{ border: 'none', boxShadow: 'none' }}>
          <table>
            <thead>
              <tr>
                <th style={{ width: '60px', textAlign: 'center' }}>Estado</th>
                <th>Usuario</th>
                <th>Dispositivo / Navegador</th>
                <th>Dirección IP</th>
                <th>Hora de Entrada</th>
                <th>Última Actividad</th>
                <th style={{ textAlign: 'center', width: '120px' }}>Acción</th>
              </tr>
            </thead>
            <tbody>
              {activeSessions.map(session => {
                const isCurrent = (currentUser?.id && session.userId && Number(currentUser.id) === Number(session.userId))
                  || (currentUser?.username && session.username && currentUser.username.toLowerCase() === session.username.toLowerCase());
                return (
                  <tr key={session.id}>
                    <td style={{ textAlign: 'center' }}>
                      <span style={{ display: 'inline-block', width: '10px', height: '10px', borderRadius: '50%', backgroundColor: 'var(--color-success)', boxShadow: '0 0 6px var(--color-success)' }} title="En línea"></span>
                    </td>
                    <td>
                      <div style={{ fontWeight: '600', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        {session.username}
                        {isCurrent && (
                          <span className="badge badge-primary" style={{ fontSize: '0.65rem' }}>Tu sesión actual</span>
                        )}
                      </div>
                    </td>
                    <td style={{ fontSize: '0.85rem', color: 'var(--color-text-light)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        {getDeviceIcon(session.user_agent)}
                        <span style={{ textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap', maxWidth: '300px' }} title={session.user_agent}>
                          {session.user_agent ? (session.user_agent.length > 50 ? session.user_agent.substring(0, 50) + '...' : session.user_agent) : 'Navegador Web'}
                        </span>
                      </div>
                    </td>
                    <td style={{ fontFamily: 'monospace', fontSize: '0.8rem', color: 'var(--color-text-light)' }}>
                      <Globe size={12} style={{ verticalAlign: 'middle', marginRight: '0.25rem' }} />
                      {session.ip_address || 'Red local'}
                    </td>
                    <td style={{ fontSize: '0.85rem', color: 'var(--color-text-light)' }}>
                      <Clock size={12} style={{ verticalAlign: 'middle', marginRight: '0.25rem' }} />
                      {session.login_time || 'Reciente'}
                    </td>
                    <td style={{ fontSize: '0.85rem', color: 'var(--color-text-light)' }}>
                      {session.last_activity}
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      {!isCurrent && (
                        <button
                          type="button"
                          className="btn btn-danger"
                          onClick={() => handleDisconnect(session)}
                          style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}
                          title="Desconectar usuario"
                        >
                          <LogOut size={12} /> Desconectar
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
              {activeSessions.length === 0 && (
                <tr>
                  <td colSpan="7" style={{ textAlign: 'center', padding: '3rem', color: 'var(--color-text-light)' }}>
                    No hay sesiones activas registradas en este momento.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default ConnectedUsers;
