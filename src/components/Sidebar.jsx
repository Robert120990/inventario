import React from 'react';
import { LayoutDashboard, Package, ArrowRightLeft, Settings, LogOut, FileText, Menu, ChevronLeft, Users } from 'lucide-react';
import { useInventory } from '../context/InventoryContext';

const Sidebar = ({ currentView, setCurrentView, isCollapsed, setIsCollapsed }) => {
  const { currentUser, settings, logout } = useInventory();

  return (
    <div className={`sidebar ${isCollapsed ? 'collapsed' : ''}`}>
      <div className="sidebar-logo" style={{ justifyContent: isCollapsed ? 'center' : 'space-between', marginBottom: '2rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', overflow: 'hidden' }}>
          {settings.logo ? (
            <img src={settings.logo} alt="Logo" style={{ width: '28px', height: '28px', objectFit: 'contain' }} />
          ) : (
            <Package size={28} />
          )}
          {!isCollapsed && <span style={{ whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>{settings.name}</span>}
        </div>
        <button
          onClick={() => setIsCollapsed(!isCollapsed)}
          style={{ background: 'transparent', border: 'none', color: 'white', cursor: 'pointer', padding: '0.25rem', display: 'flex' }}
        >
          {isCollapsed ? <Menu size={20} /> : <ChevronLeft size={20} />}
        </button>
      </div>
      <nav style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        <button
          className={`nav-link ${currentView === 'dashboard' ? 'active' : ''}`}
          onClick={() => setCurrentView('dashboard')}
          title={isCollapsed ? "Dashboard" : ""}
          style={{ background: 'transparent', border: 'none', width: '100%', textAlign: 'left', justifyContent: isCollapsed ? 'center' : 'flex-start' }}
        >
          <LayoutDashboard size={20} />
          {!isCollapsed && <span>Dashboard</span>}
        </button>
        <button
          className={`nav-link ${currentView === 'products' ? 'active' : ''}`}
          onClick={() => setCurrentView('products')}
          title={isCollapsed ? "Productos" : ""}
          style={{ background: 'transparent', border: 'none', width: '100%', textAlign: 'left', justifyContent: isCollapsed ? 'center' : 'flex-start' }}
        >
          <Package size={20} />
          {!isCollapsed && <span>Productos</span>}
        </button>
        <button
          className={`nav-link ${currentView === 'movements' ? 'active' : ''}`}
          onClick={() => setCurrentView('movements')}
          title={isCollapsed ? "Movimientos" : ""}
          style={{ background: 'transparent', border: 'none', width: '100%', textAlign: 'left', justifyContent: isCollapsed ? 'center' : 'flex-start' }}
        >
          <ArrowRightLeft size={20} />
          {!isCollapsed && <span>Movimientos</span>}
        </button>
        <button
          className={`nav-link ${currentView === 'summary' ? 'active' : ''}`}
          onClick={() => setCurrentView('summary')}
          title={isCollapsed ? "Resumen" : ""}
          style={{ background: 'transparent', border: 'none', width: '100%', textAlign: 'left', justifyContent: isCollapsed ? 'center' : 'flex-start' }}
        >
          <FileText size={20} />
          {!isCollapsed && <span>Resumen</span>}
        </button>
        {currentUser?.role === 'admin' && (
          <>
            <button 
              className={`nav-link ${currentView === 'users' ? 'active' : ''}`}
              onClick={() => setCurrentView('users')}
              title={isCollapsed ? "Usuarios" : ""}
              style={{ background: 'transparent', border: 'none', width: '100%', textAlign: 'left', justifyContent: isCollapsed ? 'center' : 'flex-start' }}
            >
              <Users size={20} /> 
              {!isCollapsed && <span>Usuarios</span>}
            </button>
            <button 
              className={`nav-link ${currentView === 'settings' ? 'active' : ''}`}
              onClick={() => setCurrentView('settings')}
              title={isCollapsed ? "Configuración" : ""}
              style={{ background: 'transparent', border: 'none', width: '100%', textAlign: 'left', justifyContent: isCollapsed ? 'center' : 'flex-start' }}
            >
              <Settings size={20} /> 
              {!isCollapsed && <span>Configuración</span>}
            </button>
          </>
        )}
      </nav>

      <div style={{ marginTop: 'auto', borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '1.5rem' }}>
        {!isCollapsed && (
          <div className="user-info" style={{ marginBottom: '1rem' }}>
            <div style={{ fontSize: '0.875rem', color: 'rgba(255,255,255,0.7)' }}>Conectado como:</div>
            <div style={{ fontWeight: '600' }}>{currentUser.username} <span className="badge badge-primary" style={{ backgroundColor: 'rgba(255,255,255,0.2)', color: 'white' }}>{currentUser.role}</span></div>
          </div>
        )}
        <button
          className="nav-link"
          onClick={logout}
          title={isCollapsed ? "Cerrar Sesión" : ""}
          style={{ background: 'transparent', border: 'none', width: '100%', textAlign: 'left', color: '#ff7675', justifyContent: isCollapsed ? 'center' : 'flex-start' }}
        >
          <LogOut size={20} />
          {!isCollapsed && <span>Cerrar Sesión</span>}
        </button>
      </div>
    </div>
  );
};

export default Sidebar;
