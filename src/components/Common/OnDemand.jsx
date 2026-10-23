import React, { useState, useEffect, useRef } from 'react';
import {
  WifiOff,
  ServerCrash,
  RefreshCw,
  CloudUpload,
  CheckCircle2,
  AlertTriangle,
  Database,
  Trash2,
  Download,
  Upload,
  X,
  Clock,
  ChevronRight
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { useInventory } from '../../context/InventoryContext';
import { formatDate } from '../../utils/formatUtils';

/**
 * Función / Componente OnDemand
 * Muestra un banner interactivo cuando no hay conexión a internet, cuando la página/servidor
 * no es accesible o cuando existen cambios guardados localmente pendientes de compartir
 * con la página web al regresar el internet.
 */
export function OnDemand() {
  const {
    onDemandStatus,
    offlineQueue,
    syncOnDemandNow,
    checkOnDemandConnection,
    removeOfflineQueueItem,
    clearAllOfflineQueue,
    importOfflineQueueItems
  } = useInventory();

  const [detailsOpen, setDetailsOpen] = useState(false);
  const [syncProgress, setSyncProgress] = useState(null);
  const [recentSyncBanner, setRecentSyncBanner] = useState(null);
  const fileInputRef = useRef(null);

  const isOnline = onDemandStatus?.isOnline !== false;
  const isAccessible = onDemandStatus?.isPageAccessible !== false;
  const dbConnected = onDemandStatus?.dbConnected !== false;
  const isSyncing = Boolean(onDemandStatus?.isSyncing);
  const pendingCount = Array.isArray(offlineQueue) ? offlineQueue.length : 0;
  const conflictCount = Array.isArray(offlineQueue)
    ? offlineQueue.filter(item => item.status === 'conflict').length
    : 0;

  const isOfflineOrUnreachable = !isOnline || !isAccessible || !dbConnected;

  // Escuchar eventos de sincronización automática completada para mostrar confirmación
  useEffect(() => {
    const handleSyncDone = (e) => {
      const { syncedCount } = e.detail || {};
      if (syncedCount > 0) {
        setRecentSyncBanner({
          count: syncedCount,
          timestamp: new Date().toLocaleTimeString()
        });
        const timer = setTimeout(() => setRecentSyncBanner(null), 7000);
        return () => clearTimeout(timer);
      }
    };
    window.addEventListener('ondemand:sync-complete', handleSyncDone);
    return () => window.removeEventListener('ondemand:sync-complete', handleSyncDone);
  }, []);

  const handleManualSync = async () => {
    setSyncProgress({ current: 0, total: pendingCount });
    try {
      const res = await syncOnDemandNow((prog) => setSyncProgress(prog));
      if (res?.offline) {
        toast.error('Aún no hay conexión con el servidor web. Tus datos siguen seguros en OnDemand.');
      } else if (res?.syncedCount > 0) {
        toast.success(`¡OnDemand sincronizó ${res.syncedCount} operación(es) con la página web!`);
        setRecentSyncBanner({
          count: res.syncedCount,
          timestamp: new Date().toLocaleTimeString()
        });
        setTimeout(() => setRecentSyncBanner(null), 7000);
      } else if (res?.failedCount > 0) {
        toast.error(`Se encontraron ${res.failedCount} conflicto(s) al sincronizar. Revisa el detalle en OnDemand.`);
        setDetailsOpen(true);
      } else {
        toast.success('Conexión verificada. Todo está sincronizado con la página web.');
      }
    } finally {
      setSyncProgress(null);
    }
  };

  const handleCheckConnection = async () => {
    const status = await checkOnDemandConnection();
    if (status.isOnline && status.isPageAccessible && status.dbConnected) {
      toast.success('¡Conexión restablecida con la página web!');
      if (pendingCount > 0) {
        await handleManualSync();
      }
    } else {
      toast.error(status.lastError || 'Aún sin acceso a internet o al servidor web.');
    }
  };

  const handleExportQueue = () => {
    if (pendingCount === 0) {
      toast.error('No hay operaciones pendientes para exportar.');
      return;
    }
    const payload = {
      type: 'INVENTARIO_ONDEMAND_SYNC_PACKAGE',
      exportedAt: new Date().toISOString(),
      operations: offlineQueue
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ondemand-cambios-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success('Paquete OnDemand descargado correctamente.');
  };

  const handleImportQueueFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const parsed = JSON.parse(evt.target.result);
        const ops = Array.isArray(parsed?.operations) ? parsed.operations : (Array.isArray(parsed) ? parsed : null);
        if (!ops || ops.length === 0) {
          toast.error('El archivo no contiene operaciones OnDemand válidas.');
          return;
        }
        const added = importOfflineQueueItems(ops);
        toast.success(`Se importaron ${added} operación(es) a la cola OnDemand.`);
      } catch {
        toast.error('Error al leer el archivo JSON de OnDemand.');
      } finally {
        e.target.value = '';
      }
    };
    reader.readAsText(file);
  };

  // Si todo está conectado, sin cola pendiente y sin banner reciente ni modal abierto, no ocupar espacio
  if (!isOfflineOrUnreachable && pendingCount === 0 && !recentSyncBanner && !detailsOpen) {
    return null;
  }

  // Configuración visual según estado
  let bannerBg = 'linear-gradient(90deg, #b45309 0%, #d97706 100%)';
  let bannerBorder = '#f59e0b';
  let StatusIcon = WifiOff;
  let titleText = 'Modo OnDemand Activo · Sin Conexión a Internet';
  let subtitleText = 'Puedes seguir registrando movimientos, productos, conteos y cortes sin internet. Se guardarán en este equipo y se compartirán con la página web automáticamente al recuperar la señal.';

  if (isOnline && (!isAccessible || !dbConnected)) {
    bannerBg = 'linear-gradient(90deg, #9a3412 0%, #ea580c 100%)';
    bannerBorder = '#fb923c';
    StatusIcon = ServerCrash;
    titleText = !isAccessible
      ? 'Modo OnDemand Activo · La página o el servidor no es accesible'
      : 'Modo OnDemand Activo · Base de datos remota no disponible';
    subtitleText = `${onDemandStatus?.lastError || 'El servidor no responde.'} Operando con caché local segura; tus cambios se sincronizarán en cuanto el servidor vuelva a estar en línea.`;
  } else if (!isOfflineOrUnreachable && pendingCount > 0) {
    bannerBg = conflictCount > 0
      ? 'linear-gradient(90deg, #991b1b 0%, #dc2626 100%)'
      : 'linear-gradient(90deg, #1e40af 0%, #2563eb 100%)';
    bannerBorder = conflictCount > 0 ? '#f87171' : '#60a5fa';
    StatusIcon = conflictCount > 0 ? AlertTriangle : CloudUpload;
    titleText = isSyncing
      ? `Sincronizando OnDemand con la página web (${syncProgress?.current || 1}/${syncProgress?.total || pendingCount})...`
      : conflictCount > 0
        ? `OnDemand · ${conflictCount} operación(es) requieren revisión para sincronizar`
        : `Conexión Restablecida · ${pendingCount} cambio(s) listos para compartir con la página web`;
    subtitleText = isSyncing
      ? 'Enviando operaciones almacenadas localmente hacia el servidor central...'
      : 'Haz clic en "Compartir Ahora" para subir inmediatamente los registros capturados sin internet.';
  } else if (recentSyncBanner) {
    bannerBg = 'linear-gradient(90deg, #065f46 0%, #059669 100%)';
    bannerBorder = '#34d399';
    StatusIcon = CheckCircle2;
    titleText = `OnDemand · ¡Sincronización completada (${recentSyncBanner.count} cambio(s) compartidos)!`;
    subtitleText = `Todos los datos capturados sin internet fueron enviados y actualizados en la página web a las ${recentSyncBanner.timestamp}.`;
  }

  return (
    <>
      <div
        role="region"
        aria-label="Estado de conectividad OnDemand"
        style={{
          background: bannerBg,
          color: '#ffffff',
          borderBottom: `2px solid ${bannerBorder}`,
          padding: '0.65rem 1.15rem',
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '0.75rem',
          boxShadow: '0 4px 12px rgba(0, 0, 0, 0.18)',
          zIndex: 999,
          position: 'sticky',
          top: 0
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flex: '1 1 320px' }}>
          <div
            style={{
              width: '36px',
              height: '36px',
              borderRadius: '8px',
              backgroundColor: 'rgba(255, 255, 255, 0.18)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0
            }}
          >
            <StatusIcon size={20} className={isSyncing ? 'spin-icon' : ''} />
          </div>
          <div style={{ lineHeight: 1.35 }}>
            <div style={{ fontWeight: 700, fontSize: '0.88rem', display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
              <span>{titleText}</span>
              {pendingCount > 0 && (
                <span
                  style={{
                    backgroundColor: 'rgba(0, 0, 0, 0.28)',
                    padding: '0.1rem 0.5rem',
                    borderRadius: '999px',
                    fontSize: '0.73rem',
                    fontWeight: 600
                  }}
                >
                  {pendingCount} en cola local
                </span>
              )}
            </div>
            <div style={{ fontSize: '0.77rem', opacity: 0.92, marginTop: '0.15rem' }}>
              {subtitleText}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
          {isOfflineOrUnreachable ? (
            <button
              type="button"
              onClick={handleCheckConnection}
              style={{
                backgroundColor: '#ffffff',
                color: '#0f172a',
                border: 'none',
                borderRadius: '6px',
                padding: '0.4rem 0.8rem',
                fontSize: '0.78rem',
                fontWeight: 700,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.35rem'
              }}
            >
              <RefreshCw size={14} /> Reintentar Conexión
            </button>
          ) : pendingCount > 0 ? (
            <button
              type="button"
              disabled={isSyncing}
              onClick={handleManualSync}
              style={{
                backgroundColor: '#ffffff',
                color: '#1e3a8a',
                border: 'none',
                borderRadius: '6px',
                padding: '0.4rem 0.85rem',
                fontSize: '0.78rem',
                fontWeight: 700,
                cursor: isSyncing ? 'wait' : 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.35rem'
              }}
            >
              <CloudUpload size={15} />
              {isSyncing ? 'Sincronizando...' : `Compartir con la Web (${pendingCount})`}
            </button>
          ) : null}

          <button
            type="button"
            onClick={() => setDetailsOpen(true)}
            style={{
              backgroundColor: 'rgba(255, 255, 255, 0.16)',
              color: '#ffffff',
              border: '1px solid rgba(255, 255, 255, 0.35)',
              borderRadius: '6px',
              padding: '0.38rem 0.75rem',
              fontSize: '0.76rem',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.3rem'
            }}
          >
            <Database size={13} /> Panel OnDemand <ChevronRight size={13} />
          </button>

          {recentSyncBanner && !isOfflineOrUnreachable && pendingCount === 0 && (
            <button
              type="button"
              onClick={() => setRecentSyncBanner(null)}
              aria-label="Cerrar aviso OnDemand"
              style={{
                background: 'transparent',
                border: 'none',
                color: '#ffffff',
                cursor: 'pointer',
                padding: '0.2rem'
              }}
            >
              <X size={16} />
            </button>
          )}
        </div>
      </div>

      {/* Modal de Gestión OnDemand (Cola Offline, Sincronización y Paquetes Compartibles) */}
      {detailsOpen && (
        <div className="modal-overlay" style={{ zIndex: 1200 }}>
          <div
            className="modal-content large"
            style={{ maxWidth: '720px', width: '95%', maxHeight: '88vh', display: 'flex', flexDirection: 'column' }}
          >
            <div
              className="topbar"
              style={{
                marginBottom: '1rem',
                borderBottom: '1px solid var(--color-border)',
                paddingBottom: '0.75rem'
              }}
            >
              <div>
                <h2 style={{ fontSize: '1.2rem', color: 'var(--color-primary)', margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <Database size={20} /> Centro de Continuidad Operativa OnDemand
                </h2>
                <p style={{ fontSize: '0.8rem', color: 'var(--color-text-light)', margin: '0.2rem 0 0 0' }}>
                  Almacenamiento local sin internet y sincronización automática con la página web.
                </p>
              </div>
              <button type="button" className="btn btn-outline" onClick={() => setDetailsOpen(false)} style={{ padding: '0.3rem' }}>
                <X size={18} />
              </button>
            </div>

            {/* Tarjetas de estado */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(175px, 1fr))', gap: '0.75rem', marginBottom: '1rem' }}>
              <div className="card" style={{ padding: '0.75rem', borderLeft: `4px solid ${isOnline ? 'var(--color-success)' : 'var(--color-danger)'}` }}>
                <div style={{ fontSize: '0.72rem', color: 'var(--color-text-light)' }}>Red de Internet</div>
                <div style={{ fontWeight: 700, fontSize: '0.95rem', marginTop: '0.2rem' }}>
                  {isOnline ? 'Conectado' : 'Sin Internet (Offline)'}
                </div>
              </div>

              <div className="card" style={{ padding: '0.75rem', borderLeft: `4px solid ${isAccessible && dbConnected ? 'var(--color-success)' : 'var(--color-warning)'}` }}>
                <div style={{ fontSize: '0.72rem', color: 'var(--color-text-light)' }}>Servidor / Página Web</div>
                <div style={{ fontWeight: 700, fontSize: '0.95rem', marginTop: '0.2rem' }}>
                  {isAccessible && dbConnected ? 'Accesible y En Línea' : 'No Accesible (Modo Local)'}
                </div>
              </div>

              <div className="card" style={{ padding: '0.75rem', borderLeft: '4px solid var(--color-primary)' }}>
                <div style={{ fontSize: '0.72rem', color: 'var(--color-text-light)' }}>Cambios por Compartir</div>
                <div style={{ fontWeight: 700, fontSize: '0.95rem', marginTop: '0.2rem' }}>
                  {pendingCount} operación(es)
                </div>
              </div>
            </div>

            {/* Metadatos de caché local */}
            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                justifyContent: 'space-between',
                gap: '0.5rem',
                fontSize: '0.76rem',
                color: 'var(--color-text-light)',
                backgroundColor: 'var(--color-bg)',
                padding: '0.6rem 0.85rem',
                borderRadius: 'var(--radius)',
                marginBottom: '1rem'
              }}
            >
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                <Clock size={13} />
                Última copia local: {onDemandStatus?.lastCachedAt ? formatDate(onDemandStatus.lastCachedAt) : 'Activa en sesión'}
              </span>
              <span>
                Última sincronización web: {onDemandStatus?.lastSyncedAt ? formatDate(onDemandStatus.lastSyncedAt) : 'Sin pendientes'}
              </span>
            </div>

            {/* Lista de operaciones en cola */}
            <div style={{ flex: 1, overflowY: 'auto', minHeight: '160px', border: '1px solid var(--color-border)', borderRadius: 'var(--radius)', padding: '0.75rem' }}>
              {pendingCount === 0 ? (
                <div style={{ textAlign: 'center', padding: '2.25rem 1rem', color: 'var(--color-text-light)' }}>
                  <CheckCircle2 size={36} style={{ color: 'var(--color-success)', margin: '0 auto 0.5rem' }} />
                  <div style={{ fontWeight: 600, color: 'var(--color-text)' }}>
                    Todos los cambios locales han sido compartidos con la página web
                  </div>
                  <p style={{ fontSize: '0.8rem', marginTop: '0.25rem' }}>
                    Si pierdes la conexión a internet, cualquier movimiento, producto, conteo o corte aparecerá aquí automáticamente.
                  </p>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {offlineQueue.map((item) => (
                    <div
                      key={item.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '0.75rem',
                        padding: '0.65rem 0.85rem',
                        borderRadius: '6px',
                        backgroundColor: 'var(--color-bg)',
                        border: `1px solid ${item.status === 'conflict' ? 'var(--color-danger)' : 'var(--color-border)'}`
                      }}
                    >
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', flexWrap: 'wrap' }}>
                          <span className={`badge ${item.status === 'conflict' ? 'badge-danger' : 'badge-primary'}`} style={{ fontSize: '0.68rem' }}>
                            {item.method} · {item.module}
                          </span>
                          <strong style={{ fontSize: '0.85rem', color: 'var(--color-text)' }}>{item.label}</strong>
                        </div>
                        <div style={{ fontSize: '0.74rem', color: 'var(--color-text-light)', marginTop: '0.2rem' }}>
                          Capturado: {new Date(item.createdAt).toLocaleString()}
                        </div>
                        {item.error && (
                          <div style={{ fontSize: '0.75rem', color: 'var(--color-danger)', marginTop: '0.25rem', fontWeight: 600 }}>
                            Detalle del servidor: {item.error}
                          </div>
                        )}
                      </div>
                      <button
                        type="button"
                        className="btn btn-outline"
                        onClick={() => removeOfflineQueueItem(item.id)}
                        title="Descartar esta operación de la cola local"
                        style={{ padding: '0.3rem 0.5rem', color: 'var(--color-danger)' }}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Acciones de sincronización y compartición */}
            <div
              style={{
                marginTop: '1rem',
                paddingTop: '0.85rem',
                borderTop: '1px solid var(--color-border)',
                display: 'flex',
                flexWrap: 'wrap',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: '0.6rem'
              }}
            >
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                <button type="button" className="btn btn-outline" onClick={handleExportQueue} disabled={pendingCount === 0} style={{ fontSize: '0.8rem' }}>
                  <Download size={15} /> Exportar Paquete (.json)
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".json"
                  onChange={handleImportQueueFile}
                  style={{ display: 'none' }}
                />
                <button type="button" className="btn btn-outline" onClick={() => fileInputRef.current?.click()} style={{ fontSize: '0.8rem' }}>
                  <Upload size={15} /> Importar Paquete
                </button>
                {pendingCount > 0 && (
                  <button
                    type="button"
                    className="btn btn-danger"
                    onClick={() => {
                      if (window.confirm('¿Seguro que deseas vaciar todas las operaciones pendientes de OnDemand?')) {
                        clearAllOfflineQueue();
                        toast.success('Cola OnDemand vaciada.');
                      }
                    }}
                    style={{ fontSize: '0.8rem' }}
                  >
                    <Trash2 size={15} /> Vaciar Cola
                  </button>
                )}
              </div>

              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button type="button" className="btn btn-outline" onClick={handleCheckConnection} style={{ fontSize: '0.8rem' }}>
                  <RefreshCw size={15} /> Verificar Servidor
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={pendingCount === 0 || isSyncing}
                  onClick={handleManualSync}
                  style={{ fontSize: '0.8rem' }}
                >
                  <CloudUpload size={15} />
                  {isSyncing ? 'Sincronizando...' : `Compartir con la Página Web (${pendingCount})`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default OnDemand;
