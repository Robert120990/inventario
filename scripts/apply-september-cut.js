import 'dotenv/config';
import pool from '../api/db.js';
import { randomUUID } from 'node:crypto';

const cutData = [
  { sku: '33000314', material: 'TORTITAS FRANKS 1380 g', units: 1359, pounds: 4077, baskets: 151, price: 14.40, insuredValue: 2174.40, premium: 2.17 },
  { sku: '33001045', material: 'TORTITAS DE CARNE T 500 g 20 U', units: 1920, pounds: 2084, baskets: 120, price: 22.88, insuredValue: 2745.60, premium: 2.75 },
  { sku: '33002430', material: 'MEDALLONES F 200 G 10 U', units: 74100, pounds: 32357, baskets: 1853, price: 28.00, insuredValue: 51884.00, premium: 51.88 },
  { sku: '33002431', material: 'TORTITAS F 220 G 4 U', units: 50160, pounds: 24079, baskets: 1672, price: 21.90, insuredValue: 36616.80, premium: 36.62 },
  { sku: '33002432', material: 'MILANESA F 400 G 4 U', units: 6080, pounds: 5288, baskets: 304, price: 23.00, insuredValue: 6992.00, premium: 6.99 },
  { sku: '33002511', material: 'TORTITAS DE CARNE T 645 G 12U', units: 14820, pounds: 20749, baskets: 1235, price: 21.36, insuredValue: 26379.60, premium: 26.38 },
  { sku: '33000062', material: 'CHICHARRON PRIMIUM 2300 g', units: 2160, pounds: 10800, baskets: 432, price: 86.00, insuredValue: 37152.00, premium: 37.15 },
  { sku: '33000313', material: 'MEDALLONES FRANKS 1380 g', units: 1272, pounds: 3816, baskets: 159, price: 12.40, insuredValue: 1971.60, premium: 1.97 },
  { sku: '33000310', material: 'MILANESAS F 1500 g 15 U', units: 2712, pounds: 8841, baskets: 339, price: 14.96, insuredValue: 5071.44, premium: 5.07 },
  { sku: '33003240', material: 'ALAS PICANT 460 g (ACP) PI', units: 48576, pounds: 49061, baskets: 2208, price: 33.88, insuredValue: 74807.04, premium: 74.81 },
  { sku: '33000677', material: 'MEDALLONES PI 400 G 20 U', units: 25433, pounds: 22896, baskets: 1413, price: 36.54, insuredValue: 51631.02, premium: 51.63 },
  { sku: '33000675', material: 'MEDALLONES PI 200 G 10 U', units: 24704, pounds: 10799, baskets: 772, price: 33.28, insuredValue: 25692.16, premium: 25.69 },
  { sku: '33000553', material: 'PASTA CHICHARRON MOL P/PUPUSAS T 460 G', units: 61980, pounds: 61980, baskets: 2066, price: 66.00, insuredValue: 136356.00, premium: 136.36 },
  { sku: '33000699', material: 'NUGGETS PI 360 G 30 U', units: 3420, pounds: 2884, baskets: 190, price: 35.10, insuredValue: 6669.00, premium: 6.67 },
  { sku: '33003241', material: 'ALAS PICANTES 1380 g (ACP) PI', units: 3495, pounds: 10485, baskets: 699, price: 17.90, insuredValue: 12512.10, premium: 12.51 },
  { sku: '33000036', material: 'PECHUGUITAS EMPANIZADAS 230 g', units: 42270, pounds: 21135, baskets: 1409, price: 27.90, insuredValue: 39311.10, premium: 39.31 },
  { sku: '33000806', material: 'TORTITAS DE CARNE T 1518 G 15 U BOLSA', units: 2464, pounds: 8209, baskets: 308, price: 22.00, insuredValue: 6776.00, premium: 6.78 },
  { sku: '33003664', material: 'MEDALLONES PI 1380 G', units: 252, pounds: 769, baskets: 42, price: 32.94, insuredValue: 1383.48, premium: 1.38 },
  { sku: '33003802', material: 'POLLO AL ESTILO MEXICANO PI 440 g', units: 7728, pounds: 7411, baskets: 552, price: 35.98, insuredValue: 19860.96, premium: 19.86 },
  { sku: '33003760', material: 'POLLO AGRIDULCE A LA NARANJA PI 440 G ZIP', units: 8694, pounds: 8366, baskets: 483, price: 41.58, insuredValue: 20083.14, premium: 20.08 },
  { sku: '33003789', material: 'POLLO AL ESTILO ESTADOUNIDENSE PI 440 g', units: 8848, pounds: 8555, baskets: 632, price: 35.98, insuredValue: 22739.36, premium: 22.74 },
  { sku: '33003770', material: 'POLLO AL ESTILO PICANTE ORIENTAL PI 440G ZIP', units: 5706, pounds: 5530, baskets: 317, price: 41.58, insuredValue: 13180.86, premium: 13.18 },
  { sku: '33003771', material: 'POLLO AL ESTILO TERIYAKI PI 440 G ZIP', units: 5724, pounds: 5545, baskets: 318, price: 44.28, insuredValue: 14081.04, premium: 14.08 },
  { sku: '33003750', material: 'DEDITOS CAMPERO 360 G', units: 6318, pounds: 4964, baskets: 351, price: 62.28, insuredValue: 21860.28, premium: 21.86 },
  { sku: '33003615', material: 'POLLO EMPANIZADO PICANTE 3lb', units: 1110, pounds: 3372, baskets: 222, price: 26.60, insuredValue: 5905.20, premium: 5.91 },
  { sku: '33003749', material: 'DEDITOS CAMPERO 180 G', units: 5568, pounds: 2209, baskets: 174, price: 55.68, insuredValue: 9688.32, premium: 9.69 }
];

