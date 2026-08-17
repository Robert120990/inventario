import React, { useState, useEffect } from 'react';
import { useInventory } from '../../context/InventoryContext';
import {
  Mail, Inbox, Send, Archive, Trash2, AlertCircle, RefreshCw, Search,
  Star, ExternalLink, Settings, Plus, Paperclip, Clock, Check, Reply,
  Forward, ArrowLeft, User, Shield, ChevronRight, FileText, Download
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { formatDate } from '../../utils/formatUtils';
import EmailConfigModal from './EmailConfigModal';
import ComposeEmailModal from './ComposeEmailModal';
import DOMPurify from 'dompurify';

const API_BASE_URL = import.meta.env.VITE_API_URL || '';

const FOLDERS = [
  { id: 'INBOX', name: 'Bandeja de Entrada', icon: Inbox },
  { id: 'Sent', name: 'Elementos Enviados', icon: Send },
  { id: 'Drafts', name: 'Borradores', icon: Archive },
  { id: 'Trash', name: 'Papelera', icon: Trash2 },
  { id: 'Junk', name: 'Correo no Deseado', icon: AlertCircle }
];

const EmailClient = () => {
  const { currentUser } = useInventory();
  const [config, setConfig] = useState(null);
  const [activeFolder, setActiveFolder] = useState('INBOX');
  const [messages, setMessages] = useState([]);
  const [selectedMessage, setSelectedMessage] = useState(null);
  const [messageDetails, setMessageDetails] = useState(null);
  const [loading, setLoading] = useState(false);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState('all'); // all, unread, flagged

  const [isConfigOpen, setIsConfigOpen] = useState(false);
  const [isComposeOpen, setIsComposeOpen] = useState(false);
  const [composeInitial, setComposeInitial] = useState({});

  useEffect(() => {
    if (currentUser?.id) {
      loadConfig();
    }
  }, [currentUser]);

  useEffect(() => {
    if (config?.isConfigured) {
      loadMessages();
    }
  }, [config, activeFolder]);

  const loadConfig = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/email/config?userId=${currentUser.id}`);
      const data = await res.json();
      setConfig(data);
    } catch (e) {
      console.error('Error fetching email config:', e);
    }
  };

  const loadMessages = async () => {
    if (!currentUser?.id) return;
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/email/messages?userId=${currentUser.id}&folder=${encodeURIComponent(activeFolder)}&limit=40`);
      const data = await res.json();
      if (Array.isArray(data)) {
        setMessages(data);
      } else {
        setMessages([]);
      }
    } catch (e) {
      console.error('Error loading messages:', e);
      toast.error('Error al obtener correos del servidor.');
    } finally {
      setLoading(false);
    }
  };

  const handleSelectMessage = async (msg) => {
    setSelectedMessage(msg);
    setLoadingDetails(true);
    setMessageDetails(null);

    // Optimistically mark as seen
    setMessages(prev => prev.map(m => m.uid === msg.uid ? { ...m, isSeen: true } : m));

    try {
      const res = await fetch(`${API_BASE_URL}/api/email/messages/${msg.uid}?userId=${currentUser.id}&folder=${encodeURIComponent(activeFolder)}`);
      const data = await res.json();
      if (res.ok) {
        setMessageDetails(data);
      } else {
        toast.error('No se pudo cargar el contenido del correo');
      }
    } catch (e) {
      toast.error('Error de red al cargar el mensaje');
    } finally {
      setLoadingDetails(false);
    }
  };

  const handleToggleStar = async (e, msg) => {
    e.stopPropagation();
    const nextFlag = !msg.isFlagged;
    setMessages(prev => prev.map(m => m.uid === msg.uid ? { ...m, isFlagged: nextFlag } : m));
    try {
      await fetch(`${API_BASE_URL}/api/email/messages/${msg.uid}/flags`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: currentUser.id,
          folder: activeFolder,
          flag: '\\Flagged',
          add: nextFlag
        })
      });
    } catch (e) {}
  };

  const handleDeleteMessage = async (e, msg) => {
    if (e) e.stopPropagation();
    if (!window.confirm('¿Deseas eliminar este correo?')) return;

    try {
      const res = await fetch(`${API_BASE_URL}/api/email/messages/${msg.uid}?userId=${currentUser.id}&folder=${encodeURIComponent(activeFolder)}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        toast.success('Correo eliminado');
        setMessages(prev => prev.filter(m => m.uid !== msg.uid));
        if (selectedMessage?.uid === msg.uid) {
          setSelectedMessage(null);
          setMessageDetails(null);
        }
      }
    } catch (e) {
      toast.error('Error al eliminar correo');
    }
  };

  const handleReply = () => {
    if (!messageDetails) return;
    setComposeInitial({
      initialTo: messageDetails.from?.[0]?.address || '',
      initialSubject: messageDetails.subject.startsWith('Re:') ? messageDetails.subject : `Re: ${messageDetails.subject}`,
      initialBody: `\n\n--- Mensaje Original ---\nDe: ${messageDetails.from?.[0]?.name} <${messageDetails.from?.[0]?.address}>\nFecha: ${messageDetails.date}\nAsunto: ${messageDetails.subject}\n\n${messageDetails.text || ''}`
    });
    setIsComposeOpen(true);
  };

  const handleForward = () => {
    if (!messageDetails) return;
    setComposeInitial({
      initialTo: '',
      initialSubject: messageDetails.subject.startsWith('Fwd:') ? messageDetails.subject : `Fwd: ${messageDetails.subject}`,
      initialBody: `\n\n--- Mensaje Reenviado ---\nDe: ${messageDetails.from?.[0]?.name} <${messageDetails.from?.[0]?.address}>\nFecha: ${messageDetails.date}\nAsunto: ${messageDetails.subject}\n\n${messageDetails.text || ''}`
    });
    setIsComposeOpen(true);
  };

  const openRoundcubeWebmail = () => {
    window.open('https://box5644.bluehost.com:2096', '_blank', 'noopener,noreferrer');
  };

  const unreadCount = messages.filter(m => !m.isSeen).length;

  const filteredMessages = messages.filter(m => {
    const matchesSearch = !searchTerm ||
      m.subject.toLowerCase().includes(searchTerm.toLowerCase()) ||
      m.from.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      m.from.address.toLowerCase().includes(searchTerm.toLowerCase());

    if (!matchesSearch) return false;
    if (filterType === 'unread') return !m.isSeen;
    if (filterType === 'flagged') return m.isFlagged;
    return true;
  });

  return (
    <div>
      {/* Top Header */}
      <div className="topbar" style={{ marginBottom: '1rem' }}>
        <div>
          <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Mail size={24} style={{ color: 'var(--color-primary)' }} /> Correo Corporativo
          </h1>
          <p style={{ color: 'var(--color-text-light)', fontSize: '0.875rem' }}>
            Bandeja de entrada empresarial sincronizada en tiempo real con cPanel y Roundcube.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.65rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <button
            type="button"
            className="btn btn-outline"
            onClick={openRoundcubeWebmail}
            title="Abrir el portal oficial de Roundcube Webmail en una nueva pestaña"
          >
            <ExternalLink size={16} /> Abrir Roundcube Webmail
          </button>
          
          <button
            type="button"
            className="btn btn-outline"
            onClick={() => setIsConfigOpen(true)}
            title="Configurar credenciales y servidores de correo"
          >
            <Settings size={16} /> Configuración de Cuenta
          </button>

          <button
            type="button"
            className="btn btn-primary"
            onClick={() => { setComposeInitial({}); setIsComposeOpen(true); }}
            disabled={!config?.isConfigured}
          >
            <Plus size={18} /> Redactar Correo
          </button>
        </div>
      </div>

      {/* Main Mail Container */}
      {!config?.isConfigured ? (
        <div className="card" style={{ textAlign: 'center', padding: '3.5rem 2rem', margin: '1.5rem auto', maxWidth: '600px' }}>
          <div style={{ width: '64px', height: '64px', borderRadius: '50%', backgroundColor: 'rgba(59, 130, 246, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1.25rem', color: 'var(--color-primary)' }}>
            <Mail size={32} />
          </div>
          <h2 style={{ fontSize: '1.3rem', color: 'var(--color-text)', marginBottom: '0.5rem' }}>
            Configura tu Correo Corporativo
          </h2>
          <p style={{ color: 'var(--color-text-light)', fontSize: '0.9rem', marginBottom: '1.5rem', lineHeight: '1.6' }}>
            Para ver tus correos dentro del sistema, ingresa tu cuenta empresarial y contraseña de cPanel / Bluehost.
          </p>
          <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center' }}>
            <button className="btn btn-primary" onClick={() => setIsConfigOpen(true)}>
              <Settings size={18} /> Configurar Cuenta Ahora
            </button>
            <button className="btn btn-outline" onClick={openRoundcubeWebmail}>
              <ExternalLink size={18} /> Abrir Webmail Externo
            </button>
          </div>
        </div>
      ) : (
        <div className="card" style={{ padding: 0, overflow: 'hidden', height: 'calc(100vh - 170px)', minHeight: '560px', display: 'flex' }}>
          {/* Column 1: Folder Sidebar */}
          <div style={{ width: '220px', borderRight: '1px solid var(--color-border)', backgroundColor: 'var(--color-bg)', display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
            {/* Account Info Pill */}
            <div style={{ padding: '0.85rem 1rem', borderBottom: '1px solid var(--color-border)' }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--color-text-light)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.2rem' }}>
                Cuenta en Sesión
              </div>
              <div style={{ fontWeight: '600', fontSize: '0.85rem', color: 'var(--color-text)', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }} title={config.email}>
                {config.email}
              </div>
            </div>

            {/* Folders Navigation */}
            <nav style={{ padding: '0.5rem', display: 'flex', flexDirection: 'column', gap: '0.2rem', flex: 1 }}>
              {FOLDERS.map(f => {
                const IconComponent = f.icon;
                const isActive = activeFolder === f.id;
                return (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => { setActiveFolder(f.id); setSelectedMessage(null); setMessageDetails(null); }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '0.55rem 0.75rem',
                      borderRadius: 'var(--radius)',
                      border: 'none',
                      backgroundColor: isActive ? 'var(--color-primary)' : 'transparent',
                      color: isActive ? '#ffffff' : 'var(--color-text)',
                      fontWeight: isActive ? '600' : 'normal',
                      fontSize: '0.85rem',
                      cursor: 'pointer',
                      transition: 'var(--transition)'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                      <IconComponent size={17} />
                      <span>{f.name}</span>
                    </div>
                    {f.id === 'INBOX' && unreadCount > 0 && (
                      <span style={{
                        backgroundColor: isActive ? 'rgba(255,255,255,0.25)' : 'var(--color-primary)',
                        color: '#ffffff',
                        fontSize: '0.7rem',
                        padding: '1px 6px',
                        borderRadius: '10px',
                        fontWeight: 'bold'
                      }}>
                        {unreadCount}
                      </span>
                    )}
                  </button>
                );
              })}
            </nav>

            {/* Bottom Refresh */}
            <div style={{ padding: '0.75rem', borderTop: '1px solid var(--color-border)' }}>
              <button
                type="button"
                className="btn btn-outline"
                onClick={loadMessages}
                disabled={loading}
                style={{ width: '100%', fontSize: '0.8rem', padding: '0.4rem', justifyContent: 'center' }}
              >
                <RefreshCw size={14} className={loading ? 'spin' : ''} />
                <span>{loading ? 'Sincronizando...' : 'Actualizar Bandeja'}</span>
              </button>
            </div>
          </div>

          {/* Column 2: Message List */}
          <div style={{
            width: selectedMessage ? '340px' : 'calc(100% - 220px)',
            borderRight: selectedMessage ? '1px solid var(--color-border)' : 'none',
            display: 'flex',
            flexDirection: 'column',
            flexShrink: 0,
            transition: 'width 0.2s ease'
          }}>
            {/* Search & Filter Bar */}
            <div style={{ padding: '0.75rem', borderBottom: '1px solid var(--color-border)', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <div style={{ position: 'relative' }}>
                <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-light)' }} />
                <input
                  type="text"
                  className="form-input"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Buscar remitente o asunto..."
                  style={{ paddingLeft: '1.9rem', padding: '0.35rem 0.6rem 0.35rem 1.9rem', fontSize: '0.8rem', marginBottom: 0 }}
                />
              </div>

              <div style={{ display: 'flex', gap: '0.35rem' }}>
                {[
                  { id: 'all', label: 'Todos' },
                  { id: 'unread', label: 'No leídos' },
                  { id: 'flagged', label: 'Destacados' }
                ].map(tab => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setFilterType(tab.id)}
                    style={{
                      flex: 1,
                      padding: '0.25rem 0.4rem',
                      fontSize: '0.75rem',
                      border: 'none',
                      borderRadius: 'var(--radius)',
                      backgroundColor: filterType === tab.id ? 'var(--color-border)' : 'transparent',
                      color: filterType === tab.id ? 'var(--color-text)' : 'var(--color-text-light)',
                      fontWeight: filterType === tab.id ? '600' : 'normal',
                      cursor: 'pointer'
                    }}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>

            {/* List */}
            <div style={{ flex: 1, overflowY: 'auto' }}>
              {loading && messages.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '3rem 1rem', color: 'var(--color-text-light)' }}>
                  <RefreshCw size={24} className="spin" style={{ margin: '0 auto 0.5rem', color: 'var(--color-primary)' }} />
                  <div style={{ fontSize: '0.85rem' }}>Conectando a {config.imap_host}...</div>
                </div>
              ) : filteredMessages.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '3rem 1rem', color: 'var(--color-text-light)', fontSize: '0.85rem' }}>
                  No hay mensajes en esta carpeta.
                </div>
              ) : (
                filteredMessages.map(msg => {
                  const isSelected = selectedMessage?.uid === msg.uid;
                  return (
                    <div
                      key={msg.uid}
                      onClick={() => handleSelectMessage(msg)}
                      style={{
                        padding: '0.75rem 0.85rem',
                        borderBottom: '1px solid var(--color-border)',
                        backgroundColor: isSelected ? 'rgba(59, 130, 246, 0.12)' : (msg.isSeen ? 'transparent' : 'rgba(59, 130, 246, 0.04)'),
                        cursor: 'pointer',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '0.25rem',
                        position: 'relative',
                        transition: 'background-color 0.15s ease'
                      }}
                    >
                      {/* Unread indicator */}
                      {!msg.isSeen && (
                        <div style={{
                          position: 'absolute',
                          left: '4px',
                          top: '12px',
                          width: '6px',
                          height: '6px',
                          borderRadius: '50%',
                          backgroundColor: 'var(--color-primary)'
                        }}></div>
                      )}

                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingLeft: msg.isSeen ? '0' : '8px' }}>
                        <strong style={{
                          fontSize: '0.85rem',
                          color: msg.isSeen ? 'var(--color-text)' : 'var(--color-primary)',
                          fontWeight: msg.isSeen ? '500' : '700',
                          textOverflow: 'ellipsis',
                          overflow: 'hidden',
                          whiteSpace: 'nowrap',
                          maxWidth: '180px'
                        }}>
                          {msg.from.name || msg.from.address}
                        </strong>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                          <span style={{ fontSize: '0.7rem', color: 'var(--color-text-light)' }}>
                            {formatDate(msg.date)}
                          </span>
                          <button
                            type="button"
                            onClick={(e) => handleToggleStar(e, msg)}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0 2px', color: msg.isFlagged ? '#eab308' : 'var(--color-border)' }}
                          >
                            <Star size={13} fill={msg.isFlagged ? '#eab308' : 'none'} />
                          </button>
                        </div>
                      </div>

                      <div style={{
                        fontSize: '0.8rem',
                        fontWeight: msg.isSeen ? 'normal' : '600',
                        color: 'var(--color-text)',
                        textOverflow: 'ellipsis',
                        overflow: 'hidden',
                        whiteSpace: 'nowrap',
                        paddingLeft: msg.isSeen ? '0' : '8px'
                      }}>
                        {msg.subject}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Column 3: Message Reader Viewer */}
          {selectedMessage && (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, backgroundColor: 'var(--color-card)' }}>
              {loadingDetails ? (
                <div style={{ textAlign: 'center', padding: '4rem 2rem', color: 'var(--color-text-light)' }}>
                  <RefreshCw size={28} className="spin" style={{ margin: '0 auto 0.75rem', color: 'var(--color-primary)' }} />
                  <div>Descargando mensaje desde Roundcube/IMAP...</div>
                </div>
              ) : messageDetails ? (
                <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                  {/* Reader Header */}
                  <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid var(--color-border)', display: 'flex', flexDirection: 'column', gap: '0.75rem', flexShrink: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '1rem' }}>
                      <h2 style={{ fontSize: '1.15rem', fontWeight: '700', margin: 0, color: 'var(--color-text)', lineHeight: 1.3 }}>
                        {messageDetails.subject}
                      </h2>
                      <div style={{ display: 'flex', gap: '0.4rem' }}>
                        <button type="button" className="btn btn-outline" onClick={handleReply} style={{ padding: '0.35rem 0.65rem', fontSize: '0.8rem' }} title="Responder">
                          <Reply size={14} /> Responder
                        </button>
                        <button type="button" className="btn btn-outline" onClick={handleForward} style={{ padding: '0.35rem 0.65rem', fontSize: '0.8rem' }} title="Reenviar">
                          <Forward size={14} /> Reenviar
                        </button>
                        <button type="button" className="btn btn-outline" onClick={() => handleDeleteMessage(null, selectedMessage)} style={{ padding: '0.35rem 0.65rem', fontSize: '0.8rem', color: 'var(--color-danger)' }} title="Eliminar">
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.8rem', color: 'var(--color-text-light)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                        <div style={{ width: '32px', height: '32px', borderRadius: '50%', backgroundColor: 'rgba(59, 130, 246, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-primary)', fontWeight: 'bold' }}>
                          {(messageDetails.from?.[0]?.name || 'U')[0].toUpperCase()}
                        </div>
                        <div>
                          <div style={{ color: 'var(--color-text)', fontWeight: '600' }}>
                            {messageDetails.from?.[0]?.name || messageDetails.from?.[0]?.address}
                          </div>
                          <div style={{ fontSize: '0.75rem' }}>
                            Para: {messageDetails.to?.map(t => t.address || t.name).join(', ')}
                          </div>
                        </div>
                      </div>

                      <div>{formatDate(messageDetails.date)}</div>
                    </div>

                    {/* Attachments bar if any */}
                    {messageDetails.attachments && messageDetails.attachments.length > 0 && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', paddingTop: '0.5rem', borderTop: '1px dashed var(--color-border)' }}>
                        {messageDetails.attachments.map((att, idx) => (
                          <a
                            key={idx}
                            href={att.contentBase64 ? `data:${att.contentType};base64,${att.contentBase64}` : '#'}
                            download={att.filename}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '0.4rem',
                              padding: '0.3rem 0.6rem',
                              borderRadius: 'var(--radius)',
                              backgroundColor: 'var(--color-bg)',
                              border: '1px solid var(--color-border)',
                              fontSize: '0.75rem',
                              color: 'var(--color-primary)',
                              textDecoration: 'none'
                            }}
                          >
                            <Paperclip size={13} />
                            <span>{att.filename}</span>
                            <span style={{ color: 'var(--color-text-light)' }}>({(att.size / 1024).toFixed(1)} KB)</span>
                            <Download size={13} />
                          </a>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Email Body Content */}
                  <div style={{
                    flex: 1,
                    overflowY: 'auto',
                    padding: '1.25rem',
                    backgroundColor: 'var(--color-card)',
                    color: 'var(--color-text)',
                    fontSize: '0.9rem',
                    lineHeight: '1.6'
                  }}>
                    {messageDetails.html ? (
                      <div
                        dangerouslySetInnerHTML={{
                          __html: DOMPurify.sanitize(messageDetails.html)
                        }}
                        style={{ maxWidth: '100%', wordBreak: 'break-word' }}
                      />
                    ) : (
                      <pre style={{
                        fontFamily: 'inherit',
                        whiteSpace: 'pre-wrap',
                        wordBreak: 'break-word',
                        margin: 0,
                        fontSize: '0.9rem'
                      }}>
                        {messageDetails.text}
                      </pre>
                    )}
                  </div>
                </div>
              ) : null}
            </div>
          )}
        </div>
      )}

      {/* Modals */}
      {isConfigOpen && (
        <EmailConfigModal
          userId={currentUser?.id}
          username={currentUser?.username}
          onClose={() => setIsConfigOpen(false)}
          onSaved={() => { loadConfig(); loadMessages(); }}
        />
      )}

      {isComposeOpen && (
        <ComposeEmailModal
          userId={currentUser?.id}
          username={currentUser?.username}
          {...composeInitial}
          onClose={() => setIsComposeOpen(false)}
          onSent={loadMessages}
        />
      )}
    </div>
  );
};

export default EmailClient;
