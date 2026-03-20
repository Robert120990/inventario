import React, { createContext, useContext, useState, useEffect } from 'react';

const InventoryContext = createContext();

export const useInventory = () => useContext(InventoryContext);

// Base API URL from environment variable or empty for local proxy
const API_BASE_URL = import.meta.env.VITE_API_URL || '';

export const InventoryProvider = ({ children }) => {
  const [products, setProducts] = useState([]);
  const [movements, setMovements] = useState([]);
  const [categories, setCategories] = useState([]);
  const [documentTypes, setDocumentTypes] = useState([]);
  const [users, setUsers] = useState([]);
  const [currentUser, setCurrentUser] = useState(() => {
    const saved = localStorage.getItem('inv_current_user');
    return saved ? JSON.parse(saved) : null;
  });
  const [settings, setSettings] = useState({
    name: 'Inventario Pro',
    logo: null
  });
  const [categoryUnits, setCategoryUnits] = useState({});
  const [loading, setLoading] = useState(true);

  // Initial Fetch
  useEffect(() => {
    const fetchData = async () => {
      // Fail-safe: Force stop loading after 15 seconds
      const timeoutId = setTimeout(() => {
        setLoading(false);
        console.warn('Initial fetch timed out after 15s');
      }, 15000);

      try {
        setLoading(true);
        const [prodRes, movRes, userRes, configRes, settingsRes] = await Promise.all([
          fetch(`${API_BASE_URL}/api/products`).then(res => res.json()),
          fetch(`${API_BASE_URL}/api/movements`).then(res => res.json()),
          fetch(`${API_BASE_URL}/api/users`).then(res => res.json()),
          fetch(`${API_BASE_URL}/api/config`).then(res => res.json()),
          fetch(`${API_BASE_URL}/api/settings`).then(res => res.json())
        ]);
        
        clearTimeout(timeoutId);

        if (Array.isArray(prodRes)) setProducts(prodRes);
        if (Array.isArray(movRes)) setMovements(movRes);
        if (Array.isArray(userRes)) setUsers(userRes);
        
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

  // Sync current user to local storage for session persistence
  useEffect(() => {
    if (currentUser) {
      localStorage.setItem('inv_current_user', JSON.stringify(currentUser));
    } else {
      localStorage.removeItem('inv_current_user');
    }
  }, [currentUser]);

  const addProduct = async (product) => {
    const newProduct = { ...product, id: crypto.randomUUID() };
    try {
      const res = await fetch(`${API_BASE_URL}/api/products`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newProduct)
      });
      if (res.ok) {
        setProducts(prev => [newProduct, ...prev]);
      }
    } catch (error) {
      console.error('Error adding product:', error);
    }
  };

  const updateProduct = async (id, updatedProduct) => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/products/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedProduct)
      });
      if (res.ok) {
        setProducts(prev => prev.map(p => p.id === id ? { ...p, ...updatedProduct } : p));
      }
    } catch (error) {
      console.error('Error updating product:', error);
    }
  };

  const deleteProduct = async (id) => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/products/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setProducts(prev => prev.filter(p => p.id !== id));
      }
    } catch (error) {
      console.error('Error deleting product:', error);
    }
  };

  const addMovement = async (movement) => {
    const newMovement = { ...movement, id: crypto.randomUUID() };
    try {
      const res = await fetch(`${API_BASE_URL}/api/movements`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newMovement)
      });
      if (res.ok) {
        const [prodRes, movRes] = await Promise.all([
          fetch(`${API_BASE_URL}/api/products`).then(res => res.json()),
          fetch(`${API_BASE_URL}/api/movements`).then(res => res.json())
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
      const res = await fetch(`${API_BASE_URL}/api/movements/${id}`, { method: 'DELETE' });
      if (res.ok) {
        const [prodRes, movRes] = await Promise.all([
          fetch(`${API_BASE_URL}/api/products`).then(res => res.json()),
          fetch(`${API_BASE_URL}/api/movements`).then(res => res.json())
        ]);
        setProducts(prodRes);
        setMovements(movRes);
      }
    } catch (error) {
      console.error('Error deleting movement:', error);
    }
  };

  const updateMovement = async (id, updatedMovement) => {
    try {
      await deleteMovement(id);
      await addMovement(updatedMovement);
    } catch (error) {
      console.error('Error updating movement:', error);
    }
  };

  const addCategory = async (category, unit_type = 'units') => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/config/categories`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: category, unit_type })
      });
      if (res.ok) {
        const configRes = await fetch(`${API_BASE_URL}/api/config`).then(r => r.json());
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
      const res = await fetch(`${API_BASE_URL}/api/config/categories/${encodeURIComponent(category)}`, { method: 'DELETE' });
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
      const res = await fetch(`${API_BASE_URL}/api/config/document-types`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: docType })
      });
      if (res.ok) {
        const configRes = await fetch(`${API_BASE_URL}/api/config`).then(r => r.json());
        setDocumentTypes(configRes.docTypes.map(d => d.name));
      }
    } catch (error) {
      console.error('Error adding document type:', error);
    }
  };

  const deleteDocumentType = async (docType) => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/config/document-types/${encodeURIComponent(docType)}`, { method: 'DELETE' });
      if (res.ok) {
        setDocumentTypes(prev => prev.filter(d => d !== docType));
      }
    } catch (error) {
      console.error('Error deleting document type:', error);
    }
  };

  const addUser = async (user) => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/users`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(user)
      });
      if (res.ok) {
        const userRes = await fetch(`${API_BASE_URL}/api/users`).then(res => res.json());
        setUsers(userRes);
      }
    } catch (error) {
      console.error('Error adding user:', error);
    }
  };

  const updateSettings = async (newSettings) => {
    const updated = { ...settings, ...newSettings };
    try {
      const res = await fetch(`${API_BASE_URL}/api/settings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updated)
      });
      if (res.ok) {
        setSettings(updated);
      }
    } catch (error) {
      console.error('Error updating settings:', error);
    }
  };

  const updateCategoryUnit = async (category, unit) => {
    setCategoryUnits(prev => ({ ...prev, [category]: unit }));
    try {
      await fetch(`${API_BASE_URL}/api/config/categories/${encodeURIComponent(category)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ unit_type: unit })
      });
    } catch (error) {
      console.error('Error updating category unit:', error);
    }
  };

  const updateUser = async (id, updatedUser) => {
    try {
      const current = users.find(u => u.id === id);
      const merged = { ...current, ...updatedUser };
      const res = await fetch(`${API_BASE_URL}/api/users/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(merged)
      });
      if (res.ok) {
        const userRes = await fetch(`${API_BASE_URL}/api/users`).then(r => r.json());
        setUsers(userRes);
      }
    } catch (error) {
      console.error('Error updating user:', error);
    }
  };

  const login = (username, password) => {
    const user = users.find(u => u.username.toLowerCase() === username.toLowerCase() && u.password === password);
    if (user) {
      if (user.isActive === 0 || user.isActive === false) return { success: false, message: 'Cuenta desactivada por el administrador.' };
      setCurrentUser(user);
      return { success: true };
    }
    return { success: false, message: 'Credenciales incorrectas.' };
  };

  const logout = () => {
    setCurrentUser(null);
  };

  const totalStock = products.reduce((acc, curr) => acc + Number(curr.stockUnits || 0), 0);

  return (
    <InventoryContext.Provider value={{
      products,
      movements,
      categories,
      documentTypes,
      users,
      currentUser,
      settings,
      categoryUnits,
      loading,
      addProduct,
      updateProduct,
      deleteProduct,
      addMovement,
      updateMovement,
      deleteMovement,
      addCategory,
      deleteCategory,
      addDocumentType,
      deleteDocumentType,
      addUser,
      updateUser,
      updateSettings,
      updateCategoryUnit,
      login,
      logout,
      totalStock
    }}>
      {children}
    </InventoryContext.Provider>
  );
};
