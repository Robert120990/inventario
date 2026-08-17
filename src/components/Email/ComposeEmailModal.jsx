import React, { useState } from 'react';
import { Send, X, Paperclip, Trash2, RefreshCw, FileText } from 'lucide-react';
import { toast } from 'react-hot-toast';

const API_BASE_URL = import.meta.env.VITE_API_URL || '';

const ComposeEmailModal = ({ userId, username, initialTo = '', initialSubject = '', initialBody = '', onClose, onSent }) => {
  const [to, setTo] = useState(initialTo);
  const [cc, setCc] = useState('');
  const [showCc, setShowCc] = useState(false);
  const [subject, setSubject] = useState(initialSubject);
  const [body, setBody] = useState(initialBody);
  const [attachments, setAttachments] = useState([]);
  const [sending, setSending] = useState(false);

  const handleFileChange = (e) => {
    const files = Array.from(e.target.files);
    files.forEach(file => {
      const reader = new FileReader();
      reader.onload = (evt) => {
        const base64 = evt.target.result.split(',')[1];
        setAttachments(prev => [...prev, {
          filename: file.name,
          contentType: file.type || 'application/octet-stream',
          size: file.size,
          contentBase64: base64
        }]);
      };
      reader.readAsDataURL(file);
    });
  };

  const removeAttachment = (index) => {
    setAttachments(prev => prev.filter((_, i) => i !== index));
  };

  const handleSend = async (e) => {
    e.preventDefault();
    if (!to.trim()) {
      toast.error('Ingresa al menos un destinatario.');
      return;
    }
    if (!subject.trim()) {
      toast.error('Ingresa el asunto del correo.');
      return;
    }

    setSending(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/email/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          to: to.trim(),
          cc: cc.trim() || undefined,
          subject: subject.trim(),
          text: body,
          html: `<div style="font-family: sans-serif; font-size: 14px; line-height: 1.6; color: #333;">${body.replace(/\n/g, '<br/>')}</div>`,
          attachments,
          auditUser: username
        })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        toast.success('Correo enviado correctamente');
        if (onSent) onSent();
        onClose();
      } else {
        toast.error(data.error || 'Error al enviar el correo');
      }
    } catch (err) {
      toast.error('Error de conexión al enviar correo');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content large" style={{ maxWidth: '680px', width: '95%', display: 'flex', flexDirection: 'column' }}>
        <div className="topbar" style={{ marginBottom: '1rem', borderBottom: '1px solid var(--color-border)', paddingBottom: '0.75rem', flexShrink: 0 }}>
          <div>
            <h2 style={{ fontSize: '1.25rem', color: 'var(--color-primary)', display: 'flex', alignItems: 'center', gap: '0.5rem', margin: 0 }}>
              <Send size={20} /> Redactar Correo
            </h2>
          </div>
          <button type="button" className="btn btn-outline" onClick={onClose} style={{ padding: '0.25rem' }}>
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSend} style={{ display: 'flex', flexDirection: 'column', flex: 1, gap: '0.85rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <label style={{ width: '70px', fontSize: '0.85rem', color: 'var(--color-text-light)', fontWeight: '600' }}>Para:</label>
            <input
              type="text"
              className="form-input"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              placeholder="destinatario@empresa.com"
              style={{ flex: 1, marginBottom: 0 }}
              required
            />
            {!showCc && (
              <button type="button" className="btn btn-outline" onClick={() => setShowCc(true)} style={{ fontSize: '0.75rem', padding: '0.35rem 0.6rem' }}>
                CC
              </button>
            )}
          </div>

          {showCc && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <label style={{ width: '70px', fontSize: '0.85rem', color: 'var(--color-text-light)', fontWeight: '600' }}>CC:</label>
              <input
                type="text"
                className="form-input"
                value={cc}
                onChange={(e) => setCc(e.target.value)}
                placeholder="copia@empresa.com"
                style={{ flex: 1, marginBottom: 0 }}
              />
            </div>
          )}

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <label style={{ width: '70px', fontSize: '0.85rem', color: 'var(--color-text-light)', fontWeight: '600' }}>Asunto:</label>
            <input
              type="text"
              className="form-input"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Asunto del mensaje..."
              style={{ flex: 1, marginBottom: 0, fontWeight: '600' }}
              required
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
            <textarea
              className="form-input"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Escribe tu mensaje aquí..."
              style={{ minHeight: '220px', resize: 'vertical', fontFamily: 'inherit', lineHeight: '1.5', padding: '0.75rem' }}
              required
            />
          </div>

          {/* Attachments List */}
          {attachments.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
              {attachments.map((att, idx) => (
                <div key={idx} style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.4rem',
                  padding: '0.3rem 0.6rem',
                  borderRadius: 'var(--radius)',
                  backgroundColor: 'var(--color-bg)',
                  border: '1px solid var(--color-border)',
                  fontSize: '0.75rem'
                }}>
                  <FileText size={13} style={{ color: 'var(--color-primary)' }} />
                  <span style={{ maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{att.filename}</span>
                  <span style={{ color: 'var(--color-text-light)' }}>({(att.size / 1024).toFixed(1)} KB)</span>
                  <button type="button" onClick={() => removeAttachment(idx)} style={{ background: 'none', border: 'none', color: 'var(--color-danger)', cursor: 'pointer', padding: '0 2px' }}>
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Footer Controls */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid var(--color-border)', paddingTop: '0.75rem' }}>
            <div>
              <input
                type="file"
                id="email-attach-input"
                multiple
                onChange={handleFileChange}
                style={{ display: 'none' }}
              />
              <label htmlFor="email-attach-input" className="btn btn-outline" style={{ cursor: 'pointer', fontSize: '0.8rem', padding: '0.35rem 0.75rem' }}>
                <Paperclip size={15} /> Adjuntar Archivo
              </label>
            </div>

            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button type="button" className="btn btn-outline" onClick={onClose} disabled={sending}>
                Cancelar
              </button>
              <button type="submit" className="btn btn-primary" disabled={sending}>
                {sending ? <RefreshCw size={16} className="spin" /> : <Send size={16} />}
                {sending ? 'Enviando...' : 'Enviar Correo'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ComposeEmailModal;