async function applyCut() {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    console.log('--- INICIANDO TRANSACCIÓN DE ACTUALIZACIÓN ---');

    // 1. Obtener los productos actuales en la BD
    const [allDbProducts] = await connection.query('SELECT id, sku, description, category, price, stockUnits, stockPounds, stockBaskets FROM products');
    const dbMap = new Map(allDbProducts.map(p => [p.sku, p]));

    const cutSkus = cutData.map(c => c.sku);
    console.log(`Total productos en BD: ${allDbProducts.length}`);
    console.log(`Productos en el corte: ${cutSkus.length}`);

    // 2. Actualizar existencias y precios de los 26 productos del corte
    const insuranceRows = [];
    let sumPounds = 0;
    let sumBaskets = 0;
    let sumInsuredValue = 0;
    let sumPremium = 0;

    for (const item of cutData) {
      const dbProd = dbMap.get(item.sku);
      if (!dbProd) {
        throw new Error(`Producto con SKU ${item.sku} no existe en la base de datos.`);
      }

      await connection.query(
        'UPDATE products SET price = ?, stockUnits = ?, stockPounds = ?, stockBaskets = ? WHERE sku = ?',
        [item.price, item.units, item.pounds, item.baskets, item.sku]
      );

      sumPounds += item.pounds;
      sumBaskets += item.baskets;
      sumInsuredValue += item.insuredValue;
      sumPremium += item.premium;

      insuranceRows.push({
        id: dbProd.id,
        code: item.sku,
        material: dbProd.description || item.material,
        units: item.units,
        pounds: item.pounds,
        baskets: item.baskets,
        valuationMetric: 'baskets',
        poundRate: null,
        basketRate: item.price,
        insuredValue: Number(item.insuredValue.toFixed(2)),
        premium: Number(item.premium.toFixed(2))
      });
    }

    console.log(`✓ 26 productos actualizados con precios y existencias del corte.`);

    // 3. Poner a 0 las existencias de todos los productos que NO están en el corte
    const [zeroResult] = await connection.query(
      'UPDATE products SET stockUnits = 0, stockPounds = 0, stockBaskets = 0 WHERE sku NOT IN (?)',
      [cutSkus]
    );
    console.log(`✓ ${zeroResult.affectedRows} productos que no están en el corte colocados en 0 existencias.`);

    // 4. Crear el registro en insurance_cuts
    const cutId = randomUUID();
    const cutTitle = 'Cierre de Seguro Septiembre 2026 - Almacenadora LIL';
    const customerName = 'AVICOLA SALVADOREÑA S.A. DE C.V.';
    const warehouseName = 'ALMACENADORA LIL';
    const startDate = '2026-09-01';
    const cutoffDate = '2026-09-27';
    const premiumRate = 0.10;
    const isLocked = 1;
    const author = 'Ing. Raúl Sosa';

    const totalsPayload = {
      totalPounds: sumPounds,
      totalBaskets: sumBaskets,
      totalInsuredValue: Number(sumInsuredValue.toFixed(2)),
      totalPremium: Number(sumPremium.toFixed(2))
    };

    // Verificar si ya existía un corte con la misma fecha para no duplicar
    const [existingCuts] = await connection.query('SELECT id FROM insurance_cuts WHERE cutoffDate = ?', [cutoffDate]);
    if (existingCuts.length > 0) {
      console.log(`Actualizando corte de seguro existente para fecha ${cutoffDate}...`);
      await connection.query(
        `UPDATE insurance_cuts SET 
          title = ?, customerName = ?, warehouseName = ?, startDate = ?, premiumRate = ?, 
          isLocked = ?, rowsData = ?, totalsData = ?, updated_at = NOW() 
        WHERE cutoffDate = ?`,
        [cutTitle, customerName, warehouseName, startDate, premiumRate, isLocked, JSON.stringify(insuranceRows), JSON.stringify(totalsPayload), cutoffDate]
      );
    } else {
      console.log(`Insertando nuevo corte de seguro para fecha ${cutoffDate}...`);
      await connection.query(
        `INSERT INTO insurance_cuts 
          (id, title, customerName, warehouseName, startDate, cutoffDate, premiumRate, isLocked, rowsData, totalsData, created_by)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [cutId, cutTitle, customerName, warehouseName, startDate, cutoffDate, premiumRate, isLocked, JSON.stringify(insuranceRows), JSON.stringify(totalsPayload), author]
      );
    }

    // 5. Registrar en bitácora system_logs
    const logId = randomUUID();
    await connection.query(
      `INSERT INTO system_logs (id, userId, username, action, module, details)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        logId,
        1,
        author,
        'APPLY_INSURANCE_CUT',
        'insurance',
        `Actualización de existencias y precios según corte al 27/09/2026. 26 productos actualizados, ${zeroResult.affectedRows} colocados a 0. Total Asegurado: $${totalsPayload.totalInsuredValue.toLocaleString('en-US', { minimumFractionDigits: 2 })}, Prima: $${totalsPayload.totalPremium.toFixed(2)}.`
      ]
    );
    console.log(`✓ Registro de auditoría insertado en system_logs.`);

    await connection.commit();
    console.log('--- ACTUALIZACIÓN COMPLETADA CON ÉXITO ---');
    console.log('Totales verificados:');
    console.log(`- Total Libras: ${totalsPayload.totalPounds.toLocaleString()}`);
    console.log(`- Total Cestas: ${totalsPayload.totalBaskets.toLocaleString()}`);
    console.log(`- Total Valor Asegurado: $${totalsPayload.totalInsuredValue.toLocaleString('en-US', { minimumFractionDigits: 2 })}`);
    console.log(`- Monto Facturación Seguro (0.10%): $${totalsPayload.totalPremium.toFixed(2)}`);

  } catch (error) {
    await connection.rollback();
    console.error('Error durante la transacción, cambios revertidos:', error);
    process.exit(1);
  } finally {
    connection.release();
    process.exit(0);
  }
}

applyCut();
