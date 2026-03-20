import React, { useState } from 'react';
import Sidebar from './components/Sidebar';
import { Toaster } from 'react-hot-toast';
import Dashboard from './components/Dashboard';
import { InventoryProvider, useInventory } from './context/InventoryContext';
import ProductList from './components/Products/ProductList';
import MovementList from './components/Movements/MovementList';
import Summary from './components/Summary/Summary';
import Summary2 from './components/Summary/Summary2';
import Settings from './components/Settings/Settings';
import Login from './components/Login/Login';
import UserList from './components/Users/UserList'; // Added this import
import './App.css';

function AppContent() {
  const { currentUser, loading, refreshData } = useInventory();
  const [currentView, setCurrentView] = useState('dashboard');
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);

  // Refresh data whenever the view changes to ensure sync between devices
  React.useEffect(() => {
    if (currentUser) {
      refreshData();
    }
  }, [currentView, currentUser]);

  if (loading) {
    return (
      <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'var(--color-bg)' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ width: '40px', height: '40px', border: '4px solid rgba(255,255,255,0.1)', borderTopColor: 'var(--color-primary)', borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto 1rem' }}></div>
          <p style={{ color: 'var(--color-text-light)' }}>Cargando datos del servidor...</p>
        </div>
        <style>{`
          @keyframes spin { to { transform: rotate(360deg); } }
        `}</style>
      </div>
    );
  }

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
      case 'summary2':
        return <Summary2 />;
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
