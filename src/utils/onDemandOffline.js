/**
 * Motor OnDemand v2 (Offline-First, IndexedDB + Espejo Síncrono, Cola Aislada por Usuario,
 * Idempotencia, Control de Versión Base y Sincronización Incremental)
 */

const IDB_NAME = 'inv_ondemand_idb_v2';
const IDB_VERSION = 1;

const SNAPSHOT_PREFIX = 'inv_ondemand_snap_v1_';
const QUEUE_STORAGE_KEY = 'inv_ondemand_queue_v1';
const USER_QUEUE_PREFIX = 'inv_ondemand_queue_u_';
const USER_SYNCED_PREFIX = 'inv_ondemand_synced_u_';
const KNOWN_USERS_KEY = 'inv_ondemand_known_users_v1';
const META_STORAGE_KEY = 'inv_ondemand_meta_v1';
const ALIVE_SENTINEL_KEY = '__ondemand_alive__';
const MAX_SYNCED_HISTORY = 30;

const isBrowserOnline = () =>
  typeof navigator === 'undefined' || navigator.onLine !== false;

// Cachés en memoria respaldados por IndexedDB y localStorage
const _memorySnapshots = new Map();
const _memoryQueuesByUser = new Map();
const _memorySyncedByUser = new Map();
let _memoryMeta = {};
let _hasWrittenToLocalStorage = false;
let _idbPromise = null;

const loadInitialActiveUser = () => {
  if (typeof localStorage === 'undefined') return { id: null, username: null };
  try {
    const raw = localStorage.getItem('inv_current_user');
    if (!raw) return { id: null, username: null };
    const parsed = JSON.parse(raw);
    if (parsed && parsed.id !== undefined && parsed.id !== null) {
      return { id: String(parsed.id), username: parsed.username || 'Usuario' };
    }
  } catch {
    // Ignorar error de parseo
  }
  return { id: null, username: null };
};

let _activeUser = loadInitialActiveUser();
let _loggedOut = false;

// Estado reactivo global del motor OnDemand
let _status = {
  isOnline: isBrowserOnline(),
  isPageAccessible: true,
  dbConnected: true,
  isSyncing: false,
  waitingAuth: false,
  lastCheckedAt: null,
  lastSyncedAt: null,
  lastCachedAt: null,
  lastError: null
};

const markLocalStorageAlive = () => {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(ALIVE_SENTINEL_KEY, '1');
    _hasWrittenToLocalStorage = true;
  } catch {
    // Ignorar
  }
};

/**
 * Si localStorage fue limpiado externamente (ej. store.clear() en pruebas unitarias),
 * sincroniza los cachés en memoria para evitar fugas de estado entre ejecuciones.
 */
const ensureStorageCoherence = () => {
  if (typeof localStorage === 'undefined') return;
  if (_hasWrittenToLocalStorage && localStorage.getItem(ALIVE_SENTINEL_KEY) === null) {
    _memorySnapshots.clear();
    _memoryQueuesByUser.clear();
    _memorySyncedByUser.clear();
    _memoryMeta = {};
    _activeUser = loadInitialActiveUser();
    _loggedOut = false;
    _status.waitingAuth = false;
    _hasWrittenToLocalStorage = false;
  }
};

const notifyStatusChange = () => {
  if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
    window.dispatchEvent(new CustomEvent('ondemand:status-change', { detail: { ..._status } }));
  }
};

const notifyQueueChange = (queue) => {
  if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
    window.dispatchEvent(new CustomEvent('ondemand:queue-change', { detail: { queue } }));
  }
};

const notifySyncedHistoryChange = (history) => {
  if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
    window.dispatchEvent(new CustomEvent('ondemand:synced-history-change', { detail: { history } }));
  }
};

/**
 * Abre la base de datos IndexedDB (inv_ondemand_idb_v2) sin dependencias externas
 */
