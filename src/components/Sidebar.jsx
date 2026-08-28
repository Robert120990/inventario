import React, { useState } from 'react';
import {
  LayoutDashboard, Package, ArrowRightLeft, Settings, LogOut, FileText,
  Menu, ChevronLeft, ChevronDown, ChevronUp, Users, UserCircle, ShieldCheck,
  ClipboardCheck, Shield, GitBranch, History, Bell, BookOpen, UserCheck, Sparkles, X
} from 'lucide-react';
import { useInventory } from '../context/InventoryContext';
import { formatDate } from '../utils/formatUtils';
import { ThemeToggle } from './Theme/ThemeToggle';
import { APP_DISPLAY_VERSION } from '../config/version';

const Sidebar = ({ currentView, setCurrentView, isCollapsed, setIsCollapsed, isMobileOpen, closeMobileMenu }) => {
  const { currentUser, settings, logout, currentVersion, unreadNotificationsCount, canView, isAdmin } = useInventory();
  const [isSecurityOpen, setIsSecurityOpen] = useState(true);

  const isSecurityView = currentView.startsWith('security-') || currentView === 'users';

  // Automatically keep security accordion open when viewing any security screen
  React.useEffect(() => {
    if (isSecurityView) {
      setIsSecurityOpen(true);
    }
  }, [isSecurityView]);

  const hasAnySecurityAccess =
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
      {/* Header Logo with Stitch Space Grotesk Typography */}
      <div className="sidebar-logo">
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', overflow: 'hidden' }}>
          <div style={{
            width: '34px',
            height: '34px',
            borderRadius: 'var(--radius)',
            background: 'linear-gradient(135deg, var(--color-primary) 0%, var(--color-primary-hover) 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            border: '1px solid rgba(255, 255, 255, 0.2)',
            boxShadow: '0 2px 8px rgba(0, 0, 0, 0.2)',
            flexShrink: 0
          }}>
            {settings.logo ? (
              <img src={settings.logo} alt="Logo" style={{ width: '22px', height: '22px', objectFit: 'contain' }} />
            ) : (
              <Package size={20} style={{ color: '#ffffff' }} />
            )}
          </div>
          {!isCollapsed && (
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span className="font-headline" style={{ whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden', fontWeight: '700', fontSize: '1.05rem', letterSpacing: '-0.02em', color: '#ffffff' }}>
                {settings.name || 'Inventario'}
              </span>
              <span style={{ fontSize: '0.65rem', color: 'rgba(255, 255, 255, 0.5)', fontWeight: '600', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                Command Center
              </span>
            </div>
          )}
        </div>
        
        <button
          onClick={() => setIsCollapsed(!isCollapsed)}
          style={{ background: 'rgba(255, 255, 255, 0.08)', border: 'none', color: 'white', cursor: 'pointer', padding: '0.35rem', display: 'flex', borderRadius: '6px', transition: 'var(--transition)' }}
          title={isCollapsed ? "Expandir menú" : "Contraer menú"}
        >
          {isCollapsed ? <Menu size={18} /> : <ChevronLeft size={18} />}
        </button>
        <button className="mobile-close-button" onClick={closeMobileMenu} aria-label="Cerrar menú">
          <X size={18} />
        </button>
      </div>

      {/* Nav Items List (Independently Scrollable with Stitch Pills) */}
      <nav className="sidebar-nav">
        {canView('dashboard') && (
          <button
            className={`nav-link ${currentView === 'dashboard' ? 'active' : ''}`}
            onClick={() => setCurrentView('dashboard')}
            title={isCollapsed ? "Dashboard" : ""}
          >
            <LayoutDashboard size={18} />
            {!isCollapsed && <span>Dashboard</span>}
          </button>
        )}

        {canView('products') && (
          <button
            className={`nav-link ${currentView === 'products' ? 'active' : ''}`}
            onClick={() => setCurrentView('products')}
            title={isCollapsed ? "Productos" : ""}
          >
            <Package size={18} />
            {!isCollapsed && <span>Productos</span>}
          </button>
        )}

        {canView('inventory-count') && (
          <button
            className={`nav-link ${currentView === 'inventory-count' ? 'active' : ''}`}
            onClick={() => setCurrentView('inventory-count')}
            title={isCollapsed ? "Toma de Inventario" : ""}
          >
            <ClipboardCheck size={18} />
            {!isCollapsed && <span>Toma de Inventario</span>}
          </button>
        )}

        {canView('movements') && (
          <button
            className={`nav-link ${currentView === 'movements' ? 'active' : ''}`}
            onClick={() => setCurrentView('movements')}
            title={isCollapsed ? "Movimientos" : ""}
          >
            <ArrowRightLeft size={18} />
            {!isCollapsed && <span>Movimientos</span>}
          </button>
        )}

        {canView('insurance') && (
          <button
            className={`nav-link ${currentView === 'insurance' ? 'active' : ''}`}
            onClick={() => setCurrentView('insurance')}
            title={isCollapsed ? "Corte de Seguro" : ""}
          >
            <ShieldCheck size={18} />
            {!isCollapsed && <span>Corte de Seguro</span>}
          </button>
        )}

        {canView('summary') && (
          <button
            className={`nav-link ${currentView === 'summary' ? 'active' : ''}`}
            onClick={() => setCurrentView('summary')}
            title={isCollapsed ? "Resumen Detallado" : ""}
          >
            <FileText size={18} />
            {!isCollapsed && <span>Resumen Detallado</span>}
          </button>
        )}

        {canView('summary2') && (
          <button
            className={`nav-link ${currentView === 'summary2' ? 'active' : ''}`}
            onClick={() => setCurrentView('summary2')}
            title={isCollapsed ? "Resumen Diario" : ""}
          >
            <FileText size={18} style={{ opacity: 0.75 }} />
            {!isCollapsed && <span>Resumen Diario</span>}
          </button>
        )}

        {/* Security Module Accordion */}
        {hasAnySecurityAccess && (
          <div style={{ marginTop: '0.6rem', borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: '0.6rem' }}>
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
                padding: '0.55rem 0.75rem',
                background: isSecurityView ? 'rgba(0, 209, 102, 0.12)' : 'transparent',
                border: 'none',
                borderRadius: 'var(--radius)',
                color: isSecurityView ? '#64ff92' : 'rgba(255, 255, 255, 0.65)',
                cursor: 'pointer',
                fontWeight: '700',
                fontSize: '0.75rem',
                fontFamily: 'var(--font-headline)',
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
                transition: 'var(--transition)'
              }}
              title={isCollapsed ? "Seguridad" : ""}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Shield size={16} style={{ color: isSecurityView ? '#64ff92' : 'inherit' }} />
                {!isCollapsed && <span>SEGURIDAD</span>}
              </div>
              {!isCollapsed && (
                isSecurityOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />
              )}
            </button>

            {(!isCollapsed && isSecurityOpen) && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem', paddingLeft: '0.5rem', marginTop: '0.25rem', borderLeft: '2px solid rgba(255, 255, 255, 0.08)', marginLeft: '0.5rem' }}>
                {canView('security-users') && (
                  <button
                    className={`nav-link ${currentView === 'security-users' || currentView === 'users' ? 'active' : ''}`}
                    onClick={() => setCurrentView('security-users')}
                    style={{ padding: '0.45rem 0.65rem', fontSize: '0.8rem' }}
                  >
                    <UserCheck size={15} />
                    <span>Usuarios</span>
                  </button>
                )}

                {canView('security-access') && (
                  <button
                    className={`nav-link ${currentView === 'security-access' ? 'active' : ''}`}
                    onClick={() => setCurrentView('security-access')}
                    style={{ padding: '0.45rem 0.65rem', fontSize: '0.8rem' }}
                  >
                    <GitBranch size={15} />
                    <span>Accesos y Permisos</span>
                  </button>
                )}

                {canView('security-roles') && (
                  <button
                    className={`nav-link ${currentView === 'security-roles' ? 'active' : ''}`}
                    onClick={() => setCurrentView('security-roles')}
                    style={{ padding: '0.45rem 0.65rem', fontSize: '0.8rem' }}
                  >
                    <Shield size={15} />
                    <span>Roles</span>
                  </button>
                )}

                {canView('security-logs') && (
                  <button
                    className={`nav-link ${currentView === 'security-logs' ? 'active' : ''}`}
                    onClick={() => setCurrentView('security-logs')}
                    style={{ padding: '0.45rem 0.65rem', fontSize: '0.8rem' }}
                  >
                    <FileText size={15} />
                    <span>Bitácora del Sistema</span>
                  </button>
                )}

                {canView('security-sessions') && (
                  <button
                    className={`nav-link ${currentView === 'security-sessions' ? 'active' : ''}`}
                    onClick={() => setCurrentView('security-sessions')}
                    style={{ padding: '0.45rem 0.65rem', fontSize: '0.8rem' }}
                  >
                    <Users size={15} />
                    <span>Usuarios Conectados</span>
                  </button>
                )}

                {canView('security-changelog') && (
                  <button
                    className={`nav-link ${currentView === 'security-changelog' ? 'active' : ''}`}
                    onClick={() => setCurrentView('security-changelog')}
                    style={{ padding: '0.45rem 0.65rem', fontSize: '0.8rem' }}
                  >
                    <History size={15} />
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
                      <Bell size={15} />
                      <span>Notificaciones</span>
                    </div>
                    {unreadNotificationsCount > 0 && (
                      <span style={{ backgroundColor: 'var(--color-danger)', color: 'white', fontSize: '0.65rem', padding: '1px 6px', borderRadius: '10px', fontWeight: 'bold' }}>
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
                    <BookOpen size={15} />
                    <span>Manual de Usuario</span>
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {canView('settings') && (
          <button
            className={`nav-link ${currentView === 'settings' ? 'active' : ''}`}
            onClick={() => setCurrentView('settings')}
            title={isCollapsed ? "Configuración" : ""}
            style={{ marginTop: '0.4rem' }}
          >
            <Settings size={18} />
            {!isCollapsed && <span>Configuración</span>}
          </button>
        )}
      </nav>


      {/* Footer Anchored at Bottom */}
      <div className="sidebar-footer">
        {!isCollapsed && (
          <div style={{ marginBottom: '0.4rem' }}>
            <ThemeToggle variant="sidebar" />
          </div>
        )}

        {/* User Card with Live Pill Dot */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.65rem',
          padding: isCollapsed ? '0.4rem' : '0.55rem 0.75rem',
          borderRadius: 'var(--radius)',
          backgroundColor: 'rgba(255,255,255,0.06)',
          border: '1px solid rgba(255, 255, 255, 0.06)'
        }}>
          <div style={{
            width: '32px',
            height: '32px',
            borderRadius: '50%',
            backgroundColor: 'rgba(0, 209, 102, 0.2)',
            border: '1px solid rgba(0, 209, 102, 0.4)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--color-primary-fixed)',
            fontWeight: '700',
            fontSize: '0.8rem',
            flexShrink: 0
          }}>
            {(currentUser?.username || 'U').charAt(0).toUpperCase()}
          </div>
          {!isCollapsed && (
            <div style={{ overflow: 'hidden', flex: 1 }}>
              <div style={{ fontWeight: '600', fontSize: '0.85rem', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden', lineHeight: 1.2, color: '#ffffff' }}>
                {currentUser?.username}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', marginTop: '2px' }}>
                <span className="status-dot" style={{ backgroundColor: '#00d166', width: '6px', height: '6px' }}></span>
                <span style={{
                  fontSize: '0.65rem',
                  color: 'rgba(255, 255, 255, 0.65)',
                  textTransform: 'uppercase',
                  fontWeight: '600'
                }}>
                  {currentUser?.roleName || currentUser?.role}
                </span>
              </div>
            </div>
          )}
        </div>

        <button
          className="nav-link"
          onClick={logout}
          title={isCollapsed ? "Cerrar Sesión" : ""}
          style={{
            color: '#fda4af',
            padding: isCollapsed ? '0.5rem' : '0.5rem 0.75rem',
            fontSize: '0.8rem',
            borderRadius: 'var(--radius)'
          }}
        >
          <LogOut size={16} />
          {!isCollapsed && <span>Cerrar Sesión</span>}
        </button>

        {!isCollapsed && (
          <div style={{ display: 'flex', justifyContent: 'center', marginTop: '0.35rem' }}>
            <button
              onClick={() => setCurrentView('security-changelog')}
              className="version-pill-badge"
              style={{ padding: '0.2rem 0.75rem', border: '1px solid rgba(255, 255, 255, 0.12)' }}
              title="Ver Historial de Cambios y Novedades"
              type="button"
            >
              <span className="version-pill-number" style={{ fontSize: '0.75rem' }}>{APP_DISPLAY_VERSION}</span>
            </button>
          </div>
        )}

      </div>
    </aside>
  );
};

export default Sidebar;
