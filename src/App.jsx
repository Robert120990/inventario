import React, { useState, lazy, Suspense } from 'react';
import { Menu, ShieldAlert } from 'lucide-react';
import Sidebar from './components/Sidebar';
import { Toaster } from 'react-hot-toast';
import Dashboard from './components/Dashboard';
import { InventoryProvider, useInventory } from './context/InventoryContext';
import Login from './components/Login/Login';
import { ThemeToggle } from './components/Theme/ThemeToggle';
import UpdateNotifier from './components/Common/UpdateNotifier';
import { APP_DISPLAY_VERSION, APP_BUILD_NUMBER, APP_COMMIT_HASH } from './config/version';
import './App.css';

// Lazy loading de módulos para optimización de bundle y carga ultra-rápida (Code-Splitting)
const ProductList = lazy(() => import('./components/Products/ProductList'));
const MovementList = lazy(() => import('./components/Movements/MovementList'));
const Summary = lazy(() => import('./components/Summary/Summary'));
const Summary2 = lazy(() => import('./components/Summary/Summary2'));
const InsuranceReport = lazy(() => import('./components/Insurance/InsuranceReport'));
const InventoryCount = lazy(() => import('./components/Inventory/InventoryCount'));
const Settings = lazy(() => import('./components/Settings/Settings'));
const UserList = lazy(() => import('./components/Users/UserList'));
const UserAccess = lazy(() => import('./components/Security/UserAccess/UserAccess'));
const RoleList = lazy(() => import('./components/Security/Roles/RoleList'));
const SystemLog = lazy(() => import('./components/Security/Audit/SystemLog'));
const ConnectedUsers = lazy(() => import('./components/Security/Sessions/ConnectedUsers'));
const ChangeHistory = lazy(() => import('./components/Security/Changelog/ChangeHistory'));
const NotificationCenter = lazy(() => import('./components/Security/Notifications/NotificationCenter'));
const UserManual = lazy(() => import('./components/Security/Manual/UserManual'));

function ViewLoader() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '360px', gap: '1rem' }}>
      <div style={{ width: '38px', height: '38px', border: '3px solid rgba(59, 130, 246, 0.15)', borderTopColor: 'var(--color-primary)', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }}></div>
      <span style={{ fontSize: '0.875rem', color: 'var(--color-text-light)', fontWeight: '500' }}>Cargando módulo...</span>
    </div>
  );
}