export const openOnDemandDB = () => {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null);
  if (_idbPromise) return _idbPromise;

  _idbPromise = new Promise((resolve) => {
    try {
      const req = indexedDB.open(IDB_NAME, IDB_VERSION);
      req.onupgradeneeded = (event) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains('snapshots')) {
          db.createObjectStore('snapshots', { keyPath: 'key' });
        }
        if (!db.objectStoreNames.contains('queues')) {
          db.createObjectStore('queues', { keyPath: 'userKey' });
        }
        if (!db.objectStoreNames.contains('synced_history')) {
          db.createObjectStore('synced_history', { keyPath: 'userKey' });
        }
        if (!db.objectStoreNames.contains('meta')) {
          db.createObjectStore('meta', { keyPath: 'key' });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => {
        _idbPromise = null;
        resolve(null);
      };
    } catch {
      _idbPromise = null;
      resolve(null);
    }
  });

  return _idbPromise;
};

const idbPut = async (storeName, record) => {
  const db = await openOnDemandDB();
  if (!db) return false;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      store.put(record);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
    } catch {
      resolve(false);
    }
  });
};

const idbGetAll = async (storeName) => {
  const db = await openOnDemandDB();
  if (!db) return [];
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(storeName, 'readonly');
      const store = tx.objectStore(storeName);
      const req = store.getAll();
      req.onsuccess = () => resolve(Array.isArray(req.result) ? req.result : []);
      req.onerror = () => resolve([]);
    } catch {
      resolve([]);
    }
  });
};

/**
 * Hidrata los cachés en memoria desde IndexedDB al iniciar la aplicación
 */
export const hydrateOnDemandFromIndexedDB = async (userId = null) => {
  if (userId !== null && userId !== undefined) {
    _activeUser = { id: String(userId), username: _activeUser.username || 'Usuario' };
    _loggedOut = false;
  }
  const db = await openOnDemandDB();
  if (!db) return false;

  try {
    const [snapshots, queues, syncedRecords, metaRecords] = await Promise.all([
      idbGetAll('snapshots'),
      idbGetAll('queues'),
      idbGetAll('synced_history'),
      idbGetAll('meta')
    ]);

    snapshots.forEach((rec) => {
      if (rec && rec.key !== undefined && rec.data !== undefined) {
        _memorySnapshots.set(rec.key, rec.data);
      }
    });

    queues.forEach((rec) => {
      if (rec && rec.userKey && Array.isArray(rec.queue)) {
        _memoryQueuesByUser.set(rec.userKey, rec.queue);
      }
    });

    syncedRecords.forEach((rec) => {
      if (rec && rec.userKey && Array.isArray(rec.history)) {
        _memorySyncedByUser.set(rec.userKey, rec.history);
      }
    });

    metaRecords.forEach((rec) => {
      if (rec && rec.key === 'global' && rec.data && typeof rec.data === 'object') {
        _memoryMeta = { ...rec.data, ..._memoryMeta };
        if (_memoryMeta.lastCachedAt) _status.lastCachedAt = _memoryMeta.lastCachedAt;
        if (_memoryMeta.lastSyncedAt) _status.lastSyncedAt = _memoryMeta.lastSyncedAt;
      }
    });

    const activeQueue = getOfflineQueue();
    notifyQueueChange(activeQueue);
    notifyStatusChange();
    if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
      window.dispatchEvent(
        new CustomEvent('ondemand:idb-hydrated', {
          detail: {
            snapshotsCount: snapshots.length,
            queueCount: activeQueue.length
          }
        })
      );
    }
    return true;
  } catch {
    return false;
  }
};

const registerKnownUser = (userId) => {
  if (!userId || userId === 'default' || typeof localStorage === 'undefined') return;
  try {
    const raw = localStorage.getItem(KNOWN_USERS_KEY);
    const list = raw ? JSON.parse(raw) : [];
    const safeList = Array.isArray(list) ? list : [];
    const strId = String(userId);
    if (!safeList.includes(strId)) {
      safeList.push(strId);
      localStorage.setItem(KNOWN_USERS_KEY, JSON.stringify(safeList));
      markLocalStorageAlive();
    }
  } catch {
    // Ignorar
  }
};

