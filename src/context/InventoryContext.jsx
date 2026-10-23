import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import versionInfo from '../config/version.json';
import { CONTRACT_INFO, applyDynamicContractRates } from '../utils/contractRates';
import {
  saveLocalSnapshot,
  loadLocalSnapshot,
  getOfflineQueue,
  saveOfflineQueue,
  enqueueOfflineOperation,
  removeOfflineOperation,
  clearOfflineQueue,
  isNetworkOrOfflineError,
  setOnDemandConnectivity,
  getOnDemandStatus,
  checkPageAccessibility,
  syncOfflineQueueWithServer
} from '../utils/onDemandOffline';

const InventoryContext = createContext();

export const useInventory = () => useContext(InventoryContext);

// Base API URL from environment variable or empty for local proxy
const API_BASE_URL = import.meta.env.VITE_API_URL || '';

export const apiFetch = async (url, options = {}) => {
  const token = localStorage.getItem('inv_token');
  const headers = { ...options.headers };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  try {
    const response = await window.fetch(url, { ...options, headers });
    if (response.status === 502 || response.status === 503 || response.status === 504) {
      setOnDemandConnectivity({
        isOnline: typeof navigator !== 'undefined' ? Boolean(navigator.onLine) : true,
        isPageAccessible: false,
        lastError: `El servidor de la página no está disponible (HTTP ${response.status}).`
      });
    } else {
      setOnDemandConnectivity({
        isOnline: true,
        isPageAccessible: true,
        lastError: null
      });
    }
    if (response.status === 401 && !url.includes('/auth/login')) {
      localStorage.removeItem('inv_token');
      localStorage.removeItem('inv_current_user');
      localStorage.removeItem('inv_session_id');
      window.dispatchEvent(new CustomEvent('auth:unauthorized'));
    }
    return response;
  } catch (err) {
    if (isNetworkOrOfflineError(err)) {
      setOnDemandConnectivity({
        isOnline: typeof navigator !== 'undefined' ? Boolean(navigator.onLine) : false,
        isPageAccessible: false,
        lastError: typeof navigator !== 'undefined' && !navigator.onLine
          ? 'Sin conexión a Internet en el dispositivo.'
          : 'La página web o el servidor no son accesibles en este momento.'
      });
    }
    throw err;
  }
};

const INITIAL_VERSION_LIST = [
  {
    id: versionInfo.build || 1,
    version: versionInfo.displayVersion || `v${versionInfo.version || '2.7.162'}`,
    date: (versionInfo.buildDate || versionInfo.updatedAt || new Date().toISOString()).slice(0, 10),
    time: '00:00',
    author: 'Sistema',
    description: 'Versión actual del sistema',
    changes: [],
    isPlaceholder: true
  }
];

let cachedSystemChangelog = null;

const loadSystemChangelog = async () => {
  if (cachedSystemChangelog) return cachedSystemChangelog;
  try {
    const mod = await import('../config/changelog');
    cachedSystemChangelog = Array.isArray(mod.SYSTEM_CHANGELOG) ? mod.SYSTEM_CHANGELOG : INITIAL_VERSION_LIST;
  } catch {
    cachedSystemChangelog = INITIAL_VERSION_LIST;
  }
  return cachedSystemChangelog;
};

// Fusionador seguro de versiones oficiales y creadas dinámicamente en BD
const mergeChangelog = (dbVersions = [], baseChangelog = cachedSystemChangelog || INITIAL_VERSION_LIST) => {
  const map = new Map();
  // 1. Agregar versiones del changelog oficial
  if (Array.isArray(baseChangelog)) {
    baseChangelog.forEach(v => {
      const key = (v?.version || '').toLowerCase();
      if (key) {
        map.set(key, v);
      }
    });
  }
  // 2. Agregar o sobreescribir versiones provenientes de la base de datos
  if (Array.isArray(dbVersions)) {
    dbVersions.forEach(v => {
      const key = (v?.version || '').toLowerCase();
      if (key) {
        if (v.isPlaceholder && map.has(key)) return;
        map.set(key, { ...map.get(key), ...v });
      }
    });
  }
  return Array.from(map.values());
};

