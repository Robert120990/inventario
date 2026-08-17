import React, { useState } from 'react';
import {
  LayoutDashboard, Package, ArrowRightLeft, Settings, LogOut, FileText,
  Menu, ChevronLeft, ChevronDown, ChevronUp, Users, UserCircle, ShieldCheck,
  ClipboardCheck, Shield, GitBranch, History, Bell, BookOpen, UserCheck
} from 'lucide-react';
import { useInventory } from '../context/InventoryContext';
import { formatDate } from '../utils/formatUtils';
import { ThemeToggle } from './Theme/ThemeToggle';

const Sidebar = ({ currentView, setCurrentView, isCollapsed, setIsCollapsed, isMobileOpen, closeMobileMenu }) => {
  const { currentUser, settings, logout, currentVersion, unreadNotificationsCount, canView } = useInventory();
  const [isSecurityOpen, setIsSecurityOpen] = useState(true);

  const isSecurityView = currentView.startsWith('security-') || currentView === 'users';

  const hasAnySecurityAccess = currentUser?.role === 'admin' ||
    canView('security-users') ||
    canView('security-access') ||
    canView('security-roles') ||
    canView('security-logs') ||
    canView('security-sessions') ||
    canView('security-changelog') ||
    canView('security-notifications') ||
    canView('security-manual');

  return (
    <aside className={`sidebar ${isCollapsed ? 'collapsed' : ''} ${isMobileOpen ? 'mobile-open' : ''}`} aria-label="Navegación principal">
      {/* Header Logo */}
      <div className="sidebar-logo">
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', overflow: 'hidden' }}>
          {settings.logo ? (
            <img src={settings.logo} alt="Logo" style={{ width: '28px', height: '28px', objectFit: 'contain' }} />
          ) : (
            <Package size={26} />
          )}
          {!isCollapsed && (
            <span style={{ whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden', fontWeight: '700', letterSpacing: '-0.02em' }}>
              {settings.name}
            </span>
          )}
        </div>
        <button
          onClick={() => setIsCollapsed(!isCollapsed)}
          style={{ background: 'transparent', border: 'none', color: 'white', cursor: 'pointer', padding: '0.25rem', display: 'flex' }}
          title={isCollapsed ? "Expandir menú" : "Contraer menú"}
        >
          {isCollapsed ? <Menu size={20} /> : <ChevronLeft size={20} />}
        </button>
        <button className="mobile-close-button" onClick={closeMobileMenu} aria-label="Cerrar menú">×</button>
      </div>

      {/* Nav Items List (Independently Scrollable) */}
      <nav className="sidebar-nav">
        {canView('dashboard') && (
          <button
            className={`nav-link ${currentView === 'dashboard' ? 'active' : ''}`}
            onClick={() => setCurrentView('dashboard')}
            title={isCollapsed ? "Dashboard" : ""}
          >
            <LayoutDashboard size={19} />
            {!isCollapsed && <span>Dashboard</span>}
          </button>
        )}

        {canView('products') && (
          <button
            className={`nav-link ${currentView === 'products' ? 'active' : ''}`}
            onClick={() => setCurrentView('products')}
            title={isCollapsed ? "Productos" : ""}
          >
            <Package size={19} />
            {!isCollapsed && <span>Productos</span>}
          </button>
        )}

        {canView('inventory-count') && (
          <button
            className={`nav-link ${currentView === 'inventory-count' ? 'active' : ''}`}
            onClick={() => setCurrentView('inventory-count')}
            title={isCollapsed ? "Toma de Inventario" : ""}
          >
            <ClipboardCheck size={19} />
            {!isCollapsed && <span>Toma de Inventario</span>}
          </button>
        )}

        {canView('movements') && (
          <button
            className={`nav-link ${currentView === 'movements' ? 'active' : ''}`}
            onClick={() => setCurrentView('movements')}
            title={isCollapsed ? "Movimientos" : ""}
          >
            <ArrowRightLeft size={19} />
            {!isCollapsed && <span>Movimientos</span>}
          </button>
        )}

        {canView('insurance') && (
          <button
            className={`nav-link ${currentView === 'insurance' ? 'active' : ''}`}
            onClick={() => setCurrentView('insurance')}
            title={isCollapsed ? "Corte de Seguro" : ""}
          >
            <ShieldCheck size={19} />
            {!isCollapsed && <span>Corte de Seguro</span>}
          </button>
        )}

        {canView('summary') && (
          <button
            className={`nav-link ${currentView === 'summary' ? 'active' : ''}`}
            onClick={() => setCurrentView('summary')}
            title={isCollapsed ? "Resumen Detallado" : ""}
          >
            <FileText size={19} />
            {!isCollapsed && <span>Resumen Detallado</span>}
          </button>
        )}

        {canView('summary2') && (
          <button
            className={`nav-link ${currentView === 'summary2' ? 'active' : ''}`}
            onClick={() => setCurrentView('summary2')}
            title={isCollapsed ? "Resumen Diario" : ""}
          >
            <FileText size={19} style={{ opacity: 0.7 }} />
            {!isCollapsed && <span>Resumen Diario</span>}
          </button>
        )}

        {/* Security Module Accordion */}
        {hasAnySecurityAccess && (
          <div style={{ marginTop: '0.4rem', borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: '0.4rem' }}>
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
                padding: '0.5rem 0.75rem',
                background: isSecurityView ? 'rgba(99, 102, 241, 0.16)' : 'transparent',
                border: 'none',
                borderRadius: 'var(--radius)',
                color: '#a5b4fc',
                cursor: 'pointer',
                fontWeight: '700',
                fontSize: '0.75rem',
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
                transition: 'var(--transition)'
              }}
              title={isCollapsed ? "Seguridad" : ""}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Shield size={17} style={{ color: '#a5b4fc' }} />
                {!isCollapsed && <span>SEGURIDAD</span>}
              </div>
              {!isCollapsed && (
                isSecurityOpen ? <ChevronUp size={15} /> : <ChevronDown size={15} />
              )}
            </button>

            {(!isCollapsed && isSecurityOpen) && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem', paddingLeft: '0.5rem', marginTop: '0.2rem' }}>
                {canView('security-users') && (
                  <button
                    className={`nav-link ${currentView === 'security-users' || currentView === 'users' ? 'active' : ''}`}
                    onClick={() => setCurrentView('security-users')}
                    style={{ padding: '0.45rem 0.65rem', fontSize: '0.8rem' }}
                  >
                    <UserCheck size={16} />
                    <span>Usuarios</span>
                  </button>
                )}

                {canView('security-access') && (
                  <button
                    className={`nav-link ${currentView === 'security-access' ? 'active' : ''}`}
                    onClick={() => setCurrentView('security-access')}
                    style={{ padding: '0.45rem 0.65rem', fontSize: '0.8rem' }}
                  >
                    <GitBranch size={16} />
                    <span>Accesos y Permisos</span>
                  </button>
                )}

                {canView('security-roles') && (
                  <button
                    className={`nav-link ${currentView === 'security-roles' ? 'active' : ''}`}
                    onClick={() => setCurrentView('security-roles')}
                    style={{ padding: '0.45rem 0.65rem', fontSize: '0.8rem' }}
                  >
                    <Shield size={16} />
                    <span>Roles</span>
                  </button>
                )}

                {canView('security-logs') && (
                  <button
                    className={`nav-link ${currentView === 'security-logs' ? 'active' : ''}`}
                    onClick={() => setCurrentView('security-logs')}
                    style={{ padding: '0.45rem 0.65rem', fontSize: '0.8rem' }}
                  >
                    <FileText size={16} />
                    <span>Bitácora del Sistema</span>
                  </button>
                )}

                {canView('security-sessions') && (
                  <button
                    className={`nav-link ${currentView === 'security-sessions' ? 'active' : ''}`}
                    onClick={() => setCurrentView('security-sessions')}
                    style={{ padding: '0.45rem 0.65rem', fontSize: '0.8rem' }}
                  >
                    <Users size={16} />
                    <span>Usuarios Conectados</span>
                  </button>
                )}

                {canView('security-changelog') && (
                  <button
                    className={`nav-link ${currentView === 'security-changelog' ? 'active' : ''}`}
                    onClick={() => setCurrentView('security-changelog')}
                    style={{ padding: '0.45rem 0.65rem', fontSize: '0.8rem' }}
                  >
                    <History size={16} />
                    <span>Historial de Cambios</span>
                  </button>
                )}

                {canView('security-notifications') && (
                  <button
                    className={`nav-link ${currentView === 'security-notifications' ? 'active' : ''}`}
                    onClick={() => setCurrentView('security-notifications')}
                    style={{ padding: '0.45rem 0.65rem', fontSize: '0.8rem', justifyContent: 'space-between' }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                      <Bell size={16} />
                      <span>Notificaciones</span>
                    </div>
                    {unreadNotificationsCount > 0 && (
                      <span style={{ backgroundColor: '#ef4444', color: 'white', fontSize: '0.65rem', padding: '1px 6px', borderRadius: '10px', fontWeight: 'bold' }}>
                        {unreadNotificationsCount}
                      </span>
                    )}
                  </button>
                )}

                {canView('security-manual') && (
                  <button
                    className={`nav-link ${currentView === 'security-manual' ? 'active' : ''}`}
                    onClick={() => setCurrentView('security-manual')}
                    style={{ padding: '0.45rem 0.65rem', fontSize: '0.8rem' }}
                  >
                    <BookOpen size={16} />
                    <span>Manual de Usuario</span>
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {(currentUser?.role === 'admin' || canView('settings')) && (
          <button
            className={`nav-link ${currentView === 'settings' ? 'active' : ''}`}
            onClick={() => setCurrentView('settings')}
            title={isCollapsed ? "Configuración" : ""}
            style={{ marginTop: '0.35rem' }}
          >
            <Settings size={19} />
            {!isCollapsed && <span>Configuración</span>}
          </button>
        )}
      </nav>

      {/* Footer Anchored at Bottom (Never Disappears) */}
      <div className="sidebar-footer">
        {!isCollapsed && (
          <div style={{ marginBottom: '0.5rem' }}>
            <ThemeToggle variant="sidebar" />
          </div>
        )}

        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.6rem',
          padding: isCollapsed ? '0.35rem' : '0.5rem 0.65rem',
          borderRadius: 'var(--radius)',
          backgroundColor: 'rgba(255,255,255,0.06)',
          marginBottom: '0.5rem'
        }}>
          <div style={{
            width: '30px',
            height: '30px',
            borderRadius: '50%',
            backgroundColor: 'rgba(255, 255, 255, 0.15)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'white',
            flexShrink: 0
          }}>
            <UserCircle size={18} />
          </div>
          {!isCollapsed && (
            <div style={{ overflow: 'hidden', flex: 1 }}>
              <div style={{ fontWeight: '600', fontSize: '0.85rem', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden', lineHeight: 1.2 }}>
                {currentUser?.username}
              </div>
              <span style={{
                fontSize: '0.65rem',
                padding: '1px 5px',
                borderRadius: '8px',
                backgroundColor: currentUser?.role === 'admin' ? '#f1c40f' : 'rgba(255,255,255,0.2)',
                color: currentUser?.role === 'admin' ? '#000' : '#fff',
                textTransform: 'uppercase',
                fontWeight: 'bold',
                marginTop: '2px',
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
            color: '#fca5a5',
            padding: isCollapsed ? '0.5rem' : '0.5rem 0.65rem',
            fontSize: '0.8rem'
          }}
        >
          <LogOut size={17} />
          {!isCollapsed && <span>Cerrar Sesión</span>}
        </button>

        {currentVersion && !isCollapsed && (
          <div style={{
            textAlign: 'center',
            fontSize: '0.65rem',
            color: 'rgba(255,255,255,0.4)',
            marginTop: '0.35rem'
          }}>
            {currentVersion.version}{currentVersion.date ? ` · ${formatDate(currentVersion.date)}` : ''}
          </div>
        )}
      </div>
    </aside>
  );
};

export default Sidebar;
