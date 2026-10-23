import React, { useState, useEffect, useRef } from 'react';
import {
  Wifi,
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
  ChevronRight,
  Lock,
  RotateCcw,
  ShieldAlert
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { useInventory } from '../../context/InventoryContext';
import { formatDate } from '../../utils/formatUtils';

const formatSyncTimeLabel = (isoStr) => {
  if (!isoStr) return 'Activa en sesión';
  try {
    const dt = new Date(isoStr);
    if (Number.isNaN(dt.getTime())) return 'Activa en sesión';
    return dt.toLocaleTimeString('es-SV', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  } catch {
    return 'Activa en sesión';
  }
};

/**
 * Componente OnDemand v2
 * Muestra la barra compacta de sincronización incremental cuando está en línea,
 * un banner prominente en modo offline o con cambios pendientes/conflictos,
 * y el Centro de Continuidad Operativa con cola por usuario e historial sincronizado.
 */
export function OnDemand() {
  const {
    currentUser,
    onDemandStatus,
    offlineQueue,
    syncedHistory = [],
    otherUsersPending = { totalCount: 0, accounts: [] },
    lastServerSyncAt,
    fetchIncrementalChanges,
    retryOfflineQueueItem,
    syncOnDemandNow,
    checkOnDemandConnection,
    removeOfflineQueueItem,
    clearAllOfflineQueue,
    importOfflineQueueItems
  } = useInventory();

  const [detailsOpen, setDetailsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('queue'); // 'queue' | 'history'
  const [syncProgress, setSyncProgress] = useState(null);
  const [recentSyncBanner, setRecentSyncBanner] = useState(null);
  const [refreshingDelta, setRefreshingDelta] = useState(false);
  const fileInputRef = useRef(null);

  const isOnline = onDemandStatus?.isOnline !== false;
  const isAccessible = onDemandStatus?.isPageAccessible !== false;
  const dbConnected = onDemandStatus?.dbConnected !== false;
  const isSyncing = Boolean(onDemandStatus?.isSyncing);
  const waitingAuth = Boolean(onDemandStatus?.waitingAuth);

  const safeQueue = Array.isArray(offlineQueue) ? offlineQueue : [];
  const safeSynced = Array.isArray(syncedHistory) ? syncedHistory : [];
  const totalQueueCount = safeQueue.length;
  const conflictCount = safeQueue.filter(item => item.status === 'conflict').length;
  const pendingOnlyCount = safeQueue.filter(item => item.status !== 'conflict').length;
  const syncedCount = safeSynced.length;
  const otherAccountsCount = Number(otherUsersPending?.totalCount || 0);

  const isOfflineOrUnreachable = !isOnline || !isAccessible || !dbConnected;

  // Escuchar eventos de sincronización automática completada para mostrar confirmación
  useEffect(() => {
    const handleSyncDone = (e) => {
      const { syncedCount: doneCount } = e.detail || {};
      if (doneCount > 0) {
        setRecentSyncBanner({
          count: doneCount,
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
    setSyncProgress({ current: 0, total: totalQueueCount });
    try {
      const res = await syncOnDemandNow((prog) => setSyncProgress(prog));
      if (res?.offline) {
        toast.error('Aún no hay conexión con el servidor web. Tus datos siguen seguros en OnDemand.');
      } else if (res?.waitingAuth) {
        toast.error('Tu sesión expiró. Inicia sesión nuevamente para reanudar el envío automático.');
      } else if (res?.syncedCount > 0) {
        toast.success(`¡OnDemand sincronizó ${res.syncedCount} operación(es) con la página web!`);
        setRecentSyncBanner({
          count: res.syncedCount,
          timestamp: new Date().toLocaleTimeString()
        });
        setTimeout(() => setRecentSyncBanner(null), 7000);
      } else if (res?.failedCount > 0) {
        toast.error(`Se encontraron ${res.failedCount} operación(es) que requieren revisión.`);
        setDetailsOpen(true);
      } else {
        toast.success('Conexión verificada. Todo está sincronizado con el servidor.');
      }
    } finally {
      setSyncProgress(null);
    }
  };

  const handleQuickRefresh = async () => {
    if (isOfflineOrUnreachable) {
      await handleCheckConnection();
      return;
    }
    setRefreshingDelta(true);
    try {
      if (pendingOnlyCount > 0) {
        await handleManualSync();
      } else if (typeof fetchIncrementalChanges === 'function') {
        await fetchIncrementalChanges();
        toast.success(' Estado sincronizado con el servidor.');
      }
    } finally {
      setRefreshingDelta(false);
    }
  };

  const handleCheckConnection = async () => {
    const status = await checkOnDemandConnection();
    if (status.isOnline && status.isPageAccessible && status.dbConnected) {
      toast.success('¡Conexión restablecida con la página web!');
      if (totalQueueCount > 0) {
        await handleManualSync();
      }
    } else {
      toast.error(status.lastError || 'Aún sin acceso a internet o al servidor web.');
    }
  };

  const handleRetryItem = async (itemId, forceOverwrite = false) => {
    const updated = await retryOfflineQueueItem(itemId, { forceOverwrite });
    if (updated) {
      toast.success(
        forceOverwrite
          ? 'Operación marcada para sobrescribir y reenviar al servidor.'
          : 'Reintentando sincronización de la operación...'
      );
    }
  };

  const handleExportQueue = () => {
    if (totalQueueCount === 0) {
      toast.error('No hay operaciones pendientes para exportar.');
      return;
    }
    const payload = {
      type: 'INVENTARIO_ONDEMAND_SYNC_PACKAGE',
      exportedAt: new Date().toISOString(),
      user: currentUser ? { id: currentUser.id, username: currentUser.username } : null,
      operations: safeQueue
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
        const ops = Array.isArray(parsed?.operations)
          ? parsed.operations
          : Array.isArray(parsed)
            ? parsed
            : null;
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

  // Si no hay usuario autenticado y tampoco hay estado especial, no mostrar barra
  if (!currentUser && !isOfflineOrUnreachable && totalQueueCount === 0 && otherAccountsCount === 0) {
    return null;
  }

  const showProminentBanner =
    isOfflineOrUnreachable ||
    totalQueueCount > 0 ||
    waitingAuth ||
    Boolean(recentSyncBanner);

  // Configuración visual para banner prominente
  let bannerBg = 'linear-gradient(90deg, #b45309 0%, #d97706 100%)';
  let bannerBorder = '#f59e0b';
  let StatusIcon = WifiOff;
  let titleText = 'Modo OnDemand Activo · Sin Conexión a Internet';
  let subtitleText =
    'Puedes seguir registrando movimientos, productos, conteos y cortes sin internet. Se guardarán en este equipo bajo tu usuario y se enviarán automáticamente al recuperar la señal.';

  if (isOnline && (!isAccessible || !dbConnected)) {
    bannerBg = 'linear-gradient(90deg, #9a3412 0%, #ea580c 100%)';
    bannerBorder = '#fb923c';
    StatusIcon = ServerCrash;
    titleText = !isAccessible
      ? 'Modo OnDemand Activo · La página o el servidor no es accesible'
      : 'Modo OnDemand Activo · Base de datos remota no disponible';
    subtitleText = `${onDemandStatus?.lastError || 'El servidor no responde.'} Operando con caché local segura (IndexedDB); tus cambios se sincronizarán en cuanto el servidor vuelva a estar en línea.`;
  } else if (waitingAuth) {
    bannerBg = 'linear-gradient(90deg, #7c2d12 0%, #c2410c 100%)';
    bannerBorder = '#fb923c';
    StatusIcon = ShieldAlert;
    titleText = 'Sincronización en Pausa · Sesión Expirada';
    subtitleText =
      'Tus cambios pendientes están resguardados de forma segura. Inicia sesión nuevamente con tu cuenta para reanudar el envío automático.';
  } else if (!isOfflineOrUnreachable && totalQueueCount > 0) {
    bannerBg =
      conflictCount > 0
        ? 'linear-gradient(90deg, #991b1b 0%, #dc2626 100%)'
        : 'linear-gradient(90deg, #1e40af 0%, #2563eb 100%)';
    bannerBorder = conflictCount > 0 ? '#f87171' : '#60a5fa';
    StatusIcon = conflictCount > 0 ? AlertTriangle : CloudUpload;
    titleText = isSyncing
      ? `Sincronizando OnDemand con la página web (${syncProgress?.current || 1}/${syncProgress?.total || totalQueueCount})...`
      : conflictCount > 0
        ? `OnDemand · ${conflictCount} operación(es) requieren revisión para sincronizar`
        : `Conexión Activa · ${pendingOnlyCount} cambio(s) pendientes de sincronizar`;
    subtitleText = isSyncing
      ? 'Enviando operaciones almacenadas localmente hacia el servidor central...'
      : conflictCount > 0
        ? 'Se detectó una diferencia de versión o validación en el servidor. Abre el Panel OnDemand para revisar, reintentar o sobrescribir.'
        : 'Haz clic en "Compartir Ahora" para subir inmediatamente los registros capturados sin internet.';
  } else if (recentSyncBanner) {
    bannerBg = 'linear-gradient(90deg, #065f46 0%, #059669 100%)';
    bannerBorder = '#34d399';
    StatusIcon = CheckCircle2;
    titleText = `OnDemand · ¡Sincronización completada (${recentSyncBanner.count} cambio(s) compartidos)!`;
    subtitleText = `Todos los datos capturados sin internet fueron enviados y actualizados en el servidor a las ${recentSyncBanner.timestamp}.`;
  }

  return (
    <>
      {showProminentBanner ? (
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
          <div style={{ display: 'flex', alignItems: ' flex-start', gap: '0.75rem', flex: '1 1 340px' }}>
            <div
              style={{
                width: '36px',
                height: '36px',
                borderRadius: '8px',
                backgroundColor: 'rgba(255, 255, 255, 0.18)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
                marginTop: '2px'
              }}
            >
              <StatusIcon size={20} className={isSyncing ? 'spin-icon' : ''} />
            </div>
            <div style={{ lineHeight: 1.35 }}>
              <div style={{ fontWeight: 700, fontSize: '0.88rem', display: 'flex', alignItems: 'center', gap: '0.45rem', flexWrap: 'wrap' }}>
                <span>{titleText}</span>
                {pendingOnlyCount > 0 && (
                  <span
                    style={{
                      backgroundColor: 'rgba(0, 0, 0, 0.28)',
                      padding: '0.1rem 0.5rem',
                      borderRadius: '999px',
                      fontSize: '0.72rem',
                      fontWeight: 600
                    }}
                  >
                    Pendientes: {pendingOnlyCount}
                  </span>
                )}
                {conflictCount > 0 && (
                  <span
                    style={{
                      backgroundColor: '#7f1d1d',
                      border: '1px solid #fca5a5',
                      padding: '0.1rem 0.5rem',
                      borderRadius: '999px',
                      fontSize: '0.72rem',
                      fontWeight: 700
                    }}
                  >
                    Requiere revisión: {conflictCount}
                  </span>
                )}
                {otherAccountsCount > 0 && (
                  <span
                    title="Operaciones pendientes de otra cuenta de usuario resguardadas en este dispositivo"
                    style={{
                      backgroundColor: 'rgba(0, 0, 0, 0.35)',
                      padding: '0.1rem 0.55rem',
                      borderRadius: '999px',
                      fontSize: '0.72rem',
                      fontWeight: 600,
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.25rem'
                    }}
                  >
                    <Lock size={11} /> {otherAccountsCount} resguardado(s) de otra cuenta
                  </span>
                )}
              </div>
              <div style={{ fontSize: '0.77rem', opacity: 0.94, marginTop: '0.15rem' }}>
                {subtitleText}
              </div>
              {isOfflineOrUnreachable && (
                <div
                  style={{
                    fontSize: '0.73rem',
                    marginTop: '0.3rem',
                    padding: '0.25rem 0.55rem',
                    borderRadius: '4px',
                    backgroundColor: 'rgba(0, 0, 0, 0.22)',
                    display: 'inline-block'
                  }}
                >
                  <strong>Nota:</strong> Mientras este dispositivo esté desconectado no recibirá cambios de otros usuarios (se actualizarán automáticamente al reconectar). Acciones sensibles como emitir DTE, cambiar permisos o desbloquear un cierre requieren conexión activa.
                </div>
              )}
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
            ) : pendingOnlyCount > 0 ? (
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
                {isSyncing ? 'Sincronizando...' : `Compartir Ahora (${pendingOnlyCount})`}
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

            {recentSyncBanner && !isOfflineOrUnreachable && totalQueueCount === 0 && (
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
      ) : (
        /* Barra compacta de Estado en Línea y Sincronización Incremental */
        <div
          role="region"
          aria-label="Estado de sincronización en línea"
          style={{
            backgroundColor: 'var(--color-surface)',
            borderBottom: '1px solid var(--color-border)',
            padding: '0.35rem 1.15rem',
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '0.5rem',
            fontSize: '0.74rem',
            color: 'var(--color-text-light)'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', flexWrap: 'wrap' }}>
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.35rem',
                fontWeight: 600,
                color: '#059669'
              }}
            >
              <Wifi size={13} /> En línea · Sincronización incremental activa
            </span>
            <span style={{ color: 'var(--color-border)' }}>|</span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}>
              <Clock size={12} />
              Última actualización del servidor:{' '}
              <strong style={{ color: 'var(--color-text)' }}>
                {formatSyncTimeLabel(lastServerSyncAt || onDemandStatus?.lastSyncedAt)}
              </strong>
            </span>
            {otherAccountsCount > 0 && (
              <span
                title="Operaciones capturadas sin internet por otro usuario en este equipo; se sincronizarán cuando ese usuario inicie sesión."
                style={{
                  backgroundColor: 'rgba(245, 158, 11, 0.14)',
                  color: '#b45309',
                  border: '1px solid rgba(245, 158, 11, 0.35)',
                  padding: '0.1rem 0.5rem',
                  borderRadius: '999px',
                  fontSize: '0.7rem',
                  fontWeight: 600,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.25rem'
                }}
              >
                <Lock size={11} /> {otherAccountsCount} cambio(s) resguardado(s) de otra cuenta
              </span>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', flexWrap: 'wrap' }}>
            <span
              style={{
                padding: '0.1rem 0.45rem',
                borderRadius: '999px',
                backgroundColor: 'rgba(16, 185, 129, 0.12)',
                color: '#059669',
                fontWeight: 600,
                fontSize: '0.7rem'
              }}
            >
              Sincronizados ({syncedCount})
            </span>
            <button
              type="button"
              onClick={handleQuickRefresh}
              disabled={refreshingDelta}
              className="btn btn-outline"
              style={{
                padding: '0.18rem 0.5rem',
                fontSize: '0.71rem',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.25rem'
              }}
              title="Consultar cambios recientes del servidor ahora"
            >
              <RefreshCw size={11} className={refreshingDelta ? 'spin-icon' : ''} />
              Actualizar
            </button>
            <button
              type="button"
              onClick={() => setDetailsOpen(true)}
              className="btn btn-outline"
              style={{
                padding: '0.18rem 0.55rem',
                fontSize: '0.71rem',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.25rem'
              }}
            >
              <Database size={11} /> OnDemand
            </button>
          </div>
        </div>
      )}

      {/* Modal de Gestión OnDemand (Cola Offline Aislada por Usuario, Resolución de Conflictos e Historial) */}
      {detailsOpen && (
        <div className="modal-overlay" style={{ zIndex: 1200 }}>
          <div
            className="modal-content large"
            style={{ maxWidth: '780px', width: '95%', maxHeight: '88vh', display: 'flex', flexDirection: 'column' }}
          >
            <div
              className="topbar"
              style={{
                marginBottom: '0.85rem',
                borderBottom: '1px solid var(--color-border)',
                paddingBottom: '0.75rem'
              }}
            >
              <div>
                <h2 style={{ fontSize: '1.18rem', color: 'var(--color-primary)', margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <Database size={20} /> Centro de Continuidad Operativa OnDemand
                </h2>
                <p style={{ fontSize: '0.79rem', color: 'var(--color-text-light)', margin: '0.2rem 0 0 0' }}>
                  Almacenamiento local IndexedDB aislado por usuario, control de versión base y sincronización incremental.
                </p>
              </div>
              <button type="button" className="btn btn-outline" onClick={() => setDetailsOpen(false)} style={{ padding: '0.3rem' }}>
                <X size={18} />
              </button>
            </div>

            {/* Tarjetas de estado */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(165px, 1fr))', gap: '0.65rem', marginBottom: '0.85rem' }}>
              <div className="card" style={{ padding: '0.65rem 0.75rem', borderLeft: `4px solid ${isOnline ? 'var(--color-success)' : 'var(--color-danger)'}` }}>
                <div style={{ fontSize: '0.7rem', color: 'var(--color-text-light)' }}>Red y Servidor</div>
                <div style={{ fontWeight: 700, fontSize: '0.9rem', marginTop: '0.15rem' }}>
                  {!isOfflineOrUnreachable ? 'En Línea · Activo' : 'Modo Local (Offline)'}
                </div>
              </div>

              <div className="card" style={{ padding: '0.65rem 0.75rem', borderLeft: '4px solid var(--color-primary)' }}>
                <div style={{ fontSize: '0.7rem', color: 'var(--color-text-light)' }}>Pendientes ({currentUser?.username || 'Actual'})</div>
                <div style={{ fontWeight: 700, fontSize: '0.9rem', marginTop: '0.15rem' }}>
                  {pendingOnlyCount} operación(es)
                </div>
              </div>

              <div className="card" style={{ padding: '0.65rem 0.75rem', borderLeft: `4px solid ${conflictCount > 0 ? 'var(--color-danger)' : 'var(--color-success)'}` }}>
                <div style={{ fontSize: '0.7rem', color: 'var(--color-text-light)' }}>Requieren Revisión</div>
                <div style={{ fontWeight: 700, fontSize: '0.9rem', marginTop: '0.15rem', color: conflictCount > 0 ? 'var(--color-danger)' : 'inherit' }}>
                  {conflictCount} conflicto(s)
                </div>
              </div>

              <div className="card" style={{ padding: '0.65rem 0.75rem', borderLeft: '4px solid #059669' }}>
                <div style={{ fontSize: '0.7rem', color: 'var(--color-text-light)' }}>Sincronizados Recientes</div>
                <div style={{ fontWeight: 700, fontSize: '0.9rem', marginTop: '0.15rem', color: '#059669' }}>
                  {syncedCount} operación(es)
                </div>
              </div>
            </div>

            {/* Aviso si existen operaciones resguardadas de otra cuenta en este navegador */}
            {otherAccountsCount > 0 && (
              <div
                style={{
                  backgroundColor: 'rgba(245, 158, 11, 0.12)',
                  border: '1px solid rgba(245, 158, 11, 0.4)',
                  borderRadius: 'var(--radius)',
                  padding: '0.55rem 0.85rem',
                  marginBottom: '0.75rem',
                  fontSize: '0.76rem',
                  color: '#b45309',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem'
                }}
              >
                <Lock size={15} style={{ flexShrink: 0 }} />
                <div>
                  <strong>Aislamiento multiusuario activo:</strong> Existen{' '}
                  <strong>{otherAccountsCount} operación(es)</strong> pendientes asociadas a otra cuenta (
                  {otherUsersPending.accounts.map(a => `${a.username}: ${a.count}`).join(', ')}). Permanecen resguardadas y solo se enviarán cuando ese usuario inicie sesión.
                </div>
              </div>
            )}

            {/* Metadatos de caché local y servidor */}
            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                justifyContent: 'space-between',
                gap: '0.5rem',
                fontSize: '0.75rem',
                color: 'var(--color-text-light)',
                backgroundColor: 'var(--color-bg)',
                padding: '0.55rem 0.85rem',
                borderRadius: 'var(--radius)',
                marginBottom: '0.75rem'
              }}
            >
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                <Clock size={13} />
                Última copia local: {onDemandStatus?.lastCachedAt ? formatDate(onDemandStatus.lastCachedAt) : 'Activa en sesión'}
              </span>
              <span>
                Última actualización servidor: {formatSyncTimeLabel(lastServerSyncAt || onDemandStatus?.lastSyncedAt)}
              </span>
            </div>

            {/* Pestañas: Cola Activa vs Historial Reciente */}
            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.65rem' }}>
              <button
                type="button"
                onClick={() => setActiveTab('queue')}
                className={activeTab === 'queue' ? 'btn btn-primary' : 'btn btn-outline'}
                style={{ fontSize: '0.78rem', padding: '0.35rem 0.8rem' }}
              >
                Cola Activa ({totalQueueCount})
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('history')}
                className={activeTab === 'history' ? 'btn btn-primary' : 'btn btn-outline'}
                style={{ fontSize: '0.78rem', padding: '0.35rem 0.8rem' }}
              >
                Historial Sincronizado ({syncedCount})
              </button>
            </div>

            {/* Contenido de la pestaña seleccionada */}
            <div style={{ flex: 1, overflowY: 'auto', minHeight: '180px', border: '1px solid var(--color-border)', borderRadius: 'var(--radius)', padding: '0.75rem' }}>
              {activeTab === 'queue' ? (
                totalQueueCount === 0 ? (
                  <div style={{ textAlign: 'center', padding: '2rem 1rem', color: 'var(--color-text-light)' }}>
                    <CheckCircle2 size={36} style={{ color: 'var(--color-success)', margin: '0 auto 0.5rem' }} />
                    <div style={{ fontWeight: 600, color: 'var(--color-text)' }}>
                      Todos tus cambios locales están sincronizados con el servidor
                    </div>
                    <p style={{ fontSize: '0.79rem', marginTop: '0.25rem' }}>
                      Si pierdes la conexión a internet, cualquier movimiento, producto, conteo o corte se guardará aquí con clave de idempotencia y versión base.
                    </p>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.55rem' }}>
                    {safeQueue.map((item) => {
                      const isConflict = item.status === 'conflict';
                      const isWaitingAuth = item.status === 'waiting_auth';
                      return (
                        <div
                          key={item.id}
                          style={{
                            display: 'flex',
                            alignItems: 'flex-start',
                            justifyContent: 'space-between',
                            gap: '0.75rem',
                            padding: '0.7rem 0.85rem',
                            borderRadius: '6px',
                            backgroundColor: 'var(--color-bg)',
                            border: `1px solid ${
                              isConflict
                                ? 'var(--color-danger)'
                                : isWaitingAuth
                                  ? 'var(--color-warning)'
                                  : 'var(--color-border)'
                            }`
                          }}
                        >
                          <div style={{ flex: 1 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', flexWrap: 'wrap' }}>
                              <span
                                className={`badge ${
                                  isConflict
                                    ? 'badge-danger'
                                    : isWaitingAuth
                                      ? 'badge-warning'
                                      : 'badge-primary'
                                }`}
                                style={{ fontSize: '0.68rem' }}
                              >
                                {isConflict
                                  ? 'Requiere revisión'
                                  : isWaitingAuth
                                    ? 'Esperando sesión'
                                    : 'Pendiente'}
                              </span>
                              <span className="badge badge-outline" style={{ fontSize: '0.67rem' }}>
                                {item.method} · {item.module}
                              </span>
                              <strong style={{ fontSize: '0.84rem', color: 'var(--color-text)' }}>{item.label}</strong>
                            </div>
                            <div style={{ fontSize: '0.73rem', color: 'var(--color-text-light)', marginTop: '0.22rem', display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                              <span>Usuario: <strong>{item.username || 'Sistema'}</strong></span>
                              <span>Capturado: {new Date(item.createdAt).toLocaleString()}</span>
                              <span>ID: <code>{String(item.idempotencyKey || item.id).slice(0, 8)}</code></span>
                            </div>
                            {item.error && (
                              <div style={{ fontSize: '0.75rem', color: 'var(--color-danger)', marginTop: '0.28rem', fontWeight: 600 }}>
                                {item.conflictCode ? `[${item.conflictCode}] ` : ''}
                                {item.error}
                              </div>
                            )}
                          </div>

                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', flexWrap: 'wrap' }}>
                            {isConflict && (
                              <>
                                <button
                                  type="button"
                                  className="btn btn-outline"
                                  onClick={() => handleRetryItem(item.id, false)}
                                  title="Reintentar envío de esta operación"
                                  style={{ padding: '0.28rem 0.55rem', fontSize: '0.73rem' }}
                                >
                                  <RotateCcw size={13} /> Reintentar
                                </button>
                                <button
                                  type="button"
                                  className="btn btn-primary"
                                  onClick={() => handleRetryItem(item.id, true)}
                                  title="Forzar aplicación de este cambio sobre la versión del servidor"
                                  style={{ padding: '0.28rem 0.55rem', fontSize: '0.73rem' }}
                                >
                                  Forzar envío
                                </button>
                              </>
                            )}
                            <button
                              type="button"
                              className="btn btn-outline"
                              onClick={() => removeOfflineQueueItem(item.id)}
                              title="Descartar esta operación de la cola local"
                              style={{ padding: '0.28rem 0.5rem', color: 'var(--color-danger)' }}
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )
              ) : syncedCount === 0 ? (
                <div style={{ textAlign: 'center', padding: '2rem 1rem', color: 'var(--color-text-light)' }}>
                  <div style={{ fontWeight: 600, color: 'var(--color-text)' }}>
                    Sin operaciones sincronizadas recientes en esta sesión
                  </div>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {safeSynced.map((item) => (
                    <div
                      key={`${item.id}-${item.syncedAt}`}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '0.75rem',
                        padding: '0.6rem 0.85rem',
                        borderRadius: '6px',
                        backgroundColor: 'var(--color-bg)',
                        border: '1px solid var(--color-border)'
                      }}
                    >
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', flexWrap: 'wrap' }}>
                          <span className="badge badge-success" style={{ fontSize: '0.68rem' }}>
                            Sincronizado
                          </span>
                          <span className="badge badge-outline" style={{ fontSize: '0.67rem' }}>
                            {item.method} · {item.module}
                          </span>
                          <strong style={{ fontSize: '0.83rem', color: 'var(--color-text)' }}>{item.label}</strong>
                        </div>
                        <div style={{ fontSize: '0.72rem', color: 'var(--color-text-light)', marginTop: '0.18rem' }}>
                          Sincronizado: {item.syncedAt ? new Date(item.syncedAt).toLocaleString() : 'Reciente'} · Usuario: {item.username || 'Sistema'}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Acciones de sincronización y compartición */}
            <div
              style={{
                marginTop: '0.9rem',
                paddingTop: '0.8rem',
                borderTop: '1px solid var(--color-border)',
                display: 'flex',
                flexWrap: 'wrap',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: '0.6rem'
              }}
            >
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                <button type="button" className="btn btn-outline" onClick={handleExportQueue} disabled={totalQueueCount === 0} style={{ fontSize: '0.78rem' }}>
                  <Download size={14} /> Exportar Paquete (.json)
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".json"
                  onChange={handleImportQueueFile}
                  style={{ display: 'none' }}
                />
                <button type="button" className="btn btn-outline" onClick={() => fileInputRef.current?.click()} style={{ fontSize: '0.78rem' }}>
                  <Upload size={14} /> Importar Paquete
                </button>
                {totalQueueCount > 0 && (
                  <button
                    type="button"
                    className="btn btn-danger"
                    onClick={() => {
                      if (window.confirm('¿Seguro que deseas vaciar todas las operaciones pendientes de tu cuenta en OnDemand?')) {
                        clearAllOfflineQueue();
                        toast.success('Cola OnDemand vaciada.');
                      }
                    }}
                    style={{ fontSize: '0.78rem' }}
                  >
                    <Trash2 size={14} /> Vaciar Cola
                  </button>
                )}
              </div>

              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button type="button" className="btn btn-outline" onClick={handleQuickRefresh} style={{ fontSize: '0.78rem' }}>
                  <RefreshCw size={14} /> Actualizar Servidor
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={totalQueueCount === 0 || isSyncing}
                  onClick={handleManualSync}
                  style={{ fontSize: '0.78rem' }}
                >
                  <CloudUpload size={14} />
                  {isSyncing ? 'Sincronizando...' : `Sincronizar Ahora (${totalQueueCount})`}
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
