import fs from 'fs';
import path from 'path';
import xlsx from 'xlsx';
import pool from '../api/db.js';

const excelPath = 'C:\\Users\\rauls\\OneDrive\\Server Oficina Central\\Servidor Z\\ANDELSA\\AVICOLA CMI\\Cuarto frio San Martin\\CORTES COBRO SEGURO\\cortes de seguro.xlsx';
const backupPath = 'C:\\Users\\rauls\\OneDrive\\Server Oficina Central\\Servidor Z\\ANDELSA\\AVICOLA CMI\\Cuarto frio San Martin\\CORTES COBRO SEGURO\\cortes de seguro_backup_20260829.xlsx';

// 1. Create backup
if (fs.existsSync(excelPath)) {
  fs.copyFileSync(excelPath, backupPath);
  console.log('✅ Backup creado exitosamente en:', backupPath);
}

async function updateInsuranceExcel() {
  const [products] = await pool.query('SELECT * FROM products ORDER BY sku ASC');
  const [categories] = await pool.query('SELECT * FROM categories');
  const categoryUnits = {};
  categories.forEach(c => categoryUnits[c.name] = c.unit_type);

  const reportRows = products.map(product => {
    let units = Number(product.stockUnits || 0);
    let pounds = Number(product.stockPounds || 0);
    let baskets = Number(product.stockBaskets || 0);

    const configuredMetric = categoryUnits[product.category];
    const valuationMetric = configuredMetric === 'baskets' ? 'baskets' : 'pounds';
    const rate = Number(product.price || 0);
    const insuredValue = valuationMetric === 'baskets'
      ? baskets * rate
      : pounds * rate;
    const premium = insuredValue * 0.001;

    return {
      code: Number(product.sku) || product.sku,
      material: product.description,
      units,
      pounds,
      baskets,
      category: product.category,
      valuationMetric,
      poundRate: valuationMetric === 'pounds' ? rate : null,
      basketRate: valuationMetric === 'baskets' ? rate : null,
      insuredValue,
      premium
    };
  }).filter(row => {
    const rate = row.poundRate ?? row.basketRate;
    const valuationQty = row.valuationMetric === 'baskets' ? row.baskets : row.pounds;
    return rate > 0 && valuationQty > 0;
  }).sort((a, b) => String(a.code).localeCompare(String(b.code)));

  const wb = xlsx.readFile(excelPath);

  // Build sheet data
  const sheetData = [];
  // Row 1: Headers
  sheetData.push([
    'Codigo',
    'Material',
    'Unidades',
    'Total LB',
    'Total Cesta',
    'Valor por LB $',
    'Valor por Cestas $',
    'Total',
    0.001
  ]);

  // Rows 2 to N: Products
  reportRows.forEach((r, idx) => {
    const rowNum = idx + 2;
    sheetData.push([
      r.code,
      r.material,
      r.units,
      r.pounds,
      r.baskets,
      r.poundRate !== null ? r.poundRate : null,
      r.basketRate !== null ? r.basketRate : null,
      { f: r.poundRate !== null ? `D${rowNum}*F${rowNum}` : `E${rowNum}*G${rowNum}`, v: r.insuredValue },
      { f: `H${rowNum}*$I$1`, v: r.premium }
    ]);
  });

  const lastDataRow = reportRows.length + 1;

  // Totals row
  sheetData.push([
    null,
    'TOTALES',
    { f: `SUM(C2:C${lastDataRow})`, v: reportRows.reduce((a, r) => a + r.units, 0) },
    { f: `SUM(D2:D${lastDataRow})`, v: reportRows.reduce((a, r) => a + r.pounds, 0) },
    { f: `SUM(E2:E${lastDataRow})`, v: reportRows.reduce((a, r) => a + r.baskets, 0) },
    null,
    null,
    { f: `SUM(H2:H${lastDataRow})`, v: reportRows.reduce((a, r) => a + r.insuredValue, 0) },
    { f: `SUM(I2:I${lastDataRow})`, v: reportRows.reduce((a, r) => a + r.premium, 0) }
  ]);

  const newWs = xlsx.utils.aoa_to_sheet(sheetData);

  // Set column widths
  newWs['!cols'] = [
    { wch: 12 }, // Codigo
    { wch: 45 }, // Material
    { wch: 12 }, // Unidades
    { wch: 14 }, // Total LB
    { wch: 12 }, // Total Cesta
    { wch: 16 }, // Valor por LB $
    { wch: 18 }, // Valor por Cestas $
    { wch: 18 }, // Total
    { wch: 14 }  // 0.001
  ];

  // Replace 'Agosto 26' sheet in workbook
  wb.Sheets['Agosto 26'] = newWs;

  xlsx.writeFile(wb, excelPath);
  console.log('✅ Hoja Agosto 26 actualizada con éxito en cortes de seguro.xlsx!');
  console.log('📊 Resumen del Corte de Seguro al 29 de Agosto 2026:');
  console.log('   - Productos Valorados:', reportRows.length);
  console.log('   - Total Unidades:', reportRows.reduce((a, r) => a + r.units, 0).toLocaleString('en-US'));
  console.log('   - Total Libras:', reportRows.reduce((a, r) => a + r.pounds, 0).toLocaleString('en-US', { maximumFractionDigits: 2 }));
  console.log('   - Total Cestas:', reportRows.reduce((a, r) => a + r.baskets, 0).toLocaleString('en-US'));
  console.log('   - Valor Total Asegurado: $' + reportRows.reduce((a, r) => a + r.insuredValue, 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
  console.log('   - Cobro Seguro Total (0.10%): $' + reportRows.reduce((a, r) => a + r.premium, 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));

  process.exit(0);
}

updateInsuranceExcel().catch(e => {
  console.error('Error updating Excel:', e);
  process.exit(1);
});