export const InventoryProvider = ({ children }) => {
  // Hidratación inicial inmediata desde instantáneas locales OnDemand para funcionar sin internet
  const [products, setProducts] = useState(() => loadLocalSnapshot('products', []));
  const [movements, setMovements] = useState(() => loadLocalSnapshot('movements', []));
  const [categories, setCategories] = useState(() => loadLocalSnapshot('categories', []));
  const [documentTypes, setDocumentTypes] = useState(() => loadLocalSnapshot('documentTypes', []));
  const [users, setUsers] = useState(() => loadLocalSnapshot('users', []));
  const [roles, setRoles] = useState(() => loadLocalSnapshot('roles', []));
  const [systemLogs, setSystemLogs] = useState([]);
  const [activeSessions, setActiveSessions] = useState([]);
  const [notifications, setNotifications] = useState(() => loadLocalSnapshot('notifications', []));
  const [currentUser, setCurrentUser] = useState(() => {
    const saved = localStorage.getItem('inv_current_user');
    return saved ? JSON.parse(saved) : null;
  });
  const [sessionId, setSessionId] = useState(() => {
    return localStorage.getItem('inv_session_id') || null;
  });
  const [settings, setSettings] = useState(() => loadLocalSnapshot('settings', {
    name: 'Inventario Pro',
    logo: null
  }));
  const [categoryUnits, setCategoryUnits] = useState(() => loadLocalSnapshot('categoryUnits', {}));
  const [versions, setVersions] = useState(INITIAL_VERSION_LIST);
  const [dailyCuts, setDailyCuts] = useState(() => loadLocalSnapshot('dailyCuts', []));
  const [cutHistoryModalOpen, setCutHistoryModalOpen] = useState(false);
  const [selectedCutForSummary, setSelectedCutForSummary] = useState(null);
  const [contractRates, setContractRates] = useState(() => loadLocalSnapshot('contractRates', CONTRACT_INFO));
  const [sipeContractStatus, setSipeContractStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [theme, setThemeState] = useState(() => localStorage.getItem('inv_theme') || 'light');

  // Estados reactivos de OnDemand (Offline + Sincronización diferida)
  const [onDemandStatus, setOnDemandStatus] = useState(() => getOnDemandStatus());
  const [offlineQueue, setOfflineQueue] = useState(() => getOfflineQueue());

  // Persistir instantáneas locales cada vez que cambian las colecciones principales
  useEffect(() => { if (products.length > 0) saveLocalSnapshot('products', products); }, [products]);
  useEffect(() => { if (movements.length > 0) saveLocalSnapshot('movements', movements); }, [movements]);
  useEffect(() => { if (categories.length > 0) saveLocalSnapshot('categories', categories); }, [categories]);
  useEffect(() => { if (documentTypes.length > 0) saveLocalSnapshot('documentTypes', documentTypes); }, [documentTypes]);
  useEffect(() => { if (users.length > 0) saveLocalSnapshot('users', users); }, [users]);
  useEffect(() => { if (roles.length > 0) saveLocalSnapshot('roles', roles); }, [roles]);
  useEffect(() => { if (dailyCuts.length > 0) saveLocalSnapshot('dailyCuts', dailyCuts); }, [dailyCuts]);
  useEffect(() => { if (settings?.name) saveLocalSnapshot('settings', settings); }, [settings]);
  useEffect(() => {
    if (categoryUnits && Object.keys(categoryUnits).length > 0) {
      saveLocalSnapshot('categoryUnits', categoryUnits);
    }
  }, [categoryUnits]);

  const fetchContractRates = async () => {
    try {
      const res = await apiFetch(`${API_BASE_URL}/api/contract-rates`);
      if (res.ok) {
        const data = await res.json();
        if (data && !data.error) {
          const updated = applyDynamicContractRates(data);
          setContractRates({ ...updated });
          saveLocalSnapshot('contractRates', updated);
          return updated;
        }
      }
    } catch {
      // Fallback silencioso a las tarifas locales en memoria
    }
    return CONTRACT_INFO;
  };

  const checkSipeContract = async () => {
    try {
      const res = await apiFetch(`${API_BASE_URL}/api/billing/contract-status`);
      if (res.ok) {
        const data = await res.json();
        setSipeContractStatus(data);
        return data;
      }
    } catch {
      // Ignorar si el endpoint no está disponible aún
    }
    return null;
  };


  const setTheme = (newTheme) => {
    setThemeState(newTheme);
    localStorage.setItem('inv_theme', newTheme);
    document.documentElement.setAttribute('data-theme', newTheme);
  };

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  // Listener para deslogueo reactivo sin recarga forzada
  useEffect(() => {
    const handleUnauthorized = () => {
      setCurrentUser(null);
      setSessionId(null);
      setLoading(false);
    };
    window.addEventListener('auth:unauthorized', handleUnauthorized);
    return () => window.removeEventListener('auth:unauthorized', handleUnauthorized);
  }, []);

  // Listeners para estado de conectividad y cola de operaciones de OnDemand
  useEffect(() => {
    const handleStatusChange = (e) => {
      if (e?.detail) setOnDemandStatus(e.detail);
    };
    const handleQueueChange = (e) => {
      if (e?.detail?.queue) setOfflineQueue(e.detail.queue);
    };
    const handleBrowserOnline = () => {
      setOnDemandConnectivity({ isOnline: true });
      checkPageAccessibility(API_BASE_URL);
    };
    const handleBrowserOffline = () => {
      setOnDemandConnectivity({
        isOnline: false,
        isPageAccessible: false,
        lastError: 'Sin conexión a Internet en el dispositivo.'
      });
    };

    window.addEventListener('ondemand:status-change', handleStatusChange);
    window.addEventListener('ondemand:queue-change', handleQueueChange);
    window.addEventListener('online', handleBrowserOnline);
    window.addEventListener('offline', handleBrowserOffline);

    // Chequeo inicial y monitoreo periódico de accesibilidad de la página
    checkPageAccessibility(API_BASE_URL);
    const healthTimer = setInterval(() => {
      checkPageAccessibility(API_BASE_URL);
    }, 25000);

    return () => {
      window.removeEventListener('ondemand:status-change', handleStatusChange);
      window.removeEventListener('ondemand:queue-change', handleQueueChange);
      window.removeEventListener('online', handleBrowserOnline);
      window.removeEventListener('offline', handleBrowserOffline);
      clearInterval(healthTimer);
    };
  }, []);

  const fetchJsonOrNull = (url) =>
    apiFetch(url)
      .then(res => (res && res.ok ? res.json() : null))
      .catch(() => null);

  // Carga diferida del historial completo de versiones sin bloquear el bundle inicial
  useEffect(() => {
    let active = true;
    loadSystemChangelog().then(loaded => {
      if (active) {
        setVersions(prev => mergeChangelog(prev, loaded));
      }
    });
    return () => { active = false; };
  }, []);

  const hydrateFromBootstrapData = useCallback((bootData) => {
    if (!bootData) return;
    if (Array.isArray(bootData.products)) setProducts(bootData.products);
    if (Array.isArray(bootData.movements)) setMovements(bootData.movements);
    if (Array.isArray(bootData.users)) {
      setUsers(bootData.users);
      setCurrentUser(prev => {
        if (!prev?.id) return prev;
        const freshSelf = bootData.users.find(u => Number(u.id) === Number(prev.id));
        if (freshSelf && freshSelf.permissions !== undefined) {
          const hasChanged =
            prev.role !== freshSelf.role ||
            prev.role_id !== freshSelf.role_id ||
            prev.roleName !== freshSelf.roleName ||
            JSON.stringify(prev.permissions) !== JSON.stringify(freshSelf.permissions);

          if (hasChanged) {
            return {
              ...prev,
              permissions: freshSelf.permissions,
              role: freshSelf.role,
              role_id: freshSelf.role_id,
              roleName: freshSelf.roleName
            };
          }
        }
        return prev;
      });
    }
    if (Array.isArray(bootData.roles)) setRoles(bootData.roles);
    if (Array.isArray(bootData.notifications)) {
      setNotifications(bootData.notifications);
      saveLocalSnapshot('notifications', bootData.notifications);
    }
    if (Array.isArray(bootData.dailyCuts)) setDailyCuts(bootData.dailyCuts);
    if (bootData.config && !bootData.config.error) {
      if (bootData.config.categories) setCategories(bootData.config.categories.map(c => c.name));
      if (bootData.config.docTypes) setDocumentTypes(bootData.config.docTypes.map(d => d.name));
      const units = {};
      if (bootData.config.categories) {
        bootData.config.categories.forEach(c => {
          units[c.name] = c.unit_type;
        });
        setCategoryUnits(units);
      }
    }
    if (bootData.settings && !bootData.settings.error && bootData.settings.name) {
      setSettings(bootData.settings);
    }
    if (bootData.contractRates && !bootData.contractRates.error) {
      const updated = applyDynamicContractRates(bootData.contractRates);
      setContractRates({ ...updated });
      saveLocalSnapshot('contractRates', updated);
    }
    if (Array.isArray(bootData.versions)) {
      loadSystemChangelog().then(base => setVersions(mergeChangelog(bootData.versions, base)));
    }
  }, []);

  // Initial Fetch (con respaldo instantáneo OnDemand si no hay internet)
  useEffect(() => {
    const fetchData = async () => {
      const token = localStorage.getItem('inv_token');
      if (!token) {
        setLoading(false);
        return;
      }

      // Si el navegador reporta estar sin internet y ya tenemos caché local, no bloquear la interfaz
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        setOnDemandConnectivity({
          isOnline: false,
          isPageAccessible: false,
          lastError: 'Sin conexión a Internet. Operando con datos locales OnDemand.'
        });
        setLoading(false);
        return;
      }

      // Fail-safe: Force stop loading after 6 seconds (o instantáneo si ya hay snapshot local)
      const hasCachedProducts = loadLocalSnapshot('products', []).length > 0;
      if (hasCachedProducts) {
        setLoading(false);
      }
      const timeoutId = setTimeout(() => {
        setLoading(false);
      }, 6000);

      try {
        if (!hasCachedProducts) setLoading(true);
        const bootData = await fetchJsonOrNull(`${API_BASE_URL}/api/bootstrap`);
        if (bootData && bootData.success) {
          clearTimeout(timeoutId);
          hydrateFromBootstrapData(bootData);
          return;
        }

        // Fallback a endpoints individuales si /api/bootstrap no está disponible
        fetchContractRates();
        const [prodRes, movRes, userRes, configRes, settingsRes, versionsRes, rolesRes, notifRes, cutsRes] = await Promise.all([
          fetchJsonOrNull(`${API_BASE_URL}/api/products`),
          fetchJsonOrNull(`${API_BASE_URL}/api/movements`),
          fetchJsonOrNull(`${API_BASE_URL}/api/users`),
          fetchJsonOrNull(`${API_BASE_URL}/api/config`),
          fetchJsonOrNull(`${API_BASE_URL}/api/settings`),
          fetchJsonOrNull(`${API_BASE_URL}/api/versions`),
          fetchJsonOrNull(`${API_BASE_URL}/api/roles`),
          fetchJsonOrNull(`${API_BASE_URL}/api/notifications`),
          fetchJsonOrNull(`${API_BASE_URL}/api/daily-cuts`)
        ]);
        
        clearTimeout(timeoutId);

        hydrateFromBootstrapData({
          products: prodRes,
          movements: movRes,
          users: userRes,
          config: configRes,
          settings: settingsRes,
          versions: versionsRes,
          roles: rolesRes,
          notifications: notifRes,
          dailyCuts: cutsRes
        });
      } catch (error) {
        console.error('Error fetching data:', error);
      } finally {
        setLoading(false);
        clearTimeout(timeoutId);
      }
    };

    fetchData();
  }, [hydrateFromBootstrapData]);

  // Heartbeat for active session tracking (every 20 seconds)
  useEffect(() => {
    if (!currentUser?.id) return;

    const sendHeartbeat = async () => {
      if (typeof navigator !== 'undefined' && !navigator.onLine) return;
      try {
        const storedSessionId = sessionId || localStorage.getItem('inv_session_id');
        const res = await apiFetch(`${API_BASE_URL}/api/active-sessions/heartbeat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sessionId: storedSessionId,
            userId: currentUser.id,
            username: currentUser.username,
            userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : ''
          })
        });
        const data = await res.json();
        if (data.sessionId && data.sessionId !== sessionId) {
          setSessionId(data.sessionId);
          localStorage.setItem('inv_session_id', data.sessionId);
        }
      } catch {}
    };

    sendHeartbeat();
    const interval = setInterval(sendHeartbeat, 20000); // Every 20 seconds
    return () => clearInterval(interval);
  }, [currentUser?.id, currentUser?.username, sessionId]);

  const fetchProducts = async () => {
    try {
      const res = await apiFetch(`${API_BASE_URL}/api/products`);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) setProducts(data);
        return data;
      }
    } catch (e) {
      console.error('Error fetching products:', e);
    }
    return products;
  };

  const fetchMovements = async () => {
    try {
      const res = await apiFetch(`${API_BASE_URL}/api/movements`);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) setMovements(data);
        return data;
      }
    } catch (e) {
      console.error('Error fetching movements:', e);
    }
    return movements;
  };

  const refreshModule = async (moduleName) => {
    if (!currentUser?.id) return;
    if (typeof navigator !== 'undefined' && !navigator.onLine) return;
    try {
      switch (moduleName) {
        case 'products':
          await fetchProducts();
          break;
        case 'movements':
          await fetchMovements();
          break;
        case 'inventory-count':
          await fetchProducts();
          break;
        case 'dashboard':
          await Promise.all([fetchProducts(), fetchMovements()]);
          break;
        case 'users':
        case 'roles':
        case 'security-users':
        case 'security-roles':
          await Promise.all([fetchUsers(), fetchRoles()]);
          break;
        case 'security':
        case 'security-sessions':
          await Promise.all([fetchUsers(), fetchRoles(), fetchActiveSessions()]);
          break;
        case 'summary2':
          await fetchDailyCuts();
          break;
        case 'insurance':
          await fetchInsuranceCuts();
          break;
        default:
          break;
      }
    } catch (err) {
      console.error(`Error al refrescar módulo ${moduleName}:`, err);
    }
  };

  const refreshData = useCallback(async () => {
    if (typeof navigator !== 'undefined' && !navigator.onLine) return;
    try {
      const bootData = await fetchJsonOrNull(`${API_BASE_URL}/api/bootstrap`);
      if (bootData && bootData.success) {
        hydrateFromBootstrapData(bootData);
        return;
      }

      fetchContractRates();
      const [prodRes, movRes, userRes, configRes, settingsRes, versionsRes, rolesRes, notifRes] = await Promise.all([
        fetchJsonOrNull(`${API_BASE_URL}/api/products`),
        fetchJsonOrNull(`${API_BASE_URL}/api/movements`),
        fetchJsonOrNull(`${API_BASE_URL}/api/users`),
        fetchJsonOrNull(`${API_BASE_URL}/api/config`),
        fetchJsonOrNull(`${API_BASE_URL}/api/settings`),
        fetchJsonOrNull(`${API_BASE_URL}/api/versions`),
        fetchJsonOrNull(`${API_BASE_URL}/api/roles`),
        fetchJsonOrNull(`${API_BASE_URL}/api/notifications`)
      ]);

      hydrateFromBootstrapData({
        products: prodRes,
        movements: movRes,
        users: userRes,
        config: configRes,
        settings: settingsRes,
        versions: versionsRes,
        roles: rolesRes,
        notifications: notifRes
      });
    } catch (error) {
      console.error('Error refreshing data:', error);
    }
  }, [hydrateFromBootstrapData]);

  // Funciones públicas de sincronización y gestión de cola OnDemand
  const syncOnDemandNow = useCallback(async () => {
    const result = await syncOfflineQueueWithServer({
      apiFetch,
      apiBaseUrl: API_BASE_URL
    });
    if (result.syncedCount > 0) {
      await refreshData();
    }
    return result;
  }, [refreshData]);

  const checkOnDemandConnection = useCallback(async () => {
    const status = await checkPageAccessibility(API_BASE_URL);
    if (status.isOnline && status.isPageAccessible && getOfflineQueue().length > 0) {
      await syncOnDemandNow();
    }
    return status;
  }, [syncOnDemandNow]);

  const removeOfflineQueueItem = useCallback((opId) => {
    return removeOfflineOperation(opId);
  }, []);

  const clearAllOfflineQueue = useCallback(() => {
    clearOfflineQueue();
  }, []);

  const importOfflineQueueItems = useCallback((items = []) => {
    const existing = getOfflineQueue();
    const existingIds = new Set(existing.map(i => i.id));
    let importedCount = 0;
    const merged = [...existing];
    items.forEach(item => {
      if (item && item.endpoint && item.method) {
        const cleanItem = {
          ...item,
          id: item.id && !existingIds.has(item.id) ? item.id : crypto.randomUUID(),
          status: 'pending',
          error: null
        };
        merged.push(cleanItem);
        importedCount++;
      }
    });
    saveOfflineQueue(merged);
    return importedCount;
  }, []);

  // Auto-sincronización al regresar el internet y estar accesible la página web
  useEffect(() => {
    const pendingItems = offlineQueue.filter(i => i.status !== 'conflict');
    if (
      onDemandStatus.isOnline &&
      onDemandStatus.isPageAccessible &&
      !onDemandStatus.isSyncing &&
      pendingItems.length > 0
    ) {
      const timer = setTimeout(() => {
        syncOnDemandNow();
      }, 1200);
      return () => clearTimeout(timer);
    }
  }, [onDemandStatus.isOnline, onDemandStatus.isPageAccessible, onDemandStatus.isSyncing, offlineQueue, syncOnDemandNow]);

  // Sync current user and session ID to local storage
  useEffect(() => {
    if (currentUser) {
      localStorage.setItem('inv_current_user', JSON.stringify(currentUser));
    } else {
      localStorage.removeItem('inv_current_user');
    }
  }, [currentUser]);

  useEffect(() => {
    if (sessionId) {
      localStorage.setItem('inv_session_id', sessionId);
    } else {
      localStorage.removeItem('inv_session_id');
    }
  }, [sessionId]);

  // Helper to determine if a user has Administrator privileges
  const isUserAdmin = (user) => {
    if (!user) return false;
    const role = String(user.role || '').toLowerCase();
    const roleName = String(user.roleName || '').toLowerCase();
    const username = String(user.username || '').toLowerCase();
    return (
      role === 'admin' ||
      role === 'administrador' ||
      roleName === 'admin' ||
      roleName === 'administrador' ||
      username === 'admin' ||
      user.role_id === 1
    );
  };

  // Permissions helper: Granular RBAC with Admin override and legacy parent compatibility
  const hasPermission = (module, action = 'view') => {
    if (!currentUser) return false;

    // 1. Matriz de permisos personalizada a nivel de usuario (Prioridad Máxima)
    if (currentUser.permissions && typeof currentUser.permissions === 'object') {
      const userMod = currentUser.permissions[module];
      if (userMod !== undefined && userMod !== null) {
        if (typeof userMod === 'object' && userMod[action] !== undefined) {
          return Boolean(userMod[action]);
        }
        if (typeof userMod === 'boolean') {
          return userMod;
        }
      }

      // Check legacy parent 'security' key for any security sub-module
      if (module.startsWith('security-')) {
        const secMod = currentUser.permissions['security'];
        if (secMod !== undefined && secMod !== null) {
          if (typeof secMod === 'object' && secMod[action] !== undefined) {
            return Boolean(secMod[action]);
          }
          if (typeof secMod === 'boolean') {
            return secMod;
          }
        }
      }
    }

    // 2. Permisos configurados en el Rol asignado al usuario
    if (roles && roles.length > 0) {
      const userRole = roles.find(r => 
        (currentUser.role_id && r.id === currentUser.role_id) || 
        (r.name && (
          r.name.toLowerCase() === String(currentUser.role || '').toLowerCase() || 
          r.name.toLowerCase() === String(currentUser.roleName || '').toLowerCase()
        ))
      );

      if (userRole && userRole.permissions && typeof userRole.permissions === 'object') {
        const roleMod = userRole.permissions[module];
        if (roleMod !== undefined && roleMod !== null) {
          if (typeof roleMod === 'object' && roleMod[action] !== undefined) {
            return Boolean(roleMod[action]);
          }
          if (typeof roleMod === 'boolean') {
            return roleMod;
          }
        }

        if (module.startsWith('security-')) {
          const roleSecMod = userRole.permissions['security'];
          if (roleSecMod !== undefined && roleSecMod !== null) {
            if (typeof roleSecMod === 'object' && roleSecMod[action] !== undefined) {
              return Boolean(roleSecMod[action]);
            }
            if (typeof roleSecMod === 'boolean') {
              return roleSecMod;
            }
          }
        }
      }
    }

    // 3. Fallback: Si no hay restricción explícita en usuario ni en rol, los administradores por defecto tienen acceso total
    const isAdmin = isUserAdmin(currentUser);
    if (isAdmin) return true;

    return false;
  };


  const canView = (module) => hasPermission(module, 'view');
  const canCreate = (module) => hasPermission(module, 'create');
  const canEdit = (module) => hasPermission(module, 'edit');
  const canDelete = (module) => hasPermission(module, 'delete');
  const canExport = (module) => hasPermission(module, 'export');

  const logAuditEvent = async (action, module, details) => {
    try {
      await apiFetch(`${API_BASE_URL}/api/system-logs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: currentUser?.id,
          username: currentUser?.username || 'Sistema',
          action,
          module,
          details
        })
      });
    } catch (e) {
      console.error('Error logging audit event:', e);
    }
  };

  const addProduct = async (product) => {
    const newProduct = { ...product, id: product.id || crypto.randomUUID() };
    const queueOfflineProduct = () => {
      setProducts(prev => [newProduct, ...prev]);
      enqueueOfflineOperation({
        type: 'CREATE_PRODUCT',
        module: 'products',
        label: `Nuevo producto: ${newProduct.sku || ''} - ${newProduct.description || ''}`,
        method: 'POST',
        endpoint: '/api/products',
        body: newProduct,
        entityId: newProduct.id
      });
      return {
        success: true,
        offlineQueued: true,
        product: newProduct,
        message: 'Guardado localmente (OnDemand). Se compartirá con la página al regresar el internet.'
      };
    };

    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      return queueOfflineProduct();
    }

    try {
      const res = await apiFetch(`${API_BASE_URL}/api/products`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newProduct)
      });
      if (res.ok) {
        setProducts(prev => [newProduct, ...prev]);
        return { success: true, product: newProduct };
      }
      if (isNetworkOrOfflineError(null, res)) {
        return queueOfflineProduct();
      }
      const errData = await res.json().catch(() => ({}));
      return { success: false, message: errData.error || 'Error al crear el producto.' };
    } catch (error) {
      if (isNetworkOrOfflineError(error)) {
        return queueOfflineProduct();
      }
      console.error('Error adding product:', error);
      return { success: false, message: 'Error de conexión con el servidor.' };
    }
  };

  const updateProduct = async (id, updatedProduct) => {
    const queueOfflineUpdate = () => {
      setProducts(prev => prev.map(p => p.id === id ? { ...p, ...updatedProduct } : p));
      enqueueOfflineOperation({
        type: 'UPDATE_PRODUCT',
        module: 'products',
        label: `Editar producto: ${updatedProduct.sku || id}`,
        method: 'PUT',
        endpoint: `/api/products/${id}`,
        body: updatedProduct,
        entityId: id
      });
      return {
        success: true,
        offlineQueued: true,
        message: 'Cambio guardado localmente (OnDemand). Se sincronizará al regresar el internet.'
      };
    };

    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      return queueOfflineUpdate();
    }

    try {
      const res = await apiFetch(`${API_BASE_URL}/api/products/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedProduct)
      });
      if (res.ok) {
        setProducts(prev => prev.map(p => p.id === id ? { ...p, ...updatedProduct } : p));
        return { success: true };
      }
      if (isNetworkOrOfflineError(null, res)) {
        return queueOfflineUpdate();
      }
      const errData = await res.json().catch(() => ({}));
      return { success: false, message: errData.error || 'Error al actualizar el producto.' };
    } catch (error) {
      if (isNetworkOrOfflineError(error)) {
        return queueOfflineUpdate();
      }
      console.error('Error updating product:', error);
      return { success: false, message: 'Error de conexión con el servidor.' };
    }
  };

  const deleteProduct = async (id) => {
    const targetProd = products.find(p => p.id === id);
    const queueOfflineDelete = () => {
      setProducts(prev => prev.filter(p => p.id !== id));
      enqueueOfflineOperation({
        type: 'DELETE_PRODUCT',
        module: 'products',
        label: `Eliminar producto: ${targetProd?.sku || id}`,
        method: 'DELETE',
        endpoint: `/api/products/${id}`,
        entityId: id
      });
      return {
        success: true,
        offlineQueued: true,
        message: 'Eliminación registrada localmente (OnDemand).'
      };
    };

    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      return queueOfflineDelete();
    }

    try {
      const res = await apiFetch(`${API_BASE_URL}/api/products/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setProducts(prev => prev.filter(p => p.id !== id));
        return { success: true };
      }
      if (isNetworkOrOfflineError(null, res)) {
        return queueOfflineDelete();
      }
      const errData = await res.json().catch(() => ({}));
      return { success: false, message: errData.error || 'No se pudo eliminar el producto.' };
    } catch (error) {
      if (isNetworkOrOfflineError(error)) {
        return queueOfflineDelete();
      }
      console.error('Error deleting product:', error);
      return { success: false, message: 'Error de conexión con el servidor.' };
    }
  };

  const bulkSyncProducts = async (items, createIfNotExists = true) => {
    try {
      const res = await apiFetch(`${API_BASE_URL}/api/products/bulk-sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items,
          createIfNotExists,
          auditUser: currentUser?.username || 'admin'
        })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        await refreshData();
        return { success: true, ...data };
      }
      return { success: false, message: data.error || 'Error al procesar archivo' };
    } catch (error) {
      console.error('Error in bulkSyncProducts:', error);
      return { success: false, message: 'Error de conexión con el servidor' };
    }
  };

  const applyLocalMovementStockDelta = (items = [], factor = 1) => {
    if (!Array.isArray(items) || items.length === 0) return;
    setProducts(prev => prev.map(prod => {
      const matchingItems = items.filter(it => String(it.productId) === String(prod.id));
      if (matchingItems.length === 0) return prod;
      let dU = 0, dP = 0, dB = 0;
      matchingItems.forEach(it => {
        dU += Number(it.qtyUnits || 0) * factor;
        dP += Number(it.qtyPounds || 0) * factor;
        dB += Number(it.qtyBaskets || 0) * factor;
      });
      return {
        ...prod,
        stockUnits: Number(prod.stockUnits || 0) + dU,
        stockPounds: Number(prod.stockPounds || 0) + dP,
        stockBaskets: Number(prod.stockBaskets || 0) + dB
      };
    }));
  };

  const addMovement = async (movement) => {
    const newMovement = {
      ...movement,
      id: movement.id || crypto.randomUUID(),
      auditUser: currentUser?.username || 'Sistema',
      createdAt: new Date().toISOString()
    };

    const queueOfflineMovement = () => {
      const factor = newMovement.type === 'entrada' ? 1 : -1;
      applyLocalMovementStockDelta(newMovement.items, factor);
      setMovements(prev => [{ ...newMovement, offlinePending: true }, ...prev]);
      enqueueOfflineOperation({
        type: 'CREATE_MOVEMENT',
        module: 'movements',
        label: `Movimiento (${newMovement.type || 'operación'}): ${newMovement.refType || 'Doc'} #${newMovement.refNumber || 'S/N'}`,
        method: 'POST',
        endpoint: '/api/movements',
        body: newMovement,
        entityId: newMovement.id
      });
      return {
        success: true,
        offlineQueued: true,
        id: newMovement.id,
        message: 'Movimiento guardado sin internet (OnDemand). Se compartirá automáticamente al reconectar.'
      };
    };

    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      return queueOfflineMovement();
    }

    try {
      const res = await apiFetch(`${API_BASE_URL}/api/movements`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newMovement)
      });
      if (res.ok) {
        const [prodRes, movRes] = await Promise.all([
          apiFetch(`${API_BASE_URL}/api/products`).then(r => r.json()),
          apiFetch(`${API_BASE_URL}/api/movements`).then(r => r.json())
        ]);
        setProducts(prodRes);
        setMovements(movRes);
        return { success: true, id: newMovement.id };
      }
      if (isNetworkOrOfflineError(null, res)) {
        return queueOfflineMovement();
      }
      const errData = await res.json().catch(() => ({}));
      return { success: false, message: errData.error || 'No se pudo registrar el movimiento.' };
    } catch (error) {
      if (isNetworkOrOfflineError(error)) {
        return queueOfflineMovement();
      }
      console.error('Error adding movement:', error);
      return { success: false, message: 'Error de conexión con el servidor.' };
    }
  };

  const deleteMovement = async (id) => {
    const existingMov = movements.find(m => m.id === id);
    const queueOfflineDeleteMov = () => {
      if (existingMov) {
        const reverseFactor = existingMov.type === 'entrada' ? -1 : 1;
        applyLocalMovementStockDelta(existingMov.items, reverseFactor);
      }
      setMovements(prev => prev.filter(m => m.id !== id));
      enqueueOfflineOperation({
        type: 'DELETE_MOVEMENT',
        module: 'movements',
        label: `Eliminar movimiento #${existingMov?.refNumber || id}`,
        method: 'DELETE',
        endpoint: `/api/movements/${id}`,
        entityId: id
      });
      return {
        success: true,
        offlineQueued: true,
        message: 'Eliminación de movimiento en cola OnDemand.'
      };
    };

    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      return queueOfflineDeleteMov();
    }

    try {
      const res = await apiFetch(`${API_BASE_URL}/api/movements/${id}`, { method: 'DELETE' });
      if (res.ok) {
        const [prodRes, movRes] = await Promise.all([
          apiFetch(`${API_BASE_URL}/api/products`).then(r => r.json()),
          apiFetch(`${API_BASE_URL}/api/movements`).then(r => r.json())
        ]);
        setProducts(prodRes);
        setMovements(movRes);
        return { success: true };
      }
      if (isNetworkOrOfflineError(null, res)) {
        return queueOfflineDeleteMov();
      }
      const errData = await res.json().catch(() => ({}));
      return { success: false, message: errData.error || 'No se pudo eliminar el movimiento.' };
    } catch (error) {
      if (isNetworkOrOfflineError(error)) {
        return queueOfflineDeleteMov();
      }
      console.error('Error deleting movement:', error);
      return { success: false, message: 'Error de conexión con el servidor.' };
    }
  };

  const updateMovement = async (id, updatedMovement) => {
    const payload = { ...updatedMovement, auditUser: currentUser?.username || 'Sistema' };
    const queueOfflineUpdateMov = () => {
      setMovements(prev => prev.map(m => m.id === id ? { ...m, ...payload, offlinePending: true } : m));
      enqueueOfflineOperation({
        type: 'UPDATE_MOVEMENT',
        module: 'movements',
        label: `Actualizar movimiento #${updatedMovement.refNumber || id}`,
        method: 'PUT',
        endpoint: `/api/movements/${id}`,
        body: payload,
        entityId: id
      });
      return {
        success: true,
        offlineQueued: true,
        message: 'Actualización de movimiento guardada en OnDemand.'
      };
    };

    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      return queueOfflineUpdateMov();
    }

    try {
      const res = await apiFetch(`${API_BASE_URL}/api/movements/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        const [prodRes, movRes] = await Promise.all([
          apiFetch(`${API_BASE_URL}/api/products`).then(response => response.json()),
          apiFetch(`${API_BASE_URL}/api/movements`).then(response => response.json())
        ]);
        setProducts(prodRes);
        setMovements(movRes);
        return { success: true };
      }
      if (isNetworkOrOfflineError(null, res)) {
        return queueOfflineUpdateMov();
      }
      const errData = await res.json().catch(() => ({}));
      return { success: false, message: errData.error || 'No se pudo actualizar el movimiento.' };
    } catch (error) {
      if (isNetworkOrOfflineError(error)) {
        return queueOfflineUpdateMov();
      }
      console.error('Error updating movement:', error);
      return { success: false, message: 'Error de conexión con el servidor.' };
    }
  };

  const adjustProductStock = async (productId, adjustment) => {
    const payload = { productId, ...adjustment, auditUser: currentUser?.username || 'Sistema' };
    const targetProduct = products.find(p => p.id === productId);

    const queueOfflineAdjustment = () => {
      const updatedProd = {
        ...(targetProduct || { id: productId }),
        stockUnits: Number(adjustment.countedUnits ?? targetProduct?.stockUnits ?? 0),
        stockPounds: Number(adjustment.countedPounds ?? targetProduct?.stockPounds ?? 0),
        stockBaskets: Number(adjustment.countedBaskets ?? targetProduct?.stockBaskets ?? 0)
      };
      setProducts(prev => prev.map(product =>
        product.id === productId ? updatedProd : product
      ));
      enqueueOfflineOperation({
        type: 'ADJUST_INVENTORY',
        module: 'inventory-count',
        label: `Ajuste físico de stock: ${targetProduct?.sku || productId}`,
        method: 'POST',
        endpoint: '/api/inventory-adjustments',
        body: payload,
        entityId: productId
      });
      return {
        success: true,
        offlineQueued: true,
        product: updatedProd,
        adjustment: payload,
        message: 'Ajuste físico guardado en modo OnDemand (sin internet).'
      };
    };

    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      return queueOfflineAdjustment();
    }

    try {
      const res = await apiFetch(`${API_BASE_URL}/api/inventory-adjustments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (isNetworkOrOfflineError(null, res)) {
        return queueOfflineAdjustment();
      }

      const data = await res.json();

      if (!res.ok) {
        return { success: false, message: data.error || 'No fue posible actualizar el inventario.' };
      }

      setProducts(prev => prev.map(product =>
        product.id === productId ? { ...product, ...data.product } : product
      ));
      return { success: true, product: data.product, adjustment: data.adjustment };
    } catch (error) {
      if (isNetworkOrOfflineError(error)) {
        return queueOfflineAdjustment();
      }
      console.error('Error adjusting product stock:', error);
      return { success: false, message: 'No se pudo conectar con el servidor.' };
    }
  };

  const addCategory = async (category, unit_type = 'units') => {
    try {
      const res = await apiFetch(`${API_BASE_URL}/api/config/categories`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: category, unit_type })
      });
      if (res.ok) {
        const configRes = await apiFetch(`${API_BASE_URL}/api/config`).then(r => r.json());
        setCategories(configRes.categories.map(c => c.name));
        const units = {};
        configRes.categories.forEach(c => { units[c.name] = c.unit_type; });
        setCategoryUnits(units);
      }
    } catch (error) {
      console.error('Error adding category:', error);
    }
  };

  const deleteCategory = async (category) => {
    try {
      const res = await apiFetch(`${API_BASE_URL}/api/config/categories/${encodeURIComponent(category)}`, { method: 'DELETE' });
      if (res.ok) {
        setCategories(prev => prev.filter(c => c !== category));
        setCategoryUnits(prev => { const u = { ...prev }; delete u[category]; return u; });
      }
    } catch (error) {
      console.error('Error deleting category:', error);
    }
  };

  const addDocumentType = async (docType) => {
    try {
      const res = await apiFetch(`${API_BASE_URL}/api/config/document-types`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: docType })
      });
      if (res.ok) {
        const configRes = await apiFetch(`${API_BASE_URL}/api/config`).then(r => r.json());
        setDocumentTypes(configRes.docTypes.map(d => d.name));
      }
    } catch (error) {
      console.error('Error adding document type:', error);
    }
  };

  const deleteDocumentType = async (docType) => {
    try {
      const res = await apiFetch(`${API_BASE_URL}/api/config/document-types/${encodeURIComponent(docType)}`, { method: 'DELETE' });
      if (res.ok) {
        setDocumentTypes(prev => prev.filter(d => d !== docType));
      }
    } catch (error) {
      console.error('Error deleting document type:', error);
    }
  };

  // Roles Management
  const fetchRoles = async () => {
    try {
      const res = await apiFetch(`${API_BASE_URL}/api/roles`);
      const data = await res.json();
      if (Array.isArray(data)) setRoles(data);
      return data;
    } catch (e) {
      console.error('Error fetching roles:', e);
      return [];
    }
  };

  const addRole = async (roleData) => {
    try {
      const res = await apiFetch(`${API_BASE_URL}/api/roles`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...roleData, auditUser: currentUser?.username })
      });
      const data = await res.json();
      if (res.ok) {
        await fetchRoles();
        return { success: true, id: data.id };
      }
      return { success: false, message: data.error };
    } catch {
      return { success: false, message: 'Error al conectar con el servidor.' };
    }
  };

  const updateRole = async (id, roleData) => {
    try {
      const res = await apiFetch(`${API_BASE_URL}/api/roles/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...roleData, auditUser: currentUser?.username })
      });
      if (res.ok) {
        await fetchRoles();
        return { success: true };
      }
      return { success: false };
    } catch {
      return { success: false };
    }
  };

  const deleteRole = async (id) => {
    try {
      const res = await apiFetch(`${API_BASE_URL}/api/roles/${id}?auditUser=${encodeURIComponent(currentUser?.username || '')}`, { method: 'DELETE' });
      if (res.ok) {
        setRoles(prev => prev.filter(r => r.id !== id));
        return { success: true };
      }
      return { success: false };
    } catch {
      return { success: false };
    }
  };

  // Versions Management
  const addVersion = async (description, changes = [], author = 'Admin') => {
    try {
      const res = await apiFetch(`${API_BASE_URL}/api/versions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description, changes, author: currentUser?.username || author })
      });
      if (res.ok) {
        const [versionsRes, base] = await Promise.all([
          apiFetch(`${API_BASE_URL}/api/versions`).then(r => r.json()),
          loadSystemChangelog()
        ]);
        setVersions(mergeChangelog(versionsRes, base));
        return { success: true };
      }
      return { success: false };
    } catch (error) {
      console.error('Error adding version:', error);
      return { success: false };
    }
  };

  const deleteVersion = async (id) => {
    try {
      const res = await apiFetch(`${API_BASE_URL}/api/versions/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setVersions(prev => prev.filter(v => v.id !== id));
      }
    } catch (error) {
      console.error('Error deleting version:', error);
    }
  };

  // User Management
  const fetchUsers = async () => {
    try {
      const res = await apiFetch(`${API_BASE_URL}/api/users`);
      const data = await res.json();
      if (Array.isArray(data)) setUsers(data);
      return data;
    } catch {
      return [];
    }
  };

  const addUser = async (user) => {
    try {
      const res = await apiFetch(`${API_BASE_URL}/api/users`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...user, auditUser: currentUser?.username })
      });
      if (res.ok) {
        await fetchUsers();
        return { success: true };
      }
      const data = await res.json();
      return { success: false, message: data.error };
    } catch {
      return { success: false, message: 'Error de conexión' };
    }
  };

  const updateUser = async (id, updatedUser) => {
    try {
      const res = await apiFetch(`${API_BASE_URL}/api/users/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...updatedUser, auditUser: currentUser?.username })
      });
      if (res.ok) {
        await fetchUsers();
        return { success: true };
      }
      const errData = await res.json().catch(() => ({}));
      return { success: false, message: errData.error || 'Error al actualizar usuario.' };
    } catch (error) {
      console.error('Error updating user:', error);
      return { success: false, message: 'Error de conexión con el servidor.' };
    }
  };

  const updateUserPermissions = async (id, permissions) => {
    try {
      const res = await apiFetch(`${API_BASE_URL}/api/users/${id}/permissions`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ permissions, auditUser: currentUser?.username })
      });
      if (res.ok) {
        await fetchUsers();
        // If updating self, refresh currentUser permissions immediately
        if (currentUser && Number(currentUser.id) === Number(id)) {
          const updated = { ...currentUser, permissions };
          setCurrentUser(updated);
          localStorage.setItem('inv_current_user', JSON.stringify(updated));
        }
        return { success: true };
      }
      return { success: false };
    } catch {
      return { success: false };
    }
  };

  const deleteUser = async (id) => {
    try {
      const res = await apiFetch(`${API_BASE_URL}/api/users/${id}?auditUser=${encodeURIComponent(currentUser?.username || '')}`, { method: 'DELETE' });
      if (res.ok) {
        setUsers(prev => prev.filter(u => u.id !== id));
        return { success: true };
      }
      const errData = await res.json().catch(() => ({}));
      return { success: false, message: errData.error || 'No se pudo eliminar el usuario.' };
    } catch {
      return { success: false, message: 'Error de conexión con el servidor.' };
    }
  };

  // System Logs & Sessions
  const fetchSystemLogs = async (filters = {}) => {
    try {
      const params = new URLSearchParams(filters);
      const res = await apiFetch(`${API_BASE_URL}/api/system-logs?${params.toString()}`);
      const data = await res.json();
      if (Array.isArray(data)) setSystemLogs(data);
      return data;
    } catch {
      return [];
    }
  };

  const fetchActiveSessions = async () => {
    try {
      if (currentUser) {
        const storedSessionId = sessionId || localStorage.getItem('inv_session_id');
        try {
          const hbRes = await apiFetch(`${API_BASE_URL}/api/active-sessions/heartbeat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              sessionId: storedSessionId,
              userId: currentUser.id,
              username: currentUser.username,
              userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : ''
            })
          });
          const hbData = await hbRes.json();
          if (hbData.sessionId && hbData.sessionId !== sessionId) {
            setSessionId(hbData.sessionId);
            localStorage.setItem('inv_session_id', hbData.sessionId);
          }
        } catch {}
      }

      const res = await apiFetch(`${API_BASE_URL}/api/active-sessions`);
      const data = await res.json();
      if (Array.isArray(data)) setActiveSessions(data);
      return data;
    } catch {
      return [];
    }
  };

  const disconnectSession = async (id) => {
    try {
      const res = await apiFetch(`${API_BASE_URL}/api/active-sessions/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setActiveSessions(prev => prev.filter(s => s.id !== id));
        return { success: true };
      }
      return { success: false };
    } catch {
      return { success: false };
    }
  };

  // Notifications
  const fetchNotifications = async () => {
    try {
      const res = await apiFetch(`${API_BASE_URL}/api/notifications?userId=${currentUser?.id || ''}`);
      const data = await res.json();
      if (Array.isArray(data)) setNotifications(data);
      return data;
    } catch {
      return [];
    }
  };

  const addNotification = async (notif) => {
    try {
      const res = await apiFetch(`${API_BASE_URL}/api/notifications`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(notif)
      });
      if (res.ok) {
        await fetchNotifications();
        return { success: true };
      }
      return { success: false };
    } catch {
      return { success: false };
    }
  };

  const markNotificationAsRead = async (id) => {
    try {
      await apiFetch(`${API_BASE_URL}/api/notifications/${id}/read`, { method: 'PUT' });
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, isRead: 1 } : n));
    } catch {}
  };

  const markAllNotificationsAsRead = async () => {
    try {
      await apiFetch(`${API_BASE_URL}/api/notifications/read-all`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: currentUser?.id })
      });
      setNotifications(prev => prev.map(n => ({ ...n, isRead: 1 })));
    } catch {}
  };

  const updateSettings = async (newSettings) => {
    const updated = { ...settings, ...newSettings };
    setSettings(updated);
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      enqueueOfflineOperation({
        type: 'UPDATE_SETTINGS',
        module: 'settings',
        label: `Actualizar configuración del sistema (${updated.name || 'Inventario Pro'})`,
        method: 'POST',
        endpoint: '/api/settings',
        body: updated,
        entityId: 'settings'
      });
      return { success: true, offlineQueued: true };
    }
    try {
      const res = await apiFetch(`${API_BASE_URL}/api/settings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updated)
      });
      if (!res.ok && isNetworkOrOfflineError(null, res)) {
        enqueueOfflineOperation({
          type: 'UPDATE_SETTINGS',
          module: 'settings',
          label: `Actualizar configuración del sistema (${updated.name || 'Inventario Pro'})`,
          method: 'POST',
          endpoint: '/api/settings',
          body: updated,
          entityId: 'settings'
        });
        return { success: true, offlineQueued: true };
      }
      return { success: res.ok };
    } catch (error) {
      if (isNetworkOrOfflineError(error)) {
        enqueueOfflineOperation({
          type: 'UPDATE_SETTINGS',
          module: 'settings',
          label: `Actualizar configuración del sistema (${updated.name || 'Inventario Pro'})`,
          method: 'POST',
          endpoint: '/api/settings',
          body: updated,
          entityId: 'settings'
        });
        return { success: true, offlineQueued: true };
      }
      console.error('Error updating settings:', error);
      return { success: false };
    }
  };

  const updateCategoryUnit = async (category, unit) => {
    setCategoryUnits(prev => ({ ...prev, [category]: unit }));
    try {
      await apiFetch(`${API_BASE_URL}/api/config/categories/${encodeURIComponent(category)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ unit_type: unit })
      });
    } catch (error) {
      if (isNetworkOrOfflineError(error)) {
        enqueueOfflineOperation({
          type: 'UPDATE_CATEGORY_UNIT',
          module: 'settings',
          label: `Cambiar unidad de categoría ${category} a ${unit}`,
          method: 'PUT',
          endpoint: `/api/config/categories/${encodeURIComponent(category)}`,
          body: { unit_type: unit },
          entityId: category
        });
      }
      console.error('Error updating category unit:', error);
    }
  };

  // Daily Cuts (Cortes Diarios Congelados)
  const fetchDailyCuts = async () => {
    try {
      const res = await apiFetch(`${API_BASE_URL}/api/daily-cuts`);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) {
          setDailyCuts(data);
          return data;
        }
      }
      return dailyCuts;
    } catch (e) {
      console.error('Error fetching daily cuts:', e);
      return dailyCuts;
    }
  };

  const fetchDailyCutById = async (id) => {
    try {
      const res = await apiFetch(`${API_BASE_URL}/api/daily-cuts/${id}`);
      if (res.ok) {
        const data = await res.json();
        saveLocalSnapshot(`dailyCut_${id}`, data);
        return data;
      }
      return loadLocalSnapshot(`dailyCut_${id}`, null);
    } catch (e) {
      console.error('Error fetching daily cut by id:', e);
      return loadLocalSnapshot(`dailyCut_${id}`, null);
    }
  };

  const createDailyCut = async (cutData) => {
    const payload = {
      ...cutData,
      created_by: currentUser?.username || 'admin'
    };

    const queueOfflineDailyCut = () => {
      const localId = `offline-cut-${Date.now()}`;
      const localCut = {
        ...payload,
        id: localId,
        offlinePending: true,
        created_at: new Date().toISOString()
      };
      setDailyCuts(prev => [localCut, ...prev]);
      saveLocalSnapshot(`dailyCut_${localId}`, localCut);
      enqueueOfflineOperation({
        type: 'CREATE_DAILY_CUT',
        module: 'summary2',
        label: `Congelar Corte Diario (${payload.startDate || ''} a ${payload.endDate || ''})`,
        method: 'POST',
        endpoint: '/api/daily-cuts',
        body: payload,
        entityId: localId
      });
      return {
        success: true,
        offlineQueued: true,
        id: localId,
        message: 'Corte diario congelado en modo OnDemand. Se compartirá al reconectar.'
      };
    };

    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      return queueOfflineDailyCut();
    }

    try {
      const res = await apiFetch(`${API_BASE_URL}/api/daily-cuts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (isNetworkOrOfflineError(null, res)) {
        return queueOfflineDailyCut();
      }
      const data = await res.json();
      if (res.ok && data.success) {
        await fetchDailyCuts();
        return { success: true, ...data };
      }
      return { success: false, message: data.error || 'Error al congelar corte' };
    } catch (e) {
      if (isNetworkOrOfflineError(e)) {
        return queueOfflineDailyCut();
      }
      console.error('Error creating daily cut:', e);
      return { success: false, message: 'Error de conexión con el servidor' };
    }
  };

  const updateDailyCut = async (id, updateData) => {
    const queueOfflineUpdateCut = () => {
      setDailyCuts(prev => prev.map(c => c.id === id ? { ...c, ...updateData, offlinePending: true } : c));
      enqueueOfflineOperation({
        type: 'UPDATE_DAILY_CUT',
        module: 'summary2',
        label: `Actualizar Corte Diario #${id}`,
        method: 'PUT',
        endpoint: `/api/daily-cuts/${id}`,
        body: updateData,
        entityId: String(id)
      });
      return {
        success: true,
        offlineQueued: true,
        message: 'Corte diario actualizado localmente (OnDemand).'
      };
    };

    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      return queueOfflineUpdateCut();
    }

    try {
      const res = await apiFetch(`${API_BASE_URL}/api/daily-cuts/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updateData)
      });
      if (isNetworkOrOfflineError(null, res)) {
        return queueOfflineUpdateCut();
      }
      const data = await res.json();
      if (res.ok && data.success) {
        await fetchDailyCuts();
        return { success: true, ...data };
      }
      return { success: false, message: data.error || 'Error al actualizar corte' };
    } catch (e) {
      if (isNetworkOrOfflineError(e)) {
        return queueOfflineUpdateCut();
      }
      console.error('Error updating daily cut:', e);
      return { success: false, message: 'Error de conexión con el servidor' };
    }
  };

  const setDailyCutLockStatus = async (id, isLocked, reason = '') => {
    try {
      const res = await apiFetch(`${API_BASE_URL}/api/daily-cuts/${id}/lock-status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isLocked, reason })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        await fetchDailyCuts();
        return { success: true, isLocked: data.isLocked };
      }
      return { success: false, message: data.error || 'Error al cambiar estado de bloqueo' };
    } catch {
      return { success: false, message: 'Error de conexión con el servidor' };
    }
  };

  const deleteDailyCut = async (id) => {
    try {
      const res = await apiFetch(`${API_BASE_URL}/api/daily-cuts/${id}`, { method: 'DELETE' });
      if (res.ok) {
        await fetchDailyCuts();
        return { success: true };
      }
      const errData = await res.json().catch(() => ({}));
      return { success: false, message: errData.error || 'No se pudo eliminar el corte diario.' };
    } catch (e) {
      console.error('Error deleting daily cut:', e);
      return { success: false, message: 'Error de conexión con el servidor.' };
    }
  };

  // Insurance Cuts (Cortes de Seguro Congelados)
  const fetchInsuranceCuts = async () => {
    try {
      const res = await apiFetch(`${API_BASE_URL}/api/insurance-cuts`);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) {
          saveLocalSnapshot('insuranceCuts', data);
          return data;
        }
      }
      return loadLocalSnapshot('insuranceCuts', []);
    } catch (e) {
      console.error('Error fetching insurance cuts:', e);
      return loadLocalSnapshot('insuranceCuts', []);
    }
  };

  const fetchInsuranceCutById = async (id) => {
    try {
      const res = await apiFetch(`${API_BASE_URL}/api/insurance-cuts/${id}`);
      if (res.ok) {
        const data = await res.json();
        saveLocalSnapshot(`insuranceCut_${id}`, data);
        return data;
      }
      return loadLocalSnapshot(`insuranceCut_${id}`, null);
    } catch (e) {
      console.error('Error fetching insurance cut by id:', e);
      return loadLocalSnapshot(`insuranceCut_${id}`, null);
    }
  };

  const createInsuranceCut = async (cutData) => {
    const payload = {
      ...cutData,
      created_by: currentUser?.username || 'admin'
    };

    const queueOfflineInsuranceCut = () => {
      const localId = `offline-ins-${Date.now()}`;
      const localCut = { ...payload, id: localId, offlinePending: true, created_at: new Date().toISOString() };
      const existing = loadLocalSnapshot('insuranceCuts', []);
      saveLocalSnapshot('insuranceCuts', [localCut, ...existing]);
      saveLocalSnapshot(`insuranceCut_${localId}`, localCut);
      enqueueOfflineOperation({
        type: 'CREATE_INSURANCE_CUT',
        module: 'insurance',
        label: `Congelar Corte de Seguro (${payload.cutoffDate || payload.endDate || ''})`,
        method: 'POST',
        endpoint: '/api/insurance-cuts',
        body: payload,
        entityId: localId
      });
      return {
        success: true,
        offlineQueued: true,
        id: localId,
        message: 'Corte de seguro guardado en OnDemand (sin internet).'
      };
    };

    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      return queueOfflineInsuranceCut();
    }

    try {
      const res = await apiFetch(`${API_BASE_URL}/api/insurance-cuts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (isNetworkOrOfflineError(null, res)) {
        return queueOfflineInsuranceCut();
      }
      const data = await res.json();
      if (res.ok && data.success) {
        return { success: true, ...data };
      }
      return { success: false, message: data.error || 'Error al congelar corte de seguro' };
    } catch (e) {
      if (isNetworkOrOfflineError(e)) {
        return queueOfflineInsuranceCut();
      }
      console.error('Error creating insurance cut:', e);
      return { success: false, message: 'Error de conexión con el servidor' };
    }
  };

  const updateInsuranceCut = async (id, updateData) => {
    const queueOfflineUpdateInsCut = () => {
      enqueueOfflineOperation({
        type: 'UPDATE_INSURANCE_CUT',
        module: 'insurance',
        label: `Actualizar Corte de Seguro #${id}`,
        method: 'PUT',
        endpoint: `/api/insurance-cuts/${id}`,
        body: updateData,
        entityId: String(id)
      });
      return {
        success: true,
        offlineQueued: true,
        message: 'Corte de seguro actualizado localmente (OnDemand).'
      };
    };

    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      return queueOfflineUpdateInsCut();
    }

    try {
      const res = await apiFetch(`${API_BASE_URL}/api/insurance-cuts/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updateData)
      });
      if (isNetworkOrOfflineError(null, res)) {
        return queueOfflineUpdateInsCut();
      }
      const data = await res.json();
      if (res.ok && data.success) {
        return { success: true, ...data };
      }
      return { success: false, message: data.error || 'Error al actualizar corte de seguro' };
    } catch (e) {
      if (isNetworkOrOfflineError(e)) {
        return queueOfflineUpdateInsCut();
      }
      console.error('Error updating insurance cut:', e);
      return { success: false, message: 'Error de conexión con el servidor' };
    }
  };

  const setInsuranceCutLockStatus = async (id, isLocked, reason = '') => {
    try {
      const res = await apiFetch(`${API_BASE_URL}/api/insurance-cuts/${id}/lock-status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isLocked, reason })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        return { success: true, isLocked: data.isLocked };
      }
      return { success: false, message: data.error || 'Error al cambiar estado de bloqueo del corte de seguro' };
    } catch {
      return { success: false, message: 'Error de conexión con el servidor' };
    }
  };

  const deleteInsuranceCut = async (id) => {
    try {
      const res = await apiFetch(`${API_BASE_URL}/api/insurance-cuts/${id}`, { method: 'DELETE' });
      if (res.ok) {
        return { success: true };
      }
      const errData = await res.json().catch(() => ({}));
      return { success: false, message: errData.error || 'No se pudo eliminar el corte de seguro.' };
    } catch (e) {
      console.error('Error deleting insurance cut:', e);
      return { success: false, message: 'Error de conexión con el servidor.' };
    }
  };

  // Secure Server-Side Login
  const login = async (username, password) => {
    const cleanUser = (username || '').trim();
    const cleanPass = (password || '').trim();

    if (!cleanUser || !cleanPass) {
      return { success: false, message: 'Ingresa usuario y contraseña.' };
    }

    try {
      const res = await apiFetch(`${API_BASE_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: cleanUser, password: cleanPass })
      });

      const data = await res.json();

      if (res.ok && data.success) {
        localStorage.setItem('inv_token', data.token);
        localStorage.setItem('inv_current_user', JSON.stringify(data.user));
        localStorage.setItem('inv_session_id', data.sessionId);
        saveLocalSnapshot('lastAuthUser', data.user);
        setCurrentUser(data.user);
        setSessionId(data.sessionId);
        await refreshData();
        return { success: true };
      }

      return { success: false, message: data.error || 'Credenciales incorrectas.' };
    } catch (error) {
      console.error('Login request failed:', error);
      return { success: false, message: 'Error de conexión con el servidor. Verifica que el backend esté en ejecución.' };
    }
  };

  const logout = async () => {
    try {
      if (currentUser) {
        await apiFetch(`${API_BASE_URL}/api/auth/logout`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId: currentUser.id,
            username: currentUser.username,
            sessionId
          })
        });
      }
    } catch (e) {
      console.error('Logout error:', e);
    } finally {
      setCurrentUser(null);
      setSessionId(null);
      localStorage.removeItem('inv_current_user');
      localStorage.removeItem('inv_session_id');
      localStorage.removeItem('inv_token');
    }
  };

  const totalStock = products.reduce((acc, curr) => acc + Number(curr.stockUnits || 0), 0);
  const downloadBackup = async () => {
    try {
      const res = await apiFetch(`${API_BASE_URL}/api/system/backup`);
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Error al generar la copia de seguridad');
      }
      const data = await res.json();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const filename = `backup_inventario_${new Date().toISOString().slice(0, 10)}_${Date.now()}.json`;
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      return { success: true, filename, meta: data.meta };
    } catch (error) {
      console.error('Download backup error:', error);
      throw error;
    }
  };

  const restoreBackup = async (backupData) => {
    try {
      const res = await apiFetch(`${API_BASE_URL}/api/system/restore`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ backup: backupData })
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Error al restaurar la copia de seguridad');
      }
      await refreshData();
      return data;
    } catch (error) {
      console.error('Restore backup error:', error);
      throw error;
    }
  };

  const getDatabaseStats = async () => {
    try {
      const res = await apiFetch(`${API_BASE_URL}/api/system/database-stats`);
      if (!res.ok) throw new Error('Error al obtener estadísticas de base de datos');
      return await res.json();
    } catch (error) {
      console.error('Get db stats error:', error);
      return null;
    }
  };

  const currentVersion = versions.length > 0 ? versions[0] : null;
  const unreadNotificationsCount = notifications.filter(n => !n.isRead).length;

  return (
    <InventoryContext.Provider value={{
      products,
      movements,
      categories,
      documentTypes,
      users,
      roles,
      currentUser,
      isAdmin: isUserAdmin(currentUser),
      isUserAdmin,
      settings,
      categoryUnits,
      versions,
      currentVersion,
      dailyCuts,
      systemLogs,
      activeSessions,
      notifications,
      unreadNotificationsCount,
      loading,
      hasPermission,
      canView,
      canCreate,
      canEdit,
      canDelete,
      canExport,
      downloadBackup,
      restoreBackup,
      getDatabaseStats,
      logAuditEvent,
      addProduct,
      updateProduct,
      adjustProductStock,
      deleteProduct,
      bulkSyncProducts,
      addMovement,
      updateMovement,
      deleteMovement,
      addCategory,
      deleteCategory,
      addDocumentType,
      deleteDocumentType,
      addUser,
      updateUser,
      deleteUser,
      updateUserPermissions,
      fetchUsers,
      fetchRoles,
      addRole,
      updateRole,
      deleteRole,
      fetchSystemLogs,
      fetchActiveSessions,
      disconnectSession,
      fetchNotifications,
      addNotification,
      markNotificationAsRead,
      markAllNotificationsAsRead,
      addVersion,
      deleteVersion,
      updateSettings,
      updateCategoryUnit,
      fetchDailyCuts,
      fetchDailyCutById,
      createDailyCut,
      updateDailyCut,
      setDailyCutLockStatus,
      deleteDailyCut,
      cutHistoryModalOpen,
      setCutHistoryModalOpen,
      openCutHistoryModal: () => setCutHistoryModalOpen(true),
      closeCutHistoryModal: () => setCutHistoryModalOpen(false),
      selectedCutForSummary,
      setSelectedCutForSummary,
      fetchInsuranceCuts,
      fetchInsuranceCutById,
      createInsuranceCut,
      updateInsuranceCut,
      setInsuranceCutLockStatus,
      deleteInsuranceCut,
      contractRates,
      fetchContractRates,
      sipeContractStatus,
      checkSipeContract,
      fetchProducts,
      fetchMovements,
      refreshModule,
      refreshData,
      login,
      logout,
      totalStock,
      theme,
      setTheme,
      // OnDemand Offline-First & Sync API
      onDemandStatus,
      offlineQueue,
      syncOnDemandNow,
      checkOnDemandConnection,
      removeOfflineQueueItem,
      clearAllOfflineQueue,
      importOfflineQueueItems
    }}>

      {children}
    </InventoryContext.Provider>
  );
};
