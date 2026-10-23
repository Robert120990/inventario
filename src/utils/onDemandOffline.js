/**
 * Motor OnDemand (Offline-First, Caché Local y Cola de Sincronización Diferida)
 * Permite que la aplicación funcione al 100% sin conexión a internet o cuando el servidor
 * no es accesible, y sincroniza automáticamente los cambios al restablecerse la conexión.
 */

const SNAPSHOT_PREFIX = 'inv_ondemand_snap_v1_';
const QUEUE_STORAGE_KEY = 'inv_ondemand_queue_v1';
const META_STORAGE_KEY = 'inv_ondemand_meta_v1';

const isBrowserOnline = () =>
  typeof navigator === 'undefined' || navigator.onLine !== false;

// Estado reactivo global del motor OnDemand
let _status = {
  isOnline: isBrowserOnline(),
  isPageAccessible: true,
  dbConnected: true,
  isSyncing: false,
  lastCheckedAt: null,
  lastSyncedAt: null,
  lastCachedAt: null,
  lastError: null
};

const notifyStatusChange = () => {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('ondemand:status-change', { detail: { ..._status } }));
  }
};

const notifyQueueChange = (queue) => {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('ondemand:queue-change', { detail: { queue } }));
  }
};

/**
 * Obtiene los metadatos persistidos de OnDemand (fechas de caché y sincronización)
 */
