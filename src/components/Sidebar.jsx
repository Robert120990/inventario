import React, { useState } from 'react';
import {
  LayoutDashboard, Package, ArrowRightLeft, Settings, LogOut, FileText,
  Menu, ChevronLeft, ChevronDown, ChevronUp, Users, UserCircle, ShieldCheck,
  ClipboardCheck, Shield, GitBranch, History, Bell, BookOpen, UserCheck
} from 'lucide-react';
import { useInventory } from '../context/InventoryContext';
import { formatDate } from '../utils/formatUtils';

const Sidebar = ({ currentView, setCurrentView, isCollapsed, setIsCollapsed, isMobileOpen, closeMobileMenu }) => {
  const { currentUser, settings, logout, currentVersion, unreadNotificationsCount, canView } = useInventory();
  const [isSecurityOpen, setIsSecurityOpen] = useState(true);

  const isSecurityView = currentView.startsWith('security-') || currentView === 'users';

  return (
    <aside className={`sidebar ${isCollapsed ? 'collapsed' : ''} ${isMobileOpen ? 'mobile-open' : ''}`} aria-label="Navegación principal">
      <div className="sidebar-logo" style={{ justifyContent: isCollapsed ? 'center' : 'space-between', marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', overflow: 'hidden' }}>
          {settings.logo ? (
            <img src={settings.logo} alt="Logo" style={{ width: '28px', height: '28px', objectFit: 'contain' }} />
          ) : (
            <Package size={28} />
          )}
          {!isCollapsed && <span style={{ whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden', fontWeight: '600' }}>{settings.name}</span>}
        </div>
        <button
          onClick={() => setIsCollapsed(!isCollapsed)}
          style={{ background: 'transparent', border: 'none', color: 'white', cursor: 'pointer', padding: '0.25rem', display: 'flex' }}
        >
          {isCollapsed ? <Menu size={20} /> : <ChevronLeft size={20} />}
        </button>
        <button className="mobile-close-button" onClick={closeMobileMenu} aria-label="Cerrar menú">×</button>
      </div>

      <nav style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', overflowY: 'auto', flex: 1 }}>
        {canView('dashboard') && (
          <button
            className={`nav-link ${currentView === 'dashboard' ? 'active' : ''}`}
            onClick={() => setCurrentView('dashboard')}
            title={isCollapsed ? "Dashboard" : ""}
            style={{ background: 'transparent', border: 'none', width: '100%', textAlign: 'left', justifyContent: isCollapsed ? 'center' : 'flex-start' }}
          >
            <LayoutDashboard size={20} />
            {!isCollapsed && <span>Dashboard</span>}
          </button>
        )}

        {canView('products') && (
          <button
            className={`nav-link ${currentView === 'products' ? 'active' : ''}`}
            onClick={() => setCurrentView('products')}
            title={isCollapsed ? "Productos" : ""}
            style={{ background: 'transparent', border: 'none', width: '100%', textAlign: 'left', justifyContent: isCollapsed ? 'center' : 'flex-start' }}
          >
            <Package size={20} />
            {!isCollapsed && <span>Productos</span>}
          </button>
        )}

        {canView('inventory-count') && (
          <button
            className={`nav-link ${currentView === 'inventory-count' ? 'active' : ''}`}
            onClick={() => setCurrentView('inventory-count')}
            title={isCollapsed ? "Toma de Inventario" : ""}
            style={{ background: 'transparent', border: 'none', width: '100%', textAlign: 'left', justifyContent: isCollapsed ? 'center' : 'flex-start' }}
          >
            <ClipboardCheck size={20} />
            {!isCollapsed && <span>Toma de Inventario</span>}
          </button>
        )}

        {canView('movements') && (
          <button
            className={`nav-link ${currentView === 'movements' ? 'active' : ''}`}
            onClick={() => setCurrentView('movements')}
            title={isCollapsed ? "Movimientos" : ""}
            style={{ background: 'transparent', border: 'none', width: '100%', textAlign: 'left', justifyContent: isCollapsed ? 'center' : 'flex-start' }}
          >
            <ArrowRightLeft size={20} />
            {!isCollapsed && <span>Movimientos</span>}
          </button>
        )}

        {canView('insurance') && (
          <button
            className={`nav-link ${currentView === 'insurance' ? 'active' : ''}`}
            onClick={() => setCurrentView('insurance')}
            title={isCollapsed ? "Corte de Seguro" : ""}
            style={{ background: 'transparent', border: 'none', width: '100%', textAlign: 'left', justifyContent: isCollapsed ? 'center' : 'flex-start' }}
          >
            <ShieldCheck size={20} />
            {!isCollapsed && <span>Corte de Seguro</span>}
          </button>
        )}

        {canView('summary') && (
          <button
            className={`nav-link ${currentView === 'summary' ? 'active' : ''}`}
            onClick={() => setCurrentView('summary')}
            title={isCollapsed ? "Resumen Detallado" : ""}
            style={{ background: 'transparent', border: 'none', width: '100%', textAlign: 'left', justifyContent: isCollapsed ? 'center' : 'flex-start' }}
          >
            <FileText size={20} />
            {!isCollapsed && <span>Resumen Detallado</span>}
          </button>
        )}

        {canView('summary2') && (
          <button
            className={`nav-link ${currentView === 'summary2' ? 'active' : ''}`}
            onClick={() => setCurrentView('summary2')}
            title={isCollapsed ? "Resumen Diario" : ""}
            style={{ background: 'transparent', border: 'none', width: '100%', textAlign: 'left', justifyContent: isCollapsed ? 'center' : 'flex-start' }}
          >
            <FileText size={20} style={{ opacity: 0.7 }} />
            {!isCollapsed && <span>Resumen Diario</span>}
          </button>
        )}

        {/* Security Module Accordion */}
        {(currentUser?.role === 'admin' || canView('security')) && (
          <div style={{ marginTop: '0.5rem', borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: '0.5rem' }}>
            <button
              onClick={() => {
                if (isCollapsed) setIsCollapsed(false);
                setIsSecurityOpen(!isSecurityOpen);
              }}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: isCollapsed ? 'center' : 'space-between',
                padding: '0.6rem 0.85rem',
                background: isSecurityView ? 'rgba(99, 102, 241, 0.12)' : 'transparent',
                border: 'none',
                borderRadius: 'var(--radius)',
                color: '#818cf8',
                cursor: 'pointer',
                fontWeight: '700',
                fontSize: '0.8rem',
                letterSpacing: '0.06em',
                textTransform: 'uppercase'
              }}
              title={isCollapsed ? "Seguridad" : ""}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                <Shield size={18} style={{ color: '#818cf8' }} />
                {!isCollapsed && <span>SEGURIDAD</span>}
              </div>
              {!isCollapsed && (
                isSecurityOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />
              )}
            </button>

            {(!isCollapsed && isSecurityOpen) && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem', paddingLeft: '0.75rem', marginTop: '0.25rem' }}>
                <button
                  className={`nav-link ${currentView === 'security-users' || currentView === 'users' ? 'active' : ''}`}
                  onClick={() => setCurrentView('security-users')}
                  style={{ background: 'transparent', border: 'none', width: '100%', textAlign: 'left', padding: '0.5rem 0.75rem', fontSize: '0.85rem' }}
                >
                  <UserCheck size={17} />
                  <span>Usuarios</span>
                </button>

                <button
                  className={`nav-link ${currentView === 'security-access' ? 'active' : ''}`}
                  onClick={() => setCurrentView('security-access')}
                  style={{ background: 'transparent', border: 'none', width: '100%', textAlign: 'left', padding: '0.5rem 0.75rem', fontSize: '0.85rem' }}
                >
                  <GitBranch size={17} />
                  <span>Accesos de Usuario</span>
                </button>

                <button
                  className={`nav-link ${currentView === 'security-roles' ? 'active' : ''}`}
                  onClick={() => setCurrentView('security-roles')}
                  style={{ background: 'transparent', border: 'none', width: '100%', textAlign: 'left', padding: '0.5rem 0.75rem', fontSize: '0.85rem' }}
                >
                  <Shield size={17} />
                  <span>Roles</span>
                </button>

                <button
                  className={`nav-link ${currentView === 'security-logs' ? 'active' : ''}`}
                  onClick={() => setCurrentView('security-logs')}
                  style={{ background: 'transparent', border: 'none', width: '100%', textAlign: 'left', padding: '0.5rem 0.75rem', fontSize: '0.85rem' }}
                >
                  <FileText size={17} />
                  <span>Bitácora del Sistema</span>
                </button>

                <button
                  className={`nav-link ${currentView === 'security-sessions' ? 'active' : ''}`}
                  onClick={() => setCurrentView('security-sessions')}
                  style={{ background: 'transparent', border: 'none', width: '100%', textAlign: 'left', padding: '0.5rem 0.75rem', fontSize: '0.85rem' }}
                >
                  <Users size={17} />
                  <span>Usuarios Conectados</span>
                </button>

                <button
                  className={`nav-link ${currentView === 'security-changelog' ? 'active' : ''}`}
                  onClick={() => setCurrentView('security-changelog')}
                  style={{ background: 'transparent', border: 'none', width: '100%', textAlign: 'left', padding: '0.5rem 0.75rem', fontSize: '0.85rem' }}
                >
                  <History size={17} />
                  <span>Historial de Cambios</span>
                </button>

                <button
                  className={`nav-link ${currentView === 'security-notifications' ? 'active' : ''}`}
                  onClick={() => setCurrentView('security-notifications')}
                  style={{ background: 'transparent', border: 'none', width: '100%', textAlign: 'left', padding: '0.5rem 0.75rem', fontSize: '0.85rem', justifyContent: 'space-between' }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <Bell size={17} />
                    <span>Bandeja de Notificaciones</span>
                  </div>
                  {unreadNotificationsCount > 0 && (
                    <span style={{ backgroundColor: '#ef4444', color: 'white', fontSize: '0.65rem', padding: '1px 6px', borderRadius: '10px', fontWeight: 'bold' }}>
                      {unreadNotificationsCount}
                    </span>
                  )}
                </button>

                <button
                  className={`nav-link ${currentView === 'security-manual' ? 'active' : ''}`}
                  onClick={() => setCurrentView('security-manual')}
                  style={{ background: 'transparent', border: 'none', width: '100%', textAlign: 'left', padding: '0.5rem 0.75rem', fontSize: '0.85rem' }}
                >
                  <BookOpen size={17} />
                  <span>Manual de Usuario</span>
                </button>
              </div>
            )}
          </div>
        )}

        {(currentUser?.role === 'admin' || canView('settings')) && (
          <button
            className={`nav-link ${currentView === 'settings' ? 'active' : ''}`}
            onClick={() => setCurrentView('settings')}
            title={isCollapsed ? "Configuración" : ""}
            style={{ background: 'transparent', border: 'none', width: '100%', textAlign: 'left', justifyContent: isCollapsed ? 'center' : 'flex-start', marginTop: '0.5rem' }}
          >
            <Settings size={20} />
            {!isCollapsed && <span>Configuración</span>}
          </button>
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
                {currentUser?.username}
              </div>
              <span style={{
                fontSize: '0.65rem',
                padding: '1px 6px',
                borderRadius: '10px',
                backgroundColor: currentUser?.role === 'admin' ? '#f1c40f' : 'rgba(255,255,255,0.2)',
                color: currentUser?.role === 'admin' ? '#000' : '#fff',
                textTransform: 'uppercase',
                fontWeight: 'bold',
                marginTop: '4px',
                display: 'inline-block'
              }}>
                {currentUser?.roleName || currentUser?.role}
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

      {currentVersion && (
        <div style={{
          textAlign: 'center',
          padding: '0.5rem',
          fontSize: '0.7rem',
          color: 'rgba(255,255,255,0.45)',
          borderTop: '1px solid rgba(255,255,255,0.1)',
          marginTop: '0.25rem'
        }}>
          {currentVersion.version}{!isCollapsed && ` ${currentVersion.date ? '· ' + formatDate(currentVersion.date) : ''}`}
        </div>
      )}
    </aside>
  );
};

export default Sidebar;
