import React, { useEffect, useRef } from 'react';
import toast from 'react-hot-toast';
import { RefreshCw, Sparkles, X, ArrowUpCircle } from 'lucide-react';

const CURRENT_COMMIT = import.meta.env.VITE_APP_VERSION;
const CURRENT_BUILD = Number(import.meta.env.VITE_APP_BUILD_NUMBER) || 0;

export const UpdateNotifier = () => {
  const isToastActiveRef = useRef(false);
  const snoozedUntilRef = useRef(0);

  const triggerUpdate = () => {
    // Tell active service workers to skip waiting if any
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistration().then(reg => {
        if (reg?.waiting) {
          reg.waiting.postMessage({ type: 'SKIP_WAITING' });
        }
      });
    }
    // Perform fresh reload from network
    window.location.reload();
  };

  const showUpdateToast = (serverData) => {
    // If user snoozed it recently, skip until time passes
    if (Date.now() < snoozedUntilRef.current) return;
    if (isToastActiveRef.current) return;

    isToastActiveRef.current = true;

    toast.custom(
      (t) => (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '0.75rem',
            maxWidth: '380px',
            width: '100%',
            background: 'var(--color-card)',
            color: 'var(--color-text)',
            padding: '1.2rem',
            borderRadius: 'var(--radius-lg)',
            boxShadow: '0 16px 40px rgba(0, 0, 0, 0.35)',
            border: '1px solid var(--color-primary)',
            position: 'relative',
            animation: t.visible ? 'fadeIn 0.25s ease' : 'none'
          }}
        >
          {/* Header Tag & Close */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div className="version-pill-badge" style={{ padding: '0.15rem 0.55rem 0.15rem 0.25rem' }}>
              <span className="version-pill-tag" style={{ fontSize: '0.6rem', padding: '0.12rem 0.45rem' }}>NUEVA</span>
              <span className="version-pill-number" style={{ fontSize: '0.75rem' }}>
                {serverData.numeric || `v2.5.${serverData.build || ''}`}
              </span>
            </div>

            <button
              onClick={() => {
                isToastActiveRef.current = false;
                snoozedUntilRef.current = Date.now() + 10 * 60 * 1000; // Snooze 10 min
                toast.dismiss(t.id);
              }}
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--color-text-muted)',
                cursor: 'pointer',
                padding: '0.2rem',
                display: 'flex'
              }}
              title="Cerrar aviso"
            >
              <X size={16} />
            </button>
          </div>

          {/* Title & Description */}
          <div>
            <h4 className="font-headline" style={{ fontSize: '1rem', fontWeight: '700', margin: 0, color: 'var(--color-text)' }}>
              Nueva versión disponible
            </h4>
            <p style={{ fontSize: '0.8rem', color: 'var(--color-text-light)', marginTop: '0.3rem', lineHeight: '1.4' }}>
              Se ha publicado una actualización en el servidor ({serverData.commit ? `#${serverData.commit}` : 'reciente'}). Actualiza para disfrutar de las últimas mejoras y correcciones.
            </p>
          </div>

          {/* Action Buttons */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.25rem' }}>
            <button
              onClick={() => {
                toast.dismiss(t.id);
                triggerUpdate();
              }}
              className="btn btn-primary"
              style={{
                flex: 1,
                padding: '0.5rem 0.75rem',
                fontSize: '0.825rem',
                fontWeight: '600',
                borderRadius: 'var(--radius)'
              }}
            >
              <RefreshCw size={14} />
              <span>Actualizar Ahora</span>
            </button>

            <button
              onClick={() => {
                isToastActiveRef.current = false;
                snoozedUntilRef.current = Date.now() + 10 * 60 * 1000;
                toast.dismiss(t.id);
              }}
              className="btn btn-ghost"
              style={{
                padding: '0.5rem 0.75rem',
                fontSize: '0.825rem',
                borderRadius: 'var(--radius)'
              }}
            >
              Más tarde
            </button>
          </div>
        </div>
      ),
      {
        id: 'app-version-update',
        duration: Infinity, // Keep until user acts or dismisses
        position: 'bottom-right'
      }
    );
  };

  const checkVersionFromServer = async () => {
    try {
      // Fetch version.json without cache
      const res = await fetch(`/version.json?_t=${Date.now()}`, {
        cache: 'no-store',
        headers: { 'Cache-Control': 'no-cache' }
      });
      if (!res.ok) return;

      const data = await res.json();
      if (!data || !data.commit) return;

      const serverBuild = Number(data.build) || 0;
      const isNewCommit = CURRENT_COMMIT && data.commit !== CURRENT_COMMIT && data.commit !== 'local';
      const isNewBuild = serverBuild > 0 && CURRENT_BUILD > 0 && serverBuild > CURRENT_BUILD;

      if (isNewCommit || isNewBuild) {
        showUpdateToast(data);
      }
    } catch {
      // Silent error if offline or server temporarily unavailable
    }
  };

  useEffect(() => {
    // 1. Initial check on mount
    checkVersionFromServer();

    // 2. Periodic poll every 2 minutes (120,000ms)
    const interval = setInterval(checkVersionFromServer, 120000);

    // 3. Check whenever user returns to the tab/window
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        checkVersionFromServer();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    // 4. Service Worker update listener
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistration().then(reg => {
        if (!reg) return;
        reg.onupdatefound = () => {
          const installingWorker = reg.installing;
          if (installingWorker) {
            installingWorker.onstatechange = () => {
              if (installingWorker.state === 'installed' && navigator.serviceWorker.controller) {
                checkVersionFromServer();
              }
            };
          }
        };
      });
    }

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  return null; // Headless component
};

export default UpdateNotifier;
