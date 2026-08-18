import React, { useState, useEffect } from 'react';
import { useInventory } from '../../../context/InventoryContext';
import { FileText, Search, Filter, RefreshCw, Download, User, Calendar, Shield, Activity, FileSpreadsheet } from 'lucide-react';
import { exportBitacora } from '../../../utils/exportManager';
import { toast } from 'react-hot-toast';

const ACTION_COLORS = {
  LOGIN: 'badge-success',
  LOGOUT: 'badge-gray',
  LOGIN_FAILED: 'badge-danger',
  CREATE_USER: 'badge-primary',
  UPDATE_USER: 'badge-warning',
  DELETE_USER: 'badge-danger',
  UPDATE_PERMISSIONS: 'badge-primary',
  CREATE_ROLE: 'badge-primary',
  UPDATE_ROLE: 'badge-warning',
  DELETE_ROLE: 'badge-danger',
  CREATE_PRODUCT: 'badge-primary',
  UPDATE_PRODUCT: 'badge-warning',
  DELETE_PRODUCT: 'badge-danger',
  INVENTORY_ADJUSTMENT: 'badge-danger',
  MOVEMENT_IN: 'badge-success',
  MOVEMENT_OUT: 'badge-danger',
  UPDATE_MOVEMENT: 'badge-warning',
  DELETE_MOVEMENT: 'badge-danger',
  REGISTER_VERSION: 'badge-primary',
  UPDATE_SETTINGS: 'badge-primary'
};

