import React, { useState, useMemo } from 'react';
import { useInventory } from '../context/InventoryContext';
import {
  Package, ArrowRightLeft, TrendingUp, TrendingDown,
  ArrowDownLeft, ArrowUpRight, Search, Activity,
  Layers, CheckCircle2, Zap, Calendar, RefreshCw
} from 'lucide-react';
import { formatDate } from '../utils/formatUtils';

const Dashboard = ({ onNavigate }) => {
  const { totalStock, products, movements, refreshData } = useInventory();
  const [filterType, setFilterType] = useState('all'); // 'all', 'in', 'out'
  const [searchQuery, setSearchQuery] = useState('');
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Current local date
  const now = new Date();
  const today = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0')
  ].join('-');

  const todaysMovements = useMemo(() => {
    return movements.filter(m => m.date === today);
  }, [movements, today]);

  // Flatten items for display
  const todaysItems = useMemo(() => {
    return todaysMovements.flatMap(mov =>
      (mov.items || []).map(item => ({
        ...item,
        id: `${mov.id}-${item.productId}`,
        movementId: mov.id,
        date: mov.date,
        time: mov.timeStart,
        type: mov.type,
        ref: `${mov.refType || 'Ref'} #${mov.refNumber || mov.id}`,
        user: mov.auditUser || 'Sistema',
        notes: mov.notes || ''
      }))
    );
  }, [todaysMovements]);

  // Calculations for Today's Activity Flow
  const todayInUnits = useMemo(() => {
    return todaysItems
      .filter(i => i.type === 'in')
      .reduce((sum, i) => sum + (Number(i.qtyUnits) || 0), 0);
  }, [todaysItems]);

  const todayOutUnits = useMemo(() => {
    return todaysItems
      .filter(i => i.type === 'out')
      .reduce((sum, i) => sum + (Number(i.qtyUnits) || 0), 0);
  }, [todaysItems]);

  const netTodayUnits = todayInUnits - todayOutUnits;

  // Filtered items for the table
  const filteredItems = useMemo(() => {
    return todaysItems.filter(item => {
      const matchesType = filterType === 'all' || item.type === filterType;
      const product = products.find(p => p.id === item.productId);
      const prodText = product ? `${product.sku} ${product.description}`.toLowerCase() : '';
      const matchesSearch = searchQuery === '' ||
        prodText.includes(searchQuery.toLowerCase()) ||
        item.ref.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.user.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesType && matchesSearch;
    });
  }, [todaysItems, filterType, searchQuery, products]);

  const getProductName = (id) => {
    const product = products.find(p => p.id === id);
    return product ? `${product.sku} - ${product.description}` : 'Referencia desconocida';
  };

  const getProductCategory = (id) => {
    const product = products.find(p => p.id === id);
    return product?.category || 'General';
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await refreshData();
    } finally {
      setTimeout(() => setIsRefreshing(false), 500);
    }
  };

  // Dial Progress percentage calculation (ratio of active references / capacity estimation)
  const activeProductsCount = products.filter(p => (p.currentStock || 0) > 0).length;
  const stockHealthPercent = products.length > 0
    ? Math.min(100, Math.round((activeProductsCount / products.length) * 100))
    : 100;

  return (
    <div style={{ maxWidth: '1400px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      
      {/* Stitch Editorial Header Section */}
      <section style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', justifyContent: 'space-between', gap: '1.5rem' }}>
          <div style={{ maxWidth: '720px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.75rem' }}>
              <span className="badge badge-primary" style={{ fontWeight: '700', padding: '0.35rem 0.85rem' }}>
                <span className="status-dot" style={{ backgroundColor: 'var(--color-primary-glow)', boxShadow: '0 0 8px var(--color-primary-glow)' }}></span>
                SISTEMA OPERATIVO
              </span>
              <span style={{ fontSize: '0.8rem', color: 'var(--color-text-light)', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                <Calendar size={14} /> {formatDate(today)}
              </span>
            </div>
            <h1 className="font-headline" style={{ fontSize: '2.5rem', fontWeight: '700', letterSpacing: '-0.04em', lineHeight: '1.1', color: 'var(--color-text)' }}>
              Centro de Control
            </h1>
            <p style={{ color: 'var(--color-text-light)', fontSize: '1.05rem', marginTop: '0.5rem', fontWeight: '400', lineHeight: '1.5' }}>
              Gestión inteligente de existencias y flujo logístico en tiempo real.
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
            <button
              onClick={handleRefresh}
              className="btn btn-outline"
              disabled={isRefreshing}
              style={{ padding: '0.65rem 1rem', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}
              title="Sincronizar datos"
            >
              <RefreshCw size={16} className={isRefreshing ? 'spin-icon' : ''} style={{ transition: 'transform 0.5s' }} />
              <span>{isRefreshing ? 'Actualizando...' : 'Sincronizar'}</span>
            </button>
            {onNavigate && (
              <button
                onClick={() => onNavigate('movements')}
                className="btn btn-primary"
                style={{ padding: '0.65rem 1.25rem', fontSize: '0.875rem', fontWeight: '600' }}
              >
                <ArrowRightLeft size={16} />
                <span>Nuevo Movimiento</span>
              </button>
            )}
          </div>
        </div>
      </section>

      {/* Asymmetric Bento Grid (Stitch Luminous Dial & Activity Flow) */}
      <div className="bento-grid">
        
        {/* Featured Dial Card (Col 8) */}
        <div className="col-span-8 card" style={{ padding: '2rem', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', position: 'relative', overflow: 'hidden', minHeight: '340px' }}>
          {/* Ambient Radial Blur Glow */}
          <div className="luminous-glow" style={{ top: '-10%', right: '-5%', width: '320px', height: '320px' }}></div>
          
          <div style={{ position: 'relative', zIndex: 2, display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '2rem' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxWidth: '360px' }}>
              <span className="font-label" style={{ fontSize: '0.75rem', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--color-primary)' }}>
                Balance de Existencias
              </span>
              <h2 className="font-headline" style={{ fontSize: '1.75rem', fontWeight: '700', lineHeight: '1.2' }}>
                Disponibilidad Global
              </h2>
              <p style={{ fontSize: '0.9rem', color: 'var(--color-text-light)', lineHeight: '1.5' }}>
                Monitoreo activo sobre <strong style={{ color: 'var(--color-text)' }}>{products.length} referencias</strong> registradas en el catálogo.
              </p>
              
              <div style={{ marginTop: '1rem', display: 'flex', gap: '1.5rem' }}>
                <div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Con Stock</div>
                  <div className="font-headline" style={{ fontSize: '1.35rem', fontWeight: '700', color: 'var(--color-primary)' }}>
                    {activeProductsCount} <span style={{ fontSize: '0.8rem', fontWeight: '500', color: 'var(--color-text-light)' }}>SKUs</span>
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Sin Stock</div>
                  <div className="font-headline" style={{ fontSize: '1.35rem', fontWeight: '700', color: products.length - activeProductsCount > 0 ? 'var(--color-warning)' : 'var(--color-text-light)' }}>
                    {products.length - activeProductsCount} <span style={{ fontSize: '0.8rem', fontWeight: '500', color: 'var(--color-text-light)' }}>SKUs</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Luminous Engine Circular Dial Widget */}
            <div className="luminous-dial-container" style={{ width: '220px', height: '220px' }}>
              <svg style={{ width: '100%', height: '100%', transform: 'rotate(-90deg)' }} viewBox="0 0 100 100">
                {/* Background Ring */}
                <circle
                  cx="50"
                  cy="50"
                  r="40"
                  fill="transparent"
                  stroke="var(--color-card-muted)"
                  strokeWidth="8"
                />
                {/* Energy Ring: Stock Units */}
                <circle
                  cx="50"
                  cy="50"
                  r="40"
                  fill="transparent"
                  stroke="var(--color-primary)"
                  strokeWidth="8"
                  strokeDasharray="251.2"
                  strokeDashoffset={251.2 - (251.2 * stockHealthPercent) / 100}
                  strokeLinecap="round"
                  style={{ transition: 'stroke-dashoffset 1s ease' }}
                />
              </svg>
              
              {/* Dial Center Info */}
              <div style={{ position: 'absolute', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <span className="font-headline" style={{ fontSize: '2.1rem', fontWeight: '800', lineHeight: '1', color: 'var(--color-text)' }}>
                  {totalStock >= 10000 ? `${(totalStock / 1000).toFixed(1)}k` : totalStock.toLocaleString()}
                </span>
                <span style={{ fontSize: '0.7rem', fontWeight: '700', color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginTop: '0.2rem' }}>
                  Unid. Totales
                </span>
                <div style={{ marginTop: '0.35rem', display: 'inline-flex', alignItems: 'center', gap: '0.2rem', padding: '0.15rem 0.5rem', borderRadius: '999px', background: 'var(--color-surface)', fontSize: '0.7rem', fontWeight: '700', color: 'var(--color-primary)' }}>
                  <Zap size={11} /> {stockHealthPercent}% Salud
                </div>
              </div>
            </div>
          </div>

          {/* Bottom Metas */}
          <div style={{ position: 'relative', zIndex: 2, marginTop: '1.75rem', paddingTop: '1.25rem', borderTop: '1px solid var(--color-border-subtle)', display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: 'var(--color-primary)' }}></div>
                <span style={{ fontSize: '0.8rem', color: 'var(--color-text-light)' }}>Entradas Hoy: <strong style={{ color: 'var(--color-text)' }}>+{todayInUnits.toLocaleString()}</strong></span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: 'var(--color-secondary)' }}></div>
                <span style={{ fontSize: '0.8rem', color: 'var(--color-text-light)' }}>Salidas Hoy: <strong style={{ color: 'var(--color-text)' }}>-{todayOutUnits.toLocaleString()}</strong></span>
              </div>
            </div>
            <div className="font-headline" style={{ fontSize: '0.9rem', fontWeight: '700', color: netTodayUnits >= 0 ? 'var(--color-success)' : 'var(--color-danger)', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
              {netTodayUnits >= 0 ? <TrendingUp size={16} /> : <TrendingDown size={16} />}
              <span>Delta Diario: {netTodayUnits >= 0 ? `+${netTodayUnits}` : netTodayUnits} unid.</span>
            </div>
          </div>
        </div>

        {/* Side Flow Card: Quick Actions & Live Stream (Col 4) */}
        <div className="col-span-4 card" style={{ padding: '2rem', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
              <span className="font-label" style={{ fontSize: '0.75rem', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--color-secondary)' }}>
                Flujo Operativo
              </span>
              <span className="badge badge-primary" style={{ fontSize: '0.7rem', padding: '0.2rem 0.5rem' }}>
                {todaysMovements.length} Mov. Hoy
              </span>
            </div>
            
            <h3 className="font-headline" style={{ fontSize: '1.4rem', fontWeight: '700', marginBottom: '0.5rem', color: 'var(--color-text)' }}>
              Acciones de Control
            </h3>
            <p style={{ fontSize: '0.85rem', color: 'var(--color-text-light)', marginBottom: '1.5rem', lineHeight: '1.4' }}>
              Acceso rápido a las operaciones logísticas y consultas del almacén.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {onNavigate && (
                <>
                  <button
                    onClick={() => onNavigate('products')}
                    className="btn btn-outline"
                    style={{ justifyContent: 'space-between', width: '100%', padding: '0.75rem 1rem', borderRadius: 'var(--radius)' }}
                  >
                    <span style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', fontWeight: '600' }}>
                      <Package size={17} style={{ color: 'var(--color-primary)' }} />
                      <span>Catálogo de Productos</span>
                    </span>
                    <span className="badge badge-gray">{products.length}</span>
                  </button>

                  <button
                    onClick={() => onNavigate('movements')}
                    className="btn btn-outline"
                    style={{ justifyContent: 'space-between', width: '100%', padding: '0.75rem 1rem', borderRadius: 'var(--radius)' }}
                  >
                    <span style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', fontWeight: '600' }}>
                      <ArrowRightLeft size={17} style={{ color: 'var(--color-secondary)' }} />
                      <span>Historial de Movimientos</span>
                    </span>
                    <span className="badge badge-gray">{movements.length}</span>
                  </button>

                  <button
                    onClick={() => onNavigate('inventory-count')}
                    className="btn btn-outline"
                    style={{ justifyContent: 'space-between', width: '100%', padding: '0.75rem 1rem', borderRadius: 'var(--radius)' }}
                  >
                    <span style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', fontWeight: '600' }}>
                      <CheckCircle2 size={17} style={{ color: 'var(--color-success)' }} />
                      <span>Toma de Inventario Físico</span>
                    </span>
                    <span className="badge badge-primary" style={{ fontSize: '0.7rem' }}>Auditoría</span>
                  </button>
                </>
              )}
            </div>
          </div>

          <div style={{ marginTop: '1.5rem', padding: '1rem', borderRadius: 'var(--radius)', background: 'var(--color-card)', border: '1px solid var(--color-border-subtle)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.75rem', fontWeight: '600', color: 'var(--color-text-muted)', marginBottom: '0.25rem' }}>
              <Activity size={14} style={{ color: 'var(--color-primary)' }} /> RESUMEN DE ACTIVIDAD
            </div>
            <div style={{ fontSize: '0.85rem', color: 'var(--color-text)' }}>
              {todaysMovements.length > 0
                ? `${todaysMovements.length} documentos procesados con un total de ${todaysItems.length} líneas de producto.`
                : 'No se registran movimientos el día de hoy hasta el momento.'}
            </div>
          </div>
        </div>

      </div>

      {/* 3 Metric Summary Cards */}
      <div className="grid grid-cols-3">
        <div className="card stat-card" style={{ padding: '1.25rem 1.5rem' }}>
          <div className="stat-icon" style={{ backgroundColor: 'rgba(0, 109, 50, 0.1)', color: 'var(--color-primary)' }}>
            <Package size={24} />
          </div>
          <div className="stat-content">
            <h3>Total Referencias (SKU)</h3>
            <p className="font-headline">{products.length}</p>
          </div>
        </div>

        <div className="card stat-card" style={{ padding: '1.25rem 1.5rem' }}>
          <div className="stat-icon" style={{ backgroundColor: 'rgba(0, 89, 187, 0.1)', color: 'var(--color-secondary)' }}>
            <TrendingUp size={24} />
          </div>
          <div className="stat-content">
            <h3>Stock Físico Global</h3>
            <p className="font-headline">{totalStock.toLocaleString()}</p>
          </div>
        </div>

        <div className="card stat-card" style={{ padding: '1.25rem 1.5rem' }}>
          <div className="stat-icon" style={{ backgroundColor: 'rgba(180, 83, 9, 0.1)', color: 'var(--color-warning)' }}>
            <ArrowRightLeft size={24} />
          </div>
          <div className="stat-content">
            <h3>Movimientos Totales</h3>
            <p className="font-headline">{movements.length}</p>
          </div>
        </div>
      </div>

      {/* Today's Activity Table with Stitch Flow Architecture */}
      <div className="card" style={{ padding: '0', overflow: 'hidden' }}>
        {/* Table Header Controls */}
        <div style={{ padding: '1.5rem 1.75rem', borderBottom: '1px solid var(--color-border)', display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', background: 'var(--color-surface)' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <h2 className="font-headline" style={{ fontSize: '1.35rem', fontWeight: '700', color: 'var(--color-text)' }}>
                Actividad de Hoy
              </h2>
              <span className="badge badge-primary">{todaysItems.length} registros</span>
            </div>
            <p style={{ fontSize: '0.8rem', color: 'var(--color-text-light)', marginTop: '0.2rem' }}>
              Detalle en tiempo real de entradas y salidas para el día {formatDate(today)}
            </p>
          </div>

          {/* Filters & Search */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
            {/* Filter Pills */}
            <div style={{ display: 'flex', background: 'var(--color-card)', padding: '0.25rem', borderRadius: 'var(--radius)', border: '1px solid var(--color-border)' }}>
              <button
                type="button"
                onClick={() => setFilterType('all')}
                style={{
                  padding: '0.35rem 0.75rem',
                  fontSize: '0.75rem',
                  fontWeight: '600',
                  border: 'none',
                  borderRadius: 'calc(var(--radius) - 4px)',
                  background: filterType === 'all' ? 'var(--color-primary)' : 'transparent',
                  color: filterType === 'all' ? '#ffffff' : 'var(--color-text-light)',
                  cursor: 'pointer',
                  transition: 'var(--transition)'
                }}
              >
                Todos ({todaysItems.length})
              </button>
              <button
                type="button"
                onClick={() => setFilterType('in')}
                style={{
                  padding: '0.35rem 0.75rem',
                  fontSize: '0.75rem',
                  fontWeight: '600',
                  border: 'none',
                  borderRadius: 'calc(var(--radius) - 4px)',
                  background: filterType === 'in' ? 'var(--color-success)' : 'transparent',
                  color: filterType === 'in' ? '#ffffff' : 'var(--color-text-light)',
                  cursor: 'pointer',
                  transition: 'var(--transition)'
                }}
              >
                Entradas ({todaysItems.filter(i => i.type === 'in').length})
              </button>
              <button
                type="button"
                onClick={() => setFilterType('out')}
                style={{
                  padding: '0.35rem 0.75rem',
                  fontSize: '0.75rem',
                  fontWeight: '600',
                  border: 'none',
                  borderRadius: 'calc(var(--radius) - 4px)',
                  background: filterType === 'out' ? 'var(--color-danger)' : 'transparent',
                  color: filterType === 'out' ? '#ffffff' : 'var(--color-text-light)',
                  cursor: 'pointer',
                  transition: 'var(--transition)'
                }}
              >
                Salidas ({todaysItems.filter(i => i.type === 'out').length})
              </button>
            </div>

            {/* Quick Search Input */}
            <div style={{ position: 'relative', width: '220px' }}>
              <Search size={15} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)' }} />
              <input
                type="text"
                placeholder="Buscar en el día..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{
                  width: '100%',
                  padding: '0.45rem 0.75rem 0.45rem 2.2rem',
                  fontSize: '0.8rem',
                  borderRadius: 'var(--radius)',
                  border: '1px solid var(--color-border)',
                  background: 'var(--color-card)',
                  color: 'var(--color-text)'
                }}
              />
            </div>
          </div>
        </div>

        {/* Table View */}
        <div className="table-container" style={{ border: 'none', borderRadius: '0', boxShadow: 'none' }}>
          <table>
            <thead>
              <tr>
                <th>Hora</th>
                <th>Referencia</th>
                <th>Producto / SKU</th>
                <th>Tipo</th>
                <th style={{ textAlign: 'right' }}>Unidades</th>
                <th style={{ textAlign: 'right' }}>Libras</th>
                <th style={{ textAlign: 'right' }}>Cestas</th>
                <th>Responsable</th>
              </tr>
            </thead>
            <tbody>
              {filteredItems.length === 0 ? (
                <tr>
                  <td colSpan="8" style={{ textAlign: 'center', padding: '3.5rem 1rem', color: 'var(--color-text-light)' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.75rem' }}>
                      <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: 'var(--color-surface)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-text-muted)' }}>
                        <Activity size={24} />
                      </div>
                      <span className="font-headline" style={{ fontSize: '1.1rem', fontWeight: '600', color: 'var(--color-text)' }}>
                        {todaysItems.length === 0 ? 'Sin movimientos registrados hoy' : 'No hay registros que coincidan con la búsqueda'}
                      </span>
                      <span style={{ fontSize: '0.85rem' }}>
                        {todaysItems.length === 0 ? 'Las operaciones registradas hoy se visualizarán en este panel en tiempo real.' : 'Intenta cambiando los filtros o el término de búsqueda.'}
                      </span>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredItems.map(item => (
                  <tr key={item.id}>
                    <td style={{ color: 'var(--color-text-muted)', fontSize: '0.8rem', fontFamily: 'monospace' }}>
                      {item.time || '--:--'}
                    </td>
                    <td style={{ fontWeight: '600', color: 'var(--color-text)' }}>
                      {item.ref}
                    </td>
                    <td>
                      <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <span style={{ fontWeight: '600', color: 'var(--color-text)' }}>
                          {getProductName(item.productId)}
                        </span>
                        <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
                          {getProductCategory(item.productId)}
                        </span>
                      </div>
                    </td>
                    <td>
                      <span className={`badge ${item.type === 'in' ? 'badge-success' : 'badge-danger'}`}>
                        {item.type === 'in' ? <ArrowDownLeft size={13} /> : <ArrowUpRight size={13} />}
                        {item.type === 'in' ? 'Entrada' : 'Salida'}
                      </span>
                    </td>
                    <td style={{ textAlign: 'right', fontWeight: '700', fontFamily: 'var(--font-headline)', fontSize: '1rem', color: item.type === 'in' ? 'var(--color-success)' : 'var(--color-danger)' }}>
                      {item.type === 'in' ? `+${item.qtyUnits}` : `-${item.qtyUnits}`}
                    </td>
                    <td style={{ textAlign: 'right', color: 'var(--color-text-light)' }}>
                      {item.qtyPounds ? Number(item.qtyPounds).toLocaleString() : '-'}
                    </td>
                    <td style={{ textAlign: 'right', color: 'var(--color-text-light)' }}>
                      {item.qtyBaskets ? Number(item.qtyBaskets).toLocaleString() : '-'}
                    </td>
                    <td>
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', padding: '0.2rem 0.5rem', background: 'var(--color-surface)', borderRadius: '999px', fontSize: '0.75rem', fontWeight: '500' }}>
                        <span style={{ width: '18px', height: '18px', borderRadius: '50%', background: 'var(--color-primary)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.65rem', fontWeight: '700' }}>
                          {(item.user || 'U').charAt(0).toUpperCase()}
                        </span>
                        <span>{item.user}</span>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
};

export default Dashboard;
