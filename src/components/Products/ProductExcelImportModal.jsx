import React, { useState } from 'react';
import * as XLSX from 'xlsx';
import { useInventory } from '../../context/InventoryContext';
import { FileSpreadsheet, Upload, X, CheckCircle2, AlertCircle, RefreshCw, ArrowRight, Search, PlusCircle, Check } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { formatPrice } from '../../utils/formatUtils';

const ProductExcelImportModal = ({ onClose }) => {
  const { products, bulkSyncProducts } = useInventory();
  const [file, setFile] = useState(null);
  const [sheets, setSheets] = useState([]);
  const [selectedSheet, setSelectedSheet] = useState('ALL');
  const [workbookData, setWorkbookData] = useState(null);
  const [parsedItems, setParsedItems] = useState([]);
  const [createIfNotExists, setCreateIfNotExists] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(false);
  const [processing, setProcessing] = useState(false);

  // Map of existing products by SKU for quick lookup
  const existingMap = new Map(products.map(p => [String(p.sku).trim(), p]));

  const handleFileUpload = (e) => {
    const uploadedFile = e.target.files[0];
    if (!uploadedFile) return;

    setFile(uploadedFile);
    setLoading(true);

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const data = new Uint8Array(evt.target.result);
        const wb = XLSX.read(data, { type: 'array' });
        setWorkbookData(wb);
        setSheets(wb.SheetNames);
        setSelectedSheet('ALL');
        parseWorkbook(wb, 'ALL');
      } catch (err) {
        console.error('Error reading Excel:', err);
        toast.error('Error al leer el archivo Excel. Verifica el formato.');
      } finally {
        setLoading(false);
      }
    };
    reader.readAsArrayBuffer(uploadedFile);
  };

  const parseWorkbook = (wb, sheetSelection) => {
    const itemsMap = new Map();
    const sheetsToProcess = sheetSelection === 'ALL' ? wb.SheetNames : [sheetSelection];

    sheetsToProcess.forEach(sheetName => {
      const sheet = wb.Sheets[sheetName];
      if (!sheet) return;

      const rawJson = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
      if (!rawJson || rawJson.length === 0) return;

      // Find header row or parse rows directly
      rawJson.forEach((row, rowIdx) => {
        if (!Array.isArray(row) || row.length < 2) return;

        const c1 = String(row[0] || '').trim();
        const c2 = String(row[1] || '').trim();

        // Check if row has SKU (numeric with 4-10 digits)
        if (/^\d{4,10}$/.test(c1)) {
          const sku = c1;
          const description = c2;
          if (description && !/^(TOTAL|SUBTOTAL|SUMA|CODIGO|MATERIAL)/i.test(description)) {
            // Find price in row (inspect columns 5, 6, 7, 8 or any column with numeric price)
            let price = 0;
            let category = 'Preparados';

            // Check if column 6 (Col 7 in 1-based) is "Valor por Cestas $"
            const valCol7 = cleanNumeric(row[6]);
            const valCol6 = cleanNumeric(row[5]);
            const valCol3 = cleanNumeric(row[2]);

            if (valCol7 > 0 && valCol7 < 5000) {
              price = valCol7;
              category = 'Preparados';
            } else if (valCol6 > 0 && valCol6 < 5000) {
              price = valCol6;
              category = /FRESCO|DON POLLO/i.test(description) ? 'Pollo Fresco' : (/MENUDO|MOLLEJA|HIGADO|PATA/i.test(description) ? 'Menudos' : 'Pollo Congelado');
            } else {
              // Standard format where price is in col 3 or last numeric column
              for (let i = row.length - 1; i >= 2; i--) {
                const num = cleanNumeric(row[i]);
                if (num > 0 && num < 1000) {
                  price = num;
                  break;
                }
              }
            }

            if (!itemsMap.has(sku) || price > 0) {
              itemsMap.set(sku, {
                sku,
                description: description || `Producto ${sku}`,
                price: Number(price.toFixed(3)),
                category,
                sheet: sheetName
              });
            }
          }
        }
      });
    });

    const items = Array.from(itemsMap.values());
    setParsedItems(items);
  };

  const cleanNumeric = (val) => {
    if (typeof val === 'number') return val;
    if (!val) return 0;
    const str = String(val).replace(/[$\s,]/g, '');
    const num = parseFloat(str);
    return isNaN(num) ? 0 : num;
  };

  const handleSheetChange = (e) => {
    const s = e.target.value;
    setSelectedSheet(s);
    if (workbookData) {
      parseWorkbook(workbookData, s);
    }
  };

  const handleApplySync = async () => {
    if (parsedItems.length === 0) {
      toast.error('No hay productos válidos para importar.');
      return;
    }

    setProcessing(true);
    try {
      const res = await bulkSyncProducts(parsedItems, createIfNotExists);
      if (res.success) {
        toast.success(
          `¡Éxito! Precios actualizados: ${res.updatedCount || 0}, Nuevos creados: ${res.createdCount || 0}`,
          { duration: 5000 }
        );
        onClose();
      } else {
        toast.error(res.message || 'Error al procesar la actualización');
      }
    } catch (e) {
      toast.error('Ocurrió un error al conectar con el servidor.');
    } finally {
      setProcessing(false);
    }
  };

  // Stats
  const toUpdateList = parsedItems.filter(item => existingMap.has(item.sku));
  const toCreateList = parsedItems.filter(item => !existingMap.has(item.sku));

  const filteredItems = parsedItems.filter(item => {
    if (!searchTerm) return true;
    const s = searchTerm.toLowerCase();
    return item.sku.toLowerCase().includes(s) || item.description.toLowerCase().includes(s);
  });

  return (
    <div className="modal-overlay">
      <div className="modal-content large" style={{ maxWidth: '850px', width: '95%', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
        {/* Header */}
        <div className="topbar" style={{ marginBottom: '1rem', borderBottom: '1px solid var(--color-border)', paddingBottom: '0.75rem', flexShrink: 0 }}>
          <div>
            <h2 style={{ fontSize: '1.25rem', color: 'var(--color-primary)', display: 'flex', alignItems: 'center', gap: '0.5rem', margin: 0 }}>
              <FileSpreadsheet size={22} /> Importar y Actualizar Precios desde Excel
            </h2>
            <p style={{ color: 'var(--color-text-light)', fontSize: '0.8rem', margin: '0.25rem 0 0 0' }}>
              Sube el archivo Excel oficial para actualizar automáticamente el catálogo de precios y registrar nuevos productos.
            </p>
          </div>
          <button type="button" className="btn btn-outline" onClick={onClose} style={{ padding: '0.25rem' }}>
            <X size={18} />
          </button>
        </div>

        {/* Upload Dropzone */}
        {!file && (
          <div style={{
            border: '2px dashed var(--color-border)',
            borderRadius: 'var(--radius)',
            padding: '3rem 2rem',
            textAlign: 'center',
            backgroundColor: 'var(--color-bg)',
            marginBottom: '1rem',
            cursor: 'pointer'
          }}>
            <input
              type="file"
              id="excel-file-input"
              accept=".xlsx, .xls, .csv"
              onChange={handleFileUpload}
              style={{ display: 'none' }}
            />
            <label htmlFor="excel-file-input" style={{ cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.75rem' }}>
              <div style={{ width: '56px', height: '56px', borderRadius: '50%', backgroundColor: 'rgba(59, 130, 246, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-primary)' }}>
                <Upload size={28} />
              </div>
              <div>
                <strong style={{ fontSize: '1.05rem', color: 'var(--color-text)' }}>Selecciona o arrastra el archivo Excel (.xlsx / .xls)</strong>
                <p style={{ fontSize: '0.85rem', color: 'var(--color-text-light)', marginTop: '0.25rem' }}>
                  Compatible con formatos de corte de seguro, listas de precios y catálogos de productos.
                </p>
              </div>
              <span className="btn btn-primary" style={{ marginTop: '0.5rem' }}>
                Examinar Archivo
              </span>
            </label>
          </div>
        )}

        {/* File Analysis & Preview */}
        {file && (
          <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, gap: '1rem' }}>
            {/* File info bar */}
            <div className="card" style={{ padding: '0.75rem 1rem', display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <FileSpreadsheet size={20} style={{ color: 'var(--color-primary)' }} />
                <div>
                  <div style={{ fontWeight: '600', fontSize: '0.9rem' }}>{file.name}</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--color-text-light)' }}>
                    {(file.size / 1024).toFixed(1)} KB · {sheets.length} hoja(s)
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                {sheets.length > 1 && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                    <label style={{ fontSize: '0.75rem', color: 'var(--color-text-light)' }}>Hoja:</label>
                    <select className="form-select" value={selectedSheet} onChange={handleSheetChange} style={{ padding: '0.3rem 0.5rem', fontSize: '0.8rem', width: 'auto' }}>
                      <option value="ALL">Todas las Hojas ({sheets.length})</option>
                      {sheets.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                )}
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={() => { setFile(null); setParsedItems([]); }}
                  style={{ fontSize: '0.75rem', padding: '0.3rem 0.6rem' }}
                >
                  Cambiar archivo
                </button>
              </div>
            </div>

            {/* Summary Metrics */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '0.75rem' }}>
              <div className="card" style={{ padding: '0.75rem 1rem', textAlign: 'center', borderLeft: '3px solid var(--color-primary)' }}>
                <div style={{ fontSize: '1.25rem', fontWeight: '700', color: 'var(--color-primary)' }}>{parsedItems.length}</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--color-text-light)' }}>Productos en Archivo</div>
              </div>

              <div className="card" style={{ padding: '0.75rem 1rem', textAlign: 'center', borderLeft: '3px solid var(--color-warning)' }}>
                <div style={{ fontSize: '1.25rem', fontWeight: '700', color: 'var(--color-warning)' }}>{toUpdateList.length}</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--color-text-light)' }}>Actualizarán Precio</div>
              </div>

              <div className="card" style={{ padding: '0.75rem 1rem', textAlign: 'center', borderLeft: '3px solid var(--color-success)' }}>
                <div style={{ fontSize: '1.25rem', fontWeight: '700', color: 'var(--color-success)' }}>{toCreateList.length}</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--color-text-light)' }}>Nuevos a Crear</div>
              </div>
            </div>

            {/* Options & Search Bar */}
            <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.85rem' }}>
                <input
                  type="checkbox"
                  checked={createIfNotExists}
                  onChange={(e) => setCreateIfNotExists(e.target.checked)}
                  style={{ width: '16px', height: '16px', accentColor: 'var(--color-primary)' }}
                />
                <span>Crear automáticamente productos nuevos no registrados (Stock = 0)</span>
              </label>

              <div style={{ position: 'relative', width: '240px' }}>
                <Search size={14} style={{ position: 'absolute', left: '8px', top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-light)' }} />
                <input
                  type="text"
                  className="form-input"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Filtrar vista..."
                  style={{ paddingLeft: '1.75rem', padding: '0.35rem 0.6rem 0.35rem 1.75rem', fontSize: '0.8rem' }}
                />
              </div>
            </div>

            {/* Preview Table */}
            <div className="table-container" style={{ flex: 1, maxHeight: '280px', overflowY: 'auto' }}>
              <table>
                <thead>
                  <tr>
                    <th style={{ width: '110px' }}>Código (SKU)</th>
                    <th>Descripción</th>
                    <th style={{ width: '120px', textAlign: 'right' }}>Precio Catálogo</th>
                    <th style={{ width: '120px', textAlign: 'right' }}>Precio Excel</th>
                    <th style={{ width: '110px', textAlign: 'center' }}>Acción</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredItems.map(item => {
                    const existing = existingMap.get(item.sku);
                    const oldPrice = existing ? Number(existing.price) : null;
                    const hasDiff = oldPrice !== null && oldPrice !== item.price && item.price > 0;

                    return (
                      <tr key={item.sku}>
                        <td style={{ fontWeight: '600', fontFamily: 'monospace' }}>{item.sku}</td>
                        <td style={{ fontSize: '0.85rem' }}>{item.description}</td>
                        <td style={{ textAlign: 'right', fontSize: '0.85rem', color: 'var(--color-text-light)' }}>
                          {existing ? `$${formatPrice(existing.price)}` : '—'}
                        </td>
                        <td style={{ textAlign: 'right', fontWeight: '600', color: hasDiff ? 'var(--color-warning)' : 'var(--color-text)' }}>
                          ${formatPrice(item.price)}
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          {existing ? (
                            hasDiff ? (
                              <span className="badge badge-warning" style={{ fontSize: '0.65rem' }}>Actualizar</span>
                            ) : (
                              <span className="badge badge-gray" style={{ fontSize: '0.65rem' }}>Sin cambio</span>
                            )
                          ) : (
                            <span className="badge badge-success" style={{ fontSize: '0.65rem' }}>Nuevo</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                  {filteredItems.length === 0 && (
                    <tr>
                      <td colSpan="5" style={{ textAlign: 'center', padding: '2rem', color: 'var(--color-text-light)' }}>
                        No se encontraron productos con ese filtro.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', borderTop: '1px solid var(--color-border)', paddingTop: '0.75rem', flexShrink: 0 }}>
              <button type="button" className="btn btn-outline" onClick={onClose} disabled={processing}>
                Cancelar
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleApplySync}
                disabled={processing || parsedItems.length === 0}
              >
                {processing ? (
                  <>
                    <RefreshCw size={16} className="spin" /> Aplicando Cambios...
                  </>
                ) : (
                  <>
                    <Check size={16} /> Aplicar Actualización de Precios ({parsedItems.length})
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ProductExcelImportModal;
