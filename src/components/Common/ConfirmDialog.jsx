import React, { useEffect, useState, useCallback } from 'react';
import { AlertTriangle, HelpCircle, X } from 'lucide-react';

let listener = null;
const pendingQueue = [];
let activeRequest = null;

const notifyListener = () => {
  if (typeof listener === 'function') {
    listener(activeRequest);
  }
};

const flushNextRequest = () => {
  if (!activeRequest && pendingQueue.length > 0) {
    activeRequest = pendingQueue.shift();
    notifyListener();
  }
};

/**
 * Abre un diálogo modal de confirmación estilo Fluent/Mica y devuelve Promise<boolean>.
 */
export const confirmAction = ({
  title = 'Confirmar acción',
  message = '¿Deseas continuar con esta operación?',
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  variant = 'danger'
} = {}) => {
  if (typeof window === 'undefined' || typeof listener !== 'function') {
    if (typeof window !== 'undefined' && typeof window.confirm === 'function') {
      return Promise.resolve(window.confirm(message));
    }
    return Promise.resolve(false);
  }

  return new Promise((resolve) => {
    pendingQueue.push({
      title,
      message,
      confirmLabel,
      cancelLabel,
      variant,
      resolve
    });
    flushNextRequest();
  });
};

export const ConfirmDialogHost = () => {
  const [request, setRequest] = useState(activeRequest);

  useEffect(() => {
    listener = (nextReq) => {
      setRequest(nextReq);
    };
    flushNextRequest();
    return () => {
      listener = null;
    };
  }, []);

  const finish = useCallback((accepted) => {
    if (!activeRequest) return;
    const current = activeRequest;
    activeRequest = null;
    setRequest(null);
    current.resolve(Boolean(accepted));
    flushNextRequest();
  }, []);

  useEffect(() => {
    if (!request) return undefined;
    const onKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        finish(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [request, finish]);

  if (!request) return null;

  const isDanger = request.variant !== 'primary';

  return (
    <div
      className="modal-overlay"
      onClick={() => finish(false)}
      style={{ zIndex: 1400, padding: '1rem' }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
    >
      <div
        className="modal-content"
        onClick={(e) => e.stopPropagation()}
        style={{
          maxWidth: '460px',
          width: '100%',
          padding: 0,
          overflow: 'hidden',
          backgroundColor: 'var(--color-card)',
          borderRadius: 'var(--radius-xl)',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.4), 0 0 0 1px var(--color-border)'
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '1.1rem 1.35rem',
            borderBottom: '1px solid var(--color-border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '0.75rem',
            background: 'linear-gradient(180deg, var(--color-surface) 0%, var(--color-card) 100%)'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div
              style={{
                width: '38px',
                height: '38px',
                borderRadius: '10px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
                backgroundColor: isDanger ? 'var(--color-danger-bg)' : 'rgba(0, 103, 192, 0.12)',
                color: isDanger ? 'var(--color-danger)' : 'var(--color-primary)'
              }}
            >
              {isDanger ? <AlertTriangle size={20} /> : <HelpCircle size={20} />}
            </div>
            <h3
              id="confirm-dialog-title"
              style={{
                margin: 0,
                fontSize: '1.05rem',
                fontWeight: 700,
                fontFamily: 'var(--font-headline)',
                color: 'var(--color-text)'
              }}
            >
              {request.title}
            </h3>
          </div>

          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => finish(false)}
            aria-label="Cerrar confirmación"
            style={{
              width: '32px',
              height: '32px',
              padding: 0,
              borderRadius: '50%',
              border: '1px solid var(--color-border)'
            }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div
          style={{
            padding: '1.15rem 1.35rem',
            fontSize: '0.9rem',
            lineHeight: 1.55,
            color: 'var(--color-text-light)',
            whiteSpace: 'pre-line'
          }}
        >
          {request.message}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: '0.9rem 1.35rem',
            borderTop: '1px solid var(--color-border)',
            backgroundColor: 'var(--color-surface)',
            display: 'flex',
            justifyContent: 'flex-end',
            gap: '0.6rem',
            flexWrap: 'wrap'
          }}
        >
          <button
            type="button"
            className="btn btn-outline"
            onClick={() => finish(false)}
          >
            {request.cancelLabel}
          </button>
          <button
            type="button"
            className={`btn ${isDanger ? 'btn-danger' : 'btn-primary'}`}
            onClick={() => finish(true)}
            autoFocus
          >
            {request.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConfirmDialogHost;
