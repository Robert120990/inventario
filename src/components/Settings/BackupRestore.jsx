import React, { useState, useEffect } from 'react';
import { useInventory } from '../../context/InventoryContext';
import { 
  Database, Download, Upload, RefreshCw, ShieldAlert, CheckCircle2, 
  AlertTriangle, Server, HardDrive, FileJson, Clock, Layers, Users, 
  ArrowRightLeft, Package, ShieldCheck
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { formatDate } from '../../utils/formatUtils';

export const BackupRestore = () => {
  const { downloadBackup, restoreBackup, getDatabaseStats, isAdmin } = useInventory();
  
  const [stats, setStats] = useState(null);
  const [loadingStats, setLoadingStats] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [restoring, setRestoring] = useState(false);
  
  // Archivo seleccionado para restauración
  const [selectedFile, setSelectedFile] = useState(null);
  const [parsedBackup, setParsedBackup] = useState(null);
  const [parseError, setParseError] = useState(null);
  const [confirmModalOpen, setConfirmModalOpen] = useState(false);
  const [confirmText, setConfirmText] = useState('');

  const loadStats = async () => {
    setLoadingStats(true);
    try {
      const data = await getDatabaseStats();
      if (data) setStats(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingStats(false);
    }
  };

  useEffect(() => {
    loadStats();
  }, []);

  const handleDownloadBackup = async () => {
    if (!isAdmin) {
      toast.error('Solo los administradores pueden descargar copias de seguridad.');
      return;
    }
    setDownloading(true);
    const toastId = toast.loading('Generando copia de seguridad completa...');
    try {
      const result = await downloadBackup();
      toast.success(`Copia de seguridad descargada: ${result.filename}`, { id: toastId });
      loadStats();
    } catch (error) {
      toast.error(error.message || 'Error al generar la copia de seguridad', { id: toastId });
    } finally {
      setDownloading(false);
    }
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    setParseError(null);
    setParsedBackup(null);
    setSelectedFile(null);

    if (!file) return;

    if (!file.name.endsWith('.json')) {
      setParseError('Por favor selecciona un archivo con extensión .json válido.');
      return;
    }

    setSelectedFile(file);
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const json = JSON.parse(event.target.result);
        if (!json.data || typeof json.data !== 'object') {
          throw new Error('El archivo no contiene la estructura requerida de Inventario Pro.');
        }
        setParsedBackup(json);
      } catch (err) {
        setParseError(`Archivo JSON inválido o corrupto: ${err.message}`);
        setParsedBackup(null);
      }
    };
    reader.readAsText(file);
  };

  const handleExecuteRestore = async () => {
    if (confirmText.trim().toUpperCase() !== 'RESTAURAR') {
      toast.error('Debes escribir "RESTAURAR" exactamente para confirmar.');
      return;
    }

    if (!parsedBackup) {
      toast.error('No hay un archivo de respaldo válido cargado.');
      return;
    }

    setRestoring(true);
    const toastId = toast.loading('Restaurando base de datos... Esto puede tomar unos segundos.');

    try {
      const result = await restoreBackup(parsedBackup);
      toast.success(result.message || '¡Base de datos restaurada exitosamente!', { id: toastId, duration: 5000 });
      setConfirmModalOpen(false);
      setSelectedFile(null);
      setParsedBackup(null);
      setConfirmText('');
      loadStats();
    } catch (error) {
      toast.error(error.message || 'Error durante la restauración', { id: toastId, duration: 6000 });
    } finally {
      setRestoring(false);
    }
  };

  return (
    <div style={{ marginTop: '2rem' }}>
      {/* Sección Título */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
        <div>
          <h2 style={{ fontSize: '1.25rem', color: 'var(--color-primary)', display: 'flex', alignItems: 'center', gap: '0.5rem', margin: 0 }}>
            <Database size={22} /> Copia de Seguridad y Salud de Base de Datos
          </h2>
          <p style={{ fontSize: '0.85rem', color: 'var(--color-text-light)', margin: '0.25rem 0 0 0' }}>
            Genera respaldos completos en formato JSON estructurado y restaura el estado íntegro de la plataforma ante contingencias.
          </p>
        </div>
        <button 
          type="button" 
          onClick={loadStats} 
          disabled={loadingStats}
          className="btn btn-secondary"
          style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem' }}
          title="Actualizar métricas"
        >
          <RefreshCw size={14} className={loadingStats ? 'spin-animation' : ''} />
          <span>Actualizar Métricas</span>
        </button>
      </div>

      {/* Métricas de Base de Datos */}
      <div className="grid grid-cols-4" style={{ gap: '1rem', marginBottom: '1.5rem' }}>
        <div className="card" style={{ padding: '1rem', display: 'flex', alignItems: 'center', gap: '1rem', backgroundColor: 'var(--color-surface)' }}>
          <div style={{ padding: '0.75rem', borderRadius: 'var(--radius)', background: 'rgba(59, 130, 246, 0.12)', color: 'var(--color-primary)' }}>
            <Package size={24} />
          </div>
          <div>
            <span style={{ fontSize: '0.75rem', color: 'var(--color-text-light)', textTransform: 'uppercase', fontWeight: '600' }}>Productos</span>
            <div style={{ fontSize: '1.4rem', fontWeight: '700', color: 'var(--color-text)' }}>
              {stats?.tables?.products ?? '-'}
            </div>
          </div>
        </div>

        <div className="card" style={{ padding: '1rem', display: 'flex', alignItems: 'center', gap: '1rem', backgroundColor: 'var(--color-surface)' }}>
          <div style={{ padding: '0.75rem', borderRadius: 'var(--radius)', background: 'rgba(16, 185, 129, 0.12)', color: 'var(--color-success)' }}>
            <ArrowRightLeft size={24} />
          </div>
          <div>
            <span style={{ fontSize: '0.75rem', color: 'var(--color-text-light)', textTransform: 'uppercase', fontWeight: '600' }}>Movimientos</span>
            <div style={{ fontSize: '1.4rem', fontWeight: '700', color: 'var(--color-text)' }}>
              {stats?.tables?.movements ?? '-'}
            </div>
          </div>
        </div>

        <div className="card" style={{ padding: '1rem', display: 'flex', alignItems: 'center', gap: '1rem', backgroundColor: 'var(--color-surface)' }}>
          <div style={{ padding: '0.75rem', borderRadius: 'var(--radius)', background: 'rgba(245, 158, 11, 0.12)', color: 'var(--color-warning)' }}>
            <Layers size={24} />
          </div>
          <div>
            <span style={{ fontSize: '0.75rem', color: 'var(--color-text-light)', textTransform: 'uppercase', fontWeight: '600' }}>Partidas / Items</span>
            <div style={{ fontSize: '1.4rem', fontWeight: '700', color: 'var(--color-text)' }}>
              {stats?.tables?.movement_items ?? '-'}
            </div>
          </div>
        </div>

        <div className="card" style={{ padding: '1rem', display: 'flex', alignItems: 'center', gap: '1rem', backgroundColor: 'var(--color-surface)' }}>
          <div style={{ padding: '0.75rem', borderRadius: 'var(--radius)', background: 'rgba(139, 92, 246, 0.12)', color: '#8b5cf6' }}>
            <Users size={24} />
          </div>
          <div>
            <span style={{ fontSize: '0.75rem', color: 'var(--color-text-light)', textTransform: 'uppercase', fontWeight: '600' }}>Usuarios / Logs</span>
            <div style={{ fontSize: '1.4rem', fontWeight: '700', color: 'var(--color-text)' }}>
              {stats?.tables?.users ?? '-'} <span style={{ fontSize: '0.8rem', color: 'var(--color-text-light)', fontWeight: 'normal' }}>({stats?.tables?.system_logs ?? '-'} logs)</span>
            </div>
          </div>
        </div>
      </div>

      {/* Grid de Acciones: Backup & Restore */}
      <div className="grid grid-cols-2" style={{ gap: '1.5rem' }}>
        {/* Tarjeta de Generar Copia de Seguridad */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
              <div style={{ padding: '0.5rem', borderRadius: '8px', background: 'rgba(59, 130, 246, 0.1)', color: 'var(--color-primary)' }}>
                <Download size={20} />
              </div>
              <h3 style={{ fontSize: '1.1rem', margin: 0, color: 'var(--color-text)' }}>Generar Copia de Seguridad</h3>
            </div>
            <p style={{ fontSize: '0.85rem', color: 'var(--color-text-light)', lineHeight: 1.5, marginBottom: '1rem' }}>
              Exporta un archivo JSON completo que incluye todos los productos, existencias multi-unidad, movimientos, temperaturas, servicios, ajustes de auditoría, cortes congelados, usuarios y roles.
            </p>
            <div style={{ 
              backgroundColor: 'var(--color-bg)', 
              padding: '0.75rem', 
              borderRadius: 'var(--radius)', 
              border: '1px solid var(--color-border)',
              marginBottom: '1.5rem',
              fontSize: '0.8rem',
              color: 'var(--color-text-muted)'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.35rem' }}>
                <CheckCircle2 size={15} style={{ color: 'var(--color-success)' }} />
                <span>Formato JSON portable y atómico compatible con V1.0+</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <ShieldCheck size={15} style={{ color: 'var(--color-primary)' }} />
                <span>Incluye metadatos de validación y control de integridad</span>
              </div>
            </div>
          </div>

          <button 
            type="button"
            onClick={handleDownloadBackup}
            disabled={downloading}
            className="btn btn-primary"
            style={{ width: '100%', padding: '0.75rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', fontWeight: '600' }}
          >
            <Download size={18} />
            <span>{downloading ? 'Generando Respaldo...' : 'Descargar Copia de Seguridad (.json)'}</span>
          </button>
        </div>

        {/* Tarjeta de Restaurar Copia de Seguridad */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
              <div style={{ padding: '0.5rem', borderRadius: '8px', background: 'rgba(239, 68, 68, 0.1)', color: 'var(--color-danger)' }}>
                <Upload size={20} />
              </div>
              <h3 style={{ fontSize: '1.1rem', margin: 0, color: 'var(--color-text)' }}>Restaurar Base de Datos</h3>
            </div>
            <p style={{ fontSize: '0.85rem', color: 'var(--color-text-light)', lineHeight: 1.5, marginBottom: '1rem' }}>
              Restaura la base de datos a partir de un archivo de respaldo previo. Se ejecutará dentro de una transacción atómica segura.
            </p>

            <div style={{ marginBottom: '1rem' }}>
              <label 
                className="form-label" 
                style={{ fontSize: '0.8rem', fontWeight: '600', color: 'var(--color-text)' }}
              >
                Selecciona el archivo de respaldo (.json):
              </label>
              <input 
                type="file" 
                accept=".json"
                onChange={handleFileChange}
                className="form-input"
                style={{ padding: '0.45rem', fontSize: '0.85rem' }}
              />
            </div>

            {parseError && (
              <div style={{ padding: '0.65rem', borderRadius: '6px', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid var(--color-danger)', color: 'var(--color-danger)', fontSize: '0.8rem', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <AlertTriangle size={16} />
                <span>{parseError}</span>
              </div>
            )}

            {parsedBackup && (
              <div style={{ 
                backgroundColor: 'var(--color-bg)', 
                padding: '0.75rem', 
                borderRadius: 'var(--radius)', 
                border: '1px solid var(--color-border)',
                marginBottom: '1rem',
                fontSize: '0.8rem'
              }}>
                <div style={{ fontWeight: '600', color: 'var(--color-primary)', marginBottom: '0.35rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <FileJson size={15} /> Respaldo Válido Detectado
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.3rem', color: 'var(--color-text-light)', fontSize: '0.75rem' }}>
                  <div><strong>Fecha:</strong> {parsedBackup.meta?.exportDate ? formatDate(parsedBackup.meta.exportDate) : 'No especificada'}</div>
                  <div><strong>Exportado por:</strong> {parsedBackup.meta?.exportedBy || 'Admin'}</div>
                  <div><strong>Productos:</strong> {parsedBackup.meta?.tableCounts?.products ?? parsedBackup.data?.products?.length ?? 0}</div>
                  <div><strong>Movimientos:</strong> {parsedBackup.meta?.tableCounts?.movements ?? parsedBackup.data?.movements?.length ?? 0}</div>
                </div>
              </div>
            )}
          </div>

          <button 
            type="button"
            disabled={!parsedBackup || restoring}
            onClick={() => setConfirmModalOpen(true)}
            className="btn btn-danger"
            style={{ width: '100%', padding: '0.75rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', fontWeight: '600' }}
          >
            <Upload size={18} />
            <span>Restaurar desde Archivo Seleccionado</span>
          </button>
        </div>
      </div>

      {/* Modal de Confirmación de Seguridad para Restauración */}
      {confirmModalOpen && (
        <div className="modal-overlay" style={{ zIndex: 9999 }}>
          <div className="modal-content" style={{ maxWidth: '520px', padding: '1.75rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', color: 'var(--color-danger)', marginBottom: '1rem' }}>
              <div style={{ padding: '0.6rem', borderRadius: '50%', background: 'rgba(239, 68, 68, 0.15)' }}>
                <ShieldAlert size={28} />
              </div>
              <h3 style={{ margin: 0, fontSize: '1.25rem', color: 'var(--color-text)' }}>Confirmar Restauración de Base de Datos</h3>
            </div>

            <div style={{ 
              background: 'rgba(239, 68, 68, 0.08)', 
              border: '1px solid rgba(239, 68, 68, 0.3)', 
              borderRadius: 'var(--radius)', 
              padding: '1rem',
              marginBottom: '1.25rem',
              fontSize: '0.85rem',
              color: 'var(--color-text)',
              lineHeight: 1.5
            }}>
              <strong>⚠️ ADVERTENCIA CRÍTICA:</strong>
              <p style={{ margin: '0.5rem 0 0 0' }}>
                Esta acción <strong>sobrescribirá por completo</strong> las existencias, productos, movimientos y cortes actuales con los datos contenidos en el archivo de respaldo.
              </p>
            </div>

            <div style={{ marginBottom: '1.5rem' }}>
              <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '0.5rem', color: 'var(--color-text-light)' }}>
                Para confirmar esta acción irreversible, escribe la palabra <strong style={{ color: 'var(--color-danger)' }}>RESTAURAR</strong> en el siguiente campo:
              </label>
              <input 
                type="text" 
                className="form-input" 
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                placeholder="Escribe RESTAURAR"
                style={{ textAlign: 'center', fontWeight: 'bold', letterSpacing: '0.1em' }}
                autoFocus
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
              <button 
                type="button" 
                onClick={() => { setConfirmModalOpen(false); setConfirmText(''); }}
                className="btn btn-secondary"
                disabled={restoring}
              >
                Cancelar
              </button>
              <button 
                type="button" 
                onClick={handleExecuteRestore}
                disabled={confirmText.trim().toUpperCase() !== 'RESTAURAR' || restoring}
                className="btn btn-danger"
                style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
              >
                {restoring ? <RefreshCw size={16} className="spin-animation" /> : <Upload size={16} />}
                <span>{restoring ? 'Restaurando...' : 'Confirmar y Restaurar'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default BackupRestore;
