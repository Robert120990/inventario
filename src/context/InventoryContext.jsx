import React, { createContext, useContext, useState, useEffect } from 'react';
import { SYSTEM_CHANGELOG } from '../config/changelog';

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
  const response = await window.fetch(url, { ...options, headers });
  if (response.status === 401 && !url.includes('/auth/login')) {
    localStorage.removeItem('inv_token');
    localStorage.removeItem('inv_current_user');
    localStorage.removeItem('inv_session_id');
    window.dispatchEvent(new CustomEvent('auth:unauthorized'));
  }
  return response;
};

// Fusionador seguro de versiones oficiales y creadas dinámicamente en BD
const mergeChangelog = (dbVersions = []) => {
  const map = new Map();
  // 1. Agregar versiones del changelog oficial
  SYSTEM_CHANGELOG.forEach(v => map.set(v.version.toLowerCase(), v));
  // 2. Agregar o sobreescribir versiones provenientes de la base de datos
  if (Array.isArray(dbVersions)) {
    dbVersions.forEach(v => {
      const key = (v.version || '').toLowerCase();
      if (key) {
        map.set(key, { ...map.get(key), ...v });
      }
    });
  }
  return Array.from(map.values());
};

export const InventoryProvider = ({ children }) => {
  const [products, setProducts] = useState([]);
  const [movements, setMovements] = useState([]);
  const [categories, setCategories] = useState([]);
  const [documentTypes, setDocumentTypes] = useState([]);
  const [users, setUsers] = useState([]);
  const [roles, setRoles] = useState([]);
  const [systemLogs, setSystemLogs] = useState([]);
  const [activeSessions, setActiveSessions] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [currentUser, setCurrentUser] = useState(() => {
    const saved = localStorage.getItem('inv_current_user');
    return saved ? JSON.parse(saved) : null;
  });
  const [sessionId, setSessionId] = useState(() => {
    return localStorage.getItem('inv_session_id') || null;
  });
  const [settings, setSettings] = useState({
    name: 'Inventario Pro',
    logo: null
  });
  const [categoryUnits, setCategoryUnits] = useState({});
  const [versions, setVersions] = useState(SYSTEM_CHANGELOG);
  const [dailyCuts, setDailyCuts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [theme, setThemeState] = useState(() => localStorage.getItem('inv_theme') || 'light');


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

  // Initial Fetch
  useEffect(() => {
    const fetchData = async () => {
      const token = localStorage.getItem('inv_token');
      if (!token) {
        setLoading(false);
        return;
      }

      // Fail-safe: Force stop loading after 8 seconds
      const timeoutId = setTimeout(() => {
        setLoading(false);
        console.warn('Initial fetch timed out after 8s');
      }, 8000);

      try {
        setLoading(true);
        const [prodRes, movRes, userRes, configRes, settingsRes, versionsRes, rolesRes, notifRes, cutsRes] = await Promise.all([
          apiFetch(`${API_BASE_URL}/api/products`).then(res => res.json()).catch(() => []),
          apiFetch(`${API_BASE_URL}/api/movements`).then(res => res.json()).catch(() => []),
          apiFetch(`${API_BASE_URL}/api/users`).then(res => res.json()).catch(() => []),
          apiFetch(`${API_BASE_URL}/api/config`).then(res => res.json()).catch(() => ({})),
          apiFetch(`${API_BASE_URL}/api/settings`).then(res => res.json()).catch(() => ({})),
          apiFetch(`${API_BASE_URL}/api/versions`).then(res => res.json()).catch(() => []),
          apiFetch(`${API_BASE_URL}/api/roles`).then(res => res.json()).catch(() => []),
          apiFetch(`${API_BASE_URL}/api/notifications`).then(res => res.json()).catch(() => []),
          apiFetch(`${API_BASE_URL}/api/daily-cuts`).then(res => res.json()).catch(() => [])
        ]);
        
        clearTimeout(timeoutId);

        if (Array.isArray(prodRes)) setProducts(prodRes);
        if (Array.isArray(movRes)) setMovements(movRes);
        if (Array.isArray(userRes)) setUsers(userRes);
        setVersions(mergeChangelog(versionsRes));
        if (Array.isArray(rolesRes)) setRoles(rolesRes);
        if (Array.isArray(notifRes)) setNotifications(notifRes);
        if (Array.isArray(cutsRes)) setDailyCuts(cutsRes);

        
        if (configRes && !configRes.error) {
          if (configRes.categories) setCategories(configRes.categories.map(c => c.name));
          if (configRes.docTypes) setDocumentTypes(configRes.docTypes.map(d => d.name));
          
          const units = {};
          if (configRes.categories) {
            configRes.categories.forEach(c => {
              units[c.name] = c.unit_type;
            });
            setCategoryUnits(units);
          }
        }
        
        if (settingsRes && !settingsRes.error) {
          setSettings(settingsRes);
        }
      } catch (error) {
        console.error('Error fetching data:', error);
      } finally {
        setLoading(false);
        clearTimeout(timeoutId);
      }
    };

    fetchData();
  }, []);

  // Heartbeat for active session tracking (every 20 seconds)
  useEffect(() => {
    if (!currentUser?.id) return;

    const sendHeartbeat = async () => {
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
      } catch (e) {}
    };

    sendHeartbeat();
    const interval = setInterval(sendHeartbeat, 20000); // Every 20 seconds
    return () => clearInterval(interval);
  }, [currentUser?.id, sessionId]);

  const refreshData = async () => {
    try {
      const [prodRes, movRes, userRes, configRes, settingsRes, versionsRes, rolesRes, notifRes] = await Promise.all([
        apiFetch(`${API_BASE_URL}/api/products`).then(res => res.json()).catch(() => []),
        apiFetch(`${API_BASE_URL}/api/movements`).then(res => res.json()).catch(() => []),
        apiFetch(`${API_BASE_URL}/api/users`).then(res => res.json()).catch(() => []),
        apiFetch(`${API_BASE_URL}/api/config`).then(res => res.json()).catch(() => ({})),
        apiFetch(`${API_BASE_URL}/api/settings`).then(res => res.json()).catch(() => ({})),
        apiFetch(`${API_BASE_URL}/api/versions`).then(res => res.json()).catch(() => []),
        apiFetch(`${API_BASE_URL}/api/roles`).then(res => res.json()).catch(() => []),
        apiFetch(`${API_BASE_URL}/api/notifications`).then(res => res.json()).catch(() => [])
      ]);

      if (Array.isArray(prodRes)) setProducts(prodRes);
      if (Array.isArray(movRes)) setMovements(movRes);
      if (Array.isArray(userRes)) {
        setUsers(userRes);
        if (currentUser?.id) {
          const freshSelf = userRes.find(u => Number(u.id) === Number(currentUser.id));
          if (freshSelf && freshSelf.permissions !== undefined) {
            const hasChanged = 
              currentUser.role !== freshSelf.role ||
              currentUser.role_id !== freshSelf.role_id ||
              currentUser.roleName !== freshSelf.roleName ||
              JSON.stringify(currentUser.permissions) !== JSON.stringify(freshSelf.permissions);

            if (hasChanged) {
              setCurrentUser(prev => ({
                ...prev,
                permissions: freshSelf.permissions,
                role: freshSelf.role,
                role_id: freshSelf.role_id,
                roleName: freshSelf.roleName
              }));
            }
          }
        }
      }
      setVersions(mergeChangelog(versionsRes));
      if (Array.isArray(rolesRes)) setRoles(rolesRes);
      if (Array.isArray(notifRes)) setNotifications(notifRes);
      if (configRes && !configRes.error) {
        if (configRes.categories) setCategories(configRes.categories.map(c => c.name));
        if (configRes.docTypes) setDocumentTypes(configRes.docTypes.map(d => d.name));
        const units = {};
        if (configRes.categories) {
          configRes.categories.forEach(c => { units[c.name] = c.unit_type; });
          setCategoryUnits(units);
        }
      }
      if (settingsRes && !settingsRes.error) setSettings(settingsRes);
    } catch (error) {
      console.error('Error refreshing data:', error);
    }
  };

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
    const newProduct = { ...product, id: crypto.randomUUID() };
    try {
      const res = await apiFetch(`${API_BASE_URL}/api/products`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newProduct)
      });
      if (res.ok) {
        setProducts(prev => [newProduct, ...prev]);
        logAuditEvent('CREATE_PRODUCT', 'products', `Creación de producto '${newProduct.sku}' (${newProduct.description || ''})`);
      }
    } catch (error) {
      console.error('Error adding product:', error);
    }
  };

  const updateProduct = async (id, updatedProduct) => {
    try {
      const res = await apiFetch(`${API_BASE_URL}/api/products/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedProduct)
      });
      if (res.ok) {
        setProducts(prev => prev.map(p => p.id === id ? { ...p, ...updatedProduct } : p));
        logAuditEvent('UPDATE_PRODUCT', 'products', `Edición de producto '${updatedProduct.sku || id}'`);
      }
    } catch (error) {
      console.error('Error updating product:', error);
    }
  };

  const deleteProduct = async (id) => {
    try {
      const prod = products.find(p => p.id === id);
      const res = await apiFetch(`${API_BASE_URL}/api/products/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setProducts(prev => prev.filter(p => p.id !== id));
        logAuditEvent('DELETE_PRODUCT', 'products', `Eliminación de producto '${prod?.sku || id}'`);
      }
    } catch (error) {
      console.error('Error deleting product:', error);
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

  const addMovement = async (movement) => {
    const newMovement = { ...movement, id: crypto.randomUUID(), auditUser: currentUser?.username || 'Sistema' };
    try {
      const res = await apiFetch(`${API_BASE_URL}/api/movements`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newMovement)
      });
      if (res.ok) {
        const [prodRes, movRes] = await Promise.all([
          apiFetch(`${API_BASE_URL}/api/products`).then(res => res.json()),
          apiFetch(`${API_BASE_URL}/api/movements`).then(res => res.json())
        ]);
        setProducts(prodRes);
        setMovements(movRes);
      }
    } catch (error) {
      console.error('Error adding movement:', error);
    }
  };

  const deleteMovement = async (id) => {
    try {
      const res = await apiFetch(`${API_BASE_URL}/api/movements/${id}`, { method: 'DELETE' });
      if (res.ok) {
        const [prodRes, movRes] = await Promise.all([
          apiFetch(`${API_BASE_URL}/api/products`).then(res => res.json()),
          apiFetch(`${API_BASE_URL}/api/movements`).then(res => res.json())
        ]);
        setProducts(prodRes);
        setMovements(movRes);
        logAuditEvent('DELETE_MOVEMENT', 'movements', `Eliminación de movimiento ID ${id}`);
      }
    } catch (error) {
      console.error('Error deleting movement:', error);
    }
  };

  const updateMovement = async (id, updatedMovement) => {
    try {
      const res = await apiFetch(`${API_BASE_URL}/api/movements/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...updatedMovement, auditUser: currentUser?.username || 'Sistema' })
      });

      if (res.ok) {
        const [prodRes, movRes] = await Promise.all([
          apiFetch(`${API_BASE_URL}/api/products`).then(response => response.json()),
          apiFetch(`${API_BASE_URL}/api/movements`).then(response => response.json())
        ]);
        setProducts(prodRes);
        setMovements(movRes);
        logAuditEvent('UPDATE_MOVEMENT', 'movements', `Modificación de movimiento ID ${id}`);
      }
    } catch (error) {
      console.error('Error updating movement:', error);
    }
  };

  const adjustProductStock = async (productId, adjustment) => {
    try {
      const res = await apiFetch(`${API_BASE_URL}/api/inventory-adjustments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productId, ...adjustment, auditUser: currentUser?.username || 'Sistema' })
      });
      const data = await res.json();

      if (!res.ok) {
        return { success: false, message: data.error || 'No fue posible actualizar el inventario.' };
      }

      setProducts(prev => prev.map(product =>
        product.id === productId ? { ...product, ...data.product } : product
      ));
      return { success: true, product: data.product, adjustment: data.adjustment };
    } catch (error) {
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
    } catch (e) {
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
    } catch (e) {
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
    } catch (e) {
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
        const versionsRes = await apiFetch(`${API_BASE_URL}/api/versions`).then(r => r.json());
        setVersions(mergeChangelog(versionsRes));
        logAuditEvent('REGISTER_VERSION', 'security', `Registro de versión con descripción: ${description}`);
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
    } catch (e) {
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
    } catch (error) {
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
      return { success: false };
    } catch (error) {
      console.error('Error updating user:', error);
      return { success: false };
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
    } catch (error) {
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
      return { success: false };
    } catch (error) {
      return { success: false };
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
    } catch (e) {
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
        } catch (err) {}
      }

      const res = await apiFetch(`${API_BASE_URL}/api/active-sessions`);
      const data = await res.json();
      if (Array.isArray(data)) setActiveSessions(data);
      return data;
    } catch (e) {
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
    } catch (e) {
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
    } catch (e) {
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
    } catch (e) {
      return { success: false };
    }
  };

  const markNotificationAsRead = async (id) => {
    try {
      await apiFetch(`${API_BASE_URL}/api/notifications/${id}/read`, { method: 'PUT' });
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, isRead: 1 } : n));
    } catch (e) {}
  };

  const markAllNotificationsAsRead = async () => {
    try {
      await apiFetch(`${API_BASE_URL}/api/notifications/read-all`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: currentUser?.id })
      });
      setNotifications(prev => prev.map(n => ({ ...n, isRead: 1 })));
    } catch (e) {}
  };

  const updateSettings = async (newSettings) => {
    const updated = { ...settings, ...newSettings };
    try {
      const res = await apiFetch(`${API_BASE_URL}/api/settings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updated)
      });
      if (res.ok) {
        setSettings(updated);
        logAuditEvent('UPDATE_SETTINGS', 'settings', 'Actualización de configuración general del sistema');
      }
    } catch (error) {
      console.error('Error updating settings:', error);
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
      return [];
    } catch (e) {
      console.error('Error fetching daily cuts:', e);
      return [];
    }
  };

  const fetchDailyCutById = async (id) => {
    try {
      const res = await apiFetch(`${API_BASE_URL}/api/daily-cuts/${id}`);
      if (res.ok) {
        return await res.json();
      }
      return null;
    } catch (e) {
      console.error('Error fetching daily cut by id:', e);
      return null;
    }
  };

  const createDailyCut = async (cutData) => {
    try {
      const res = await apiFetch(`${API_BASE_URL}/api/daily-cuts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...cutData,
          created_by: currentUser?.username || 'admin'
        })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        logAuditEvent('FREEZE_DAILY_CUT', 'summary2', `Congelamiento de corte '${data.title}' (${cutData.startDate} al ${cutData.endDate})`);
        await fetchDailyCuts();
        return { success: true, ...data };
      }
      return { success: false, message: data.error || 'Error al congelar corte' };
    } catch (e) {
      console.error('Error creating daily cut:', e);
      return { success: false, message: 'Error de conexión con el servidor' };
    }
  };

  const updateDailyCut = async (id, updateData) => {
    try {
      const res = await apiFetch(`${API_BASE_URL}/api/daily-cuts/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updateData)
      });
      const data = await res.json();
      if (res.ok && data.success) {
        await fetchDailyCuts();
        return { success: true, ...data };
      }
      return { success: false, message: data.error || 'Error al actualizar corte' };
    } catch (e) {
      console.error('Error updating daily cut:', e);
      return { success: false, message: 'Error de conexión con el servidor' };
    }
  };

  const deleteDailyCut = async (id, title = '') => {
    try {
      const res = await apiFetch(`${API_BASE_URL}/api/daily-cuts/${id}`, { method: 'DELETE' });
      if (res.ok) {
        logAuditEvent('DELETE_DAILY_CUT', 'summary2', `Eliminación de corte '${title || id}'`);
        await fetchDailyCuts();
        return { success: true };
      }
      return { success: false };
    } catch (e) {
      console.error('Error deleting daily cut:', e);
      return { success: false };
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
      deleteDailyCut,
      refreshData,
      login,
      logout,
      totalStock,
      theme,
      setTheme
    }}>

      {children}
    </InventoryContext.Provider>
  );
};
