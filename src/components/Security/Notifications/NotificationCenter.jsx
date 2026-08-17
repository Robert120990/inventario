import React, { useState, useEffect } from 'react';
import { useInventory } from '../../../context/InventoryContext';
import { Bell, CheckCheck, AlertTriangle, Info, CheckCircle2, AlertOctagon, Plus, X, Calendar } from 'lucide-react';
import { toast } from 'react-hot-toast';

const NOTIF_ICONS = {
  info: <Info size={20} style={{ color: 'var(--color-primary)' }} />,
  warning: <AlertTriangle size={20} style={{ color: '#f59e0b' }} />,
  success: <CheckCircle2 size={20} style={{ color: 'var(--color-success)' }} />,
  danger: <AlertOctagon size={20} style={{ color: 'var(--color-danger)' }} />
};

const NotificationCenter = () => {
  const { notifications, fetchNotifications, markNotificationAsRead, markAllNotificationsAsRead, addNotification, currentUser } = useInventory();
  const [filter, setFilter] = useState('all'); // 'all' or 'unread'
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [type, setType] = useState('info');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchNotifications();
  }, []);

  const filtered = notifications.filter(n => {
    if (filter === 'unread') return !n.isRead;
    return true;
  });

  const handleMarkAll = async () => {
    await markAllNotificationsAsRead();
    toast.success('Todas las notificaciones marcadas como leídas');
  };

  const handleCreateNotification = async (e) => {
    e.preventDefault();
    if (!title.trim() || !message.trim()) {
      toast.error('Título y mensaje son obligatorios');
      return;
    }
    setSaving(true);
    try {
      const res = await addNotification({ title, message, type });
      if (res.success) {
        toast.success('Notificación enviada al sistema');
        setIsModalOpen(false);
        setTitle('');
        setMessage('');
      } else {
        toast.error('Error al enviar la notificación');
      }
    } catch (err) {
      toast.error('Error al conectar');
    } finally {
      setSaving(false);
    }
  };

  const isAdmin = currentUser?.role === 'admin';

  return (
    <div>
      <div className="topbar">
        <div>
          <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Bell size={24} style={{ color: 'var(--color-primary)' }} /> Bandeja de Notificaciones
          </h1>
          <p style={{ color: 'var(--color-text-light)', fontSize: '0.875rem' }}>
            Avisos del sistema, alertas automáticas de inventario y comunicados de administración.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button className="btn btn-outline" onClick={handleMarkAll}>
            <CheckCheck size={16} /> Marcar Todas Leídas
          </button>
          {isAdmin && (
            <button className="btn btn-primary" onClick={() => setIsModalOpen(true)}>
              <Plus size={16} /> Nueva Notificación
            </button>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem' }}>
        <button
          className={`btn ${filter === 'all' ? 'btn-primary' : 'btn-outline'}`}
          onClick={() => setFilter('all')}
          style={{ fontSize: '0.85rem' }}
        >
          Todas ({notifications.length})
        </button>
        <button
          className={`btn ${filter === 'unread' ? 'btn-primary' : 'btn-outline'}`}
          onClick={() => setFilter('unread')}
          style={{ fontSize: '0.85rem' }}
        >
          No leídas ({notifications.filter(n => !n.isRead).length})
        </button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', maxWidth: '850px' }}>
        {filtered.map(notif => (
          <div
            key={notif.id}
            className="card"
            style={{
              display: 'flex',
              gap: '1rem',
              alignItems: 'flex-start',
              padding: '1.25rem',
              backgroundColor: notif.isRead ? 'var(--color-surface)' : 'rgba(30, 58, 138, 0.03)',
              borderLeft: notif.isRead ? '1px solid var(--color-border)' : '4px solid var(--color-primary)'
            }}
          >
            <div style={{ padding: '0.5rem', borderRadius: '50%', backgroundColor: 'var(--color-bg)' }}>
              {NOTIF_ICONS[notif.type] || NOTIF_ICONS.info}
            </div>

            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.25rem' }}>
                <h3 style={{ fontSize: '1rem', fontWeight: '600', margin: 0, color: 'var(--color-text)' }}>
                  {notif.title}
                </h3>
                <span style={{ fontSize: '0.75rem', color: 'var(--color-text-light)', display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
                  <Calendar size={12} /> {notif.date}
                </span>
              </div>
              <p style={{ fontSize: '0.875rem', color: 'var(--color-text-light)', margin: '0.25rem 0 0.75rem 0', lineHeight: 1.5 }}>
                {notif.message}
              </p>

              {!notif.isRead && (
                <button
                  type="button"
                  onClick={() => markNotificationAsRead(notif.id)}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--color-primary)',
                    fontSize: '0.75rem',
                    fontWeight: '600',
                    cursor: 'pointer',
                    padding: 0
                  }}
                >
                  Marcar como leída
                </button>
              )}
            </div>
          </div>
        ))}

        {filtered.length === 0 && (
          <div className="card" style={{ textAlign: 'center', padding: '3rem' }}>
            <Bell size={40} style={{ color: 'var(--color-text-light)', margin: '0 auto 1rem', opacity: 0.4 }} />
            <h3 style={{ color: 'var(--color-text)', margin: 0 }}>No hay notificaciones</h3>
            <p style={{ color: 'var(--color-text-light)', fontSize: '0.875rem', marginTop: '0.5rem' }}>
              {filter === 'unread' ? 'Estás al día con todas tus notificaciones.' : 'No se han registrado notificaciones todavía.'}
            </p>
          </div>
        )}
      </div>

      {isModalOpen && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '500px', width: '95%' }}>
            <div className="topbar" style={{ marginBottom: '1.5rem', borderBottom: 'none' }}>
              <h2 style={{ fontSize: '1.25rem', color: 'var(--color-primary)' }}>Crear Notificación del Sistema</h2>
              <button type="button" className="btn btn-outline" onClick={() => setIsModalOpen(false)} style={{ padding: '0.25rem' }}>
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleCreateNotification}>
              <div className="form-group" style={{ marginBottom: '1rem' }}>
                <label className="form-label">Tipo de Notificación</label>
                <select className="form-select" value={type} onChange={(e) => setType(e.target.value)}>
                  <option value="info">Información General</option>
                  <option value="warning">Advertencia / Alerta</option>
                  <option value="success">Éxito / Confirmación</option>
                  <option value="danger">Urgente / Seguridad</option>
                </select>
              </div>

              <div className="form-group" style={{ marginBottom: '1rem' }}>
                <label className="form-label">Título</label>
                <input
                  type="text"
                  className="form-input"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Ej: Mantenimiento programado de almacén"
                  required
                />
              </div>

              <div className="form-group" style={{ marginBottom: '1.5rem' }}>
                <label className="form-label">Mensaje o Contenido</label>
                <textarea
                  className="form-input"
                  rows={4}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Escribe el detalle del aviso para los usuarios..."
                  required
                ></textarea>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem' }}>
                <button type="button" className="btn btn-outline" onClick={() => setIsModalOpen(false)} disabled={saving}>
                  Cancelar
                </button>
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {saving ? 'Enviando...' : 'Enviar Notificación'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default NotificationCenter;
