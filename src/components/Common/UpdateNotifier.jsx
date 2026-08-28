import React, { useEffect, useRef } from 'react';
import toast from 'react-hot-toast';
import { RefreshCw, Sparkles, X, ArrowUpCircle } from 'lucide-react';
import { APP_COMMIT_HASH, APP_BUILD_NUMBER, APP_DISPLAY_VERSION } from '../../config/version';

const CURRENT_COMMIT = APP_COMMIT_HASH;
const CURRENT_BUILD = Number(APP_BUILD_NUMBER) || 0;

export const UpdateNotifier = () => {
  const isToastActiveRef = useRef(false);
  const snoozedUntilRef = useRef(0);

  const triggerUpdate = async () => {
    toast.loading('Actualizando a la última versión...', { id: 'app-updating' });

    // 1. Purge Cache Storage
    if (typeof window !== 'undefined' && 'caches' in window) {
      try {
        const cacheNames = await caches.keys();
        await Promise.all(cacheNames.map(name => caches.delete(name)));
      } catch (e) {}
    }

    // 2. Unregister all service workers
    if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
      try {
        const registrations = await navigator.serviceWorker.getRegistrations();
        for (let reg of registrations) {
          await reg.unregister();
        }
      } catch (e) {}
    }

    // 3. Clear version check storage markers
    try {
      sessionStorage.clear();
    } catch (e) {}

    // 4. Force hard reload from server with timestamp param to invalidate browser disk cache
    setTimeout(() => {
      const cleanPath = window.location.origin + window.location.pathname;
      const targetUrl = `${cleanPath}?_reload=${Date.now()}${window.location.hash || ''}`;
      window.location.replace(targetUrl);
    }, 400);
  };

  const showUpdateToast = (serverData) => {
    // If user snoozed it recently, skip until time passes
    if (Date.now() < snoozedUntilRef.current) return;
    if (isToastActiveRef.current) return;

    isToastActiveRef.current = true;

    const newVersionStr = serverData.displayVersion || (serverData.version ? `v${serverData.version}` : serverData.numeric) || 'Actualización';

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
            boxShadow: '0 16px 40px rgba(0, 0, 0, 0.45)',
            border: '1px solid var(--color-primary)',
            position: 'relative',
            animation: t.visible ? 'fadeIn 0.25s ease' : 'none'
          }}
        >
          {/* Header Tag & Close */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div className="version-pill-badge" style={{ padding: '0.2rem 0.65rem', border: '1px solid rgba(255, 255, 255, 0.15)' }}>
              <Sparkles size={14} style={{ color: 'var(--color-primary)' }} />
              <span className="version-pill-number" style={{ fontSize: '0.75rem' }}>
                {newVersionStr}
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
              Actualización disponible
            </h4>
            <p style={{ fontSize: '0.8rem', color: 'var(--color-text-light)', marginTop: '0.3rem', lineHeight: '1.4' }}>
              Se ha publicado una nueva versión en el servidor ({serverData.commit ? `#${serverData.commit}` : 'reciente'}). Actualiza para aplicar las últimas mejoras.
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

  const checkVersionFromServer = async (isManual = false) => {
    try {
      // 1. Try static version.json
      let data = null;
      try {
        const res = await fetch(`/version.json?_t=${Date.now()}`, {
          cache: 'no-store',
          headers: { 'Cache-Control': 'no-cache, no-store, must-revalidate', 'Pragma': 'no-cache' }
        });
        if (res.ok) {
          data = await res.json();
        }
      } catch (e) {}

      // 2. Fallback to API /api/version if static not found
      if (!data) {
        try {
          const apiRes = await fetch(`/api/version?_t=${Date.now()}`, {
            cache: 'no-store',
            headers: { 'Cache-Control': 'no-cache, no-store, must-revalidate', 'Pragma': 'no-cache' }
          });
          if (apiRes.ok) {
            data = await apiRes.json();
          }
        } catch (e) {}
      }

      if (!data) return;

      const serverBuild = Number(data.build) || 0;
      const isNewCommit = CURRENT_COMMIT && data.commit && data.commit !== CURRENT_COMMIT && data.commit !== 'local';
      const isNewBuild = serverBuild > 0 && CURRENT_BUILD > 0 && serverBuild > CURRENT_BUILD;
      const isNewVersion = data.version && data.version !== APP_DISPLAY_VERSION.replace('v', '') && !data.version.startsWith('1.3.10');

      if (isNewCommit || isNewBuild || (isNewVersion && serverBuild >= CURRENT_BUILD)) {
        showUpdateToast(data);
      } else if (isManual) {
        toast.success(`Estás en la última versión (${APP_DISPLAY_VERSION})`);
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

    // 4. Custom listener for manual check
    const handleManualCheck = () => checkVersionFromServer(true);
    window.addEventListener('check-app-update', handleManualCheck);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('check-app-update', handleManualCheck);
    };
  }, []);

  return null; // Headless component
};

export default UpdateNotifier;