export const getOnDemandMeta = () => {
  if (typeof localStorage === 'undefined') return {};
  try {
    const raw = localStorage.getItem(META_STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
};

const updateOnDemandMeta = (patch) => {
  if (typeof localStorage === 'undefined') return;
  try {
    const current = getOnDemandMeta();
    const updated = { ...current, ...patch };
    localStorage.setItem(META_STORAGE_KEY, JSON.stringify(updated));
    if (patch.lastCachedAt) _status.lastCachedAt = patch.lastCachedAt;
    if (patch.lastSyncedAt) _status.lastSyncedAt = patch.lastSyncedAt;
  } catch {
    // Ignorar si localStorage está lleno
  }
};

// Inicializar timestamps desde localStorage
const initialMeta = getOnDemandMeta();
if (initialMeta.lastCachedAt) _status.lastCachedAt = initialMeta.lastCachedAt;
if (initialMeta.lastSyncedAt) _status.lastSyncedAt = initialMeta.lastSyncedAt;

/**
 * Guarda una instantánea (snapshot) de una colección en localStorage para uso sin internet
 */
export const saveLocalSnapshot = (key, data) => {
  if (typeof localStorage === 'undefined' || data === undefined) return false;
  try {
    localStorage.setItem(`${SNAPSHOT_PREFIX}${key}`, JSON.stringify(data));
    const now = new Date().toISOString();
    updateOnDemandMeta({ lastCachedAt: now });
    return true;
  } catch (err) {
    console.warn(`[OnDemand] No se pudo guardar snapshot local para '${key}':`, err?.message);
    return false;
  }
};

/**
 * Carga una instantánea (snapshot) desde localStorage cuando no hay conexión
 */
export const loadLocalSnapshot = (key, fallback = []) => {
  if (typeof localStorage === 'undefined') return fallback;
  try {
    const raw = localStorage.getItem(`${SNAPSHOT_PREFIX}${key}`);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    return parsed !== null && parsed !== undefined ? parsed : fallback;
  } catch {
    return fallback;
  }
};

/**
 * Obtiene la cola actual de operaciones pendientes por sincronizar con el servidor web
 */
export const getOfflineQueue = () => {
  if (typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(QUEUE_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

/**
 * Persiste la cola de operaciones pendientes
 */
export const saveOfflineQueue = (queue) => {
  if (typeof localStorage === 'undefined') return;
  const safeQueue = Array.isArray(queue) ? queue : [];
  try {
    localStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(safeQueue));
  } catch (err) {
    console.warn('[OnDemand] Error guardando cola offline:', err?.message);
  }
  notifyQueueChange(safeQueue);
};

/**
 * Registra una operación realizada sin internet para compartirla con la página web al reconectar
 */
export const enqueueOfflineOperation = ({
  type,
  module = 'general',
  label,
  method = 'POST',
  endpoint,
  body = null,
  entityId = null
}) => {
  const queue = getOfflineQueue();
  const op = {
    id: typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `od-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    type: type || `${method}_${module.toUpperCase()}`,
    module,
    label: label || `Operación offline (${method} ${endpoint})`,
    method: method.toUpperCase(),
    endpoint,
    body,
    entityId,
    status: 'pending', // 'pending' | 'syncing' | 'conflict'
    error: null,
    attempts: 0,
    createdAt: new Date().toISOString()
  };

  // Optimización: si se actualiza la misma entidad que ya estaba pendiente de actualización, fusionar
  if (op.method === 'PUT' && entityId) {
    const existingIdx = queue.findIndex(
      item => item.entityId === entityId && item.endpoint === endpoint && item.method === 'PUT' && item.status === 'pending'
    );
    if (existingIdx !== -1) {
      queue[existingIdx] = {
        ...queue[existingIdx],
        body: { ...(queue[existingIdx].body || {}), ...(body || {}) },
        label: op.label,
        createdAt: op.createdAt
      };
      saveOfflineQueue(queue);
      return queue[existingIdx];
    }
  }

  queue.push(op);
  saveOfflineQueue(queue);
  return op;
};

/**
 * Elimina una operación específica de la cola offline
 */
export const removeOfflineOperation = (opId) => {
  const queue = getOfflineQueue().filter(item => item.id !== opId);
  saveOfflineQueue(queue);
  return queue;
};

/**
 * Limpia todas las operaciones pendientes de la cola offline
 */
export const clearOfflineQueue = () => {
  saveOfflineQueue([]);
};

/**
 * Determina si un error de fetch corresponde a falta de internet o servidor inaccesible
 */
export const isNetworkOrOfflineError = (error, response = null) => {
  if (!isBrowserOnline()) return true;
  if (response && (response.status === 502 || response.status === 503 || response.status === 504)) {
    return true;
  }
  if (!error) return false;
  const msg = String(error.message || error || '').toLowerCase();
  return (
    error.name === 'TypeError' ||
    error.name === 'AbortError' ||
    msg.includes('failed to fetch') ||
    msg.includes('networkerror') ||
    msg.includes('network request failed') ||
    msg.includes('load failed') ||
    msg.includes('err_internet_disconnected') ||
    msg.includes('err_connection_refused')
  );
};

/**
 * Actualiza el estado de accesibilidad de la página / servidor
 */
export const setOnDemandConnectivity = (patch) => {
  const prevOnline = _status.isOnline;
  const prevAccessible = _status.isPageAccessible;
  _status = {
    ..._status,
    ...patch,
    lastCheckedAt: new Date().toISOString()
  };
  if (
    prevOnline !== _status.isOnline ||
    prevAccessible !== _status.isPageAccessible ||
    patch.isSyncing !== undefined ||
    patch.lastSyncedAt !== undefined
  ) {
    notifyStatusChange();
  }
  return { ..._status };
};

/**
 * Devuelve el estado actual de OnDemand
 */
export const getOnDemandStatus = () => ({ ..._status });

/**
 * Verifica activamente si hay internet y si el servidor de la página web es accesible (/api/health)
 */
export const checkPageAccessibility = async (apiBaseUrl = '') => {
  const browserOnline = isBrowserOnline();
  if (!browserOnline) {
    return setOnDemandConnectivity({
      isOnline: false,
      isPageAccessible: false,
      lastError: 'Sin conexión a Internet en el dispositivo.'
    });
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4000);
  try {
    const response = await window.fetch(`${apiBaseUrl}/api/health?t=${Date.now()}`, {
      method: 'GET',
      cache: 'no-store',
      signal: controller.signal
    });
    clearTimeout(timer);

    if (response.ok) {
      const data = await response.json().catch(() => ({}));
      const dbOk = data.db !== 'disconnected';
      return setOnDemandConnectivity({
        isOnline: true,
        isPageAccessible: true,
        dbConnected: dbOk,
        lastError: dbOk ? null : 'El servidor web responde pero la base de datos no está disponible.'
      });
    }

    return setOnDemandConnectivity({
      isOnline: true,
      isPageAccessible: false,
      lastError: `El servidor respondió con estado HTTP ${response.status}.`
    });
  } catch (err) {
    clearTimeout(timer);
    return setOnDemandConnectivity({
      isOnline: isBrowserOnline(),
      isPageAccessible: false,
      lastError: err?.name === 'AbortError'
        ? 'Tiempo de espera agotado al contactar el servidor.'
        : 'La página o el servidor no son accesibles en este momento.'
    });
  }
};

/**
 * Sincroniza en orden FIFO todas las operaciones de la cola local con el servidor web
 */
export const syncOfflineQueueWithServer = async ({ apiFetch, apiBaseUrl = '', onProgress }) => {
  const queue = getOfflineQueue();
  if (queue.length === 0) {
    return { syncedCount: 0, failedCount: 0, remaining: 0 };
  }

  if (_status.isSyncing) {
    return { syncedCount: 0, failedCount: 0, remaining: queue.length, alreadyRunning: true };
  }

  const health = await checkPageAccessibility(apiBaseUrl);
  if (!health.isOnline || !health.isPageAccessible) {
    return {
      syncedCount: 0,
      failedCount: 0,
      remaining: queue.length,
      offline: true,
      message: health.lastError || 'Sin conexión con el servidor.'
    };
  }

  setOnDemandConnectivity({ isSyncing: true });

  let syncedCount = 0;
  let failedCount = 0;
  const remainingQueue = [];

  for (let i = 0; i < queue.length; i++) {
    const item = queue[i];
    if (typeof onProgress === 'function') {
      onProgress({ current: i + 1, total: queue.length, item });
    }

    try {
      const url = item.endpoint.startsWith('http')
        ? item.endpoint
        : `${apiBaseUrl}${item.endpoint}`;

      const options = {
        method: item.method || 'POST',
        headers: { 'Content-Type': 'application/json' }
      };
      if (item.body !== null && item.body !== undefined && item.method !== 'GET' && item.method !== 'DELETE') {
        options.body = JSON.stringify(item.body);
      }

      const res = await apiFetch(url, options);
      if (res.ok) {
        syncedCount++;
      } else if (res.status >= 400 && res.status < 500 && res.status !== 408 && res.status !== 429) {
        const errData = await res.json().catch(() => ({}));
        failedCount++;
        remainingQueue.push({
          ...item,
          status: 'conflict',
          attempts: (item.attempts || 0) + 1,
          error: errData.error || `Rechazado por el servidor (HTTP ${res.status})`
        });
      } else {
        // Error 5xx o temporal: conservar como pendiente y detener el lote
        remainingQueue.push({
          ...item,
          status: 'pending',
          attempts: (item.attempts || 0) + 1,
          error: `Servidor temporalmente no disponible (HTTP ${res.status})`
        });
        remainingQueue.push(...queue.slice(i + 1));
        break;
      }
    } catch (err) {
      // Se perdió la conexión durante la sincronización: conservar resto de la cola
      setOnDemandConnectivity({
        isOnline: typeof navigator !== 'undefined' ? Boolean(navigator.onLine) : false,
        isPageAccessible: false,
        lastError: 'Se interrumpió la conexión durante la sincronización.'
      });
      remainingQueue.push({
        ...item,
        status: 'pending',
        attempts: (item.attempts || 0) + 1,
        error: err?.message || 'Error de red al sincronizar'
      });
      remainingQueue.push(...queue.slice(i + 1));
      break;
    }
  }

  saveOfflineQueue(remainingQueue);
  const now = new Date().toISOString();
  if (syncedCount > 0) {
    updateOnDemandMeta({ lastSyncedAt: now });
  }
  setOnDemandConnectivity({ isSyncing: false, lastSyncedAt: syncedCount > 0 ? now : _status.lastSyncedAt });

  return {
    syncedCount,
    failedCount,
    remaining: remainingQueue.length
  };
};