const getKnownUsersFromStorage = () => {
  const users = new Set();
  for (const key of _memoryQueuesByUser.keys()) {
    if (key.startsWith('user_')) {
      users.add(key.slice(5));
    }
  }
  if (typeof localStorage !== 'undefined') {
    try {
      const raw = localStorage.getItem(KNOWN_USERS_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      if (Array.isArray(parsed)) {
        parsed.forEach((u) => {
          if (u && u !== 'default') users.add(String(u));
        });
      }
    } catch {
      // Ignorar
    }
    try {
      Object.keys(localStorage).forEach((k) => {
        if (k.startsWith(USER_QUEUE_PREFIX)) {
          const uid = k.slice(USER_QUEUE_PREFIX.length);
          if (uid && uid !== 'default') users.add(uid);
        }
      });
    } catch {
      // Ignorar si localStorage mock no soporta Object.keys
    }
  }
  return Array.from(users);
};

/**
 * Resuelve el identificador de cola según el usuario activo o explícito.
 * Devuelve null si la sesión fue cerrada explícitamente para no exponer ni mezclar colas.
 */
const resolveUserId = (explicitUserId = undefined) => {
  ensureStorageCoherence();
  if (explicitUserId !== undefined && explicitUserId !== null && explicitUserId !== '') {
    return String(explicitUserId);
  }
  if (_activeUser.id !== null && _activeUser.id !== undefined) {
    return String(_activeUser.id);
  }
  if (!_loggedOut && typeof localStorage !== 'undefined') {
    const fromStorage = loadInitialActiveUser();
    if (fromStorage.id !== null) {
      _activeUser = fromStorage;
      return String(fromStorage.id);
    }
  }
  if (_loggedOut) {
    return null;
  }
  return 'default';
};

const toUserKey = (userId) => (userId === 'default' ? 'default' : `user_${userId}`);
const toStorageQueueKey = (userId) =>
  userId === 'default' ? QUEUE_STORAGE_KEY : `${USER_QUEUE_PREFIX}${userId}`;
const toStorageSyncedKey = (userId) => `${USER_SYNCED_PREFIX}${userId}`;

/**
 * Configura el usuario activo para aislar su cola de operaciones offline.
 * Al cerrar sesión (user = null), NO borra las operaciones pendientes del usuario anterior;
 * quedan resguardadas bajo su propio userId.
 */
export const setActiveOfflineUser = (user, options = {}) => {
  ensureStorageCoherence();
  if (user && user.id !== undefined && user.id !== null) {
    _activeUser = {
      id: String(user.id),
      username: user.username || 'Usuario'
    };
    _loggedOut = false;
    registerKnownUser(_activeUser.id);

    // Si había operaciones en 'waiting_auth' para este usuario, reactivarlas a 'pending'
    const currentQueue = getOfflineQueue(_activeUser.id);
    let reactivated = false;
    const updatedQueue = currentQueue.map((item) => {
      if (item.status === 'waiting_auth') {
        reactivated = true;
        return { ...item, status: 'pending', error: null };
      }
      return item;
    });
    if (reactivated) {
      saveOfflineQueue(updatedQueue, _activeUser.id);
    } else {
      notifyQueueChange(currentQueue);
    }

    if (_status.waitingAuth) {
      setOnDemandConnectivity({ waitingAuth: false, lastError: null });
    } else {
      notifyStatusChange();
    }
    notifySyncedHistoryChange(getSyncedHistory(_activeUser.id));
    return { ..._activeUser };
  }

  // Logout o sesión expirada: proteger la cola del usuario saliente sin eliminarla
  _activeUser = { id: null, username: null };
  _loggedOut = options.reset ? false : true;
  if (options.sessionExpired) {
    setOnDemandConnectivity({
      waitingAuth: true,
      isSyncing: false,
      lastError: 'Sesión expirada. Inicia sesión para reanudar la sincronización.'
    });
  } else {
    notifyStatusChange();
  }
  notifyQueueChange([]);
  notifySyncedHistoryChange([]);
  return { ..._activeUser };
};

export const getActiveOfflineUser = () => ({ ..._activeUser });

/**
 * Obtiene los metadatos persistidos de OnDemand (fechas de caché, cursores y sincronización)
 */
export const getOnDemandMeta = () => {
  ensureStorageCoherence();
  if (typeof localStorage !== 'undefined') {
    try {
      const raw = localStorage.getItem(META_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        _memoryMeta = { ..._memoryMeta, ...parsed };
        return { ..._memoryMeta };
      }
    } catch {
      // Fallback a memoria
    }
  }
  return { ..._memoryMeta };
};

export const updateOnDemandMeta = (patch) => {
  ensureStorageCoherence();
  if (!patch || typeof patch !== 'object') return { ..._memoryMeta };
  const current = getOnDemandMeta();
  const updated = { ...current, ...patch };
  _memoryMeta = updated;

  if (patch.lastCachedAt) _status.lastCachedAt = patch.lastCachedAt;
  if (patch.lastSyncedAt) _status.lastSyncedAt = patch.lastSyncedAt;

  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.setItem(META_STORAGE_KEY, JSON.stringify(updated));
      markLocalStorageAlive();
    } catch {
      // Ignorar si localStorage está lleno
    }
  }
  idbPut('meta', { key: 'global', data: updated, updatedAt: new Date().toISOString() });
  return { ...updated };
};

