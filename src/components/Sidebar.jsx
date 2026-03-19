import React from 'react';
import { LayoutDashboard, Package, ArrowRightLeft, Settings, LogOut, FileText } from 'lucide-react';
import { useInventory } from '../context/InventoryContext';

const Sidebar = ({ currentView, setCurrentView }) => {
  const { currentUser, logout } = useInventory();

  return (
    <aside className="sidebar" style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      <div className="sidebar-logo">
        <Package size={24} />
        <span>InvenMaster</span>
      </div>
      <nav style={{ display: 'flex', flexDirection: 'column' }}>
        <button 
          className={`nav-link ${currentView === 'dashboard' ? 'active' : ''}`}
          onClick={() => setCurrentView('dashboard')}
          style={{ background: 'transparent', border: 'none', width: '100%', textAlign: 'left' }}
        >
          <LayoutDashboard size={20} /> Dashboard
        </button>
        <button 
          className={`nav-link ${currentView === 'products' ? 'active' : ''}`}
          onClick={() => setCurrentView('products')}
          style={{ background: 'transparent', border: 'none', width: '100%', textAlign: 'left' }}
        >
          <Package size={20} /> Productos
        </button>
        <button 
          className={`nav-link ${currentView === 'movements' ? 'active' : ''}`}
          onClick={() => setCurrentView('movements')}
          style={{ background: 'transparent', border: 'none', width: '100%', textAlign: 'left' }}
        >
          <ArrowRightLeft size={20} /> Movimientos
        </button>
        <button 
          className={`nav-link ${currentView === 'summary' ? 'active' : ''}`}
          onClick={() => setCurrentView('summary')}
          style={{ background: 'transparent', border: 'none', width: '100%', textAlign: 'left' }}
        >
          <FileText size={20} /> Resumen
        </button>
        {currentUser?.role === 'admin' && (
          <button 
            className={`nav-link ${currentView === 'settings' ? 'active' : ''}`}
            onClick={() => setCurrentView('settings')}
            style={{ background: 'transparent', border: 'none', width: '100%', textAlign: 'left' }}
          >
            <Settings size={20} /> Configuración
          </button>
        )}
      </nav>

      <div style={{ padding: '1rem 0', marginTop: 'auto', borderTop: '1px solid rgba(255,255,255,0.1)' }}>
        <div style={{ marginBottom: '1rem', fontSize: '0.875rem' }}>
          <p style={{ fontWeight: 'bold' }}>{currentUser?.username}</p>
          <p style={{ opacity: 0.7, fontSize: '0.75rem' }}>Rol: {currentUser?.role}</p>
        </div>
        <button onClick={logout} className="nav-link" style={{ background: 'transparent', border: 'none', width: '100%', textAlign: 'left', color: '#ff8a8a', marginBottom: 0 }}>
          <LogOut size={20} /> Cerrar Sesión
        </button>
      </div>
    </aside>
  );
};

export default Sidebar;
