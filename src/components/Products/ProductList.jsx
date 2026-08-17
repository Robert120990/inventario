import React, { useMemo, useState } from 'react';
import { useInventory } from '../../context/InventoryContext';
import { Plus, Download, Search, SlidersHorizontal, X } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { exportToCsv } from '../../utils/exportCsv';
import ProductForm from './ProductForm';
import { formatPrice } from '../../utils/formatUtils';

const normalizeSearchText = (value) => String(value ?? '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, ' ')
  .trim();

const matchesSearchTerms = (product, searchTerm) => {
  const queryTerms = normalizeSearchText(searchTerm).split(/\s+/).filter(Boolean);
  if (queryTerms.length === 0) return true;

  const productTerms = normalizeSearchText(
    [product.sku, product.description, product.category].filter(Boolean).join(' ')
  ).split(/\s+/).filter(Boolean);

  return queryTerms.every((queryTerm) =>
    productTerms.some((productTerm) => productTerm.startsWith(queryTerm))
  );
};

const number = (value) => Number(value) || 0;

const ProductList = () => {
  const { products, deleteProduct, currentUser, categories, categoryUnits, canCreate, canEdit, canDelete } = useInventory();
  const [isAdding, setIsAdding] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [unitFilter, setUnitFilter] = useState('all');
  const [stockFilter, setStockFilter] = useState('all');
  const [minPrice, setMinPrice] = useState('');
  const [maxPrice, setMaxPrice] = useState('');
  const [sortBy, setSortBy] = useState('sku-asc');
  const allowCreate = canCreate('products');
  const allowEdit = canEdit('products');
  const allowDelete = canDelete('products');
  const showActions = allowEdit || allowDelete;

  const filteredProducts = useMemo(() => {
    const minimum = minPrice === '' ? null : Number(minPrice);
    const maximum = maxPrice === '' ? null : Number(maxPrice);

    return products.filter((product) => {
      const matchesText = matchesSearchTerms(product, searchTerm);
      const unitType = categoryUnits?.[product.category] || 'units';
      const totalStock = number(product.stockUnits) + number(product.stockPounds) + number(product.stockBaskets);
      const price = number(product.price);

      return matchesText
        && (categoryFilter === 'all' || product.category === categoryFilter)
        && (unitFilter === 'all' || unitType === unitFilter)
        && (stockFilter === 'all'
          || (stockFilter === 'available' && totalStock > 0)
          || (stockFilter === 'empty' && totalStock <= 0))
        && (minimum === null || price >= minimum)
        && (maximum === null || price <= maximum);
    }).sort((a, b) => {
      switch (sortBy) {
        case 'sku-desc':
          return String(b.sku ?? '').localeCompare(String(a.sku ?? ''), 'es', { numeric: true });
        case 'description-asc':
          return String(a.description ?? '').localeCompare(String(b.description ?? ''), 'es');
        case 'price-asc':
          return number(a.price) - number(b.price);
        case 'price-desc':
          return number(b.price) - number(a.price);
        case 'stock-desc':
          return (number(b.stockUnits) + number(b.stockPounds) + number(b.stockBaskets))
            - (number(a.stockUnits) + number(a.stockPounds) + number(a.stockBaskets));
        default:
          return String(a.sku ?? '').localeCompare(String(b.sku ?? ''), 'es', { numeric: true });
      }
    });
  }, [products, searchTerm, categoryFilter, unitFilter, stockFilter, minPrice, maxPrice, sortBy, categoryUnits]);

  const hasActiveFilters = Boolean(searchTerm || categoryFilter !== 'all' || unitFilter !== 'all'
    || stockFilter !== 'all' || minPrice !== '' || maxPrice !== '' || sortBy !== 'sku-asc');

  const clearFilters = () => {
    setSearchTerm('');
    setCategoryFilter('all');
    setUnitFilter('all');
    setStockFilter('all');
    setMinPrice('');
    setMaxPrice('');
    setSortBy('sku-asc');
  };

  const handleExport = () => {
    exportToCsv(filteredProducts, `productos_filtrados_${new Date().toISOString().split('T')[0]}.csv`);
    toast.success(`${filteredProducts.length} producto(s) exportado(s)`);
  };

  return (
    <div>
      <div className="topbar">
        <h1 className="page-title">Productos</h1>
        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
          <button className="btn btn-outline" onClick={handleExport} disabled={filteredProducts.length === 0}>
            <Download size={18} /> Exportar resultados
          </button>
          {allowCreate && (
            <button className="btn btn-primary" onClick={() => { setEditingProduct(null); setIsAdding(true); }}>
              <Plus size={18} /> Nuevo Producto
            </button>
          )}
        </div>
      </div>

      <div className="card" style={{ marginBottom: '1.5rem', padding: '1rem 1.25rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem', color: 'var(--color-primary)', fontWeight: 600 }}>
          <SlidersHorizontal size={18} /> Búsqueda avanzada
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.75rem', alignItems: 'end' }}>
          <div className="form-group" style={{ marginBottom: 0, gridColumn: 'span 2' }}>
            <label className="form-label" htmlFor="product-search">Código o descripción</label>
            <div style={{ position: 'relative' }}>
              <Search size={18} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-light)' }} />
              <input id="product-search" type="search" className="form-input" placeholder="Ej. Poll agridulc, 10125..." value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)} style={{ paddingLeft: '2.5rem', marginBottom: 0 }} />
            </div>
          </div>

          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label" htmlFor="category-filter">Categoría</label>
            <select id="category-filter" className="form-select" value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}>
              <option value="all">Todas</option>
              {categories?.map((category) => <option key={category} value={category}>{category}</option>)}
            </select>
          </div>

          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label" htmlFor="unit-filter">Unidad de control</label>
            <select id="unit-filter" className="form-select" value={unitFilter} onChange={(event) => setUnitFilter(event.target.value)}>
              <option value="all">Todas</option>
              <option value="units">Unidades</option>
              <option value="pounds">Libras</option>
              <option value="baskets">Cestas</option>
            </select>
          </div>

          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label" htmlFor="stock-filter">Disponibilidad</label>
            <select id="stock-filter" className="form-select" value={stockFilter} onChange={(event) => setStockFilter(event.target.value)}>
              <option value="all">Todo el inventario</option>
              <option value="available">Con existencias</option>
              <option value="empty">Sin existencias</option>
            </select>
          </div>

          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label" htmlFor="min-price">Precio mínimo ($)</label>
            <input id="min-price" type="number" min="0" step="0.001" className="form-input" value={minPrice}
              onChange={(event) => setMinPrice(event.target.value)} placeholder="0.000" />
          </div>

          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label" htmlFor="max-price">Precio máximo ($)</label>
            <input id="max-price" type="number" min="0" step="0.001" className="form-input" value={maxPrice}
              onChange={(event) => setMaxPrice(event.target.value)} placeholder="Sin límite" />
          </div>

          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label" htmlFor="sort-products">Ordenar por</label>
            <select id="sort-products" className="form-select" value={sortBy} onChange={(event) => setSortBy(event.target.value)}>
              <option value="sku-asc">Código: ascendente</option>
              <option value="sku-desc">Código: descendente</option>
              <option value="description-asc">Descripción: A-Z</option>
              <option value="price-asc">Precio: menor a mayor</option>
              <option value="price-desc">Precio: mayor a menor</option>
              <option value="stock-desc">Mayor existencia</option>
            </select>
          </div>

          <button className="btn btn-outline" type="button" onClick={clearFilters} disabled={!hasActiveFilters} style={{ justifySelf: 'start' }}>
            <X size={17} /> Limpiar filtros
          </button>
        </div>

        <div style={{ marginTop: '1rem', fontSize: '0.875rem', color: 'var(--color-text-light)' }} aria-live="polite">
          Mostrando <strong>{filteredProducts.length}</strong> de {products.length} productos
        </div>
      </div>

      <div className="card" style={{ padding: '0' }}>
        <div className="table-container" style={{ border: 'none', boxShadow: 'none' }}>
          <table>
            <thead>
              <tr>
                <th>Código (SKU)</th><th>Descripción</th><th>Categoría</th><th>Precio</th>
                <th>Stock (Unidades)</th><th>Stock (Libras)</th><th>Stock (Cestas)</th>
                {showActions && <th>Acciones</th>}
              </tr>
            </thead>
            <tbody>
              {filteredProducts.length === 0 ? (
                <tr>
                  <td colSpan={showActions ? 8 : 7} style={{ textAlign: 'center', padding: '2rem' }}>
                    {hasActiveFilters ? 'No se encontraron productos con los filtros seleccionados.' : 'No hay productos registrados.'}
                  </td>
                </tr>
              ) : filteredProducts.map((product) => (
                <tr key={product.id}>
                  <td style={{ fontWeight: '500' }}>{product.sku}</td>
                  <td>{product.description}</td><td>{product.category}</td>
                  <td>${formatPrice(product.price)}</td>
                  <td style={{ textAlign: 'center' }}>{product.stockUnits}</td>
                  <td>{product.stockPounds}</td><td>{product.stockBaskets}</td>
                  {showActions && (
                    <td>
                      <div style={{ display: 'flex', gap: '0.5rem' }}>
                        {allowEdit && (
                          <button onClick={() => { setEditingProduct(product); setIsAdding(true); }} className="btn btn-outline" style={{ padding: '0.25rem 0.5rem' }}>Editar</button>
                        )}
                        {allowDelete && (
                          <button onClick={() => {
                            if (window.confirm('¿Seguro que deseas eliminar este producto?')) {
                              deleteProduct(product.id);
                              toast.success('Producto eliminado');
                            }
                          }} className="btn btn-danger" style={{ padding: '0.25rem 0.5rem' }}>Eliminar</button>
                        )}
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {isAdding && (
        <div className="modal-overlay">
          <div className="modal-content">
            <ProductForm onCancel={() => { setIsAdding(false); setEditingProduct(null); }} initialData={editingProduct} />
          </div>
        </div>
      )}
    </div>
  );
};

export default ProductList;