// Inicializar timestamps desde localStorage
const initialMeta = getOnDemandMeta();
if (initialMeta.lastCachedAt) _status.lastCachedAt = initialMeta.lastCachedAt;
if (initialMeta.lastSyncedAt) _status.lastSyncedAt = initialMeta.lastSyncedAt;

/**
 * Guarda una instantánea (snapshot) de una colección en memoria, localStorage e IndexedDB
 */
export const saveLocalSnapshot = (key, data) => {
  ensureStorageCoherence();
  if (!key || data === undefined) return false;
  _memorySnapshots.set(key, data);
  const now = new Date().toISOString();

  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.setItem(`${SNAPSHOT_PREFIX}${key}`, JSON.stringify(data));
      markLocalStorageAlive();
    } catch (err) {
      console.warn(`[OnDemand] Fallback a IndexedDB/memoria para snapshot '${key}':`, err?.message);
    }
  }

  updateOnDemandMeta({ lastCachedAt: now });
  idbPut('snapshots', { key, data, updatedAt: now });
  return true;
};

/**
 * Carga una instantánea (snapshot) desde localStorage o caché en memoria hidratado por IndexedDB
 */
export const loadLocalSnapshot = (key, fallback = []) => {
  ensureStorageCoherence();
  if (typeof localStorage !== 'undefined') {
    try {
      const raw = localStorage.getItem(`${SNAPSHOT_PREFIX}${key}`);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed !== null && parsed !== undefined) {
          _memorySnapshots.set(key, parsed);
          return parsed;
        }
      }
    } catch {
      // Continuar a caché en memoria
    }
  }
  if (_memorySnapshots.has(key)) {
    const cached = _memorySnapshots.get(key);
    return cached !== null && cached !== undefined ? cached : fallback;
  }
  return fallback;
};

/**
 * Obtiene la cola de operaciones pendientes para el usuario activo (o el userId indicado)
 */
