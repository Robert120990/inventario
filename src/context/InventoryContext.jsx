import React, { createContext, useContext, useState, useEffect } from 'react';

const InventoryContext = createContext();

export const useInventory = () => useContext(InventoryContext);

const initialProducts = [
  {
    id: 'prod-1',
    sku: 'ELEC-001',
    description: 'Laptop Pro 15"',
    price: 1200.50,
    category: 'Electrónicos',
    stockUnits: 15,
    stockPounds: 0,
    stockBaskets: 0
  },
  {
    id: 'prod-2',
    sku: 'PER-002',
    description: 'Tomates Orgánicos',
    price: 2.30,
    category: 'Perecederos',
    stockUnits: 500,
    stockPounds: 250,
    stockBaskets: 10
  }
];

const initialCategories = ['Electrónicos', 'Perecederos', 'Hogar', 'Abarrotes'];

const initialDocumentTypes = ['Factura', 'Guía', 'Traslado', 'Ajuste'];

const initialUsers = [
  { id: '1', username: 'admin', password: '123', role: 'admin' },
  { id: '2', username: 'user', password: '123', role: 'user' }
];
export const InventoryProvider = ({ children }) => {
  const [products, setProducts] = useState(() => {
    const saved = localStorage.getItem('inv_products');
    return saved ? JSON.parse(saved) : initialProducts;
  });

  const [movements, setMovements] = useState(() => {
    const saved = localStorage.getItem('inv_movements');
    if (saved) {
      const parsed = JSON.parse(saved);
      return parsed.map(m => {
        if (m.items) return m;
        const doc = { ...m };
        doc.items = [{
          productId: m.productId,
          temperature: m.temperature,
          qtyUnits: m.qtyUnits,
          qtyPounds: m.qtyPounds,
          qtyBaskets: m.qtyBaskets
        }];
        delete doc.productId;
        delete doc.temperature;
        delete doc.qtyUnits;
        delete doc.qtyPounds;
        delete doc.qtyBaskets;
        return doc;
      });
    }
    return [];
  });

  const [categories, setCategories] = useState(() => {
    const saved = localStorage.getItem('inv_categories');
    return saved ? JSON.parse(saved) : initialCategories;
  });

  const [documentTypes, setDocumentTypes] = useState(() => {
    const saved = localStorage.getItem('inv_doc_types');
    return saved ? JSON.parse(saved) : initialDocumentTypes;
  });

  const [users, setUsers] = useState(() => {
    const saved = localStorage.getItem('inv_users');
    if (saved) {
      const parsedUsers = JSON.parse(saved);
      return parsedUsers.map(u => ({ ...u, password: u.password || '123' }));
    }
    return initialUsers;
  });

  const [currentUser, setCurrentUser] = useState(() => {
    const saved = localStorage.getItem('inv_current_user');
    return saved ? JSON.parse(saved) : null;
  });

  useEffect(() => {
    localStorage.setItem('inv_products', JSON.stringify(products));
  }, [products]);

  useEffect(() => {
    localStorage.setItem('inv_movements', JSON.stringify(movements));
  }, [movements]);

  useEffect(() => {
    localStorage.setItem('inv_categories', JSON.stringify(categories));
  }, [categories]);

  useEffect(() => {
    localStorage.setItem('inv_doc_types', JSON.stringify(documentTypes));
  }, [documentTypes]);

  useEffect(() => {
    localStorage.setItem('inv_users', JSON.stringify(users));
  }, [users]);

  useEffect(() => {
    if (currentUser) {
      localStorage.setItem('inv_current_user', JSON.stringify(currentUser));
    } else {
      localStorage.removeItem('inv_current_user');
    }
  }, [currentUser]);

  const addProduct = (product) => {
    setProducts(prev => [...prev, { ...product, id: crypto.randomUUID() }]);
  };

  const updateProduct = (id, updatedProduct) => {
    setProducts(prev => prev.map(p => p.id === id ? { ...p, ...updatedProduct } : p));
  };

  const deleteProduct = (id) => {
    setProducts(prev => prev.filter(p => p.id !== id));
  };

  const addMovement = (movement) => {
    const factor = movement.type === 'out' ? -1 : 1;

    setProducts(prev => {
      let temp = [...prev];
      movement.items.forEach(item => {
        temp = temp.map(p => {
          if (p.id === item.productId) {
            return {
              ...p,
              stockUnits: Number(p.stockUnits) + (Number(item.qtyUnits || 0) * factor),
              stockPounds: Number(p.stockPounds) + (Number(item.qtyPounds || 0) * factor),
              stockBaskets: Number(p.stockBaskets) + (Number(item.qtyBaskets || 0) * factor)
            };
          }
          return p;
        });
      });
      return temp;
    });

    setMovements(prev => [{ ...movement, id: crypto.randomUUID(), createdAt: new Date().toISOString() }, ...prev]);
  };

  const deleteMovement = (id) => {
    const mov = movements.find(m => m.id === id);
    if (!mov) return;
    
    const factor = mov.type === 'out' ? 1 : -1;
    setProducts(prev => {
      let temp = [...prev];
      mov.items.forEach(item => {
        temp = temp.map(p => {
          if (p.id === item.productId) {
            return {
              ...p,
              stockUnits: Number(p.stockUnits) + (Number(item.qtyUnits || 0) * factor),
              stockPounds: Number(p.stockPounds) + (Number(item.qtyPounds || 0) * factor),
              stockBaskets: Number(p.stockBaskets) + (Number(item.qtyBaskets || 0) * factor)
            };
          }
          return p;
        });
      });
      return temp;
    });
    setMovements(prev => prev.filter(m => m.id !== id));
  };

  const updateMovement = (id, updatedMovement) => {
    const oldMov = movements.find(m => m.id === id);
    if (!oldMov) return;

    setProducts(prevProducts => {
      let temp = [...prevProducts];

      const factorOld = oldMov.type === 'out' ? 1 : -1;
      oldMov.items.forEach(item => {
        temp = temp.map(p => p.id === item.productId ? {
          ...p,
          stockUnits: Number(p.stockUnits) + (Number(item.qtyUnits || 0) * factorOld),
          stockPounds: Number(p.stockPounds) + (Number(item.qtyPounds || 0) * factorOld),
          stockBaskets: Number(p.stockBaskets) + (Number(item.qtyBaskets || 0) * factorOld)
        } : p);
      });

      const factorNew = updatedMovement.type === 'out' ? -1 : 1;
      updatedMovement.items.forEach(item => {
        temp = temp.map(p => p.id === item.productId ? {
          ...p,
          stockUnits: Number(p.stockUnits) + (Number(item.qtyUnits || 0) * factorNew),
          stockPounds: Number(p.stockPounds) + (Number(item.qtyPounds || 0) * factorNew),
          stockBaskets: Number(p.stockBaskets) + (Number(item.qtyBaskets || 0) * factorNew)
        } : p);
      });

      return temp;
    });

    setMovements(prev => prev.map(m => m.id === id ? { ...updatedMovement, id, createdAt: m.createdAt } : m));
  };

  const addCategory = (category) => {
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

  const addUser = (user) => {
    setUsers(prev => [...prev, { ...user, id: crypto.randomUUID() }]);
  };

  const login = (username, password) => {
    const user = users.find(u => u.username === username && u.password === password);
    if (user) {
      setCurrentUser(user);
      return true;
    }
    return false;
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
      login,
      logout,
      totalStock
    }}>
      {children}
    </InventoryContext.Provider>
  );
};
