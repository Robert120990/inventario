import React, { createContext, useContext, useState, useEffect } from 'react';

const InventoryContext = createContext();

export const useInventory = () => useContext(InventoryContext);

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
      try {
        setLoading(true);
        const [prodRes, movRes, userRes, configRes] = await Promise.all([
          fetch('/api/products').then(res => res.json()),
          fetch('/api/movements').then(res => res.json()),
          fetch('/api/users').then(res => res.json()),
          fetch('/api/config').then(res => res.json())
        ]);

        setProducts(prodRes);
        setMovements(movRes);
        setUsers(userRes);
        setCategories(configRes.categories.map(c => c.name));
        setDocumentTypes(configRes.docTypes.map(d => d.name));
        
        const units = {};
        configRes.categories.forEach(c => {
          units[c.name] = c.unit_type;
        });
        setCategoryUnits(units);
      } catch (error) {
        console.error('Error fetching data:', error);
      } finally {
        setLoading(false);
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
      const res = await fetch('/api/products', {
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
      const res = await fetch(`/api/products/${id}`, {
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
      const res = await fetch(`/api/products/${id}`, { method: 'DELETE' });
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
      const res = await fetch('/api/movements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newMovement)
      });
      if (res.ok) {
        // Refresh products and movements to get updated stocks and new movement
        const [prodRes, movRes] = await Promise.all([
          fetch('/api/products').then(res => res.json()),
          fetch('/api/movements').then(res => res.json())
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
      const res = await fetch(`/api/movements/${id}`, { method: 'DELETE' });
      if (res.ok) {
        const [prodRes, movRes] = await Promise.all([
          fetch('/api/products').then(res => res.json()),
          fetch('/api/movements').then(res => res.json())
        ]);
        setProducts(prodRes);
        setMovements(movRes);
      }
    } catch (error) {
      console.error('Error deleting movement:', error);
    }
  };

  const updateMovement = async (id, updatedMovement) => {
    // Note: Update movement in backend might be complex depending on full logic.
    // Simplifying: Delete then Re-add if backend supports it, or just use a PUT endpoint.
    // For now, let's just refresh after a theoretical update or handle logic in backend.
    // Since I didn't implement PUT /api/movements, I'll recommend adding it or using POST for new.
    // Logic: Delete old, add new.
    try {
      await deleteMovement(id);
      await addMovement(updatedMovement);
    } catch (error) {
      console.error('Error updating movement:', error);
    }
  };

  const addCategory = (category) => {
    // Currently UI only, could be moved to API if needed
    if (!categories.includes(category)) {
      setCategories(prev => [...prev, category]);
    }
  };

  const deleteCategory = (category) => {
    setCategories(prev => prev.filter(c => c !== category));
  };

  const addDocumentType = (docType) => {
    if (!documentTypes.includes(docType)) {
      setDocumentTypes(prev => [...prev, docType]);
    }
  };

  const deleteDocumentType = (docType) => {
    setDocumentTypes(prev => prev.filter(d => d !== docType));
  };

  const addUser = async (user) => {
    try {
      const res = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(user)
      });
      if (res.ok) {
        const userRes = await fetch('/api/users').then(res => res.json());
        setUsers(userRes);
      }
    } catch (error) {
      console.error('Error adding user:', error);
    }
  };

  const updateSettings = (newSettings) => {
    setSettings(prev => ({ ...prev, ...newSettings }));
  };

  const updateCategoryUnit = (category, unit) => {
    setCategoryUnits(prev => ({ ...prev, [category]: unit }));
  };

  const updateUser = (id, updatedUser) => {
    // Could add API endpoint for update user
    setUsers(prev => prev.map(u => u.id === id ? { ...u, ...updatedUser } : u));
  };

  const login = (username, password) => {
    // In a real app, this would be a POST to /api/login
    // For now, we compare against fetched users
    const user = users.find(u => u.username === username && u.password === password);
    if (user) {
      if (user.isActive === false) return { success: false, message: 'Cuenta desactivada por el administrador.' };
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