export const getOfflineQueue = (userId = undefined) => {
  const resolvedId = resolveUserId(userId);
  if (!resolvedId) return [];

  const userKey = toUserKey(resolvedId);
  const storageKey = toStorageQueueKey(resolvedId);

  if (typeof localStorage !== 'undefined') {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          _memoryQueuesByUser.set(userKey, parsed);
          return parsed;
        }
      }
    } catch {
      // Fallback a memoria
    }
  }

  if (_memoryQueuesByUser.has(userKey)) {
    const memQueue = _memoryQueuesByUser.get(userKey);
    return Array.isArray(memQueue) ? [...memQueue] : [];
  }

  return [];
};

/**
 * Persiste la cola de operaciones pendientes para el usuario activo (o el userId indicado)
 */
export const saveOfflineQueue = (queue, userId = undefined) => {
  const resolvedId = resolveUserId(userId);
  if (!resolvedId) return;

  const safeQueue = Array.isArray(queue) ? queue : [];
  const userKey = toUserKey(resolvedId);
  const storageKey = toStorageQueueKey(resolvedId);

  _memoryQueuesByUser.set(userKey, safeQueue);
  registerKnownUser(resolvedId);

  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.setItem(storageKey, JSON.stringify(safeQueue));
      if (resolvedId !== 'default') {
        // Mantener espejo en clave legacy solo como referencia si es el usuario activo
        localStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(safeQueue));
      }
      markLocalStorageAlive();
    } catch (err) {
      console.warn('[OnDemand] Error guardando cola offline en localStorage:', err?.message);
    }
  }

  idbPut('queues', {
    userKey,
    userId: resolvedId,
    queue: safeQueue,
    updatedAt: new Date().toISOString()
  });

  const activeId = resolveUserId();
  if (activeId === resolvedId) {
    notifyQueueChange(safeQueue);
  }
};

/**
 * Obtiene el resumen de operaciones pendientes pertenecientes a OTRAS cuentas de usuario en este equipo
 */
export const getOtherUsersPendingSummary = (currentUserId = _activeUser.id) => {
  ensureStorageCoherence();
  const knownUsers = getKnownUsersFromStorage();
  const accounts = [];
  let totalCount = 0;

  knownUsers.forEach((uid) => {
    if (!uid || uid === 'default') return;
    if (currentUserId !== null && currentUserId !== undefined && String(uid) === String(currentUserId)) {
      return;
    }
    const q = getOfflineQueue(uid);
    if (Array.isArray(q) && q.length > 0) {
      const username = q[0]?.username || `Usuario #${uid}`;
      accounts.push({
        userId: String(uid),
        username,
        count: q.length
      });
      totalCount += q.length;
    }
  });

  return { totalCount, accounts };
};

/**
 * Obtiene el historial reciente de operaciones sincronizadas del usuario
 */
export const getSyncedHistory = (userId = undefined) => {
  const resolvedId = resolveUserId(userId);
  if (!resolvedId) return [];

  const userKey = toUserKey(resolvedId);
  const storageKey = toStorageSyncedKey(resolvedId);

  if (typeof localStorage !== 'undefined') {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          _memorySyncedByUser.set(userKey, parsed);
          return parsed;
        }
      }
    } catch {
      // Fallback a memoria
    }
  }

  if (_memorySyncedByUser.has(userKey)) {
    return [...(_memorySyncedByUser.get(userKey) || [])];
  }
  return [];
};

const recordSyncedOperation = (item, userId = undefined) => {
  const resolvedId = resolveUserId(userId) || item?.userId || 'default';
  const userKey = toUserKey(resolvedId);
  const storageKey = toStorageSyncedKey(resolvedId);

  const current = getSyncedHistory(resolvedId);
  const syncedEntry = {
    ...item,
    status: 'synced',
    error: null,
    syncedAt: new Date().toISOString()
  };

  const filtered = current.filter((h) => h.id !== syncedEntry.id);
  const updated = [syncedEntry, ...filtered].slice(0, MAX_SYNCED_HISTORY);

  _memorySyncedByUser.set(userKey, updated);
  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.setItem(storageKey, JSON.stringify(updated));
      markLocalStorageAlive();
    } catch {
      // Ignorar
    }
  }
  idbPut('synced_history', {
    userKey,
    userId: resolvedId,
    history: updated,
    updatedAt: new Date().toISOString()
  });

  if (resolveUserId() === resolvedId) {
    notifySyncedHistoryChange(updated);
  }
  return syncedEntry;
};

