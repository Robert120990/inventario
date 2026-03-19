import React, { useState } from 'react';
import Sidebar from './components/Sidebar';
import { Toaster } from 'react-hot-toast';
import Dashboard from './components/Dashboard';
import { InventoryProvider, useInventory } from './context/InventoryContext';
import ProductList from './components/Products/ProductList';
import MovementList from './components/Movements/MovementList';
import Summary from './components/Summary/Summary';
import Settings from './components/Settings/Settings';
import Login from './components/Login/Login';
import UserList from './components/Users/UserList'; // Added this import
import './App.css';

function AppContent() {
  const { currentUser } = useInventory();
  const [currentView, setCurrentView] = useState('products');
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);

  if (!currentUser) {
    return <Login />;
  }

  const renderView = () => {
    switch (currentView) {
      case 'dashboard':
        return <Dashboard />;
      case 'products':
        return <ProductList />;
      case 'movements':
        return <MovementList />;
      case 'summary':
        return <Summary />;
      case 'users':
        return <UserList />;
      case 'settings':
        return <Settings />;
      default:
        return <Dashboard />;
    }
  };

  return (
    <div className="app-container">
      <Toaster position="bottom-right" toastOptions={{ duration: 3000, style: { background: 'var(--color-card)', color: 'var(--color-text)', border: '1px solid var(--color-border)' } }} />
      <Sidebar 
        currentView={currentView} 
        setCurrentView={setCurrentView} 
        isCollapsed={isSidebarCollapsed}
        setIsCollapsed={setIsSidebarCollapsed}
      />
      <div className="main-content">
        {renderView()}
      </div>
    </div>
  );
}

function App() {
  return (
    <InventoryProvider>
      <AppContent />
    </InventoryProvider>
  );
}

export default App;
