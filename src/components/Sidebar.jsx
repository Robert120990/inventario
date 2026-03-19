import React from 'react';
import { LayoutDashboard, Package, ArrowRightLeft, Settings, LogOut, FileText, Menu, ChevronLeft, Users, UserCircle } from 'lucide-react';
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

      <div style={{ marginTop: 'auto', borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '1rem' }}>
        <div style={{ 
          display: 'flex', 
          alignItems: 'center', 
          gap: '0.75rem', 
          padding: isCollapsed ? '0.5rem' : '0.75rem 1rem',
          margin: '0.5rem',
          borderRadius: 'var(--radius)',
          backgroundColor: 'rgba(255,255,255,0.05)',
          marginBottom: '1rem'
        }}>
          <div style={{ 
            width: '32px', 
            height: '32px', 
            borderRadius: '50%', 
            backgroundColor: 'var(--color-primary)', 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center',
            color: 'white',
            flexShrink: 0
          }}>
            <UserCircle size={20} />
          </div>
          {!isCollapsed && (
            <div style={{ overflow: 'hidden' }}>
              <div style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.5)', lineHeight: '1' }}>Usuario</div>
              <div style={{ fontWeight: '600', fontSize: '0.9rem', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>
                {currentUser.username}
              </div>
              <span style={{ 
                fontSize: '0.65rem', 
                padding: '1px 6px', 
                borderRadius: '10px', 
                backgroundColor: currentUser.role === 'admin' ? '#f1c40f' : 'rgba(255,255,255,0.2)',
                color: currentUser.role === 'admin' ? '#000' : '#fff',
                textTransform: 'uppercase',
                fontWeight: 'bold',
                marginTop: '4px',
                display: 'inline-block'
              }}>
                {currentUser.role}
              </span>
            </div>
          )}
        </div>

        <button
          className="nav-link"
          onClick={logout}
          title={isCollapsed ? "Cerrar Sesión" : ""}
          style={{ 
            background: 'transparent', 
            border: 'none', 
            width: 'calc(100% - 1rem)', 
            margin: '0 0.5rem',
            textAlign: 'left', 
            color: '#ff7675', 
            justifyContent: isCollapsed ? 'center' : 'flex-start',
            padding: '0.75rem',
            borderRadius: 'var(--radius)'
          }}
        >
          <LogOut size={20} />
          {!isCollapsed && <span>Cerrar Sesión</span>}
        </button>
      </div>
    </div>
  );
};

export default Sidebar;