/**
 * Consulta el estado de sincronización de una entidad específica (producto, movimiento, corte)
 */
export const getEntitySyncState = (module, entityId, userId = undefined) => {
  if (entityId === null || entityId === undefined) {
    return { state: 'synced', label: 'Sincronizado', operation: null };
  }
  const strEntityId = String(entityId);
  const queue = getOfflineQueue(userId);

  const matchingQueueItems = queue.filter(
    (item) =>
      String(item.entityId) === strEntityId &&
      (!module || !item.module || item.module === module)
  );

  const conflictItem = matchingQueueItems.find((item) => item.status === 'conflict');
  if (conflictItem) {
    return {
      state: 'conflict',
      label: 'Requiere revisión',
      operation: conflictItem
    };
  }

  const pendingItem = matchingQueueItems.find(
    (item) =>
      item.status === 'pending' ||
      item.status === 'syncing' ||
      item.status === 'waiting_auth'
  );
  if (pendingItem) {
    return {
      state: 'pending',
      label: 'Pendiente de sincronizar',
      operation: pendingItem
    };
  }

  const history = getSyncedHistory(userId);
  const syncedItem = history.find(
    (item) =>
      String(item.entityId) === strEntityId &&
      (!module || !item.module || item.module === module)
  );
  if (syncedItem) {
    return {
      state: 'synced',
      label: 'Sincronizado',
      operation: syncedItem
    };
  }

  return { state: 'synced', label: 'Sincronizado', operation: null };
};

/**
 * Registra una operación realizada sin internet con metadatos de auditoría, usuario,
 * clave de idempotencia y versión base para detección de conflictos.
 */
