import xlsx from 'xlsx';
import pool from '../api/db.js';

const excelPath = 'C:\\Users\\rauls\\OneDrive\\Server Oficina Central\\Servidor Z\\ANDELSA\\AVICOLA CMI\\Cuarto frio San Martin\\CORTES COBRO SEGURO\\cortes de seguro.xlsx';
const wb = xlsx.readFile(excelPath);

async function checkPriceDiscrepancies() {
  const [products] = await pool.query('SELECT * FROM products ORDER BY sku ASC');
  const dbPriceMap = {};
  products.forEach(p => {
    dbPriceMap[String(p.sku)] = {
      description: p.description,
      price: Number(p.price || 0),
      category: p.category
    };
  });

  const sheetPrices = {};

  wb.SheetNames.forEach(sheetName => {
    const ws = wb.Sheets[sheetName];
    const data = xlsx.utils.sheet_to_json(ws, { header: 1 });
    if (!data || data.length < 2) return;

    data.forEach(row => {
      if (!row || !row[0] || isNaN(row[0])) return;
      const code = String(row[0]);
      const desc = row[1];
      const priceLbRaw = row[5];
      const priceCstRaw = row[6];

      let priceVal = null;
      let priceType = null;

      if (priceLbRaw !== null && priceLbRaw !== undefined && priceLbRaw !== '') {
        const clean = parseFloat(String(priceLbRaw).replace(/[$,\s]/g, ''));
        if (!isNaN(clean) && clean > 0) {
          priceVal = clean;
          priceType = 'lb';
        }
      }
      if (priceCstRaw !== null && priceCstRaw !== undefined && priceCstRaw !== '') {
        const clean = parseFloat(String(priceCstRaw).replace(/[$,\s]/g, ''));
        if (!isNaN(clean) && clean > 0) {
          priceVal = clean;
          priceType = 'cst';
        }
      }

      if (priceVal !== null) {
        if (!sheetPrices[code]) {
          sheetPrices[code] = [];
        }
        sheetPrices[code].push({
          sheet: sheetName,
          desc: desc,
          price: priceVal,
          type: priceType
        });
      }
    });
  });

  console.log('=== COMPARISON OF ALL PRODUCT PRICES (EXCEL vs DB) ===');
  const discrepancies = [];

  for (const [code, history] of Object.entries(sheetPrices)) {
    const dbItem = dbPriceMap[code];
    const latestSheet = history[history.length - 1];

    if (!dbItem) {
      console.log(`[Code ${code}] in Excel (${latestSheet.desc}) -> NOT in DB! Latest Price: $${latestSheet.price} (${latestSheet.type})`);
    } else {
      const dbPrice = dbItem.price;
      const allPricesInExcel = [...new Set(history.map(h => h.price))];
      if (Math.abs(dbPrice - latestSheet.price) > 0.001) {
        discrepancies.push({
          code,
          desc: dbItem.description,
          category: dbItem.category,
          dbPrice,
          sheetPrice: latestSheet.price,
          sheet: latestSheet.sheet,
          type: latestSheet.type,
          allExcelPrices: allPricesInExcel.join(', ')
        });
      }
    }
  }

  console.log('\nTotal Price Discrepancies:', discrepancies.length);
  if (discrepancies.length > 0) {
    console.table(discrepancies);
  } else {
    console.log('✅ Todos los precios en el Excel coinciden exactamente con los de la base de datos.');
  }

  // Also check if there are products in DB with positive stock that might have price 0 or price 0.01
  console.log('\n=== CHECKING ACTIVE PRODUCTS WITH POTENTIALLY UNUSUAL PRICES ===');
  const unusual = products.filter(p => (Number(p.stockPounds) > 0 || Number(p.stockBaskets) > 0) && (Number(p.price) <= 0.05));
  unusual.forEach(p => {
    console.log(`Product ${p.sku} (${p.description}) in category ${p.category} has price $${p.price} | Stock: ${p.stockPounds} lbs / ${p.stockBaskets} cst`);
  });

  process.exit(0);
}

checkPriceDiscrepancies().catch(e => {
  console.error(e);
  process.exit(1);
});
