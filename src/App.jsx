import React, { useState } from 'react';
import Sidebar from './components/Sidebar';
import Dashboard from './components/Dashboard';
import { InventoryProvider, useInventory } from './context/InventoryContext';
import ProductList from './components/Products/ProductList';
import MovementList from './components/Movements/MovementList';
import Summary from './components/Summary/Summary';
import Settings from './components/Settings/Settings';
import Login from './components/Login/Login';
import './App.css';

function AppContent() {
  const { currentUser } = useInventory();
  const [currentView, setCurrentView] = useState('dashboard');

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
      case 'settings':
        return <Settings />;
      default:
        return <Dashboard />;
    }
  };

  return (
    <div className="app-container">
      <Sidebar currentView={currentView} setCurrentView={setCurrentView} />
      <main className="main-content">
        {renderView()}
      </main>
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
