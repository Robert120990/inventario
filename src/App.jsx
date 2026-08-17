import React, { useState } from 'react';
import { Menu, ShieldAlert } from 'lucide-react';
import Sidebar from './components/Sidebar';
import { Toaster } from 'react-hot-toast';
import Dashboard from './components/Dashboard';
import { InventoryProvider, useInventory } from './context/InventoryContext';
import ProductList from './components/Products/ProductList';
import MovementList from './components/Movements/MovementList';
import Summary from './components/Summary/Summary';
import Summary2 from './components/Summary/Summary2';
import InsuranceReport from './components/Insurance/InsuranceReport';
import InventoryCount from './components/Inventory/InventoryCount';
import Settings from './components/Settings/Settings';
import Login from './components/Login/Login';
import UserList from './components/Users/UserList';
import UserAccess from './components/Security/UserAccess/UserAccess';
import RoleList from './components/Security/Roles/RoleList';
import SystemLog from './components/Security/Audit/SystemLog';
import ConnectedUsers from './components/Security/Sessions/ConnectedUsers';
import ChangeHistory from './components/Security/Changelog/ChangeHistory';
import NotificationCenter from './components/Security/Notifications/NotificationCenter';
import UserManual from './components/Security/Manual/UserManual';
import { ThemeToggle } from './components/Theme/ThemeToggle';
import './App.css';

function AppContent() {
  const { currentUser, loading, refreshData, canView } = useInventory();
  const [currentView, setCurrentView] = useState('dashboard');
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

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
          <p style={{ color: 'var(--color-text-light)', marginBottom: '1rem' }}>Cargando datos del servidor...</p>
          <button 
            onClick={() => refreshData()}
            style={{ padding: '0.5rem 1rem', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--color-border)', borderRadius: '4px', color: 'var(--color-text-light)', cursor: 'pointer', fontSize: '0.8rem' }}
          >
            Reintentar
          </button>
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
        return canView('dashboard') ? <Dashboard /> : <UnauthorizedView onGoHome={() => setCurrentView('dashboard')} />;
      case 'products':
        return canView('products') ? <ProductList /> : <UnauthorizedView onGoHome={() => setCurrentView('dashboard')} />;
      case 'movements':
        return canView('movements') ? <MovementList /> : <UnauthorizedView onGoHome={() => setCurrentView('dashboard')} />;
      case 'inventory-count':
        return canView('inventory-count') ? <InventoryCount /> : <UnauthorizedView onGoHome={() => setCurrentView('dashboard')} />;
      case 'summary':
        return canView('summary') ? <Summary /> : <UnauthorizedView onGoHome={() => setCurrentView('dashboard')} />;
      case 'summary2':
        return canView('summary2') ? <Summary2 /> : <UnauthorizedView onGoHome={() => setCurrentView('dashboard')} />;
      case 'insurance':
        return canView('insurance') ? <InsuranceReport /> : <UnauthorizedView onGoHome={() => setCurrentView('dashboard')} />;
      
      // Security Module Routes
      case 'security-users':
      case 'users':
        return (currentUser.role === 'admin' || canView('security')) 
          ? <UserList onConfigureAccess={(u) => setCurrentView('security-access')} /> 
          : <UnauthorizedView onGoHome={() => setCurrentView('dashboard')} />;
      case 'security-access':
        return (currentUser.role === 'admin' || canView('security')) 
          ? <UserAccess /> 
          : <UnauthorizedView onGoHome={() => setCurrentView('dashboard')} />;
      case 'security-roles':
        return (currentUser.role === 'admin' || canView('security')) 
          ? <RoleList /> 
          : <UnauthorizedView onGoHome={() => setCurrentView('dashboard')} />;
      case 'security-logs':
        return (currentUser.role === 'admin' || canView('security')) 
          ? <SystemLog /> 
          : <UnauthorizedView onGoHome={() => setCurrentView('dashboard')} />;
      case 'security-sessions':
        return (currentUser.role === 'admin' || canView('security')) 
          ? <ConnectedUsers /> 
          : <UnauthorizedView onGoHome={() => setCurrentView('dashboard')} />;
      case 'security-changelog':
        return <ChangeHistory />;
      case 'security-notifications':
        return <NotificationCenter />;
      case 'security-manual':
        return <UserManual />;

      case 'settings':
        return (currentUser.role === 'admin' || canView('settings')) 
          ? <Settings /> 
          : <UnauthorizedView onGoHome={() => setCurrentView('dashboard')} />;
      default:
        return <Dashboard />;
    }
  };

  return (
    <div className="app-container">
      <Toaster position="bottom-right" toastOptions={{ duration: 3000, style: { background: 'var(--color-card)', color: 'var(--color-text)', border: '1px solid var(--color-border)' } }} />
      <div className="app-version-badge" title="Versión basada en el commit de GitHub">
        v{import.meta.env.VITE_APP_VERSION}
      </div>
      <Sidebar 
        currentView={currentView} 
        setCurrentView={(view) => {
          setCurrentView(view);
          setIsMobileMenuOpen(false);
        }}
        isCollapsed={isSidebarCollapsed && !isMobileMenuOpen}
        setIsCollapsed={setIsSidebarCollapsed}
        isMobileOpen={isMobileMenuOpen}
        closeMobileMenu={() => setIsMobileMenuOpen(false)}
      />
      {isMobileMenuOpen && (
        <button className="sidebar-backdrop" aria-label="Cerrar menú" onClick={() => setIsMobileMenuOpen(false)} />
      )}
      <div className="main-content">
        <div className="mobile-header" style={{ justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <button className="mobile-menu-button" onClick={() => setIsMobileMenuOpen(true)} aria-label="Abrir menú">
              <Menu size={22} />
            </button>
            <span>Inventario</span>
          </div>
          <ThemeToggle />
        </div>
        {renderView()}
      </div>
    </div>
  );
}

function UnauthorizedView({ onGoHome }) {
  return (
    <div className="card" style={{ textAlign: 'center', padding: '3rem', margin: '2rem auto', maxWidth: '500px' }}>
      <ShieldAlert size={48} style={{ color: 'var(--color-danger)', margin: '0 auto 1rem' }} />
      <h2 style={{ color: 'var(--color-text)', marginBottom: '0.5rem' }}>Acceso No Autorizado</h2>
      <p style={{ color: 'var(--color-text-light)', fontSize: '0.875rem', marginBottom: '1.5rem' }}>
        No tienes permisos asignados para acceder a esta sección. Contacta al Administrador si requieres acceso.
      </p>
      <button className="btn btn-primary" onClick={onGoHome}>
        Volver al Dashboard
      </button>
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
