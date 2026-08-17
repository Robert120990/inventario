import React, { useState } from 'react';
import { BookOpen, Search, Shield, Package, ClipboardCheck, ArrowRightLeft, ShieldCheck, FileText, Settings, Users, Key, HelpCircle, CheckCircle2, ChevronRight } from 'lucide-react';

const SECTIONS = [
  {
    id: 'intro',
    title: '1. Introducción y Acceso',
    icon: <Key size={18} />,
    content: (
      <div>
        <h2 style={{ fontSize: '1.25rem', color: 'var(--color-primary)', marginBottom: '1rem' }}>Inicio de Sesión y Control de Accesos</h2>
        <p style={{ lineHeight: 1.6, color: 'var(--color-text)', marginBottom: '1rem' }}>
          El sistema <strong>Inventario Pro</strong> cuenta con un módulo centralizado de autenticación segura en el servidor.
        </p>
        <div className="card" style={{ backgroundColor: 'var(--color-bg)', marginBottom: '1rem', borderLeft: '4px solid var(--color-primary)' }}>
          <h4 style={{ margin: '0 0 0.5rem 0', color: 'var(--color-primary)' }}>Pasos para Iniciar Sesión:</h4>
          <ol style={{ paddingLeft: '1.25rem', lineHeight: 1.6, margin: 0 }}>
            <li>Ingresa tu nombre de usuario asignado por el administrador.</li>
            <li>Digita tu contraseña correspondiente.</li>
            <li>Haz clic en el botón <strong>Entrar</strong>.</li>
            <li>El sistema validará tus credenciales y cargará la interfaz con los permisos específicos asignados a tu rol.</li>
          </ol>
        </div>
        <p style={{ fontSize: '0.875rem', color: 'var(--color-text-light)' }}>
          <strong>Nota de Seguridad:</strong> Si olvidas tu contraseña o tu cuenta aparece como desactivada, contacta al Administrador del sistema para reactivar tu acceso desde el módulo de Seguridad.
        </p>
      </div>
    )
  },
  {
    id: 'products',
    title: '2. Gestión de Productos',
    icon: <Package size={18} />,
    content: (
      <div>
        <h2 style={{ fontSize: '1.25rem', color: 'var(--color-primary)', marginBottom: '1rem' }}>Catálogo de Productos y Existencias</h2>
        <p style={{ lineHeight: 1.6, color: 'var(--color-text)', marginBottom: '1rem' }}>
          En este módulo puedes dar de alta, consultar, editar y supervisar el inventario de cada producto.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
          <div className="card" style={{ padding: '1rem' }}>
            <h4 style={{ color: 'var(--color-primary)', margin: '0 0 0.5rem 0' }}>Unidades (Piezas/Cajas)</h4>
            <p style={{ fontSize: '0.85rem', color: 'var(--color-text-light)', margin: 0 }}>
              Control por cantidad entera de bultos o piezas disponibles.
            </p>
          </div>
          <div className="card" style={{ padding: '1rem' }}>
            <h4 style={{ color: 'var(--color-primary)', margin: '0 0 0.5rem 0' }}>Libras (Peso Neto)</h4>
            <p style={{ fontSize: '0.85rem', color: 'var(--color-text-light)', margin: 0 }}>
              Control de peso para mercancía perecedera o granel.
            </p>
          </div>
          <div className="card" style={{ padding: '1rem' }}>
            <h4 style={{ color: 'var(--color-primary)', margin: '0 0 0.5rem 0' }}>Cestas / Tarimas</h4>
            <p style={{ fontSize: '0.85rem', color: 'var(--color-text-light)', margin: 0 }}>
              Control de contenedores físicos y embalajes.
            </p>
          </div>
        </div>
        <h4 style={{ color: 'var(--color-text)', marginBottom: '0.5rem' }}>Búsqueda Inteligente:</h4>
        <p style={{ fontSize: '0.9rem', color: 'var(--color-text-light)', lineHeight: 1.5 }}>
          La barra de búsqueda permite buscar productos por código SKU, descripción parcial o coincidencia de múltiples palabras en cualquier orden.
        </p>
      </div>
    )
  },
  {
    id: 'inventory-count',
    title: '3. Toma de Inventario',
    icon: <ClipboardCheck size={18} />,
    content: (
      <div>
        <h2 style={{ fontSize: '1.25rem', color: 'var(--color-primary)', marginBottom: '1rem' }}>Toma de Inventario y Ajuste Transaccional</h2>
        <p style={{ lineHeight: 1.6, color: 'var(--color-text)', marginBottom: '1rem' }}>
          Esta herramienta permite registrar los conteos físicos de almacén y compararlos automáticamente con las existencias registradas en el sistema.
        </p>
        <div className="card" style={{ backgroundColor: 'var(--color-bg)', marginBottom: '1rem' }}>
          <h4 style={{ margin: '0 0 0.5rem 0', color: 'var(--color-primary)' }}>Flujo de Conteo y Cuadre:</h4>
          <ol style={{ paddingLeft: '1.25rem', lineHeight: 1.6, margin: 0 }}>
            <li>Ingresa las cantidades contadas físicamente en almacén (Unidades, Libras y Cestas).</li>
            <li>El sistema calcula de forma inmediata las diferencias en tiempo real.</li>
            <li>Si existe diferencia, ingresa el <strong>motivo del ajuste</strong> (ej. merma, daño, reconteo físico).</li>
            <li>Al hacer clic en <strong>Ajustar Inventario</strong>, el sistema ejecuta una transacción atómica y registra el evento con el usuario auditor en la bitácora.</li>
          </ol>
        </div>
      </div>
    )
  },
  {
    id: 'movements',
    title: '4. Movimientos (Entradas y Salidas)',
    icon: <ArrowRightLeft size={18} />,
    content: (
      <div>
        <h2 style={{ fontSize: '1.25rem', color: 'var(--color-primary)', marginBottom: '1rem' }}>Registro de Entradas y Salidas de Mercancía</h2>
        <p style={{ lineHeight: 1.6, color: 'var(--color-text)', marginBottom: '1rem' }}>
          Registra recepciones de proveedores y despachos a clientes con trazabilidad completa.
        </p>
        <ul style={{ paddingLeft: '1.25rem', lineHeight: 1.6, color: 'var(--color-text)', marginBottom: '1rem' }}>
          <li><strong>Datos de Embarque:</strong> Tipo de equipo, transportista, número de sello o precinto, tipo de documento y número de referencia.</li>
          <li><strong>Condiciones Térmicas:</strong> Registro de temperatura por producto.</li>
          <li><strong>Servicios Adicionales:</strong> Registro de costos por maniobras, emplayado, refrigeración o flete.</li>
          <li><strong>Generación de Comprobante:</strong> Descarga de comprobante oficial en formato PDF al instante.</li>
        </ul>
      </div>
    )
  },
  {
    id: 'reports',
    title: '5. Reportes y Cortes',
    icon: <FileText size={18} />,
    content: (
      <div>
        <h2 style={{ fontSize: '1.25rem', color: 'var(--color-primary)', marginBottom: '1rem' }}>Reportes Financieros y de Control</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div className="card" style={{ padding: '1rem' }}>
            <h4 style={{ color: 'var(--color-primary)', margin: '0 0 0.25rem 0' }}>Corte de Seguro</h4>
            <p style={{ fontSize: '0.85rem', color: 'var(--color-text-light)', margin: 0 }}>
              Genera la valoración total del inventario asegurado, excluyendo automáticamente productos sin existencia o precio para pólizas de seguro.
            </p>
          </div>
          <div className="card" style={{ padding: '1rem' }}>
            <h4 style={{ color: 'var(--color-primary)', margin: '0 0 0.25rem 0' }}>Resumen Detallado</h4>
            <p style={{ fontSize: '0.85rem', color: 'var(--color-text-light)', margin: 0 }}>
              Consolidado completo de movimientos, saldos iniciales, entradas, salidas y saldos finales por producto.
            </p>
          </div>
          <div className="card" style={{ padding: '1rem' }}>
            <h4 style={{ color: 'var(--color-primary)', margin: '0 0 0.25rem 0' }}>Resumen Diario</h4>
            <p style={{ fontSize: '0.85rem', color: 'var(--color-text-light)', margin: 0 }}>
              Control de volumen diario operado en almacén para supervisión de rendimiento.
            </p>
          </div>
        </div>
      </div>
    )
  },
  {
    id: 'security',
    title: '6. Módulo de Seguridad y Permisos',
    icon: <Shield size={18} />,
    content: (
      <div>
        <h2 style={{ fontSize: '1.25rem', color: 'var(--color-primary)', marginBottom: '1rem' }}>Administración de Seguridad, Roles y Auditoría</h2>
        <p style={{ lineHeight: 1.6, color: 'var(--color-text)', marginBottom: '1rem' }}>
          Este módulo exclusivo para administradores permite controlar el acceso total a la plataforma:
        </p>
        <ul style={{ paddingLeft: '1.25rem', lineHeight: 1.6, color: 'var(--color-text)', marginBottom: '1.5rem' }}>
          <li><strong>Usuarios:</strong> Creación y desactivación de cuentas con contraseñas seguras no expuestas.</li>
          <li><strong>Accesos de Usuario:</strong> Matriz detallada de permisos (Ver, Crear, Editar, Eliminar) para cada usuario.</li>
          <li><strong>Roles:</strong> Plantillas predefinidas (Administrador, Supervisor, Almacenista, Auditor, Consulta).</li>
          <li><strong>Bitácora del Sistema:</strong> Historial inmutable con filtros por módulo, usuario y fecha.</li>
          <li><strong>Usuarios Conectados:</strong> Visualización y cierre de sesiones activas.</li>
          <li><strong>Historial de Cambios:</strong> Publicación y consulta de versiones con qué hay de nuevo.</li>
          <li><strong>Bandeja de Notificaciones:</strong> Avisos del sistema y alertas generales.</li>
        </ul>
      </div>
    )
  },
  {
    id: 'faq',
    title: '7. Preguntas Frecuentes',
    icon: <HelpCircle size={18} />,
    content: (
      <div>
        <h2 style={{ fontSize: '1.25rem', color: 'var(--color-primary)', marginBottom: '1rem' }}>Preguntas Frecuentes (FAQ)</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div className="card" style={{ padding: '1rem' }}>
            <h4 style={{ color: 'var(--color-primary)', margin: '0 0 0.5rem 0' }}>¿Cómo cambio mi contraseña?</h4>
            <p style={{ fontSize: '0.85rem', color: 'var(--color-text-light)', margin: 0 }}>
              El Administrador del sistema puede cambiar o restablecer tu contraseña en cualquier momento desde el menú <em>Seguridad &gt; Usuarios</em>.
            </p>
          </div>
          <div className="card" style={{ padding: '1rem' }}>
            <h4 style={{ color: 'var(--color-primary)', margin: '0 0 0.5rem 0' }}>¿Qué pasa si no tengo permisos para editar?</h4>
            <p style={{ fontSize: '0.85rem', color: 'var(--color-text-light)', margin: 0 }}>
              Si tu rol es de solo lectura, los botones de acción como "Nuevo", "Editar" o "Eliminar" estarán ocultos automáticamente para proteger los datos.
            </p>
          </div>
          <div className="card" style={{ padding: '1rem' }}>
            <h4 style={{ color: 'var(--color-primary)', margin: '0 0 0.5rem 0' }}>¿Cómo exporto reportes a Excel / CSV?</h4>
            <p style={{ fontSize: '0.85rem', color: 'var(--color-text-light)', margin: 0 }}>
              En cada módulo de reportes y catálogo de productos encontrarás el botón <strong>Exportar CSV</strong> en la parte superior derecha.
            </p>
          </div>
        </div>
      </div>
    )
  }
];