export const enqueueOfflineOperation = ({
  type,
  module = 'general',
  label,
  method = 'POST',
  endpoint,
  body = null,
  entityId = null,
  userId = undefined,
  username = undefined,
  baseVersion = null,
  idempotencyKey = undefined
}) => {
  ensureStorageCoherence();
  const targetUserId =
    userId !== undefined && userId !== null && userId !== ''
      ? String(userId)
      : _activeUser.id !== null
        ? String(_activeUser.id)
        : 'default';

  const targetUsername =
    username !== undefined && username !== null && username !== ''
      ? String(username)
      : _activeUser.username || 'Sistema';

  const queue = getOfflineQueue(targetUserId);
  const generatedId =
    idempotencyKey ||
    (typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `od-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);

  const op = {
    id: generatedId,
    idempotencyKey: generatedId,
    userId: targetUserId,
    username: targetUsername,
    type: type || `${method.toUpperCase()}_${module.toUpperCase()}`,
    module,
    label: label || `Operación offline (${method.toUpperCase()} ${endpoint})`,
    method: method.toUpperCase(),
    endpoint,
    body,
    entityId,
    baseVersion: baseVersion || null,
    status: 'pending', // 'pending' | 'syncing' | 'conflict' | 'waiting_auth'
    error: null,
    conflictCode: null,
    serverRecord: null,
    forceOverwrite: false,
    attempts: 0,
    createdAt: new Date().toISOString()
  };

  // Coalescencia de operaciones PUT consecutivas sobre la misma entidad y usuario,
  // preservando el baseVersion original capturado antes del primer cambio offline.
  if (op.method === 'PUT' && entityId !== null && entityId !== undefined) {
    const existingIdx = queue.findIndex(
      (item) =>
        String(item.entityId) === String(entityId) &&
        item.endpoint === endpoint &&
        item.method === 'PUT' &&
        item.status === 'pending' &&
        String(item.userId || 'default') === String(targetUserId)
    );
    if (existingIdx !== -1) {
      const existing = queue[existingIdx];
      queue[existingIdx] = {
        ...existing,
        body: { ...(existing.body || {}), ...(body || {}) },
        baseVersion:
          existing.baseVersion !== null && existing.baseVersion !== undefined
            ? existing.baseVersion
            : op.baseVersion,
        label: op.label,
        createdAt: op.createdAt
      };
      saveOfflineQueue(queue, targetUserId);
      return queue[existingIdx];
    }
  }

  queue.push(op);
  saveOfflineQueue(queue, targetUserId);
  return op;
};

/**
 * Reintenta una operación en estado de conflicto o espera, permitiendo forzar la sobrescritura
 */
export const retryOfflineOperation = (opId, { forceOverwrite = false, userId = undefined } = {}) => {
  const targetUserId = resolveUserId(userId);
  if (!targetUserId) return null;

  const queue = getOfflineQueue(targetUserId);
  const idx = queue.findIndex((item) => item.id === opId);
  if (idx === -1) return null;

  const item = queue[idx];
  const updatedBody =
    forceOverwrite && item.body && typeof item.body === 'object' && !Array.isArray(item.body)
      ? { ...item.body, forceOverwrite: true }
      : item.body;

  const updatedItem = {
    ...item,
    status: 'pending',
    error: null,
    conflictCode: null,
    forceOverwrite: Boolean(forceOverwrite || item.forceOverwrite),
    body: updatedBody
  };

  queue[idx] = updatedItem;
  saveOfflineQueue(queue, targetUserId);
  return updatedItem;
};

/**
 * Elimina una operación específica de la cola offline del usuario activo
 */
export const removeOfflineOperation = (opId, userId = undefined) => {
  const targetUserId = resolveUserId(userId);
  if (!targetUserId) return [];
  const queue = getOfflineQueue(targetUserId).filter((item) => item.id !== opId);
  saveOfflineQueue(queue, targetUserId);
  return queue;
};

/**
 * Limpia las operaciones pendientes de la cola offline del usuario activo
 */
export const clearOfflineQueue = (userId = undefined) => {
  ensureStorageCoherence();
  const targetUserId = resolveUserId(userId) || 'default';
  saveOfflineQueue([], targetUserId);
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
  const prevWaitingAuth = _status.waitingAuth;
  _status = {
    ..._status,
    ...patch,
    lastCheckedAt: new Date().toISOString()
  };
  if (
    prevOnline !== _status.isOnline ||
    prevAccessible !== _status.isPageAccessible ||
    prevWaitingAuth !== _status.waitingAuth ||
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
 * Sincroniza en estricto orden FIFO las operaciones de la cola del usuario activo con el servidor web,
 * enviando cabeceras de idempotencia y versión base, pausando en 401 sin perder datos y aislando 409.
 */
export const syncOfflineQueueWithServer = async ({
  apiFetch,
  apiBaseUrl = '',
  currentUser = null,
  onProgress
}) => {
  ensureStorageCoherence();
  const effectiveUserId =
    currentUser?.id !== undefined && currentUser?.id !== null
      ? String(currentUser.id)
      : resolveUserId();

  if (_loggedOut && !effectiveUserId) {
    return { syncedCount: 0, failedCount: 0, remaining: 0, waitingAuth: true };
  }

  const queue = getOfflineQueue(effectiveUserId);
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

  setOnDemandConnectivity({ isSyncing: true, waitingAuth: false });

  let syncedCount = 0;
  let failedCount = 0;
  let waitingAuth = false;
  const remainingQueue = [];

  for (let i = 0; i < queue.length; i++) {
    const item = queue[i];

    // Protección estricta por usuario: jamás enviar operaciones de otra cuenta bajo el usuario actual
    if (
      item.userId &&
      item.userId !== 'default' &&
      effectiveUserId &&
      effectiveUserId !== 'default' &&
      String(item.userId) !== String(effectiveUserId)
    ) {
      const otherQueue = getOfflineQueue(item.userId);
      if (!otherQueue.some((op) => op.id === item.id)) {
        saveOfflineQueue([...otherQueue, item], item.userId);
      }
      continue;
    }

    if (typeof onProgress === 'function') {
      onProgress({ current: i + 1, total: queue.length, item });
    }

    try {
      const url = item.endpoint.startsWith('http')
        ? item.endpoint
        : `${apiBaseUrl}${item.endpoint}`;

      const idempKey = item.idempotencyKey || item.id;
      const headers = {
        'Content-Type': 'application/json',
        'X-Idempotency-Key': idempKey,
        'X-Operation-User-Id': String(item.userId || effectiveUserId || '')
      };

      if (item.baseVersion !== null && item.baseVersion !== undefined) {
        headers['X-Base-Version'] =
          typeof item.baseVersion === 'string'
            ? item.baseVersion
            : JSON.stringify(item.baseVersion);
      }
      if (item.forceOverwrite) {
        headers['X-Force-Overwrite'] = 'true';
      }

      const options = {
        method: item.method || 'POST',
        headers
      };

      if (item.body !== null && item.body !== undefined && item.method !== 'GET' && item.method !== 'DELETE') {
        const bodyPayload =
          typeof item.body === 'object' && !Array.isArray(item.body)
            ? {
                ...item.body,
                idempotencyKey: idempKey,
                ...(item.baseVersion !== null && item.baseVersion !== undefined
                  ? { baseVersion: item.baseVersion }
                  : {}),
                ...(item.forceOverwrite ? { forceOverwrite: true } : {})
              }
            : item.body;
        options.body = JSON.stringify(bodyPayload);
      }

      const res = await apiFetch(url, options);

      if (res.status === 401) {
        // Sesión expirada: NO borrar ni marcar conflicto; pausar en waiting_auth
        waitingAuth = true;
        const authMsg =
          'Sesión expirada. Inicia sesión nuevamente con tu cuenta para reanudar el envío automático.';
        remainingQueue.push({
          ...item,
          status: 'waiting_auth',
          error: authMsg
        });
        for (let j = i + 1; j < queue.length; j++) {
          remainingQueue.push({
            ...queue[j],
            status: 'waiting_auth',
            error: authMsg
          });
        }
        break;
      } else if (res.ok) {
        syncedCount++;
        recordSyncedOperation(item, effectiveUserId);
      } else if (
        res.status === 409 ||
        (res.status >= 400 && res.status < 500 && res.status !== 408 && res.status !== 429)
      ) {
        const errData = await res.json().catch(() => ({}));
        failedCount++;
        remainingQueue.push({
          ...item,
          status: 'conflict',
          conflictCode: errData.code || (res.status === 409 ? 'CONFLICT' : 'VALIDATION_ERROR'),
          serverRecord: errData.serverRecord || null,
          attempts: (item.attempts || 0) + 1,
          error: errData.error || `Requiere revisión (HTTP ${res.status})`
        });
      } else {
        // Error 5xx, 408 o 429: conservar como pendiente y detener el lote
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

  saveOfflineQueue(remainingQueue, effectiveUserId);

  if (waitingAuth) {
    setOnDemandConnectivity({
      isSyncing: false,
      waitingAuth: true,
      lastError: 'Sesión expirada. Inicia sesión para reanudar la sincronización.'
    });
    return {
      syncedCount,
      failedCount,
      remaining: remainingQueue.length,
      waitingAuth: true
    };
  }

  const now = new Date().toISOString();
  if (syncedCount > 0) {
    updateOnDemandMeta({ lastSyncedAt: now });
  }
  setOnDemandConnectivity({
    isSyncing: false,
    waitingAuth: false,
    lastSyncedAt: syncedCount > 0 ? now : _status.lastSyncedAt
  });

  return {
    syncedCount,
    failedCount,
    remaining: remainingQueue.length
  };
};