const SystemLog = () => {
  const { systemLogs, fetchSystemLogs, canExport } = useInventory();
  const allowExport = canExport('security-logs');
  const [search, setSearch] = useState('');
  const [selectedModule, setSelectedModule] = useState('all');
  const [selectedAction, setSelectedAction] = useState('all');
  const [loading, setLoading] = useState(false);

  const loadLogs = async () => {
    setLoading(true);
    try {
      await fetchSystemLogs({
        module: selectedModule,
        action: selectedAction,
        search,
        limit: 200
      });
    } catch (e) {
      toast.error('Error al cargar bitácora');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadLogs();
  }, [selectedModule, selectedAction]);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    loadLogs();
  };

  const handleExportXlsx = () => {
    if (systemLogs.length === 0) {
      toast.error('No hay registros para exportar');
      return;
    }
    try {
      exportBitacora({
        systemLogs,
        format: 'xlsx'
      });
      toast.success('Bitácora exportada a Excel (.xlsx)');
    } catch (err) {
      console.error(err);
      toast.error('Error al exportar a Excel: ' + err.message);
    }
  };

  const handleExportCsv = () => {
    if (systemLogs.length === 0) {
      toast.error('No hay registros para exportar');
      return;
    }
    try {
      exportBitacora({
        systemLogs,
        format: 'csv'
      });
      toast.success('Bitácora exportada a CSV');
    } catch (err) {
      console.error(err);
      toast.error('Error al exportar a CSV: ' + err.message);
    }
  };

  return (
    <div>
      <div className="topbar">
        <div>
          <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <FileText size={24} style={{ color: 'var(--color-primary)' }} /> Bitácora y Auditoría del Sistema
          </h1>
          <p style={{ color: 'var(--color-text-light)', fontSize: '0.875rem' }}>
            Registro cronológico inmutable de todas las acciones, inicios de sesión y modificaciones del sistema.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <button className="btn btn-outline" onClick={loadLogs} disabled={loading} title="Actualizar">
            <RefreshCw size={16} className={loading ? 'spin' : ''} /> Actualizar
          </button>
          {allowExport && (
            <>
              <button className="btn btn-primary" onClick={handleExportXlsx} title="Exportar a Microsoft Excel">
                <FileSpreadsheet size={16} /> Excel (.xlsx)
              </button>
              <button className="btn btn-outline" onClick={handleExportCsv} title="Exportar a CSV estructurado">
                <Download size={16} /> CSV
              </button>
            </>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="card" style={{ marginBottom: '1.5rem', padding: '1rem 1.5rem' }}>
        <form onSubmit={handleSearchSubmit} style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', alignItems: 'flex-end' }}>
          <div className="form-group" style={{ flex: 2, minWidth: '220px', marginBottom: 0 }}>
            <label className="form-label" style={{ fontSize: '0.75rem' }}>Buscar por usuario o detalle</label>
            <div style={{ position: 'relative' }}>
              <input
                type="text"
                className="form-input"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Ej: admin, producto, ajuste..."
                style={{ paddingLeft: '2.25rem' }}
              />
              <Search size={16} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-light)' }} />
            </div>
          </div>

          <div className="form-group" style={{ flex: 1, minWidth: '160px', marginBottom: 0 }}>
            <label className="form-label" style={{ fontSize: '0.75rem' }}>Filtrar por Módulo</label>
            <select className="form-select" value={selectedModule} onChange={(e) => setSelectedModule(e.target.value)}>
              <option value="all">Todos los Módulos</option>
              <option value="auth">Autenticación (Login/Logout)</option>
              <option value="products">Productos</option>
              <option value="inventory-count">Toma de Inventario</option>
              <option value="movements">Movimientos</option>
              <option value="users">Usuarios</option>
              <option value="security">Seguridad y Roles</option>
              <option value="settings">Configuración</option>
            </select>
          </div>

          <div className="form-group" style={{ flex: 1, minWidth: '160px', marginBottom: 0 }}>
            <label className="form-label" style={{ fontSize: '0.75rem' }}>Filtrar por Acción</label>
            <select className="form-select" value={selectedAction} onChange={(e) => setSelectedAction(e.target.value)}>
              <option value="all">Todas las Acciones</option>
              <option value="LOGIN">Inicios de Sesión</option>
              <option value="LOGOUT">Cierres de Sesión</option>
              <option value="LOGIN_FAILED">Fallos de Acceso</option>
              <option value="CREATE_PRODUCT">Creación Productos</option>
              <option value="UPDATE_PRODUCT">Edición Productos</option>
              <option value="INVENTORY_ADJUSTMENT">Ajustes de Inventario</option>
              <option value="CREATE_USER">Creación Usuarios</option>
              <option value="UPDATE_PERMISSIONS">Cambio de Permisos</option>
            </select>
          </div>

          <button type="submit" className="btn btn-primary" style={{ height: '38px' }}>
            <Search size={16} /> Buscar
          </button>
        </form>
      </div>

      {/* Logs Table */}
      <div className="card" style={{ padding: 0 }}>
        <div className="table-container" style={{ border: 'none', boxShadow: 'none' }}>
          <table>
            <thead>
              <tr>
                <th style={{ width: '170px' }}>Fecha y Hora</th>
                <th style={{ width: '130px' }}>Usuario</th>
                <th style={{ width: '140px' }}>Acción</th>
                <th style={{ width: '130px' }}>Módulo</th>
                <th>Detalles de la Operación</th>
                <th style={{ width: '120px' }}>IP Origen</th>
              </tr>
            </thead>
            <tbody>
              {systemLogs.map(log => {
                const badgeClass = ACTION_COLORS[log.action] || 'badge-gray';
                return (
                  <tr key={log.id}>
                    <td style={{ fontSize: '0.8rem', color: 'var(--color-text-light)', whiteSpace: 'nowrap' }}>
                      <Calendar size={12} style={{ verticalAlign: 'middle', marginRight: '0.25rem' }} />
                      {log.timestamp}
                    </td>
                    <td style={{ fontWeight: '600' }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
                        <User size={13} style={{ color: 'var(--color-primary)' }} />
                        {log.username}
                      </span>
                    </td>
                    <td>
                      <span className={`badge ${badgeClass}`} style={{ fontSize: '0.7rem' }}>
                        {log.action}
                      </span>
                    </td>
                    <td style={{ textTransform: 'capitalize', color: 'var(--color-text-light)', fontSize: '0.85rem' }}>
                      {log.module}
                    </td>
                    <td style={{ fontSize: '0.875rem' }}>
                      {log.details}
                    </td>
                    <td style={{ fontSize: '0.75rem', color: 'var(--color-text-light)', fontFamily: 'monospace' }}>
                      {log.ip_address || '—'}
                    </td>
                  </tr>
                );
              })}
              {systemLogs.length === 0 && (
                <tr>
                  <td colSpan="6" style={{ textAlign: 'center', padding: '3rem', color: 'var(--color-text-light)' }}>
                    {loading ? 'Cargando eventos de la bitácora...' : 'No se encontraron registros con los filtros seleccionados.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default SystemLog;