const UserManual = () => {
  const [activeSection, setActiveSection] = useState('intro');
  const [searchQuery, setSearchQuery] = useState('');

  const currentSec = SECTIONS.find(s => s.id === activeSection) || SECTIONS[0];

  const filteredSections = SECTIONS.filter(s =>
    s.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div>
      <div className="topbar">
        <div>
          <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <BookOpen size={24} style={{ color: 'var(--color-primary)' }} /> Manual de Usuario y Guía del Sistema
          </h1>
          <p style={{ color: 'var(--color-text-light)', fontSize: '0.875rem' }}>
            Documentación interactiva y paso a paso para el uso óptimo de todos los módulos.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-3" style={{ gap: '1.5rem', alignItems: 'flex-start' }}>
        {/* Left Nav */}
        <div className="card" style={{ padding: '1rem', gridColumn: 'span 1' }}>
          <div style={{ position: 'relative', marginBottom: '1rem' }}>
            <input
              type="text"
              className="form-input"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar tema..."
              style={{ paddingLeft: '2rem', fontSize: '0.85rem' }}
            />
            <Search size={14} style={{ position: 'absolute', left: '0.65rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-light)' }} />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
            {filteredSections.map(s => (
              <button
                key={s.id}
                type="button"
                onClick={() => setActiveSection(s.id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '0.65rem 0.75rem',
                  borderRadius: 'var(--radius)',
                  border: 'none',
                  backgroundColor: activeSection === s.id ? 'var(--color-primary)' : 'transparent',
                  color: activeSection === s.id ? 'white' : 'var(--color-text)',
                  cursor: 'pointer',
                  textAlign: 'left',
                  fontSize: '0.85rem',
                  fontWeight: activeSection === s.id ? '600' : 'normal',
                  transition: 'var(--transition)'
                }}
              >
                <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  {s.icon} {s.title}
                </span>
                <ChevronRight size={14} style={{ opacity: activeSection === s.id ? 1 : 0.4 }} />
              </button>
            ))}
          </div>
        </div>

        {/* Right Content */}
        <div className="card" style={{ gridColumn: 'span 2', padding: '2rem', minHeight: '400px' }}>
          {currentSec.content}
        </div>
      </div>
    </div>
  );
};

export default UserManual;