function AppContent() {
  const { currentUser, loading, refreshData, canView, isAdmin } = useInventory();
  const [currentView, setCurrentView] = useState('dashboard');
  const [targetAccessUserId, setTargetAccessUserId] = useState(null);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // Refresh data whenever the view changes to ensure sync between devices without infinite loops
  React.useEffect(() => {
    if (currentUser?.id) {
      refreshData();
    }
  }, [currentView]);

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
        return (isAdmin || canView('dashboard')) ? <Dashboard onNavigate={(v) => setCurrentView(v)} /> : <UnauthorizedView onGoHome={() => setCurrentView('dashboard')} />;
      case 'products':
        return (isAdmin || canView('products')) ? <ProductList /> : <UnauthorizedView onGoHome={() => setCurrentView('dashboard')} />;
      case 'movements':
        return (isAdmin || canView('movements')) ? <MovementList /> : <UnauthorizedView onGoHome={() => setCurrentView('dashboard')} />;
      case 'inventory-count':
        return (isAdmin || canView('inventory-count')) ? <InventoryCount /> : <UnauthorizedView onGoHome={() => setCurrentView('dashboard')} />;
      case 'summary':
        return (isAdmin || canView('summary')) ? <Summary /> : <UnauthorizedView onGoHome={() => setCurrentView('dashboard')} />;
      case 'summary2':
        return (isAdmin || canView('summary2')) ? <Summary2 /> : <UnauthorizedView onGoHome={() => setCurrentView('dashboard')} />;
      case 'insurance':
        return (isAdmin || canView('insurance')) ? <InsuranceReport /> : <UnauthorizedView onGoHome={() => setCurrentView('dashboard')} />;
      
      // Granular Security Module Routes
      case 'security-users':
      case 'users':
        return (isAdmin || canView('security-users')) 
          ? <UserList onConfigureAccess={(u) => { setTargetAccessUserId(u.id); setCurrentView('security-access'); }} /> 
          : <UnauthorizedView onGoHome={() => setCurrentView('dashboard')} />;
      case 'security-access':
        return (isAdmin || canView('security-access')) 
          ? <UserAccess initialSelectedUserId={targetAccessUserId} /> 
          : <UnauthorizedView onGoHome={() => setCurrentView('dashboard')} />;
      case 'security-roles':
        return (isAdmin || canView('security-roles')) 
          ? <RoleList /> 
          : <UnauthorizedView onGoHome={() => setCurrentView('dashboard')} />;
      case 'security-logs':
        return (isAdmin || canView('security-logs')) 
          ? <SystemLog /> 
          : <UnauthorizedView onGoHome={() => setCurrentView('dashboard')} />;
      case 'security-sessions':
        return (isAdmin || canView('security-sessions')) 
          ? <ConnectedUsers /> 
          : <UnauthorizedView onGoHome={() => setCurrentView('dashboard')} />;
      case 'security-changelog':
        return (isAdmin || canView('security-changelog'))
          ? <ChangeHistory />
          : <UnauthorizedView onGoHome={() => setCurrentView('dashboard')} />;
      case 'security-notifications':
        return (isAdmin || canView('security-notifications'))
          ? <NotificationCenter />
          : <UnauthorizedView onGoHome={() => setCurrentView('dashboard')} />;
      case 'security-manual':
        return (isAdmin || canView('security-manual'))
          ? <UserManual />
          : <UnauthorizedView onGoHome={() => setCurrentView('dashboard')} />;

      case 'settings':
        return (isAdmin || canView('settings')) 
          ? <Settings /> 
          : <UnauthorizedView onGoHome={() => setCurrentView('dashboard')} />;
      default:
        return <Dashboard />;
    }
  };

  return (
    <div className="app-container">
      <UpdateNotifier />
      <Toaster position="bottom-right" toastOptions={{ duration: 3000, style: { background: 'var(--color-card)', color: 'var(--color-text)', border: '1px solid var(--color-border)' } }} />
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
        <Suspense fallback={<ViewLoader />}>
          {renderView()}
        </Suspense>
        
        {/* Stitch App Page Footer with Version Pill Badge */}
        <footer className="app-page-footer">
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
            <button
              onClick={() => setCurrentView('security-changelog')}
              className="version-pill-badge"
              title="Ver Historial de Cambios y Novedades"
              type="button"
            >
              <span className="version-pill-tag">NUEVA</span>
              <span className="version-pill-number">{APP_DISPLAY_VERSION}</span>
              <span className="version-pill-commit">#{APP_BUILD_NUMBER} · {APP_COMMIT_HASH}</span>
            </button>
            <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
              Actualización automática de versión por commit
            </span>
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
            © 2026 Sistema de Inventario · Todos los derechos reservados
          </div>
        </footer>
      </div>
    </div>
  );
}

function UnauthorizedView({ onGoHome }) {
  return (
    <div className="card" style={{ textAlign: 'center', padding: '3rem', margin: '2rem auto', maxWidth: '500px' }}>
      <ShieldAlert size={48} style={{ color: 'var(--color-danger)', margin: '0 auto 1rem' }} />
      <h2 style={{ color: 'var(--color-text)', marginBottom: '0.5rem' }}>Acceso Restringido</h2>
      <p style={{ color: 'var(--color-text-light)', fontSize: '0.875rem', marginBottom: '1.5rem' }}>
        No cuentas con permisos para acceder a esta pantalla. Contacta al Administrador si requieres autorización.
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
